import { Injectable, NotFoundException } from '@nestjs/common';
import { Attendee, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { CreateAttendeeDto } from './dto/create-attendee.dto';
import { ListAttendeesQueryDto } from './dto/list-attendees-query.dto';

export interface PaginatedAttendees {
  items: Attendee[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AttendeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  async create(eventId: string, dto: CreateAttendeeDto): Promise<Attendee> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`);
    }

    const source = `${dto.headline} ${dto.bio} ${dto.skills.join(', ')} ${dto.lookingFor}`;
    const vector = await this.embedding.embed(source);
    const vectorLiteral = `[${vector.join(',')}]`;

    const id = randomUUID();
    // Parameterised raw INSERT — vector(1536) is not supported by Prisma's
    // typed client, so we use $executeRaw with Prisma.sql tagged template.
    // Every ${} becomes a bound parameter ($1, $2, …) — no string concat,
    // no SQL-injection risk.
    await this.prisma.$executeRaw`
      INSERT INTO attendees (
        id, event_id, name, headline, bio, company, role,
        skills, looking_for, open_to_chat, embedding, created_at
      ) VALUES (
        ${id}::uuid,
        ${eventId}::uuid,
        ${dto.name},
        ${dto.headline},
        ${dto.bio},
        ${dto.company},
        ${dto.role},
        ${dto.skills}::text[],
        ${dto.lookingFor},
        ${dto.openToChat},
        ${vectorLiteral}::vector,
        NOW()
      )
    `;

    // Re-read via the typed client. The Unsupported `embedding` column is
    // automatically omitted from the response — exactly what we want.
    const created = await this.prisma.attendee.findUnique({ where: { id } });
    if (!created) {
      throw new Error(
        `Attendee ${id} was inserted but cannot be read back (unexpected)`,
      );
    }
    return created;
  }

  async findAll(
    eventId: string,
    query: ListAttendeesQueryDto,
  ): Promise<PaginatedAttendees> {
    const { page, limit, role, skills } = query;
    const where: Prisma.AttendeeWhereInput = {
      eventId,
      ...(role ? { role } : {}),
      ...(skills && skills.length > 0 ? { skills: { hasSome: skills } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendee.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.attendee.count({ where }),
    ]);
    return { items, total, page, limit };
  }
}
