import type Anthropic from '@anthropic-ai/sdk';

// NOTE: deviated from PRD §5.2 / §5.3 — `requester_attendee_id` and
// `from_attendee_id` are NOT exposed in tool schemas. They are injected from
// `ToolContext.requesterAttendeeId` by the executor to prevent the LLM from
// hallucinating a different requester ID.

export const SEARCH_ATTENDEES_TOOL: Anthropic.Messages.Tool = {
  name: 'search_attendees',
  description:
    'Retrieve attendee candidates from the database using semantic search and optional keyword filters. Use this first to find people relevant to the requester intent.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description:
          'Natural-language description of who to find. Be specific (mention skills, industry, geography).',
      },
      skills: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional skills filter; matches if attendee has any of them.',
      },
      role: {
        type: 'string',
        description:
          'Optional role filter (e.g., founder, investor, engineer).',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
        description: 'Max number of candidates to return (default 10).',
      },
    },
    required: ['query'],
  },
};

export const SCORE_MATCH_TOOL: Anthropic.Messages.Tool = {
  name: 'score_match',
  description:
    "Get a structured fit score for a single candidate against the requester's intent. Call this for the most promising candidates returned by search_attendees.",
  input_schema: {
    type: 'object' as const,
    properties: {
      candidate_attendee_id: {
        type: 'string',
        description: 'The attendee_id of the candidate to score.',
      },
      intent: {
        type: 'string',
        description:
          "The requester's intent — what kind of connection they want.",
      },
    },
    required: ['candidate_attendee_id', 'intent'],
  },
};

export const DRAFT_INTRO_MESSAGE_TOOL: Anthropic.Messages.Tool = {
  name: 'draft_intro_message',
  description:
    'Compose a personalized intro message between the requester and a candidate. Call this for the top 2–3 matches you plan to recommend.',
  input_schema: {
    type: 'object' as const,
    properties: {
      to_attendee_id: {
        type: 'string',
        description: 'The attendee_id of the recipient.',
      },
      context: {
        type: 'string',
        description:
          'Reason for connecting — name the shared ground concretely.',
      },
    },
    required: ['to_attendee_id', 'context'],
  },
};

export const ALL_TOOLS: Anthropic.Messages.Tool[] = [
  SEARCH_ATTENDEES_TOOL,
  SCORE_MATCH_TOOL,
  DRAFT_INTRO_MESSAGE_TOOL,
];
