import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { COLLECTION_ENABLED } from '../src/public-analytics.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const staticFiles = [
  'index.html', 'hov/index.html', 'ccm/index.html',
  'llms.txt', 'hov/llms.txt', 'ccm/llms.txt', 'sitemap.xml',
];
const htmlFiles = new Set(['index.html', 'hov/index.html', 'ccm/index.html']);
const mount = '<script defer src="/assets/public-analytics.js"></script>';

export async function buildStaticSite(output = join(root, 'dist')) {
  const sdk = JSON.parse(await readFile(join(root, 'node_modules/@vercel/analytics/package.json'), 'utf8'));
  if (sdk.version !== '2.0.1') throw new Error('Expected the reviewed @vercel/analytics 2.0.1');
  await mkdir(join(output, 'assets'), { recursive: true });
  await build({
    absWorkingDir: root, entryPoints: ['src/analytics-entry.mjs'],
    outfile: join(output, 'assets/public-analytics.js'), bundle: true,
    format: 'iife', platform: 'browser', target: 'es2022',
    minify: false, sourcemap: false,
  });
  for (const name of staticFiles) {
    let body = await readFile(join(root, name));
    if (COLLECTION_ENABLED && htmlFiles.has(name)) {
      const html = body.toString('utf8');
      if (!html.includes('</body>')) throw new Error(`Missing body closing tag: ${name}`);
      body = Buffer.from(html.replace('</body>', `${mount}\n</body>`));
    }
    await mkdir(dirname(join(output, name)), { recursive: true });
    await writeFile(join(output, name), body);
  }
  return { collectionEnabled: COLLECTION_ENABLED, staticFiles, asset: 'assets/public-analytics.js' };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(await buildStaticSite()));
}
