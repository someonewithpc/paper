// Publishes the workspace packages with one 2FA code. npm's default web login asks for 2FA on
// every `npm publish`; a code passed as --otp skips that, and the registry accepts the same code
// until it expires, so one prompt covers the whole run. A code that runs out mid-run (EOTP) asks
// for a fresh one and carries on from that package. Versions already on the registry are skipped,
// so a run that stopped halfway can be started again. `--dry-run` goes to npm publish alone.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packages = root.workspaces
  .map((dir) => ({ dir, manifest: JSON.parse(readFileSync(new URL(`../${dir}/package.json`, import.meta.url), 'utf8')) }))
  .filter(({ manifest }) => !manifest.private);

const dryRun = process.argv.includes('--dry-run');
const npm = (args, stdio = 'inherit') => spawnSync('npm', args, { stdio, encoding: 'utf8' });

const published = ({ name, version }) =>
  npm(['view', `${name}@${version}`, 'version'], 'pipe').stdout.trim() === version;

const pending = packages.filter(({ manifest }) => !published(manifest));
if (pending.length === 0) {
  console.log('Every package is already on the registry at its version.');
  process.exit(0);
}

for (const step of ['build', 'check:package']) {
  if (npm(['run', step]).status !== 0) process.exit(1);
}

const ask = async (question) => {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await prompt.question(question)).trim();
  } finally {
    prompt.close();
  }
};

console.log(`\nTo publish: ${pending.map(({ manifest }) => `${manifest.name}@${manifest.version}`).join(', ')}`);
let otp = process.env.NPM_OTP ?? await ask('2FA code from your authenticator (empty to approve each one in the browser): ');

for (const { dir, manifest } of pending) {
  for (;;) {
    const args = ['publish', '--workspace', dir, '--access', 'public', ...(dryRun ? ['--dry-run'] : []), ...(otp ? ['--otp', otp] : [])];
    const run = spawnSync('npm', args, { stdio: ['inherit', 'inherit', 'pipe'], encoding: 'utf8' });
    process.stderr.write(run.stderr);
    if (run.status === 0) break;
    if (otp && /EOTP|one-time pass/i.test(run.stderr)) {
      otp = await ask(`The code expired before ${manifest.name}. New code: `);
      continue;
    }
    console.error(`\n${manifest.name} failed. Fix it and run the release again; published packages are skipped.`);
    process.exit(1);
  }
}

console.log(dryRun ? '\nDry run done, nothing published.' : '\nPublished. Check with: npm view @someonewithpc/paper version');
