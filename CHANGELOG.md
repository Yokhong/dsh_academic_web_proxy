# Changelog

## 0.2.0 — release preparation

- Add plugin-local Simplified Chinese (`zh-CN`, default), Traditional Chinese (`zh-TW`), and US English (`en-US`) settings with automatic persistence.
- Add opt-in PDF filename settings: renaming off, no download folder selected, and `title/year/platform` selected by default. Available fields follow the fixed `title/author/year/venue/platform` order; author means first author.
- Capture article metadata from ready same-profile academic pages and before a real download-control click, using public citation/DC/PRISM/ScholarlyArticle metadata with bounded fallbacks and no cloud lookup.
- Add conservative local-folder observation of newly appearing `.pdf.crdownload` and `.pdf.part` files. Rename only after the temporary file disappears, the new matching final PDF is stable for two seconds, and an unencrypted valid PDF no larger than 64 MiB uniquely matches article metadata captured before the temporary download was observed.
- Use PDF Info DOI or exact sufficiently long normalized title for identity. Keep original names when evidence is missing, ambiguous, late, corrupt, encrypted, oversized, or outside the supported folder/file conditions. Do not infer publication year from PDF dates or claim native browser completion events.
- Sanitize selected filename components, omit missing fields, preserve the original name when no selected values exist, and use guarded same-folder hard-link/unlink renaming with numbered collision suffixes and no overwrite.
- Bound article metadata and pending downloads to 100 entries each with 30-minute expiry; keep at most ten recent filename outcomes in memory without absolute paths. Exclude baseline files, subfolders, symbolic links, and existing multiple hard links. Browser history can retain the old filename.
- Preserve the version-1 settings envelope and prior proxy values, with defaults for new fields. Document backup and rollback requirements because 0.1 can reject newly saved fields.
- Retain the 0.1 login/CAPTCHA prompt and original-tab handoff behavior. Keep the existing engine ranges and `dsh-builtin-browser` `0.3.x` peer; native `4.1` APIs are reviewed but not integrated or live-tested.
- Add user, privacy, upgrade, compatibility, and release guides plus a separate market submission draft. Release checks and live acceptance are reported in `docs/VALIDATION.md`; release preparation does not mean public publication.

## 0.1.0

- Add an independent DSH Settings section with two initially blank, persisted URL schemes.
- Include 47 public academic hostnames as one toggleable default group, plus an independent custom-host list.
- Implement exact hostname selection, URL encoding, HTTPS protection and redirect-loop guards.
- Add profile-scoped Desktop sidebar monitoring and exact-tab login/CAPTCHA presentation through the existing browser bridge.
- Add four policy-preserving academic browser tools and a real DOM download-button workflow.
- Include optimistic settings revisions, atomic persistence, compatibility fixtures and npm/GitHub release instructions.
- Document supported browser backends and validation boundaries; institution-specific login and final file saving require deployment acceptance testing.
