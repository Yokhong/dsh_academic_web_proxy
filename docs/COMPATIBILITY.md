# Compatibility and deployment acceptance

[GUIDE](GUIDE.md) · [Validation report](VALIDATION.md) · [Privacy](PRIVACY.md)

## Declared targets

| Component | Declared target or requirement | Verification boundary |
| --- | --- | --- |
| Node.js | `>=22.19` | Required by the manifest; configured CI selects the current Node 22 and 24 releases. |
| DSH / dsh-tools / system-prompt | `>=0.2.0-rc.2 <0.3.0` | Existing host-service and tool-call contracts remain the target. |
| Cordis | `^4.0.4` | Existing plugin lifecycle and dependency contract. |
| dsh-builtin-browser | Optional peer `0.3.x`; adapter targets `0.3.1` contracts | Tool-result and Desktop bridge behavior must be verified on the deployed version. |
| DSH Desktop | Existing adapter targets `2.0.17` layout contracts | DOM fixtures do not prove operating-system foreground focus. |
| pdf-lib | `1.17.1` | Local parsing dependency for bounded, unencrypted PDF identity checks. |
| Browser native `4.1` download APIs | Interface review only | No native completion adapter or live verification is claimed; the browser peer range has not been broadened. |

Dependency ranges and a CI workflow are declarations, not proof that every listed environment passed. The actual run results belong in [Validation](VALIDATION.md). Live institutional SSO, CAPTCHA, final file saving, and filename behavior require deployment acceptance on the intended machine and filesystem.

## Browser integration

The existing adapter does not provide a uniform native download-completion event. The plugin uses these paths:

1. **Existing browser tools.** The four `academic_proxy_*` tools call browser tools through the host registry, preserving the parent call chain, cancellation signal, permissions, and tool restrictions. They use the current task's browser. The download tool captures ready-page metadata before clicking a real control.
2. **Desktop sidebar adapter.** The browser's existing authenticated loopback bridge polls sidebar webviews about once per second and scopes guests to the current profile. Matching academic URLs can be redirected after navigation, and ready pages can provide article metadata. Exact guest mapping is used to present the original login or verification tab.
3. **Local folder observation.** An opt-in watcher polls the explicitly selected local folder about every 500 ms, with filesystem notifications prompting earlier checks. An observed temporary file and later stable, validated, uniquely matched PDF provide conservative evidence for renaming; they are not a browser completion event.

The plugin does not install or patch the bridge, modify DSH application files, replace a browser provider, create a separate browser, copy cookies, change the system proxy, or change the browser's download folder.

| Environment | Proxy-aware tools | Automatic navigation and ready-page metadata | Original-tab presentation | Optional file naming |
| --- | --- | --- | --- | --- |
| Compatible same-profile Desktop bridge and sidebar | Available when browser tools work | Polling after navigation | When the exact tab and visible layout can be verified | Conditional on every folder, temporary-file, PDF, and metadata check. |
| Other working browser backend | Through the existing browser tools | No Desktop monitoring guarantee; the download tool can attempt current-page metadata capture | Manual selection may be required | No compatibility guarantee; depends on tool results, local file visibility, and the same strict checks. |
| Unavailable browser | Reports failure | Unavailable | Unavailable | No new article capture or rename guarantee. |

A remote browser's downloaded files are not implicitly available to the local watcher. A configured local folder must be the actual destination visible to the plugin process. Polling may miss short-lived navigation or temporary files. Browser restrictions pause automatic actions; removing them does not turn a missed or old download into a new candidate.

## Proxy and human handoff boundaries

Hostname matching is exact. The plugin does not discover institutional proxies, associate hostnames automatically, implement institutional-network bypass, or provide dedicated OpenAthens support. There are two template fields; the default hostname group and custom list remain independent. Empty templates disable proxy routing.

The first request may reach the original site before a Desktop polling redirect. SSO transitions are tracked for approximately ten minutes. A failed proxy attempt returning to the original article pauses further redirects to avoid loops. Configuration changes reset tracking.

On login or CAPTCHA, the original tab is kept for the human. The 0.1 prompt/handoff behavior remains; 0.2 does not add automatic CAPTCHA handling or a new manual-resume protocol. Successful `presented` state requires a unique current-profile mapping, exact selected tab, expanded sidebar, visible and non-inert ancestors, a visible renderer, and an unoccluded in-page target region. The adapter calls `Page.bringToFront` and checks visibility again.

That establishes renderer visibility only. It does not prove operating-system foreground focus or rule out another application covering the window. Hidden conversations, unsupported layouts, and ambiguous mappings return `presented: false`; the user may need to select the conversation and original page manually. The adapter does not substitute another tab merely because its URL or title matches.

## Download and renaming boundaries

Candidate controls must be visible and enabled, and are ranked by PDF/download semantics. Equally ranked candidates require an explicit selector choice. URL checks guard inspection and clicking; cross-origin frames or PDF viewers may require inspection through the original browser tools. The plugin does not invent a PDF URL, replace the click with `browser_download`, or fetch a file directly. `clicked` and `metadataCaptured` do not mean saved or renamed.

The first folder scan excludes all existing entries, including targets of existing `.pdf.crdownload` and `.pdf.part` files. Only a newly observed supported temporary file whose matching final `.pdf` becomes stable for at least two seconds can proceed. The final file must be no larger than 64 MiB, unencrypted, parseable, have valid terminal EOF structure, and remain a regular single-link file at the same identity. It must uniquely match article metadata captured before the temporary file was observed, using PDF Info DOI or an exact sufficiently long normalized title. PDF dates never supply a publication year.

Original names remain for missing or ambiguous identity, no observed temporary file, changed Save As names, old files, subfolders, symbolic links, existing multiple hard links, encrypted/corrupt/oversized PDFs, unavailable directories, or unsupported hard-link filesystems. Naming is a same-folder guarded hard-link/unlink operation with numbered collision suffixes and no overwrite. The browser's download-history path is not updated. See [GUIDE](GUIDE.md) for matching details, cache limits, and expiry.

## Deployment acceptance

Record actual outcomes in [Validation](VALIDATION.md). Use synthetic or openly shareable metadata and keep personal settings out of reports.

1. Open the independent settings section. Confirm two blank templates on a fresh profile, 47 default hostnames, an independent custom list, default `zh-CN`, renaming off, default `title/year/platform`, and an empty download folder.
2. Switch among all three plugin languages, save and restart. Confirm a failed save is visible and existing proxy configuration survives an upgrade from a version-1 settings envelope.
3. Verify exact default/custom hostname routing, already-proxied behavior, unmatched hosts, and disabling only the default group. Check another profile is unaffected.
4. Verify institutional SSO and human verification remain in the exact original tab. Complete the human step and re-check; confirm a duplicate-URL tab is not substituted. Do not automate solving CAPTCHA as a test.
5. Confirm a real visible download-control click produces a saved file through the browser's own flow. Verify that clicking or opening a PDF tab alone is not reported as saving.
6. Enable renaming in an explicitly chosen local directory. Open a ready article first, observe a new supported temporary file, and verify one uniquely matched valid PDF receives the selected filename. Confirm the output file contents are unchanged.
7. Exercise expected skips: pre-existing files, fast downloads without an observed temporary file, Save As mismatches, missing/ambiguous metadata, encrypted/corrupt/oversized PDFs, subfolders and links. Test name collisions, missing fields, no selected fields, and hard-link operation failure without overwriting any file.
8. Confirm recent rename status has at most ten basenames and no absolute directory or configured templates. Confirm restart/reconfiguration clears tracking and does not process old files. Account for stale browser history paths after renaming.
9. Verify browser restrictions, master disablement, profile isolation, and plugin shutdown release monitoring resources without closing existing browser tabs. Test the intended OS/filesystem rather than assuming fixtures cover it.

A passed unit test is evidence for that fixture. It is not proof of every publisher's PDF metadata, institutional login flow, browser backend, or filesystem.
