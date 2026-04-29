import { MockEmbeddingService } from './mock-embedding.service';

describe('MockEmbeddingService', () => {
  let service: MockEmbeddingService;

  beforeEach(() => {
    service = new MockEmbeddingService();
  });

  it('produces a 1536-dimension vector', async () => {
    const vec = await service.embed('hello');
    expect(vec).toHaveLength(1536);
  });

  it('produces a unit-normalized vector (cosine similarity well-defined)', async () => {
    const vec = await service.embed('hello world');
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('is deterministic — same input returns the same vector', async () => {
    const a = await service.embed('founder of climate startup');
    const b = await service.embed('founder of climate startup');
    expect(a).toEqual(b);
  });

  it('returns different vectors for different inputs', async () => {
    const a = await service.embed('founder');
    const b = await service.embed('investor');
    expect(a).not.toEqual(b);
  });
});
