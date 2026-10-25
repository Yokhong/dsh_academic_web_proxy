# Privacy and local data

[中文概览](../README.md) · [English overview](../README.en.md) · [GUIDE](GUIDE.md)

The plugin uses host browser tools and an explicitly chosen local download folder. It does not send telemetry, collect login credentials, export browser cookies, upload PDFs or article metadata, or use cloud services for filename generation. Normal browser requests still go to the article site and any institutional proxy or SSO service you configure.

## Task ownership and browser access

Version 0.2.1 calls the selected legacy `browser_*` or modern `dsh_browser_*` family through host `ctx.tools.get` and `execute`, preserving approval, token, agent, and signal context. Missing modern members, denial, or cancellation do not trigger a legacy fallback, and an operation does not switch families. Provider policies still apply at their own granularity: representative browser `0.3.1` restrict is plugin-wide; `0.4.15` restrict is task-scoped. The plugin does not strengthen the older provider's isolation implementation.

The production DesktopBridge has `taskScoped: false`; knowing the profile does not prove current-task page ownership. Version 0.2.1 therefore does not scan browser windows/pages in the background, automatically redirect manual navigation, collect background ready-page metadata, or force a login/challenge tab into view. Enabled/configured operation is `tools-only`. Use explicit `academic_proxy_open` / `academic_proxy_check`, and leave a blocked page untouched for the human rather than performing extra probes for presentation.

## Persisted settings

Settings are saved under `plugins/dsh-academic-web-proxy/settings.json` in the current DSH profile. This is runtime data, separate from the source repository and package. It includes proxy templates, custom hostnames, language, the renaming switch, selected filename fields, and the chosen download directory. Proxy templates and directory paths can identify an institution or local machine; keep the file and any backups private.

The authenticated settings UI must read and edit these values. The status endpoint and `academic_proxy_status` do not return configured template strings or the absolute download directory. They separate tool registration evidence, automatic monitoring, human-action state, and bounded renaming outcomes. `providerVerified: false` is not a live-provider check. Settings status has `scope: profile`, whereas the academic status tool has `scope: task`; profile registration does not guarantee current-task access. This distinction does not make the settings file secret from users or administrators who can access the same profile.

Existing 0.1/0.2 settings remain compatible. Language/naming edits preserve proxy pending-human-action and loop-guard state; an invalid settings POST without `settings` is rejected rather than resetting configuration. Renaming observer baseline changes are separate from proxy state.

Do not put actual institutional schemes, local download paths, credentials, browser cookies, runtime settings, private endpoint details, or raw personal logs into source files, issue examples, screenshots, release archives, or catalog YAML. Documentation uses fictional institution domains and synthetic paper metadata only.

## Metadata and file access

The download tool reads bibliographic metadata from the current task's article page before clicking its visible control, including citation/DC/PRISM fields and bounded ScholarlyArticle JSON-LD. There is no production background DesktopBridge capture. Login and challenge checks run again immediately before the final click, even after metadata capture; detection stops further blocked-page access. The plugin does not read password inputs for naming, submit login forms, or solve verification challenges. Explicit `clicked: true` is only click evidence, not proof of a saved file.

After opt-in, the watcher lists the selected local folder and observes supported new temporary downloads. It does not recursively scan subfolders or rename files that existed when the baseline was created. It reads only an eligible final PDF for identity validation, with a 64 MiB maximum. Parsing is local and does not OCR pages or send contents to a metadata service. The PDF Info title/DOI is matched against already captured article metadata; file dates are not used as publication years.

The configured folder is the scope of observation. The unchanged filesystem heuristic cannot prove which application or browser task created every new file in that folder. A file must still meet all temporary-file, timing, PDF, and unique metadata conditions in [GUIDE](GUIDE.md); choose a dedicated folder if you need clearer operational separation. This is not a native download-completion event or evidence that every download can be renamed. `renaming.enabled`, `renaming.ready`, and `renaming.mode` describe different aspects of this watcher; a restriction can leave mode `ready` but ready `false`.

## In-memory retention and status

| Data | Retention and use |
| --- | --- |
| Article metadata | At most 100 records; records expire after 30 minutes without refresh. Used for matching and filename fields. |
| Pending download observations | At most 100 records; expire after 30 minutes. Used to connect an observed temporary file with its stable final name. |
| Recent renaming outcomes | At most ten records in memory; basenames and missing-field indicators only, without absolute paths. Cleared on restart or relevant watcher reconfiguration. |
| Directory baseline and observed names | In memory for the current observation generation and refreshed on scans; used to exclude existing files and detect supported newly appearing temporary downloads. |

These records are not a persistent download history. Status can expose paper titles through generated basenames. If the user or agent reads that status, the host may retain the tool result in its ordinary conversation history; the plugin does not control the host's logging or retention. Avoid sharing such output without checking it for personal research details.

## File changes and browser state

A successful rename changes the filename in the same folder using an exclusive hard link and removal of the old name. Existing destinations are not overwritten. The plugin does not change the PDF's content, move it to another folder, rewrite browser download history, or synchronize filenames with later metadata edits. A browser history action can therefore retain a stale original path.

Stopping or disabling the plugin releases its monitoring resources; existing browser tabs, saved files, and runtime settings remain. Uninstalling the package does not promise to erase settings or backups maintained by the host. Manage those files through the current profile's normal data controls after preserving any configuration you still need.

See [Upgrading](UPGRADING.md) for settings backup requirements and [Validation](VALIDATION.md) for checks required before sharing a release. This documentation work does not access real profiles, credentials, cookies, browser endpoints, accounts, or papers.
