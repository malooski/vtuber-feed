import pino from "pino";

export const LOGGER = pino({
    transport: {
        target: "pino-pretty",
        options: {
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
        },
    },
    level: "debug",
});
