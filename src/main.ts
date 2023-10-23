import { DidResolver, MemoryCache } from "@atproto/identity";
import { BskyAgent } from "@atproto/api";
import { CONFIG } from "./config";
import { isCommit } from "./lexicon/types/com/atproto/sync/subscribeRepos";
import { LOGGER } from "./logger";
import { FirehoseSubscription, getOpsByType } from "./util/subscription";
import { asyncIife, flatMapAsync, mapAsync, setAsyncInterval } from "./util/async";
import { chunk, take } from "lodash";
import { LRUCache } from "lru-cache";
import { getDbClient } from "./db";
import { toMap, upsertMap } from "./util/map";
import { Nil } from "./util/types";
import { Post, PrismaClient, User } from "./generated/prisma_client";
import { popMany } from "./util/array";

const GET_PROFILE_MAX_ACTORS = 25;

type NewUser = Omit<User, "id">;
type NewPost = Omit<Post, "id">;

interface FirehoseCreatedPost {
    did: string;
    cid: string;
    createdAt: string;
    text: string;
}

class MainApp {
    knownVtubers = new LRUCache<string, User>({
        max: 100000,
    });

    knownNormies = new LRUCache<string, User>({
        max: 100000,
    });

    agent = new BskyAgent({
        service: "https://bsky.social",
    });

    db: PrismaClient;

    postQueue: FirehoseCreatedPost[] = [];

    constructor() {}

    async initialize() {
        this.db = await getDbClient();

        const loggedInResp = await this.agent.login({
            identifier: CONFIG.bskyUsername,
            password: CONFIG.bskyPassword,
        });
    }

    async runOldPostPruning() {
        const db = await getDbClient();
        // Prude database of oldest posts
        return setAsyncInterval(async () => {
            const oldestPosts = await db.post.findMany({
                orderBy: {
                    postedAt: "desc",
                },
                take: 10000,
                select: {
                    cid: true,
                },
            });

            const oldestPostCids = oldestPosts.map(post => post.cid);

            const deleted = await db.post.deleteMany({
                where: {
                    cid: {
                        notIn: oldestPostCids,
                    },
                },
            });

            if (deleted.count > 0) {
                LOGGER.debug(`Pruned ${deleted.count} posts`);
            }
        }, 30000);
    }

    async runFirehose() {
        const firehose = new FirehoseSubscription(CONFIG.subscriptionEndpoint);

        firehose.onEvent.add(async evt => {
            if (!isCommit(evt)) return;
            const ops = await getOpsByType(evt);

            for (const post of ops.posts.creates) {
                if (this.knownNormies.has(post.author)) continue;

                this.postQueue.push({
                    did: post.author,
                    cid: post.cid,
                    createdAt: post.record.createdAt,
                    text: post.record.text,
                });
            }
        });

        await firehose.run(CONFIG.subscriptionReconnectDelay);
    }

    async runProcessQueue() {
        await setAsyncInterval(async () => {
            const posts = popMany(this.postQueue, 1000);
            if (posts.length === 0) return;

            // LOGGER.debug(`Processing ${posts.length} posts`);

            const knownUsers = await this.findKnownUsers(posts.map(post => post.did));

            for (const post of posts) {
                const foundUser = knownUsers.get(post.did);
                if (foundUser == null) {
                    LOGGER.warn(`Failed to find user: ${post.did}`);
                    continue;
                }

                if (foundUser.isVtuber) {
                    await this.updatePosts(
                        [
                            {
                                authorId: foundUser.id,
                                cid: post.cid,
                                content: post.text,
                                postedAt: new Date(post.createdAt),
                            },
                        ],
                        foundUser
                    );

                    continue;
                }

                // Normie otherwise
            }
        }, 1000);
    }

    async run() {
        await this.runOldPostPruning();
        this.runFirehose();
        await this.runProcessQueue();
    }

    async updatePosts(posts: NewPost[], user: User) {
        await mapAsync(posts, async post => {
            LOGGER.debug(`${user.handle} > ${post.content}`);
            await this.db.post.upsert({
                where: {
                    cid: post.cid,
                },
                create: {
                    cid: post.cid,
                    content: post.content,
                    authorId: user.id,
                    postedAt: new Date(post.postedAt),
                },
                update: {
                    cid: post.cid,
                    content: post.content,
                    authorId: user.id,
                    postedAt: new Date(post.postedAt),
                },
            });
        });
    }

    async updateUser(user: NewUser): Promise<User> {
        const created = await this.db.user.upsert({
            where: { did: user.did },
            create: {
                did: user.did,
                handle: user.handle,
                isVtuber: user.isVtuber,
                description: user.description,
                name: user.name,
            },
            update: {
                handle: user.handle,
                isVtuber: user.isVtuber,
                description: user.description,
                name: user.name,
            },
        });

        this.addUserToCache([created]);

        return created;
    }

    addUserToCache(users: User[]) {
        for (const user of users) {
            if (user.isVtuber) {
                this.knownVtubers.set(user.did, user);
            } else {
                this.knownNormies.set(user.did, user);
            }
        }
    }

    // Map<did, User>
    async findKnownUsers(dids: string[]): Promise<Map<string, User>> {
        let remainingDids = new Set([...dids]);

        const foundUsers = new Map<string, User>();

        for (const did of remainingDids) {
            const foundUser = this.knownNormies.get(did) ?? this.knownVtubers.get(did);
            if (foundUser == null) continue;

            foundUsers.set(did, foundUser);
            remainingDids.delete(did);
        }

        const fetchedDbUsers = await this.db.user.findMany({
            where: {
                OR: [...remainingDids].map(did => ({ did })),
            },
        });

        for (const user of fetchedDbUsers) {
            remainingDids.delete(user.did);
            foundUsers.set(user.did, user);

            if (user.isVtuber) {
                this.knownVtubers.set(user.did, user);
            } else {
                this.knownNormies.set(user.did, user);
            }
        }

        const fetchedBskyUsers = await this.fetchProfilesFromBsky([...remainingDids]);

        for (const user of fetchedBskyUsers) {
            foundUsers.set(user.did, user);
            remainingDids.delete(user.did);

            if (user.isVtuber) {
                this.knownVtubers.set(user.did, user);
            } else {
                this.knownNormies.set(user.did, user);
            }
        }

        if (remainingDids.size > 0) {
            LOGGER.warn(`Failed to find users: ${[...remainingDids].join(", ")}`);
        }

        return foundUsers;
    }

    async fetchProfilesFromBsky(dids: string[]): Promise<User[]> {
        return flatMapAsync(chunk(dids, GET_PROFILE_MAX_ACTORS), async actors => {
            const fetchedUsers = await this.agent.getProfiles({
                actors: actors,
            });

            // TODO: Filter out users included in a specified mute list.

            return mapAsync(fetchedUsers.data.profiles, async user => {
                const isVtuber = isUserVtuber(user.handle, user.displayName, user.description);
                if (isVtuber) {
                    LOGGER.debug(`Found vtuber: ${user.handle}`);
                }

                const dbUser = await this.updateUser({
                    did: user.did,
                    handle: user.handle,
                    isVtuber,
                    description: user.description ?? null,
                    name: user.displayName ?? null,
                });

                return dbUser;
            });
        });
    }
}

asyncIife(async () => {
    const app = new MainApp();
    await app.initialize();
    await app.run();
});

function isUserVtuber(handle: string | Nil, name: string | Nil, desc: string | Nil) {
    if (handle != null && handle.toLowerCase().includes("_vt")) {
        return true;
    }

    if (name != null && name.toLowerCase().includes("vtuber")) {
        return true;
    }

    if (desc != null && desc.toLowerCase().includes("vtuber")) {
        return true;
    }

    return false;
}
