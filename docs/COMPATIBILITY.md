# Compatibility and acceptance

## Adapter targets

| Component | Target or requirement | Verification scope |
| --- | --- | --- |
| DSH / dsh-tools / system-prompt | `0.2.0-rc.2` interfaces | SDK schema compilation and isolated host-service tests |
| Cordis | `4.0.4` | Plugin lifecycle and dependency contract |
| dsh-builtin-browser | `0.3.1` | Tool-result and bridge-protocol fixtures |
| DSH Desktop | `2.0.17` | DOM contract and execution of the presentation script against DOM fixtures |
| Node.js | `>=22.19` | Runtime requirement; CI is configured for 22.19 and 24 |

Dependency ranges in `package.json` are compatibility declarations, not proof that every version has passed live testing. Check the repository's Actions runs for CI results.

## Browser integration

The targeted browser service does not expose all-tab navigation events, request interception, a universal operation to reveal an existing tab, or a uniform download-completion event. The plugin therefore uses two paths:

1. **Browser tools:** the four `academic_proxy_*` tools call existing browser tools through `ctx.tools.execute`, preserving the parent call chain, cancellation signal, permissions, and tool restrictions. They use the existing browser session.
2. **Desktop adapter:** a token-authenticated loopback bridge supplied by the existing browser is used to poll sidebar webviews about once per second. Guests are scoped to the current DSH profile. Matching URLs are redirected only after navigation. To present a sign-in or verification page, the adapter maps the exact `getWebContentsId()` to its panel, tab occurrence, and pane, then verifies selection and DOM visibility.

The plugin does not install or patch the bridge, modify DSH application files, replace a browser provider, create a separate browser, copy cookies, or change the system proxy.

## Capability matrix

| Environment | Proxy-aware tools | Automatic redirects for manually visited pages | Automatic presentation of the original tab |
| --- | --- | --- | --- |
| Compatible bridge and Desktop sidebar in the same profile | Yes | Polling after navigation | Supported when the current conversation layout can be verified |
| Other native Electron provider | When the browser works | No | Manual expansion may be required |
| System-browser provider | When the browser works | No | Manual window selection may be required |
| Unavailable browser | Tools report failure | No | No |

Polling may briefly load the original site and can miss short-lived navigations. Institutional SSO navigation is tracked for approximately ten minutes. A failed proxy attempt that returns to the original article URL pauses further redirects to prevent loops. Changing the configuration resets tracking.

Hostname rules match exactly. The plugin does not implement automatic proxy discovery, automatic association of new hostnames, institutional-network bypass, or dedicated OpenAthens behavior. There are exactly two template fields; the default-hostname group and custom list are stored independently.

## What “presented” means

Successful presentation requires a unique mapping to the current profile's shell, the exact selected tab, an expanded sidebar, visible and non-inert ancestors, a visible renderer, and an on-screen target region without in-page occlusion. The adapter calls `Page.bringToFront` and checks visibility again.

It does not select a tab by guessing from a matching URL or title, or open a duplicate sign-in page. Hidden conversations require the user to select the conversation first. Unsupported layouts and ambiguous guest mappings return `presented: false`; Settings displays pending items with a button to show the original page.

This verifies renderer visibility. It does not prove operating-system foreground focus or exclude another application covering or minimizing the window.

## Download behavior

Candidates come from visible, enabled page controls such as links and buttons, ranked by PDF/download semantics. Supplementary material and citation exports receive lower priority. The page URL is checked during inspection, candidate discovery, and immediately before clicking.

Equally ranked candidates require an explicit choice. If no candidate can be found, or the control is inside a cross-origin iframe or PDF viewer, continue through the original browser's accessibility and interaction tools. The plugin does not invent download URLs, call `browser_download`, or fetch PDF files itself.

`status: clicked` confirms a control click only. Confirm final file saving through the original browser's download UI or a file check.

## Deployment acceptance

Live institutional SSO, CAPTCHA, desktop foreground behavior, and final PDF saving are outside the automated verification claim. Before relying on a deployment, verify:

1. Settings opens as an independent section, both templates start empty, and all 47 defaults and the custom list are available.
2. Templates and a custom hostname persist after a successful save and DSH restart.
3. Disabling the default group leaves custom rules active; changing templates preserves both lists.
4. A matching default and custom hostname redirect in the compatible sidebar browser. Unmatched and already-proxied URLs do not acquire extra proxy layers.
5. Sign-in and verification keep the original tab open and visible. After manual completion, status recovers. A second tab with the same URL is not mistaken for the first.
6. Candidate inspection followed by an actual PDF/download control click results in a confirmed saved file.
7. Another DSH profile is unaffected. Browser restrictions pause monitoring and removing them permits it to resume.
8. Disabling or uninstalling releases the plugin's timers, routes, and sockets while retaining existing browser tabs.

Use these checks with the intended DSH/Desktop versions and institution's actual templates. Fixture tests do not establish compatibility with every SSO provider or anti-bot system.
