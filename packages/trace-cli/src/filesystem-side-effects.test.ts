import { execFile } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { main } from './cli.js';

const run = promisify(execFile);
let root: string;
let previous: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'trace-side-effects-'));
  previous = process.cwd();
  await run('git', ['init', '-b', 'main'], { cwd: root });
  await writeFile(join(root, '.gitignore'), '.trace/\n');
  await writeFile(join(root, 'sample.ts'), 'export const value = 1;\n');
  await run('git', ['add', '.'], { cwd: root });
  await run(
    'git',
    [
      '-c',
      'user.name=TRACE Test',
      '-c',
      'user.email=trace@example.test',
      'commit',
      '-m',
      'Initial',
    ],
    { cwd: root },
  );
  process.chdir(root);
});
afterEach(async () => {
  process.chdir(previous);
  await rm(root, { recursive: true, force: true });
});
const absent = () => expect(access(join(root, '.trace'))).rejects.toMatchObject({ code: 'ENOENT' });

it.each([
  ['analyze'],
  ['analyze', '--dry-run'],
  ['report', 'daily', '--dry-run'],
  ['report', 'weekly', '--dry-run'],
  ['pr', '1', '--write', '--yes'],
  ['pr', '1', '--write', '--yes', '--dry-run'],
])('rejects uninitialized %j without creating .trace', async (...args) => {
  expect(await main(args)).toMatchObject({
    code: 2,
    value: { error: 'TRACE is not initialized in this repository. Run `trace init --yes` first.' },
  });
  await absent();
});

it('rejects partial initialization without adding analysis files', async () => {
  await main(['init', '--yes']);
  await rm(join(root, '.trace', 'schema-version'));
  expect((await main(['analyze'])).code).toBe(2);
  await expect(access(join(root, '.trace', 'analyses'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each(['config.yml', 'schema-version'])(
  'rejects non-file %s markers before analysis, report and PR writes',
  async (name) => {
    await main(['init', '--yes']);
    const marker = join(root, '.trace', name);
    await rm(marker);
    const outside = join(root, 'marker-target');
    await mkdir(outside);
    for (const link of [false, true]) {
      if (link) await symlink(outside, marker, 'junction');
      else await mkdir(marker);
      for (const args of [
        ['analyze'],
        ['report', 'daily', '--yes'],
        ['report', 'weekly', '--yes'],
        ['pr', '1', '--write', '--yes'],
      ]) {
        expect((await main(args)).code).toBe(2);
      }
      await expect(access(join(root, '.trace', 'analyses'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(await readdir(join(root, '.trace', 'reports', 'daily'))).toEqual([]);
      expect(await readdir(join(root, '.trace', 'pull-requests'))).toEqual([]);
      await rm(marker, { recursive: true });
    }
  },
);

it('rejects a symlinked TRACE root even with real marker files', async () => {
  await main(['init', '--yes']);
  const original = join(root, 'original-trace');
  await rename(join(root, '.trace'), original);
  await symlink(original, join(root, '.trace'), 'junction');
  expect((await main(['analyze'])).code).toBe(2);
  await expect(access(join(original, 'analyses'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('keeps repeated init, PR and sync previews and failing validation read-only', async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    expect((await main(['init', '--dry-run'])).code).toBe(0);
    expect((await main(['pr', '1', '--dry-run'])).code).toBe(0);
    expect((await main(['sync', '--dry-run'])).value).toMatchObject({
      sourceCodeIncluded: false,
      codeSnippetsIncluded: false,
    });
    expect((await main(['validate'])).code).toBe(1);
    await main(['status']);
    await main(['doctor']);
    await absent();
  }
});

it('keeps initialized previews unchanged and normal writes persistent', async () => {
  expect((await main(['init', '--yes'])).code).toBe(0);
  const snapshot = async () => {
    const entries = await readdir(join(root, '.trace'), { recursive: true, withFileTypes: true });
    return Promise.all(
      entries.map(async (e) => [
        join(e.parentPath, e.name),
        e.isFile() ? await readFile(join(e.parentPath, e.name), 'utf8') : 'directory',
      ]),
    );
  };
  const before = await snapshot();
  for (let attempt = 0; attempt < 2; attempt++) {
    expect((await main(['analyze', '--dry-run'])).code).toBe(0);
    expect((await main(['report', 'daily', '--dry-run'])).code).toBe(0);
    expect((await main(['report', 'weekly', '--dry-run'])).code).toBe(0);
    expect((await main(['pr', '1', '--write', '--yes', '--dry-run'])).code).toBe(0);
    expect((await main(['sync', '--dry-run'])).code).toBe(0);
    expect(await snapshot()).toEqual(before);
    await expect(access(join(root, '.trace', 'analyses'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  }
  for (const args of [
    ['analyze'],
    ['report', 'daily', '--yes'],
    ['report', 'weekly', '--yes'],
    ['pr', '1', '--write', '--yes'],
  ]) {
    expect((await main(args)).code).toBe(0);
  }
  expect((await main(['validate'])).value).toEqual([]);
  expect((await snapshot()).length).toBeGreaterThan(before.length);
});
