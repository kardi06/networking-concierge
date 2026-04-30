import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConciergeService } from './concierge.service';
import { SendMessageDto } from './dto/send-message.dto';
import { AttendeeThrottlerGuard } from './guards/attendee-throttler.guard';

@Controller('events/:eventId/concierge/messages')
export class ConciergeController {
  constructor(private readonly concierge: ConciergeService) {}

  @Post()
  @UseGuards(AttendeeThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  send(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.concierge.handleMessage(eventId, dto.attendee_id, dto.message);
  }
}
