# SF Spin-off: EUC Thrills — player guide

**Early Access / Work in Progress.** Explore the city and regional destinations, including Golden Gate
access/crossing, Twin Peaks and Painted Ladies. Visual refinement and broader device testing continue;
physical phones and foldables are not fully verified. See the README's known rough spots.

## Start and ride

1. Open the game or the local preview described in [README.md](README.md#run-it-locally). Wait for initialization to complete.
2. Use **Choose rider / Change rider** to browse the eleven reviewed profiles. Confirm the named rider to prepare
   their appearance and selected sounds; browsing alone does not change your committed rider.
3. Activate **Ride**. Gameplay stays gated before that action. Audio unlocks following a real user gesture.
4. Explore the city on an EUC. San Francisco's steep grades are intentional: allow room to brake on descents.
   Hops, one-foot/tuck and airborne 180/fakie cues follow the EUC riding system; there is no scoring mode here.
   Walkers can step aside, stop for nearby riders and chat with each other. A moving rider impact can shove a walker,
   briefly pause their walking and trigger a synthesized complaint before they return to their path. Space and
   obstacles can limit their reaction.

## Keyboard and mouse

| Input | Action |
|---|---|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake, then reverse |
| `A` / `D` or `←` / `→` | Steer |
| `Space` | Hop; hold for the riding/trick action |
| `Shift` | Charge / tuck |
| `R` | Request checked get-up/recovery after a fall |
| `V` / `Shift+V` | Cycle camera forward / backward |
| `M` | Open/close map |
| `Esc` / `P` | Pause/menu |
| `C` | Rider picker |
| `H` | Hide/show the HUD |
| `N` | Toggle sound |
| Mouse drag / wheel | Orbit / camera distance |

Release held inputs after a pause, device switch or page return before riding again. Menus and map search consume
their own input; activating a menu action should not become a hop. Use native buttons/keyboard focus to operate dialogs.

## Touch

Use the floating left stick for steering and throttle/braking. The right-hand **HOP**, **CHARGE** and **GET UP**
controls support independent pointers. Drag outside controls to orbit; pinch to change camera distance. Map/menu/
rider actions use their on-screen buttons. Rotation, folding and resizing cancel held gestures: lift and touch again.
The owner has playtested repeated portrait/landscape rotation on an iPhone Air in Safari. Broader physical-phone,
foldable and longer-session acceptance is still pending.

## Standard-mapped controller

Xbox-style names below refer to the browser's standard Gamepad API mapping; other layouts need their own verification.

| Input | Riding |
|---|---|
| RT / LT, or left stick vertical | Throttle / brake/reverse |
| Left stick horizontal | Steer |
| A | Hop |
| X | Charge / tuck |
| B | Get up |
| Y | Cycle camera |
| Right stick | Orbit |
| Start | Map |
| View / Back | Pause/menu |
| LB / RB | Browse riders |

In the rider picker, use left stick/D-pad to browse, right stick to scroll profile details, fresh A to confirm and B
to cancel. In the map, left stick moves the cursor, right stick pans, triggers zoom, A activates the checked action,
X centers on the rider, Y fits the city and D-pad navigates controls/results. Let the pad return to neutral after
connection, focus changes and dialog transitions.

## Skatepark riding

The parks combine street features with curved transition lines and open bypasses.

- **UN Skate Plaza:** an 18×104 m Jefferson-inspired plaza with 11 features, including banks, rollers, tabletop,
  manual pad, bench, rail and a 4×26 m opposing halfpipe (1.1 m high). A clear 4 m central strip links the lines.
- **Zion / Waller Street:** a 38×76 m Pier 62-inspired park on grass beside Waller, with 9 features including rollers,
  tabletop, pad/ledge/rail, an 8×32 m opposing halfpipe (1.5 m high) and a quarter/deck with sloping return.
  The 8 m central strip provides a bypass; adjoining roads and paths remain continuous.
- Find them in **Teleport** or search the map for **UN Plaza**, **United Nations**, **Zion** or **Waller**.
  Vector skateboard markers identify the parks. The pin and safe arrival are separate; an occupied or obstructed
  arrival can be refused.
- These are original gameplay adaptations using the NYC parks' feature designs, not surveyed replicas of the
  real SF facilities. Features retain physical sides and rails: allow a run-up, use charge/hop for raised ledges,
  and use the banked return from Zion's deck. `R` requests checked recovery after a fall.
- For back-and-forth halfpipe riding, enter at a moderate speed and ease off before the curved faces, especially
  Zion's taller pair. Holding full throttle can carry you over a lip onto its deck and outside return bank.

## Officer Dorkins (experimental)

Officer Dorkins may pursue you on a hover-wheel. Three admitted paddle knockdowns are warnings; a fourth leads to
booking at County Jail. Hop or swerve away, or break sight and gain distance to escape. During booking, use **Skip
booking** or, after the paperwork, **Back to riding**. On a standard controller, return the pad to neutral, use the
D-pad or left stick to select an action, then press A separately. The game checks several nearby release positions
and never forces an obstructed placement. If every exit remains blocked, try again or reload to resume the previous
committed riding checkpoint. The SF chase, site and release remain experimental. The owner reports a real playtest on
Ubuntu Chrome with an Xbox controller, Seal on a Wheel and blue-hour lighting; broader device coverage remains pending.

While he is pursuing, a red-and-blue marker shows Dorkins on the radar and, when in view, the full map. A distant
officer appears at the radar edge to show his direction. Maps show horizontal position only, so he may be on another
level. The marker disappears when the chase ends; it is not a waypoint or an arrival target.

## Map, recovery and settings

- At **Golden Gate Bridge**, the roadway and both lighter side paths are rideable. The paths curve around the tower legs
  and continue onto the land at each end; allow room to steer and expect steep local terrain near the approaches.
- Map pins identify places; they do not guarantee a safe standing position. An arrival must pass support, clearance,
  occupancy and ride-away checks. Refusal should leave your rider, camera, waypoint and saved checkpoint unchanged.
- Get Up uses checked EUC recovery. A lack of safe space can defer/refuse placement; it should not force you into a wall
  or onto a different stacked floor. Real hill elevations and tunnel/bridge layers matter.
- Rendering controls offer **100/75/50% 3D scale** and independent **Auto/120/60/30 FPS** targets. Lowering scale reduces
  3D bitmap cost while keeping DOM controls and the separately drawn map crisp. It does not alter routes or physics
  and does not promise a particular phone frame rate.
- **Graphics** remembers an independent choice: **High (green)** keeps the original SF effects;
  **Medium (yellow)** removes screen-space reflections and lowers sun-shadow resolution; **Low (red)** also removes
  bloom and cast sun shadows. SF fog, lighting, environment reflections, city detail, actors and riding stay intact.
  Switching reuses three effect pipelines and releases large inactive buffers; a tier change does not rebuild the city.
- Fresh phones start at **Medium graphics / 75% 3D**; desktop starts at **High / 100%**. Existing saved selections
  take precedence independently, and orientation changes do not reset them.
- The speedometer displays **mph and km/h together**. The green/yellow/red FPS number beside the frame-rate selector
  measures submitted frames; the selector sets a limit. Menus/maps can correctly lower that measured number while
  gameplay is paused. Warning colors, tilt-back and the get-up prompt reflect the native riding state.
- Only committed rider/checked location preferences are eligible for SF-specific local saves after Ride. A failed
  rider change should preserve the committed identity. Retry/Cancel handles recoverable preparation failures;
  **Reload SF** is the recovery path for a failed native appearance import.
- The title link or confirmed pause-menu return opens the **EUC Thrills main menu in the same tab**.

## Optional rendering diagnostics

Add `?perf=1` to the game URL (or `&perf=1` if it already has a query), then reload and activate **Ride**.
The read-only panel shows the actual backend, draw calls/triangles for the latest whole submitted frame,
and mean/p95 submitted-frame intervals plus intervals over 50 ms in the last five seconds (at most 600 intervals).
It refreshes at most twice a second, resets when riding is suspended, and hides if there is no clear space below
the toolbar. These are submission/RAF observations, not GPU execution or displayed-frame measurements.
Remove `perf=1` and reload to disable it; normal play creates no diagnostics panel or timing buffers.

## Help and feedback

**The Light world has a successful short iPhone Air Safari playtest:** approximately five minutes, no reboots,
and playable gameplay, stopped voluntarily while multitasking. The session included Cool Rider, Maribel and Red Rider,
repeated rotation, map teleports/Golden Gate riding checks, cop capture/release and UN skatepark. Ten-minute endurance,
other phones and the current Home Screen experience still need testing.

**Earlier builds:** the owner experienced map-open reloads in Safari and eventual failure after longer Home Screen
play, even at Medium/75 over plain HTTP LAN (WebGL2). These settings alone are not a guaranteed fix.
On live build `2026-11-10 0528Z`, the owner also observed repeated iPhone Air Home Screen reloads on WebGPU;
WebGL2 in a Safari tab lasted clearly longer, but was not reported stable. No matching November 9/10 JetsamEvent
was found, so a system memory kill is not confirmed.

| Device / URL | Renderer policy |
|---|---|
| Phone, no override | **WebGL2** (`phone default`), **Light world** |
| Desktop or tablet, no override | WebGPU preferred; WebGL2 fallback if needed; **region on**, unchanged |
| `?webgpu=0` | Force WebGL2 (`forced by URL`) |
| `?webgpu=1` | Explicitly request WebGPU, including on phones; fallback remains available |

Remove `webgpu` and `fallback` parameters to return to the device default. A covered WebGPU failure can reload once
into WebGL2 automatically (`automatic fallback`). A session already on WebGL2 does not repeat that reload.
Tablets, including iPads, retain their existing defaults. The short physical Safari result is not a universal stability guarantee.

**Earlier phone evidence:** the published interim default omitted the region, using the old `?region=0` behavior.
The owner reported a full Home Screen session on the iPhone Air using WebGL2, region off, Medium/75 on live build
`2026-11-10 0528Z`: rider changes, rotation, map/location changes and a Dorkins escape, with no reload. This is one
owner-observed session, not proof of stability on every phone. WebGPU with the region off eventually reloaded on rotation.

**Light world — the phone default:** core streets, hills, riders, traffic and pedestrians
remain. The surroundings use a terrain-only package with the original outer city heights and ground classes, a
simple distant horizon and near-rider ground detail. Regional buildings, trees and boats remain omitted. The outer
map area is muted and labeled scenery-only: checked arrivals refuse unsupported ground or find nearby supported
ground. At an unsupported world edge, a checked return takes you back to the last verified safe point and shows a
short notice. This first light version is deliberately bare; broader stability, visual polish and ride-feel review continue.

Use `?tier=full` for the complete world, or `?tier=light` to request the light world on a computer. Renderer choice
remains independent (`&webgpu=0` for WebGL2). Existing saved Graphics/3D-resolution choices remain independent too.
Without an explicit tier, `?region=1` still opts a phone into Full world. Explicit `tier` takes precedence over
`region`. `?tier=full&region=0` is the old scenery-off diagnostic mode, including its regional downloads. Remove
`tier` and `region` to restore device defaults. Tablets retain Full world; no automatic desktop-light policy is added.

The pause menu shows **Build [UTC timestamp] · [actual backend]**, distinguishing WebGL2's **phone default**,
**forced by URL**, and **automatic fallback** cases. A light session also says **Light world**.
After an update, reload and check this ID; an already-open tab/Home Screen session may still have older code.
The game does not install a service worker. A previous-attempt loading note includes the tier, renderer and last recorded
loading stage or session state: **title**, **riding**, **map open**, **booking**, or **paused**. State changes write
immediately, with a ten-second refresh. Seconds are since startup, including loading, not time spent riding.
This is not a confirmed crash cause. Report Safari-tab and Home Screen results separately, plus OS/browser versions and whether
the page or the whole device restarted.

The pause menu's **Player guide** and **Feedback / bugs** links open GitHub in a new tab, keeping SF paused.
Read the [public player guide](https://github.com/VibezZzCoder/euc-sanfrancisco/blob/main/PLAYER_GUIDE.md) or send
bug reports and ideas through [GitHub Issues](https://github.com/VibezZzCoder/euc-sanfrancisco/issues).
Include your location, rider, device/browser, graphics backend, Frame rate / 3D resolution / Graphics settings,
input device and steps to reproduce. These links target the first public repository release.

There are no playable walking, car, bicycle,
helicopter or robotaxi-passenger modes in this adaptation. This is a game, not real-world EUC riding instruction.
