# Bouquet 2.5D

A browser-ready, real-time render of a bouquet of flowers with a "2.5D" look: illustrated,
paper-diorama flowers in a shallow 3D space, revealed by camera parallax, depth of field,
gentle sway and film treatment. Static site, no backend, no external assets.

`docs/reference.png` is the current state of the render (seed 7, desktop). Compare against it
after every visual change.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ (http://localhost:4173)
npm run typecheck
```

URL params (keep them working, they are the testing interface):

| Param | Effect |
|---|---|
| `?seed=42` | another deterministic bouquet (same seed = same bouquet, always) |
| `?theme=automne` | colour theme: `classique` (default), `printemps`, `automne`, `mariage` |
| `?quality=low` / `high` | force a quality tier (default: auto from pointer/cores, then drops to low if frames stay slow) |
| `?debug` | lil-gui tuning panel (stats: draw calls; DOF, bloom, grain, vignette, petals, motion) |
| `?still` | freeze time, skip the bloom-in, hide the UI: for screenshots and visual diffs |
| `?solo=rose` | one large flower (`rose`, `tulip`, `daisy`, `bud`) |

Secret page: the lock button (right end of the bar) asks for a password (case and extra
spaces ignored; the password is deliberately not written anywhere in the repository). It
then shows the classic bouquet with an envelope at its foot; clicking it opens the letter.
The letter is AES-GCM encrypted with a PBKDF2 key derived from the password
(`scripts/encrypt-letter.mjs` asks for it, then writes `src/secret/letter.enc.json`), so
the built site never contains the letter in clear and a wrong password simply fails to
decrypt. The plain text (`A_Letter_to_Bibi.txt`, first line = title, blank lines between
stanzas) is git-ignored. Unlocking lasts for the page session only (nothing stored). 3D
rendering pauses while the letter is open.

The UI (bottom control bar, French labels) writes the view back into the URL: new bouquet
replaces `?seed`, the flower buttons push `?solo` (browser back returns to the bouquet), the
theme button cycles `?theme`. Clicking/tapping the canvas or pressing `n` also regenerates.

## Art direction

- **Mood**: a florist's bouquet lit like a still life. Rich, saturated petals against a
  charcoal/slate backdrop. Calm, slow, never busy.
- **2.5D, not full 3D**: the camera never orbits. Depth is read through parallax (max ~0.5
  units of travel), DOF (bouquet front sharp, background and foreground motes soft) and
  layering. Narrow FOV (30) flattens perspective on purpose.
- **Illustrative shading**: petals use a custom shader (gradient base to tip, throat shadow,
  veins, wrap light, rim, darker back face). Do not switch petals to PBR materials.
- **Default look** (owner's choice): deep red roses (`crimson`, `wine`), pink and lilac tulips,
  white daisies, butter buds, ivory ribbon. Other looks are themes (`THEMES` in config.ts).
- **Palette**: backdrop stays charcoal (`#141416` to `#4a4a4d`). Keep it near-neutral grey:
  Neutral tone mapping's toe crushes dark channels unevenly, so a faint blue tint (the old
  `#3a4352`) renders as navy. Flower palettes live in `config.ts` (`PALETTES`); keep base
  colours dark and saturated, tips light. Ivory roses became `cream` (peach base) so they
  separate from the white daisies.
- **Wrap**: kraft paper cone (two overlapping sheets) with blush tissue rising behind the
  heads, and a satin ribbon bow at the tie. Shape lives in `BOUQUET.wrap`.
- **Motion**: sway amplitude stays under ~0.05 rad; idle camera drift is slow Lissajous.
  `prefers-reduced-motion` scales all motion by `MOTION.reducedFactor`.

## Stack

- Vite 6 + TypeScript (strict) + Three.js r170, ES modules, no UI framework.
- Post-processing: `three/addons` EffectComposer (RenderPass, BokehPass, UnrealBloomPass,
  OutputPass, custom grain/vignette ShaderPass).
- `lil-gui` is a dev-only dynamic import behind `?debug`.

Do not add React/R3F, a physics engine or a model loader unless a roadmap item genuinely needs
it. Ask before adding any runtime dependency.

## Architecture

```
src/
  main.ts              bootstrap: URL params, quality tier, WebGL check
  app.ts               views (bouquet / solo) + URL sync, transitions, hover picking, click to
                       regenerate, focus follow, falling petals, loop, pause when hidden,
                       adaptive quality
  config.ts            ALL tunable values: palettes, themes, recipe, fillers, interaction,
                       perf, camera, FX, motion
  debug.ts             ?debug panel (lil-gui)
  ui/controls.ts       control bar (new, bouquet, rose/tulip/daisy/bud, theme, secret) + hint
  secret/
    crypto.ts          decrypts the letter with the typed password (WebCrypto)
    letter.enc.json    the encrypted letter (generated, commit it)
    letter-ui.ts       password dialog + envelope-opening letter overlay (lazy-loaded)
    envelope.ts        the 3D envelope at the foot of the bouquet
  scene/
    stage.ts           renderer, scene, camera, lights, resize + portrait framing
    atmosphere.ts      backdrop (with drifting light pool), dust, key-light sweep
    background.ts      canvas-drawn window light, foliage silhouettes, bouquet shadow
  flowers/
    petal.ts           procedural petal/leaf surface (cup, curl, ruffle, notch), cached
    materials.ts       petal ShaderMaterial (cached per palette) + matte material, aTint
                       helpers, shared light / back light / contact-shading uniforms
    assembler.ts       merges a head's petals into one mesh per material
    kinds.ts           flower head builders: rose, tulip, daisy, bud, plus leaves
    fillers.ts         eucalyptus sprigs, baby's breath (InstancedMesh), gap finder
    layout.ts          golden-angle head placement + relaxation so heads don't interpenetrate
    sway.ts            sway, bloom-in growth, hover lean, stems that follow
    wrap.ts            paper cone sheets and ribbon bow
    bouquet.ts         composition (dome, stems, leaves, fillers, wrap) + solo view
  effects/
    postfx.ts          composer chain, MSAA HalfFloat target, focus control
    parallax.ts        pointer / device-tilt / idle camera parallax
    falling.ts         occasional falling petal (pool of 3)
  utils/random.ts      seeded PRNG (mulberry32) and math helpers
```

Render pipeline: `RenderPass` into a 4x MSAA HalfFloat target, then `BokehPass` (focus follows
camera distance + `FX.bokeh.focusOffset`), `UnrealBloomPass`, `OutputPass` (Neutral tone
mapping + sRGB), then grain/vignette in display space.

## Conventions

- **Geometry convention** (used by every builder, do not break it):
  - a petal grows along +Y from its attachment point; a flat petal faces +Z
  - a flower head's axis is +Z; `addPetal(spin, closure)` spins around Z then tilts the
    petal toward the axis by `closure` radians (0 = flat open, ~1.4 = closed cup)
  - `cup` lifts the margins toward +Z, `curl` rolls the tip toward -Z
  - petal `uv.x` runs across (0..1), `uv.y` runs base to tip (0..1)
- **Determinism**: all randomness goes through the seeded `Rng` passed down from
  `buildBouquet(seed)`. Never call `Math.random()` in scene code.
- **Config first**: new tunables go in `config.ts`, and into `debug.ts` if they are visual.
- **Shaders** work in linear space. Do not add `colorspace_fragment` to petal shaders;
  OutputPass handles conversion.
- **Caching**: petal geometries and materials are cached and shared. Never mutate a cached
  material's uniforms per flower; create a new palette entry instead. Materials are keyed
  by palette + shading options only; per-petal colour and shade live in the `aTint` vertex
  attribute (rgb multiplier, a = shade). Geometry built per bouquet (merged heads, stems,
  paper, ribbon, florets) is flagged `userData.owned` and is the only thing `dispose()` frees.
- **Merging**: build heads, sprigs and leaves through `HeadAssembler` (one mesh per material).
  **Every geometry drawn with `petalMaterial` must carry `aTint`** (the assembler and
  `setTint` add it); a missing attribute renders black.
- **Two rngs per bouquet**: composition uses `createRng(seed)`; animation timing uses a
  separate stream, so tweaking the bloom never changes what a seed looks like.
- **Petal shader extras**:
  `uContact` + `uDomeMatrix` (petals deep inside the bouquet dome are darkened; the bouquet
  updates the matrix every frame), `uSss` + `uBackLightDir` (warm glow through thin tips).
- **Head orientation**: heads face the dome normal; `UPRIGHT` leans tulips and buds toward
  world up (in the upper half of the dome only) so they read from the side.
- Keep modules under ~300 lines; split by responsibility when they grow.
- Code, comments and commit messages in English. User-facing page text in French.

## Performance budget

- 60 fps on a mid-range laptop at `quality=high`; 30+ fps on a recent phone at `low`.
- Main JS bundle under 160 kB gzip (currently ~147 kB, mostly three).
- Draw calls: ~120 per frame including post passes (`?debug` > Stats). Heads are merged;
  keep new elements merged or instanced.
- Rendering stops while the tab is hidden. At auto quality, frames averaging over 22 ms for
  3 s switch off Bokeh and cap the pixel ratio at 1.5 (logged to the console).
- Cap pixel ratio (2 high / 1.5 low). `low` disables Bokeh and uses 2x MSAA.

## Verifying visual changes

1. `npm run build` must pass (strict TS, no unused locals).
2. Check `?seed=7`, `?seed=42`, `?seed=1234` at desktop (1400x900) and portrait (420x860).
3. Check `?quality=low` and `prefers-reduced-motion` (DevTools > Rendering).
4. Interaction (hover, buttons, transitions) needs real time: drive Chrome with Playwright
   and `waitForTimeout`; `--virtual-time-budget` screenshots are unreliable past a few
   seconds of animation.
5. Headless screenshots work with Playwright + Chrome using SwiftShader:
   launch args `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`,
   navigate with `wait_until='commit'`, wait ~8 s, use `?still`. SwiftShader is slow,
   allow 60 s+ timeouts. Update `docs/reference.png` when a change is intended.

## Known issues (start here)

- Outer rose petals still show a faceted outline at close range (8 segments across).
- Occasional thin slivers where two heads' rims touch on some seeds; tune
  `BOUQUET.headOverlap` or `DEPTH_OFFSET` in `bouquet.ts` rather than shrinking heads.
- BokehPass bleeds a soft light fringe around leaves onto the far background.
- Back paper sheets are seen from the inside; their look depends on `backTint` in `wrap.ts`.
- During the bloom-in the empty paper cone is visible for a moment (by design: flowers rise
  out of it), so keep the inside of the wrap clean.
- Stems are CPU-deformed every frame (~5k vertices); fine, but move to a vertex shader if
  the recipe grows a lot.
- `app.ts` is close to the ~300-line limit; move the secret-page wiring into
  `secret/` if it grows.

## Roadmap

### Phase 1: polish the bouquet
- [x] Rose: spiral petal placement (phyllotaxis) instead of rings, more petals, tighter bud
- [x] Petal edge variation: subtle ruffle/notch noise on the outline, per-petal colour jitter
- [x] Fake subsurface: back-lit petals glow warmer where they face away from the light
- [x] Contact shading: darken petals near the head centre and where heads overlap
- [x] Stems follow sway (bend the top segment with the pivot, or sway in a vertex shader)
- [x] Kraft or tissue paper wrap (cone of 2-3 folded sheets) and ribbon tails
- [x] Layout relaxation so heads no longer interpenetrate; tulip reshape (side-on egg cup)
- [x] Add 1-2 filler kinds (eucalyptus sprigs, baby's breath clusters)
- [x] Colour themes (`?theme=`), deep red roses / pink tulips by default

### Phase 2: depth and light
- [x] Layered background: 2-3 out-of-focus planes (window light, foliage silhouettes)
- [x] Soft shadow catcher behind the bouquet (blurred shadow on the backdrop)
- [x] Light shafts or a soft key-light gradient sweeping slowly
- [x] Better DOF focus: autofocus on the nearest head under the pointer

### Phase 3: interaction
- [x] Click/tap to regenerate with a new seed (with a gentle bloom-in animation)
- [x] Hover: the head under the pointer leans toward the viewer
- [x] Occasional falling petal with simple drift physics
- [x] Control bar: new bouquet, single-flower views, theme
- [ ] Optional: limited drag to turn the bouquet (+-15 degrees, springs back)

### Phase 4: ship
- [x] Merge petals per flower (BufferGeometryUtils.mergeGeometries) or InstancedMesh per kind
- [x] Adaptive quality: drop to `low` if frame time stays above 22 ms
- [x] Pause rendering when the tab is hidden or the canvas is off-screen
- [x] "Share this bouquet" button (native share on phones, else copies seed/theme/solo link)
- [x] Favicon (`public/favicon.svg`)
- [x] Open Graph image (`public/og.jpg`, render of seed 7 at 1200x630), meta description (French)
- [x] Deploy on GitHub Pages (`.github/workflows/deploy.yml`, every push to main)
