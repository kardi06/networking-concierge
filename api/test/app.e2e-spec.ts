import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createHash } from 'crypto';
import { AppModule } from './../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('GET /health returns ok', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as { status?: string };
        if (body.status !== 'ok') {
          throw new Error(`expected status ok, got ${String(body.status)}`);
        }
      });
  });

  it('GET /demo serves a page whose CSP permits exactly its own inline script', async () => {
    const res = await request(app.getHttpServer())
      .get('/demo')
      .expect(200)
      .expect('Content-Type', /text\/html/);

    // Hash what was actually served, the same way a browser would. If the
    // header and the body ever disagree, the page loads but does nothing.
    const script = /<script>([\s\S]*?)<\/script>/.exec(res.text)?.[1] ?? '';
    expect(script).not.toBe('');
    const expected = createHash('sha256')
      .update(script, 'utf8')
      .digest('base64');
    expect(res.headers['content-security-policy']).toContain(
      `script-src 'sha256-${expected}'`,
    );
  });

  it('GET / redirects to the demo', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(302)
      .expect('Location', '/demo');
  });

  afterEach(async () => {
    await app.close();
  });
});
