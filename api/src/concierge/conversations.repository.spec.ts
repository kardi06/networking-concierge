import { ConversationsRepository } from './conversations.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('ConversationsRepository', () => {
  let repo: ConversationsRepository;
  let prisma: {
    conversation: { upsert: jest.Mock };
    message: { findMany: jest.Mock; create: jest.Mock };
    toolCall: { create: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      conversation: { upsert: jest.fn() },
      message: { findMany: jest.fn(), create: jest.fn() },
      toolCall: { create: jest.fn() },
    };
    repo = new ConversationsRepository(prisma as unknown as PrismaService);
  });

  it('findOrCreate upserts on (eventId, attendeeId)', async () => {
    prisma.conversation.upsert.mockResolvedValue({ id: 'conv-1' });

    await repo.findOrCreate('event-1', 'att-1');

    expect(prisma.conversation.upsert).toHaveBeenCalledWith({
      where: {
        eventId_attendeeId: { eventId: 'event-1', attendeeId: 'att-1' },
      },
      create: { eventId: 'event-1', attendeeId: 'att-1' },
      update: {},
    });
  });

  it('loadHistory returns messages ordered by createdAt asc with toolCalls included', async () => {
    prisma.message.findMany.mockResolvedValue([{ id: 'm-1', toolCalls: [] }]);

    await repo.loadHistory('conv-1');

    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      include: { toolCalls: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('appendMessage forwards fields', async () => {
    prisma.message.create.mockResolvedValue({ id: 'm-1' });

    await repo.appendMessage({
      conversationId: 'c-1',
      role: 'user',
      content: 'hello',
    });

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'c-1',
        role: 'user',
        content: 'hello',
        metadata: undefined,
      },
    });
  });

  it('appendToolCall stores latency and optional errorText', async () => {
    prisma.toolCall.create.mockResolvedValue({ id: 'tc-1' });

    await repo.appendToolCall({
      messageId: 'm-1',
      toolName: 'search_attendees',
      input: { query: 'x' },
      output: { candidates: [] },
      latencyMs: 42,
    });

    expect(prisma.toolCall.create).toHaveBeenCalledTimes(1);
    const args = prisma.toolCall.create.mock.calls[0] as unknown[];
    const data = (args[0] as { data: Record<string, unknown> }).data;
    expect(data.messageId).toBe('m-1');
    expect(data.toolName).toBe('search_attendees');
    expect(data.latencyMs).toBe(42);
    expect(data.errorText).toBeNull();
  });
});
