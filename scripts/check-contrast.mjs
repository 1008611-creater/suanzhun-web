/**
 * scripts/check-contrast.mjs —— 对比度契约
 *
 * 结果页曾在深色芯片上出现「深底深字」（伏位 1.26:1）、在浅粉卡片上
 * 用五行原色直接当文字色（金 1.56:1）等 20+ 处 WCAG AA 不达标。
 * 这里把「令牌取值 → 最坏底色 → 对比度」写成断言，改坏任何一个值都会挡在合并前。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/* ---------- oklch / rgb -> WCAG 对比度 ---------- */
function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.max(x, 0) ** (1 / 2.4) - 0.055));
}
function parseColor(value) {
  const raw = String(value).trim();
  let m = raw.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)(%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/i);
  if (m) {
    const L = m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    const C = m[4] ? parseFloat(m[3]) * 0.004 : parseFloat(m[3]);
    const alpha = m[6] == null ? 1 : m[7] ? parseFloat(m[6]) / 100 : parseFloat(m[6]);
    return { rgb: oklchToRgb(L, C, parseFloat(m[5])), a: alpha };
  }
  m = raw.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255), a: 1 };
  }
  return null;
}
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance({ rgb }) {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/** 把半透明前景合成到不透明底色上 */
function composite(fg, bg) {
  return { rgb: fg.rgb.map((c, i) => c * fg.a + bg.rgb[i] * (1 - fg.a)), a: 1 };
}

/* ---------- 读取令牌 ---------- */
/* 令牌的唯一归属是 assets/tokens.css。以前三页各自复制一份 :root，改一处漏两处，
   对比度就会「本地通过、线上失效」。现在只认这一个文件。 */
function readTokens(file) {
  const css = readFileSync(resolve(root, file), 'utf8');
  const block = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!block) throw new Error(`${file} 缺少 :root 令牌块`);
  const tokens = {};
  for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  return tokens;
}
const tokens = readTokens('assets/tokens.css');

/* ---------- 最坏底色（与真实渲染一致） ---------- */
// 浅底：正文卡片由 --card 叠在 --bg 上；用最亮的 --card 与最暗的 --card2 各验一次。
const PAPER = parseColor('oklch(98% .018 355)');
const CARD = parseColor('oklch(100% .005 350 / .84)');
const CARD2 = parseColor('oklch(96% .025 350 / .74)');
const LIGHT_CARD = composite(CARD, PAPER);
const LIGHT_CARD2 = composite(CARD2, PAPER);
// 深色芯片：四柱、八宅、姓名五格用的实心底色，以及「日主」热点底色。
const DARK_CHIP = parseColor('#0f131b');
const DARK_HOT = parseColor('#301513');

const failures = [];
function requireContrast(label, token, fgValue, bg, min) {
  const fg = parseColor(fgValue);
  if (!fg) {
    failures.push(`${label}：无法解析色值 ${fgValue}`);
    return;
  }
  const ratio = contrast(composite(fg, bg), bg);
  if (ratio + 1e-9 < min) {
    failures.push(`${label}：${ratio.toFixed(2)}:1 < ${min}:1（${token} = ${fgValue}）`);
  }
}

/* 浅底文字色：正文级 4.5:1 */
for (const [name, bg] of [
  ['卡片', LIGHT_CARD],
  ['次级卡片', LIGHT_CARD2],
]) {
  for (const token of ['--ink', '--txt', '--dim', '--dim2', '--gold-ink', '--gold2']) {
    const value = tokens[token];
    if (value) requireContrast(`${name}上的 ${token}`, token, value, bg, 4.5);
  }
  for (const token of ['--jade-ink', '--xiong-ink', '--xiong-strong-ink']) {
    const value = tokens[token];
    if (value) requireContrast(`${name}上的 ${token}`, token, value, bg, 4.5);
  }
  for (const token of ['--wx-mu-ink', '--wx-huo-ink', '--wx-tu-ink', '--wx-jin-ink', '--wx-shui-ink']) {
    requireContrast(`${name}上的 ${token}`, token, tokens[token], bg, 4.5);
  }
}

/* 深底芯片文字色：对实心底与热点底双重验证 */
for (const [name, bg] of [
  ['深色芯片', DARK_CHIP],
  ['深色热点', DARK_HOT],
]) {
  for (const token of [
    '--ink-on-dark',
    '--dim-on-dark',
    '--jade-on-dark',
    '--xiong-on-dark',
    '--xiong-strong-on-dark',
    '--gold-on-dark',
  ]) {
    requireContrast(`${name}上的 ${token}`, token, tokens[token], bg, 4.5);
  }
}

/* 渐变大字端点：40px 正文级大字，需 >= 3:1 */
requireContrast('四柱渐变端点', 'oklch(66% .14 350)', 'oklch(66% .14 350)', DARK_CHIP, 3);

/* 按钮：白字压在主色上 */
const BTN_BG = parseColor(tokens['--gold2']);
requireContrast('主按钮白字', '--gold2', 'oklch(99% .01 355)', BTN_BG, 4.5);

/* ---------- 使用面契约：不允许再拿浅底原色当文字色 ---------- */
/* 样式规则已集中到 assets/site.css，浅底文字色禁令改在这里检查。 */
const siteCss = readFileSync(resolve(root, 'assets/site.css'), 'utf8');
const appJs = readFileSync(resolve(root, 'app.js'), 'utf8');
const forbiddenTextColors = ['--jade', '--xiong', '--xiong-strong', '--gold'];
for (const token of forbiddenTextColors) {
  // 只允许出现在深色芯片作用域内（.bz / .ge / .pil 等），这里逐条列出已知合法位置
  const pattern = new RegExp(`(?<![\\w-])color:\\s*var\\(${token}\\)`, 'g');
  const hits = [...siteCss.matchAll(pattern)];
  for (const hit of hits) {
    const around = siteCss.slice(Math.max(0, hit.index - 120), hit.index);
    const selector = around.split('}').pop().split('{')[0].trim();
    const darkScoped = /\.(pil|bz|ge)\b/.test(selector);
    if (!darkScoped) failures.push(`site.css 的 ${selector || '(未知选择器)'} 仍用 ${token} 当浅底文字色`);
  }
  const jsHits = [...appJs.matchAll(new RegExp(`color:var\\(${token}\\)`, 'g'))];
  if (jsHits.length) failures.push(`app.js 仍用 ${token} 当文字色（应改用 -ink / -on-dark 版本）`);
}

if (failures.length) {
  process.stderr.write(`[contrast] 对比度契约未通过（${failures.length} 项）：\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
console.log('[contrast] 对比度契约通过：浅底文字色 >= 4.5:1，深底芯片文字色 >= 4.5:1');
