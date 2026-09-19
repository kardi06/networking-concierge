export interface EmbeddableProfile {
  headline: string;
  bio: string;
  skills: string[];
  lookingFor: string;
}

/**
 * The exact text an attendee's embedding is computed from.
 *
 * Every vector in `attendees.embedding` must come from this function, whether
 * the row arrived through the API or through the seed script. Cosine distance
 * is only meaningful between vectors built from the same recipe — change the
 * format here and every stored embedding has to be regenerated.
 */
export function buildEmbeddingSource(profile: EmbeddableProfile): string {
  return `${profile.headline} ${profile.bio} ${profile.skills.join(', ')} ${profile.lookingFor}`;
}
