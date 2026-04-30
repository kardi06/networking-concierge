import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '@prisma/client';

import { LlmService } from '../llm/llm.service';
import {
  ToolExecutorService,
  ToolExecutionResult,
} from './tools/tool-executor.service';
import {
  ConversationsRepository,
  MessageWithToolCalls,
} from './conversations.repository';
import { CONCIERGE_SYSTEM_PROMPT } from './prompts/system-prompt';
import { ALL_TOOLS } from './tools/tool-schemas';
import { sanitizeContent } from './security/sanitizer';

const MAX_ITERATIONS = 6;
// 6 iterations × ~5–8s LLM round-trip + tool dispatch overhead can exceed 30s.
// 90s is a pragmatic ceiling for the take-home demo; production should move
// the agent loop into a background queue (BullMQ) and stream results.
const HANDLER_TIMEOUT_MS = 90_000;

export interface ConciergeMatch {
  attendee_id: string;
  name: string;
  score: number;
  rationale: string;
  shared_ground: string[];
  draft_intro?: string;
}

export interface ConciergeResponse {
  message_id: string;
  reply: string;
  matches: ConciergeMatch[];
}

interface TurnToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: ToolExecutionResult;
}

@Injectable()
export class ConciergeService {
  constructor(
    private readonly llm: LlmService,
    private readonly toolExecutor: ToolExecutorService,
    private readonly repo: ConversationsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConciergeService.name);
  }

  async handleMessage(
    eventId: string,
    attendeeId: string,
    userText: string,
  ): Promise<ConciergeResponse> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.processTurn(eventId, attendeeId, userText),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `concierge handler timed out after ${HANDLER_TIMEOUT_MS}ms`,
                ),
              ),
            HANDLER_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async processTurn(
    eventId: string,
    attendeeId: string,
    rawUserText: string,
  ): Promise<ConciergeResponse> {
    const userText = sanitizeContent(rawUserText);

    const conversation = await this.repo.findOrCreate(eventId, attendeeId);

    await this.repo.appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: userText,
    });

    const history = await this.repo.loadHistory(conversation.id);
    const messages = this.reconstructMessages(history);

    const turnToolCalls: TurnToolCall[] = [];
    let lastReply = '';
    let lastAssistantMessageId = '';

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await this.llm.createMessage({
        system: CONCIERGE_SYSTEM_PROMPT,
        messages,
        tools: ALL_TOOLS,
        iterationIndex: i,
      });

      const assistantMsg = await this.repo.appendMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: response.content as unknown as Prisma.InputJsonValue,
        metadata: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          stop_reason: response.stop_reason,
          iteration_index: i,
          model: response.model,
        },
      });
      lastAssistantMessageId = assistantMsg.id;

      messages.push({
        role: 'assistant',
        content: response.content,
      });

      const textPieces: string[] = [];
      for (const block of response.content) {
        if (block.type === 'text') textPieces.push(block.text);
      }
      if (textPieces.length > 0) lastReply = textPieces.join(' ').trim();

      if (response.stop_reason !== 'tool_use') break;

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );
      const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const start = Date.now();
        const result = await this.toolExecutor.dispatch(
          block.name,
          block.input as Record<string, unknown>,
          { eventId, requesterAttendeeId: attendeeId },
        );
        const latencyMs = Date.now() - start;

        await this.repo.appendToolCall({
          messageId: assistantMsg.id,
          toolName: block.name,
          input: block.input as Prisma.InputJsonValue,
          output: result.result ?? null,
          errorText: result.error,
          latencyMs,
        });

        turnToolCalls.push({
          tool: block.name,
          input: block.input as Record<string, unknown>,
          output: result,
        });

        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.error
            ? `Error: ${result.error}`
            : JSON.stringify(result.result),
          is_error: result.error !== undefined,
        });
      }

      await this.repo.appendMessage({
        conversationId: conversation.id,
        role: 'tool',
        content: toolResultBlocks as unknown as Prisma.InputJsonValue,
      });

      messages.push({ role: 'user', content: toolResultBlocks });
    }

    const matches = this.extractMatches(turnToolCalls);

    this.logger.info(
      {
        event_id: eventId,
        attendee_id: attendeeId,
        conversation_id: conversation.id,
        message_id: lastAssistantMessageId,
        matches_count: matches.length,
        tool_calls_count: turnToolCalls.length,
      },
      'concierge turn complete',
    );

    return {
      message_id: lastAssistantMessageId,
      reply: lastReply,
      matches,
    };
  }

  private reconstructMessages(
    history: MessageWithToolCalls[],
  ): Anthropic.Messages.MessageParam[] {
    const out: Anthropic.Messages.MessageParam[] = [];
    for (const m of history) {
      // For user/tool messages we pass content through unchanged.
      // For assistant we keep the original content blocks (text + tool_use).
      // tool messages were stored as an array of tool_result blocks; the
      // Anthropic API expects those to ride on a `user` role message.
      if (m.role === 'user') {
        out.push({
          role: 'user',
          content:
            typeof m.content === 'string'
              ? m.content
              : (m.content as unknown as Anthropic.Messages.ContentBlockParam[]),
        });
      } else if (m.role === 'assistant') {
        out.push({
          role: 'assistant',
          content:
            m.content as unknown as Anthropic.Messages.ContentBlockParam[],
        });
      } else if (m.role === 'tool') {
        out.push({
          role: 'user',
          content:
            m.content as unknown as Anthropic.Messages.ToolResultBlockParam[],
        });
      }
    }
    return out;
  }

  private extractMatches(turnToolCalls: TurnToolCall[]): ConciergeMatch[] {
    const byId = new Map<string, Partial<ConciergeMatch>>();

    for (const call of turnToolCalls) {
      if (call.tool === 'search_attendees' && call.output.result) {
        const r = call.output.result as {
          candidates?: Array<{ attendee_id: string; name: string }>;
        };
        for (const c of r.candidates ?? []) {
          if (!byId.has(c.attendee_id)) {
            byId.set(c.attendee_id, {
              attendee_id: c.attendee_id,
              name: c.name,
            });
          }
        }
      }
    }

    for (const call of turnToolCalls) {
      if (call.tool === 'score_match' && call.output.result) {
        const id = call.input.candidate_attendee_id;
        if (typeof id !== 'string') continue;
        const r = call.output.result as {
          score?: number;
          rationale?: string;
          shared_ground?: string[];
        };
        const existing = byId.get(id) ?? { attendee_id: id };
        byId.set(id, {
          ...existing,
          score: r.score,
          rationale: r.rationale,
          shared_ground: r.shared_ground,
        });
      }
    }

    for (const call of turnToolCalls) {
      if (call.tool === 'draft_intro_message' && call.output.result) {
        const id = call.input.to_attendee_id;
        if (typeof id !== 'string') continue;
        const r = call.output.result as { message?: string };
        const existing = byId.get(id) ?? { attendee_id: id };
        byId.set(id, { ...existing, draft_intro: r.message });
      }
    }

    const matches: ConciergeMatch[] = [];
    for (const m of byId.values()) {
      if (
        m.attendee_id !== undefined &&
        m.score !== undefined &&
        m.rationale !== undefined
      ) {
        matches.push({
          attendee_id: m.attendee_id,
          name: m.name ?? '(unknown)',
          score: m.score,
          rationale: m.rationale,
          shared_ground: m.shared_ground ?? [],
          draft_intro: m.draft_intro,
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches;
  }
}
