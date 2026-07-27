# Fling Fiasco — Technical Design

## Stack

- TypeScript 6 + Vite 8
- Three.js r185 WebGL renderer
- Rapier 3D 0.19 physics
- DOM/CSS UI and accessibility
- Vitest unit/integration checks
- Playwright production-build browser tests

## Module boundaries

- `game/content`: immutable authored level data and stable mechanism keys.
- `game/simulation`: run state, scoring, fixed-step policy, win/fail rules.
- `game/input`: physical pointer/keyboard events mapped into aim, fling, pause, retry, and menu actions.
- `game/save`: versioned serializable progress and settings with storage-failure fallback.
- `physics`: Rapier world, ragdoll, collision proxies, mechanisms, and render bridge handles.
- `render`: scene, camera, lighting, materials, effects, GLB loading, context lifecycle.
- `ui`: DOM HUD, onboarding, pause/settings, results, level shelf, and live-region announcements.
- `platform`: environment detection plus CrazyGames v3, Poki v2, mock, and disabled adapters.
- `audio`: original Web Audio music and effects with platform/pause overrides.
- `diagnostics`: production-safe rolling performance samples exposed only to automated QA.

Rules never use Three.js objects as authoritative state. Saves contain plain JSON only. Platform differences never enter level or scoring code.

## Physics

- Simulation advances at a fixed 1/60 second step with an accumulator and a maximum of five catch-up steps.
- Frame gaps are clamped to 100 ms; focus loss pauses before another step.
- The performer is a seven-body ragdoll connected by spherical impulse joints.
- Collision proxies are balls and cuboids aligned to visible geometry.
- CCD is enabled for performer bodies and fast moving hazards.
- Linear/angular damping, joint limits through shallow stage depth, and bounded impulses prevent explosive motion.
- Settled-body detection, a 60-second round clock, crusher contact, and `y < -5` provide reliable termination.
- Sleeping is enabled; pooled particle meshes and shared geometries/materials limit churn.

## Input and responsive behavior

The playfield accepts one pointer gesture anywhere not occupied by UI. A 32 CSS-pixel minimum swipe maps into a capped world impulse. Pointer capture and cancel handling clear held state. Keyboard aiming is a stateful vector with Space/Enter release. Parent scrolling is prevented only while interacting with the game.

The stage uses `100dvh`, safe-area padding, and a 9:16 max-width portrait container. Desktop retains this container and fills side space with a themed CSS backdrop. Landscape phones show a non-blocking rotate hint while retaining all controls.

## Assets and budgets

- Stable asset manifest key: `decor.stage-mark` → `assets/stage-mark.glb`.
- Runtime-authored gameplay pieces use shared engine-native primitive geometry, the optimized equivalent for tiny parametric toys.
- The GLB stage mark is generated deterministically, validated on load, and uses no texture.
- No external gameplay assets, fonts, analytics, or CDN dependencies are shipped.
- Target initial and total package: under 8 MB, under 100 files.
- Constrained mobile/≤4 GB devices use DPR 1, no antialiasing, and no dynamic shadows; capable devices cap DPR at 1.75.
- One shadow-casting key light, ≤ 25 visible dynamic bodies, ≤ 140 draw calls, ≤ 80 pooled particles.

## Save and platform behavior

Save schema version 1 stores unlocked level, per-level stars/time/flings, and audio/language settings. Parsing, migration, read, and write are guarded. Memory-only play remains available when storage fails.

The adapter mode is chosen from `?platform=crazy|poki|mock|disabled`, recognized platform hosts/referrers, or defaults to disabled. Official SDK scripts load only for their matching platform. SDK failure is non-fatal. Gameplay events are state-deduplicated. Ads are requested only from result-driven retry/next/select transitions and always use pause/mute/resume hooks. Manual pause/resume never inserts an ad.

## Current official platform check

Verified 2026-07-27 against:

- https://docs.crazygames.com/requirements/technical/
- https://docs.crazygames.com/requirements/gameplay/
- https://docs.crazygames.com/sdk/intro/
- https://docs.crazygames.com/sdk/game/
- https://docs.crazygames.com/sdk/video-ads/
- https://sdk.poki.com/new-requirements
- https://sdk.poki.com/sdk-documentation
- https://sdk.poki.com/html5

CrazyGames currently documents HTML5 SDK v3, asynchronous initialization, gameplay start/stop, and `midgame`/`rewarded` ad callbacks. Poki currently documents its v2 loader, first-input gameplay start, non-duplicated events, under-8-MB initial target, and platform-only external request policy.
