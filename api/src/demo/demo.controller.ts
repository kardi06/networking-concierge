import { Controller, Get, Redirect, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { DemoPage, loadDemoPage } from './demo-page';

/**
 * A one-page chat that renders the concierge's trace. Deliberately not an app:
 * no build step, no framework, no dependencies — one HTML file.
 */
@ApiExcludeController()
@Controller()
export class DemoController {
  // Read and hashed once at boot. A malformed page fails startup loudly
  // instead of being served with a policy that blocks its own script.
  private readonly page: DemoPage = loadDemoPage();

  /** The deployment's bare URL lands on the demo rather than a 404. */
  @Get()
  @Redirect()
  root() {
    return { url: '/demo', statusCode: 302 };
  }

  @Get('demo')
  serve(@Res({ passthrough: true }) res: Response): string {
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': this.page.csp,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-cache',
    });
    return this.page.html;
  }
}
