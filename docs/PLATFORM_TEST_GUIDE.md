# Platform Owner Test Guide

Build under test: **Fling Fiasco 1.0.0-rc.1**  
Upload artifact: `release/fling-fiasco-rc.zip`

These steps are intentionally `[OWNER]` work. Local SDK mocks, disabled-mode
fallbacks, package structure, and browser behavior are covered by automated QA;
Codex did not open either platform backend or run real ads.

## CrazyGames Preview

1. Upload the ZIP so `index.html` is at the archive root.
2. Configure supported orientation as portrait and open Preview on phone and
   desktop.
3. Confirm the loading screen disappears, the 9:16 stage is centered, phone
   portrait fills the available canvas, and landscape shows the safe rotate
   recommendation without losing progress.
4. With the SDK event inspector, verify this expected sequence:
   - boot: `loadingStart → loadingStop`;
   - first accepted fling: one `gameplayStart`;
   - pause/menu/win/fail/level transition: one `gameplayStop`;
   - resume into play: one new `gameplayStart`;
   - no consecutive duplicate start or stop events.
5. Win a level, choose Retry and Next, and verify a midgame ad is requested only
   at those natural transitions. During a real ad the simulation and audio must
   remain paused/muted; finish and ad-error paths must both return to a playable
   stage.
6. Toggle the platform mute setting and confirm music and effects follow it.
7. Win at least two levels, refresh Preview, and confirm unlocks, stars, best
   score, and audio settings persist with the platform/browser storage policy.
8. Inspect the embedded page for scrollbars, clipped safe areas, focus loss,
   resize, fullscreen, and console/network errors.
9. Record platform-reported initial bytes, total bytes, and file count in
   `docs/RELEASE_CHECKLIST.md` section 17.

Pass only if every sequence is paired, ads recover on success/error, progress is
stable, and Preview reports no SDK error.

## Poki Inspector

1. Upload the same ZIP and open it in Poki Inspector.
2. Verify `gameLoadingFinished` fires once after the playable stage is ready.
3. Verify first input and all later round resumes emit deduplicated
   `gameplayStart`, while pause/menu/result/transition emit `gameplayStop`.
4. Retry or advance from a result and verify `commercialBreak`; confirm
   simulation/audio pause and safe recovery on rejection.
5. If rewarded ads are enabled later, verify a normal non-rewarded continue
   option remains visible at the same decision point.
6. Run the Inspector aspect-ratio checks for portrait phone, tablet, rotated
   16:9 relationship, and desktop embed. Confirm there is no page scroll or
   stretched game canvas.
7. Test private browsing and blocked storage: the game must boot and remain
   playable even if progress becomes session-only.
8. Confirm Inspector reports an initial download below 8 MB and no unapproved
   request to CrazyGames, Google Fonts, analytics, or another CDN.
9. Record all results in `docs/RELEASE_CHECKLIST.md` section 17.

## Issue record template

- Platform/build:
- Device, browser, orientation:
- Step number:
- Expected:
- Actual:
- Console/network evidence:
- Screenshot/video:
- Reproducibility:
- Severity:
