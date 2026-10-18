import { pino } from 'pino';

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const logger = pino({
    level: nodeEnv === 'test' ? 'silent' : 'info',
    transport:
        nodeEnv === 'development'
            ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
            : undefined,
    redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[가림]',
    },
});