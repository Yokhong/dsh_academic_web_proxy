# Releasing 0.2.1

[GUIDE](GUIDE.md) · [Compatibility](COMPATIBILITY.md) · [Validation report](VALIDATION.md) · [Upgrading](UPGRADING.md)

This procedure prepares source and an installable package for review. A local build, test run, or documentation update does not publish anything. GitHub source, a release tag/asset, npm publication, and a catalog change are separate actions. No remote publication, live installation, real account, paper, or download acceptance is performed as part of this documentation work.

## Prepare the source

Use a complete source checkout containing `scripts`, `test`, and the lockfile. Confirm the intended release revision and that `package.json`, `package-lock.json`, and `CHANGELOG.md` agree on `0.2.1`. The package remains `dsh-academic-web-proxy`; the repository is `Yokhong/dsh_academic_web_proxy`. The underscore/hyphen difference is intentional.

The new fix must receive a new `v0.2.1` tag and npm `0.2.1`. Do not move, overwrite, or relabel the already published `v0.2.0` tag, or imply that installing npm `0.2.0` includes these fixes. Do not claim `0.2.1` is publicly available before publication is confirmed.

Keep Node.js `>=22.19` and the original DSH/SDK minimum with range `>=0.2.0-rc.2 <0.3.0 || 0.2.1-rc.2`. npm semver excludes the later-patch prerelease from the old range; the explicit exception covers the actual isolated real-SDK `0.2.1-rc.2` run, alongside `0.2.0-rc.2`, without admitting unverified `0.2.1-rc.3`. Browser responses in those SDK runs remain stubs; final source results are recorded in [Validation](VALIDATION.md). The optional `dsh-builtin-browser` peer is `0.3.x || 0.4.15`; representative `0.3.1` / `0.4.15` interface review is not an all-version test claim. The PDF dependency and lockfile must be present for clean source installs.

Review both READMEs and [GUIDE](GUIDE.md) against the final implementation:

- Legacy `browser_*` and modern `dsh_browser_*` tools dispatch through host `ctx.tools.get` / `execute` with approval, token, agent, and signal context. Partial modern registration, denial, or cancellation cannot trigger legacy fallback; an operation does not switch families.
- Production DesktopBridge cannot prove current-task ownership. Background scanning, automatic proxy redirects, background metadata capture, and forced presentation are disabled; enabled/configured mode is `tools-only`. Manual navigation requires explicit proxy tools. This is a safety change, not feature parity. Preserve provider policy limits, including plugin-wide restrict in representative `0.3.1` versus task-scoped restrict in `0.4.15`.
- Registration evidence (`toolCompatibility`, including `providerVerified: false` and profile/task scope), `automaticMonitoring`, and `renaming.enabled` / `renaming.ready` / `renaming.mode` are separate. Settings-page profile scope is not a current-task guarantee.
- Final clicks always recheck login/challenge and require explicit `clicked: true`; blocked pages are not touched again to force handoff. Clicks do not prove saved files.
- Existing 0.1/0.2 settings remain compatible. Language/naming edits preserve proxy pending/loop-guard state; missing-`settings` POSTs are rejected, not resets.
- Conservative renaming remains opt-in with an explicit local folder, observed temporary file, disappearance, matching final PDF stable for at least two seconds, maximum 64 MiB, prior unique metadata, and no overwrite. It is neither a native completion event nor support for every download.

Do not include runtime settings, real institutional templates, actual user directory paths, credentials, cookies, browser endpoint details, personal PDFs, raw personal logs, or generated dependency folders in published source or artifacts. Keep synthetic validation fixtures clearly separate from private data.

## Build and inspect

From the source root:

```sh
npm ci --ignore-scripts
npm run check
npm test
mkdir dist
npm pack --pack-destination dist
npm pack --dry-run --json
```

Reuse `dist` if it already exists. `npm pack` runs `prepack`, which repeats required checks and tests. The expected archive is `dist/dsh-academic-web-proxy-0.2.1.tgz`. Inspect the actual archive; record its integrity/hash, size, and file count from that artifact, not an earlier release. Final validation placeholders must be filled only after the source and artifact are frozen.

The runtime payload should contain the manifest, runtime source, client entry, Cordis patch, documentation, license, and notice. Development test/check scripts and the source lockfile are not runtime payloads. Because `prepack` references source-only scripts, rebuild or publish from the complete source checkout rather than an extracted runtime tarball.

An isolated npm install and host-contract smoke check using real SDK packages plus browser stubs must be labeled as such. It is not a live DSH CLI installation or real browser provider test. Keep final automated matrices, settings migration results, SDK/stub results, artifact inspection, and privacy review in [Validation](VALIDATION.md). Do not copy 0.2.0 counts or treat an in-progress run as passed.

Live host installation and browser/filesystem acceptance are separate, explicitly authorized work. Follow [Compatibility](COMPATIBILITY.md) only in that authorized environment; until exercised, settings-window rendering, SSO/CAPTCHA handoff, real saving, and provider behavior remain unverified. Local Windows results do not establish Linux/macOS behavior. CI workflow files are not successful hosted runs.

## Public source, npm, and release assets

After review and authorization, publish the exact validated 0.2.1 source and create its new tag. Before npm publication, confirm permission to publish the exact package name. A public metadata lookup does not establish package ownership. The repository field must point to `https://github.com/Yokhong/dsh_academic_web_proxy`.

Publish npm `0.2.1` from the checked source through the maintainer's authorized release process, then verify the published version and payload before recommending the install command:

```sh
dsh plugin --profile your-profile add dsh-academic-web-proxy@0.2.1
```

If the npm name must change, update the manifest, matching lockfile package entry, Cordis bundle resolution name, and install examples together in a separately scoped change. A source repository name and npm name need not be identical.

A GitHub Release `.tgz` is an alternative distribution artifact, not npm publication. Upload only the inspected archive and verify the actual asset URL before documenting it; do not invent a URL from a planned tag. A `/releases/latest/download/` URL needs a stable version-free asset basename; otherwise use the verified versioned asset URL. None of these actions occurs merely by running the local build steps.

## Existing market entry

If the project already has a market entry, releasing a new package version normally does not require another entry or duplicate submission. If its original catalog PR is still open, continue that PR instead of submitting a duplicate. Update the existing entry only if its description or distribution URL genuinely needs to change, using the market's current contribution rules and a separate authorized change. In particular, any old automatic-monitoring promise should not remain in a description of 0.2.1.

Do not treat a market listing as a security audit, npm publication, or live compatibility verification. A separate maintainer submission draft is not a published catalog change and should not be copied wholesale into the catalog. This work performs no market PR, registry change, release upload, or remote publication.

Reference links for the maintainer's later release work: [project](https://github.com/Yokhong/dsh_academic_web_proxy), [market contribution guide](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md), and [npm discovery](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/scripts/probe-npm.mjs). These links were not used for new network research in this task.
