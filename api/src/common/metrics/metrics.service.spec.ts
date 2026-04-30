import { MetricsService } from './metrics.service';
import type { PinoLogger } from 'nestjs-pino';

describe('MetricsService', () => {
  let service: MetricsService;
  let logger: { info: jest.Mock; setContext: jest.Mock };

  beforeEach(() => {
    logger = { info: jest.fn(), setContext: jest.fn() };
    service = new MetricsService(logger as unknown as PinoLogger);
  });

  it('emits a structured _metric field with namespace and defaults', () => {
    service.emit({ name: 'LlmCall', value: 1 });

    expect(logger.info).toHaveBeenCalledWith(
      {
        _metric: {
          namespace: 'MyConnect/Concierge',
          name: 'LlmCall',
          value: 1,
          unit: 'Count',
          dimensions: {},
        },
      },
      'metric:LlmCall',
    );
  });

  it('forwards explicit unit and dimensions', () => {
    service.emit({
      name: 'ToolDispatch',
      value: 234,
      unit: 'Milliseconds',
      dimensions: { tool: 'search_attendees', status: 'success' },
    });

    expect(logger.info).toHaveBeenCalledTimes(1);
    const args = logger.info.mock.calls[0] as unknown[];
    const payload = args[0] as {
      _metric: { unit: string; dimensions: Record<string, string> };
    };
    expect(payload._metric.unit).toBe('Milliseconds');
    expect(payload._metric.dimensions).toEqual({
      tool: 'search_attendees',
      status: 'success',
    });
    expect(args[1]).toBe('metric:ToolDispatch');
  });
});
