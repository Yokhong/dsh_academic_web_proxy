# Changelog

## 0.2.1 — release preparation

- Fix browser registry compatibility across legacy `browser_*` and modern `dsh_browser_*` names. Use host `ctx.tools.get` and `execute` with approval, token, agent, and signal context intact. Prefer modern registration; do not fall back on partial modern registration, denial, or cancellation, or switch families within an operation. Read ancestor registration evidence with public `scopeChainOf` so child-scope restrictions hiding modern tools cannot cause legacy fallback; do not execute through an ancestor to bypass the current scope. The explicit `dsh-scope` peer was already present in the old lockfile and does not introduce a new SDK version.
- Keep Node.js `>=22.19` and the DSH/SDK minimum while adding the exact prerelease exception: `>=0.2.0-rc.2 <0.3.0 || 0.2.1-rc.2`. npm semver excludes this later-patch prerelease from the original range; real SDK `0.2.0-rc.2` and `0.2.1-rc.2` have isolated offline run evidence, with the final matrix recorded in [Validation](docs/VALIDATION.md). Do not infer support for unverified `0.2.1-rc.3`. Preserve the existing 0.1/0.2 version-1 settings envelope. Declare optional browser peer `0.3.x || 0.4.15`; representative `0.3.1` / `0.4.15` interface review does not establish all-version or real-provider verification. Respect the provider's restrict scope: plugin-wide in `0.3.1`, task-scoped in `0.4.15`. Restriction bookkeeping treats legacy `browser_restrict` as global and modern `dsh_browser_restrict` as task-scoped; it preserves, not strengthens, upstream isolation.
- Safely degrade production DesktopBridge to `tools-only` when enabled and configured because `taskScoped: false` cannot prove current-task ownership. Disable background page scanning, automatic navigation redirects, background metadata capture, and forced tab presentation; do not probe windows to recover ownership. Manual navigation needs explicit `academic_proxy_open` / `academic_proxy_check`. This is not automatic-monitor feature parity.
- Separate registration evidence (`toolCompatibility`: `registered` / `partial` / `unavailable`, `prefix`, `scope`, `providerVerified: false`) from `automaticMonitoring` and `renaming.enabled` / `renaming.ready` / `renaming.mode`. Settings-page profile scope is not a current-task guarantee; a restricted ready-mode naming watcher is paused, not ready to process.
- Always recheck login and human verification immediately before the final download click, including after metadata capture. Stop without extra blocked-page access; require explicit browser `clicked: true` and do not equate a click with a saved or renamed file.
- Preserve proxy pending-human-action and loop-guard state on language/naming edits. Reject a settings POST missing `settings` instead of resetting configuration. Keep missing 0.1 preference defaults and existing 0.2 preferences.
- Leave the conservative renaming algorithm unchanged: observed new temporary file, disappearance, matching final PDF stable for at least two seconds, maximum 64 MiB, and a unique match to prior article metadata. It is not a native download-completion event or support for every download.
- Prepare a new `v0.2.1` tag and npm `0.2.1`; do not modify the published `v0.2.0` tag. The existing market entry normally needs no duplicate submission. No remote publication is performed in this work.
- Record four complete local matrix rows, each 264/264 passed, in [Validation](docs/VALIDATION.md), separating implementation regressions, real SDK with browser stubs, and unverified real-provider behavior. The old live baseline reproduced only an unknown `browser_execute` on `example.com`; no 0.2.1 live installation, account, paper, or real download acceptance is claimed.

## 0.2.0 — historical release

The profile-scoped automatic monitoring and presentation described for this release are superseded by the 0.2.1 tools-only safety change.

- Add plugin-local Simplified Chinese (`zh-CN`, default), Traditional Chinese (`zh-TW`), and US English (`en-US`) settings with automatic persistence.
- Add opt-in PDF filename settings: renaming off, no download folder selected, and `title/year/platform` selected by default. Available fields follow the fixed `title/author/year/venue/platform` order; author means first author.
- Capture article metadata from ready same-profile academic pages and before a real download-control click, using public citation/DC/PRISM/ScholarlyArticle metadata with bounded fallbacks and no cloud lookup.
- Add conservative local-folder observation of newly appearing `.pdf.crdownload` and `.pdf.part` files. Rename only after the temporary file disappears, the new matching final PDF is stable for two seconds, and an unencrypted valid PDF no larger than 64 MiB uniquely matches article metadata captured before the temporary download was observed.
- Use PDF Info DOI or exact sufficiently long normalized title for identity. Keep original names when evidence is missing, ambiguous, late, corrupt, encrypted, oversized, or outside the supported folder/file conditions. Do not infer publication year from PDF dates or claim native browser completion events.
- Sanitize selected filename components, omit missing fields, preserve the original name when no selected values exist, and use guarded same-folder hard-link/unlink renaming with numbered collision suffixes and no overwrite.
- Bound article metadata and pending downloads to 100 entries each with 30-minute expiry; keep at most ten recent filename outcomes in memory without absolute paths. Exclude baseline files, subfolders, symbolic links, and existing multiple hard links. Browser history can retain the old filename.
- Preserve the version-1 settings envelope and prior proxy values, with defaults for new fields. Document backup and rollback requirements because 0.1 can reject newly saved fields.
- Retain the 0.1 login/CAPTCHA prompt and original-tab handoff behavior. Keep that release's engine ranges and `dsh-builtin-browser` `0.3.x` peer; no native download-completion integration or live-provider verification was claimed.
- Add user, privacy, upgrade, compatibility, and release guides plus a separate market submission draft. Release checks and live acceptance are reported in `docs/VALIDATION.md`; release preparation does not mean public publication.

## 0.1.0

- Add an independent DSH Settings section with two initially blank, persisted URL schemes.
- Include 47 public academic hostnames as one toggleable default group, plus an independent custom-host list.
- Implement exact hostname selection, URL encoding, HTTPS protection and redirect-loop guards.
- Add profile-scoped Desktop sidebar monitoring and exact-tab login/CAPTCHA presentation through the existing browser bridge.
- Add four policy-preserving academic browser tools and a real DOM download-button workflow.
- Include optimistic settings revisions, atomic persistence, compatibility fixtures and npm/GitHub release instructions.
- Document supported browser backends and validation boundaries; institution-specific login and final file saving require deployment acceptance testing.
