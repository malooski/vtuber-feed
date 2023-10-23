import dotenv from "dotenv";
dotenv.config();

import { DidResolver } from "@atproto/identity";
import { Type } from "@sinclair/typebox";
import * as env from "./util/env";
import { Value } from "@sinclair/typebox/value";

const CONFIG_SCHEMA = Type.Object({
    port: Type.Number(),
    listenhost: Type.String(),
    sqliteLocation: Type.String(),
    subscriptionEndpoint: Type.String(),
    publisherDid: Type.String(),
    subscriptionReconnectDelay: Type.Number(),
    hostname: Type.String(),
    serviceDid: Type.String(),

    bskyUsername: Type.String(),
    bskyPassword: Type.String(),
});

const hostname = env.maybeStr("FEEDGEN_HOSTNAME") ?? "example.com";
const serviceDid = env.maybeStr("FEEDGEN_SERVICE_DID") ?? `did:web:${hostname}`;
export const CONFIG = Value.Encode(CONFIG_SCHEMA, {
    port: env.maybeInt("FEEDGEN_PORT") ?? 3000,
    listenhost: env.maybeStr("FEEDGEN_LISTENHOST") ?? "localhost",
    sqliteLocation: env.maybeStr("FEEDGEN_SQLITE_LOCATION") ?? ":memory:",
    subscriptionEndpoint: env.maybeStr("FEEDGEN_SUBSCRIPTION_ENDPOINT") ?? "wss://bsky.social",
    publisherDid: env.maybeStr("FEEDGEN_PUBLISHER_DID") ?? "did:example:alice",
    subscriptionReconnectDelay: env.maybeInt("FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY") ?? 3000,
    hostname,
    serviceDid,

    bskyUsername: env.maybeStr("BSKY_USERNAME"),
    bskyPassword: env.maybeStr("BSKY_PASSWORD"),
});
