import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Feedback, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FeedbackDto } from './dto/feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(
    eventId: string,
    messageId: string,
    dto: FeedbackDto,
  ): Promise<Feedback> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });

    // 404 (not 403) when the message exists but doesn't belong to this
    // (event, attendee) — avoids leaking the existence of other attendees'
    // messages.
    if (
      !message ||
      message.conversation.eventId !== eventId ||
      message.conversation.attendeeId !== dto.attendee_id
    ) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    try {
      return await this.prisma.feedback.create({
        data: {
          messageId,
          rating: dto.rating,
          notes: dto.notes ?? null,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `Feedback already exists for message ${messageId}`,
        );
      }
      throw err;
    }
  }
}
