import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const required = [
  'index.html',
  'paipan.html',
  '404.html',
  'app.js',
  'analysis.js',
  'bazi.js',
  'favicon.svg',
  'apple-touch-icon.png',
  'og-image.png',
  'robots.txt',
  'sitemap.xml',
  'PRODUCT.md',
  'DESIGN.md',
  'deploy/nginx.conf',
  'deploy/docker-compose.yml',
];
const missing = required.filter((file) => !existsSync(resolve(root, file)));
if (missing.length) throw new Error(`Missing required files: ${missing.join(', ')}`);

for (const file of ['app.js', 'analysis.js', 'bazi.js']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${file} syntax check failed:\n${result.stderr}`);
}

const home = readFileSync(resolve(root, 'index.html'), 'utf8');
const paipan = readFileSync(resolve(root, 'paipan.html'), 'utf8');
const checks = [
  ['home links to paipan', /href=["']paipan\.html/iu.test(home)],
  ['paipan loads bazi', /<script[^>]+src=["']bazi\.js/iu.test(paipan)],
  ['paipan loads app', /<script[^>]+src=["']app\.js/iu.test(paipan)],
  ['reduced motion exists', /prefers-reduced-motion/iu.test(home) && /prefers-reduced-motion/iu.test(paipan)],
  ['primary form action exists', /id=["']go["']/iu.test(paipan)],
  ['home declares canonical', /rel=["']canonical["'][^>]+https:\/\/suanzhun\.cauai\.fun\//iu.test(home)],
  [
    'paipan declares canonical',
    /rel=["']canonical["'][^>]+https:\/\/suanzhun\.cauai\.fun\/paipan\.html/iu.test(paipan),
  ],
  ['home declares description', /name=["']description["'][^>]+content=["'][^"']{20,}/iu.test(home)],
  ['paipan declares description', /name=["']description["'][^>]+content=["'][^"']{20,}/iu.test(paipan)],
  ['home declares og image', /property=["']og:image["'][^>]+og-image\.png/iu.test(home)],
  [
    'pages declare favicon',
    /rel=["']icon["'][^>]+favicon\.svg/iu.test(home) && /rel=["']icon["'][^>]+favicon\.svg/iu.test(paipan),
  ],
];
const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) throw new Error(`Contract checks failed: ${failures.join(', ')}`);
console.log(`verify ok: ${required.length} required files, ${checks.length} contract checks`);
