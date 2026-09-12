import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Schema-only class. Mirrors the envelope produced by `AllExceptionsFilter`
 * so the OpenAPI document documents failures as precisely as successes.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({
    description:
      'A string for a single error, an array when several fields failed validation.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['title must be longer than or equal to 3 characters'],
  })
  message!: string | string[];

  @ApiProperty({
    description:
      'Correlation id. Echoes `X-Request-ID` when the client sends one.',
    format: 'uuid',
    example: '0d13f7d9-9429-49d4-b0b0-484bd803cf03',
  })
  requestId!: string;

  @ApiPropertyOptional({ example: '/events' })
  path?: string;

  @ApiProperty({ format: 'date-time', example: '2026-04-30T06:38:30.318Z' })
  timestamp!: string;
}
