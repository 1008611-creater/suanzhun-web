import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { CSP } from './serve.mjs';

const root = resolve(import.meta.dirname, '..');
const required = [
  '.nvmrc',
  'index.html',
  'paipan.html',
  '404.html',
  'assets/tokens.css',
  'assets/site.css',
  'app.js',
  'analysis.js',
  'bazi.js',
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-192.png',
  'assets/icon-maskable-512.png',
  'site.webmanifest',
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
  'docs/adr/0007-design-tokens-and-inline-style-ban.md',
  'docs/adr/0008-doc-numbers-locked-to-code.md',
  'docs/adr/0009-icon-family-and-pwa-manifest.md',
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
const notFound = readFileSync(resolve(root, '404.html'), 'utf8');
const nginx = readFileSync(resolve(root, 'deploy/nginx.conf'), 'utf8');
const serve = readFileSync(resolve(root, 'scripts/serve.mjs'), 'utf8');
const siteCss = readFileSync(resolve(root, 'assets/site.css'), 'utf8');
const tokensCss = readFileSync(resolve(root, 'assets/tokens.css'), 'utf8');

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
const hasNextStepCard =
  /'wx-id',\s*'ANS_0912'/u.test(appJs) && /复制微信号/u.test(appJs) && /card\('下一步',\s*'next'\)/u.test(appJs);
/* 打印样式与减动效样式现在都由 assets/site.css 单点拥有，页面里不再各自复制。 */
const hasPrintStyles = /@media print/u.test(siteCss);
const hasReducedMotion = /prefers-reduced-motion/u.test(siteCss);
/** 取出一个 CSS 块（从匹配到的 '{' 起按大括号配对），用于在 media 查询内部断言。 */
function cssBlock(src, headerPattern) {
  const m = src.match(headerPattern);
  if (!m) return '';
  const open = src.indexOf('{', m.index);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}
/**
 * DESIGN.md 承诺了「网感纹理」与「环境星座漂移」，但代码里长期只有一条 fadeUp，
 * 文档与实现各说各话。这里锁死四件事：纹理层存在、漂移动效存在、
 * 两者都尊重系统减少动效、打印时撤掉纹理。
 * 纹理必须是纯 CSS 渐变——CSP 是 img-src 'self'，外链图与 data-URI 都会被挡。
 */
const reducedMotionCss = cssBlock(siteCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
const printCss = cssBlock(siteCss, /@media\s+print/u);
const hasTextureLayer = /body::before\s*\{/u.test(siteCss) && /radial-gradient/u.test(siteCss);
const hasAmbientDrift = /@keyframes\s+ambientDrift\s*\{/u.test(siteCss) && /body::after\s*\{/u.test(siteCss);
const motionRespectsReducedMotion =
  /animation:\s*none\s*!important/u.test(reducedMotionCss) &&
  /animation-delay:\s*0ms\s*!important/u.test(reducedMotionCss);
const textureHiddenInPrint = /body::before[\s\S]{0,80}?body::after\s*\{[\s\S]*?display:\s*none\s*!important/u.test(
  printCss
);
/* 样式与脚本都不能内联：CSP 的 style-src/script-src 都是 'self'。 */
const hasNoInlineStyle = !/<style\b/iu.test(home + paipan) && !/\sstyle\s*=/iu.test(home + paipan);
const pagesLinkTokens = /assets\/tokens\.css/u.test(home) && /assets\/tokens\.css/u.test(paipan);
const pagesLinkSite = /assets\/site\.css/u.test(home) && /assets\/site\.css/u.test(paipan);
const tokensHaveRoot = /:root\s*\{/u.test(tokensCss);

/**
 * 三页的品牌主题色应当一致：手机浏览器地址栏会用它着色。
 * 曾经只有首页和排盘页写了 theme-color，404 页漏掉，手机上会闪出另一种底色。
 */
const themeColors = [home, paipan, notFound].map(
  (html) => (html.match(/name=["']theme-color["'][^>]*content=["']([^"']+)["']/iu) || [])[1]
);
const themeColorConsistent = themeColors.every((c) => c && c === themeColors[0]);

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

/**
 * 焦点可见性：表单控件曾写死 outline: none，优先级高于全局 :focus-visible，
 * 键盘 Tab 到 13 个输入控件时看不到任何焦点框（WCAG 2.4.7 不达标）。
 * 这里禁止任何规则再关掉 outline，并要求 :focus-visible 规则存在。
 */
/* 先剥掉 CSS 注释，否则「不要写 outline: none」这类说明文字会被当成真实声明误判。 */
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//gu, '');
const focusRingOwned =
  /:focus-visible\s*\{/u.test(siteCss) && !/outline\s*:\s*none/iu.test(stripCssComments(siteCss + tokensCss));

/**
 * 表单不是原生 <form>，填完最后一个字段按回车曾经毫无反应。
 * 这里锁死「回车提交」监听存在，且跳过输入法合成中的按键——
 * 中文输入用回车确认候选词，不跳过的话打字打一半就会触发排盘。
 */
const enterSubmits = /addEventListener\(\s*['"]keydown['"]/u.test(appJs) && /bindEnterSubmit/u.test(appJs);
const enterSkipsComposition = /isComposing/u.test(appJs) && /keyCode\s*===\s*229/u.test(appJs);

/**
 * 报告在手机上接近一万像素高（12 块卡片），却没有目录也没有回到顶部。
 * 这里锁死两条导航入口：报告内目录（带锚点）与回到顶部按钮。
 */
const hasReportToc =
  /'toc'/u.test(appJs) && /报告目录/u.test(appJs) && /toc-list/u.test(appJs) && /a\.href\s*=\s*'#'/u.test(appJs);
const hasBackToTop = /回到顶部/u.test(appJs);
/**
 * 「重置」曾经只清掉姓名与日期，出生地仍停在用户上次选的唐山，性别、时制
 * 与合婚面板也都没复位。这里锁死重置走统一入口且覆盖出生地、合婚面板。
 */
/** 取出某个函数的函数体（按大括号配对），只在这个范围内断言，避免误匹配别处的调用。 */
function functionBody(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}
const resetBody = functionBody(appJs, 'resetForm');
/** 重置必须同时收起「合婚对象」面板与结果区，所以体内至少两处 hidden = true。 */
const resetHiddenCount = (resetBody.match(/hidden\s*=\s*true/gu) || []).length;
const resetFullyResets =
  resetBody.includes('partnerBox') &&
  /applyDefaultCity\(\)/u.test(resetBody) &&
  resetHiddenCount >= 2 &&
  /resetForm\(\)/u.test(appJs);
/**
 * prefers-reduced-motion 只关得掉 CSS animation/transition，管不到 JS 的
 * scrollIntoView。这里锁死滚动行为经由 matchMedia 判断，不再写死 smooth。
 */
const scrollHonorsReducedMotion =
  /prefers-reduced-motion:\s*reduce/u.test(appJs) &&
  /matchMedia/u.test(appJs) &&
  /function\s+scrollToEl/u.test(appJs) &&
  /behavior:\s*scrollBehavior\(\)/u.test(appJs) &&
  /\?\s*'auto'\s*:\s*'smooth'/u.test(functionBody(appJs, 'scrollBehavior')) &&
  !/scrollIntoView\(\{\s*behavior:\s*'smooth'/u.test(appJs);

/**
 * 可读名称：表单控件已有专门检查，这里补上链接与按钮——
 * 只有图标没有文字、又没有 aria-label 的控件，读屏软件只会念出「按钮」。
 */
function unnamedControls(html) {
  const missing = [];
  for (const m of html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/giu)) {
    const attrs = m[2];
    const inner = m[3]
      .replace(/<[^>]*>/gu, '')
      .replace(/\s+/gu, ' ')
      .trim();
    if (inner || /\baria-label(?:ledby)?\s*=/iu.test(attrs) || /\btitle\s*=/iu.test(attrs)) continue;
    missing.push(`<${m[1].toLowerCase()}${attrs}>`);
  }
  return missing;
}
const unnamed = [...unnamedControls(home), ...unnamedControls(paipan), ...unnamedControls(notFound)];

/**
 * 性能预算：PRD 的「首屏 1 秒内显示主要内容」此前没有任何度量，只能靠人记得去量。
 * 这里把关键路径与脚本总量都换算成 gzip 字节数并设上限：
 * 首屏关键资源 = 页面 HTML + 两个外链样式表；脚本总量 = 三个脚本之和。
 */
const gzBytes = (file) => gzipSync(readFileSync(resolve(root, file))).length;
const CRITICAL_BUDGET = 20 * 1024;
const SCRIPT_BUDGET = 48 * 1024;
const criticalGz = Math.max(
  gzBytes('index.html') + gzBytes('assets/tokens.css') + gzBytes('assets/site.css'),
  gzBytes('paipan.html') + gzBytes('assets/tokens.css') + gzBytes('assets/site.css')
);
const scriptGz = gzBytes('app.js') + gzBytes('bazi.js') + gzBytes('analysis.js');

/**
 * Node 版本此前只写在 package.json 的 engines 里，本地用别的 Node 时表现会不一致。
 * .nvmrc 给出单一可执行版本，并与 engines 的主版本锁死。
 */
const nvmrc = existsSync(resolve(root, '.nvmrc')) ? readFileSync(resolve(root, '.nvmrc'), 'utf8').trim() : '';
const pkgEngines = (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).engines || {}).node || '';
const nvmrcMatchesEngines = nvmrc !== '' && nvmrc === (pkgEngines.match(/\d+/u) || [])[0];

/**
 * 文档里写死的「契约数」「上线文件数」会随代码演进而漂移：
 * README 曾写 23 项契约、Runbook 曾写 11 个上线文件，实际早已不是。
 * 光靠人记得改文档不成立，这里把文档声称的数字与代码里的真实数字锁在一起。
 */
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
const runbook = readFileSync(resolve(root, 'docs/RELEASE-RUNBOOK.md'), 'utf8');
const deployJs = readFileSync(resolve(root, 'scripts/deploy.mjs'), 'utf8');
const deployFilesBlock = deployJs.match(/const FILES = \[([\s\S]*?)\];/u);
const deployFiles = deployFilesBlock ? [...deployFilesBlock[1].matchAll(/'([^']+)'/gu)].map((m) => m[1]) : [];
const deployUrlsBlock = deployJs.match(/const URLS = \[([\s\S]*?)\];/u);
const deployUrls = deployUrlsBlock ? [...deployUrlsBlock[1].matchAll(/'([^']+)'/gu)].map((m) => m[1]) : [];
const readmeClaimsChecks = Number((readme.match(/包含\s*(\d+)\s*项契约/u) || [])[1]);
const runbookClaimsFiles = Number((runbook.match(/计算\s*(\d+)\s*个上线文件/u) || [])[1]);

/**
 * 图标族与 PWA 清单：favicon.ico 是浏览器与爬虫的默认请求地址，
 * 缺失会在每个页面的网络面板里留下 404；site.webmanifest 让手机能「添加到主屏幕」。
 * 这两类文件由 scripts/build-assets.mjs 生成，容易生成后忘记接线，这里锁死端到端链路。
 */
const manifestText = readFileSync(resolve(root, 'site.webmanifest'), 'utf8');
let manifest;
try {
  manifest = JSON.parse(manifestText);
} catch {
  manifest = null;
}
const manifestValid =
  !!manifest && typeof manifest.start_url === 'string' && Array.isArray(manifest.icons) && manifest.icons.length > 0;
const pagesLinkManifest =
  /rel=["']manifest["'][^>]+site\.webmanifest/iu.test(home) &&
  /rel=["']manifest["'][^>]+site\.webmanifest/iu.test(paipan) &&
  /rel=["']manifest["'][^>]+site\.webmanifest/iu.test(notFound);
const icoBytes = readFileSync(resolve(root, 'favicon.ico'));
const icoValid = icoBytes.length > 22 && icoBytes.readUInt16LE(0) === 0 && icoBytes.readUInt16LE(2) === 1;
const icoIconCount = icoValid ? icoBytes.readUInt16LE(4) : 0;
const newAssets = [
  'favicon.ico',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-192.png',
  'assets/icon-maskable-512.png',
  'site.webmanifest',
];
const deployCoversNewAssets =
  newAssets.every((f) => deployFiles.includes(f)) && newAssets.every((f) => deployUrls.includes('/' + f));

const checks = [
  ['home links to paipan', /href=["']paipan\.html/iu.test(home)],
  ['paipan loads bazi', /<script[^>]+src=["']bazi\.js/iu.test(paipan)],
  ['paipan loads app', /<script[^>]+src=["']app\.js/iu.test(paipan)],
  ['reduced motion exists', hasReducedMotion],
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
  [
    '排盘结果区可接收键盘焦点且渲染后自动聚焦',
    /id=["']result["'][^>]*tabindex=["']-1["']/iu.test(paipan) && /box\.focus\(\{\s*preventScroll/u.test(appJs),
  ],
  ['文档索引指向的文件都存在', indexMissing.length === 0],
  ['所有 ADR 都登记进索引', adrUnlisted.length === 0],
  ['CSP 在 Nginx 与本地预览逐字一致', cspAllMatchServe],
  ['每个设置缓存的 location 都带 CSP（Nginx add_header 不继承）', cspLocations >= cacheLocations && cacheLocations > 0],
  ['姓名等输入经 esc() 转义', hasEscHelper && escapesUserName && escapesUnknown && escapesNotes],
  ['流年窗口跟随当前年份而非写死', liuNianWindowFollowsNow],
  ['流年年数由调用方传入且引擎有下限', liuNianYearsPassed && engineHasLnYears],
  ['结果页有下一步转化卡片', hasNextStepCard],
  ['结果页有打印样式', hasPrintStyles],
  ['页面无内联样式（CSP style-src self）', hasNoInlineStyle],
  ['页面外链 tokens.css 与 site.css', pagesLinkTokens && pagesLinkSite],
  ['tokens.css 定义 :root 令牌块', tokensHaveRoot],
  ['行动建议四块都接进结果页且引擎有导出', adviceWired],
  ['结果页包含事业/婚姻/八宅落地/姓名优选标题', adviceRendered],
  ['事业与婚姻接收 nowYear 而非读系统时间', adviceTakesNowYear && !engineReadsClock],
  ['行动建议带免责说明', adviceHasDisclaimer],
  ['页面声明 CSP 兼容结构（无内联脚本）', !/<script(?![^>]*\bsrc=)[^>]*>/iu.test(home + paipan)],
  ['三页 theme-color 一致', themeColorConsistent],
  ['三页都外链 site.webmanifest', pagesLinkManifest],
  ['site.webmanifest 可解析且含 start_url 与 icons', manifestValid],
  ['favicon.ico 存在且 ICO 头合法', icoValid && icoIconCount >= 1],
  ['deploy.mjs 的 FILES 与 URLS 覆盖图标族与清单', deployCoversNewAssets],
  [
    '表单校验用页面内提示而非 alert',
    !/alert\(/u.test(appJs) && /formAlert/u.test(appJs) && /role=["']alert["']/iu.test(paipan),
  ],
  ['焦点环不被 outline:none 覆盖', focusRingOwned],
  ['链接与按钮都有可读名称', unnamed.length === 0],
  ['404 页也声明中文语言', /<html[^>]+lang=["']zh-CN["']/iu.test(notFound)],
  ['首屏关键资源 gzip 预算内', criticalGz <= CRITICAL_BUDGET],
  ['脚本总量 gzip 预算内', scriptGz <= SCRIPT_BUDGET],
  ['.nvmrc 与 package.json engines 主版本一致', nvmrcMatchesEngines],
  ['填完表单按回车可提交', enterSubmits],
  ['回车提交跳过输入法合成中的按键', enterSkipsComposition],
  ['报告有目录与回到顶部入口', hasReportToc && hasBackToTop],
  ['重置回到初始状态（含出生地与合婚面板）', resetFullyResets],
  ['滚动行为尊重系统减少动效设置', scrollHonorsReducedMotion],
  ['纸面网感纹理层存在且为纯 CSS 渐变', hasTextureLayer],
  ['环境漂移动效存在', hasAmbientDrift],
  ['纹理与漂移都尊重系统减少动效设置', motionRespectsReducedMotion],
  ['打印时撤掉纹理与漂移层', textureHiddenInPrint],
];
/* 这三项依赖最终总数，先算好总数再追加，避免在数组字面量里引用自身。 */
const totalChecks = checks.length + 3;
checks.push(['README 声称的契约数与实际一致', readmeClaimsChecks === totalChecks]);
checks.push(['发布文档声称的上线文件数与 deploy.mjs 一致', runbookClaimsFiles === deployFiles.length]);
checks.push([
  '发布文档的上线文件清单覆盖 deploy.mjs 的每个文件',
  deployFiles.every((f) => runbook.includes('`' + f + '`')),
]);
const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  process.stderr.write(`[verify] 契约检查未通过（${failures.length} 项）：\n`);
  for (const name of failures) process.stderr.write(`  - ${name}\n`);
  process.exit(1);
}
console.log(`verify ok: ${required.length} required files, ${checks.length} contract checks`);
