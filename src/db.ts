import { once } from "lodash";
import { PrismaClient } from "./generated/prisma_client";

export const getDbClient = once(async () => {
    const db = new PrismaClient();
    await db.$connect();
    return db;
});
