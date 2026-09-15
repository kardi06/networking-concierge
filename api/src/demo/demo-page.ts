import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface DemoPage {
  html: string;
  csp: string;
}

/**
 * Prepares the demo page for serving: normalises line endings, then pins its
 * single inline `<script>` and `<style>` block by hash in a
 * Content-Security-Policy.
 *
 * The page renders untrusted text — attendee bios, model output, and prompt-
 * injection attempts sent on purpose. It never uses innerHTML, and this policy
 * is the second layer: even if markup did slip into the DOM, no script except
 * the page's own could run and nothing could be sent anywhere but this origin.
 *
 * LF normalisation is load-bearing, not cosmetic. Browsers normalise CRLF to
 * LF while parsing HTML, before hashing an inline block for CSP. A checkout
 * with `core.autocrlf` — the Windows default — stores this file with CRLF, and
 * hashing those bytes as-is yields a policy that blocks the page's own script.
 */
export function buildDemoPage(rawHtml: string): DemoPage {
  const html = rawHtml.replace(/\r\n?/g, '\n');
  const script = onlyInlineBlock(html, 'script');
  const style = onlyInlineBlock(html, 'style');

  const csp = [
    "default-src 'none'",
    `script-src '${sha256(script)}'`,
    `style-src '${sha256(style)}'`,
    // The page only ever talks to this API.
    "connect-src 'self'",
    // The favicon is an inline data: SVG.
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  return { html, csp };
}

/**
 * `nest build` copies demo.html next to the compiled controller (see the
 * `assets` entry in nest-cli.json), so `__dirname` resolves in both `src/`
 * under ts-jest and `dist/` in the production image.
 */
export function loadDemoPage(dir: string = __dirname): DemoPage {
  return buildDemoPage(readFileSync(join(dir, 'demo.html'), 'utf8'));
}

function onlyInlineBlock(html: string, tag: 'script' | 'style'): string {
  const blocks = [
    ...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')),
  ];
  if (blocks.length !== 1) {
    throw new Error(
      `demo.html must contain exactly one inline <${tag}> block, found ${blocks.length}`,
    );
  }
  return blocks[0][1];
}

function sha256(content: string): string {
  return `sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}`;
}
