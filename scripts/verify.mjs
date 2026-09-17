import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { CSP } from './serve.mjs';

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
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/INDEX.md',
  'docs/adr/0001-cache-headers-single-owner.md',
  'docs/adr/0002-secret-scan-before-push.md',
  'docs/adr/0003-result-contrast-token-contract.md',
  'docs/adr/0004-csp-single-owner-and-input-escaping.md',
  'docs/adr/0005-liunian-window-and-result-next-step.md',
  'docs/adr/0006-action-advice-engine.md',
  'scripts/secret-scan.mjs',
  'scripts/check-contrast.mjs',
  'tests/preview.test.mjs',
  '.github/workflows/ci.yml',
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
const nginx = readFileSync(resolve(root, 'deploy/nginx.conf'), 'utf8');
const serve = readFileSync(resolve(root, 'scripts/serve.mjs'), 'utf8');

/**
 * 无障碍契约：读屏软件依赖 label 与控件的显式关联。
 * 只写 <label>姓名</label> 而不写 for/id，读屏时字段是「未命名」的。
 */
function unlabeledControls(html) {
  const labelled = new Set([...html.matchAll(/<label[^>]*\sfor=["']([^"']+)["']/giu)].map((m) => m[1]));
  const missing = [];
  for (const match of html.matchAll(/<(input|select|textarea)\b[^>]*>/giu)) {
    const tag = match[0];
    if (/type=["'](?:hidden|submit|button)["']/iu.test(tag)) continue;
    const id = (tag.match(/\bid=["']([^"']+)["']/iu) || [])[1];
    const hasAria = /\baria-label(?:ledby)?=/iu.test(tag);
    if (!hasAria && (!id || !labelled.has(id))) missing.push(id || tag.slice(0, 40));
  }
  return missing;
}

const unlabeled = [...unlabeledControls(home), ...unlabeledControls(paipan)];

/**
 * 索引一致性（对应工作区契约 S-013）：docs/INDEX.md 里写的骨架路径必须真实存在，
 * 反过来说，新增文档也必须登记，避免「文件在但没人知道」。
 */
const INDEX_FILE = 'docs/INDEX.md';
const indexText = readFileSync(resolve(root, INDEX_FILE), 'utf8');
const indexedPaths = [...indexText.matchAll(/`([^`\n]+)`/gu)]
  .map((m) => m[1].trim().replace(/\\/g, '/'))
  .filter((p) => /^(docs|scripts|tests|\.github)\//u.test(p) && !p.includes('*') && !p.includes(' '));
const indexMissing = indexedPaths.filter((p) => !existsSync(resolve(root, p)));

const adrFiles = readdirSync(resolve(root, 'docs/adr'))
  .filter((name) => /^\d{4}-.+\.md$/u.test(name))
  .map((name) => `docs/adr/${name}`);
const adrUnlisted = adrFiles.filter((rel) => !indexText.includes(rel) && !indexText.includes(rel.split('/').pop()));

/**
 * 缓存策略同时写在 Nginx 配置和本地预览服务器里。两处一旦漂移，
 * 「本地正常、线上异常」就会重新出现，所以在这里锁死关键取值。
 */
const CACHE_POLICY = [
  ['no-cache', /html\|js\|css/iu, /html\|js\|css/iu],
  ['一周缓存', /svg\|png\|jpg\|jpeg\|webp\|woff2/iu, /svg\|png\|jpg\|jpeg\|webp\|woff2/iu],
];
const cacheDrift = CACHE_POLICY.filter(
  ([, nginxPattern, servePattern]) => !nginxPattern.test(nginx) || !servePattern.test(serve)
).map(([name]) => name);
const hasLongCache = /max-age=604800/u.test(nginx) && /max-age=604800/u.test(serve);
const hasShortCache = /max-age=3600/u.test(nginx) && /max-age=3600/u.test(serve);

/**
 * CSP 同时写在 Nginx 配置和本地预览服务器里。两处一旦漂移，
 * 「本地通过、线上失效」就会重新出现，所以在这里逐字锁死。
 * 另外 Nginx 的 add_header 不继承：每个设置了 Cache-Control 的 location
 * 都必须自己再写一遍 CSP，否则 HTML/JS/CSS 这些最需要 CSP 的响应反而没有。
 */
const cspValues = [...nginx.matchAll(/add_header\s+Content-Security-Policy\s+([^;\n]+?)\s+always;/giu)].map((m) =>
  m[1].trim()
);
const cspFromVar = [...nginx.matchAll(/set\s+\$csp\s+"([^"]+)"/giu)].map((m) => m[1]);
const cspLiterals = cspValues.filter((v) => v !== '$csp');
const cspAllMatchServe = cspLiterals.every((v) => v === CSP) && cspFromVar.length === 1 && cspFromVar[0] === CSP;
const cacheLocations = (nginx.match(/location[^{]*\{[^}]*add_header\s+Cache-Control/giu) || []).length;
const cspLocations = (nginx.match(/location[^{]*\{[^}]*add_header\s+Content-Security-Policy/giu) || []).length;

/**
 * 姓名等输入会拼进 innerHTML，必须经过转义。
 * 这里锁定 esc() 辅助函数存在，且关键拼接点都用了它，防止有人删掉转义。
 */
const appJs = readFileSync(resolve(root, 'app.js'), 'utf8');
const hasEscHelper = /function\s+esc\s*\(/u.test(appJs);
const escapesUserName = /kv\(\s*['"]姓名['"]\s*,\s*esc\(/u.test(appJs);
const escapesUnknown = /esc\(\(n5\.unknown/u.test(appJs);
const escapesNotes = /n5\.notes\.map\(esc\)/u.test(appJs);

/**
 * 流年窗口曾经写死成 2026–2035：1930/1965 年生人排出来的流年表整块空白。
 * 现在窗口跟着当前年份走，年数由调用方传入；这里锁死两端，防止回退。
 */
const liuNianWindowFollowsNow = /var\s+lnStart\s*=\s*nowYear/u.test(appJs) && !/2026\s*[–-]\s*2035/u.test(appJs);
const liuNianYearsPassed = /liuNianYears/u.test(appJs);
const engineHasLnYears = /function\s+lnYears\s*\(/u.test(readFileSync(resolve(root, 'bazi.js'), 'utf8'));

/**
 * 结果页在最高意图时刻原本没有任何下一步动作（整页一个 <a> 都没有）。
 * 这里锁死收尾卡片与联系方式，防止转化入口被删掉。
 */
const hasNextStepCard = /'wx-id',\s*'ANS_0912'/u.test(appJs) && /复制微信号/u.test(appJs) && /card next/u.test(appJs);
const hasPrintStyles = /@media print/u.test(paipan);

/**
 * 行动建议引擎：事业、婚姻、八宅落地、姓名优选四块都要真的接进结果页。
 * 引擎新增了函数但界面没调用，是「写了但用户看不到」的典型漂移，这里锁死两端。
 */
const analysisJs = readFileSync(resolve(root, 'analysis.js'), 'utf8');
const adviceCalls = ['career', 'marriage', 'layoutPlan', 'nameAdvise'].map((fn) => ({
  fn,
  used: new RegExp(`A\\.${fn}\\(`, 'u').test(appJs),
  exported: new RegExp(`\\b${fn}:\\s*${fn}\\b`, 'u').test(analysisJs),
}));
const adviceCards = [
  ['事业与财运方向', /'事业与财运方向'/u],
  ['婚姻与感情', /'婚姻与感情'/u],
  ['八宅落地布局', /'八宅落地布局'/u],
  ['姓名优选建议', /'姓名优选建议'/u],
];
const adviceWired = adviceCalls.every((x) => x.used && x.exported);
const adviceRendered = adviceCards.every(([, re]) => re.test(appJs));
/** 事业与婚姻必须接收 nowYear，不能在计算模块里读系统时间（可复现性约束）。 */
const adviceTakesNowYear = /A\.career\(p,\s*nowYear\)/u.test(appJs) && /A\.marriage\(p,\s*nowYear\)/u.test(appJs);
const engineReadsClock = /new Date\(|Date\.now\(/u.test(analysisJs);
const adviceHasDisclaimer = /不构成择业或投资建议/u.test(appJs) && /不做「正缘」承诺/u.test(appJs);

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
  ['缓存策略在 Nginx 与本地预览一致', cacheDrift.length === 0],
  ['图片与字体为长缓存', hasLongCache],
  ['robots 与 sitemap 为一小时缓存', hasShortCache],
  ['Nginx 只保留一处缓存声明', !/@html|@staticAssets/u.test(nginx)],
  ['Nginx 提供 gzip', /gzip\s+on;/u.test(nginx) && /gzip_vary\s+on;/u.test(nginx)],
  ['Nginx 有 404 兜底页', /error_page\s+404\s+\/404\.html/u.test(nginx)],
  ['所有表单控件都有可读名称', unlabeled.length === 0],
  ['页面声明中文语言', /<html[^>]+lang=["']zh-CN["']/iu.test(home) && /<html[^>]+lang=["']zh-CN["']/iu.test(paipan)],
  ['页面各有一个 h1', (home.match(/<h1\b/giu) || []).length === 1 && (paipan.match(/<h1\b/giu) || []).length === 1],
  ['排盘结果区对读屏可播报', /id=["']result["'][^>]*aria-live=["']polite["']/iu.test(paipan)],
  ['文档索引指向的文件都存在', indexMissing.length === 0],
  ['所有 ADR 都登记进索引', adrUnlisted.length === 0],
  ['CSP 在 Nginx 与本地预览逐字一致', cspAllMatchServe],
  ['每个设置缓存的 location 都带 CSP（Nginx add_header 不继承）', cspLocations >= cacheLocations && cacheLocations > 0],
  ['姓名等输入经 esc() 转义', hasEscHelper && escapesUserName && escapesUnknown && escapesNotes],
  ['流年窗口跟随当前年份而非写死', liuNianWindowFollowsNow],
  ['流年年数由调用方传入且引擎有下限', liuNianYearsPassed && engineHasLnYears],
  ['结果页有下一步转化卡片', hasNextStepCard],
  ['结果页有打印样式', hasPrintStyles],
  ['行动建议四块都接进结果页且引擎有导出', adviceWired],
  ['结果页包含事业/婚姻/八宅落地/姓名优选标题', adviceRendered],
  ['事业与婚姻接收 nowYear 而非读系统时间', adviceTakesNowYear && !engineReadsClock],
  ['行动建议带免责说明', adviceHasDisclaimer],
  ['页面声明 CSP 兼容结构（无内联脚本）', !/<script(?![^>]*\bsrc=)[^>]*>/iu.test(home + paipan)],
];
const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  process.stderr.write(`[verify] 契约检查未通过（${failures.length} 项）：\n`);
  for (const name of failures) process.stderr.write(`  - ${name}\n`);
  process.exit(1);
}
console.log(`verify ok: ${required.length} required files, ${checks.length} contract checks`);
