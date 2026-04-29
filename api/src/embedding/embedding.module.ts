import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EmbeddingService, OPENAI_CLIENT } from './embedding.service';

@Module({
  providers: [
    {
      provide: OPENAI_CLIENT,
      useFactory: (config: ConfigService) =>
        new OpenAI({
          apiKey: config.getOrThrow<string>('OPENAI_API_KEY'),
        }),
      inject: [ConfigService],
    },
    EmbeddingService,
  ],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
