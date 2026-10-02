# Validation — 0.1.0

## Release-source check

The 0.1.0 source snapshot passed a clean dependency installation with `npm ci --ignore-scripts`, the manifest/bundle/syntax checks, and **149 tests: 149 passed, 0 failed, 0 skipped**. `npm pack` completed successfully with 21 runtime-package files. Checks and tests ran through the package's `prepack` lifecycle in an isolated source copy.

These are automated source-validation results, not a claim of live institutional sign-in, completed PDF saving, or successful remote CI. No host installation is required to reproduce the automated checks below.

## Reproduce the automated checks

From the repository root:

```powershell
npm ci --ignore-scripts
npm run check
npm test
```

`npm run check` validates the npm manifest, bundle, required documentation, and syntax of the 11 runtime JavaScript files. Tests use Node.js's built-in runner with `--test-isolation=none` and load the SDK versions resolved by `package-lock.json`.

Default-hostname checks use `test/fixtures/default-hostnames.json`, a repository-contained list of 47 public academic hostnames. No external reference document is needed. Bridge tests create isolated loopback endpoints with synthetic credentials; they do not discover or connect to an active desktop bridge. Example URLs, profiles, ports, tokens, and session IDs in tests are fixtures, not captured user data.

## Automated coverage

| Area | Representative checks |
| --- | --- |
| Settings UI | Independent navigation, two initially blank templates, 47 defaults, 600 ms autosave, serialized saves, conflict handling, retry, and disposal |
| Settings storage | Strict validation, hostname normalization, profile isolation, reload, copy isolation, atomic replacement, temporary Windows file locks, and corruption protection |
| Proxy rules | Whole-URL `%u` encoding, HTTPS hostname hyphens, path/query/fragment preservation, independent hostname groups, exact matching, invalid templates, downgrade rejection, and already-proxied URLs |
| Monitoring | Active and inactive tabs, URL rechecks, configuration-generation guards, loop prevention while still detecting verification, tracking expiry, restrictions, and disposal |
| Page binding | Distinct guests with identical URLs/titles, exact task-marker matching, external SSO tracking, cross-profile isolation, and delayed host web-server availability |
| Page presentation | Generated scripts executed against DOM fixtures, exact tab/occurrence/pane selection, existing-panel expansion, and rejection of hidden, covered, or ambiguous targets |
| Bridge transport | Loopback authentication, endpoint rotation, message limits, UTF-8 chunking, timeouts, request correlation, no replay of possibly executed commands, and error redaction |
| Download tools | Real DOM candidate selection, ambiguity handling, stale-page rejection, human-verification pauses, the browser tool's JSON-string return contract, and calls to `browser_click` |
| DSH integration | Actual SDK `defineTool` compilation and output rendering, isolated host-service mounting, authenticated GET/POST route contracts, and preservation of parent calls, permissions, cancellation, and restrictions |

Client tests use React/controller fixtures. Page detection and presentation tests use DOM and protocol fixtures. These checks validate the implementation and its assumed contracts without claiming a live desktop session was exercised.

## Verification boundaries

Automated checks do not establish:

- Rendering and interaction in every deployed DSH Settings UI or desktop layout.
- Successful sign-in through a real institutional proxy or SSO provider.
- Acceptance by a third-party CAPTCHA or anti-bot service.
- Operating-system foreground visibility of the original tab.
- Successful saving of a PDF after a download control is clicked.

Complete the deployment acceptance steps in [COMPATIBILITY.md](COMPATIBILITY.md) before relying on those behaviors. A reported click is not a download-completion record.

## CI and packaging

`.github/workflows/ci.yml` configures checks and packaging for Node.js 22.19 and 24 on Windows and Linux. Consult completed Actions runs for actual remote results; workflow configuration alone is not a successful run.

`npm pack` runs the source checks and tests through `prepack`. Inspect the tarball file list before publication. Source-only tests, scripts, dependency folders, caches, runtime configuration, and logs are not included in the runtime package. Packaging does not publish to npm or install the plugin into a DSH profile.
