#!/usr/bin/env node
/**
 * scripts/secret-scan.mjs —— 推送前密钥扫描，对应工作区契约 S-010。
 *
 * 这个仓库是独立 GitHub 仓库，任何提交都会离开本机，
 * 因此凭据绝不能落盘。本文件自身包含模式字面量，扫描时跳过自身。
 *
 * 退出码：0 = 干净；1 = 发现疑似明文凭据。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const SKIP_DIRS = new Set(['.git', 'node_modules', 'backups', '.tmp-shots', 'coverage', 'dist']);

const TEXT_EXT = new Set([
  '.md',
  '.txt',
  '.json',
  '.jsonl',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.py',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.env',
  '.bat',
  '.cmd',
  '.ps1',
  '.psm1',
  '.sh',
  '.html',
  '.css',
  '.xml',
  '.csv',
]);

const SKIP_FILES = new Set(['scripts/secret-scan.mjs', 'package-lock.json']);

const PATTERNS = [
  { id: 'openai-style-key', note: 'OpenAI 风格密钥', re: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { id: 'anthropic-key', note: 'Anthropic 风格密钥', re: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
  { id: 'github-token', note: 'GitHub 令牌', re: /\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{20,}/ },
  { id: 'github-pat', note: 'GitHub 细粒度令牌', re: /\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { id: 'aws-key', note: 'AWS Access Key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'jwt', note: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./ },
  { id: 'private-key', note: '私钥文件内容', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    id: 'assigned-secret',
    note: '被赋值的疑似密钥',
    re: /(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|bearer[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_-]{24,}["']/i,
  },
];

/** 占位符与测试假值不算问题，否则真问题会被误报淹没。 */
const PLACEHOLDER_RE =
  /(only[-_]?in[-_]?test|placeholder|dummy|fake|example|sample|changeme|change[-_]?me|your[-_]?(api|key|token)|redacted|xxxx|<[^>]+>|\$\{)/i;

function redact(value) {
  return value.slice(0, 6) + '…<redacted:' + value.length + '>';
}

function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

const findings = [];
let scanned = 0;

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIP_FILES.has(rel)) continue;
    if (!TEXT_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    let buf;
    try {
      buf = fs.readFileSync(full);
    } catch {
      continue;
    }
    if (isBinary(buf)) continue;
    scanned++;
    const lines = buf.toString('utf8').split(/\r?\n/);
    for (const pattern of PATTERNS) {
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(pattern.re);
        if (!match || PLACEHOLDER_RE.test(match[0])) continue;
        findings.push({
          file: rel,
          line: i + 1,
          note: pattern.note,
          id: pattern.id,
          preview: redact(match[0]),
        });
      }
    }
  }
}

walk(ROOT);

if (findings.length === 0) {
  process.stdout.write('[secret-scan] 干净：扫描 ' + scanned + ' 个文本文件，未发现明文凭据\n');
  process.exit(0);
}

process.stderr.write('[secret-scan] 发现 ' + findings.length + ' 处疑似凭据（S-010 违规）\n\n');
for (const f of findings) {
  process.stderr.write(
    '  ' +
      f.file +
      ':' +
      f.line +
      '\n' +
      '    类型：' +
      f.note +
      ' (' +
      f.id +
      ')\n' +
      '    预览：' +
      f.preview +
      '\n\n'
  );
}
process.stderr.write('处理方式：把凭据移到仓库外，改为运行时参数或环境变量。\n');
process.exit(1);
