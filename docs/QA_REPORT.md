# Fling Fiasco 1.0.0-rc.1 — Local QA Report

## Release status

**Platform-Ready Release Candidate.** All local `[REQUIRED]` checks pass. No
CrazyGames Preview or Poki Inspector `[OWNER]` check was executed or marked
complete.

Build under test:

- Upload ZIP: `release/fling-fiasco-rc.zip`
- Expanded package: `release/fling-fiasco-rc/`
- Package manifest: `release/release-manifest.json`
- Entry point: archive-root `index.html`
- ZIP SHA-256:
  `650D5C3CD3ED5B768E2222E80176BFAA2BD6A12C396419FEA1BD5C231F24EB14`
- Expanded package: 7 files, 2,947,498 bytes (2.81 MiB)
- ZIP: 1,076,642 bytes (1.03 MiB)
- Initial playable download: 2,947,498 bytes; there is no deferred gameplay
  payload or external asset request in disabled/local mode.

## Final build and test commands

| Command                                                             | Result                                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run release`                                                   | Pass; assets regenerated, gates passed, production build created, RC directory and ZIP packaged |
| `npm run test:all`                                                  | Pass; TypeScript, ESLint, Prettier, 5 Vitest files / 23 tests                                   |
| `npm run test:e2e`                                                  | Pass; 23/23 production-browser tests                                                            |
| `npx playwright test tests/e2e/game.spec.ts tests/e2e/edge.spec.ts` | Pass after final pointer-capture fix; 17/17 affected tests                                      |
| `npm run test:soak`                                                 | Pass after fix; 10.1-minute production-browser run                                              |
| `npm run build`                                                     | Pass; Vite production bundle                                                                    |

Production output:

- `index.html`: 658 bytes
- CSS: 14,308 bytes, 4.22 kB gzip
- JavaScript: 2,908,711 bytes, 1,017.18 kB gzip
- GLB: 11,740 bytes
- Third-party notices and full Three.js/Rapier licenses ship in the package.

## Test environment

- OS: Windows 11 Home 10.0.26200, build 26200
- Node.js 24.14.1; npm 11.11.0
- Playwright 1.62.0
- Bundled Chromium user agent: HeadlessChrome 151.0.7922.34
- System Microsoft Edge 150.0.4078.99: core mouse flow run through the installed
  Edge channel
- Primary mobile profile: 390×844 CSS px, touch, Android-class 4 GB profile
- Performance stress: device DPR 2, forced low-tier renderer, 4× CPU throttle

Safari/iOS and physical Chromebook coverage are not available in this Windows
environment. The Chromebook gap is covered locally with the documented 4 GB,
mobile user agent, low-tier renderer, DPR and CPU-throttle simulation.

## Functional and input coverage

- Twelve authored levels validate from a clean save; all twelve automated routes
  reach their goals and exercise required mechanism gates.
- The first three levels pass consecutively with real browser pointer gestures:
  direct fling, banked bumper, then two-bumper combination.
- Victory, failure, score/stars, unlock, retry, next level, shelf, settings,
  persistence, corrupted-save recovery and storage-disabled fallback pass.
- Touch, mouse and keyboard pass; focus trap, Escape/P pause, R retry, blur pause,
  pointer cancellation and parent-page scroll prevention are covered.
- A 602.864-second soak completed 209 result cycles, 18 victories, 191 expected
  failures, 17 full reloads and 29 pause/resume cycles with `problems: []`.
- The first soak exposed repeated rejected pointer-capture calls. Capture/release
  are now best effort; a 30-second reproduction, the full 10-minute rerun and all
  17 affected browser tests passed after the fix.

Soak artifact: `artifacts/performance/ten-minute-soak.json`.

## Viewport and visual coverage

The following production screenshots were generated and visually inspected:

- Phones: 360×640, 375×667, 390×844, 412×915, 430×932
- Tablets: 768×1024, 820×1180
- Embedded/desktop: 907×510, 1366×768, 1920×1080
- Landscape touch fallback: 844×390
- States at each main viewport: gameplay, pause/settings, shelf, victory, failure

Evidence:

- `artifacts/screenshots/`
- `artifacts/qa/portrait-state-contact.png`
- `artifacts/qa/short-landscape-state-contact.png`
- Static store candidate:
  `docs/store-assets/fling-fiasco-cover-16x9.webp` (1280×720)

The 390×844 mobile flow, short desktop embed and landscape rotate fallback have
no clipped primary action, stretched canvas, blocked playfield or unsafe-area
collision. Modals scroll when their content is taller than a short embed.

## Performance and resource stability

Measured in the real production browser on the most active level:

| Metric     | Initial | After 12 level rebuilds | Active, 4× CPU |
| ---------- | ------: | ----------------------: | -------------: |
| FPS        |      58 |                      60 |             54 |
| Draw calls |      50 |                      50 |             45 |
| Triangles  |   2,118 |                   2,118 |          2,468 |
| DPR        |       1 |                       1 |              1 |
| Geometries |      35 |                      35 |             50 |
| Textures   |       1 |                       1 |              2 |

Acceptance: at least 30 FPS, at most 80 draw calls, at most 8,000 triangles and
DPR 1 for the low-tier profile. All pass. Rebuild geometry and texture counts
plateau exactly. The long soak's lowest one-second rolling sample was 29 FPS
during its reload/result-heavy loop; the controlled active-gameplay benchmark
remained 54 FPS under 4× CPU throttle.

Performance artifact:
`artifacts/performance/low-tier-grand-fiasco.json`.

## Platform adapter local coverage

The CrazyGames v3 and Poki v2 adapters were checked against current official
public integration documentation on 2026-07-27. Automated localhost tests pass
for:

- CrazyGames loading and deduplicated gameplay start/stop lifecycle
- Poki loading-finished, gameplay lifecycle and commercial break
- `local`, platform-selected, `disabled` and SDK-disabled fallback modes
- missing SDK, rejected ad, ad with no callbacks and hanging initialization
- bounded initialization/ad waits with no soft-lock
- no ad request merely for resuming a paused round

All real backend, real ad, platform storage, embedding, orientation and portal
report checks remain owner-only. See `docs/PLATFORM_TEST_GUIDE.md`.

## Independent review

Three independent review passes were completed:

- Gameplay review: input-timing drift, mechanism bypass and framing issues were
  found, fixed and retested.
- UI/visual review: keyboard/modal isolation, power meter sizing, 907×510
  responsive behavior, focus semantics, loading-state screenshots and partial
  localization were found, fixed and retested.
- Performance/release review: SDK/ad timeouts, corrupt-save sanitation, resource
  disposal, license packaging and low-tier measurement gaps were found, fixed
  and retested.

There are no open P0 or P1 issues.

## Known limitations and recommended gaps

| ID   | Severity        | Impact / reproduction                                                                                                                                                               | Recommendation                                                                                     |
| ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| R-01 | P3 risk         | The 10-minute reload/result-heavy soak recorded one rolling minimum of 29 FPS; controlled active gameplay was 54 FPS at 4× CPU throttle. No hitch, crash or soft-lock was observed. | Confirm on the owner's lowest target phone/Chromebook during platform Preview/Inspector testing.   |
| R-02 | Recommended gap | Safari/iOS was not available in the Windows test environment.                                                                                                                       | Run one complete touch flow on iOS Safari during owner device testing.                             |
| R-03 | Recommended gap | A static 1280×720 thumbnail is ready; no animated thumbnail/short loop was authored.                                                                                                | Produce the optional motion asset after portal-specific duration and codec requirements are known. |
| R-04 | N/A             | Rewarded ads are not part of this RC, so a rewarded-ad alternate continue path does not apply.                                                                                      | Re-run the owner ad checklist if rewarded ads are added later.                                     |

## Clean package launch

The expanded RC—not the Vite development server—was served from
`release/fling-fiasco-rc/` at `http://127.0.0.1:4180/` in a clean browser origin.
All seven manifest files returned HTTP 200 with exact manifest byte counts.
At 390×844, a browser-level drag completed Level 1 with three stars and the
primary action advanced to Level 2. The RC origin produced no console or network
log entry. The verification browser tab was then closed and its viewport reset.

The package contains only hashed runtime assets, the GLB, entry point, notices
and license texts. It contains no source map, source tree, development server
configuration, credential, personal path, test-level entry or visible debug UI.
