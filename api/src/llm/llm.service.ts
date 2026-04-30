import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

const TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;
const DEFAULT_MAX_TOKENS = 1024;

export interface CreateMessageInput {
  system: string;
  messages: Anthropic.Messages.MessageParam[];
  tools?: Anthropic.Messages.Tool[];
  toolChoice?: Anthropic.Messages.MessageCreateParams['tool_choice'];
  model?: string;
  maxTokens?: number;
  /** Position within the agent loop, used for telemetry only. */
  iterationIndex?: number;
}

@Injectable()
export class LlmService {
  private readonly defaultModel: string;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic,
    private readonly logger: PinoLogger,
    config: ConfigService,
  ) {
    this.logger.setContext(LlmService.name);
    this.defaultModel = config.getOrThrow<string>('ANTHROPIC_MODEL');
  }

  /**
   * Wraps Anthropic.messages.create with retry, timeout, and structured
   * telemetry. Returns the raw Message object so callers can introspect
   * tool_use blocks or stop_reason.
   */
  async createMessage(
    input: CreateMessageInput,
  ): Promise<Anthropic.Messages.Message> {
    const model = input.model ?? this.defaultModel;
    const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const start = Date.now();
      try {
        const response = await this.client.messages.create(
          {
            model,
            max_tokens: maxTokens,
            system: input.system,
            messages: input.messages,
            tools: input.tools,
            tool_choice: input.toolChoice,
          },
          { timeout: TIMEOUT_MS },
        );
        const latencyMs = Date.now() - start;
        this.logger.info(
          {
            provider: 'anthropic',
            model,
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
            latency_ms: latencyMs,
            stop_reason: response.stop_reason,
            iteration_index: input.iterationIndex,
            attempt,
          },
          'llm message generated',
        );
        return response;
      } catch (err) {
        lastError = err;
        const latencyMs = Date.now() - start;
        this.logger.warn(
          {
            provider: 'anthropic',
            model,
            latency_ms: latencyMs,
            attempt,
            iteration_index: input.iterationIndex,
            error: err instanceof Error ? err.message : String(err),
          },
          'llm attempt failed',
        );
        if (attempt < MAX_ATTEMPTS) {
          await sleep(500 * 2 ** attempt); // 1s, 2s
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('llm call failed after retries');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
