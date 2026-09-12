import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { EventResponseDto, PaginatedEventsDto } from './dto/event-response.dto';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an event',
    description:
      'Events are the tenancy boundary: attendees, conversations and matches never cross one.',
  })
  @ApiCreatedResponse({ type: EventResponseDto })
  @ApiBadRequestResponse({
    description: 'Validation failed — e.g. `startsAt` is not before `endsAt`.',
    type: ErrorResponseDto,
  })
  create(@Body() dto: CreateEventDto) {
    return this.events.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List events',
    description: 'Newest first, paginated.',
  })
  @ApiOkResponse({ type: PaginatedEventsDto })
  findAll(@Query() query: ListEventsQueryDto) {
    return this.events.findAll(query);
  }
}
