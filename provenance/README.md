# Public source and provenance

This directory carries the public dataset, format and model citations alongside exact source identities and
licence information. Curated source releases retain these records independently of development notes and QA artifacts.

| Source | Exact snapshot / retained evidence |
|---|---|
| City | `unable12/slop-sanfrancisco@bdd5d37ed5f5cbb93402e677044f49e498b267e2`, © 2026 Kamil; derived from Mr.doob's `slop-newyork@0049a49`. Both MIT notices remain in `LICENSE`. |
| EUC integration | NYC donor local revision `9c4cfc9e32a425d58bac36cf9e074a2aa77fac70`, runtime revision `cf56976bd21f4e29c706c7fa2ec01a1474da98a5`; [nyc-integration.json](nyc-integration.json) records copied bytes before SF changes, not current-output integrity. |
| Graphics quality | Selective NYC local donor `4a88f172d4c1725d52e64ae4442d76a1ca6eede9`, MIT © 2026 VibezZzCoder; [graphics-quality.json](graphics-quality.json) records donor identities and SF adaptations. |
| EUC controller/eleven riders/assets | `VibezZzCoder/EUC-thrills@5f45fff19b258e140833841ba2473069af751a12`; `js/euc/MANIFEST.json`, generated per-file headers, `js/euc/LICENSE`, `NOTICE-EUC-THRILLS.md` and `audio/euc/PROVENANCE.md`. |
| Focused later EUC code borrowing | `d37efc07cddc0d76ff7aa585901710d357b8e5a1`, only the six reviewed code files enumerated by `js/euc/MANIFEST.json`; no roster/asset migration. |
| Three.js / local fonts | `vendor/MANIFEST.json`, Three pin `e27dfa95ae7f453b5d7a9a36ffdb563f7c9b529b`, MIT/OFL notices in `vendor/three/` and `fonts/`. |
| SF geography | [data-sources.md](data-sources.md), [formats.md](formats.md), generated embedded source fields and retained offline tools/queries. |
| Landmark/model reference citations | [landmarks/INDEX.md](landmarks/INDEX.md) and individual model/source notes, moved from upstream `docs/landmarks/`. Historical review conclusions are not SF EUC acceptance. |

The seed manifest's `source` URL is public-project attribution. Its `localDonorRevision` and `runtimeRevision` hashes
are plain local historical identifiers, not public commit links or a claim that those revisions can be fetched there.
No private Git objects/history, local checkout paths or handover accompany them. Recorded source SHA-256 values
identify copied seed bytes; they do not authenticate a public revision or verify today's adapted SF outputs.

No private permission exchanges, photographs/reference packs, QA artifacts or private working history are required
public provenance. No new participant or third-party license is asserted. See `NOTICE.md`, `NOTICE-EUC-THRILLS.md`,
`LICENSING.md` and `FORK_GUIDE.md` for the separate software/data/asset terms.

## Changes to inherited publication/development material

- Removed `.github/workflows/pages.yml` from the pinned SF source. It automatically built/uploaded/deployed on
  `main` pushes and also allowed manual deployment. This fork has **no inherited automatic publication workflow**.
- Replaced the inherited `tools/serve.mjs`, which exposed root/private paths and threw on malformed decoding, with
  an explicit-file-set, no-store loopback-only preview. `tools/static-files.mjs` defines its runtime/public boundary.
- Adapted `tools/build-static.mjs` / `check-static.mjs` for local EUC runtime inspection, vendored dependencies,
  fonts/audio, notices and this public provenance. They do not publish and are not a curated source exporter.
- Removed old car/helicopter player modes, their exclusive media and the obsolete single-file regional terrain.
  Geographic tools, active shared-city code and validation remain in source; runtime regional terrain uses tiled data.

SF release preparation uses curated source exports with privacy, attribution, source-consistency and package checks.
Retain public provenance and source/data availability under their licences. Local validation is separate from
publication and gameplay acceptance. The first release is Early Access / Work in Progress; its public README records
scope and known limitations, including unverified physical-device coverage.
