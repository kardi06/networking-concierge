import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FeedbackService } from './feedback.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { FeedbackDto } from './dto/feedback.dto';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let prisma: {
    message: { findUnique: jest.Mock };
    feedback: { create: jest.Mock };
  };

  const validDto: FeedbackDto = {
    attendee_id: 'att-1',
    rating: 5,
    notes: 'great match',
  };

  beforeEach(() => {
    prisma = {
      message: { findUnique: jest.fn() },
      feedback: { create: jest.fn() },
    };
    service = new FeedbackService(prisma as unknown as PrismaService);
  });

  it('throws NotFoundException when message does not exist', async () => {
    prisma.message.findUnique.mockResolvedValue(null);

    await expect(
      service.submit('event-1', 'msg-missing', validDto),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.feedback.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when message belongs to a different event', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      conversation: { eventId: 'other-event', attendeeId: 'att-1' },
    });

    await expect(service.submit('event-1', 'msg-1', validDto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when message belongs to a different attendee', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      conversation: { eventId: 'event-1', attendeeId: 'someone-else' },
    });

    await expect(service.submit('event-1', 'msg-1', validDto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates feedback on the happy path', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      conversation: { eventId: 'event-1', attendeeId: 'att-1' },
    });
    const stored = { id: 'fb-1', messageId: 'msg-1', rating: 5 };
    prisma.feedback.create.mockResolvedValue(stored);

    const result = await service.submit('event-1', 'msg-1', validDto);

    expect(prisma.feedback.create).toHaveBeenCalledWith({
      data: { messageId: 'msg-1', rating: 5, notes: 'great match' },
    });
    expect(result).toBe(stored);
  });

  it('throws ConflictException on duplicate (Prisma P2002)', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      conversation: { eventId: 'event-1', attendeeId: 'att-1' },
    });
    const dupErr = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
    prisma.feedback.create.mockRejectedValue(dupErr);

    await expect(service.submit('event-1', 'msg-1', validDto)).rejects.toThrow(
      ConflictException,
    );
  });
});
