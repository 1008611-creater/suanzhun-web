// 发布脚本：质量门 -> 远端备份 -> 差异上传 -> 哈希复核 -> 线上探活
// 用法：npm run deploy                 正式发布
//      npm run deploy -- --dry-run    只做检查与差异比对，不上传
//      npm run deploy -- --skip-check 跳过质量门（仅供排障）
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LF = String.fromCharCode(10);
const root = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const skipCheck = argv.includes('--skip-check');

const HOST = process.env.SUANZHUN_HOST || 'root@38.76.193.254';
const SSH_KEY = process.env.SUANZHUN_SSH_KEY || 'C:/Users/lsb/.ssh/haika_niannian_ed25519';
const REMOTE_DIR = process.env.SUANZHUN_REMOTE_DIR || '/srv/suanzhun/public';
const BACKUP_ROOT = process.env.SUANZHUN_BACKUP_ROOT || '/srv/suanzhun/backups';
const BASE_URL = process.env.SUANZHUN_BASE_URL || 'https://suanzhun.cauai.fun';

const FILES = ['index.html', 'paipan.html', 'app.js', 'analysis.js', 'bazi.js', 'robots.txt', 'sitemap.xml'];
const URLS = ['/', '/paipan.html', '/app.js', '/analysis.js', '/bazi.js', '/robots.txt', '/sitemap.xml'];
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

async function probe(urls) {
  const failures = [];
  for (const path of urls) {
    const target = BASE_URL + path;
    try {
      const res = await globalThis.fetch(target, { redirect: 'follow' });
      const ok = res.status === 200;
      console.log('  ' + (ok ? 'OK  ' : 'FAIL') + ' ' + res.status + ' ' + target);
      if (!ok) failures.push(path + ' -> ' + res.status);
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

  step('线上探活');
  const failures = await probe(URLS);
  if (failures.length) throw new Error('探活失败：' + failures.join('; '));

  const label = dryRun ? '[dry-run] 检查' : '发布';
  console.log(LF + label + '完成：' + FILES.length + ' 个文件，' + URLS.length + ' 个地址全部 200');
}

main().catch((error) => {
  console.error(LF + '发布中止：' + error.message);
  process.exitCode = 1;
});
