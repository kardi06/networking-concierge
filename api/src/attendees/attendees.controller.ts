import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AttendeesService } from './attendees.service';
import { CreateAttendeeDto } from './dto/create-attendee.dto';
import { ListAttendeesQueryDto } from './dto/list-attendees-query.dto';

@Controller('events/:eventId/attendees')
export class AttendeesController {
  constructor(private readonly attendees: AttendeesService) {}

  @Post()
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateAttendeeDto,
  ) {
    return this.attendees.create(eventId, dto);
  }

  @Get()
  findAll(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: ListAttendeesQueryDto,
  ) {
    return this.attendees.findAll(eventId, query);
  }
}
