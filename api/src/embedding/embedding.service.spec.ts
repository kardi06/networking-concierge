import { EmbeddingService } from './embedding.service';
import type { PinoLogger } from 'nestjs-pino';
import type OpenAI from 'openai';

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let client: { embeddings: { create: jest.Mock } };
  let logger: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    setContext: jest.Mock;
  };

  beforeEach(() => {
    client = { embeddings: { create: jest.fn() } };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    };
    service = new EmbeddingService(
      client as unknown as OpenAI,
      logger as unknown as PinoLogger,
    );
  });

  it('returns the embedding vector on success and logs telemetry', async () => {
    const vec = Array.from({ length: 1536 }, (_, i) => i / 1536);
    client.embeddings.create.mockResolvedValue({
      data: [{ embedding: vec }],
      usage: { total_tokens: 7 },
    });

    const result = await service.embed('hello world');

    expect(result).toBe(vec);
    expect(client.embeddings.create).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        model: 'text-embedding-3-small',
        tokens: 7,
        attempt: 1,
      }),
      'embedding generated',
    );
  });

  it('retries on transient error and succeeds on a later attempt', async () => {
    const vec = Array.from({ length: 1536 }, () => 0);
    client.embeddings.create
      .mockRejectedValueOnce(new Error('transient 1'))
      .mockResolvedValueOnce({
        data: [{ embedding: vec }],
        usage: { total_tokens: 1 },
      });

    const result = await service.embed('test');

    expect(result).toBe(vec);
    expect(client.embeddings.create).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('throws after 3 failed attempts', async () => {
    client.embeddings.create.mockRejectedValue(new Error('always fails'));

    await expect(service.embed('test')).rejects.toThrow('always fails');
    expect(client.embeddings.create).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(3);
  });
});
