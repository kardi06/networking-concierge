import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAttendeeDto {
  @ApiProperty({ example: 'Sarah Lim' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'Founder & CEO at LedgerAI' })
  @IsString()
  @IsNotEmpty()
  headline!: string;

  @ApiProperty({
    description:
      'Free-text profile. Embedded server-side together with headline, skills and lookingFor.',
    example:
      'Building LedgerAI, a B2B finance automation platform serving SMEs in Southeast Asia.',
  })
  @IsString()
  @IsNotEmpty()
  bio!: string;

  @ApiProperty({ example: 'LedgerAI' })
  @IsString()
  @IsNotEmpty()
  company!: string;

  @ApiProperty({
    description:
      'Free-text role. Used as an exact-match filter on list/search.',
    example: 'founder',
  })
  @IsString()
  @IsNotEmpty()
  role!: string;

  @ApiProperty({
    description: 'At least one skill tag. Filtered with any-of semantics.',
    type: [String],
    minItems: 1,
    example: ['fintech', 'b2b-saas', 'leadership'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  skills!: string[];

  @ApiProperty({
    description: 'What this attendee wants out of the event.',
    example: 'A backend co-founder with NestJS / B2B SaaS experience.',
  })
  @IsString()
  @IsNotEmpty()
  lookingFor!: string;

  @ApiPropertyOptional({
    description: 'Opt out of being surfaced as a match by setting this false.',
    default: true,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  openToChat: boolean = true;
}
