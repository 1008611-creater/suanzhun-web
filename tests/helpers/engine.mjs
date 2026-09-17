import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

function loadUmd(file, globalName) {
  const code = readFileSync(resolve(root, file), 'utf8');
  const sandbox = {};
  sandbox.self = sandbox;
  createContext(sandbox);
  runInContext(code, sandbox, { filename: file });
  const value = sandbox[globalName];
  if (!value) throw new Error(`${file} did not export ${globalName}`);
  return value;
}

export const BaZi = loadUmd('bazi.js', 'BaZi');
export const MingLi = loadUmd('analysis.js', 'MingLi');
export { root };
