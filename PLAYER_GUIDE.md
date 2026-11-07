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
Portrait, landscape and foldable layouts are targets; physical-phone/foldable acceptance is still pending.

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

## Map, recovery and settings

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
- The speedometer displays **mph and km/h together**. The green/yellow/red FPS number beside the frame-rate selector
  measures submitted frames; the selector sets a limit. Menus/maps can correctly lower that measured number while
  gameplay is paused. Warning colors, tilt-back and the get-up prompt reflect the native riding state.
- Only committed rider/checked location preferences are eligible for SF-specific local saves after Ride. A failed
  rider change should preserve the committed identity. Retry/Cancel handles recoverable preparation failures;
  **Reload SF** is the recovery path for a failed native appearance import.
- The title link or confirmed pause-menu return opens the **EUC Thrills main menu in the same tab**.

## Help and feedback

The pause menu's **Player guide** and **Feedback / bugs** links open GitHub in a new tab, keeping SF paused.
Read the [public player guide](https://github.com/VibezZzCoder/euc-sanfrancisco/blob/main/PLAYER_GUIDE.md) or send
bug reports and ideas through [GitHub Issues](https://github.com/VibezZzCoder/euc-sanfrancisco/issues).
Include your location, rider, device/browser, graphics backend, Frame rate / 3D resolution / Graphics settings,
input device and steps to reproduce. These links target the first public repository release.

Officer Dorkins/chase/booking is scheduled after the first release. There are no playable walking, car, bicycle,
helicopter or robotaxi-passenger modes in this adaptation. This is a game, not real-world EUC riding instruction.
