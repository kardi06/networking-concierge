import { Injectable } from '@nestjs/common';
import { Conversation, Message, Prisma, ToolCall } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface MessageWithToolCalls extends Message {
  toolCalls: ToolCall[];
}

export interface AppendMessageInput {
  conversationId: string;
  role: 'user' | 'assistant' | 'tool';
  content: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

export interface AppendToolCallInput {
  messageId: string;
  toolName: string;
  input: Prisma.InputJsonValue;
  output: Prisma.InputJsonValue | null;
  errorText?: string;
  latencyMs: number;
}

@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** One conversation per (event, attendee). Upsert by unique constraint. */
  async findOrCreate(
    eventId: string,
    attendeeId: string,
  ): Promise<Conversation> {
    return this.prisma.conversation.upsert({
      where: { eventId_attendeeId: { eventId, attendeeId } },
      create: { eventId, attendeeId },
      update: {},
    });
  }

  /** Ordered history with tool calls eager-loaded for replay/reconstruction. */
  async loadHistory(conversationId: string): Promise<MessageWithToolCalls[]> {
    return this.prisma.message.findMany({
      where: { conversationId },
      include: { toolCalls: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async appendMessage(input: AppendMessageInput): Promise<Message> {
    return this.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        metadata: input.metadata,
      },
    });
  }

  async appendToolCall(input: AppendToolCallInput): Promise<ToolCall> {
    return this.prisma.toolCall.create({
      data: {
        messageId: input.messageId,
        toolName: input.toolName,
        input: input.input,
        output: input.output ?? Prisma.JsonNull,
        errorText: input.errorText ?? null,
        latencyMs: input.latencyMs,
      },
    });
  }
}
