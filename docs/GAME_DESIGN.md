# Fling Fiasco — Game Design

## Player fantasy

You are the unseen director of a wind-up stunt show. A cheerful toy performer must be flung through miniature obstacle courses to ring the oversized finale bell. Every imperfect landing is part of the comedy.

## Core verbs

- **Aim:** press anywhere in the playfield and drag in the desired direction.
- **Fling:** release to apply the shown impulse to the ragdoll.
- **Wait and read:** observe momentum, moving mechanisms, and the remaining shots.
- **Retry:** instantly reset the current stunt after failure.

Touch and mouse share the same one-pointer gesture. Keyboard enhancement uses arrow/WASD keys to aim, Space/Enter to fling, R to retry, and Escape/P to pause.

## Core loop

1. Read the bell position and mechanism timing.
2. Swipe to fling the performer.
3. Laugh at and learn from the physical result.
4. Correct direction, strength, or timing with the remaining flings.
5. Ring the finale bell, earn one to three stars, unlock the next stunt, and continue.

Each level targets 20–60 seconds. A full twelve-level run provides a natural 8–15 minute session.

## Success, failure, and restart

- Success occurs when any major performer body part reaches the finale bell sensor.
- Falling below the toybox, touching an active crusher, or exhausting all flings after the performer settles fails the stunt.
- Failure shows the visible reason and a large primary retry button.
- Retry reloads only the current level and returns to control in under a second.
- Victory awards stars from remaining flings and elapsed time. Best scores are never reduced.

## Progression and rewards

- Twelve authored levels unlock sequentially.
- Each victory adds a unique stunt badge to the level shelf.
- Up to three stars per level reward efficient lines and good timing.
- The finale screen celebrates total stars and offers replay of any level.
- The persistent goal is a complete 36-star toybox shelf.

## Mechanisms and difficulty curve

1. **Curtain Call:** direct fling and bell.
2. **Bank Shot:** safe bumper introduction.
3. **Double Bounce:** bumper plus raised bell.
4. **Fan Service:** continuous air force.
5. **Crate Expectations:** dynamic breakable crate stack.
6. **Pancake Panic:** timed crusher hazard.
7. **Spring Cleaning:** trampoline redirection.
8. **Wind-Up Alley:** fan and bumper timing.
9. **Moving Day:** moving platform and moving bell.
10. **Boxed In:** crates, narrow route, and fan.
11. **Pinball Payroll:** multiple bumpers with alternate routes.
12. **Grand Fiasco:** fan, spring, moving platform, crates, and crusher in one readable finale.

Each new mechanism first appears with safe space, then combines with earlier mechanics every two or three levels. Levels 9 and 11 allow materially different high and low routes.

## Camera and presentation

The game uses a semi-fixed 2.5D toy-theatre camera. Physics is fully 3D, while gameplay bodies are softly constrained to a shallow stage depth for mobile readability. Camera framing follows the stunt horizontally with damped movement and keeps the bell and performer in view without occlusion. Portrait 9:16 is the authored composition; desktop uses a centered portrait stage.
