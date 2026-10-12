import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { main } from './cli.js';

const run = promisify(execFile);
const usage = 'rules list|effective|validate|test';
let root: string;
let previous: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'trace-rules-contract-'));
  previous = process.cwd();
  await run('git', ['init', '-b', 'main'], { cwd: root });
  await writeFile(join(root, 'README.md'), '# Temporary rules contract fixture\n');
  await run('git', ['add', '.'], { cwd: root });
  await run(
    'git',
    [
      '-c',
      'user.name=TRACE Test',
      '-c',
      'user.email=fixture@example.test',
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
it.each(['--help', '-h'])('lists only implemented rules in %s', async (flag) => {
  expect(await main(['rules', flag])).toEqual({ code: 0, value: { usage: `Use: trace ${usage}` } });
  const top = await main([flag]);
  expect(top.code).toBe(0);
  expect(
    (top.value as { commands: string[] }).commands.filter((line) => line.startsWith('rules ')),
  ).toEqual([usage]);
  expect(JSON.stringify(top.value)).not.toMatch(/\b(?:explain|diff)\b/);
  await expect(access(join(root, '.trace'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it.each(['explain', 'diff', '__unknown__'])(
  'rejects unsupported %s with truthful usage',
  async (subcommand) => {
    expect(await main(['rules', subcommand])).toEqual({
      code: 2,
      value: { error: `Use: trace ${usage}` },
    });
    await expect(access(join(root, '.trace'))).rejects.toMatchObject({ code: 'ENOENT' });
  },
);
it('preserves all implemented commands and default list without initialization or writes', async () => {
  const list = await main(['rules', 'list']);
  expect(list.code).toBe(0);
  expect(list.value).toMatchObject({ source: 'built-in baseline', rules: expect.any(Array) });
  expect(await main(['rules', 'effective'])).toEqual(list);
  expect(await main(['rules'])).toEqual(list);
  expect(await main(['rules', 'validate'])).toEqual({
    code: 0,
    value: { valid: true, errors: [] },
  });
  expect(await main(['rules', 'test'])).toMatchObject({
    code: 0,
    value: { rules: expect.any(Array) },
  });
  await expect(access(join(root, '.trace'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('preserves exit 2 and truthful top-level usage for unknown commands', async () => {
  const result = await main(['__unknown__']);
  expect(result.code).toBe(2);
  expect(result.value).toMatchObject({ error: 'Unknown command.' });
  expect(
    (result.value as { commands: string[] }).commands.filter((line) => line.startsWith('rules ')),
  ).toEqual([usage]);
});
