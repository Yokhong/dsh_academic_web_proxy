# DSH Academic Web Proxy

[简体中文](README.md) · [Usage guide / GUIDE](docs/GUIDE.md) · [Upgrading](docs/UPGRADING.md) · [Privacy](docs/PRIVACY.md)

Independent academic proxy settings for DeepSeek Harness. Open institutional proxy pages in the current task's existing shared browser and hand login or human verification back to the user in the original tab. Version 0.2.1 fixes compatibility with legacy `browser_*` and modern `dsh_browser_*` tool names while retaining the optional PDF renaming and three-language settings introduced in 0.2.

**Safety change in 0.2.1: the production DesktopBridge cannot prove current-task ownership, so background page scanning, automatic proxy redirects, and forced tab presentation are disabled; when enabled and configured, operation is `tools-only`.** Manual browser navigation does not automatically apply proxy rules. Explicitly use `academic_proxy_open`, then `academic_proxy_check` after navigation. This is a safe degradation, not feature parity with the earlier automatic monitor.

**Renaming is off by default, and the download folder starts empty.** It only considers new PDFs in an explicitly selected local folder: the monitor must observe a new `X.pdf.crdownload` or `X.pdf.part`, see that temporary file disappear, then find `X.pdf` stable for at least two seconds and pass PDF validation and article metadata matching. This is a filesystem polling heuristic, not a native browser download-completion event. It does not guarantee that every paper can be renamed.

Original names are kept for existing files, fast downloads with no observed temporary file, Save As operations whose temporary and final names do not correspond, missing or ambiguous metadata, encrypted or damaged PDFs, files over 64 MiB, subfolders, symbolic links, existing hard links, and filesystems that do not support the required safe hard-link operation. After a rename, the browser's download history can still point to the old name; check the download folder for the result.

## Install or upgrade

Requires Node.js `>=22.19` and DSH `>=0.2.0-rc.2 <0.3.0 || 0.2.1-rc.2`; the optional `dsh-builtin-browser` peer is `0.3.x || 0.4.15`. The adapter supports legacy `browser_*` and modern `dsh_browser_*` registry names. Interface-structure review of representative versions `0.3.1` and `0.4.15` is not real-provider verification or proof that every `0.3.x` release has been tested. The production DesktopBridge exposes `taskScoped: false`, so it does not prove task ownership and no browser-window probing is used to enable automatic monitoring.

npm semver excludes the later-patch prerelease `0.2.1-rc.2` from the original range. The explicit exception adds only that version while preserving the old minimum; it does not include an unverified `0.2.1-rc.3`. The maintainer has reported isolated offline runs with real SDK `0.2.0-rc.2` and `0.2.1-rc.2`, with browser responses still stubbed. Final frozen counts and artifact evidence belong in [Validation](docs/VALIDATION.md), not a claim of real-browser-provider verification.

Build from a source tree containing v0.2.1:

```sh
git clone https://github.com/Yokhong/dsh_academic_web_proxy.git
cd dsh_academic_web_proxy
npm ci --ignore-scripts
npm run check
npm test
mkdir dist
npm pack --pack-destination dist
dsh plugin --profile your-profile add ./dist/dsh-academic-web-proxy-0.2.1.tgz
```

Replace `your-profile` with the intended DSH profile name. Check the version in `package.json` first. Publishing GitHub source, an npm package, and a GitHub Release are separate steps; a local build does not establish publication. Use `dsh plugin --profile your-profile add dsh-academic-web-proxy@0.2.1` only if npm actually provides that version. This fix needs a new `v0.2.1` tag and npm `0.2.1`; do not move the published `v0.2.0` tag or treat it as containing this fix. An existing market entry normally needs no duplicate submission. The runtime package excludes development test scripts; rebuild from the source tree.

Before upgrading from 0.1 or 0.2, back up the current profile's plugin settings as described in [Upgrading](docs/UPGRADING.md). The version-1 settings envelope and existing proxy values remain compatible: missing 0.1 language/naming fields receive defaults, while saved 0.2 preferences are retained. Do not directly downgrade without a backup. Language or naming preference changes preserve proxy pending-human-action and loop-guard state. An invalid settings POST without `settings` is rejected rather than resetting configuration.

## First setup

Open **Academic Web Proxy** in DSH Settings:

1. Choose Simplified Chinese `zh-CN` (default), Traditional Chinese `zh-TW`, or US English `en-US`. This controls only the plugin's settings interface, independently of the DSH language; the change appears immediately and saves automatically.
2. Enter the institution's documented `Login URL Scheme` or `Proxied URL Scheme`. Both start empty. When both are empty, proxy routing is inactive.
3. Choose whether to use the default group and add custom hostnames as needed. The 47 default hostnames and custom list are stored independently; turning off the default group does not erase custom entries.
4. To rename PDFs, first configure the browser to save into a local folder you explicitly choose. Enter that folder's **absolute path** in the plugin and turn on PDF renaming. This setting only observes the folder; it does not change the browser's download location. Network shares, device paths, and recursive subfolder scanning are not supported.
5. Wait for a successful settings save and, if renaming is enabled, `renaming.ready: true`. Use `academic_proxy_open` for the article page, then `academic_proxy_check`, before the download tool. Changes save about 600 ms after the last edit; follow the UI message if a save fails.

Do not commit institutional templates, download folders, login information, or other personal configuration to the repository. Settings-page `scope: profile` describes profile registry registration, not current-task availability; check `academic_proxy_status` in the intended task.

## Proxy rules and human handoff

Hostnames match exactly: `example.org` does not implicitly include `www.example.org`. Custom entries contain only a hostname, without a scheme, port, path, or wildcard. Changing templates preserves the default group and custom list.

Template substitutions are `%u` for the encoded complete original URL, `%h` for the hostname (dots become hyphens for HTTPS hosts), and `%p` for the path, query, and fragment. These are fictional format examples, not working institutional settings:

```text
Login URL Scheme: https://login.example.edu/login?qurl=%u
Proxied URL Scheme: https://%h.proxy.example.edu/%p
```

The login template takes priority when configured. Rules check already-proxied pages and redirect loops, do not downgrade HTTPS, and do not proxy nonstandard ports or page subrequests. Version 0.2.1 does not monitor manual navigation in the background and is not a network interceptor; explicit proxy tool calls apply the configured routing.

On login or CAPTCHA, stop automated interaction and leave the **same original tab** for the human. Complete the step there, then call `academic_proxy_check`. The plugin does not enter credentials, solve or retry CAPTCHA, or touch the blocked page again to attempt forced presentation. The production bridge does not guarantee automatic foreground presentation; the user may need to select the current task's window and original tab manually.

## PDF filenames

Select from five fields in this fixed order. Components are joined with underscores and followed by `.pdf`:

| Order | Field | Value | Selected by default |
| --- | --- | --- | --- |
| 1 | `title` | Article title | Yes |
| 2 | `author` | First author | No |
| 3 | `year` | Explicit publication year | Yes |
| 4 | `venue` | Journal or conference | No |
| 5 | `platform` | Recognized platform, such as ASCE, Elsevier, Springer, or MDPI | Yes |

The default is `title_year_platform.pdf`. Fictional example metadata could produce `A study of porous materials_2025_ASCE.pdf`. The settings preview uses example metadata; it does not indicate that a current download has matched or been renamed.

Missing selected fields are omitted. Selecting no fields, or having no values for any selected field, keeps the original filename. Invalid filename characters are replaced and long names are shortened. Collisions receive ` (1)`, ` (2)`, and later suffixes without overwriting an existing file. Files stay in the same folder: the implementation creates an exclusive hard link, verifies it, then removes the original name. If the filesystem does not support that operation, the original file is kept.

Article metadata comes from the open page's citation, Dublin Core, PRISM, and ScholarlyArticle JSON-LD fields. A page title can be used as a title fallback; missing publication years are not inferred from PDF creation or modification dates. Version 0.2.1 does not capture pages in the background through the production DesktopBridge. The download tool checks the current task's page and attempts metadata capture before clicking a real download control.

Article metadata must have been captured before the temporary download was first observed. The final file must be an unencrypted, parseable PDF no larger than 64 MiB, with a valid terminal EOF. Its PDF Info DOI or an exactly matching normalized title of at least 12 characters must identify one previously recorded article. Title comparison retains letters and numbers and excludes generic titles such as Introduction or Bibliography. When both records have a DOI, those DOIs must agree; a nonempty contradictory PDF title also rejects the match. Compatible records of the same article can fill missing fields, while conflicting records remain ambiguous. Missing or ambiguous identity keeps the original name; the plugin does not infer identity from filenames, click order, or PDF dates.

The folder is polled about every 500 ms, with filesystem notifications prompting earlier checks. These timings are not proof of completion. The initial scan excludes all existing files and the targets of already-present temporary downloads. The in-memory cache holds at most 100 article records, expiring after 30 minutes without refresh; up to 100 pending downloads expire after 30 minutes. Changing renaming settings or restarting establishes a new filesystem baseline without backfilling old files; this is separate from proxy pending-human-action and loop-guard state. Version 0.2.1 leaves this conservative renaming algorithm unchanged. See [GUIDE](docs/GUIDE.md) and [Compatibility](docs/COMPATIBILITY.md) for the full boundaries.

## Proxy tools and status

| Tool | Purpose |
| --- | --- |
| `academic_proxy_status` | Read tool compatibility, automatic monitoring, human-action, and renaming state without exposing template values or the absolute download folder. |
| `academic_proxy_open` | Open an academic URL through current rules in the current task's existing shared browser. |
| `academic_proxy_check` | Check whether the current page requires login or human verification. |
| `academic_proxy_download` | Inspect and click real visible PDF/download controls; `inspectOnly: true` lists candidates only. |

The tools call the selected browser-tool family through host `ctx.tools.get` and `execute`, preserving approval, token, agent, and signal context. Modern `dsh_browser_*` registration takes priority. Missing modern members, denial, or cancellation never trigger fallback to legacy names, and a single operation does not switch families. Modern tools registered in an ancestor but hidden by a child-scope restriction do not permit legacy fallback either; public `scopeChainOf` only reads registration evidence, without bypassing the current scope for execution. Policy granularity still belongs to the browser provider: restrict is plugin-wide in `0.3.1` and task-scoped in `0.4.15`. The plugin does not upgrade the older browser's isolation implementation.

Equally ranked candidates require an explicit choice using a returned `selector`. Controls inside cross-origin frames or PDF viewers require further inspection in the original browser. Login and challenge checks always run again immediately before the final click, even when metadata was already captured; a blocked page stops the operation without extra page access. Only an explicit browser result `clicked: true` is reported as a successful click. The tool does not guess or directly fetch PDF URLs. A successful click or `metadataCaptured` does not mean the file was saved or renamed. Check the browser's download UI, actual file, and rename result; do not repeatedly trigger downloads to obtain a rename status.

| State | Interpretation |
| --- | --- |
| `toolCompatibility` | `registered`, `partial`, or `unavailable` describes registration completeness, with `prefix`, `scope`, and `providerVerified: false`. Registration is not real-provider verification. |
| `scope` | Settings report `profile`; `academic_proxy_status` reports `task`. Profile registration does not guarantee task availability. |
| `automaticMonitoring` | Independent of tool registration. The production DesktopBridge cannot provide trusted current-task monitoring; enabled and configured operation is `tools-only`. |
| `renaming.enabled` / `renaming.ready` / `renaming.mode` | Respectively the preference, current processing readiness, and watcher mode. A restricted watcher can have mode `ready` while ready remains `false`; the UI shows it as paused. Do not rely on the switch or mode alone. |

## Data and validation

Proxy templates, the chosen local folder, language, and filename preferences live in the current profile's runtime `plugins/dsh-academic-web-proxy/settings.json`, not in the source repository. The plugin does not collect credentials, export cookies, send telemetry, or upload PDFs or metadata to cloud services. Recent renaming results keep at most ten basenames in memory without absolute paths. See [Privacy](docs/PRIVACY.md).

[Validation](docs/VALIDATION.md) separates offline implementation regression, real SDK plus browser stubs, and the unverified real browser provider. The live baseline only reproduced an unknown `browser_execute` on `example.com` in the old version; it does not establish a live 0.2.1 fix. The final local matrix passed 264/264 tests in each of four rows; artifact evidence accompanies the release handoff rather than reusing 0.2.0 counts. No live installation, real account, paper, or download acceptance, and no remote publication, was performed in this work. [Releasing](docs/RELEASING.md) covers the new `v0.2.1` / npm version and the existing market entry.

Licensed under MIT; see [LICENSE](LICENSE) and [NOTICE](NOTICE). Proxy templates and bibliographic filename behavior were informed by Zotero's public documentation. This is an independent implementation and does not require Zotero. References are linked in [GUIDE](docs/GUIDE.md#public-sources).
