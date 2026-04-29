import { BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateEventDto } from './dto/create-event.dto';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: {
    event: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      event: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    service = new EventsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    const validDto: CreateEventDto = {
      title: 'Demo Conf',
      startsAt: new Date('2026-05-15T09:00:00Z'),
      endsAt: new Date('2026-05-17T18:00:00Z'),
      location: 'Jakarta',
    };

    it('throws BadRequestException when startsAt equals endsAt', async () => {
      const dto: CreateEventDto = {
        ...validDto,
        endsAt: validDto.startsAt,
      };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when startsAt is after endsAt', async () => {
      const dto: CreateEventDto = {
        ...validDto,
        startsAt: new Date('2026-05-20T00:00:00Z'),
      };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('creates the event when dates are valid', async () => {
      const created = { id: 'uuid-1', ...validDto, createdAt: new Date() };
      prisma.event.create.mockResolvedValue(created);

      const result = await service.create(validDto);

      expect(prisma.event.create).toHaveBeenCalledWith({ data: validDto });
      expect(result).toBe(created);
    });
  });

  describe('findAll', () => {
    it('returns paginated events with total count', async () => {
      const items = [{ id: '1' }, { id: '2' }];
      const total = 42;
      prisma.$transaction.mockResolvedValue([items, total]);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ items, total, page: 2, limit: 10 });
    });

    it('uses correct skip/take for the requested page', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ page: 3, limit: 5 });

      // The first arg of $transaction is an array of two prisma promises;
      // since prisma.event.findMany was invoked with skip/take, assert that.
      expect(prisma.event.findMany).toHaveBeenCalledWith({
        skip: 10,
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
