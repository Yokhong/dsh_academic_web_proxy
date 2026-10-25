# Upgrading from 0.1 or 0.2 to 0.2.1

[中文概览](../README.md) · [English overview](../README.en.md) · [Release procedure](RELEASING.md)

升级前请备份当前 DSH profile 的插件设置。0.2.1 保留版本 1 设置封套、原有代理规则和 0.2 偏好；0.1 缺少的语言与 PDF 命名字段使用默认值，重命名不会自动开启。工具适配旧 `browser_*` 与新 `dsh_browser_*`。生产 DesktopBridge 无法证明当前任务归属，因此后台扫描、人工导航自动代理和强制展示停用；启用并配置后为 `tools-only`，须明确调用 `academic_proxy_open` / `academic_proxy_check`。这是安全降级，不是自动监控功能等价升级。

## Before installing

1. Identify the DSH profile in which the plugin is installed. Back up its runtime `plugins/dsh-academic-web-proxy/settings.json` if present. Keep the backup private: it can contain institutional proxy templates and, after opt-in, a local directory.
2. Keep the previously installed package available if you need a rollback. Record its version and intended host/provider versions without publishing machine-specific paths, endpoint details, or personal settings. Node.js `>=22.19` and the DSH/SDK minimum remain unchanged; the range is now `>=0.2.0-rc.2 <0.3.0 || 0.2.1-rc.2`. The exact exception is necessary because npm semver excludes later-patch prereleases from the old range. Actual isolated SDK runs cover `0.2.0-rc.2` and `0.2.1-rc.2` with browser stubs, not unverified `0.2.1-rc.3`; final source results are recorded in [Validation](VALIDATION.md). Optional browser peer is `0.3.x || 0.4.15`. Representative `0.3.1` / `0.4.15` interface review is not proof of all-version or live-provider compatibility.
3. Build or obtain the actual `dsh-academic-web-proxy-0.2.1.tgz` from the intended source revision. Check source results in [Validation](VALIDATION.md) and the separate final archive/checksum reports. A public repository or npm version may lag local work. The published `v0.2.0` tag must not be moved or treated as containing this fix.
4. When installation is separately authorized, use the documented plugin flow in the intended profile. For a local archive, `dsh plugin --profile your-profile add ./dist/dsh-academic-web-proxy-0.2.1.tgz` uses the source tree's archive; replace `your-profile` with the intended profile. Use the npm `0.2.1` equivalent only after that new version is actually published. Restart or reload as required by the host. These are instructions, not a claim that a live installation was performed in this work.

## Settings compatibility

The persisted envelope remains `{ version: 1, revision, settings }`. The envelope version is the storage format version, not the plugin release version. Do not manually change it to `2` or `0.2.1`.

Existing `enabled`, `useDefaultHostnames`, `customHostnames`, `loginUrlScheme`, and `proxiedUrlScheme` values are preserved. A valid 0.1 settings object missing the language and naming fields receives these defaults; a valid 0.2 object retains its saved values:

```json
{
  "language": "zh-CN",
  "renameEnabled": false,
  "namingFields": ["title", "year", "platform"],
  "downloadDirectory": ""
}
```

The first successful settings save persists the expanded object using the existing revision and atomic-save mechanism. A malformed or unsupported settings file is reported; do not overwrite it blindly to make a warning disappear. A settings POST missing `settings` is rejected rather than treated as a reset. Restore a known-good backup or repair a malformed file only after preserving the original.

Language and naming preference changes preserve proxy pending-human-action and redirect loop-guard state. Do not use a preference toggle as a way to clear a login/challenge block. A naming watcher reconfiguration can establish a new filesystem observation baseline; its pending download observations are distinct from pending proxy handoff and loop-guard records.

## Behavior and status changes

- Production DesktopBridge has `taskScoped: false`; profile identity does not prove task ownership. Version 0.2.1 does not scan windows/pages to recover ownership, redirect manual navigation, collect background page metadata, or force tab presentation. Use explicit proxy tools, then leave login/challenge handling to the human in the same original tab.
- Host `ctx.tools.get` and `execute` preserve approval, token, agent, and signal context. Modern `dsh_browser_*` takes priority; missing modern members, denial, and cancellation do not fall back to legacy tools. A single operation keeps its selected family.
- Provider restriction granularity is not upgraded by the plugin: representative `0.3.1` restrict is plugin-wide, while `0.4.15` restrict is task-scoped.
- `toolCompatibility` reports `registered`, `partial`, or `unavailable`, `prefix`, `scope`, and `providerVerified: false`; it reports registration, not live-provider success. Settings `scope: profile` is not the same guarantee as a task status check.
- `automaticMonitoring` is separate from tool registration. `renaming.enabled`, `renaming.ready`, and `renaming.mode` are also separate: a restricted watcher can remain in mode `ready` while ready is `false`, displayed as paused.
- Before a final download click, login/challenge checks always run again, even after metadata capture. Blocks stop without extra page access. Only explicit browser `clicked: true` is click success; neither that nor captured metadata proves saving or renaming.

## Confirm the upgrade

The following checks are for a separately authorized acceptance run, not completed results:

- Confirm prior templates, default-group switch, and custom hostnames are intact. Do not publish actual template values.
- Switch among `zh-CN`, `zh-TW`, and `en-US`, wait for a successful save, and confirm persistence. Check language/naming changes leave proxy pending/loop-guard records intact and missing-`settings` POSTs leave stored configuration unchanged.
- Confirm renaming is off and the folder is empty for a migrated 0.1 configuration unless you explicitly saved different values in 0.2. Existing 0.2 preferences must not silently reset.
- Confirm settings profile registration is distinguished from task registration, no live-provider verification is implied, and production mode is `tools-only` when enabled/configured. Manual navigation must not cause background redirects or forced presentation.
- If opting into naming, choose a local absolute folder, select filename fields, and wait for `renaming.ready: true`. Before the download, capture article metadata through the explicit download-tool flow. Existing files and downloads already in progress remain excluded.
- Verify an eligible download and an expected skip on the intended browser/filesystem only when separately authorized. A click, preview, metadata record, or ready status is not a saved or renamed file. The unchanged algorithm still requires an observed temporary file, a matching final PDF stable for at least two seconds, no more than 64 MiB, and a unique prior metadata match; it is not a native completion event.

Changing naming settings, restarting, or disabling and re-enabling the watcher does not apply rules retroactively. Files already renamed are not renamed again when naming fields change, and browser download-history paths are not updated.

## Rollback

Do not feed a 0.2/0.2.1 settings object to 0.1 without a backup plan: 0.1 validates a fixed set of fields and can reject the added language and renaming keys even though the envelope remains version 1. Version 0.2.1 does not require a new settings schema relative to 0.2.0, but downgrading to 0.2.0 also removes the modern-tool fix and tools-only safety change.

Stop the plugin through the host, preserve current settings privately, reinstall the known prior package, and restore a matching pre-upgrade backup while the plugin is stopped. Reload and verify the intended configuration. If no backup exists, do not delete the only current copy; prepare and validate a compatible configuration from a preserved copy before use.

Rollback does not undo filenames already changed. The renamer does not maintain a persistent original-name history. Keep any personal file backup independently of package rollback.
