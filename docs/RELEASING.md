# Releasing to GitHub and npm

The repository is [Yokhong/dsh_academic_web_proxy](https://github.com/Yokhong/dsh_academic_web_proxy). The npm package name is `dsh-academic-web-proxy`. GitHub hosting and npm publication are separate operations.

This project uses native ESM and has no compiled runtime output. Release from a source checkout, where the checks and tests are available.

## Before a release

1. Confirm permission to publish the package name with your npm account. `npm view dsh-academic-web-proxy name` can check whether a package already exists under that name; it does not establish ownership.
2. If a different or scoped package name is needed, update `package.json`, the plugin resolution name in `cordis.patch.yml`, the lockfile, and installation examples. Keep only one active instance in a DSH profile.
3. Complete the deployment checks in [COMPATIBILITY.md](COMPATIBILITY.md) for the intended DSH/Desktop versions and institutional templates. Record which live scenarios were actually tested.
4. Update the version and `CHANGELOG.md`; keep `package.json` and `package-lock.json` aligned.
5. Generate and inspect the package from the source checkout.

PowerShell example:

```powershell
npm ci --ignore-scripts
npm run check
npm test
New-Item -ItemType Directory -Force dist | Out-Null
npm pack --pack-destination dist
```

`npm pack` runs `prepack`, which checks syntax, manifest, documentation, and tests. For an additional file-list inspection after those checks have passed, use:

```powershell
npm pack --dry-run --ignore-scripts
```

The package has no install or prepare hook that downloads browsers. Its checks and tests are intentionally omitted from the runtime tarball, so rebuilding a package from an extracted runtime tarball is not supported; use the source repository instead.

## GitHub repository

Commit source, documentation, tests, the lockfile, and repository configuration. Generated dependencies, caches, logs, test fixtures created at runtime, and archives are excluded by `.gitignore`. Check the actual staged file list before committing; ignore rules do not remove files already tracked by Git.

When initializing a new local checkout for this repository:

```powershell
git init
git add .
git status --short
git diff --cached --stat
git commit -m "Add DSH academic web proxy plugin"
git branch -M main
git remote add origin https://github.com/Yokhong/dsh_academic_web_proxy.git
git push -u origin main
```

If Git is already initialized or `origin` already exists, use the existing configuration instead of repeating those setup commands. Include `.github/workflows/ci.yml`, `.gitignore`, and `.npmrc` when uploading files through the GitHub website.

The CI workflow runs checks, tests, and packaging with read-only repository contents permission. It does not contain npm credentials or publish packages. Remote results appear in GitHub Actions after a run completes.

## npm publication

Review the generated file list and authenticate using the intended npm account. Never put authentication tokens in this repository or its `.npmrc`.

```powershell
npm login
npm publish --access public
```

After the desired version is available on npm, users can install it by package name through DSH's plugin manager. A `.tgz` attached to a GitHub Release also supports local archive installation without npm registry publication.

If adopting npm trusted publishing, configure the repository and workflow in npm first, then add a dedicated release workflow. The included CI workflow only validates the project.

## Runtime package contents

The `files` allowlist in `package.json` includes `src/`, `client.js`, `cordis.patch.yml`, both README languages, `docs/`, `LICENSE`, `NOTICE`, and `CHANGELOG.md`. npm also includes `package.json`. Tests, scripts, CI configuration, and the lockfile remain in the source repository for reproduction.

Use DSH's plugin manager for installation and removal so that the bundle is applied correctly. The plugin needs no changes to another plugin's Cordis patch, existing browser providers, or DSH application files.
