# Crossy Road — Outer Space Edition

<!--
  TODO (write this yourself — the assignment says this part must NOT be AI-written):
  In 1–2 sentences, describe what the game is and how it differs from stock Crossy Road.
  Example angle: it's a Crossy Road clone reskinned into an outer-space theme where you
  play as a green alien crossing an alien planet instead of a chicken crossing roads.
  Replace this comment with your own words.
-->

_(Write your own 1–2 sentence description here — see the note in the source.)_

## How to Play

**Controls**
- Move forward (away from camera): `W` or `Up Arrow`
- Move backward (toward camera): `S` or `Down Arrow`
- Move left: `A` or `Left Arrow`
- Move right: `D` or `Right Arrow`

The alien hops one tile per key press. You can't hop past the rock barriers on the
left, right, or behind your starting position.

**Scoring**
- Your score is the furthest row you've reached, going forward.
- It only increases when you advance to a new forward row you haven't reached before.
- Moving sideways or backward does not change your score.

**Losing**
You die (Game Over screen with your final score and a Play Again button) if you:
- Get hit by a UFO on a road row.
- Get struck by a laser beam while it's sweeping across a railroad row. The emitter
  lights flash red before a beam fires — wait for it to pass before crossing.
- Fall into the green liquid (a river row) by landing on liquid instead of a floating
  rock, or by riding a rock off the edge of the play area.

## Terrain Types

- **Planet ground** — safe. Scattered alien plants.
- **Road** — UFOs drift across; touching one is fatal.
- **Railroad** — safe to stand on until the warning lights flash and a laser beam
  streaks through.
- **Green liquid** — hop across the floating asteroid rocks; the liquid itself is fatal.

## AI Models, Tools, and Strategy

- **Tool / model:** Built with Kiro (AI IDE) using its default agent model.
- **Rendering:** Three.js (r128) loaded from a CDN. No build step — plain HTML/CSS/JS.
- **Strategy:** I built it up iteratively — first a movable chicken and camera, then
  terrain types, obstacles (cars, then trains/railroads), infinite scrolling and
  fenced boundaries, and finally a full outer-space reskin (alien, UFOs, laser beams,
  green liquid + rocks, rock barriers, starfield). Each round I described the specific
  behavior or look I wanted and had the AI edit the single `game.js` file, verifying in
  the browser and pushing to GitHub Pages after each change.

## Known Issues / Unfinished

<!-- Update this list to match what you actually observe when you play. -->
- No sound effects or music.
- No difficulty ramp — obstacle speeds don't increase as your score grows.
- The alien can be carried off the side of the play area while riding a rock; this is
  intentional (it's a death), but the boundary feedback is abrupt.
- No mobile/touch controls — keyboard only.
- Score is not persisted between sessions (no high-score storage).

## Running Locally

It's a static site, so any static server works. For example:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Live Version

Hosted on GitHub Pages: <https://a-gupta123.github.io/crossyroad>
