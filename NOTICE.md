# SF Spin-off: EUC Thrills — notice

An owner-maintained EUC Thrills city destination by **VibezZzCoder**, in Early Access / Work in Progress.
Visual refinement and broader device testing continue; physical phone and foldable acceptance is not complete.

## Software origins

- [Slop New York](https://github.com/mrdoob/slop-newyork), © 2026 Mr.doob, MIT.
- [Slop San Francisco](https://github.com/unable12/slop-sanfrancisco), San Francisco adaptation/contributions by
  **Kamil ([@unable0_](https://x.com/unable0_))**, MIT. Imported SF source:
  `bdd5d37ed5f5cbb93402e677044f49e498b267e2`; its notice identifies the original NYC import as `0049a49`.
  Both copyright notices remain in [LICENSE](LICENSE).
- [EUC Thrills](https://github.com/VibezZzCoder/EUC-thrills), © 2026 VibezZzCoder. Code MIT under
  [js/euc/LICENSE](js/euc/LICENSE). Original assets, attribution and identity/audio exceptions:
  [NOTICE-EUC-THRILLS.md](NOTICE-EUC-THRILLS.md). EUC integration also derives from the owner's NYC destination;
  [provenance](provenance/README.md) records the exact donor snapshots and local adaptations.
- Three.js is locally vendored under [its MIT license](vendor/three/LICENSE), with pin/file hashes in
  [vendor/MANIFEST.json](vendor/MANIFEST.json). Inter/Overpass WOFF2 fonts retain their respective SIL OFL notices
  in `fonts/`. Offline geography-tool dependencies retain their own licenses and lockfile.

The project's software MIT license does not relicense geographic databases, fonts or identity-bearing content.

## San Francisco data

- **City and County of San Francisco / DataSF:** Public Domain Dedication and License (PDDL); Land Use CC0.
- **USGS 3D Elevation Program:** public-domain US government work; source elevations are metres NAVD88.
- **© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)**, under the
  [Open Database License (ODbL 1.0)](https://opendatacommons.org/licenses/odbl/1-0/).
  OSM-derived geometry in `js/sf-geodata.js`, landmark anchors in `js/sf-places.js`, and OSM-derived regional
  coastline/island/ferry-route data retain ODbL terms. The generated derivative database remains available under
  ODbL; the combination of sources does not make all data MIT. Keep OSM attribution discoverable in-game.
- **DataSF Analysis Neighborhoods (`j2bu-swwd`):** the 41 official analysis polygons in `js/sf-places.js`, credited
  to City and County of San Francisco / DataSF.

Retain the [source/dataset inventory](provenance/data-sources.md), [formats and transformations](provenance/formats.md),
[landmark references](provenance/landmarks/INDEX.md), generated embedded provenance and geographic tools when curating
public source. Runtime assets are already included; downloading/regenerating geography is not part of previewing.
See [LICENSING.md](LICENSING.md) for the complete material/license map.
