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
