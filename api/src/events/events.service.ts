import { BadRequestException, Injectable } from '@nestjs/common';
import { Event } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';

export interface PaginatedEvents {
  items: Event[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEventDto): Promise<Event> {
    if (dto.startsAt.getTime() >= dto.endsAt.getTime()) {
      throw new BadRequestException('startsAt must be before endsAt');
    }
    return this.prisma.event.create({ data: dto });
  }

  async findAll(query: ListEventsQueryDto): Promise<PaginatedEvents> {
    const { page, limit } = query;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.event.count(),
    ]);
    return { items, total, page, limit };
  }
}
