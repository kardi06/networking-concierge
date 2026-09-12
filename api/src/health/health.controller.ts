import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Cheap, dependency-free check used by the Docker HEALTHCHECK and the platform load balancer. It does not touch Postgres or the LLM.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  check() {
    return {
      status: 'ok',
      env: this.config.get<string>('NODE_ENV'),
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
