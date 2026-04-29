import { Module } from '@nestjs/common';
import { AttendeesController } from './attendees.controller';
import { AttendeesService } from './attendees.service';
import { AttendeeSearchService } from './attendee-search.service';
import { EmbeddingModule } from '../embedding/embedding.module';

@Module({
  imports: [EmbeddingModule],
  controllers: [AttendeesController],
  providers: [AttendeesService, AttendeeSearchService],
  exports: [AttendeesService, AttendeeSearchService],
})
export class AttendeesModule {}
