import { ApiProperty } from '@nestjs/swagger';

/**
 * Note the absence of `embedding`: the 1536-dim vector is stored on the row but
 * deliberately kept out of the public contract (large, and of no use to a client).
 */
export class AttendeeResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '7a958c2e-61d6-42cb-b74f-6b92d0d8eb52',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'b566148f-0c25-47bf-9123-8b7be21566ec',
  })
  eventId!: string;

  @ApiProperty({ example: 'Sarah Lim' })
  name!: string;

  @ApiProperty({ example: 'Founder & CEO at LedgerAI' })
  headline!: string;

  @ApiProperty({
    example:
      'Building LedgerAI, a B2B finance automation platform serving SMEs in Southeast Asia.',
  })
  bio!: string;

  @ApiProperty({ example: 'LedgerAI' })
  company!: string;

  @ApiProperty({ example: 'founder' })
  role!: string;

  @ApiProperty({
    type: [String],
    example: ['fintech', 'b2b-saas', 'leadership'],
  })
  skills!: string[];

  @ApiProperty({
    example: 'A backend co-founder with NestJS / B2B SaaS experience.',
  })
  lookingFor!: string;

  @ApiProperty({ example: true })
  openToChat!: boolean;

  @ApiProperty({ format: 'date-time', example: '2026-04-30T06:38:30.318Z' })
  createdAt!: string;
}

export class PaginatedAttendeesDto {
  @ApiProperty({ type: [AttendeeResponseDto] })
  items!: AttendeeResponseDto[];

  @ApiProperty({ description: 'Total rows matching the query.', example: 15 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
