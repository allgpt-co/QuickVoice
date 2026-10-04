import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
test('installed braces rejects deep patterns and ASTs without stack exhaustion', () => {
  execFileSync(process.execPath, ['scripts/verify-braces-patch.mjs'], { timeout: 10_000, stdio: 'pipe' });
});
