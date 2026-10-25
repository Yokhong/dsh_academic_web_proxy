# Validation report — 0.2.1

[GUIDE](GUIDE.md) · [Compatibility and acceptance](COMPATIBILITY.md) · [Release procedure](RELEASING.md)

The local implementation runs below completed on Windows. They are not a live DSH installation, real browser-provider acceptance, hosted CI result, or publication. Final archive hashes and package-based smoke results are recorded in the separate release handoff: embedding the hash of an archive inside that same archive would be circular.

## Evidence levels

| Evidence | What was exercised | Boundary |
| --- | --- | --- |
| Old-version live baseline | A benign `example.com` page reproduced unknown `browser_execute` in the old plugin while the modern browser tool worked. | Diagnoses the name mismatch, not a live verification of the 0.2.1 fix. |
| Implementation regression | Actual 0.2.1 code with synthetic registry, browser, bridge, DOM, settings, and PDF fixtures. | No real accounts, papers, download UI, or operating-system foreground proof. |
| Real SDK dependency trees | Published tools/system-prompt/scope SDK `0.2.0-rc.2` and `0.2.1-rc.2`; Cordis `4.0.4` and `4.0.5` respectively. | Browser/provider behavior remains simulated. |
| Published browser tool-layer contracts | Byte-identical published `0.3.1` and `0.4.15` tool modules, actual SDK definitions, and a strict synthetic registry/provider. | Not Electron or another live provider, not a full DSH host, and not every declared `0.3.x` release. Detailed contract results accompany the release. |
| Independent code review | Scoped source review and small in-memory probes; inherited-scope family selection and legacy restriction lifetime issues were corrected. | Not a security certification or exhaustive audit. |
| Post-fix live provider / remote services | Not exercised. | No live 0.2.1 install, institutional login, CAPTCHA, paper download, settings-window rendering, hosted CI, npm publication, GitHub release, or market change is claimed. |

## Completed source matrix

Each row ran the complete suite with `node --test --experimental-test-isolation=none test/*.test.js` and the manifest/bundle/syntax check. The check inspected 17 JavaScript modules.

| OS / architecture | Node | tools/system-prompt/scope SDK | Cordis | Tests | Passed | Failed / cancelled / skipped / todo |
| --- | --- | --- | --- | --- | --- | --- |
| Windows / x64 | 22.19.0 | 0.2.0-rc.2 | 4.0.4 | 264 | 264 | 0 / 0 / 0 / 0 |
| Windows / x64 | 22.23.4 | 0.2.0-rc.2 | 4.0.4 | 264 | 264 | 0 / 0 / 0 / 0 |
| Windows / x64 | 24.19.0 | 0.2.0-rc.2 | 4.0.4 | 264 | 264 | 0 / 0 / 0 / 0 |
| Windows / x64 | 24.19.0 | 0.2.1-rc.2 | 4.0.5 | 264 | 264 | 0 / 0 / 0 / 0 |

npm was `11.17.0`; `pdf-lib` was `1.17.1`. Official portable Node 22 binaries were checked against their published SHA-256 lists. Installation scripts were disabled during isolated dependency setup, and empty private npm configurations avoided personal credentials. The old SDK lock remains the reproducible source baseline; current-SDK runs used a separate dependency overlay.

A rerun of the validation harness initially mixed the old source lockfile into its current-SDK install root and correctly failed with `ERESOLVE`. The harness was fixed to separate dependency and source directories; the clean final run above passed without `--force` or `--legacy-peer-deps`. Earlier exploratory runs are not substituted for these final counts.

Node minimum remains `>=22.19`. DSH and all three SDK peers declare `>=0.2.0-rc.2 <0.3.0 || 0.2.1-rc.2`: npm semver excludes the later-patch prerelease from the original range, so only this exercised prerelease is explicitly added. No claim is made for `0.2.1-rc.3`. Optional browser peer is `0.3.x || 0.4.15`; the whole `0.3.x` range has not been tested. Linux/macOS and other unrun matrix cells remain unverified; the repository CI configuration is not a hosted CI pass.

## Historical settings compatibility

The restored 0.1.0 and 0.2.0 `SettingsStore` implementations generated synthetic files in a new isolated folder. The 0.2.1 store loaded each without rewriting it, preserved proxy values and revision numbers, supplied the missing 0.1 preferences, and retained all saved 0.2 language/naming preferences. These checks passed. No historical source or real profile configuration was modified. Unit regressions additionally check the subsequent revision increment and persistence.

## Safety contracts covered

- Legacy-only, modern-only, mixed, partial-modern, unavailable, denied, and cancelled registration; modern-family preference; no legacy retry or family switch within an operation.
- Modern tools inherited from an ancestor but hidden in a child scope are still recognized as modern registration. Public `scopeChainOf` is read-only evidence; execution never moves to the ancestor to bypass the task's restrictions.
- Nested calls preserve root, parent token, agent, signal, and host dispatch. Legacy `browser_restrict` bookkeeping remains plugin-wide; modern `dsh_browser_restrict` bookkeeping remains task-scoped. The plugin does not strengthen an older provider's isolation.
- Production `taskScoped: false` fails closed to `tools-only`, without unscoped bridge discovery, page evaluation, navigation, background metadata capture, or forced presentation. Synthetic task-scoped bridge tests do not change that production limitation.
- Separate tool registration, automatic-monitoring, and renaming states; profile registration is not a task permission guarantee, and `providerVerified` stays false.
- Login/challenge checks immediately before the final download click, including after metadata capture; no further blocked-page interaction after detection; only explicit `clicked: true` is accepted. Click success never establishes a saved file.
- Exact proxy hostnames and templates, settings validation/revisions/atomic storage, three languages, and 0.1/0.2 settings preservation. Language/naming edits preserve proxy pending and loop-guard state. Missing-`settings` POSTs cannot reset configuration.
- Existing conservative PDF matching, temporary-file observation, two-second stability, 64 MiB bound, baseline exclusion, identity checks, ambiguity handling, cancellation, collisions, rollback, byte preservation, and guarded same-folder naming.

## Release artifact evidence

The release handoff provides these separate files:

- `source-inventory.json`: the reviewed public source file list and per-file SHA-256 values, with the upstream baseline and changes described separately in `source-changes.json`.
- `artifact-inspection.json`: actual npm and source-ZIP member counts, sizes, hashes, and byte comparisons against the clean source.
- `release-validation.json`: source matrix, settings compatibility, browser tool-layer contracts, isolated installed-package smoke results, and explicit unperformed-live-testing boundaries.
- `privacy-audit.json`: publication-file scan, reviewed synthetic credential-URL fixtures, exclusions, and relative documentation links.
- `SHA256SUMS.txt`: final distributed-file checksums, including the archive and reports. The checksum list does not contain its own hash.

These reports and private validation scripts are not runtime package contents. The runtime archive contains source, client, manifest, bundle, documentation, license, and notice; it excludes tests, check scripts, the source lockfile, caches, dependency trees, personal settings, and private validation material. Package-based validation uses the produced archive, not an earlier tree. Any claim about the final archive's bytes belongs to its actual handoff reports rather than an embedded self-hash.

## Reproduce from complete source

```sh
npm ci --ignore-scripts
npm run check
npm test
mkdir dist
npm pack --pack-destination dist
```

Reuse `dist` if present. `prepack` runs the checks and suite. Inspect the produced `dsh-academic-web-proxy-0.2.1.tgz`. Rebuild from complete source, not extracted runtime files whose omitted test scripts are needed by `prepack`. Preserve the already published `v0.2.0` tag; later authorized publication requires a new version and tag.

## Manual acceptance boundary

[Compatibility](COMPATIBILITY.md#deployment-acceptance) gives a future, separately authorized acceptance checklist. Real settings rendering, the intended browser provider, task isolation, institutional login/CAPTCHA, actual control-driven saving, and OS/filesystem behavior remain distinct checks. None passed merely because an offline fixture passed.

The folder watcher is still a filesystem heuristic: observed temporary disappearance, a stable valid PDF, and uniquely matching prior metadata establish eligibility, not a native browser completion event or the creating task's identity. A click, cached metadata, stable size alone, enabled preference, or mode `ready` does not establish saving or renaming. Browser download-history paths are not updated after renaming. Unsupported or untested combinations remain unverified.
