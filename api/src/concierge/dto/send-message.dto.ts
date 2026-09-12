import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description:
      'The attendee speaking to the concierge. Doubles as the conversation key — one conversation per (event, attendee) pair, so the same id resumes the same thread.',
    format: 'uuid',
    example: '7a958c2e-61d6-42cb-b74f-6b92d0d8eb52',
  })
  @IsUUID()
  attendee_id!: string;

  @ApiProperty({
    description:
      'Natural-language turn. Sanitised for known prompt-injection markers before it reaches the model.',
    maxLength: 2000,
    example:
      "I'm a backend engineer in Jakarta with 8 years experience. Looking for an AI startup co-founder, ideally B2B SaaS in Southeast Asia.",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
