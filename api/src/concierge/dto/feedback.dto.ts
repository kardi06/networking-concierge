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
  @IsUUID()
  attendee_id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
