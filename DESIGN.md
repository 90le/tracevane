# OpenClaw Studio Design Contract

OpenClaw Studio is an operational desktop-style console for first-time setup, repair, model routing, gateway health, and day-to-day control. Its interface must feel calm, readable, and trustworthy before it feels decorative.

## Required Workflow

Before changing frontend UI, read this file plus the installed skills:

- `/home/binbin/.codex/skills/frontend-design/SKILL.md`
- `/home/binbin/.codex/skills/ui-ux-pro-max/SKILL.md`
- `/home/binbin/.codex/skills/taste-skill/SKILL.md`
- `/home/binbin/.codex/skills/taste-redesign/SKILL.md`

Use skills as review lenses, not as a reason to mix unrelated aesthetics. For Studio, prefer product-console clarity over marketing-page spectacle.

## Aesthetic Direction

Primary direction: glass command center with restrained product chrome.

Reference blend:

- OpenClaw `web-codex.html`: deep blue canvas, mint accent, light glass panels.
- Raycast: dark command-palette discipline, hairline borders, compact controls.
- Vercel/Linear: precise spacing, low visual noise, clear hierarchy.

Avoid:

- Purple-blue AI gradients as the main identity.
- Flat grey dark mode that makes text hard to read.
- Dense card walls on first screens.
- Decorative blobs/orbs as standalone styling.
- Cyberpunk, neo-brutalism, neumorphism, or novelty themes for core admin UI.

## Color Tokens

Dark mode:

- Canvas: `#0d1b2a`, `#1b263b`, `#415a77`
- Primary text: `#f4f7fb`
- Secondary text: `#c7d3e3`
- Muted text: `#93a7bb`
- Mint accent: `#7fffd4`
- Soft sky: `#bde0fe`
- Warm accent: `#ffd6a5`
- Panel: translucent white around 10-16%
- Border: translucent white around 18-30%

Light mode:

- Canvas: `#e7f0f6`, `#f7fbfe`, `#d5e4ee`
- Primary text: `#102536`
- Secondary text: `#4f687c`
- Mint accent: `#0d9488`
- Panel: translucent white around 72-92%
- Border: blue-grey around 11-24%

## Layout Rules

- First screen should answer: current state, recommended action, important route/model facts.
- Health checks, install logs, and command output should open in floating dialogs, not become permanent card walls.
- Installation/repair pages should act like a guided wizard: status, next action, advanced details collapsed.
- Dashboard surfaces may be dense only after the user opens details.
- Use top tabs for major Codex Stack sections; avoid left tab stacks inside already side-nav-heavy views.
- Cards are for repeated items or framed tools. Use panes, strips, and inline command rows for workflow steps.

## Component Rules

- Use Nuxt UI and shared CSS tokens before inventing ad hoc controls.
- Use lucide icons for recognizable actions.
- Buttons need clear priority: one primary action, secondary actions visually quieter.
- Do not put visible explanatory essays inside the app. Use concise labels and progressive disclosure.
- Keep radius mostly 8-12px for product UI; reserve larger radius for modals or hero-like panels.
- Dark mode must pass a visual readability check, not merely invert colors.

## Verification

Every meaningful visual pass must produce:

- Desktop dark screenshot.
- Desktop light screenshot.
- At least one Codex Stack screenshot.
- Console check for frontend errors.
- Typecheck before commit.

If the user has not approved the visual direction, do not commit the palette pass.
