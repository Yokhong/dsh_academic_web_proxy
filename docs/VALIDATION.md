# Validation report — 0.2.0

[GUIDE](GUIDE.md) · [Compatibility and acceptance](COMPATIBILITY.md) · [Release procedure](RELEASING.md)

The v0.2.0 source and installable package were checked independently of v0.1.0. The release uses a 48-file public source snapshot; private build caches, generated fixtures and local validation scripts are excluded. Artifact hashes and sizes are recorded in the accompanying delivery report and checksum files, outside the archives they identify.

## Observed release evidence

| Check | Observed result |
| --- | --- |
| Clean source installation | `npm ci --ignore-scripts --no-audit --no-fund` succeeded in an isolated copy of the 48 allowlisted source files; 27 dependency packages installed. |
| Manifest, bundle, defaults and syntax | `npm run check` passed, including all 16 runtime/client JavaScript files, matching 0.2.0 manifest and lockfile, required documentation and bundle metadata. |
| Complete automated suite | **225 tests, 225 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo** using `npm test`. The pack lifecycle also passed these checks. |
| Runtime package | The actual `dsh-academic-web-proxy-0.2.0.tgz` contains **29 files**. Its manifest, source, client, bundle, documentation and license payload were inspected; each payload file was compared with the source. Sizes, SHA-256 and npm integrity belong to the accompanying artifact report. |
| Installed-package smoke check | Installed the actual `.tgz` into an isolated npm project with pinned supported SDK peers. Confirmed local dependency resolution, 4 tools, 3 host API routes, 1 prompt section, blank proxy defaults and persistence of all 3 languages in a synthetic profile. This is a host-contract fixture, not a live DSH installation. |
| Installed-package file handling | Two synthetic PDF download sequences renamed successfully using different selected field combinations. Confirmed byte-for-byte PDF preservation, numbered collision handling without overwriting the existing file, and preservation of a pre-existing PDF. |
| Publication/privacy review | Allowlisted public source, documentation links and archive contents checked. No detected personal paths, real proxy configurations, credentials, private documents or generated dependency/cache/runtime files are included. Generic credential-like URL fixtures were reviewed as deliberate rejection/redaction tests. |
| Live DSH/Desktop/browser acceptance | **Not performed for v0.2.0.** No live institutional login, CAPTCHA, download, settings-window rendering, or DSH CLI plugin installation is claimed. The existing installed profile was not modified. |
| Remote CI and publication | **Not performed.** Workflow files are provided, but no hosted CI run, npm publish, GitHub release upload or market PR is claimed. |

The local automated environment was Windows, Node.js `24.19.0` and npm `11.17.0`. SDK checks used `@deepseek-ai/cordis` `4.0.4` and DSH SDK packages `0.2.0-rc.2`. Real file operations used an isolated local folder; filesystem type was not separately inventoried. Linux/macOS behavior and a live Desktop/browser version were not verified in this run. Public source is delivered as a file snapshot rather than a newly committed revision; consult its accompanying hash inventory for exact identity.

The declared runtime remains Node.js `>=22.19`, DSH `>=0.2.0-rc.2 <0.3.0`, and optional `dsh-builtin-browser` `0.3.x`. Native browser `4.1` download APIs were reviewed only; integration and native-completion testing are not claimed.

## Automated coverage

The passing suite exercises:

- Proxy routing, independent hostname lists, template validation, loop protection, settings revisions and atomic storage, profile isolation, exact-tab handoff, browser restrictions, and policy-preserving tool calls.
- Three complete language dictionaries and plugin-local language persistence; default `zh-CN`, disabled renaming, empty directory, fixed `title/author/year/venue/platform` order and `title/year/platform` defaults.
- Loading version-1 settings with defaults for new fields; rejecting invalid paths, values and unknown fields without overwriting settings.
- Citation/DC/PRISM/JSON-LD article extraction, first author, explicit publication year, known platforms, missing fields, current-page identity and capture before dispatching a real download-control click.
- Exclusion of baseline files and already-running temporary downloads; new `.pdf.crdownload`/`.pdf.part`, temporary-file disappearance, stable final identity, expiry, bounded queues, cancellation, disablement and reconfiguration.
- Bounded unencrypted PDF parsing, terminal cross-reference/EOF validation, changing-file rejection, PDF Info DOI/title extraction, compatible record merging, conflicting identity and generic-title rejection, and no inferred publication year from file dates.
- Safe filenames, Unicode, reserved names, field order, missing values, collisions, same-folder hard-link/unlink behavior, cancellation cleanup, filesystem errors and no overwrite.
- Skips for ambiguous or unrelated downloads, missed temporary files, old files, subfolders, symbolic links, existing multiple hard links and invalid PDFs.
- Bounded status, at most ten in-memory basenames, and omission of configured directory/template values from status.

Synthetic PDFs establish the tested file invariants but cannot establish that a particular publisher supplies usable metadata. Mocked client/bridge tests cannot prove a real settings window rendered or a browser window came to the foreground.

## Reproduce from public source

```sh
npm ci --ignore-scripts
npm run check
npm test
mkdir dist
npm pack --pack-destination dist
```

Reuse `dist` if it already exists. `prepack` checks the source and runs the suite. Inspect the resulting archive and test that archive, not an earlier working tree. Runtime archives omit source-only tests, check scripts and the lockfile; use the full source checkout for rebuilding or npm publication.

Scan each new source snapshot and package for credentials, real proxy templates, personal directory paths, runtime settings, private metadata, cookies and build artifacts. Keep private validation outside the published payload.

## Manual acceptance boundary

Follow [Compatibility](COMPATIBILITY.md#deployment-acceptance) in the intended deployment. Check settings rendering in all three languages, upgrade persistence, institutional login/CAPTCHA in the original tab, real control-driven saving, an eligible rename with unchanged bytes, skip cases, collision handling, a hard-link failure case, profile separation and shutdown.

The watcher is a filesystem heuristic. An observed temporary file disappearing, a stable valid PDF and matching prior metadata form the eligibility rule; this is not a native completed-download event. A click, metadata capture, stable size alone or `ready` status does not prove a file was saved or renamed.

Browser download-history paths are not updated after renaming. Confirm the actual filename in the configured folder. Unsupported or untested browser/filesystem combinations remain unverified.
