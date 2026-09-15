import { createHash } from 'crypto';
import { Script } from 'vm';
import { buildDemoPage, loadDemoPage } from './demo-page';

const policyHash = (content: string) =>
  `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`;

function page(script: string, style: string, eol = '\n'): string {
  return [
    '<!doctype html>',
    `<style>${style}</style>`,
    `<script>${script}</script>`,
  ].join(eol);
}

describe('buildDemoPage', () => {
  it('pins the inline script and style by hash and denies everything else', () => {
    const { csp } = buildDemoPage(page('run()', 'body{}'));

    expect(csp).toContain(`script-src ${policyHash('run()')}`);
    expect(csp).toContain(`style-src ${policyHash('body{}')}`);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
  });

  it('hashes the LF-normalised text a browser hashes, even from a CRLF checkout', () => {
    const { html, csp } = buildDemoPage(
      page('const a = 1;\r\nrun(a);\r\n', 'body{}', '\r\n'),
    );

    expect(html).not.toContain('\r');
    expect(csp).toContain(
      `script-src ${policyHash('const a = 1;\nrun(a);\n')}`,
    );
    // Hashing the raw CRLF bytes would have produced this — and the browser
    // would then have refused to run the page's own script.
    expect(csp).not.toContain(policyHash('const a = 1;\r\nrun(a);\r\n'));
  });

  it('refuses a page whose inline blocks it cannot pin unambiguously', () => {
    expect(() => buildDemoPage('<style>x</style>')).toThrow(
      'exactly one inline <script> block, found 0',
    );
    expect(() =>
      buildDemoPage('<style>x</style><script>a()</script><script>b()</script>'),
    ).toThrow('exactly one inline <script> block, found 2');
  });

  it('accepts the real demo page, and its inline script compiles', () => {
    const { html, csp } = loadDemoPage();

    expect(html).toContain('<title>');
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/]+=*'/);

    // tsc and eslint never see this script, and nothing else executes it. A
    // syntax error would leave the page rendered but inert, with every check
    // still green. Compile it — without running it — so CI catches that.
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    expect(() => new Script(script)).not.toThrow();
  });
});
