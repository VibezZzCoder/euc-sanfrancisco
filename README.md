# SF Spin-off: EUC Thrills — Early Access / Work in Progress

> **Early Access / Work in Progress.** With the region enabled, every destination can be reached and ridden; the game runs with both
> WebGPU and WebGL2. Expect rough visuals, a long first load and unfinished corners; see
> [Known rough spots](#known-rough-spots). Feedback is very welcome.
> **Phone-ready Light world:** phones start on WebGL2 with a terrain-only **Light world**. The core is retained;
> outer terrain and destination ground replace the previous void, while regional buildings, trees and boats remain
> omitted. The owner completed a **15-minute iOS Home Screen playtest** of the compact-support Light build,
> with the full playtest checklist completed, no reloads, and the session ended voluntarily. Longer sessions and
> other phones still need testing.

**[▶ Play now](https://vibezzzcoder.github.io/euc-sanfrancisco/)**

**[EUC Thrills website](https://euc.erodmen.com/)**

Ride an electric unicycle through a living 3D San Francisco. Climb the real hills, roll down to the waterfront,
cross the Golden Gate and explore Twin Peaks and the Painted Ladies. Buildings, traffic, pedestrians, cable cars,
trams and fog share the streets. This is a free, separately hosted city destination in
[*EUC Thrills*](https://github.com/VibezZzCoder/EUC-thrills) by VibezZzCoder, requested by Maribel Vargas.

The riding comes from *EUC Thrills*: the wheel's physics, the riders and the crashes. The city is adapted from
[Kamil's Slop San Francisco](https://github.com/unable12/slop-sanfrancisco), itself derived from
[Mr.doob's Slop New York](https://github.com/mrdoob/slop-newyork), both MIT. It is not meant to merge back.

Exploration comes first. There is no score: roam, find a route and enjoy the city. The steep grades are real and
intentional, so leave room to brake on descents. Simple tricks are optional extras.

Choose from eleven reviewed riders: **Cool Rider, Trollina, Red Rider, Adonisb2, Maribel Vargas, Wheel in Motion,
The Drunkard, FloWithZo, Seal on a Wheel, Wyldist and Gnarwheel**. Each has their own look, wheel and mapped crash
sounds. Browse profiles, then confirm a rider; browsing does not load the whole roster. City brands are fictional or
generic. Reviewed participant marks, including Wyldist's separately owned SMLS sleeve mark, are the narrow
owner-approved exception. Street, district and landmark names are kept as place names. See the
[rights notice](NOTICE-EUC-THRILLS.md).

<p align="center">
  <a href="screenshots/golden-gate.webp"><img src="screenshots/golden-gate.webp" width="420" alt="Cool Rider on Golden Gate's marked roadway, with open orange guardrails, side paths, suspension towers and the bay ahead." /></a>
  <a href="screenshots/painted-ladies.webp"><img src="screenshots/painted-ladies.webp" width="420" alt="Cool Rider overlooking the Painted Ladies from Alamo Square, with the downtown skyline beyond and the riding HUD visible." /></a>
</p>
<p align="center">
  <a href="screenshots/market-street.webp"><img src="screenshots/market-street.webp" width="420" alt="Cool Rider on Market Street among traffic, tram tracks, pedestrians and downtown buildings, looking toward the Ferry Building." /></a>
  <a href="screenshots/lombard-coit.webp"><img src="screenshots/lombard-coit.webp" width="420" alt="Cool Rider at Lombard and Hyde, looking downhill across San Francisco toward Coit Tower and the bay." /></a>
</p>
<p align="center">
  <a href="screenshots/stockton-tunnel.webp"><img src="screenshots/stockton-tunnel.webp" width="420" alt="Cool Rider facing Stockton Tunnel's south masonry portal and illuminated bore, with the riding HUD visible." /></a>
</p>

*In-game screenshots from Early Access builds: WebGPU, High graphics, 100% 3D resolution, Golden Hour,
1280×720. Three views use the game's hide-HUD control. Click any image for full size.*

## Play

Open the [play link](https://vibezzzcoder.github.io/euc-sanfrancisco/) in an up-to-date desktop browser with hardware
acceleration. Phones start on **WebGL2**; desktops and tablets retain WebGPU-first with WebGL2 fallback.

| Device / URL | Renderer policy |
|---|---|
| Phone, no override | WebGL2 (`phone default` in the pause menu), Light world |
| Desktop or tablet, no override | WebGPU preferred; WebGL2 fallback if unavailable; region on, unchanged |
| [`?webgpu=0`](https://vibezzzcoder.github.io/euc-sanfrancisco/?webgpu=0) | Force WebGL2 (`forced by URL`) |
| [`?webgpu=1`](https://vibezzzcoder.github.io/euc-sanfrancisco/?webgpu=1) | Explicitly request WebGPU, including on phones |

Covered WebGPU validation failures, and startup device-loss/out-of-memory failures, can still trigger one reload
into WebGL2 (`automatic fallback`). A session already on WebGL2 does not repeat that reload. Remove `webgpu` and
`fallback` parameters to return to the device default. The successful Home Screen playtest is evidence for that session,
not a guarantee for every device or rendering backend.
World choice is independent: `?tier=light` or `?tier=full` overrides the boot choice on any device. Without an explicit
tier, `?region=1` still opts a phone back into Full world. An explicit tier wins a conflicting `region` option.
`?tier=full&region=0` retains the old scenery-off diagnostic mode and its downloads. Remove `tier` and `region` to
restore device defaults. Light does not change saved Graphics/3D-resolution choices or desktop/tablet defaults.
The first load downloads and builds a large city, so allow about **30 seconds on a desktop** (longer on slower
machines or connections). Choose a rider if you like, then press **Ride**. Sound starts after your first interaction.

Use the map (`M`) to find places and jump to them. A map pin marks a place; an arrival is only accepted when there
is a safe spot to stand.

The title link and the pause menu's confirmed return action go back to the
[EUC Thrills main menu](https://vibezzzcoder.github.io/EUC-thrills/) in the same tab.

**On iPhone:** open the play link in Safari, then use **Share → Add to Home Screen** to create a separate SF web app.
A Home Screen app created from a local preview address still needs that computer/server; it is separate from the live
GitHub Pages installation.

### Controls

| | Keyboard and mouse | Gamepad (Xbox layout) |
|---|---|---|
| Accelerate / brake, then reverse | `W` / `S` or `↑` / `↓` | RT / LT, or left stick |
| Steer | `A` / `D` or `←` / `→` | Left stick |
| Hop (kerbs!) | `Space` | A |
| Charge / tuck | `Shift` | X |
| Get up after a crash | `R` | B |
| Camera | `V` / `Shift+V` cycle forward / backward; mouse drag orbits, wheel zooms | Y; right stick orbits |
| Map | `M` | Start |
| Pause / menu | `Escape` or `P` | View / Back |
| Rider picker | `C` | LB / RB |
| Hide HUD / toggle sound | `H` / `N` | |

**Touch (phones and tablets, portrait and landscape):** the floating left stick steers and controls throttle and
braking; **HOP**, **CHARGE** and **GET UP** sit on the right. Drag outside the controls to orbit the camera and
pinch to zoom. Rotating, folding or resizing releases held gestures: lift and touch again.

The upper-left **3D resolution** (100/75/50%) and **Graphics** (High/Medium/Low) controls reduce rendering cost;
**Frame rate** sets a rendering cap, with Auto following your display. They change rendering only;
routes, physics, traffic and the city stay the same. The speedometer
shows mph and km/h. The [player guide](PLAYER_GUIDE.md) covers every control, the map, recovery and settings.
Fresh phone sessions default to **Medium / 75%**; desktop defaults to **High / 100%**. Your saved choices take
precedence, and rotation does not reset them. The pause menu shows **Build [UTC timestamp] · [actual backend]**;
include that text with reports. WebGL2 labels distinguish **phone default**, **forced by URL**, and **automatic fallback**.
A loading note identifies the renderer and last recorded loading stage or actual session state: title, riding, map open,
booking or paused. It updates on state changes and every ten seconds; elapsed seconds include loading time.

For optional read-only rendering diagnostics, open the game with
[`?perf=1`](https://vibezzzcoder.github.io/euc-sanfrancisco/?perf=1). The panel shows the rendering backend, submitted
draw calls/triangles, frame-interval mean/p95 and intervals over 50 ms. It samples the last five seconds, up to 600
intervals, and resets when riding is suspended. These intervals are not GPU timings or proof of displayed FPS.

Recent rendering updates reduce offscreen tree/paint submissions, tighten shadow-caster culling and spread the first
build of distant Golden Gate / Twin Peaks scenery across frames; distant scenery may appear a moment later.
The owner previously reported a clearly better framerate playing at night with a PS5 controller.
Earlier updates reduced retained support/collision and graphics-resource memory, narrowed map allocations,
and addressed a Firefox shader-validation incompatibility. The terrain-only Light world includes checked outer-edge
returns and map coverage guidance. The compact-support update stores the same riding-surface addresses more tightly:
matched Chromium phone emulation measured about **27 MiB less retained JavaScript plus backing storage** at the title
and first map. This is not an iPhone memory measurement. Some synthetic support-query batches cost slightly more;
startup memory peaks remain substantial and lower retained memory is not a universal speedup.

The Light-world paint update stores repeated road-marking styles in an exact shared palette. Measured native paint
buffer allocations are **24.67 MiB smaller on both WebGL2 and WebGPU**, with pixel-identical selected comparisons of
road lines, crosswalks, bike lanes and rail markings. Full world keeps the original representation. This is a graphics-
buffer allocation saving, not measured physical GPU residency or iPhone memory: retained JavaScript plus backing
storage was about 22–32 KB higher in the matched title/map samples. The owner subsequently played that published
paint-style build on their phone and accepted it; session duration, backend and detailed cases were not specified.

Both world tiers now build the same support indexes without a growing temporary bucket-replay array. This removes
the main index's **26.69 MiB scratch allocation**, including **40.03 MiB of old/new replay-buffer overlap** during its
last growth. Those are construction-allocation quantities, not a guaranteed whole-browser peak reduction. Separate
Chromium phone-emulation pairs sampled backing-storage peaks 14.4–14.7 MiB lower, but process/heap peaks were mixed
and settled title/map memory was nearly unchanged. The replacement adds construction lookups; one diagnostic pair
measured about 0.29 seconds more Light index-construction work. Riding/collision queries and index data stay the same.
A fresh phone check for this construction change was deferred by the owner to the published build.

The porting follow-up corrects destination location labels, removes invented opposite-shore night reflections and
preserves the Light horizon's true outer endpoints. Complex intersections now give each approach group its own full
signal phase, shared by vehicle behavior, pedestrian WALK timing, visible lights and horn eligibility. Ordinary
two-phase timing stays the same; complex junctions can have longer red waits. Overlapping signal heads are separated
with matching physical geometry. Terrain/geometry/texture budgets are unchanged; this is not a measured guarantee that
every browser-memory category or loading peak is lower.

## Officer Dorkins

Keep an eye out for Officer Dorkins on his hover-wheel. If he pursues you, hop or swerve away, or break sight and
gain distance to escape. Three paddle knockdowns are warnings; a fourth leads to booking at County Jail. During
booking, choose **Skip booking** or, after the paperwork, **Back to riding**. Release positions are checked for
clearance; if every exit is blocked, try again or reload to resume your previous committed riding checkpoint.

During a pursuit, a red-and-blue marker shows Dorkins on the radar and, when in view, the full map. A distant
officer appears at the radar's edge to indicate his direction. The marker shows horizontal position, so he may be
on another level; it disappears when the chase ends and is not a waypoint or arrival target. See the
[player guide](PLAYER_GUIDE.md#officer-dorkins-experimental) for booking and controller details.

The chase and booking are experimental. The owner has playtested on Ubuntu Chrome with Xbox and PS5 controllers
(Seal on a Wheel at blue hour; Wyldist at night), and completed the iOS Home Screen checklist including capture/release.
Booking pauses correctly when the window loses focus. Broader routes, devices, longer sessions and booking fallback
transitions still need review.

## Skateparks

- **UN Skate Plaza:** an 18×104 m Jefferson-inspired plaza with 11 features, linked banks and rollers, tabletop,
  manual pad, bench, rail and opposing curved quarters for back-and-forth riding. A 4 m central strip stays clear.
- **Zion / Waller Street:** a 38×76 m Pier 62-inspired park on the grass beside Waller, with 9 features, broad flow
  lines, an 8 m-wide opposing halfpipe and a quarter/deck with a banked return. The road stays open beside its access path.
- Use **Teleport**, or search the map for **UN Plaza**, **United Nations**, **Zion** or **Waller**. Skateboard icons
  identify both parks on the fullscreen map and minimap. Arrivals are checked for a safe standing spot and ride-away.
- The parks use original gameplay layouts adapted from the NYC destination, not surveyed replicas. Enter halfpipes
  at moderate speed and ease off before the curved faces; full throttle can carry you over a lip. See the
  [skatepark riding guide](PLAYER_GUIDE.md#skatepark-riding) and [source provenance](provenance/nyc-skateparks.json).

## Golden Gate Bridge

Ride the marked roadway or follow the lighter side paths around the towers. Both ends have terrain-fitted road and
sidewalk access, with smoother vertical joins. The bridge now has connected suspension details, grounded approach
supports, lower-tower bracing and an approximate Fort Point arch. Visit **Fort Point** for a view from below.

The bridge's adapted structural details and approach heights are estimates, not a surveyed replica. Owner playtesting
and automated WebGPU/WebGL2 steered crossings of the full roadway centreline in both directions pass; other lanes,
walkways, night-specific review and physical-device performance remain broader testing work.

## Known rough spots

This is an early release. Known issues include:

- **Tunnel approaches:** some approach ramps sit awkwardly behind the newer tunnel portal walls.
- **Bay Bridge:** upper-west traffic may extend beyond the visible deck.
- **Earlier geometry repairs:** the I-80 W off-ramp near Clementina, a terrain step near Vermont St, and Lombard's
  conspicuous planting boxes have been improved. Selected riding segments were tested on both graphics backends;
  complete routes, other boundary locations and physical devices still need broader review.
- **Outer neighbourhoods** look bland and low in detail.
- **Union Square, Dragon Gate and Fisherman's Wharf** still lack their real character.
- **Alcatraz and Yerba Buena Island** are undercooked.
- **Golden Gate Park** has sparse trees.
- **Long first load:** around 30 seconds on a desktop, longer on slower devices. Brief hosting errors while
  downloading city data are retried automatically. Other assets can still receive transient hosting errors;
  a reload may be needed. A module returned HTTP503 during an earlier live check; an unchanged retry passed.
- **Dorkins:** chase, booking and map-marker behavior are still being tested across routes and devices; the map
  cannot show whether the officer is on a different elevation.
- **Historical iPhone reloads, before Light world:** live HTTPS build `2026-11-10 0528Z` on the iPhone Air
  repeatedly returned to the first loading screen in Home Screen WebGPU sessions, in portrait and landscape.
  Breadcrumbs reported 67, 61 and 34 seconds after startup in the old broad “riding” state, and 17 seconds at scene
  visibility/shadows; loading time is included. WebGL2 in a Safari tab lasted clearly longer but was not reported stable.
  The earlier LAN WebGL2 test also eventually failed. No November 9/10 JetsamEvent was found; the cause is unmeasured,
  not a confirmed system memory kill. A cable Inspector connection was attempted but the Mac did not list the phone;
  no device memory reading was obtained.
- **Phone region-off mode — seen by the owner on a device:** on the same build, WebGL2 plus `?region=0`, Home Screen,
  Medium/75 ran a full session without reload: rider changes, rotation, a Dorkins escape, the map and several location
  changes. WebGPU with the region off lasted longer than with it on but eventually reloaded during rotation.
- **Light world — automated checks and a successful 15-minute physical session:** a separate terrain-only package avoids
  unused regional downloads, retaining the original outer city heights/ground classes and detailed core. A cheap
  horizon and near-rider terrain replace the void around destinations. Regional buildings, trees and boats are still
  omitted, so the outer landscape is bare. The map marks distant scenery-only coverage, unsupported arrivals remain
  checked, and leaving supported terrain makes a checked return to the last verified safe point with a notice.
  Desktop and tablet defaults retain Full world. The earlier compact-support test lasted **15 minutes** in a separate iOS Home
  Screen web app created from the local preview. They reported completing the full ten-minute checklist—rider changes,
  map use and rotations, park riding, destination visits, capture/release and crash recovery—with everything working,
  no reloads, and a voluntary close. That tested compact-support runtime is published in **build `2026-11-13 0024Z`**.
  The test used local HTTP/WebGL2; physical live-HTTPS/WebGPU, longer endurance, complete routes and other devices remain
  separate checks. No device-memory measurement or controlled before/after stability comparison was made.
  The owner subsequently retested the porting-follow-up preview with rotations, teleporting and rider switching and
  reported no reboots, then approved publication. That follow-up session's duration was not specified.
  They later accepted the published paint-style build after phone play, with duration, backend and detailed cases
  unspecified. That feedback predates this support-index construction update.
- **iOS viewport recovery:** during that session, one corner-zoom/page-shift incident immediately corrected itself.
  This supports the existing recovery fix; it does not mean the initial jump can never occur. Report persistent offsets.
- **Other phones, tablets and foldables:** emulated layouts do not establish physical-device stability. Android,
  foldable transitions and sustained-play/thermal behavior still need review. Lower graphics settings are not a guaranteed remedy.
- **Firefox:** prior Linux WebGL2 checks pass. Experimental Linux Firefox WebGPU can run out of memory and stall at the
  first frame after falling back to WebGL2. Fresh Firefox testing was explicitly waived for the compact-support,
  porting-follow-up, paint-style and support-index construction releases;
  current macOS behavior still needs confirmation. Report the actual backend and fallback URL rather than assuming
  WebGPU succeeded.

## Feedback

Please report bugs and ideas through
[GitHub Issues](https://github.com/VibezZzCoder/euc-sanfrancisco/issues), also available from the pause menu's
**Feedback / bugs** link. The pause menu's **Player guide** opens this repository's guide; both links open a new tab
and keep SF paused. Helpful details: where you were (street
or destination), the rider, your device, browser and graphics card, the graphics backend shown on screen if any,
your Frame rate / 3D resolution / Graphics settings, the pause-menu build ID, the input device and the steps that led to the problem.
Please say whether you used a physical phone or tablet, a foldable or a desktop browser. See also
[CONTRIBUTING.md](CONTRIBUTING.md).

## Run it locally

No build step and no install. Use Node.js 24 or newer:

```bash
node tools/serve.mjs
# then open http://127.0.0.1:8002
```

The preview binds only to your own machine and serves the game files. Stop it with **Ctrl+C**.

## Developing

- `node --test tests/*.test.*` runs the headless tests (Node.js 24).
- `node tools/build-static.mjs` then `node tools/check-static.mjs` builds and checks the runtime file set in
  `dist/`; `node tools/serve.mjs --dist` previews it.
- City data is delivered as lossless gzip copies (`data/**/*.bin.gz`); `node tools/compress-data.mjs --check`
  confirms each one inflates to the exact committed `.bin` beside it. The raw files stay in the repository as the
  test and source-of-truth form of the database.
- `js/euc/` is generated; do not edit it. The base is EUC Thrills v1.1.0
  `5f45fff19b258e140833841ba2473069af751a12`, with six reviewed code files from
  `d37efc07cddc0d76ff7aa585901710d357b8e5a1` (v1.4.0). With clean local checkouts of both:

  ```bash
  node tools/vendor-euc.mjs --src ../EUC-thrills --donor ../EUC-thrills-latest --check
  ```

- three.js (one pinned commit) and the Inter and Overpass fonts are kept in the repository (`vendor/three/`,
  `fonts/`), so the game loads only from its own host. `node tools/vendor-three.mjs --check` confirms them.
- The offline geography tools and queries under `tools/` are kept for provenance and reproducibility. The game does
  not need them: the generated data is already included.
- Source identities and provenance: [provenance/README.md](provenance/README.md).

### Fork authors and coding agents

**[Read the public fork guide](FORK_GUIDE.md)** before repurposing the roster. Independently branded forks with
original characters are encouraged. MIT code and CC BY original assets have no EUC Thrills branding condition;
real identities, supplied logos, contributed recordings and SMLS have separate rights. For an independent game,
replace identity-bearing material unless separately permitted. Hiding chooser entries or renaming riders is not
removal: trace imports, embedded payloads, audio and actual distributed output. Keeping the name grants no rights.

## License and data

- Code: [MIT License](LICENSE). The city: © 2026 Mr.doob (Slop New York) and © 2026 Kamil
  ([@unable0_](https://x.com/unable0_)) for the San Francisco contributions. Keep the copyright lines in every copy.
- *EUC Thrills* code: MIT, © 2026 VibezZzCoder ([js/euc/LICENSE](js/euc/LICENSE)). Original rider/wheel asset work:
  CC BY 4.0, **excluding real identities and the supplied/third-party material identified in the notice**.
  Assets from *EUC Thrills* by VibezZzCoder — CC BY 4.0 — https://github.com/VibezZzCoder/EUC-thrills. See
  [NOTICE-EUC-THRILLS.md](NOTICE-EUC-THRILLS.md), which must travel with every copy. Audio files and their licences
  are listed in [audio/euc/PROVENANCE.md](audio/euc/PROVENANCE.md); contributed recordings and generated vocal layers
  have their own terms there.
- San Francisco geographic data: **City and County of San Francisco / DataSF** (PDDL; Land Use CC0),
  **USGS 3D Elevation Program** (public domain) and
  **© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)** under the
  [Open Database License (ODbL 1.0)](https://opendatacommons.org/licenses/odbl/1-0/). The OpenStreetMap-derived
  parts of the generated city data are a derivative database under the ODbL and stay openly available in this
  repository, both as the raw `.bin` files and as their lossless `.bin.gz` delivery copies. Credits are also shown
  in the game. Sources and transformations: [provenance/data-sources.md](provenance/data-sources.md) and
  [provenance/formats.md](provenance/formats.md); landmark references:
  [provenance/landmarks/INDEX.md](provenance/landmarks/INDEX.md).
- three.js: MIT ([vendor/three/LICENSE](vendor/three/LICENSE)). Inter and Overpass: SIL Open Font License 1.1
  ([fonts/OFL-Inter.txt](fonts/OFL-Inter.txt), [fonts/OFL-Overpass.txt](fonts/OFL-Overpass.txt)).
- Full map of materials and licences: [LICENSING.md](LICENSING.md) · city and data notice: [NOTICE.md](NOTICE.md).

This project is not affiliated with or endorsed by Mr.doob, Kamil, any rider, the City and County of San Francisco,
or any manufacturer or brand. This is a game, not real-world EUC riding instruction.
