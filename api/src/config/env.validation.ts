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
});
