import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import axios, { AxiosInstance } from 'axios';
import { Attendee } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AttendeeSearchService } from '../../attendees/attendee-search.service';
import { LlmService } from '../../llm/llm.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import {
  INTRO_DRAFTER_SYSTEM_PROMPT,
  INTRO_DRAFTER_TOOL,
} from '../prompts/intro-prompt';
import { wrapAsAttendeeData } from '../security/sanitizer';

const SCORE_TIMEOUT_MS = 10_000;
const SCORE_MAX_ATTEMPTS = 2;

export interface ToolContext {
  eventId: string;
  requesterAttendeeId: string;
}

export type ToolExecutionResult =
  | { result: unknown; error?: undefined }
  | { result?: undefined; error: string };

@Injectable()
export class ToolExecutorService {
  private readonly axios: AxiosInstance;

  constructor(
    private readonly searchService: AttendeeSearchService,
    private readonly llm: LlmService,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly metrics: MetricsService,
    config: ConfigService,
  ) {
    this.logger.setContext(ToolExecutorService.name);
    this.axios = axios.create({
      baseURL: config.getOrThrow<string>('SCORE_SERVICE_URL'),
      timeout: SCORE_TIMEOUT_MS,
    });
  }

  /**
   * Dispatch a tool_use call from the agent loop. Errors are returned
   * as { error: string } (not thrown) so the LLM can recover by trying
   * a different candidate or strategy on the next iteration.
   */
  async dispatch(
    name: string,
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolExecutionResult> {
    const start = Date.now();
    let status: 'success' | 'failed' | 'unknown' = 'success';
    try {
      switch (name) {
        case 'search_attendees':
          return { result: await this.searchAttendees(input, ctx) };
        case 'score_match':
          return { result: await this.scoreMatch(input, ctx) };
        case 'draft_intro_message':
          return { result: await this.draftIntroMessage(input, ctx) };
        default:
          status = 'unknown';
          return { error: `unknown tool: ${name}` };
      }
    } catch (err) {
      status = 'failed';
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ tool: name, error: message }, 'tool execution failed');
      return { error: message };
    } finally {
      const latencyMs = Date.now() - start;
      this.logger.info(
        { tool: name, latency_ms: latencyMs, status },
        'tool executed',
      );
      this.metrics.emit({
        name: 'ToolDispatch',
        value: latencyMs,
        unit: 'Milliseconds',
        dimensions: { tool: name, status },
      });
    }
  }

  private async searchAttendees(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ) {
    return this.searchService.search({
      eventId: ctx.eventId,
      query: typeof input.query === 'string' ? input.query : '',
      skills: Array.isArray(input.skills)
        ? (input.skills as string[])
        : undefined,
      role: typeof input.role === 'string' ? input.role : undefined,
      limit: typeof input.limit === 'number' ? input.limit : undefined,
    });
  }

  private async scoreMatch(input: Record<string, unknown>, ctx: ToolContext) {
    const candidateId =
      typeof input.candidate_attendee_id === 'string'
        ? input.candidate_attendee_id
        : null;
    const intent = typeof input.intent === 'string' ? input.intent : '';
    if (!candidateId) throw new Error('candidate_attendee_id is required');

    const [requester, candidate] = await Promise.all([
      this.prisma.attendee.findUnique({
        where: { id: ctx.requesterAttendeeId },
      }),
      this.prisma.attendee.findUnique({ where: { id: candidateId } }),
    ]);
    if (!requester)
      throw new Error(`requester ${ctx.requesterAttendeeId} not found`);
    if (!candidate) throw new Error(`candidate ${candidateId} not found`);

    let lastError: unknown;
    for (let attempt = 1; attempt <= SCORE_MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.axios.post<unknown>('/score', {
          requester: this.toScoreProfile(requester),
          candidate: this.toScoreProfile(candidate),
          intent,
        });
        return response.data;
      } catch (err) {
        lastError = err;
        if (attempt < SCORE_MAX_ATTEMPTS) {
          await sleep(300 * attempt);
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('score-service call failed');
  }

  private async draftIntroMessage(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<{ message: string }> {
    const recipientId =
      typeof input.to_attendee_id === 'string' ? input.to_attendee_id : null;
    const context = typeof input.context === 'string' ? input.context : '';
    if (!recipientId) throw new Error('to_attendee_id is required');

    const [requester, recipient] = await Promise.all([
      this.prisma.attendee.findUnique({
        where: { id: ctx.requesterAttendeeId },
      }),
      this.prisma.attendee.findUnique({ where: { id: recipientId } }),
    ]);
    if (!requester)
      throw new Error(`requester ${ctx.requesterAttendeeId} not found`);
    if (!recipient) throw new Error(`recipient ${recipientId} not found`);

    const userMessage =
      `<requester_data>` +
      wrapAsAttendeeData(this.profileToText(requester)) +
      `</requester_data>\n\n<recipient_data>` +
      wrapAsAttendeeData(this.profileToText(recipient)) +
      `</recipient_data>\n\n<context>${context}</context>`;

    const response = await this.llm.createMessage({
      system: INTRO_DRAFTER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      tools: [INTRO_DRAFTER_TOOL],
      toolChoice: { type: 'tool', name: 'submit_message' },
      maxTokens: 256,
    });

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'submit_message') {
        const out = block.input as { message?: unknown };
        if (typeof out.message === 'string') return { message: out.message };
      }
    }
    throw new Error(
      'draft_intro_message did not return a submit_message tool call',
    );
  }

  private toScoreProfile(a: Attendee) {
    return {
      attendee_id: a.id,
      name: a.name,
      headline: a.headline,
      bio: a.bio,
      company: a.company,
      role: a.role,
      skills: a.skills,
      looking_for: a.lookingFor,
    };
  }

  private profileToText(a: Attendee): string {
    return [
      `Name: ${a.name}`,
      `Role: ${a.role}`,
      `Company: ${a.company}`,
      `Headline: ${a.headline}`,
      `Bio: ${a.bio}`,
      `Looking for: ${a.lookingFor}`,
      `Skills: ${a.skills.join(', ')}`,
    ].join('\n');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
