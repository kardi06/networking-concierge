import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { AttendeesModule } from '../attendees/attendees.module';
import { ToolExecutorService } from './tools/tool-executor.service';

@Module({
  imports: [LlmModule, AttendeesModule],
  providers: [ToolExecutorService],
  exports: [ToolExecutorService],
})
export class ConciergeModule {}
