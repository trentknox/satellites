import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { buildStaticSite, root, staticFiles } from '../scripts/build.mjs';

test('OFF production build preserves all three HTML pages and public static files byte for byte', async t => {
  const output = await mkdtemp(join(tmpdir(), 'satellites-off-build-test-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const result = await buildStaticSite(output);
  assert.equal(result.collectionEnabled, false);
  for (const name of staticFiles) {
    const source = await readFile(join(root, name));
    const built = await readFile(join(output, name));
    assert.deepEqual(built, source, name);
    if (name.endsWith('.html')) {
      assert.equal(built.toString().includes('/assets/public-analytics.js'), false);
      assert.equal(built.toString().includes('/_vercel/insights/'), false);
    }
  }
  assert.deepEqual((await readdir(output)).sort(), ['assets', 'ccm', 'hov', 'index.html', 'llms.txt', 'sitemap.xml']);
  assert.deepEqual(await readdir(join(output, 'assets')), ['public-analytics.js']);
  assert.deepEqual((await readdir(join(output, 'hov'))).sort(), ['index.html', 'llms.txt']);
  assert.deepEqual((await readdir(join(output, 'ccm'))).sort(), ['index.html', 'llms.txt']);
  const calls = [];
  const forbidden = new Proxy({}, { get(_, name) { calls.push(String(name)); throw Error('OFF must not inspect browser or start network'); } });
  vm.runInNewContext(await readFile(join(output, result.asset), 'utf8'), {
    window: forbidden, document: forbidden, navigator: forbidden,
    fetch: () => { calls.push('fetch'); throw Error('Network forbidden'); },
    XMLHttpRequest: () => { calls.push('xhr'); throw Error('Network forbidden'); },
  });
  assert.deepEqual(calls, []);
});

test('candidate build output retains existing clean URL routes and security headers', async () => {
  const config = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
  assert.equal(config.cleanUrls, true);
  assert.equal(config.trailingSlash, false);
  assert.deepEqual(config.rewrites, [
    { source: '/hov', destination: '/hov/index.html' },
    { source: '/ccm', destination: '/ccm/index.html' },
  ]);
  const headers = config.headers.find(rule => rule.source === '/(.*)').headers;
  assert.equal(headers.find(h => h.key === 'X-Content-Type-Options').value, 'nosniff');
  assert.equal(headers.find(h => h.key === 'Referrer-Policy').value, 'strict-origin-when-cross-origin');
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
});
