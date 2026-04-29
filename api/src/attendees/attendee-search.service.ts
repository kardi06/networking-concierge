import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const BIO_TRUNCATE = 500;

export interface SearchAttendeesInput {
  eventId: string;
  query: string;
  skills?: string[];
  role?: string;
  limit?: number;
}

// snake_case to match the tool contract (PRD §5.1 search_attendees output).
export interface AttendeeCandidate {
  attendee_id: string;
  name: string;
  headline: string;
  bio: string;
  skills: string[];
  looking_for: string;
  similarity_score: number;
}

interface RawRow {
  id: string;
  name: string;
  headline: string;
  bio: string;
  skills: string[];
  looking_for: string;
  distance: number | string; // pg returns numeric as string in some configs
}

@Injectable()
export class AttendeeSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  /**
   * Hybrid semantic + keyword search backing the `search_attendees` LLM tool.
   * - Semantic: cosine similarity via pgvector `<=>` operator.
   * - Keyword: optional role / skills filters in WHERE.
   * - Always scoped to a single event.
   * All values are bound via Prisma parameterised templates — no string concat.
   */
  async search(
    input: SearchAttendeesInput,
  ): Promise<{ candidates: AttendeeCandidate[] }> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const vector = await this.embedding.embed(input.query);
    const vectorLiteral = `[${vector.join(',')}]`;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`event_id = ${input.eventId}::uuid`,
    ];
    if (input.role) {
      conditions.push(Prisma.sql`role = ${input.role}`);
    }
    if (input.skills && input.skills.length > 0) {
      // Format as Postgres array literal `{"a","b"}`. Bound as a single string
      // parameter then cast to text[] at query time. Avoids ESLint widening
      // `string[]` parameters to `any` through Prisma.sql tagged template.
      const skillsLiteral = toPgTextArrayLiteral(input.skills);
      conditions.push(Prisma.sql`skills && ${skillsLiteral}::text[]`);
    }
    const where = Prisma.join(conditions, ' AND ');

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT id, name, headline, bio, skills, looking_for,
             (embedding <=> ${vectorLiteral}::vector) AS distance
      FROM attendees
      WHERE ${where}
      ORDER BY distance ASC
      LIMIT ${limit}
    `;

    return {
      candidates: rows.map((r) => ({
        attendee_id: r.id,
        name: r.name,
        headline: r.headline,
        bio: r.bio.slice(0, BIO_TRUNCATE),
        skills: r.skills,
        looking_for: r.looking_for,
        similarity_score: 1 - Number(r.distance),
      })),
    };
  }
}

/**
 * Convert a JS string array to a Postgres array literal: `{"a","b","c"}`.
 * Each element is quoted with backslash-escaping for `\` and `"`.
 * The resulting string is bound as a single parameter and cast at query time
 * via `::text[]` — values are not interpolated into SQL.
 */
function toPgTextArrayLiteral(values: string[]): string {
  const escaped = values.map(
    (v) => '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"',
  );
  return '{' + escaped.join(',') + '}';
}
