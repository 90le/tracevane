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

Primary direction: soft glass operations console with restrained product chrome.

This is not a landing page, brand showcase, or Dribbble exercise. Studio is a troubleshooting and control product for users who may be installing, repairing, or switching model routes under pressure. Visual quality matters, but it must reduce doubt rather than add spectacle.

Reference blend:

- OpenClaw `web-codex.html`: deep blue canvas, mint accent, light glass panels.
- Raycast: dark command-palette discipline, hairline borders, compact controls.
- Vercel/Linear: precise spacing, low visual noise, clear hierarchy.
- Anthropic/Claude: warm editorial restraint, but without serif-heavy marketing treatment.
- Apple/Tesla-style subtraction: fewer visible containers, more confidence through spacing and alignment.
- Linear/Raycast-style operational density: keyboard-first command surfaces, status clarity, and quiet panels.

Avoid:

- Purple-blue AI gradients as the main identity.
- Pure black or flat grey dark mode that makes text hard to read.
- Pure white light mode that causes glare and fatigue.
- Dense card walls on first screens.
- Decorative blobs/orbs as standalone styling.
- Cyberpunk, neo-brutalism, neumorphism, or novelty themes for core admin UI.

## Reference Method

External design resources are inspiration catalogs, not templates to copy wholesale. When using Frontend Design Pro Demo, UI UX Pro Max, Awesome Claude Design, Awesome DESIGN.md, Bencium UX Designer, Taste Skill, SuperDesign, Neumorphism, or Neo-Brutalism references, apply this selection rule:

1. Pick one visual family per feature pass.
2. Translate it into Studio tokens and layout rules before writing CSS.
3. Reject any style that makes setup, repair, logs, model routing, or gateway state harder to understand.
4. Verify both light and dark variants together; never tune only one mode.

Useful lessons for Studio:

- Frontend Design Pro Demo: use style families to break generic AI defaults, but keep only patterns that serve product-console clarity.
- UI UX Pro Max: accessibility, touch targets, loading/error states, and responsive behavior outrank decorative style.
- Awesome Claude Design and Awesome DESIGN.md: describe UI through reusable tokens, component rules, previewable examples, and do/don't constraints.
- Anthropic warm editorial: useful for warmth and calmness, not for turning the app into a marketing page.
- Bencium Controlled mode: default for production; Innovative mode only for isolated prototypes.
- Taste Skill sliders: use explicit variance, density, and motion budgets before redesigning.
- SuperDesign: useful for producing alternate concepts, but final Studio UI must be implemented in the existing Vue/Nuxt UI stack.
- Neumorphism: not a core direction; only subtle inset/raised state hints are allowed.
- Neo-brutalism: not a core direction; only strong hierarchy and direct labels are allowed, not thick borders or loud color blocks.

## Studio Style Sliders

Default values for production screens:

- Design variance: 5/10. Use asymmetry and split panes, but keep predictable workflows.
- Visual density: 4/10 for first-use, install, repair, and health flows; 6/10 for advanced logs and configuration tables.
- Motion intensity: 3/10 by default; 5/10 only for state transitions that explain progress, route changes, or panel hierarchy.

Rules:

- First-time and repair surfaces must be calmer than admin dashboards.
- Advanced users can opt into dense detail panes; density should not be the default landing state.
- Motion must communicate cause and effect. Avoid mouse trails, custom cursors, ornamental particle effects, or permanent animation loops in core workflows.
- Glass is allowed only when it improves layering. It must include readable contrast, hairline borders, and subtle inner refraction, not just blur.

## Frontend Stack

The release stack is Vue 3 + Vite + Nuxt UI v4 + Tailwind CSS v4 + Motion for Vue + Reka UI + lucide icons.

Implementation notes:

- Nuxt UI is loaded through the Vite plugin and `UApp`.
- Tailwind CSS v4 is loaded from `style.css`.
- Reka UI owns low-level dialog, tooltip, and accessible overlay primitives.
- Motion is allowed for state-driven page and panel transitions, not decorative noise.
- Use `@lucide/vue` for source imports. The old `lucide-vue-next` npm package is deprecated and currently points users back to `@lucide/vue`.

## Color Tokens

Dark mode:

- Canvas: `#18232a`, `#202f38`, `#2b3d47`
- Primary text: `#f2f7f6`
- Secondary text: `#d0dedb`
- Muted text: `#95a7a5`
- Mint accent: `#8fcfc3`
- Soft blue: `#9bb6d7`
- Warm accent: `#d4b16f`
- Panel: translucent charcoal-teal around 52-72%
- Soft surface: translucent mist around 6-8%
- Border: mist-teal around 16-26%
- Rule: dark mode must be charcoal/blue-green, never pure black.

Light mode:

- Canvas: `#eef1ed`, `#f6f4ec`, `#dde6e1`
- Primary text: `#1e2b2d`
- Secondary text: `#506164`
- Muted text: `#7c8b8b`
- Mint accent: `#2e8175`
- Soft blue: `#596f9a`
- Warm accent: `#9c7134`
- Panel: warm off-white around 62-82%
- Soft surface: muted ink around 5-6%
- Border: warm slate around 13-22%
- Rule: light mode must be warm mist/off-white, never pure white as the dominant canvas.

Color rules:

- Use one primary accent per view. Secondary colors are for semantic state only.
- Do not mix warm and cool grey ramps casually; all neutrals should be tinted by the Studio canvas.
- Avoid raw hex in feature components. Promote repeated values to semantic tokens.
- Text/background pairs must be readable in both themes before a palette is considered acceptable.

## Layout Rules

- First screen should answer: current state, recommended action, important route/model facts.
- Primary navigation has exactly one visible owner: the left Studio rail. The topbar is only for current workspace identity, command access, theme, and language.
- The command palette is for commands and global preferences, not a second page-navigation menu.
- Health checks, install logs, and command output should open in floating dialogs, not become permanent card walls.
- Installation/repair pages should act like a guided wizard: status, next action, advanced details collapsed.
- Dashboard surfaces may be dense only after the user opens details.
- Use top tabs for major Codex Stack sections; avoid left tab stacks inside already side-nav-heavy views.
- Cards are for repeated items or framed tools. Use panes, strips, and inline command rows for workflow steps.
- Prefer split panes, command rows, progressive sheets, and floating logs over card grids.
- Do not duplicate navigation in side rail, top bar, and command/search surfaces.
- Context panels are removed unless they provide actionable state or editing controls.
- Avoid equal three-column card rows. If three items are required, use hierarchy, split columns, or a matrix with a clear dominant action.

## CSS Ownership

- `apps/web-vue/src/style.css` is the shared design-system boundary: Tailwind import, semantic tokens, app shell, and reusable primitives only.
- Page-specific selectors should not be added to the global Atlas layer when touching a page. Move them into a feature stylesheet or the owning component and delete stale global duplicates.
- Large feature pages should graduate to feature CSS files when the local style block becomes hard to scan or when selectors are shared across sibling components. Preferred names are domain based, for example `plugins-workspace.css`, `dashboard-workspace.css`, or `codex-stack-workspace.css`.
- Scoped Vue styles are acceptable for compact, single-component states. They are not the long-term home for a whole page design system.
- New UI slices should keep behavior, markup, tests, and styles owned by the same feature directory unless the style is a genuine shared primitive.

## Component Rules

- Use Nuxt UI and shared CSS tokens before inventing ad hoc controls.
- Use lucide icons for recognizable actions.
- Buttons need clear priority: one primary action, secondary actions visually quieter.
- Do not put visible explanatory essays inside the app. Use concise labels and progressive disclosure.
- Keep radius mostly 8-12px for product UI; reserve larger radius for modals or hero-like panels.
- Dark mode must pass a visual readability check, not merely invert colors.
- Loading, empty, disabled, error, and retry states are required for operational screens.
- Icon-only controls need accessible labels and visible focus states.
- Destructive or route-changing actions must explain the result before execution.
- Logs and health-check output should be displayed in floating dialogs/sheets with copy/retry controls, not embedded permanently in page layout.

## Pattern Decisions

Use:

- Command center: current state, one recommended action, secondary checks collapsed.
- Guided wizard: install, reinstall, repair, route switching, and smoke validation.
- Split inspector: list/table on one side, focused detail/editor on the other.
- Floating log sheet: health check, install output, smoke output, service logs.
- Inline risk banner: only for blockers that change the next action.

Avoid:

- Card walls for every status item.
- Permanent "old inspection" or watchdog noise when the state can be auto-resolved.
- Watchdog controls that invite users to start/stop services without explaining when it is needed.
- Repeating the same status in multiple places.
- Decorative effects that compete with repair/setup state.

## Verification

Every meaningful visual pass must produce:

- Desktop dark screenshot for milestone visual reviews.
- Desktop light screenshot for milestone visual reviews.
- At least one Codex Stack screenshot for Codex Stack visual milestones.
- Console check for frontend errors.
- Typecheck before commit.

Do not repeatedly take screenshots during small CSS/token edits unless visual evidence is needed. For major style direction changes, show the user the running preview and summarize the exact design choice before continuing deeper.
