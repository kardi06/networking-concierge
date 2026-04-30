import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

const NAMESPACE = 'MyConnect/Concierge';

export type MetricUnit = 'Milliseconds' | 'Count' | 'Bytes' | 'Tokens';

export interface MetricEvent {
  name: string;
  value: number;
  unit?: MetricUnit;
  dimensions?: Record<string, string>;
}

/**
 * Lightweight metrics emitter. Writes a structured log line with a `_metric`
 * field that downstream agents (CloudWatch agent / Fluent Bit) can transform
 * into CloudWatch EMF or push to Azure Monitor / Datadog.
 *
 * Keeping a thin abstraction so future backends can be swapped without touching
 * call sites.
 */
@Injectable()
export class MetricsService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(MetricsService.name);
  }

  emit(event: MetricEvent): void {
    this.logger.info(
      {
        _metric: {
          namespace: NAMESPACE,
          name: event.name,
          value: event.value,
          unit: event.unit ?? 'Count',
          dimensions: event.dimensions ?? {},
        },
      },
      `metric:${event.name}`,
    );
  }
}
