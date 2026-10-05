import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

const root = new URL('../', import.meta.url).pathname;
test('server shell-expanded test globs include every test on Node 20', () => {
  const script = JSON.parse(readFileSync(join(root, 'apps/server/package.json'))).scripts.test;
  assert.match(script, /^tsx --test /);
  const selected = execFileSync('sh', ['-c', `printf '%s\\n' ${script.slice('tsx --test '.length)}`], { cwd: join(root, 'apps/server'), encoding: 'utf8' }).trim().split('\n').sort();
  const actual = readdirSync(join(root, 'apps/server/tests'), { recursive: true }).filter(name => name.endsWith('.test.ts')).map(name => `tests/${name}`).sort();
  assert.deepEqual(selected, actual);
});

test('deploy diff uses successful deployment job, includes missed commits and fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-deploy-diff-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  try {
    git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
    const commit = name => { writeFileSync(join(dir, name), name); git('add', '.'); git('commit', '-qm', name); return git('rev-parse', 'HEAD'); };
    const deployed = commit('deployed'); const missed = commit('missed'); const head = commit('head');
    mkdirSync(join(dir, 'bin'));
    writeFileSync(join(dir, 'bin/gh'), `#!/bin/sh\ncase "$*" in\n *workflows*) printf '2\\t${missed}\\n1\\t${deployed}\\n';;\n *runs/2/jobs*) printf 'Quality Summary\\n';;\n *runs/1/jobs*) printf 'Deploy Backend\\n'; seq 1 20000;;\n *) exit 1;;\nesac\n`, { mode: 0o755 });
    const env = { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, GITHUB_REPOSITORY: 'test/repo', SOURCE_SHA: head, DEPLOY_JOB: 'Deploy Backend' };
    const run = () => execFileSync('bash', [join(root, '.github/scripts/deploy-diff-base.sh')], { cwd: dir, env, encoding: 'utf8' }).trim();
    assert.equal(run(), deployed);
    assert.equal(git('diff', '--name-only', run(), head), 'head\nmissed');
    env.DEPLOY_JOB = 'Never Deployed'; assert.equal(run(), git('hash-object', '-t', 'tree', '/dev/null'));
    assert.equal(git('diff', '--name-only', run(), head), 'deployed\nhead\nmissed');
    writeFileSync(join(dir, 'bin/gh'), '#!/bin/sh\nexit 1\n'); assert.throws(run);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('normal deployment recovery re-runs CI on main and reusable jobs reject other branches', () => {
  const ci = YAML.parse(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'));
  assert.ok('workflow_dispatch' in ci.on);
  assert.equal(ci.jobs['deployment-changes'].needs, 'quality-summary');
  assert.match(ci.jobs['deployment-changes'].if, /refs\/heads\/main/);
  assert.match(JSON.stringify(ci.jobs['deployment-changes']), /deploy-diff-base.sh/);
  for (const file of ['backend-build.yml', 'deploy-mcp-server.yml']) {
    const workflow = YAML.parse(readFileSync(join(root, '.github/workflows', file), 'utf8'));
    for (const [name, job] of Object.entries(workflow.jobs)) assert.match(job.if, /github.ref == 'refs\/heads\/main'/, name);
  }
});

test('deployment detection preserves matches in large diffs under pipefail', () => {
  const ci = YAML.parse(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'));
  const step = ci.jobs['deployment-changes'].steps.find(step => step.name === 'Detect deployable changes from the tested push');
  const start = step.run.search(/^server=false$/m);
  assert.ok(start >= 0);
  const dir = mkdtempSync(join(tmpdir(), 'qv-deploy-detection-'));
  try {
    const padding = Array.from({ length: 20000 }, (_, i) => `docs/unchanged-scope-${i}.md`).join('\n');
    for (const [paths, expected] of [
      [['apps/server/src/index.ts', 'apps/ai/main.py', 'apps/mcp-server/src/index.ts'], 'server=true\nai=true\nmcp=true'],
      [['apps/server/src/index.ts'], 'server=true\nai=false\nmcp=false'],
      [[], 'server=false\nai=false\nmcp=false'],
    ]) {
      writeFileSync(join(dir, 'files'), [...paths, padding].join('\n'));
      writeFileSync(join(dir, 'outputs'), '');
      execFileSync('bash', ['-e', '-o', 'pipefail', '-c',
        'changed_files=$(cat "$QV_TEST_FILES")\nmcp_changed_files="$changed_files"\n' + step.run.slice(start)], {
        cwd: root,
        env: { ...process.env, QV_TEST_FILES: join(dir, 'files'), GITHUB_OUTPUT: join(dir, 'outputs'), GITHUB_STEP_SUMMARY: join(dir, 'summary'), SOURCE_SHA: 'test' },
        stdio: 'pipe',
      });
      assert.equal(readFileSync(join(dir, 'outputs'), 'utf8').trim(), expected);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
