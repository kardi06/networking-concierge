import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { setupOpenApi } from './common/swagger/setup-swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Replace the default Nest logger with pino.
  app.useLogger(app.get(PinoLogger));

  // In a container this process is PID 1, and Linux delivers SIGTERM/SIGINT to
  // PID 1 only if it has installed a handler — otherwise both are ignored.
  // Without this, Ctrl+C does nothing under `docker compose run`, and every
  // `docker stop` or Railway redeploy waits out its grace period and then
  // SIGKILLs the process mid-request. With it, the HTTP server stops accepting
  // connections and providers run their shutdown hooks (Prisma disconnects).
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = app.get(ConfigService);

  // `/docs` is the UI for this service — there is no frontend, so the API
  // reference is the front door. Mounted before listen so it is live on boot.
  setupOpenApi(app, config.get<string>('PUBLIC_BASE_URL'));

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}
void bootstrap();
