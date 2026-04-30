const MAX_LENGTH = 2000;

// Common injection patterns: special tokens used by various model providers,
// fake instruction tags, and the LLaMA-style [INST] block markers.
const INJECTION_PATTERNS: RegExp[] = [
  /\[\/?INST\]/gi,
  /\[\/?SYS\]/gi,
  /\[\/?SYSTEM\]/gi,
  /<\|[^|>]+\|>/g, // <|im_start|>, <|endoftext|>, etc.
  /<\/?(?:system|prompt|instruction|instructions)>/gi,
];

/**
 * Strip known prompt-injection patterns and normalise whitespace. Truncates
 * to a sane maximum so a giant bio cannot blow up the prompt budget.
 *
 * This is one defense layer — the system prompt's <attendee_data> rule is
 * the second. Both must be applied before any user/attendee content reaches
 * the LLM.
 */
export function sanitizeContent(text: string): string {
  let s = text;
  for (const pattern of INJECTION_PATTERNS) {
    s = s.replace(pattern, ' ');
  }
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > MAX_LENGTH) {
    s = s.slice(0, MAX_LENGTH) + '… [truncated]';
  }
  return s;
}

/**
 * Sanitize and wrap attendee-supplied content in `<attendee_data>` tags so the
 * model can disambiguate data from instructions per the system prompt.
 */
export function wrapAsAttendeeData(text: string): string {
  return `<attendee_data>${sanitizeContent(text)}</attendee_data>`;
}
