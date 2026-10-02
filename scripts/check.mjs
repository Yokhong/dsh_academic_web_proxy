import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'dsh-academic-web-proxy');
assert.equal(manifest.dsh.manifestVersion, 1);
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
for (const path of [manifest.main, manifest.exports['./client'], manifest.dsh.bundle.patch, 'README.md', 'README.en.md', 'LICENSE', 'NOTICE']) await access(resolve(root, path));
const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8');
assert.match(patch, /name: dsh-academic-web-proxy\s*$/m);
assert.doesNotMatch(patch, /name: dsh-builtin-browser/);
const files = [join(root, 'client.js'), ...(await readdir(join(root, 'src'))).filter(file => file.endsWith('.js')).map(file => join(root, 'src', file))];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Syntax check failed: ${file}`);
}
console.log(`Checked manifest, bundle and ${files.length} JavaScript files.`);
