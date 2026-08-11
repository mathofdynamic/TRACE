import { readFile } from 'node:fs/promises';
import { parseArtifact, validateTraceDirectory } from './index.js';

const [command, target] = process.argv.slice(2);

if (command === 'validate') {
  const issues = await validateTraceDirectory(target ?? '.trace');
  if (issues.length) {
    console.error(JSON.stringify({ valid: false, issues }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ valid: true }, null, 2));
  }
} else if (command === 'inspect' && target) {
  const artifact = parseArtifact(await readFile(target, 'utf8'));
  console.log(
    JSON.stringify(
      { metadata: artifact.metadata, markdownBytes: Buffer.byteLength(artifact.markdown) },
      null,
      2,
    ),
  );
} else {
  console.error('Usage: trace-schema validate <.trace-path> | trace-schema inspect <artifact.md>');
  process.exitCode = 2;
}
