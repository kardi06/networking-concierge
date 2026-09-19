import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import OpenAI from 'openai';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from './embedding.constants';

export const OPENAI_CLIENT = Symbol('OPENAI_CLIENT');

const TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;

@Injectable()
export class EmbeddingService {
  constructor(
    @Inject(OPENAI_CLIENT) private readonly client: OpenAI,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EmbeddingService.name);
  }

  /**
   * Generate an embedding vector for the given text.
   * Retries up to 3 times with exponential backoff on transient errors.
   */
  async embed(text: string): Promise<number[]> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const start = Date.now();
      try {
        const response = await this.client.embeddings.create(
          {
            model: EMBEDDING_MODEL,
            input: text,
            dimensions: EMBEDDING_DIMENSIONS,
          },
          { timeout: TIMEOUT_MS },
        );
        const latencyMs = Date.now() - start;
        this.logger.info(
          {
            provider: 'openai',
            model: EMBEDDING_MODEL,
            latency_ms: latencyMs,
            tokens: response.usage.total_tokens,
            attempt,
          },
          'embedding generated',
        );
        return response.data[0].embedding;
      } catch (err) {
        lastError = err;
        const latencyMs = Date.now() - start;
        this.logger.warn(
          {
            provider: 'openai',
            model: EMBEDDING_MODEL,
            latency_ms: latencyMs,
            attempt,
            error: err instanceof Error ? err.message : String(err),
          },
          'embedding attempt failed',
        );
        if (attempt < MAX_ATTEMPTS) {
          await sleep(100 * 2 ** attempt); // 200ms, 400ms
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('embedding failed after retries');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
