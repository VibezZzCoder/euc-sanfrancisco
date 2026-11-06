# Contributing to SF Spin-off: EUC Thrills

The SF destination is in Early Access / Work in Progress. Begin with [README.md](README.md),
[FORK_GUIDE.md](FORK_GUIDE.md), [NOTICE.md](NOTICE.md) and [NOTICE-EUC-THRILLS.md](NOTICE-EUC-THRILLS.md).
Public source/provenance is indexed in [provenance/README.md](provenance/README.md).

## Preview and report

```bash
node tools/serve.mjs
```

Node.js 24+; open http://127.0.0.1:8002 and stop with Ctrl+C. Runtime dependencies/data/fonts/audio are local.
For a bug, include the street/destination, rider, browser/GPU, graphics backend, rendering scale/FPS setting, input
device and exact steps. Distinguish Chromium emulation from a physical phone, foldable, tablet or controller.

## Focused implementation

- Keep native JavaScript and the explicit classic-city/ES-module seam. One Three identity, renderer and loop owner;
  fixed 120 Hz EUC simulation. The host owns startup and teardown; the controller owns movement, while city adapters
  supply elevation-aware support, collision and actor queries.
- Preserve real hills, building elevations/concavities and shared city life. Mobile adaptations change rendering
  and resource cost, not routes, physics, collision, roster or population.
- Keep source and generated output distinct. `js/euc/` is generator-owned; record exact upstream revisions and
  transformations. Future riders/assets are not automatically approved by the reviewed roster.
- Trace imports, classic namespace consumers, preparation, audio, workers, preloads and packaged output before pruning.
  Shared `actor-models`, `WorldCollision`, landmark helpers and geographic validation are not obsolete player modes.
- Use focused tests by impact; preserve geometric/data assertions and report timing-sensitive limits honestly.
  SF shell/sampler/geometry/destination tests complement the retained city/data tests. Deleting obsolete car-mode
  fixtures does not establish replacement EUC browser/input acceptance.

## Local package checks

```bash
node --check tools/serve.mjs
node --check tools/build-static.mjs
node --check tools/check-static.mjs
node --test tests/static-preview.test.mjs
node tools/build-static.mjs
node tools/check-static.mjs
```

The focused HTTP tests launch child previews with OS-assigned loopback ports (`0`), never the parent's port 8002.
Symlink/private-file fixtures are isolated under ignored `qa-artifacts/` and removed after the test; no live runtime
file is swapped. They cover HTTP headers and methods, restricted paths, traversal, malformed paths, recovery and symlink rejection.
The package checker also resolves public documentation links, checks for private checkout paths/public links to
local-only donor hashes, compares native EUC preloads to the generated eager list and reports exact payload bytes.

These verify local HTTP/packaging and source references. Browser QA is separate, using isolated Playwright Chromium and
project-local dependencies, with artifacts under ignored `qa-artifacts/`. Serialize bounded GPU phases and use the
full device/foldable and WebGPU/WebGL2 matrix for integrated acceptance. No browser or full-suite results are implied
by a passing package check.

## Data, rights and release scope

Keep DataSF/USGS/OSM provenance, ODbL database availability, discoverable in-game OSM credit, both city MIT notices,
EUC/Three/font notices and per-file/identity/audio exceptions. Geographic tools/queries and source validation are
retained for reproducibility; committed runtime data suffices for development. Do not fetch/regenerate geography
for this adaptation. Never include private rider reference/permission records, credentials or personal browser state.

The first public release requires **all intended regional EUC destinations**, including Golden Gate approaches/
crossing, Twin Peaks and Painted Ladies. Dorkins/booking follows that release; authored skate venues are separate.
The inherited automatic Pages workflow is removed. `dist/` is a local runtime package, not a curated public source
export or permission to publish. SF-specific clean-source curation/export validation and explicit owner release/push
approval remain required. See the public README's local package notes; publish only a reviewed source tree with its
licences, notices, provenance and runtime data intact.
