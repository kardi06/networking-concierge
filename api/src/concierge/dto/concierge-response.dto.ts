import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One scored candidate. Assembled by the agent across three tools:
 * `search_attendees` surfaces the candidate, `score_match` (FastAPI) produces
 * `score` / `rationale` / `shared_ground`, `draft_intro_message` produces
 * `draft_intro`.
 */
export class ConciergeMatchDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f1b0c88-2b7e-4a42-9a15-7c5e1d2b9f01',
  })
  attendee_id!: string;

  @ApiProperty({ example: 'Sarah Lim' })
  name!: string;

  @ApiProperty({
    description: 'Fit score produced by the score-service, 0–100.',
    minimum: 0,
    maximum: 100,
    example: 92,
  })
  score!: number;

  @ApiProperty({
    example: 'Both work in B2B SaaS with NestJS background and SEA focus.',
  })
  rationale!: string;

  @ApiProperty({
    type: [String],
    example: ['NestJS', 'B2B SaaS', 'SEA market'],
  })
  shared_ground!: string[];

  @ApiPropertyOptional({
    description:
      'Present only when the agent got as far as calling `draft_intro_message` for this candidate.',
    example:
      'Hi Sarah — saw your work on LedgerAI and your search for a backend co-founder…',
  })
  draft_intro?: string;
}

export class ConciergeResponseDto {
  @ApiProperty({
    description:
      'Id of the persisted assistant message. Pass it to the feedback endpoint.',
    format: 'uuid',
    example: 'fac4f2c7-23d8-449e-95c5-945299369583',
  })
  message_id!: string;

  @ApiProperty({
    description: 'The agent’s natural-language turn.',
    example: 'Based on your goal, here are matches worth meeting: …',
  })
  reply!: string;

  @ApiProperty({
    description:
      'Empty when the agent could not surface a confidently scored candidate within the 6-iteration cap — `reply` is still returned.',
    type: [ConciergeMatchDto],
  })
  matches!: ConciergeMatchDto[];
}
