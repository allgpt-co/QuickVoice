import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const store = resolve('node_modules/.pnpm');
const copies = readdirSync(store).filter((name) => /^braces@3\.0\.3(?:_|$)/.test(name));
assert.ok(copies.length, 'Expected installed, patched braces@3.0.3');
// pnpm may leave an unused unpatched copy in its virtual store. Verify each
// dependency link in every installed package, rather than those stale copies.
const paths = new Set();
for (const name of readdirSync(store)) {
  if (name.startsWith('braces@')) continue;
  try { paths.add(require.resolve(`${store}/${name}/node_modules/braces`)); } catch { /* no braces dependency */ }
}
assert.ok(paths.size, 'No installed braces dependency resolved');
for (const path of paths) {
  const braces = require(path);
  assert.deepEqual(braces.expand('a/{b,c}/d'), ['a/b/d', 'a/c/d']);
  for (const method of ['compile', 'expand', 'stringify']) {
    for (const input of ['{'.repeat(4000) + 'a,b' + '}'.repeat(4000), '('.repeat(4000) + 'x' + ')'.repeat(4000), '{'.repeat(4000)]) {
      assert.throws(() => braces[method](input), (error) => error instanceof SyntaxError && /depth/.test(error.message), `${path} ${method} must reject deep strings safely`);
    }
    let ast = { type: 'text', value: 'x' };
    for (let i = 0; i < 1000; i++) ast = { type: 'root', nodes: [ast] };
    assert.throws(() => braces[method](ast), (error) => error instanceof SyntaxError && /depth/.test(error.message), `${method} must reject deep ASTs`);
  }
}
console.log('Verified braces depth patch on all resolved dependency copies');
