import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class FeedbackDto {
  // PRD §3.4 lists only { rating, notes? } but we add attendee_id here for
  // ownership verification — there is no auth layer in this take-home.
  @ApiProperty({
    description:
      'Must own the conversation the message belongs to, otherwise a 404 is returned (we do not leak other attendees’ message ids with a 403).',
    format: 'uuid',
    example: '7a958c2e-61d6-42cb-b74f-6b92d0d8eb52',
  })
  @IsUUID()
  attendee_id!: string;

  @ApiProperty({
    description:
      'Quality of the concierge response. Stored as training signal for a future re-ranking model.',
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({
    maxLength: 1000,
    example: 'Sarah was exactly what I was looking for.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
