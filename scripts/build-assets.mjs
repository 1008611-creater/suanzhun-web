// 生成站点图标与分享卡片：favicon.svg / apple-touch-icon.png / og-image.png
// 用法：npm run assets
// 产物会提交进仓库，日常开发不需要重复执行；改动品牌视觉时才跑。
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const PAPER = '#fff4f9';
const GOLD = '#d87879';
const BERRY = '#9e366f';
const BERRY_DEEP = '#7d2a58';

// 四柱标记：四根竖条，最高一根用金色，寓意「日主」
const bars = [
  { x: 10.5, h: 22, fill: PAPER },
  { x: 22.5, h: 34, fill: PAPER },
  { x: 34.5, h: 26, fill: PAPER },
  { x: 46.5, h: 40, fill: GOLD },
];

const barSvg = bars
  .map(
    (b) =>
      '<rect x="' + b.x + '" y="' + (48 - b.h) + '" width="7" height="' + b.h + '" rx="3.5" fill="' + b.fill + '"/>'
  )
  .join('');

const favicon = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="算的准">',
  '  <defs><linearGradient id="tile" x1="0" y1="0" x2="0.7" y2="1">',
  '    <stop offset="0" stop-color="' + BERRY + '"/><stop offset="1" stop-color="' + BERRY_DEEP + '"/>',
  '  </linearGradient></defs>',
  '  <rect width="64" height="64" rx="14" fill="url(#tile)"/>',
  '  ' + barSvg,
  '</svg>',
  '',
].join('\n');

const markSvg =
  '<svg width="52" height="52" viewBox="0 0 64 64" aria-hidden="true">' +
  '<defs><linearGradient id="tile" x1="0" y1="0" x2="0.7" y2="1">' +
  '<stop offset="0" stop-color="' +
  BERRY +
  '"/><stop offset="1" stop-color="' +
  BERRY_DEEP +
  '"/>' +
  '</linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#tile)"/>' +
  barSvg +
  '</svg>';

const ogHtml = [
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>',
  'html,body{margin:0;width:1200px;height:630px;overflow:hidden}',
  'body{box-sizing:border-box;padding:62px 78px;display:flex;flex-direction:column;justify-content:space-between;',
  'background:radial-gradient(780px 430px at 6% -12%,rgba(238,195,214,.9) 0%,transparent 66%),',
  'radial-gradient(640px 400px at 104% 4%,rgba(255,224,212,.92) 0%,transparent 68%),' + PAPER + ';',
  'color:#35222d;font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}',
  '.brand{display:flex;align-items:center;gap:16px}',
  '.brand .name{font-size:25px;letter-spacing:.2em;font-weight:600;color:' + BERRY + '}',
  '.brand .tag{margin-left:auto;font-size:15px;letter-spacing:.14em;color:#a9909d}',
  'h1{margin:0;font-family:"Songti SC","Noto Serif SC",serif;font-size:58px;line-height:1.32;letter-spacing:.02em;color:' +
    BERRY +
    '}',
  'h1 em{font-style:normal;color:' + GOLD + '}',
  '.sub{margin-top:24px;font-size:19px;letter-spacing:.16em;color:#715463}',
  '.foot{display:flex;align-items:center;gap:16px;padding-top:26px;border-top:1px solid rgba(158,54,111,.22);',
  'font-size:17px;letter-spacing:.1em;color:#715463}',
  '.foot b{font-weight:600;color:' + BERRY + '}',
  '.foot .sep{width:4px;height:4px;border-radius:50%;background:' + GOLD + '}',
  '</style></head><body>',
  '<div class="brand">' + markSvg + '<div class="name">算的准</div>',
  '<div class="tag">八字 · 真太阳时 · 大运流年 · 八宅命卦 · 姓名五格</div></div>',
  '<div><h1>先看<em>已经发生的事</em>，<br>再谈以后。</h1>',
  '<div class="sub">前事验不准，不收钱</div></div>',
  '<div class="foot"><b>suanzhun.cauai.fun</b><span class="sep"></span>',
  '<span>传统命理文化参考工具，结果仅供文化参考与自我反思</span></div>',
  '</body></html>',
].join('\n');

async function loadChromium() {
  try {
    const mod = await import('playwright');
    if (mod.chromium) return mod.chromium;
  } catch {
    // 本机未装本地依赖时，回落到全局安装
  }
  const bases = [process.env.PLAYWRIGHT_MODULES, 'C:/Users/lsb/AppData/Roaming/npm/node_modules'];
  for (const base of bases) {
    if (!base) continue;
    try {
      return createRequire(resolve(base, 'noop.js'))('playwright').chromium;
    } catch {
      // 继续尝试下一个位置
    }
  }
  throw new Error('未找到 playwright，无法生成图片资源');
}

const chromium = await loadChromium();
const browser = await chromium.launch();

writeFileSync(resolve(root, 'favicon.svg'), favicon);

const iconPage = await browser.newPage({ viewport: { width: 180, height: 180 } });
await iconPage.setContent(
  '<style>html,body{margin:0;width:180px;height:180px}svg{display:block;width:180px;height:180px}</style>' +
    favicon.replace('<svg ', '<svg width="180" height="180" '),
  { waitUntil: 'load' }
);
await iconPage.screenshot({ path: resolve(root, 'apple-touch-icon.png'), omitBackground: true });

const ogPage = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await ogPage.setContent(ogHtml, { waitUntil: 'load' });
await ogPage.screenshot({ path: resolve(root, 'og-image.png') });

await browser.close();
console.log('已生成 favicon.svg / apple-touch-icon.png / og-image.png');
