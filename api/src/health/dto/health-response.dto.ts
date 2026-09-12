import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: 'production' })
  env!: string;

  @ApiProperty({ description: 'Process uptime in seconds.', example: 24 })
  uptime!: number;

  @ApiProperty({ format: 'date-time', example: '2026-04-30T06:38:30.318Z' })
  timestamp!: string;
}
