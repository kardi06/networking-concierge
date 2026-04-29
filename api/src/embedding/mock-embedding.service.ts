import { Injectable } from '@nestjs/common';

const DIMENSIONS = 1536;

/**
 * Deterministic embedding for tests: same input → same vector, different inputs
 * → different vectors. Vectors are unit-normalized so cosine similarity behaves
 * naturally. Algorithm: FNV-1a hash → mulberry32 PRNG seed → normalize.
 */
@Injectable()
export class MockEmbeddingService {
  embed(text: string): Promise<number[]> {
    const seed = fnv1a(text);
    const rand = mulberry32(seed);
    const vec = Array.from({ length: DIMENSIONS }, () => rand() * 2 - 1);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return Promise.resolve(vec.map((v) => v / norm));
  }
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
