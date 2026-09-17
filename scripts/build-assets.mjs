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

/* maskable 图标：主体收进中心安全区、背景铺满画布。
   系统把它裁成圆形或水滴形时不会切掉四柱标记。 */
const maskableSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="算的准">',
  '  <defs><linearGradient id="tile" x1="0" y1="0" x2="0.7" y2="1">',
  '    <stop offset="0" stop-color="' + BERRY + '"/><stop offset="1" stop-color="' + BERRY_DEEP + '"/>',
  '  </linearGradient></defs>',
  '  <rect width="64" height="64" fill="url(#tile)"/>',
  '  <g transform="translate(32 32) scale(0.68) translate(-32 -32)">' + barSvg + '</g>',
  '</svg>',
  '',
].join('\n');

/* 浏览器和爬虫在没有 <link rel="icon"> 命中时，仍会默认请求 /favicon.ico。
   缺了它线上会稳定多出一条 404，看着就像站点没做完。
   这里把渲染出的 PNG 按 ICO 容器打包成多尺寸图标。 */
function icoFromPngs(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  const blobs = [];
  entries.forEach((entry, i) => {
    const at = i * 16;
    const dim = entry.size >= 256 ? 0 : entry.size;
    dir.writeUInt8(dim, at);
    dir.writeUInt8(dim, at + 1);
    dir.writeUInt8(0, at + 2);
    dir.writeUInt8(0, at + 3);
    dir.writeUInt16LE(1, at + 4);
    dir.writeUInt16LE(32, at + 6);
    dir.writeUInt32LE(entry.png.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
    blobs.push(entry.png);
  });
  return Buffer.concat([header, dir, ...blobs]);
}

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

/* 同一份矢量在不同画布尺寸下渲染成 PNG。图标族要覆盖：
   苹果主屏图标 180、PWA 图标 192/512、maskable 192/512、favicon.ico 16/32/48。 */
async function renderIcon(svg, size, { opaque = false, inner = null } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const body = inner === null ? svg.replace('<svg ', '<svg width="' + size + '" height="' + size + '" ') : inner;
  await page.setContent(
    '<style>html,body{margin:0;width:' +
      size +
      'px;height:' +
      size +
      'px;background:transparent}svg{display:block;width:' +
      size +
      'px;height:' +
      size +
      'px}</style>' +
      body,
    { waitUntil: 'load' }
  );
  const shot = await page.screenshot({ omitBackground: !opaque });
  await page.close();
  return shot;
}

const appleIcon = await renderIcon(favicon, 180);
writeFileSync(resolve(root, 'apple-touch-icon.png'), appleIcon);

const icon192 = await renderIcon(favicon, 192);
const icon512 = await renderIcon(favicon, 512);
writeFileSync(resolve(root, 'assets/icon-192.png'), icon192);
writeFileSync(resolve(root, 'assets/icon-512.png'), icon512);

const maskable192 = await renderIcon(maskableSvg, 192, { opaque: true });
const maskable512 = await renderIcon(maskableSvg, 512, { opaque: true });
writeFileSync(resolve(root, 'assets/icon-maskable-192.png'), maskable192);
writeFileSync(resolve(root, 'assets/icon-maskable-512.png'), maskable512);

/* 浏览器请求 /favicon.ico 时不带 <link> 信息，需要真实文件兜底。 */
const ico = icoFromPngs([
  { size: 16, png: await renderIcon(favicon, 16) },
  { size: 32, png: await renderIcon(favicon, 32) },
  { size: 48, png: await renderIcon(favicon, 48) },
]);
writeFileSync(resolve(root, 'favicon.ico'), ico);

/* PWA 清单：让手机能「添加到主屏幕」，并固定主题色与显示模式。 */
const manifest = {
  name: '算的准 · 传统命理文化参考工具',
  short_name: '算的准',
  description: '真太阳时、四柱八字、五行旺衰、大运流年、八宅命卦、姓名五格与合婚参考，全部在浏览器本地计算。',
  lang: 'zh-CN',
  dir: 'ltr',
  start_url: '/paipan.html',
  scope: '/',
  display: 'standalone',
  background_color: '#fff4f9',
  theme_color: '#9e366f',
  icons: [
    { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/assets/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/assets/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(resolve(root, 'site.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

const ogPage = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await ogPage.setContent(ogHtml, { waitUntil: 'load' });
await ogPage.screenshot({ path: resolve(root, 'og-image.png') });

await browser.close();
console.log(
  '已生成 favicon.svg / favicon.ico / apple-touch-icon.png / icon-192 / icon-512 / maskable / site.webmanifest / og-image.png'
);
