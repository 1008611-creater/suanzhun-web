import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPreviewServer } from '../scripts/serve.mjs';

/**
 * 本地预览必须与线上 Nginx 行为一致，否则「本地是新的、线上是旧的」
 * 这类问题无法在本地复现。这里逐条锁定缓存与 404 契约。
 */
async function withServer(run) {
  const server = createPreviewServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

const CASES = [
  ['/', 200, 'no-cache', 'text/html'],
  ['/paipan.html', 200, 'no-cache', 'text/html'],
  ['/bazi.js', 200, 'no-cache', 'text/javascript'],
  ['/og-image.png', 200, 'public, max-age=604800', 'image/png'],
  ['/favicon.svg', 200, 'public, max-age=604800', 'image/svg\\+xml'],
  ['/robots.txt', 200, 'public, max-age=3600', 'text/plain'],
  ['/sitemap.xml', 200, 'public, max-age=3600', 'application/xml'],
];

for (const [path, status, cache, type] of CASES) {
  test(`preview ${path} -> ${status} ${cache}`, async () => {
    await withServer(async (base) => {
      const res = await fetch(base + path);
      assert.equal(res.status, status, path);
      assert.equal(res.headers.get('cache-control'), cache, `${path} cache-control`);
      assert.match(res.headers.get('content-type') || '', new RegExp(type, 'i'), `${path} content-type`);
      const body = await res.text();
      assert.ok(body.length > 0, `${path} 应有响应体`);
    });
  });
}

test('preview 未知地址返回 404 状态并渲染自定义 404 页', async () => {
  await withServer(async (base) => {
    const res = await fetch(base + '/this-page-does-not-exist');
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') || '', /text\/html/i);
    const body = await res.text();
    assert.match(body, /404/u, '应渲染 404 页而不是纯文本');
    assert.doesNotMatch(body, /^Not found$/u);
  });
});

test('preview 拒绝越出站点目录的路径', async () => {
  await withServer(async (base) => {
    // 用百分号编码绕过 URL 归一化，验证路径守卫确实生效。
    const res = await fetch(base + '/%2e%2e%2f%2e%2e%2fpackage.json');
    assert.equal(res.status, 403);
  });
});
