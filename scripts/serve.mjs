import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const root = resolve(import.meta.dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/**
 * 本地预览要与线上 Nginx 的缓存策略一致，否则「本地看着是新的、
 * 线上用户看到旧的」这类问题无法在本地复现。
 */
function cacheControl(pathname) {
  if (/\.(?:html|js|css)$/i.test(pathname)) return 'no-cache';
  if (/\.(?:svg|png|jpg|jpeg|webp|woff2)$/i.test(pathname)) return 'public, max-age=604800';
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml') return 'public, max-age=3600';
  return null;
}

export function send(res, status, type, body, pathname) {
  const headers = { 'content-type': type };
  const cache = cacheControl(pathname);
  if (cache) headers['cache-control'] = cache;
  res.writeHead(status, headers).end(body);
}

/**
 * 预览服务器与线上 Nginx 保持同样的缓存与 404 行为。
 * 导出为工厂函数，测试可以监听随机端口验证，不必依赖固定端口。
 */
export function createPreviewServer(options = {}) {
  const baseDir = options.root || root;
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const target = normalize(join(baseDir, pathname));
      if (target !== baseDir && !target.startsWith(baseDir + sep)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const info = await stat(target);
      if (!info.isFile()) throw new Error('not a file');
      const body = await readFile(target);
      send(res, 200, TYPES[extname(target)] || 'application/octet-stream', body, pathname);
    } catch {
      // 与线上一致：未知地址返回 404 状态，但内容渲染自定义 404 页。
      try {
        const body = await readFile(join(baseDir, '404.html'));
        send(res, 404, 'text/html; charset=utf-8', body, '/404.html');
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      }
    }
  });
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const port = Number(process.env.PORT || 4173);
  createPreviewServer().listen(port, () => {
    console.log(`算的准 本地预览： http://localhost:${port}/`);
  });
}
