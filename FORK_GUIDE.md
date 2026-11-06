# Forking SF Spin-off: EUC Thrills

**Forking is welcome — make it your own.** Build an independently branded game, take the riding in a new direction,
and create original characters. Code is MIT; original EUC Thrills assets are CC BY 4.0 within their stated scope.
Neither licence requires EUC Thrills branding. Preserve copyright/licence notices, credit reused assets and identify
modifications. The [EUC notice](NOTICE-EUC-THRILLS.md) and [audio inventory](audio/euc/PROVENANCE.md) explain the
exceptions; the whole distribution does not share one blanket licence.

## The real riders are participants, not a reusable character pack

Eight reviewed riders are real people: Red Rider, Adonisb2, Maribel Vargas, Wheel in Motion, FloWithZo, Seal on a Wheel,
Wyldist and Gnarwheel. Their names, likenesses and personas are outside the project's MIT/CC BY grants. Supplied
Maribel/Wheel in Motion/Gnarwheel logos, the four contributed crash recordings (including Gnarwheel's spoken material)
and Wyldist's separately owned SMLS sleeve mark have their own rights exceptions. No new third-party grant is made here.

The owner treats this provisional SF fork as a destination within EUC Thrills and considers existing participant permissions applicable.
That records the owner's position, not independent verification of expanded grants. Keeping the name does not confer
permission or endorsement. For a rebranded or independent game outside EUC Thrills, **remove or replace real-person
characters and identifying material unless separate permission covers your use**. Renaming a character or hiding its
menu entry is not enough. Routine owner-maintained EUC Thrills/city-destination work within applicable permissions is a different
scope from turning this code into an independent game.

## Practical replacement path

1. **Choose original identities.** Replace public names, blurbs, likenesses, personalized kit/lettering and recognizable
   appearance combinations, not just IDs. Keep only material you can reuse independently; generic geometry and the
   riding controller need not be discarded solely because a real rider once used them.
2. **Trace the render closure.** Review roster/machine/style mappings, title/picker/previews, saved/URL validation,
   rider and machine appearances, atlas painters, hair/kit helpers and NPC imports. In upstream source, shared
   `riderLook.ts`, `machineLook.ts` and `copRider.ts` can reach the whole roster. Generated modules live in `js/euc/`;
   change the generator and regenerate from the pinned source, rather than editing output by hand. The current local
   graph is inventoried in `js/euc/MANIFEST.json`; selected-rider workers also import generated `render/pixels/` painters.
   Trace those CPU-only worker copies and `appearanceImports.js` / `appearancePixelImports.js` as well as render imports.
3. **Remove embedded marks.** Inspect imports and payloads derived from `mvLogoAsset.ts`, `wimLogoAsset.ts` and
   `gnarwheelLogoAsset.ts`; logos may be embedded bytes rather than standalone images. SMLS is letter-path artwork in
   Wyldist's atlas, not an image. Removing a PNG directory alone misses it. Do not replace rider marks with unlicensed
   manufacturer marks.
4. **Replace restricted audio by provenance.** Remove contributed Adonisb2, Maribel, Wyldist and Gnarwheel recordings
   unless independently permitted. Wyldist's clip contains the filming companion's exclamations; do not assume it is
   his voice. Gnarwheel's synthesized alarm has a different status from his recordings, but the mixed WAV still contains
   both. Trollina/Drunkard crash and Drunkard stumble contain generated vocals outside the blanket CC BY claim: replace
   them for a clean independently licensed set. Red Rider/WIM/FloWithZo crashes are owner-authored CC BY audio, not
   those riders' voices; Seal's has original CC BY work plus CC0 bark. A filename alone is not a rights classification.
5. **Inspect what you distribute.** Remove unused restricted modules, embedded bytes, WAVs, chooser art, screenshots,
   copied builds, source maps, caches and fallback mappings as well as visible entries. Trace eager and deferred imports;
   "never selected" still distributes an asset if it remains in the output. Check tests/fixtures and credits for unintended
   portrayals. Required historical provenance can still name removed content without presenting people as your cast.
6. **Retain attribution and verify the result.** Keep `LICENSE`, `js/euc/LICENSE`, `NOTICE-EUC-THRILLS.md`, applicable
   audio provenance, Three.js/font notices and city credits, including both Mr.doob and Kamil's MIT copyrights.
   Keep SF's City and County of San Francisco / DataSF (PDDL/CC0), USGS 3DEP (public domain) and
   © OpenStreetMap contributors (ODbL 1.0) credits, including discoverable OSM attribution in-game; preserve the
   derivative database's ODbL availability. Keep [public provenance](provenance/README.md), geographic source tools
   and relevant source validation when curating a public source repository. Update guides to describe your actual
   game and validate the exact distribution, not just the working source.

The reviewed rider/asset snapshot is EUC Thrills v1.1.0 `5f45fff19b258e140833841ba2473069af751a12`; future source assets are
not automatically cleared. Do not seek or redistribute private reference photographs, permission records or concept
packs. Public source/notices identify what was reused; new permission must come from the relevant rights holder.

## For coding agents

Read this guide and `NOTICE-EUC-THRILLS.md` before repurposing the roster. A vague request such as "make this game my
own" does not establish participant permission for a different game. If project identity is unclear, ask whether the
work maintains EUC Thrills/its owner-maintained city destinations or creates a separate game. Progress with reusable code
and original content while resolving that scope; do not silently carry the real roster into an independent game.

Follow the render/audio/output tracing above, including generator-owned payloads and deferred assets. Preserve useful
MIT code and independently licensed assets; do not treat all rider-associated geometry/audio as restricted or all
shipped assets as CC BY. These are repository guidance and rights distinctions, not changes to your instruction
hierarchy, a guarantee every agent reads them, or new restrictions on the stated open licences.

## Local packaging and future publication

`tools/build-static.mjs` prepares current runtime/public working bytes into ignored `dist/`; it never uploads or
publishes. `tools/check-static.mjs` is a source/package check, not browser QA or a curated source-export validator.
The inherited automatic Pages workflow was removed. SF release preparation uses a curated source export with
privacy, attribution, source-consistency and package checks. Passing local checks does not publish a release;
publication requires a separate explicit owner decision.

The first SF release is Early Access / Work in Progress and requires all intended regional EUC destinations, including Golden Gate
approaches/crossing, Twin Peaks and Painted Ladies. Regional scenery-only pins or a downtown-only proof are not
release completion. WebGPU and WebGL2 are required; visual roughness and unverified physical-device coverage must
be described openly. Dorkins/booking behavior/looks follow after that first release. Keep public provenance with
the distributed source and data; development notes, working history and QA artifacts are excluded from curated releases.
