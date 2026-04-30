import { ConciergeService } from './concierge.service';
import type { LlmService } from '../llm/llm.service';
import type { ToolExecutorService } from './tools/tool-executor.service';
import type { ConversationsRepository } from './conversations.repository';
import type { PinoLogger } from 'nestjs-pino';

describe('ConciergeService', () => {
  let service: ConciergeService;
  let llm: { createMessage: jest.Mock };
  let toolExecutor: { dispatch: jest.Mock };
  let repo: {
    findOrCreate: jest.Mock;
    loadHistory: jest.Mock;
    appendMessage: jest.Mock;
    appendToolCall: jest.Mock;
  };
  let logger: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    setContext: jest.Mock;
  };

  beforeEach(() => {
    llm = { createMessage: jest.fn() };
    toolExecutor = { dispatch: jest.fn() };
    repo = {
      findOrCreate: jest.fn().mockResolvedValue({ id: 'conv-1' }),
      loadHistory: jest.fn().mockResolvedValue([]),
      appendMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      appendToolCall: jest.fn().mockResolvedValue({ id: 'tc-1' }),
    };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    };
    service = new ConciergeService(
      llm as unknown as LlmService,
      toolExecutor as unknown as ToolExecutorService,
      repo as unknown as ConversationsRepository,
      logger as unknown as PinoLogger,
    );
  });

  it('returns immediately when LLM stops with end_turn (no tool use)', async () => {
    llm.createMessage.mockResolvedValue({
      content: [{ type: 'text', text: 'hi there' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 3 },
      model: 'claude',
    });

    const result = await service.handleMessage('event-1', 'att-1', 'hello');

    expect(result.reply).toBe('hi there');
    expect(result.matches).toEqual([]);
    expect(llm.createMessage).toHaveBeenCalledTimes(1);
    expect(toolExecutor.dispatch).not.toHaveBeenCalled();
  });

  it('runs the tool loop: search → score → draft_intro → end_turn → matches', async () => {
    repo.appendMessage.mockImplementation((args: { role: string }) =>
      Promise.resolve({ id: `msg-${args.role}-${Date.now()}` }),
    );

    // Iteration 1: tool_use search_attendees
    llm.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tu-1',
          name: 'search_attendees',
          input: { query: 'AI cofounder' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 4 },
      model: 'claude',
    });

    // Iteration 2: tool_use score_match
    llm.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tu-2',
          name: 'score_match',
          input: {
            candidate_attendee_id: 'cand-1',
            intent: 'find AI cofounder',
          },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 12, output_tokens: 4 },
      model: 'claude',
    });

    // Iteration 3: tool_use draft_intro_message
    llm.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tu-3',
          name: 'draft_intro_message',
          input: { to_attendee_id: 'cand-1', context: 'shared B2B SaaS' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 14, output_tokens: 4 },
      model: 'claude',
    });

    // Iteration 4: text reply, end_turn
    llm.createMessage.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'Here is your top match: Sarah from LedgerAI.' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 16, output_tokens: 8 },
      model: 'claude',
    });

    toolExecutor.dispatch
      .mockResolvedValueOnce({
        result: {
          candidates: [
            { attendee_id: 'cand-1', name: 'Sarah', headline: 'Founder' },
          ],
        },
      })
      .mockResolvedValueOnce({
        result: {
          score: 92,
          rationale: 'NestJS overlap',
          shared_ground: ['NestJS', 'B2B SaaS'],
        },
      })
      .mockResolvedValueOnce({
        result: { message: 'Hi Sarah — saw LedgerAI…' },
      });

    const result = await service.handleMessage(
      'event-1',
      'att-1',
      'find AI cofounder',
    );

    expect(result.reply).toContain('Sarah');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      attendee_id: 'cand-1',
      name: 'Sarah',
      score: 92,
      rationale: 'NestJS overlap',
      shared_ground: ['NestJS', 'B2B SaaS'],
      draft_intro: 'Hi Sarah — saw LedgerAI…',
    });
    expect(toolExecutor.dispatch).toHaveBeenCalledTimes(3);
  });

  it('extractMatches: sorts by score descending and keeps only scored candidates', async () => {
    // 2 candidates from search, only 1 scored.
    llm.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tu-1',
          name: 'search_attendees',
          input: { query: 'x' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 1, output_tokens: 1 },
      model: 'claude',
    });
    llm.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tu-2',
          name: 'score_match',
          input: { candidate_attendee_id: 'b', intent: 'x' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 1, output_tokens: 1 },
      model: 'claude',
    });
    llm.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tu-3',
          name: 'score_match',
          input: { candidate_attendee_id: 'a', intent: 'x' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 1, output_tokens: 1 },
      model: 'claude',
    });
    llm.createMessage.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'done' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
      model: 'claude',
    });

    toolExecutor.dispatch
      .mockResolvedValueOnce({
        result: {
          candidates: [
            { attendee_id: 'a', name: 'Alice' },
            { attendee_id: 'b', name: 'Bob' },
            { attendee_id: 'c', name: 'Cici' }, // never scored
          ],
        },
      })
      .mockResolvedValueOnce({
        result: { score: 80, rationale: 'b-good', shared_ground: ['x'] },
      })
      .mockResolvedValueOnce({
        result: { score: 95, rationale: 'a-great', shared_ground: ['y'] },
      });

    const result = await service.handleMessage('event-1', 'att-1', 'x');

    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].attendee_id).toBe('a'); // higher score first
    expect(result.matches[0].score).toBe(95);
    expect(result.matches[1].attendee_id).toBe('b');
  });

  it('persists tool error in tool_call row when dispatch returns error', async () => {
    llm.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tu-1',
          name: 'score_match',
          input: { candidate_attendee_id: 'x', intent: 'y' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 1, output_tokens: 1 },
      model: 'claude',
    });
    llm.createMessage.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'sorry, no luck' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
      model: 'claude',
    });

    toolExecutor.dispatch.mockResolvedValueOnce({ error: 'ECONNREFUSED' });

    const result = await service.handleMessage('event-1', 'att-1', 'x');

    expect(result.reply).toContain('sorry');
    expect(result.matches).toEqual([]);
    expect(repo.appendToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ errorText: 'ECONNREFUSED' }),
    );
  });
});
