import { ApiProperty } from '@nestjs/swagger';

export class EventResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'b566148f-0c25-47bf-9123-8b7be21566ec',
  })
  id!: string;

  @ApiProperty({ example: 'Southeast Asia AI Summit 2026' })
  title!: string;

  @ApiProperty({ format: 'date-time', example: '2026-05-15T09:00:00.000Z' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time', example: '2026-05-17T18:00:00.000Z' })
  endsAt!: string;

  @ApiProperty({ example: 'Jakarta, Indonesia' })
  location!: string;

  @ApiProperty({ format: 'date-time', example: '2026-04-30T06:38:30.318Z' })
  createdAt!: string;
}

export class PaginatedEventsDto {
  @ApiProperty({ type: [EventResponseDto] })
  items!: EventResponseDto[];

  @ApiProperty({ description: 'Total rows matching the query.', example: 1 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
