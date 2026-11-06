# audio/euc — provenance

Reviewed sound inventory for the player's electric unicycle (`js/euc-audio.js`) in the initial San Francisco release.
All **15 installed WAVs** are unchanged public-source copies: eleven crashes, one Drunkard stumble and three shared
sounds. Sirens are reserved for post-release Dorkins and are **not shipped**, as is the offroad tyre loop.
The generator verifies exact installed filenames and source hashes, including missing/extra/unshipped WAV rejection.
NYC's earlier all-eleven backend/audio evidence belongs to the donor; it is not SF listening or runtime acceptance.

Attribution for original licensed contributions (not a blanket licence for this folder):

Assets from EUC Thrills by VibezZzCoder — CC BY 4.0 — https://github.com/VibezZzCoder/EUC-thrills

- Upstream: `VibezZzCoder/EUC-thrills` @ `5f45fff19b258e140833841ba2473069af751a12` (v1.1.0).
- Source folder: `assets/live/audio/`.
- Donor import history: 2026-10-23 (sirens 2026-10-24); ten full-roster additions installed 2026-10-31.
  SF seed copied from NYC; initial-release pruning on 2026-11-01 removed both siren WAVs without changing retained audio.
- Origin and copyright notice: `NOTICE-EUC-THRILLS.md` in this repository, from upstream `NOTICE.md`.

## Installed original/shared inventory

| File | Upstream path | sha256 | Author / origin | Licence |
|---|---|---|---|---|
| `crash_wipeout.wav` | `assets/live/audio/crash_wipeout.wav` | `44bec4433734386116c51190c54ee072569151fba2717058439f3259030dc4b0` | VibezZzCoder's own recording, including his own voice, used with his approval | CC BY 4.0 |
| `crash_trollina.wav` | `assets/live/audio/crash_trollina.wav` | `c88274f3ea5230cbbb7e19b726e45924f491c2fd10b74cc29401a7a10b51d662` | Composed by the EUC Thrills project. The slapstick layers (impact, spring, tumble clatter, slide, wheel settling) are synthesized from first principles. **The vocal beats are machine-generated** with a text-to-speech model (OpenAI `gpt-audio`), then cut, re-timed, pitch-shifted and mixed. | Synthesized layers: CC BY 4.0. **The machine-generated vocal layer is NOT covered by CC BY 4.0.** No copyright is claimed over it. Source describes redistribution with the build; this is not a separate broad licence or a claim that the entire WAV is CC BY. If you need a clean rights position, replace this file. |
| `overspeed_beep.wav` | `assets/live/audio/overspeed_beep.wav` | `363851aa808ed5a7c66a548bbbdd113ffdbe45fa4b8f9a310ed7085f925a87b6` | Synthesized by the EUC Thrills project: a 2565 Hz tone plus its second harmonic, rebuilt from measurements. It contains no recorded audio. | CC BY 4.0 |
| `wind_howl_loop.wav` | `assets/live/audio/wind_howl_loop.wav` | `042440716b1331ead0247d39bdd2e522318e226be049637305ed14d19675c3ba` | Derived from ["wind_howl2_stereo" by swiftoid](https://freesound.org/people/swiftoid/sounds/117611/) (Freesound #117611). The EUC Thrills project trimmed, filtered and loop-processed it. | CC0 / public domain. No attribution is needed; this entry is kept as provenance. |
| `tyre_solid_loop.wav` | `assets/live/audio/tyre_solid_loop.wav` | `5ca9cff89e24dbffc1ad0752d829de3a997420e14cd2756b4abf941b70ba45a9` | Synthesized from scratch by the EUC Thrills project: the "toko" tick, one per wheel revolution at 9 m/s | CC BY 4.0 |

## Installed full-roster additions — unchanged source bytes

Paths are relative to upstream `assets/live/audio/`, at the same exact commit above. Hashes identify the installed
source bytes. There are eleven crash files total plus one Drunkard stumble and three shared files: **15 installed
WAVs**. The generated manifest still reviews **18** source entries, explicitly marking both sirens and the CC0
`tyre_offroad_loop.wav` as not shipped. Source/output hashes and exact inventory checks remain required.

| File / upstream basename | SHA-256 | Rider / provenance | Licence or exception |
|---|---|---|---|
| `crash_red_rider.wav` | `05acf9bd3e21b3df341946be48df2d98f0f92b649c79d6883e47f36530a5a99e` | Red Rider: owner's 3.4 s wipeout, voice band replaced with voice-free texture for 0.8 s. No Red Rider voice. | Original owner recording/render, CC BY 4.0. |
| `crash_adonisb2.wav` | `187cee08cbafc33901c919959fc5a248e7d0107948ab83e1f34e77bec8759f6d` | Adonisb2's contributed fall recording, 3.4 s, summed mono, level-matched; no substitution or generation. | Not CC BY 4.0; permission for redistribution with the game, no broader reuse/resale/sublicensing grant. |
| `crash_maribel.wav` | `7c1e549d13853ba49b5b8837433d5aba143497faa65ddc8c61fe046f2ee139b9` | Maribel Vargas's staged power-off/drop/yell in a lift, not an actual crash; 3.4 s right channel, her beep copied to tail, yell −5 dB, level-matched, no external sound. | Contributed recording, not CC BY 4.0; narrow game redistribution only. |
| `crash_wheel_in_motion.wav` | `fafd15e0fb6bc19ff9ec5611f216fc91976e8333e7a4f4cfea07e399d35430d4` | Wheel in Motion: second distinct voice-removed render of the owner's wipeout, different donor texture in the same 0.8 s window. No WIM voice. | CC BY 4.0. |
| `crash_drunkard.wav` | `56e1e118a1dd2cd882e6c78587ffb69f10dc0737b33b2e84b4a162985049cc75` | The Drunkard: synthesized impact/cans/fizz/tumble/slide/wheel/slurp with OpenAI `gpt-audio` generated vocals, cut/retimed/pitch-shifted/mixed; no real person's voice. | Authored synthesized layers CC BY 4.0; generated vocal layer has no claimed copyright; mixed file excluded from blanket CC BY claim. Source describes build redistribution, not a standalone broad grant. Replace for a clean rights position. |
| `stumble_drunkard.wav` | `e9403a65bddba102f29add453ae7ea47165ef35c15629e88658c6d2e8cda2004` | The Drunkard: 0.4 s synthesized can clanks plus generated hic from the same take, pitch-shifted. | Same generated-vocal exception as his crash; not wholly CC BY 4.0. |
| `crash_flo_with_zo.wav` | `7cfec9e5e0c05ba3441a56a1d4a838f874dc88c1117f0687dee04ac387ded016` | FloWithZo: third distinct voice-removed owner render, donor overlaps earlier donors but samples differ within the replaced window. No FloWithZo voice. | CC BY 4.0. |
| `crash_seal_on_a_wheel.wav` | `1462d5753b58c22dab8dd3a7cdea5216f05aed4e0442bef64b5e0bb7ef76d9af` | Seal on a Wheel: fourth distinct voice-removed owner render plus 270 ms bark from [florianreichelt, Freesound #450751](https://freesound.org/people/florianreichelt/sounds/450751/), channel-selected/resampled/high-passed/faded/level-set/mixed. No rider voice. | Original render CC BY 4.0; seal-bark layer CC0/public domain, not relicensed by the project. |
| `crash_wyldist.wav` | `1a17e0c6ab6e671a67cdd6bd4aefb60abaa56c9a507d18251d6b22b9b36f03bd` | Wyldist's supplied riding clip, filmed by a companion; **companion's exclamations, not Wyldist's voice**. Continuous 3.4 s one-channel cut, high-pass 80 Hz, matched/faded/soft-limited; exclamations −5 dB, unidentified airborne bursts −12 dB. No substituted/generated sound. | Contributed recording, not CC BY 4.0; narrow game redistribution only. No additional filmmaker/voice rights inferred. |
| `crash_gnarwheel.wav` | `dda0cf3b706bd4fbb0dca2ed837a4bb52cafd10b06e77f20f077b03b283d4392` | Gnarwheel's contributed crash/spoken recordings plus separately synthesized 2845 Hz alarm measured without copying recorded voice/background; approved 3.4 s stereo timing/pitch-preserved speech/beep. | Recordings outside CC BY 4.0, no broader reuse/sublicensing grant; original synthesized alarm CC BY 4.0. Mixed file is not wholly CC BY. |

## Reviewed, unshipped source inventory

These rows preserve provenance only; no WAV with these filenames belongs in `audio/euc/` for the initial release.
Source paths are relative to the same pinned upstream root. Reintroducing sirens belongs to the post-release NPC work.

| File | Upstream path | SHA-256 | Origin / licence | Initial SF status |
|---|---|---|---|---|
| `siren_far_loop.wav` | `assets/live/audio/siren_far_loop.wav` | `09d77eacb93910f55565119a35b96b338c642f9862ba2723e2e077ac5e3100e7` | [TitanKaempfer, Freesound #746302](https://freesound.org/people/TitanKaempfer/sounds/746302/), loop-processed by EUC Thrills; CC0 / public domain. | Unshipped; post-release Dorkins. |
| `siren_close_loop.wav` | `assets/live/audio/siren_close_loop.wav` | `0f34dc0bf177406aaaaded4fb1ac7e980bf497dd4a29423218458606fd7feed6` | [vlammenos, Freesound #52906](https://freesound.org/people/vlammenos/sounds/52906/), loop-processed by EUC Thrills; CC0 / public domain. | Unshipped; post-release Dorkins. |
| `tyre_offroad_loop.wav` | `assets/live/audio/tyre_offroad_loop.wav` | `0ded352777f872ec6df9566fe6f203ca5c3b13fd31031eb043592b487fc791fc` | [gadesound, Freesound #697049](https://freesound.org/people/gadesound/sounds/697049/), source offroad tyre loop; CC0 / public domain. | Unshipped; no active sample consumer. |

## Rights and implementation rules

- Copy **only** this explicit reviewed inventory; future source files are not auto-approved. Retain unchanged bytes
  and source treatment. `tools/vendor-euc.mjs --check` and `js/euc/MANIFEST.json` pin and audit this inventory/hashes;
  retain these checks when changing source or installed files. Validation rejects missing, extra or altered WAVs
  and verifies that the three reviewed unshipped samples remain absent.
- If a file is replaced, update its row (sha256, origin and licence) and the test together.
- Prepare the selected rider's crash, plus stumble only for `drunkard`, before committing the selection. No hover
  playback, eager eleven-bank fetch/decode or silent substitution of another rider's recording. Keep bounded lifecycle
  cleanup, mute/unlock/visibility rules and existing shared mix. Crashes/stumble play at rate 1, preserving spoken
  pitch and stereo energy. Audio/worker failure offers Retry/Cancel; module download failure requires a page reload.
- Pause gates playback, retires one-shots and sets master gain exactly zero; a running paused AudioContext is valid
  and avoids competing unlock/suspend races. Mute/hidden/page lifecycle suspension remains separate. NYC donor decoded
  selected PCM observations: 652,800 bytes normally, 729,600 Drunkard, 1,305,600 Gnarwheel; not an SF measurement.
- The offline report preserves differences from older city/cop mixes rather than claiming all voices identical.
  Approximate K-weighted bus measurements are comparative evidence, not programme loudness/true-peak or listening signoff.
- The owner requested the same reviewed roster/audio for SF within EUC Thrills; this records that position, not
  independently verified expanded permission. Contributed recordings do not become CC BY through copying or branding.
  Generated vocals in Trollina's crash and Drunkard's crash/stumble remain outside the blanket CC BY claim.
- See [the notice](../../NOTICE-EUC-THRILLS.md) and [downstream guide](../../FORK_GUIDE.md) before reuse. Independent
  forks should replace permission-limited recordings unless separately permitted, without misclassifying the owner's
  independently licensed Red/WIM/FloWithZo renders or CC0 layers as contributed rider voices.
- Everything else the rider hears (motor, hop, landing, kerb impact, recovery chirp and rolling tyre noise) is
  synthesized at runtime by `js/euc-audio.js`. That code was written for this fork; no upstream audio code was copied.
- `wind_howl_loop.wav` is the game's only wind: the rider's speed wind (`js/euc-audio.js`) and, once it is decoded,
  the city's ambient wind (`js/audio-events.js` `createWindVoice().useHowl`).
