import { AttendeeSearchService } from './attendee-search.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EmbeddingService } from '../embedding/embedding.service';

describe('AttendeeSearchService', () => {
  let service: AttendeeSearchService;
  let prisma: { $queryRaw: jest.Mock };
  let embedding: { embed: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    embedding = { embed: jest.fn() };
    service = new AttendeeSearchService(
      prisma as unknown as PrismaService,
      embedding as unknown as EmbeddingService,
    );
  });

  it('embeds the natural-language query before querying', async () => {
    embedding.embed.mockResolvedValue([0.1, 0.2]);
    prisma.$queryRaw.mockResolvedValue([]);

    await service.search({
      eventId: 'event-1',
      query: 'find me an AI co-founder',
    });

    expect(embedding.embed).toHaveBeenCalledWith('find me an AI co-founder');
  });

  it('maps SQL rows to snake_case candidates with similarity = 1 - distance', async () => {
    embedding.embed.mockResolvedValue([0.1, 0.2]);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'a-1',
        name: 'Alice',
        headline: 'Founder of AI startup',
        bio: 'Building AI-powered tools.',
        skills: ['ai', 'b2b-saas'],
        looking_for: 'co-founder',
        distance: 0.1,
      },
      {
        id: 'a-2',
        name: 'Bob',
        headline: 'Investor',
        bio: 'Series A.',
        skills: ['vc'],
        looking_for: 'climate founders',
        distance: 0.4,
      },
    ]);

    const result = await service.search({
      eventId: 'event-1',
      query: 'co-founder',
      limit: 5,
    });

    expect(result.candidates).toHaveLength(2);
    const first = result.candidates[0];
    expect(first.attendee_id).toBe('a-1');
    expect(first.name).toBe('Alice');
    expect(first.headline).toBe('Founder of AI startup');
    expect(first.bio).toBe('Building AI-powered tools.');
    expect(first.skills).toEqual(['ai', 'b2b-saas']);
    expect(first.looking_for).toBe('co-founder');
    expect(first.similarity_score).toBeCloseTo(0.9, 5);
    expect(result.candidates[1].similarity_score).toBeCloseTo(0.6, 5);
  });

  it('truncates bio to 500 chars', async () => {
    embedding.embed.mockResolvedValue([0.1]);
    const longBio = 'x'.repeat(800);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'a-1',
        name: 'A',
        headline: 'h',
        bio: longBio,
        skills: [],
        looking_for: '',
        distance: 0.2,
      },
    ]);

    const result = await service.search({ eventId: 'event-1', query: 'x' });

    expect(result.candidates[0].bio).toHaveLength(500);
  });

  it('coerces string distance from pg to a number', async () => {
    embedding.embed.mockResolvedValue([0.1]);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'a-1',
        name: 'A',
        headline: 'h',
        bio: 'b',
        skills: [],
        looking_for: '',
        distance: '0.25', // simulate pg string-numeric
      },
    ]);

    const result = await service.search({ eventId: 'event-1', query: 'x' });

    expect(result.candidates[0].similarity_score).toBeCloseTo(0.75, 5);
  });
});
