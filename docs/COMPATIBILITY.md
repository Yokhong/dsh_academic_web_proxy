# Compatibility and deployment acceptance — 0.2.1

[GUIDE](GUIDE.md) · [Validation report](VALIDATION.md) · [Privacy](PRIVACY.md)

## Declared targets

| Component | Declared target or requirement | Verification boundary |
| --- | --- | --- |
| Node.js | `>=22.19` | The minimum is unchanged; configured CI jobs are not completed validation runs. |
| DSH / dsh-tools / system-prompt / dsh-scope | `>=0.2.0-rc.2 <0.3.0 || 0.2.1-rc.2` | Keep the old minimum and explicitly admit only the verified later-patch prerelease; this is not support for unverified `0.2.1-rc.3`. |
| Cordis | `^4.0.4` | Existing plugin lifecycle and dependency contract. |
| dsh-builtin-browser | Optional peer `0.3.x || 0.4.15` | Representative `0.3.1` and `0.4.15` interface structures were reviewed; this is not proof that all versions or real providers passed. |
| Production DesktopBridge | `taskScoped: false` | Profile identity cannot prove current-task ownership; no production background page monitoring or forced presentation. |
| pdf-lib | `1.17.1` | Local parsing dependency for bounded, unencrypted PDF identity checks; no native download-completion adapter. |

npm semver does not include the later-patch prerelease `0.2.1-rc.2` in the original `>=0.2.0-rc.2 <0.3.0` range. The exact exception preserves the old floor without admitting unverified future prereleases. The maintainer has reported isolated runs with real SDK `0.2.0-rc.2` and `0.2.1-rc.2`, the latter with Cordis `4.0.5`; browser responses remain stubs, and final source results are recorded in [Validation](VALIDATION.md).

Dependency declarations, interface review, offline fixtures, and live provider verification are different evidence. Final local results belong in [Validation](VALIDATION.md). The old-version live baseline only reproduced an unknown `browser_execute` on `example.com`; it does not establish a live 0.2.1 fix. No live installation, institutional account, paper, or real download was used for this work.

## Browser tool compatibility

The four `academic_proxy_*` tools use the host registry's `ctx.tools.get` and `execute`, not a replacement browser connection. They preserve approval, token, agent, cancellation signal, and the host's tool restrictions. The adapter selects modern `dsh_browser_*` or legacy `browser_*` names from registration evidence. Modern registration takes priority; a partial modern family is not permission to silently use legacy members. A missing member, denied invocation, or cancellation does not trigger legacy fallback, and one operation stays with its selected family. Public `scopeChainOf` reads ancestor registration evidence so modern tools hidden by a child-scope restriction are not mistaken for an absent modern family. It does not execute through an ancestor to bypass the current scope. The explicit `dsh-scope` peer was already present in the old lockfile; it does not introduce a new SDK version.

Passing task context preserves the provider's policies; it cannot strengthen that provider's implementation. In representative browser `0.3.1`, restrict applies to the browser plugin as a whole; in `0.4.15`, it is task-scoped. Restriction bookkeeping therefore treats legacy `browser_restrict` as global and modern `dsh_browser_restrict` as task-scoped. The plugin does not promise new task isolation for the older browser.

`toolCompatibility` describes registration as `registered`, `partial`, or `unavailable`, and reports `prefix`, `scope`, and `providerVerified: false`. A registered tool is not proof that its provider, transport, permissions, or live window work. The settings route reports `scope: profile`; it does not guarantee current-task access. `academic_proxy_status` reports task-scoped registration evidence.

## Safe tools-only degradation

Production DesktopBridge does not prove the current task owns a page. Version 0.2.1 therefore disables automatic background page scanning, post-navigation proxy redirects, background ready-page metadata capture, and forced original-tab presentation. It does not probe browser windows to try to recover ownership. When enabled and configured, the production mode is `tools-only`. This is a deliberate safety change, not feature parity with the 0.1/0.2 profile-scoped monitor.

Manual navigation does not automatically apply proxy rules. Use `academic_proxy_open` explicitly, then `academic_proxy_check` after navigation. On login or CAPTCHA, leave the same original tab for the human and stop automated interaction. Do not re-probe the blocked page, switch to a lookalike tab, or force presentation. The user may need to select the current task's window and original tab manually; after the human step, call `academic_proxy_check` again.

An injectable task-scoped bridge or DOM fixture can exercise implementation behavior in tests. Its success does not make the production profile-only bridge task-safe or establish real renderer/operating-system foreground visibility.

| Capability | 0.2.1 production behavior | Not established by this state |
| --- | --- | --- |
| Proxy-aware tools | Dispatch through the selected host tool family with original call context. | Actual provider availability or all declared versions passing. |
| `automaticMonitoring` | Separate from tool registration; unavailable for trusted current-task monitoring, with enabled/configured operation in `tools-only`. | Automatic proxying of human navigation or background metadata capture. |
| Login/challenge handoff | Leave the same tab untouched for the human; manual window/tab selection may be needed. | Forced presentation or operating-system foreground focus. |
| `renaming.enabled` | The user's opt-in preference. | A ready watcher or a saved file. |
| `renaming.ready` | Whether naming can currently process eligible observations. | Successful saving or renaming. A restriction makes it false even if watcher mode remains `ready`. |
| `renaming.mode` | The filesystem watcher's mode, independent of browser tool compatibility. | Unrestricted operation; the UI shows a restricted ready-mode watcher as paused. |

The plugin does not patch DSH application files, install a bridge, replace a browser provider, create a separate browser, copy cookies, change the system proxy, or change the browser download folder. A remote browser's files are not implicitly visible to a local watcher.

## Proxy and settings boundaries

Hostname matching is exact. The plugin does not discover institutional proxies, associate hostnames automatically, implement institutional-network bypass, or provide dedicated OpenAthens support. There are two template fields; the default hostname group and custom list remain independent. Empty templates disable proxy routing. This is not a network interceptor, and no automatic redirect of manual navigation is promised.

Existing 0.1 and 0.2 settings remain compatible with the version-1 envelope. Missing 0.1 language and renaming preferences receive defaults; existing 0.2 values are retained. Language and naming preference edits preserve proxy pending-human-action and loop-guard state. Reconfiguration of the local naming watcher may establish a new filesystem baseline, which is a different state. An invalid settings POST missing `settings` is rejected rather than interpreted as a reset.

## Download and renaming boundaries

Candidate controls must be visible and enabled, and are ranked by PDF/download semantics. Equally ranked candidates require an explicit selector choice. URL checks guard inspection and clicking; cross-origin frames or PDF viewers may require inspection through the original browser tools. The plugin does not invent a PDF URL, replace the click with `browser_download` or `dsh_browser_download`, or fetch a file directly.

Immediately before the final click, login and challenge checks run again even when metadata was already captured. Detection of a block stops the operation without further blocked-page access. Only an explicit browser click result `clicked: true` permits reporting a successful click. A successful click or `metadataCaptured` is still not evidence of saving or renaming.

The 0.2 conservative filesystem algorithm is unchanged. The first folder scan excludes all existing entries, including targets of existing `.pdf.crdownload` and `.pdf.part` files. Only a newly observed supported temporary file whose matching final `.pdf` becomes stable for at least two seconds can proceed. The final file must be no larger than 64 MiB, unencrypted, parseable, have valid terminal EOF structure, and remain a regular single-link file at the same identity. It must uniquely match article metadata captured before the temporary file was observed, using PDF Info DOI or an exact sufficiently long normalized title. PDF dates never supply a publication year.

Original names remain for missing or ambiguous identity, no observed temporary file, changed Save As names, old files, subfolders, symbolic links, existing multiple hard links, encrypted/corrupt/oversized PDFs, unavailable directories, or unsupported hard-link filesystems. Naming is a same-folder guarded hard-link/unlink operation with numbered collision suffixes and no overwrite. Browser download-history paths are not updated. Local observation is not a native browser completion event or support for every download. See [GUIDE](GUIDE.md) for matching details, cache limits, and expiry.

## Deployment acceptance

The following is a future acceptance checklist, not a record of completed tests or authorization to use real profiles/accounts. Record actual outcomes in [Validation](VALIDATION.md), use synthetic or openly shareable metadata, and keep personal settings out of reports.

1. In an isolated authorized environment, confirm blank templates on a fresh profile, 47 default hostnames, an independent custom list, default `zh-CN`, renaming off, default `title/year/platform`, and an empty download folder.
2. Check 0.1 and 0.2 settings loading, all three languages, save failures, restart persistence, preservation of proxy pending/loop-guard state during language/naming edits, and rejection of a POST missing `settings` without resetting stored values.
3. Check legacy-only, modern-only, mixed, partial-modern, denied, cancelled, and unavailable registration cases. Verify stable family selection and preserved host call context. Record the provider version and restrict granularity rather than assuming all `0.3.x` providers behave alike.
4. Distinguish settings `scope: profile` from tool `scope: task`. Confirm `providerVerified: false`, separate `automaticMonitoring`, production `tools-only`, and separate naming enabled/ready/mode states, including restricted ready-mode pause.
5. Confirm manual navigation causes no background page scan, proxy redirect, metadata capture, or forced presentation. Exercise explicit proxy tools without changing another task's browser.
6. If separately authorized for live acceptance, confirm SSO/human verification stays in the same tab without extra blocked-page interactions or substitute tabs. Human completion precedes the next check; never automate solving CAPTCHA.
7. Confirm the pre-click recheck catches a new block even after metadata capture, and only explicit `clicked: true` is accepted. Verify a real control-driven save separately; a click or opened PDF tab alone is insufficient.
8. In an explicitly chosen isolated local folder, confirm one supported temporary-file sequence with prior unique metadata produces a renamed valid PDF with unchanged bytes. Exercise old files, fast downloads, name mismatches, missing/ambiguous metadata, invalid PDFs, links, collisions, missing fields, and hard-link failure without overwrite.
9. Confirm status contains at most ten basenames and no configured templates or absolute folder. Watcher restart/reconfiguration must exclude old files without being mistaken for a reset of proxy pending/loop-guard state. Check restriction, disablement, and shutdown without closing existing browser tabs.

A passed fixture establishes only the tested contract. Live settings rendering, a real browser provider, institutional login, final saving, and the intended OS/filesystem remain separate acceptance work.
