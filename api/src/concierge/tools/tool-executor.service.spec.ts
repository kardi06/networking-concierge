jest.mock('axios', () => ({
  __esModule: true,
  default: { create: jest.fn() },
}));

import axios from 'axios';
import { ToolExecutorService, ToolContext } from './tool-executor.service';
import type { AttendeeSearchService } from '../../attendees/attendee-search.service';
import type { LlmService } from '../../llm/llm.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';

const mockedAxios = axios as unknown as { create: jest.Mock };

describe('ToolExecutorService', () => {
  let service: ToolExecutorService;
  let searchService: { search: jest.Mock };
  let llm: { createMessage: jest.Mock };
  let prisma: { attendee: { findUnique: jest.Mock } };
  let logger: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    setContext: jest.Mock;
  };
  let config: { getOrThrow: jest.Mock };
  let httpClient: { post: jest.Mock };

  const ctx: ToolContext = {
    eventId: 'event-1',
    requesterAttendeeId: 'requester-1',
  };

  beforeEach(() => {
    httpClient = { post: jest.fn() };
    mockedAxios.create.mockReturnValue(httpClient);

    searchService = { search: jest.fn() };
    llm = { createMessage: jest.fn() };
    prisma = { attendee: { findUnique: jest.fn() } };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    };
    config = {
      getOrThrow: jest.fn().mockReturnValue('http://localhost:8000'),
    };

    service = new ToolExecutorService(
      searchService as unknown as AttendeeSearchService,
      llm as unknown as LlmService,
      prisma as unknown as PrismaService,
      logger as unknown as PinoLogger,
      config as unknown as ConfigService,
    );
  });

  describe('search_attendees', () => {
    it('delegates to AttendeeSearchService with eventId from context', async () => {
      searchService.search.mockResolvedValue({
        candidates: [{ attendee_id: 'a' }],
      });

      const out = await service.dispatch(
        'search_attendees',
        { query: 'AI cofounder', limit: 5 },
        ctx,
      );

      expect(searchService.search).toHaveBeenCalledWith({
        eventId: 'event-1',
        query: 'AI cofounder',
        skills: undefined,
        role: undefined,
        limit: 5,
      });
      expect(out).toEqual({ result: { candidates: [{ attendee_id: 'a' }] } });
    });
  });

  describe('score_match', () => {
    it('returns axios response data on success', async () => {
      prisma.attendee.findUnique
        .mockResolvedValueOnce({
          id: 'requester-1',
          name: 'R',
          headline: 'h',
          bio: 'b',
          company: 'c',
          role: 'engineer',
          skills: ['ai'],
          lookingFor: 'lf',
        })
        .mockResolvedValueOnce({
          id: 'cand-1',
          name: 'C',
          headline: 'h',
          bio: 'b',
          company: 'c',
          role: 'founder',
          skills: ['ai'],
          lookingFor: 'lf',
        });
      httpClient.post.mockResolvedValue({
        data: { score: 87, rationale: 'fits', shared_ground: ['ai'] },
      });

      const out = await service.dispatch(
        'score_match',
        { candidate_attendee_id: 'cand-1', intent: 'find AI cofounder' },
        ctx,
      );

      expect(out).toEqual({
        result: { score: 87, rationale: 'fits', shared_ground: ['ai'] },
      });
      expect(httpClient.post).toHaveBeenCalledWith(
        '/score',
        expect.objectContaining({ intent: 'find AI cofounder' }),
      );
    });

    it('returns { error } when score-service is unreachable (no throw)', async () => {
      prisma.attendee.findUnique
        .mockResolvedValueOnce({
          id: 'requester-1',
          name: 'R',
          headline: 'h',
          bio: 'b',
          company: 'c',
          role: 'engineer',
          skills: [],
          lookingFor: '',
        })
        .mockResolvedValueOnce({
          id: 'cand-1',
          name: 'C',
          headline: 'h',
          bio: 'b',
          company: 'c',
          role: 'founder',
          skills: [],
          lookingFor: '',
        });
      httpClient.post.mockRejectedValue(new Error('ECONNREFUSED'));

      const out = await service.dispatch(
        'score_match',
        { candidate_attendee_id: 'cand-1', intent: 'x' },
        ctx,
      );

      expect(out.error).toContain('ECONNREFUSED');
      expect(out.result).toBeUndefined();
    });
  });

  describe('draft_intro_message', () => {
    it('returns { message } on happy path', async () => {
      prisma.attendee.findUnique
        .mockResolvedValueOnce({
          id: 'requester-1',
          name: 'R',
          headline: 'h',
          bio: 'b',
          company: 'c',
          role: 'engineer',
          skills: [],
          lookingFor: '',
        })
        .mockResolvedValueOnce({
          id: 'recip-1',
          name: 'Recip',
          headline: 'h',
          bio: 'b',
          company: 'c',
          role: 'founder',
          skills: [],
          lookingFor: '',
        });
      llm.createMessage.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            name: 'submit_message',
            input: { message: 'Hi Recip — saw your work on…' },
          },
        ],
      });

      const out = await service.dispatch(
        'draft_intro_message',
        { to_attendee_id: 'recip-1', context: 'shared B2B SaaS' },
        ctx,
      );

      expect(out).toEqual({
        result: { message: 'Hi Recip — saw your work on…' },
      });
    });
  });

  describe('unknown tool', () => {
    it('returns an error for unrecognised tool names', async () => {
      const out = await service.dispatch('unknown_tool', {}, ctx);
      expect(out.error).toContain('unknown tool');
    });
  });
});
