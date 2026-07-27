# Decisions

## 2026-07-27 — Empty repository baseline

The repository contained only the autonomous prompt, release checklist, and `AGENTS.md`; it was not a Git repository and had no reusable code or assets. A new TypeScript/Vite project is therefore appropriate and does not replace existing implementation work.

## 2026-07-27 — Portrait 2.5D stunt design

Use a fully 3D Rapier ragdoll inside a shallow stage depth with a semi-fixed camera. This preserves genuine rigid-body comedy while keeping trajectories legible and one-finger aiming reliable on a 9:16 phone.

## 2026-07-27 — Direct swipe action

A swipe anywhere in the unobstructed playfield applies impulse in the swipe direction. This avoids a small virtual joystick or the need to grab a moving body and provides the same rule for touch and mouse. The trajectory arrow and strength meter make input readable before release.

## 2026-07-27 — Procedural toy art plus one GLB contract asset

Gameplay objects are simple, repeated geometric toys, so shared Three.js primitive geometry is smaller and more efficient than authored mesh files. A generated, optimized GLB stage mark proves and continuously tests the shipping asset pipeline and stable manifest loader without inflating the bundle.

## 2026-07-27 — Original synthesized audio

Use Web Audio synthesis for music and effects. It provides publishable original audio, instant loading, strength-scaled impacts, and no license or external-request risk.

## 2026-07-27 — Conditional platform SDK loading

Official CrazyGames and Poki scripts load only when their platform adapter is selected. This prevents a Poki build from making CrazyGames/CDN requests and makes disabled/local operation safe. `mock` mode provides deterministic local event and ad lifecycle testing.

## 2026-07-27 — Platform documentation verification

Official CrazyGames and Poki public documentation was rechecked on 2026-07-27. The implementation targets CrazyGames HTML5 SDK v3 and Poki HTML5 SDK v2. `[OWNER]` Preview/Inspector, real ads, platform storage, embedding, orientation, and portal size reports remain explicitly untested.

## 2026-07-27 — Deterministic ready pose and mechanism gates

Physics is held until the first accepted gesture so reading the hint does not change the launch state. Authored mechanism levels gate the bell behind their featured bumper, fan, or spring activation; bumpers are deterministic sensor-driven redirects rather than chaotic solid spheres. This keeps delayed human input and the automated route solver aligned while preventing the key mechanism from being bypassed.

## 2026-07-27 — English-only release candidate

The initial RC exposes English only. A partial Chinese option was removed because mixed-language menus and untranslated authored level text would be lower quality than a consistent English release. The save parser safely normalizes older `zh` settings to English. Additional locales remain a post-RC feature.

## 2026-07-27 — Low-tier renderer

Mobile user agents and devices reporting at most 4 GB memory use DPR 1, disabled antialiasing, and disabled dynamic shadows. The production browser benchmark uses 390×844, a 4 GB Android-class profile, device DPR 2, and 4× CPU throttling; gameplay must remain at least 30 FPS.

## 2026-07-27 — Pointer capture is best effort

Pointer capture improves drags that leave the stage, but browsers can reject capture or release after a pointer cancellation, element detach, automation dispatch, or platform interruption. Capture and release are therefore guarded; the gesture remains valid while it is over the playfield and cannot surface an unhandled browser exception.
