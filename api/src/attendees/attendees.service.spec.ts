import { NotFoundException } from '@nestjs/common';
import { AttendeesService } from './attendees.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EmbeddingService } from '../embedding/embedding.service';
import type { CreateAttendeeDto } from './dto/create-attendee.dto';

describe('AttendeesService', () => {
  let service: AttendeesService;
  let prisma: {
    event: { findUnique: jest.Mock };
    attendee: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let embedding: { embed: jest.Mock };

  beforeEach(() => {
    prisma = {
      event: { findUnique: jest.fn() },
      attendee: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    embedding = { embed: jest.fn() };
    service = new AttendeesService(
      prisma as unknown as PrismaService,
      embedding as unknown as EmbeddingService,
    );
  });

  const validDto: CreateAttendeeDto = {
    name: 'Test User',
    headline: 'Backend Engineer',
    bio: 'I build NestJS services',
    company: 'TestCo',
    role: 'engineer',
    skills: ['typescript', 'nestjs'],
    lookingFor: 'co-founder for AI startup',
    openToChat: true,
  };

  describe('create', () => {
    it('throws NotFoundException when the event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(
        service.create('00000000-0000-0000-0000-000000000000', validDto),
      ).rejects.toThrow(NotFoundException);

      expect(embedding.embed).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('embeds the concatenated profile text', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1' });
      embedding.embed.mockResolvedValue([0.1, 0.2, 0.3]);
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.attendee.findUnique.mockResolvedValue({ id: 'attendee-1' });

      await service.create('event-1', validDto);

      expect(embedding.embed).toHaveBeenCalledWith(
        'Backend Engineer I build NestJS services typescript, nestjs co-founder for AI startup',
      );
    });

    it('inserts via $executeRaw and reads back via findUnique', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1' });
      embedding.embed.mockResolvedValue([0.1, 0.2]);
      prisma.$executeRaw.mockResolvedValue(1);
      const stored = { id: 'attendee-1', name: 'Test User' };
      prisma.attendee.findUnique.mockResolvedValue(stored);

      const result = await service.create('event-1', validDto);

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.attendee.findUnique).toHaveBeenCalledTimes(1);
      expect(result).toBe(stored);
    });
  });

  describe('findAll', () => {
    it('paginates with skip/take based on page and limit', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll('event-1', { page: 3, limit: 5 });

      expect(prisma.attendee.findMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
        skip: 10,
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('applies the role filter when provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll('event-1', {
        page: 1,
        limit: 20,
        role: 'founder',
      });

      expect(prisma.attendee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: 'event-1', role: 'founder' },
        }),
      );
    });

    it('applies the skills filter using hasSome', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll('event-1', {
        page: 1,
        limit: 20,
        skills: ['ai', 'b2b-saas'],
      });

      expect(prisma.attendee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            eventId: 'event-1',
            skills: { hasSome: ['ai', 'b2b-saas'] },
          },
        }),
      );
    });
  });
});
