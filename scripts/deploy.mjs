// 发布脚本：质量门 -> 远端备份 -> 差异上传 -> 哈希复核 -> 线上探活
// 用法：npm run deploy                 正式发布
//      npm run deploy -- --dry-run    只做检查与差异比对，不上传
//      npm run deploy -- --skip-check 跳过质量门（仅供排障）
//      npm run deploy -- --with-infra 同时同步 Nginx 与 Compose 定义并重建容器
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CSP } from './serve.mjs';

const LF = String.fromCharCode(10);
const root = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const skipCheck = argv.includes('--skip-check');
const withInfra = argv.includes('--with-infra');

const HOST = process.env.SUANZHUN_HOST || 'root@38.76.193.254';
const SSH_KEY = process.env.SUANZHUN_SSH_KEY || 'C:/Users/lsb/.ssh/haika_niannian_ed25519';
const REMOTE_DIR = process.env.SUANZHUN_REMOTE_DIR || '/srv/suanzhun/public';
const BACKUP_ROOT = process.env.SUANZHUN_BACKUP_ROOT || '/srv/suanzhun/backups';
const BASE_URL = process.env.SUANZHUN_BASE_URL || 'https://suanzhun.cauai.fun';
const INFRA_DIR = process.env.SUANZHUN_INFRA_DIR || '/srv/suanzhun';

const FILES = [
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
];
const URLS = [
  '/',
  '/paipan.html',
  '/assets/tokens.css',
  '/assets/site.css',
  '/app.js',
  '/analysis.js',
  '/bazi.js',
  '/favicon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon-maskable-192.png',
  '/assets/icon-maskable-512.png',
  '/site.webmanifest',
  '/og-image.png',
  '/robots.txt',
  '/sitemap.xml',
];
// 基础设施文件上传到站点目录的上一级，仅在 --with-infra 时处理
const INFRA_FILES = [
  ['deploy/nginx.conf', 'nginx.conf'],
  ['deploy/docker-compose.yml', 'docker-compose.yml'],
];
const SSH_OPTS = [
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=15',
  '-o',
  'StrictHostKeyChecking=accept-new',
  '-i',
  SSH_KEY,
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
}

function mustRun(command, args, label) {
  const result = run(command, args);
  if (result.status !== 0) {
    throw new Error(label + ' 失败 (exit ' + result.status + ')' + LF + (result.stdout || '') + (result.stderr || ''));
  }
  return result.stdout;
}

function ssh(script, label = '远端命令') {
  return mustRun('ssh', [...SSH_OPTS, HOST, script], label);
}

function sha256(file) {
  return createHash('sha256')
    .update(readFileSync(resolve(root, file)))
    .digest('hex');
}

function remoteHashes() {
  const script = [
    'cd ' + REMOTE_DIR + ' || exit 1',
    'for f in ' + FILES.join(' ') + '; do',
    '  if [ -f $f ]; then sha256sum $f; else echo MISSING:${f}; fi',
    'done',
  ].join(LF);
  const out = ssh(script, '读取线上哈希');
  const map = new Map();
  for (const raw of out.split(LF)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('MISSING:')) {
      map.set(line.slice(8), 'MISSING');
      continue;
    }
    const hash = line.slice(0, 64);
    const name = line.slice(64).trim();
    if (hash.length === 64 && name) map.set(name, hash);
  }
  return map;
}

async function probe(urls, { expectMissing = [] } = {}) {
  const failures = [];
  for (const path of urls) {
    const target = BASE_URL + path;
    try {
      const res = await globalThis.fetch(target, { redirect: 'follow' });
      const ok = res.status === 200;
      const pending = !ok && expectMissing.includes(path);
      const label = ok ? 'OK  ' : pending ? '待传' : 'FAIL';
      console.log('  ' + label + ' ' + res.status + ' ' + target);
      if (!ok && !pending) failures.push(path + ' -> ' + res.status);
    } catch (error) {
      console.log('  FAIL --- ' + target);
      failures.push(path + ' -> ' + error.message);
    }
  }
  return failures;
}

function step(title) {
  console.log(LF + '== ' + title);
}

/**
 * 安全响应头必须真的落在线上，而不是只写在配置里。
 * nginx 的 add_header 不继承，漏写某个 location 时页面照常打开、配置也合法，
 * 只有实际读响应头才能发现，所以在探活阶段一并校验。
 */
async function probeCsp(urls) {
  const failures = [];
  for (const path of urls) {
    const target = BASE_URL + path;
    try {
      const res = await globalThis.fetch(target, { redirect: 'follow' });
      const csp = res.headers.get('content-security-policy');
      if (csp !== CSP) failures.push(path + ' -> ' + (csp === null ? '缺失 CSP' : 'CSP 与配置不一致'));
    } catch (error) {
      failures.push(path + ' -> ' + error.message);
    }
  }
  return failures;
}

async function main() {
  if (!skipCheck) {
    step('质量门 release:check');
    const npmCli = process.env.npm_execpath;
    const check = npmCli
      ? run(process.execPath, [npmCli, 'run', 'release:check'], { cwd: root })
      : run('npm', ['run', 'release:check'], { cwd: root, shell: true });
    if (check.status !== 0) {
      throw new Error('质量门未通过' + LF + (check.stdout || '') + (check.stderr || ''));
    }
    console.log('质量门通过');
  }

  step('本地哈希');
  const local = new Map(FILES.map((f) => [f, sha256(f)]));
  for (const [file, hash] of local) console.log('  ' + hash.slice(0, 12) + '  ' + file);

  step('线上哈希');
  const remote = remoteHashes();
  const changed = FILES.filter((f) => local.get(f) !== remote.get(f));
  for (const file of FILES) {
    const same = local.get(file) === remote.get(file);
    const state = same ? '一致' : remote.has(file) ? '需更新' : '线上缺失';
    console.log('  ' + state.padEnd(6) + ' ' + file);
  }

  if (!changed.length) {
    console.log(LF + '无需上传，线上已是最新');
  } else if (dryRun) {
    console.log(LF + '[dry-run] 将上传 ' + changed.length + ' 个文件：' + changed.join(' '));
  } else {
    step('远端备份');
    const backupScript = [
      'set -e',
      'ts=$(date +%Y%m%d-%H%M%S)',
      'mkdir -p ' + BACKUP_ROOT + '/$ts',
      'cp -a ' + REMOTE_DIR + '/. ' + BACKUP_ROOT + '/$ts/',
      'echo ' + BACKUP_ROOT + '/$ts',
    ].join(LF);
    const backupDir = ssh(backupScript, '创建备份').trim();
    console.log('  备份到 ' + backupDir);

    step('上传差异文件');
    // 远端目录可能不存在（新增 assets/ 这类子目录时），scp 不会自动建目录。
    const remoteDirs = [...new Set(changed.map((f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '')))].filter(
      Boolean
    );
    if (remoteDirs.length) {
      ssh(['set -e', ...remoteDirs.map((d) => 'mkdir -p ' + REMOTE_DIR + '/' + d)].join(LF), '创建远端目录');
    }
    for (const file of changed) {
      mustRun('scp', [...SSH_OPTS, resolve(root, file), HOST + ':' + REMOTE_DIR + '/' + file], '上传 ' + file);
      console.log('  已上传 ' + file);
    }

    step('哈希复核');
    const after = remoteHashes();
    const mismatch = FILES.filter((f) => local.get(f) !== after.get(f));
    if (mismatch.length) throw new Error('上传后哈希不一致：' + mismatch.join(' '));
    console.log('  全部文件哈希一致');
  }

  if (withInfra) {
    step('同步基础设施定义');
    for (const [source, target] of INFRA_FILES) {
      const localText = readFileSync(resolve(root, source), 'utf8');
      const remoteScript = 'cat ' + INFRA_DIR + '/' + target + ' 2>/dev/null || true';
      const remoteText = ssh(remoteScript, '读取远端 ' + target);
      if (remoteText === localText) {
        console.log('  一致   ' + target);
        continue;
      }
      if (dryRun) {
        console.log('  [dry-run] 将更新 ' + target);
        continue;
      }
      mustRun('scp', [...SSH_OPTS, resolve(root, source), HOST + ':' + INFRA_DIR + '/' + target], '上传 ' + target);
      console.log('  已更新 ' + target);
    }
    if (!dryRun) {
      step('校验 Nginx 配置');
      ssh(
        [
          'set -e',
          'docker run --rm -v ' +
            INFRA_DIR +
            '/nginx.conf:/etc/nginx/conf.d/default.conf:ro nginx:1.27-alpine nginx -t',
        ].join(LF),
        '校验 nginx.conf'
      )
        .split(LF)
        .filter(Boolean)
        .forEach((line) => console.log('  ' + line.trim()));

      step('重建容器');
      ssh(
        [
          'set -e',
          'cd ' + INFRA_DIR,
          // 早期容器由 docker run 创建，没有 compose 标签；先移除再交给 compose 接管。
          'if docker inspect suanzhun-web >/dev/null 2>&1; then',
          '  if docker inspect -f "{{.Config.Labels}}" suanzhun-web | grep -q com.docker.compose.project; then',
          '    echo "容器已由 compose 管理"',
          '  else',
          '    echo "移除旧的非 compose 容器 suanzhun-web"',
          '    docker rm -f suanzhun-web >/dev/null',
          '  fi',
          'fi',
          'docker compose up -d --force-recreate',
          'docker ps --filter name=suanzhun-web --format "{{.Names}} {{.Status}}"',
        ].join(LF),
        '重建 suanzhun-web'
      )
        .split(LF)
        .filter(Boolean)
        .forEach((line) => console.log('  ' + line.trim()));
    }
  }

  step('线上探活');
  // dry-run 时新文件还没上传，404 属于预期状态，不计为失败。
  const expectMissing = dryRun
    ? URLS.filter((path) => {
        const file = path === '/' ? 'index.html' : path.replace(/^\//, '');
        return !remote.has(file) || remote.get(file) === 'MISSING';
      })
    : [];
  const failures = await probe(URLS, { expectMissing });
  if (failures.length) throw new Error('探活失败：' + failures.join('; '));

  step('线上安全响应头');
  const cspTargets = URLS.filter((path) => !expectMissing.includes(path));
  const cspFailures = await probeCsp(cspTargets);
  if (cspFailures.length) {
    if (dryRun) {
      // dry-run 不上传、不重建容器，线上 CSP 可能还没生效，这里只报告不拦截。
      for (const failure of cspFailures) console.log('  [dry-run] 待生效 ' + failure);
    } else {
      throw new Error('CSP 校验失败：' + cspFailures.join('; '));
    }
  } else {
    console.log('  ' + cspTargets.length + ' 个地址均带 Content-Security-Policy');
  }

  const label = dryRun ? '[dry-run] 检查' : '发布';
  const pendingNote = expectMissing.length ? '，' + expectMissing.length + ' 个待上传地址暂返回 404' : '';
  console.log(LF + label + '完成：' + FILES.length + ' 个文件，' + URLS.length + ' 个地址可用' + pendingNote);
}

main().catch((error) => {
  console.error(LF + '发布中止：' + error.message);
  process.exitCode = 1;
});
