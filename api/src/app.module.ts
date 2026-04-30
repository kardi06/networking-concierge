import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { envValidationSchema } from './config/env.validation';
import { loggerModule } from './common/logger/logger.config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { EventsModule } from './events/events.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { AttendeesModule } from './attendees/attendees.module';
import { LlmModule } from './llm/llm.module';
import { ConciergeModule } from './concierge/concierge.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Try repo root first (local dev), fall back to api/ (docker-compose where
      // env vars typically come from `environment:` directly, not from a file).
      envFilePath: ['../.env', '.env'],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    loggerModule,
    PrismaModule,
    EmbeddingModule,
    LlmModule,
    HealthModule,
    EventsModule,
    AttendeesModule,
    ConciergeModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
