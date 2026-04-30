import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_CLIENT, LlmService } from './llm.service';

@Module({
  providers: [
    {
      provide: ANTHROPIC_CLIENT,
      useFactory: (config: ConfigService) =>
        new Anthropic({
          apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY'),
        }),
      inject: [ConfigService],
    },
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
