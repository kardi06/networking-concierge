import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { FeedbackService } from './feedback.service';
import { FeedbackDto } from './dto/feedback.dto';
import { FeedbackResponseDto } from './dto/feedback-response.dto';

@ApiTags('Concierge')
@ApiParam({
  name: 'eventId',
  format: 'uuid',
  example: 'b566148f-0c25-47bf-9123-8b7be21566ec',
})
@ApiParam({
  name: 'messageId',
  description: 'The `message_id` returned by the concierge endpoint.',
  format: 'uuid',
  example: 'fac4f2c7-23d8-449e-95c5-945299369583',
})
@Controller('events/:eventId/concierge/messages/:messageId/feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @ApiOperation({
    summary: 'Rate a concierge response',
    description:
      'Collects the training signal a re-ranking model in the score-service would later learn from. One rating per message.',
  })
  @ApiCreatedResponse({ type: FeedbackResponseDto })
  @ApiNotFoundResponse({
    description:
      'Message does not exist **or** the supplied `attendee_id` does not own the conversation it belongs to. Both cases return 404 on purpose — a 403 would confirm that someone else’s message id is real.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Feedback already exists for this message.',
    type: ErrorResponseDto,
  })
  submit(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: FeedbackDto,
  ) {
    return this.feedback.submit(eventId, messageId, dto);
  }
}
