# Upgrading from 0.1 to 0.2.0

[中文概览](../README.md) · [English overview](../README.en.md) · [Release procedure](RELEASING.md)

升级前请备份当前 DSH profile 中的插件设置。0.2 保留原有代理规则，新增语言与 PDF 命名字段使用默认值；重命名不会自动开启。新字段写入后，旧版的严格字段校验可能拒绝该设置文件，因此不要在没有升级前备份的情况下直接回退。

## Before installing

1. Identify the DSH profile in which the plugin is installed. Back up that profile's runtime `plugins/dsh-academic-web-proxy/settings.json` if present. Keep the backup private: it can contain institutional proxy templates and, after opt-in, a local directory.
2. Keep the previously installed package available if you need a rollback. Record its version and the target DSH/Desktop/browser versions without publishing machine-specific paths or personal settings.
3. Build or obtain the actual `dsh-academic-web-proxy-0.2.0.tgz` from the intended source revision. Verify the manifest version and release checks in [Validation](VALIDATION.md). A public repository or npm version may lag local work.
4. Install it into the same profile using the documented plugin install/update flow. For a locally built archive, `dsh plugin --profile your-profile add ./dist/dsh-academic-web-proxy-0.2.0.tgz` uses the archive in the source tree's `dist` folder; replace `your-profile` with the intended profile name. Restart or reload the plugin as required by the host.

## Settings compatibility

The persisted envelope remains `{ version: 1, revision, settings }`. The envelope version is the storage format version, not the plugin release version. Do not manually change it to `2`.

Existing `enabled`, `useDefaultHostnames`, `customHostnames`, `loginUrlScheme`, and `proxiedUrlScheme` values are preserved. When a valid 0.1 settings object lacks the new fields, 0.2 fills these defaults:

```json
{
  "language": "zh-CN",
  "renameEnabled": false,
  "namingFields": ["title", "year", "platform"],
  "downloadDirectory": ""
}
```

The first successful settings save persists the expanded object using the existing revision and atomic-save mechanism. A malformed or unsupported settings file is reported; do not overwrite it blindly to make the warning disappear. Restore a known-good backup or repair it after preserving the original.

## Confirm the upgrade

- Open Settings and confirm the prior templates, default-group switch, and custom list are intact. Do not copy actual template values into a public test report.
- Switch among `zh-CN`, `zh-TW`, and `en-US`, wait for a successful save, and confirm the selected plugin language survives a restart.
- Confirm renaming is off and the folder is empty unless you explicitly saved different values in 0.2.
- If opting in, choose a local absolute folder, select filename fields, and wait for the watcher to establish its baseline before opening a new article and downloading. Existing files and downloads already in progress are intentionally excluded.
- Verify one eligible download and one expected skip on the intended browser and filesystem. Do not treat a control click, settings preview, or ready status as proof of a saved or renamed file.

Changing renaming settings, restarting, or disabling and re-enabling tracking does not apply naming rules retroactively. Files already renamed are not renamed again when the naming fields change, and the browser's download-history paths are not updated.

## Rollback

Do not feed a 0.2 settings object to 0.1 without a backup plan: 0.1 validates a fixed set of fields and can reject the added language and renaming keys, even though the envelope is still version 1.

Disable renaming and stop the plugin through the host. Preserve the current 0.2 settings privately, reinstall the known 0.1 package, and restore the matching pre-upgrade 0.1 settings backup while the plugin is stopped. Reload and verify the original proxy configuration. If no pre-upgrade backup exists, do not delete the only copy of the current settings; prepare a compatible configuration from a preserved copy and validate it before use.

Rollback does not undo filenames already changed in the download folder. The renamer does not maintain a persistent original-name history. Keep any personal file backup you need independently of the package rollback.
