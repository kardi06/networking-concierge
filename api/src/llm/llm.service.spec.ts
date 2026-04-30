import { LlmService } from './llm.service';
import type Anthropic from '@anthropic-ai/sdk';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';

describe('LlmService', () => {
  let service: LlmService;
  let client: { messages: { create: jest.Mock } };
  let logger: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    setContext: jest.Mock;
  };
  let config: { getOrThrow: jest.Mock };

  beforeEach(() => {
    client = { messages: { create: jest.fn() } };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    };
    config = {
      getOrThrow: jest.fn().mockReturnValue('claude-sonnet-4-6'),
    };
    service = new LlmService(
      client as unknown as Anthropic,
      logger as unknown as PinoLogger,
      config as unknown as ConfigService,
    );
  });

  it('returns the message and logs telemetry on success', async () => {
    const fakeMessage = {
      content: [{ type: 'text', text: 'hello' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    client.messages.create.mockResolvedValue(fakeMessage);

    const result = await service.createMessage({
      system: 'you are nice',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toBe(fakeMessage);
    expect(client.messages.create).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        input_tokens: 10,
        output_tokens: 5,
        stop_reason: 'end_turn',
        attempt: 1,
      }),
      'llm message generated',
    );
  });

  it('retries on transient error and returns on later success', async () => {
    const fakeMessage = {
      content: [],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    client.messages.create
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(fakeMessage);

    const result = await service.createMessage({
      system: 's',
      messages: [{ role: 'user', content: 'x' }],
    });

    expect(result).toBe(fakeMessage);
    expect(client.messages.create).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('throws after 3 failed attempts', async () => {
    client.messages.create.mockRejectedValue(new Error('always fails'));

    await expect(
      service.createMessage({
        system: 's',
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toThrow('always fails');

    expect(client.messages.create).toHaveBeenCalledTimes(3);
  });
});
