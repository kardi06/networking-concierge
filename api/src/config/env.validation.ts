import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),

  DATABASE_URL: Joi.string().uri().required(),

  ANTHROPIC_API_KEY: Joi.string().min(10).required(),
  ANTHROPIC_MODEL: Joi.string().default('claude-sonnet-4-6'),

  OPENAI_API_KEY: Joi.string().min(10).required(),

  SCORE_SERVICE_URL: Joi.string().uri().default('http://localhost:8000'),

  RATE_LIMIT_PER_MIN: Joi.number().integer().min(1).default(10),

  // Daily spend ceilings for a publicly reachable demo, counted in concierge
  // turns since 00:00 UTC. 0 disables the cap, which is the default so local
  // development and CI are unaffected. See DemoBudgetService.
  DEMO_DAILY_TURN_LIMIT: Joi.number().integer().min(0).default(0),
  DEMO_ATTENDEE_DAILY_TURN_LIMIT: Joi.number().integer().min(0).default(0),

  // Externally reachable origin of this API, e.g. https://myconnect.up.railway.app.
  // Only used to add a "Public demo" server entry to the OpenAPI document so the
  // "Test Request" button in /docs targets the deployment instead of localhost.
  PUBLIC_BASE_URL: Joi.string().uri().optional(),
});
