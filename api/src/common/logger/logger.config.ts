import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';

export const loggerModule = LoggerModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const isDev = config.get<string>('NODE_ENV') === 'development';

    return {
      pinoHttp: {
        level: config.get<string>('LOG_LEVEL') ?? 'info',

        transport: isDev
          ? {
              target: 'pino-pretty',
              options: {
                singleLine: true,
                colorize: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname,req.headers,res.headers',
              },
            }
          : undefined,

        // Request ID: trust X-Request-ID if provided, else generate uuid v4.
        genReqId: (req: IncomingMessage) => {
          const fromHeader = req.headers['x-request-id'];
          if (typeof fromHeader === 'string' && fromHeader.length > 0) {
            return fromHeader;
          }
          if (Array.isArray(fromHeader) && fromHeader[0]) {
            return fromHeader[0];
          }
          return randomUUID();
        },

        // Redact PII at info level. PII fields per ARCHITECTURE §8.2.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.body.bio',
            'req.body.looking_for',
            'req.body.name',
            'req.body.email',
            '*.bio',
            '*.looking_for',
            '*.email',
          ],
          remove: false,
          censor: '[REDACTED]',
        },

        // Attach request id back to the response header for client correlation.
        customSuccessMessage: (req, res) =>
          `${req.method} ${req.url} -> ${res.statusCode}`,
        customErrorMessage: (req, res, err) =>
          `${req.method} ${req.url} -> ${res.statusCode} (${err.message})`,
      },
    };
  },
});
