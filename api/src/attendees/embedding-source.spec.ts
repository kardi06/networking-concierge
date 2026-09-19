import { buildEmbeddingSource } from './embedding-source';

describe('buildEmbeddingSource', () => {
  // Pinned on purpose. Every stored vector was built from this exact format, so
  // if this assertion ever has to change, existing embeddings must be
  // regenerated — otherwise old and new vectors silently stop being comparable.
  it('joins headline, bio, skills and looking-for in a fixed format', () => {
    expect(
      buildEmbeddingSource({
        headline: 'Founder at LedgerAI',
        bio: 'B2B fintech for SEA SMEs.',
        skills: ['fintech', 'b2b-saas'],
        lookingFor: 'A backend co-founder.',
      }),
    ).toBe(
      'Founder at LedgerAI B2B fintech for SEA SMEs. fintech, b2b-saas A backend co-founder.',
    );
  });
});
