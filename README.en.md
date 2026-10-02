# DSH Academic Web Proxy

[简体中文](README.md) | **English**

Academic URL proxy rules, institutional sign-in handoff, and real download-button actions for the built-in browser in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

- Repository: [Yokhong/dsh_academic_web_proxy](https://github.com/Yokhong/dsh_academic_web_proxy)
- npm package: `dsh-academic-web-proxy` (the repository uses underscores; the package uses hyphens)
- License: [MIT](LICENSE)

This is an independent implementation informed by Zotero's proxy-template behavior. It does not include reference saving, automatic file imports, error reporting, debug logging, translators, Google Docs integration, or advanced configuration.

> Automatic redirects and presentation of the original tab require a compatible DSH Desktop browser bridge. Redirects use polling after navigation and cannot intercept the first request. Plugin tools can open proxy URLs through other working browser backends, but automatic monitoring and presentation are not guaranteed there. Institutional sign-in, CAPTCHA handling, and completed file downloads require deployment testing. See [Compatibility](docs/COMPATIBILITY.md).

## Features

- **Independent settings section:** “Academic Web Proxy” in DSH Settings, with English and Chinese UI text.
- **Two proxy templates:** `Login URL Scheme` and `Proxied URL Scheme` both start empty. Changes save automatically after about 600 ms of inactivity and persist across restarts.
- **Separate hostname management:** 47 built-in defaults with one group toggle, plus an independently stored custom list. Changing templates does not reset either list.
- **Exact hostname matching:** no implicit subdomain or wildcard matching; internationalized names are normalized.
- **Original-page handoff:** sign-in and verification stay in the same tab. On compatible desktop layouts, the plugin attempts to reveal that tab and verify its visibility. Unconfirmed presentation remains pending.
- **Real download actions:** discovers visible PDF/download controls on the current page and clicks through the existing browser tool. Ambiguous candidates require selection.
- **Profile and session isolation:** uses the current DSH profile, prevents redirect loops, rechecks page URLs, and saves configuration atomically. It does not register a replacement browser provider.

## Requirements

| Component | Requirement or adapter target |
| --- | --- |
| Node.js | 22.19 or later |
| DSH | Interfaces targeted at `0.2.0-rc.2`; declared package range `>=0.2.0-rc.2 <0.3.0` |
| dsh-builtin-browser | Compatibility adapter targets `0.3.1`; automatic mode requires an existing bridge |
| DSH Desktop | Tab-presentation adapter targets `2.0.17` |

Confirm that the existing browser can open pages before installing. The plugin does not install a browser or patch DSH application files. A declared version range does not mean every version in that range has passed live testing.

## Installation

### Build an installable package from source

PowerShell example:

```powershell
git clone https://github.com/Yokhong/dsh_academic_web_proxy.git
cd dsh_academic_web_proxy
npm ci --ignore-scripts
npm run check
npm test
New-Item -ItemType Directory -Force dist | Out-Null
npm pack --pack-destination dist
```

Before installing through the CLI, close DSH windows using the target profile. Replace `your-profile` with your own profile name. Adjust the archive filename when the package version changes:

```powershell
dsh plugin --profile your-profile add ./dist/dsh-academic-web-proxy-0.1.0.tgz
```

You can also install the local `.tgz` through DSH's plugin manager. Restart DSH, then open **Settings → Academic Web Proxy**. A direct `npm install` only installs npm dependencies; use the DSH plugin manager to activate this package's bundle.

### Use a published package

If [Releases](https://github.com/Yokhong/dsh_academic_web_proxy/releases) provides a `.tgz` attachment, download it and install it as above.

GitHub source and the npm registry are published separately. Install by package name **only after the desired version exists on npm**:

```powershell
dsh plugin --profile your-profile add dsh-academic-web-proxy
```

See [Releasing](docs/RELEASING.md) for maintainer instructions.

## Configure proxy templates

Use templates supplied by your institution. These are fictional examples and are never filled in automatically:

```text
Login URL Scheme:   https://login.example.edu/login?qurl=%u
Proxied URL Scheme:  %h.proxy.example.edu/%p
```

| Placeholder | Meaning |
| --- | --- |
| `%u` | The entire original URL encoded with `encodeURIComponent`, including query and fragment |
| `%h` | Original hostname; dots become hyphens for HTTPS URLs and remain dots for HTTP URLs |
| `%p` | Path without its leading `/`, followed by the query and fragment |

- With both templates empty, no redirect occurs, even if the master toggle is on.
- When `Login URL Scheme` is set, it takes precedence for navigation. `Proxied URL Scheme` identifies proxy addresses.
- When only `Proxied URL Scheme` is set, the URL is rewritten directly. Omitting the scheme preserves the original protocol.
- A login template needs a complete HTTP(S) URL and one `%u`. A proxied template needs one `%h` in the hostname, a fixed institutional domain suffix, and one `%p` in the path.
- HTTPS is never downgraded to HTTP. URLs with nonstandard ports are not rewritten, nor are iframe, image, or XHR subrequests.

Custom entries must be hostnames such as `journals.example.org`, without protocols, ports, paths, or wildcards. Custom entries still apply when the default group is off. For example, `example.org` does not automatically match `www.example.org`.

## Usage

Ask DSH, for example:

> Open this paper using my configured institutional proxy. Let me complete sign-in on the original page if needed, then click the page's PDF download button.

| Tool | Purpose |
| --- | --- |
| `academic_proxy_status` | Report configuration state, operating mode, and pending sign-in or verification pages |
| `academic_proxy_open` | Open an academic URL according to hostname rules in the current task's browser |
| `academic_proxy_check` | Check the current page for sign-in or human verification and attempt to reveal the original tab |
| `academic_proxy_download` | Find and click real download controls; `inspectOnly: true` only lists candidates |

Complete sign-in and CAPTCHA steps yourself on the original browser page. Hidden conversations, covered pages, or unsupported layouts may return `presented: false`. Select the corresponding conversation and expand its browser manually in that case.

`clicked` means a control was clicked; **it does not mean a file was saved**. A site may first open a PDF viewer. Cross-origin iframes, viewers, and unusual controls may require further interaction with the original browser tools to locate the actual download control and confirm file saving.

## Configuration and privacy

The plugin resolves the active configuration directory through the host's `profileContext` service and stores its settings at:

```text
plugins/dsh-academic-web-proxy/settings.json
```

Settings contain the enabled state, default-group toggle, custom hostnames, two templates, and revision information. They do not store login usernames, passwords, or cookies. The existing browser manages sign-in sessions. The plugin has no background telemetry and does not export cookies.

The repository contains no institutional templates, runtime configuration, or session data. Do not commit credential-bearing templates or runtime configuration. Use one DSH host per configuration directory.

## Development and validation

```powershell
npm ci --ignore-scripts
npm run check
npm test
```

The project uses native ESM and requires no compilation. Tests use Node.js's built-in test runner. Default-hostname checks use a public fixture included in the repository and require no additional personal files. Automated checks cover settings persistence, proxy rules, profile isolation, page handoff, and download calls. See [Validation](docs/VALIDATION.md) for the scope.

| Path | Contents |
| --- | --- |
| `src/` | Proxy rules, storage, browser adapter, and tools |
| `client.js` | Independent settings UI |
| `test/` | Automated tests and public fixtures |
| `scripts/` | Checks and a read-only diagnostic script |
| `docs/` | Compatibility, validation, and release documentation |
| `.github/workflows/ci.yml` | Checks for Node.js 22/24 on Windows/Linux |

CI runs tests and packaging; it does not publish to npm. Consult the repository's Actions page for actual remote run results.

## Uninstallation

Remove the plugin through DSH's plugin manager, or close the relevant profile and run:

```powershell
dsh plugin --profile your-profile remove dsh-academic-web-proxy
```

Disposal releases the plugin's timers, routes, and sockets. Configuration is retained for reinstallation. To clear it, delete the plugin settings file described above.

## Feedback and license

Use [Issues](https://github.com/Yokhong/dsh_academic_web_proxy/issues) for feature requests and general problems. Include fictional or redacted URLs; exclude credentials, cookies, and personal configuration.

Licensed under the [MIT License](LICENSE). See [NOTICE](NOTICE) for third-party attribution. This project is not affiliated with or endorsed by Zotero, DeepSeek, institutions, or publishers.
