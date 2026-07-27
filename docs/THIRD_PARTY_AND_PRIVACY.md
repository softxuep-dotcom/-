# Third-Party, Privacy, and External Requests

## Runtime software

- Three.js 0.185.1 — MIT.
- Rapier JavaScript 0.19.3 — Apache-2.0.

The complete notices and license texts ship inside the upload package as
`THIRD_PARTY_NOTICES.txt` and `licenses/*`.

## Original content

All game design, authored levels, UI, text, procedural low-poly artwork,
generated `stage-mark.glb`, synthesized music, and synthesized sound effects are
original project content. No third-party fonts, textures, models, music, sound
effects, analytics, or advertising assets are included.

## Data and privacy

The standalone build collects no personal data and sends no analytics. Progress
and settings are stored only in browser `localStorage`; storage failure falls
back to memory-only play. There are no accounts, chat, purchases, or user
uploads.

## External requests

The default/disabled build makes no external requests. The CrazyGames build
loads only `https://sdk.crazygames.com/crazygames-sdk-v3.js`; the Poki build
loads only `https://game-cdn.poki.com/scripts/v2/poki-sdk.js`. Those requests
are platform SDK integration points and are never loaded in the other platform
mode. Any platform-side data handling is governed by the selected platform and
must be verified by the owner in Preview/Inspector.
