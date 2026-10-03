# DSH Academic Web Proxy

[简体中文](README.md) · [Usage guide / GUIDE](docs/GUIDE.md) · [Upgrading](docs/UPGRADING.md) · [Privacy](docs/PRIVACY.md)

Independent academic proxy settings for DeepSeek Harness. Open institutional proxy pages in the existing shared browser and hand login or human verification back to the user in the original tab. Version 0.2.0 adds optional paper PDF renaming and a settings interface in Simplified Chinese, Traditional Chinese, and US English.

**Renaming is off by default, and the download folder starts empty.** It only considers new PDFs in an explicitly selected local folder: the monitor must observe a new `X.pdf.crdownload` or `X.pdf.part`, see that temporary file disappear, then find `X.pdf` stable for at least two seconds and pass PDF validation and article metadata matching. This is a filesystem polling heuristic, not a native browser download-completion event. It does not guarantee that every paper can be renamed.

Original names are kept for existing files, fast downloads with no observed temporary file, Save As operations whose temporary and final names do not correspond, missing or ambiguous metadata, encrypted or damaged PDFs, files over 64 MiB, subfolders, symbolic links, existing hard links, and filesystems that do not support the required safe hard-link operation. After a rename, the browser's download history can still point to the old name; check the download folder for the result.

## Install or upgrade

Requires Node.js `>=22.19` and DSH `>=0.2.0-rc.2 <0.3.0`. The browser adapter still targets `dsh-builtin-browser` `0.3.x`. Native `4.1` download APIs have only been reviewed; they are not integrated or verified in a live deployment. Automatic navigation detection requires a compatible DSH Desktop sidebar bridge. Other working browser backends can use the proxy tools, but automatic monitoring, original-tab presentation, and file renaming are not guaranteed.

Build from a source tree containing v0.2.0:

```sh
git clone https://github.com/Yokhong/dsh_academic_web_proxy.git
cd dsh_academic_web_proxy
npm ci --ignore-scripts
npm run check
npm test
mkdir dist
npm pack --pack-destination dist
dsh plugin --profile your-profile add ./dist/dsh-academic-web-proxy-0.2.0.tgz
```

Replace `your-profile` with the intended DSH profile name. Check the version in `package.json` first. Publishing the GitHub source, npm package, and GitHub Release are separate steps; a local build does not establish that any of them is published. Use `dsh plugin --profile your-profile add dsh-academic-web-proxy@0.2.0` only if that version is actually available on npm. The runtime package excludes development test scripts; use the source tree when rebuilding a package.

Before upgrading from 0.1, back up the current profile's plugin settings as described in [Upgrading](docs/UPGRADING.md). Existing proxy settings are retained and missing new fields receive defaults. After saving new fields, do not directly downgrade without a backup.

## First setup

Open **Academic Web Proxy** in DSH Settings:

1. Choose Simplified Chinese `zh-CN` (default), Traditional Chinese `zh-TW`, or US English `en-US`. This controls only the plugin's settings interface, independently of the DSH language; the change appears immediately and saves automatically.
2. Enter the institution's documented `Login URL Scheme` or `Proxied URL Scheme`. Both start empty. When both are empty, proxy redirection is inactive.
3. Choose whether to use the default group and add custom hostnames as needed. The 47 default hostnames and custom list are stored independently; turning off the default group does not erase custom entries.
4. To rename PDFs, first configure the browser to save into a local folder you explicitly choose. Enter that folder's **absolute path** in the plugin and turn on PDF renaming. This setting only observes the folder; it does not change the browser's download location. Network shares, device paths, and recursive subfolder scanning are not supported.
5. Wait for a successful settings save and a ready renaming state, then open the article page and download through the shared browser. Changes save about 600 ms after the last edit; follow the UI message if a save fails.

Do not commit institutional templates, download folders, login information, or other personal configuration to the repository.

## Proxy rules and human handoff

Hostnames match exactly: `example.org` does not implicitly include `www.example.org`. Custom entries contain only a hostname, without a scheme, port, path, or wildcard. Changing templates preserves the default group and custom list.

Template substitutions are `%u` for the encoded complete original URL, `%h` for the hostname (dots become hyphens for HTTPS hosts), and `%p` for the path, query, and fragment. These are fictional format examples, not working institutional settings:

```text
Login URL Scheme: https://login.example.edu/login?qurl=%u
Proxied URL Scheme: https://%h.proxy.example.edu/%p
```

The login template takes priority when configured. Rules check already-proxied pages and redirect loops, do not downgrade HTTPS, and do not proxy nonstandard ports or page subrequests. Desktop monitoring acts after navigation, so the original site may receive the first request. It is not a network request interceptor.

On login or CAPTCHA, the plugin keeps the **same original tab** and attempts to present it for the human. Complete the step there and check the page again. Version 0.2 retains the 0.1 prompt and handoff behavior; it does not enter credentials, solve or retry CAPTCHA, or add automatic resume actions. Some browser backends or layouts require the user to expand the sidebar or select the original tab manually.

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

Article metadata comes from the open page's citation, Dublin Core, PRISM, and ScholarlyArticle JSON-LD fields. A page title can be used as a title fallback; missing publication years are not inferred from PDF creation or modification dates. A compatible Desktop bridge captures ready academic pages in the matching profile, and the download tool captures metadata before clicking a real download control.

Article metadata must have been captured before the temporary download was first observed. The final file must be an unencrypted, parseable PDF no larger than 64 MiB, with a valid terminal EOF. Its PDF Info DOI or an exactly matching normalized title of at least 12 characters must identify one previously recorded article. Title comparison retains letters and numbers and excludes generic titles such as Introduction or Bibliography. When both records have a DOI, those DOIs must agree; a nonempty contradictory PDF title also rejects the match. Compatible records of the same article can fill missing fields, while conflicting records remain ambiguous. Missing or ambiguous identity keeps the original name; the plugin does not infer identity from filenames, click order, or PDF dates.

The folder is polled about every 500 ms, with filesystem notifications prompting earlier checks. These timings are not proof of completion. The initial scan excludes all existing files and the targets of already-present temporary downloads. The in-memory cache holds at most 100 article records, expiring after 30 minutes without refresh; up to 100 pending downloads expire after 30 minutes. Changing renaming settings or restarting establishes a new baseline and does not backfill old files. See [GUIDE](docs/GUIDE.md) and [Compatibility](docs/COMPATIBILITY.md) for the full boundaries.

## Proxy tools

| Tool | Purpose |
| --- | --- |
| `academic_proxy_status` | Read proxy, human-action, and renaming state without exposing template values or the absolute download folder. |
| `academic_proxy_open` | Open an academic URL through current rules in the existing shared browser. |
| `academic_proxy_check` | Check whether the current page requires login or human verification. |
| `academic_proxy_download` | Inspect and click real visible PDF/download controls; `inspectOnly: true` lists candidates only. |

Equally ranked candidates require an explicit choice using a returned `selector`. Controls inside cross-origin frames or PDF viewers require further inspection in the original browser. The tool does not guess or directly fetch PDF URLs. `clicked` confirms only the click; `metadataCaptured` confirms only a cached metadata record. Neither means the file was saved or renamed. Check the browser's download UI, the actual file, and the rename result; do not repeatedly trigger downloads to obtain a rename status.

## Data and validation

Proxy templates, the chosen local folder, language, and filename preferences live in the current profile's runtime `plugins/dsh-academic-web-proxy/settings.json`, not in the source repository. The plugin does not collect credentials, export cookies, send telemetry, or upload PDFs or metadata to cloud services. Recent renaming results keep at most ten basenames in memory without absolute paths. See [Privacy](docs/PRIVACY.md).

[Validation](docs/VALIDATION.md) separates automated results from deployment checks still needed for institutional SSO, CAPTCHA, browser saving, and filesystem behavior. CI configuration and API review do not establish that those live scenarios passed. [Releasing](docs/RELEASING.md) explains source, tarball, npm, and catalog publication. The market submission draft is separate maintainer material and must be submitted only after public source implements its stated features.

Licensed under MIT; see [LICENSE](LICENSE) and [NOTICE](NOTICE). Proxy templates and bibliographic filename behavior were informed by Zotero's public documentation. This is an independent implementation and does not require Zotero. References are linked in [GUIDE](docs/GUIDE.md#public-sources).
