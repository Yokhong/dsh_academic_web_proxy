import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'dsh-academic-web-proxy');
assert.equal(manifest.version, '0.2.0');
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
assert.equal(lock.version, manifest.version);
assert.equal(lock.packages[''].version, manifest.version);
assert.equal(lock.packages[''].dependencies['pdf-lib'], manifest.dependencies['pdf-lib']);
assert.equal(manifest.dependencies['pdf-lib'], '1.17.1');
assert.ok(manifest.keywords.includes('dsh-plugin'));
assert.equal(manifest.publishConfig.access, 'public');
assert.equal(manifest.repository.url, 'git+https://github.com/Yokhong/dsh_academic_web_proxy.git');
assert.equal(manifest.dsh.manifestVersion, 1);
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
for (const path of [manifest.main, manifest.exports['./client'], manifest.dsh.bundle.patch, 'README.md', 'README.en.md', 'LICENSE', 'NOTICE', 'docs/GUIDE.md', 'docs/PRIVACY.md', 'docs/UPGRADING.md', 'docs/COMPATIBILITY.md', 'docs/RELEASING.md', 'docs/VALIDATION.md', 'src/download-monitor.js', 'src/file-renamer.js', 'src/pdf-identity.js', 'src/paper-metadata.js', 'src/filename.js']) await access(resolve(root, path));
const { DEFAULT_SETTINGS } = await import('../src/settings.js');
assert.equal(DEFAULT_SETTINGS.renameEnabled, false);
assert.equal(DEFAULT_SETTINGS.downloadDirectory, '');
assert.equal(DEFAULT_SETTINGS.language, 'zh-CN');
assert.deepEqual(DEFAULT_SETTINGS.namingFields, ['title', 'year', 'platform']);
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
