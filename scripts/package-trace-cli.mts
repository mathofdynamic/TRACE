import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'dist', 'cli-release');
const staging = join(root, '.trace-cache', 'cli-release-package');
const version = JSON.parse(await readFile(join(root, 'packages/trace-cli/package.json'), 'utf8'))
  .version as string;
await rm(staging, { recursive: true, force: true });
await mkdir(join(staging, 'dist'), { recursive: true });
await mkdir(output, { recursive: true });
const bundled = await build({
  entryPoints: [join(root, 'packages/trace-cli/src/cli.ts')],
  outfile: join(staging, 'dist/cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: {
    js: "import { createRequire } from 'node:module'; import { fileURLToPath as bundleFileURLToPath } from 'node:url'; import { dirname as bundleDirname } from 'node:path'; const require = createRequire(import.meta.url); const __filename = bundleFileURLToPath(import.meta.url); const __dirname = bundleDirname(__filename);",
  },
  legalComments: 'eof',
  metafile: true,
});
// Retain upstream license texts for every bundled third-party package.
const notices = new Map<string, string>();
for (const input of Object.keys(bundled.metafile.inputs)) {
  if (!input.includes('node_modules/')) continue;
  let directory = dirname(resolve(root, input));
  while (directory.includes('node_modules')) {
    const manifest = await readFile(join(directory, 'package.json'), 'utf8').catch(() => '');
    if (manifest) {
      const dependency = JSON.parse(manifest) as { name: string; version: string };
      const key = `${dependency.name}@${dependency.version}`;
      if (!notices.has(key)) {
        const licenseFile = (await readdir(directory)).find((name) =>
          /^licen[sc]e(?:\..*)?$/i.test(name),
        );
        if (!licenseFile) throw new Error(`Missing bundled dependency license: ${key}`);
        const license = await readFile(join(directory, licenseFile), 'utf8');
        const notice = await readFile(join(directory, 'NOTICE.txt'), 'utf8').catch(() => '');
        notices.set(key, `${key}\n\n${license}\n${notice}`);
      }
      break;
    }
    directory = dirname(directory);
  }
}
await writeFile(
  join(staging, 'THIRD_PARTY_NOTICES.txt'),
  [...notices.values()].sort().join('\n\n---\n\n'),
);
await chmod(join(staging, 'dist/cli.js'), 0o755);
await writeFile(
  join(staging, 'package.json'),
  JSON.stringify(
    {
      name: '@mathofdynamic/trace-cli',
      version,
      description:
        'TRACE repository-native local analysis and selective artifact synchronization CLI.',
      type: 'module',
      bin: { trace: 'dist/cli.js' },
      files: ['dist/cli.js', 'README.md', 'THIRD_PARTY_NOTICES.txt'],
      engines: { node: '>=22.14.0' },
      license: 'UNLICENSED',
      repository: { type: 'git', url: 'https://github.com/mathofdynamic/TRACE.git' },
    },
    null,
    2,
  ) + '\n',
);
await copyFile(join(root, 'packages/trace-cli/README.md'), join(staging, 'README.md'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packed = JSON.parse(
  execFileSync(npm, ['pack', '--json', '--pack-destination', output], {
    cwd: staging,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }),
) as Array<{ filename: string; files: Array<{ path: string }> }>;
const tarball = join(output, packed[0]!.filename);
const bytes = await readFile(tarball);
const sha256 = createHash('sha256').update(bytes).digest('hex');
await writeFile(join(output, 'SHA256SUMS'), `${sha256}  ${packed[0]!.filename}\n`);
console.log(
  JSON.stringify(
    { version, tarball, sha256, files: packed[0]!.files.map((file) => file.path) },
    null,
    2,
  ),
);
