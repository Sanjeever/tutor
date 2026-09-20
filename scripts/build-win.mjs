import { spawnSync } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const artifactNames = [
  ['nsis', 'tutor-${version}-${arch}-setup.${ext}'],
  ['portable', 'tutor-${version}-${arch}-portable.${ext}'],
];

for (const [target, artifactName] of artifactNames) {
  const result = spawnSync(
    pnpm,
    ['exec', 'electron-builder', '--win', target, `--config.win.artifactName=${artifactName}`],
    { stdio: 'inherit', cwd: process.cwd(), shell: process.platform === 'win32' },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
