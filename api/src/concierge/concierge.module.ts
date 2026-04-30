import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { AttendeesModule } from '../attendees/attendees.module';
import { ToolExecutorService } from './tools/tool-executor.service';
import { ConciergeService } from './concierge.service';
import { ConciergeController } from './concierge.controller';
import { ConversationsRepository } from './conversations.repository';
import { AttendeeThrottlerGuard } from './guards/attendee-throttler.guard';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';

@Module({
  imports: [LlmModule, AttendeesModule],
  controllers: [ConciergeController, FeedbackController],
  providers: [
    ToolExecutorService,
    ConciergeService,
    ConversationsRepository,
    AttendeeThrottlerGuard,
    FeedbackService,
  ],
  exports: [ToolExecutorService, ConciergeService, FeedbackService],
})
export class ConciergeModule {}
