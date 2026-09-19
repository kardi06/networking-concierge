// Kept free of framework imports so standalone scripts (prisma/seed.ts) can
// share them without pulling in Nest.

export const EMBEDDING_MODEL = 'text-embedding-3-small';

// Must match the `vector(1536)` column in attendees.embedding.
export const EMBEDDING_DIMENSIONS = 1536;
