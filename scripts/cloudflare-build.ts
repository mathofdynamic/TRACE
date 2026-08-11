import { execFileSync } from 'node:child_process';
import {
  existsSync,
  cpSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const web = path.join(root, 'apps', 'web');

function run(command: string, args: string[], cwd = root) {
  execFileSync(process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command, args, {
    cwd,
    shell: process.platform === 'win32',
    stdio: 'inherit',
    env: {
      ...process.env,
      CI: '1',
      NO_UPDATE_NOTIFIER: '1',
      WRANGLER_SEND_METRICS: 'false',
    },
  });
}

function runOpenNext(args: string[]) {
  const cli = path.join(
    web,
    'node_modules',
    '@opennextjs',
    'cloudflare',
    'dist',
    'cli',
    'index.js',
  );
  run(process.execPath, [cli, ...args], web);
}

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];

  const entries: string[] = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    entries.push(fullPath);
    const info = lstatSync(fullPath);
    if (info.isDirectory() && !info.isSymbolicLink()) entries.push(...walk(fullPath));
  }
  return entries;
}

function stripSharpFromTraceManifests() {
  for (const file of walk(path.join(web, '.next')).filter((entry) => entry.endsWith('.nft.json'))) {
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as { files?: string[] };
    if (!manifest.files) continue;

    manifest.files = manifest.files.filter(
      (entry) => !/(^|[\\/])sharp(@|[\\/]|$)/.test(entry) && !/@img[\\/]sharp-/.test(entry),
    );
    writeFileSync(file, JSON.stringify(manifest, null, 2), 'utf8');
  }
}

function removeSharpFromStandalone() {
  const standalone = path.join(web, '.next', 'standalone');
  for (const entry of walk(standalone).reverse()) {
    if (path.basename(entry) === 'sharp' || path.basename(entry).startsWith('sharp@')) {
      rmSync(entry, { recursive: true, force: true });
    }
  }
}

function materializeStandaloneSymlinks() {
  const standalone = path.join(web, '.next', 'standalone');
  const links = walk(standalone).filter((entry) => lstatSync(entry).isSymbolicLink());

  for (const link of links) {
    const target = path.resolve(path.dirname(link), readlinkSync(link));
    if (!existsSync(target)) continue;

    rmSync(link, { recursive: true, force: true });
    cpSync(target, link, { recursive: true, dereference: true });
  }
}

function prepareOpenNextAssetDirectories() {
  mkdirSync(
    path.join(
      web,
      '.open-next',
      'server-functions',
      'default',
      'node_modules',
      'next',
      'dist',
      'compiled',
      '@vercel',
      'og',
    ),
    { recursive: true },
  );
}

function normalizeWindowsOpenNextAssetImports() {
  if (process.platform !== 'win32') return;

  const handler = path.join(
    web,
    '.open-next',
    'server-functions',
    'default',
    'apps',
    'web',
    'handler.mjs',
  );
  const openNextOgDirectory = path.join(
    web,
    '.open-next',
    'server-functions',
    'default',
    'node_modules',
    'next',
    'dist',
    'compiled',
    '@vercel',
    'og',
  );
  if (!existsSync(handler) || !existsSync(openNextOgDirectory)) return;

  const absolutePrefix = `${openNextOgDirectory.replaceAll('\\', '/')}/`;
  const relativePrefix = `${path
    .relative(path.dirname(handler), openNextOgDirectory)
    .replaceAll('\\', '/')}/`;
  const source = readFileSync(handler, 'utf8');
  const normalized = source.replaceAll(absolutePrefix, relativePrefix);
  if (normalized !== source) writeFileSync(handler, normalized, 'utf8');
}

function materializeTracedVercelOgAssets() {
  const stableDirectory = path.join(root, '.trace-cache', 'cloudflare-assets', 'vercel-og');
  rmSync(stableDirectory, { recursive: true, force: true });

  for (const file of walk(path.join(web, '.next', 'server')).filter((entry) =>
    entry.endsWith('.nft.json'),
  )) {
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as { files?: string[] };
    const tracedFile = manifest.files?.find((entry) =>
      entry.endsWith('@vercel/og/index.node.js'),
    );
    if (!tracedFile) continue;

    const sourceDirectory = path.dirname(
      path.resolve(path.dirname(file), tracedFile.replace(/index\.node\.js$/, 'index.edge.js')),
    );
    if (!existsSync(sourceDirectory)) continue;

    // pnpm can leave traced files as hardlinks into a temporary package
    // directory on Windows. OpenNext reads them after that directory disappears.
    // Copy the complete package to a stable project-local directory and point the
    // generated trace manifest at that copy before OpenNext starts bundling.
    cpSync(sourceDirectory, stableDirectory, { recursive: true, force: true });

    const packageMarker = '/next/dist/compiled/@vercel/og/';
    const relativeStableDirectory = path.relative(path.dirname(file), stableDirectory);
    const normalizedStableDirectory = relativeStableDirectory.replaceAll('\\', '/');
    const rewrittenFiles = (manifest.files ?? []).map((entry) => {
      const normalizedEntry = entry.replaceAll('\\', '/');
      const markerIndex = normalizedEntry.indexOf(packageMarker);
      if (markerIndex === -1) return entry;

      const packageRelativePath = normalizedEntry.slice(markerIndex + packageMarker.length);
      return `${normalizedStableDirectory}/${packageRelativePath}`;
    });

    if (rewrittenFiles.some((entry, index) => entry !== manifest.files?.[index])) {
      manifest.files = rewrittenFiles;
      writeFileSync(file, JSON.stringify(manifest, null, 2), 'utf8');
    }
  }
}

function temporarilyMoveWindowsSharpPackages() {
  const backup = path.join(root, '.trace-cache', `cloudflare-sharp-${Date.now()}`);
  const candidates = [
    path.join(root, 'node_modules', 'sharp'),
    path.join(root, 'node_modules', '@img', 'sharp-win32-x64'),
  ];
  const moved: Array<{ source: string; target: string }> = [];

  for (const source of candidates) {
    if (!existsSync(source)) continue;
    const target = path.join(backup, path.relative(root, source));
    const parent = path.dirname(target);
    mkdirSync(parent, { recursive: true });
    renameSync(source, target);
    moved.push({ source, target });
  }

  return {
    restore() {
      for (const { source, target } of moved.reverse()) {
        if (existsSync(target) && !existsSync(source)) renameSync(target, source);
      }
    },
  };
}

function main() {
  if (process.platform !== 'win32') {
    runOpenNext(['build']);
  } else {
    const sharpPackages = temporarilyMoveWindowsSharpPackages();
    try {
      run('pnpm', ['--filter', '@trace/web', 'build']);
      materializeStandaloneSymlinks();
      prepareOpenNextAssetDirectories();
      stripSharpFromTraceManifests();
      removeSharpFromStandalone();
      materializeTracedVercelOgAssets();
      runOpenNext(['build', '--skipNextBuild']);
    } finally {
      sharpPackages.restore();
    }
  }

  normalizeWindowsOpenNextAssetImports();

  if (process.argv.includes('--deploy')) {
    runOpenNext(['deploy', '--env', 'staging']);
  }
}

main();
