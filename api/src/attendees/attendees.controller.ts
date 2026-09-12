import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { AttendeesService } from './attendees.service';
import { CreateAttendeeDto } from './dto/create-attendee.dto';
import { ListAttendeesQueryDto } from './dto/list-attendees-query.dto';
import {
  AttendeeResponseDto,
  PaginatedAttendeesDto,
} from './dto/attendee-response.dto';

@ApiTags('Attendees')
@ApiParam({
  name: 'eventId',
  format: 'uuid',
  example: 'b566148f-0c25-47bf-9123-8b7be21566ec',
})
@Controller('events/:eventId/attendees')
export class AttendeesController {
  constructor(private readonly attendees: AttendeesService) {}

  @Post()
  @ApiOperation({
    summary: 'Register an attendee',
    description:
      'Embeds `headline + bio + skills + lookingFor` via OpenAI `text-embedding-3-small` and writes the 1536-dim vector to `attendees.embedding` through a parameter-bound raw insert. That vector is what `search_attendees` later searches over, so registration is the only write path that costs an embedding call.',
  })
  @ApiCreatedResponse({
    description: 'The `embedding` column is intentionally not returned.',
    type: AttendeeResponseDto,
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateAttendeeDto,
  ) {
    return this.attendees.create(eventId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List attendees',
    description:
      'Plain relational listing with optional `role` and `skills` filters. This is *not* the semantic search the agent uses — that runs inside the `search_attendees` tool.',
  })
  @ApiOkResponse({ type: PaginatedAttendeesDto })
  findAll(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: ListAttendeesQueryDto,
  ) {
    return this.attendees.findAll(eventId, query);
  }
}
