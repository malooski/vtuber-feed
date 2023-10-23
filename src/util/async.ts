import { LOGGER } from "../logger";
import { Awaitable } from "./types";

export function setAsyncInterval(func: () => Awaitable<void>, intervalMs: number) {
    let timeout: NodeJS.Timeout;

    const run = async () => {
        try {
            await func();
        } catch (err) {
            console.error("async interval errored", err);
        }
        timeout = setTimeout(run, intervalMs);
    };

    run();

    return () => clearTimeout(timeout);
}

export async function asyncIife(fn: () => Awaitable<void>) {
    try {
        await fn();
    } catch (err) {
        LOGGER.error("async iife errored", err);
    }
}

export function mapAsync<T, U>(arr: T[], func: (val: T) => Awaitable<U>): Promise<U[]> {
    return Promise.all(arr.map(func));
}

export function flatMapAsync<T, U>(arr: T[], func: (val: T) => Awaitable<U[]>): Promise<U[]> {
    return Promise.all(arr.map(func)).then(arrs => arrs.flat());
}
