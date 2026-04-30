import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { FeedbackDto } from './dto/feedback.dto';

@Controller('events/:eventId/concierge/messages/:messageId/feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  submit(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: FeedbackDto,
  ) {
    return this.feedback.submit(eventId, messageId, dto);
  }
}
