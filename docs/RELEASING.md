# Releasing 0.2.0

[GUIDE](GUIDE.md) · [Compatibility](COMPATIBILITY.md) · [Validation report](VALIDATION.md) · [Upgrading](UPGRADING.md)

This procedure prepares source and an installable package for review. A local build, test run, or market YAML draft does not publish anything. GitHub source, a GitHub Release asset, npm publication, and a catalog pull request are separate actions.

## Prepare the source

Use a complete source checkout containing `scripts`, `test`, and the lockfile. Confirm the intended release revision and that `package.json`, `package-lock.json`, and `CHANGELOG.md` agree on `0.2.0`. The package remains `dsh-academic-web-proxy`; the repository is `Yokhong/dsh_academic_web_proxy`. The underscore/hyphen difference is intentional.

Keep the existing declared engine and peer ranges unless compatibility work supports a change: Node.js `>=22.19`, DSH `>=0.2.0-rc.2 <0.3.0`, and optional `dsh-builtin-browser` `0.3.x`. Reviewing native `4.1` APIs does not justify claiming or declaring tested support. The PDF dependency and lockfile must be present for clean installs.

Review the two READMEs and [GUIDE](GUIDE.md) against the implementation. Preserve the prominent limitations: opt-in naming, explicit local directory, temporary-file observation, a stable valid unencrypted PDF no larger than 64 MiB, prior unique metadata match, no overwrite, and unchanged original names when evidence is insufficient. Retain the existing 0.1 login/CAPTCHA handoff behavior without claiming new automatic resume capabilities.

Do not include runtime settings, real institutional proxy templates, actual download-directory paths, credentials, cookie data, personal PDFs, screenshots containing private details, or generated dependency folders in a source publication. Private validation can use the intended environment, but published reports must redact those details.

## Build and inspect

From the source root:

```sh
npm ci --ignore-scripts
npm run check
npm test
mkdir dist
npm pack --pack-destination dist
npm pack --dry-run --json
```

If `dist` already exists, reuse it. `npm pack` runs `prepack`, which repeats the required check and tests. The expected archive is `dist/dsh-academic-web-proxy-0.2.0.tgz`. Inspect the actual archive contents and record its integrity/hash and file count from the produced artifact; do not copy values from an earlier release.

The runtime package should include the manifest, source modules, client entry, Cordis patch, documentation, license, and notice. Development test/check scripts and the source lockfile are not runtime payloads. The package's `prepack` references source-only scripts, so rebuild or publish from the source checkout rather than trying to repack an extracted runtime tarball.

Install the actual archive into an isolated test profile using the host's normal plugin flow. Confirm the peer dependencies and PDF parser resolve and that the settings UI loads. Then perform the deployment checks in [Compatibility](COMPATIBILITY.md) on the intended browser and filesystem. Keep final automated results, pack inspection, install smoke results, privacy scan, and honest manual-test status in [Validation](VALIDATION.md). Keep the report aligned with the exact source and artifact being released, and distinguish an isolated npm/host-contract fixture from a real DSH CLI installation and live browser acceptance.

A local Windows run does not establish Linux or macOS behavior. Configured CI jobs count as validation only after they run successfully. Live SSO, CAPTCHA handoff, browser saving, fast-download skips, and hard-link filesystem behavior must remain explicitly unverified if they were not exercised.

## Public source, npm, and release assets

Make the implemented source and accurate documentation publicly reviewable before submitting a catalog entry describing v0.2 features. The npm package is optional for catalog eligibility, but a prebuilt package improves installation. A catalog listing itself is not a security audit or a promise of acceptance.

Before npm publication, confirm that the publishing account owns or may publish the exact package name. `npm view dsh-academic-web-proxy` only queries availability of public metadata; a missing result does not prove ownership or the right to publish. The repository field in the published package must point back to `https://github.com/Yokhong/dsh_academic_web_proxy`. Publish the intended version from the checked source only when the release action is authorized.

If the npm name must change, update `package.json`, the matching package entry in `package-lock.json`, the Cordis bundle's package resolution name, and every install example together. The market does not require an npm name prefix or equality with the GitHub repository name; scoped packages can be discovered when their source manifest and published repository backlink are correct.

A GitHub Release `.tgz` is an alternative distribution artifact. Upload the actual inspected archive and verify the public asset URL before documenting it. Do not invent an asset URL from a planned tag. A market `tarball` field is optional when source installation works, but required if the source cannot install. If using `/releases/latest/download/`, the asset basename must stay version-free; otherwise use the exact versioned tag URL. No tarball URL is included in the current draft without an uploaded asset.

## Catalog submission

A separately prepared `market_submission/` directory is maintainer handoff material, not part of the public source snapshot or runtime package. Do not copy that enclosing directory into the market repository. After public source supports the described behavior, prepare only:

```text
data/plugins/Yokhong__dsh_academic_web_proxy.yml
```

into an up-to-date checkout of `awesome-dsh-plugin/awesome-dsh-plugin`. The proposed category is `browser`. Submit only the entry; generated READMEs and npm mappings are maintained by the catalog. The catalog currently supports `description.en` and optional `description.zh` only, regardless of the plugin's three interface languages. Do not add `npm`, `version`, or extra locale keys.

Recheck the public registry for duplicates, the public repository's age/topic, the current manifest, and the current contribution guide before submission. The repository needs real working code, its own `dsh.bundle`, a public age of at least one day, active maintenance, and the GitHub `dsh-plugin` topic. The current submission checker has no commit-count minimum. Passing CI is a precondition; maintainers still review code, descriptions, category, duplication, and source behavior.

Public sources: [contribution guide](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md), [entry validator](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/scripts/lib/entries.mjs), [submission checker](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/scripts/check-submission.mjs), [npm discovery](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/scripts/probe-npm.mjs), and [site generation](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/scripts/build-site.mjs).

No remote publication, registry change, release upload, or pull request is performed by following the local preparation steps alone.
