import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FeedbackResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '1c0d5e2a-8f3b-4d61-9c77-0a2b3c4d5e6f',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'fac4f2c7-23d8-449e-95c5-945299369583',
  })
  messageId!: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  rating!: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Sarah was exactly what I was looking for.',
  })
  notes?: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-04-30T06:38:30.318Z' })
  createdAt!: string;
}
