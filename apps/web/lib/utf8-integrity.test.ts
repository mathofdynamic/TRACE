import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const suspicious = [
  String.fromCodePoint(0x00c3, 0x0192),
  String.fromCodePoint(0x00c3, 0x201a),
  String.fromCodePoint(0x00c3, 0x00a2, 0x00e2, 0x201a, 0xac),
  String.fromCodePoint(0x00c3, 0x00a2, 0x00e2, 0x20ac, 0x2020),
  String.fromCodePoint(0x00c3, 0x00a2, 0x00e2, 0x201a, 0xac, 0xc2, 0xa2),
  String.fromCodePoint(0x00c3, 0x00a2, 0x00e2, 0x20ac, 0x017e, 0xc2, 0xa2),
];
const extensions = new Set(['.ts', '.tsx', '.css', '.js']);

async function runtimeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await runtimeFiles(absolute)));
    else if (extensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

describe('runtime UTF-8 integrity', () => {
  it('contains no known mojibake markers', async () => {
    const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const files = [
      ...(await runtimeFiles(path.join(webRoot, 'app'))),
      ...(await runtimeFiles(path.join(webRoot, 'lib'))),
    ].filter((file) => !file.endsWith('utf8-integrity.test.ts'));
    const hits: string[] = [];
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      if (suspicious.some((marker) => content.includes(marker))) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
