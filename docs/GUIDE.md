# Usage guide / 使用指南

[中文概览](../README.md) · [English overview](../README.en.md) · [Privacy](PRIVACY.md) · [Compatibility](COMPATIBILITY.md)

This guide explains the v0.2.0 settings and the conditions under which a newly downloaded paper can receive a metadata-based filename. Renaming is optional and conservative; an unchanged filename is an expected result whenever the available evidence is insufficient.

## Set up the current profile

Configure the plugin in the profile that owns the shared browser. Supply the institution's own proxy templates and choose exact hostnames in Settings. The default group contains 47 hostnames and can be disabled without deleting the custom list. Empty templates leave proxy routing inactive.

Language is a plugin preference: `zh-CN` (简体中文, default), `zh-TW` (繁體中文), or `en-US` (US English). It changes the plugin's settings UI independently of the host language. Changes appear immediately and save after the normal debounce; wait for the saved state before closing Settings.

For PDF naming, explicitly choose an existing local folder, configure the browser to save there, then put its absolute path in the plugin. The plugin does not discover or change the browser's download location. A relative path, network share, device path, symbolic-link directory, or directory reached through a symbolic-link alias is not an eligible watch target. Subfolders are not watched. The runtime directory scan is limited to 10,000 entries; an unavailable or oversized folder leaves renaming unavailable.

Wait for the renaming state to become ready before starting a new download. The first directory scan establishes a baseline and excludes every existing name, including the eventual targets of temporary files already in progress.

| Setting | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Plugin master switch. |
| `useDefaultHostnames` | `true` | Enable the built-in hostname group. |
| `customHostnames` | `[]` | Independently saved exact hostnames. |
| `loginUrlScheme` | `''` | User-supplied login URL template. |
| `proxiedUrlScheme` | `''` | User-supplied proxied URL template. |
| `language` | `'zh-CN'` | One of `zh-CN`, `zh-TW`, `en-US`. |
| `renameEnabled` | `false` | Opt in to local PDF renaming. |
| `namingFields` | `['title', 'year', 'platform']` | Selected fields in the fixed order below. |
| `downloadDirectory` | `''` | Explicitly chosen local absolute directory; empty means no folder is watched. |

## Download one paper

1. Open the article landing page in the existing shared browser. A compatible Desktop adapter captures metadata from ready academic pages in the matching profile. `academic_proxy_download` also captures it before a control click.
2. If login or verification is required, complete it in the original tab and check the page again. The plugin retains the existing 0.1 prompt and handoff flow; it does not automate CAPTCHA or add a new resume protocol.
3. Use `academic_proxy_download` to inspect and click the real visible PDF/download control. When candidates tie, inspect them and pass one of the returned selectors. A PDF viewer or frame can require manual use of the original browser's control.
4. Save into the selected local folder. Keep the temporary and final base names consistent. The plugin must observe a new `X.pdf.crdownload` or `X.pdf.part`; a download too fast to expose that intermediate state is left alone.
5. Check the actual file and the recent renaming outcome. A successful control click or cached metadata record does not establish a saved or renamed file. An unchanged name does not call for repeated downloads.

## Evidence required for renaming

The watcher combines `fs.watch` notifications with polling about every 500 ms. These are observations of the filesystem, not a browser completion event. All of these conditions are required:

| Stage | Required evidence |
| --- | --- |
| New download | A supported temporary file newly appears after the baseline, and its final target is not an existing file being reused. Downloads already present at baseline remain excluded; a later new download may reuse a basename after the earlier file has gone. |
| Stable final file | The temporary file disappears and the same base name with `.pdf` exists. Device, inode, size, modification time, and change time remain stable for at least two seconds. |
| Eligible file | The file is in the selected folder, is a regular file without symbolic links or existing multiple hard links, is unchanged during inspection, and is no larger than 64 MiB. |
| PDF structure | A PDF header, valid terminal cross-reference/EOF structure, an unencrypted successful parse, and at least one page are required. A `.pdf` extension alone is insufficient. |
| Prior article | The metadata record was captured before the temporary download was first observed. A later visit does not qualify an old download. |
| Unique identity | PDF Info DOI or a sufficiently long exact normalized title identifies one prior article. Compatible observations may be combined; missing, conflicting, or ambiguous evidence leaves the original name. |
| Filename and filesystem | At least one selected field has a value, the source still matches its recorded identity, and the filesystem supports an exclusive same-folder hard link. |

PDF matching uses the Info title and a unique DOI found in the Info Subject or Keywords. It does not OCR pages, search full text, call a DOI service, or upload the file. When both the PDF and article have a DOI, they must agree; a nonempty PDF title that contradicts the article title also rejects a DOI match. Otherwise the title fallback applies NFKC Unicode normalization and lowercase comparison, retains letters and numbers, and requires exact equality with a length of at least 12. Generic titles such as Introduction, Bibliography, Supplementary Information, Supplementary Material, and Supporting Information are excluded from title fallback. Compatible prior observations of the same article may fill missing fields; conflicting nonempty title, author, year, venue, platform, or DOI values make the match ambiguous.

Article fields come from citation, Dublin Core/DCTERMS, PRISM, and ScholarlyArticle JSON-LD metadata. A non-generic page heading or document title can provide a title fallback. Only the first author is used. Publication year comes from explicit publication metadata; PDF creation/modification dates are never used to invent it. Known platform/host aliases can identify ASCE, Elsevier, Springer, MDPI, and other supported platforms, but that does not guarantee usable metadata on every page. Unknown fields remain empty. A page's PDF metadata URL is not a substitute for clicking its actual download control.

## Filename choices and file handling

The fixed order is `title`, `author`, `year`, `venue`, `platform`. Selecting a subset does not change that order. `author` means the first author; `venue` means the journal or conference. DOI is an identity check, not a selectable filename field.

Selected values are joined with `_` and use `.pdf`. Missing fields are omitted; selecting no fields or having no usable selected values keeps the original name. Invalid filesystem characters and reserved names are sanitized, and the filename length is bounded. The UI example is a preview of the format, not evidence about a download.

The renamer stays in the same folder. It creates a new exclusive hard link to the verified file, validates identity again, then unlinks the original name. Existing destinations are never overwritten; collisions use ` (1)`, ` (2)`, and later suffixes. Unsupported hard-link operations, insufficient permissions, or identity changes keep the original file. Browser download history is not rewritten, so its “open” action can still refer to a stale path after a successful rename.

## Expected skips and limits

Existing files, existing in-progress downloads at startup, unsupported temporary extensions, missed very fast downloads, Save As name mismatches, files in subfolders, symbolic links, existing hard links, encrypted/damaged/oversized PDFs, insufficient PDF Info metadata, and ambiguous records keep their names. A manual move or a browser history entry is not completion evidence. Disabling, restarting, or changing naming settings resets tracking and establishes a new baseline; old files are not revisited.

The in-memory article cache has 100 records and a 30-minute inactivity expiry. Pending downloads are capped at 100 and expire 30 minutes after their temporary file was observed. Recent outcome status contains at most ten basenames and missing-field indicators, with no absolute download path. Observed directory names are refreshed on scans; a later newly observed download can reuse a basename once an earlier file has gone, but an existing file is not retroactively eligible. See [Privacy](PRIVACY.md) for storage and retention.

## Reading the result

| Observation | What it establishes |
| --- | --- |
| `status: clicked` | The real browser control was clicked. |
| `metadataCaptured: true` | Article metadata entered the in-memory cache. |
| Renaming mode `ready` | The folder baseline exists and the monitor can observe new candidates. |
| Recent outcome `renamed` | The plugin completed its guarded same-folder name change. Confirm the file at the new basename. |
| Unmatched, invalid, expired, unavailable, or unchanged outcome | The eligibility or filesystem conditions were not sufficient; keep the original name. |
| No recent outcome | No eligible candidate was observed or processed; this does not prove that a download failed. |

Do not use polling status to bypass a browser's download UI or a human-verification page. Browser restrictions and plugin disablement pause automatic actions. Live behavior depends on the browser backend, chosen filesystem, page metadata, and institution; [Compatibility](COMPATIBILITY.md) lists deployment checks.

## Public sources

- [Project source and issue tracker](https://github.com/Yokhong/dsh_academic_web_proxy): public implementation and version history; local work is not automatically published.
- [Zotero Connector proxy preferences](https://www.zotero.org/support/connector_preferences#proxies): background for institutional proxy template interaction.
- [Zotero file renaming](https://www.zotero.org/support/file_renaming): background for naming files from bibliographic metadata. This plugin implements the five-field subset described above, not Zotero's complete template language or library behavior.
- [pdf-lib documentation](https://pdf-lib.js.org/docs/): PDF parsing dependency documentation; this release pins `pdf-lib` in its package manifest and lockfile.
- [dsh-builtin-browser public package metadata](https://registry.npmjs.org/dsh-builtin-browser): published browser versions. The plugin's declared peer remains `0.3.x`; reviewing newer native APIs does not establish compatibility.
- [Market contribution guide](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md): catalog eligibility and submission rules.

This is an independent MIT-licensed implementation. Read [NOTICE](../NOTICE) for attribution and [VALIDATION](VALIDATION.md) for the actual scope of release verification.
