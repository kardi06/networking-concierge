import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateEventDto {
  @ApiProperty({
    description: 'Human-readable event name.',
    minLength: 3,
    example: 'Southeast Asia AI Summit 2026',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title!: string;

  @ApiProperty({
    description: 'ISO 8601 start timestamp. Must be strictly before `endsAt`.',
    format: 'date-time',
    example: '2026-05-15T09:00:00Z',
  })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty({
    description: 'ISO 8601 end timestamp. Must be strictly after `startsAt`.',
    format: 'date-time',
    example: '2026-05-17T18:00:00Z',
  })
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @ApiProperty({
    description: 'Free-text venue or city.',
    example: 'Jakarta, Indonesia',
  })
  @IsString()
  @IsNotEmpty()
  location!: string;
}
