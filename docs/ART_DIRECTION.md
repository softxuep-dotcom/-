# Fling Fiasco — Art Direction

## Visual thesis

A hand-built midnight toy theatre: chunky painted wood, rounded rubber mechanisms, paper confetti, warm spotlights, and expressive low-poly silhouettes. The result should read at phone size before it rewards close inspection.

## Shape language

- Performer: rounded capsule limbs, large cream head, coral torso, teal shorts, oversized mitten hands.
- Goal: bright gold bell inside a mint-green circular halo.
- Safe geometry: rounded navy, lilac, and cream toy blocks.
- Active mechanisms: saturated coral/orange; hazards add high-contrast chevrons.
- Collectible/reward language: five-point stars and paper confetti.

## Palette

- Ink: `#17182f`
- Midnight: `#24264d`
- Cream: `#fff3d6`
- Coral: `#ff6b6b`
- Gold: `#ffd166`
- Mint: `#57e2b2`
- Sky: `#63c7ff`
- Lilac: `#9b8cff`

Surfaces use matte rough materials with small emissive accents only on objectives and active mechanisms.

## Lighting and camera

- Warm key light from upper left, cool fill from front, soft hemisphere ambience.
- Contact shadows anchor toys without hiding silhouettes.
- Fog and layered backdrop arches create miniature-stage depth.
- Camera shake is short, clamped, and reserved for powerful impacts.
- Slow motion is limited to the instant the finale bell is struck.

## Typography and UI material

The UI uses the locally available system stack with an intentionally rounded, heavy hierarchy (`Arial Rounded MT Bold`, `Trebuchet MS`, sans-serif). Panels resemble die-cut toy labels: thick ink borders, offset shadows, cream fills, and pill-shaped controls. No external fonts or network-loaded artwork are used.

## Motion

Buttons squash on press. State panels pop with a short overshoot. Confetti and bell rings carry the strongest motion. Reduced-motion mode removes decorative floating, repeated pulsing, and large UI transforms while preserving state communication.

## Audio

All audio is original real-time Web Audio synthesis:

- Music: gentle toy-piano arpeggio with muted bass pulse.
- UI: wooden clicks.
- Impacts: strength-scaled thumps and rubber squeaks.
- Mechanisms: fan hum, spring boing, crusher clack.
- Victory: bell strike and short ascending flourish.
- Failure: soft descending kazoo-like phrase.

Music and effects have separate persistent toggles. Platform mute and pause/ad mute override both.

## Prohibited style

No gore, realistic injury, horror lighting, default gray materials, unlicensed brands, photorealism, dense dashboard chrome, tiny icon-only controls, or effects that hide the stunt trajectory.
