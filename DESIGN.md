# OpenClaw Studio Design Contract

OpenClaw Studio is an operational desktop-style console for first-time setup, repair, model routing, gateway health, and day-to-day control. Its interface must feel calm, readable, and trustworthy before it feels decorative.

## Required Workflow

Before changing frontend UI, read this file plus the installed skills:

- `/home/binbin/.codex/skills/frontend-design/SKILL.md`
- `/home/binbin/.codex/skills/ui-ux-pro-max/SKILL.md`
- `/home/binbin/.codex/skills/taste-skill/SKILL.md`
- `/home/binbin/.codex/skills/taste-redesign/SKILL.md`

Use skills as review lenses, not as a reason to mix unrelated aesthetics. For Studio, prefer product-console clarity over marketing-page spectacle.

## Redesign Mandate

The current Studio UI is not the target design. Existing screens may be used for behavior discovery, API wiring, and regression comparison, but not as the visual or layout reference.

The redesign must replace these inherited problems:

- Card stacking as the default answer to every state.
- Repeated navigation across sidebar, topbar, search, command palette, and local tabs.
- Dense first screens that show internal implementation facts before user intent.
- Dark mode that feels heavy, flat, or hard to read.
- Light mode that feels glaring, white, or visually tiring.
- Decorative effects without operational meaning.
- Page-local CSS accumulation that makes every module drift into a different product.

The current target is **DuoYuan Studio Ops**:

- An operations-console product UI, not a marketing dashboard.
- Visual direction is derived from the DuoYuan WordPress theme at `C:\Users\Administrator\Desktop\Code\App\ceomax-pro\duoyuan-pro` (`/mnt/c/Users/Administrator/Desktop/Code/App/ceomax-pro/duoyuan-pro`), especially `header.php`, `footer.php`, `preview.html`, `src/css/app.css`, and `template-parts/components/*`.
- Light mode uses DuoYuan's clean white-surface discipline on an off-white OpenClaw canvas, with mint/peach accents used sparingly for orientation.
- Dark mode uses a DuoYuan graphite console palette (`#090d11 / #101820 / #1b2934`) with OpenClaw mint actions, readable text, visible borders, and restrained peach semantic emphasis. It must not drift back into blue-gray glass.
- Split panes, docked inspectors, guided wizards, floating logs, and inline command rows.
- One obvious next action per screen.
- Advanced details available, but collapsed until needed.
- Less chrome, fewer competing boxes, stronger hierarchy, and clearer forms.
- Real loading, empty, disabled, error, retry, and success states.

Behavior can be preserved. Layout, visual grouping, copy density, and component composition may be replaced.

## DuoYuan Reference Audit

DuoYuan is a Tailwind WordPress product theme, not a glass dashboard. Its useful value for Studio is the component discipline:

- `tailwind.config.js` defines one primary family: sky `50-950`, with `600/700` used for DuoYuan's original primary actions and `50/100/900/30` used for soft selected states. Studio should translate that discipline into its OpenClaw mint primary, not become a blue product.
- `src/css/app.css` defines compact component classes: `.dy-btn`, `.dy-input`, `.dy-card`, `.dy-badge`, `.dy-alert`, pagination, comments, and line clamps.
- `header.php` uses a sticky white/dark-gray navigation: `bg-white dark:bg-gray-900`, `border-gray-200 dark:border-gray-800`, `shadow-sm`, 64px height, compact icon buttons, and dropdown panels.
- `footer.php` uses a deliberate dark information block: `bg-gray-900`, `text-gray-300/400`, `gray-800` icon buttons, and simple link columns.
- `template-parts/components/*` uses prop-driven variants: button `primary/secondary/danger/success/outline/ghost`, size `sm/md/lg`, input label/help/error, select searchable dropdown, modal sizes, tabs variants, skeleton and empty states.
- Product cards use `bg-white dark:bg-gray-800`, `border-gray-100 dark:border-gray-700`, `rounded-xl`, `shadow-sm -> hover:shadow-md`, image aspect ratios, short badges, and restrained hover scale only on media.
- Layout density is conventional Tailwind SaaS: `container mx-auto px-4`, `gap-4/6/8`, `rounded-lg/xl`, 40-44px controls, and responsive grids that collapse predictably.
- Motion is mostly state feedback: hover color, small translate/scale on cards or icons, dropdown fade/scale, modal fade/scale. There is no permanent decorative animation.

Translate, do not copy:

- Studio must keep CSS variables and `data-theme`; do not scatter raw Tailwind `dark:` classes into Vue pages.
- Studio may borrow DuoYuan's color ramps, component proportions, focus rings, and overlay structure.
- Studio should not borrow DuoYuan's marketing hero, product marketplace density, VIP gradients, or footer link-farm as core console UI.
- Studio's side rail remains because it is the app shell, but its surface should feel like DuoYuan's sticky nav: solid, bordered, compact, and clearly active.

## DuoYuan Source Readout

The reference source was reviewed directly from `/mnt/c/Users/Administrator/Desktop/Code/App/ceomax-pro/duoyuan-pro`:

- `src/css/app.css`: the component contract is intentionally small. Buttons are `inline-flex`, `rounded-lg`, 40px-class controls, focus rings, and one solid primary action. Inputs are white/dark-gray blocks with visible borders, not translucent slabs. Cards are `bg-white dark:bg-gray-800 rounded-xl shadow-sm`; the shadow is functional, not decorative.
- `tailwind.config.js`: the reference identity is Tailwind gray plus sky. Studio keeps the neutral/component discipline but translates that primary ramp to OpenClaw mint; implementation CSS should not keep using `--sky` for active, hover, focus, or shell emphasis.
- `header.php`: navigation is sticky, solid, bordered, and compact. It uses icon buttons with hover backgrounds, dropdown panels with white/dark surfaces, and a single action cluster. This maps to Studio's left rail and top utility bar.
- `preview.html`: the strongest reusable lessons are spacing and component states: `container mx-auto px-4`, `gap-4/6`, simple category grids, grouped controls, and theme variants that keep light surfaces white and dark surfaces dark gray.
- `template-parts/components/button.php`: variants are explicit (`primary`, `secondary`, `danger`, `success`, `outline`, `ghost`), and sizes are explicit (`sm`, `md`, `lg`). Studio controls should follow this vocabulary through CSS variables and existing components.
- `template-parts/components/input.php` and `select.php`: labels sit above fields, helper/error text stays below, focus rings are visible, and dropdown panels are opaque. Studio should not use low-contrast translucent form fields.
- `template-parts/components/modal.php`: overlays can blur the page, but modal bodies themselves are solid `bg-white dark:bg-gray-800` with bordered header/footer. Studio floating logs and command sheets should use this pattern.
- `template-parts/components/product-card.php`: hover motion is restrained and attached to media/content affordance. Studio may use row hover and small translate feedback, but not permanent light effects or cursor trails.
- `template-parts/global/block-panel.php`: side sheets are the right reference for inspect/edit/add flows. They slide from the side, keep opaque white/graphite bodies, use bordered header/search/action zones, and leave the primary workspace mentally intact.
- DuoYuan home modules and archive surfaces are composed as a deliberate sequence: sticky utility header, optional notice, category/action strip, content index, detail/status modules, and footer/action affordances. Studio should translate that into page-level stage order, not into ecommerce marketing sections.
- DuoYuan dense cards are successful because metadata is layered by priority: primary title/action, badges, compact facts, auxiliary tags, and secondary actions. Studio should carry the density pattern into operational rows and matrices, but avoid repeated equal cards on troubleshooting pages.

## DuoYuan Theme Deep Analysis

The WordPress theme works because it is disciplined, not because it is visually loud:

- The real design system is small: `src/css/app.css` plus component partials. The root `style.css` is only WordPress metadata. Studio should follow the same shape: a small global primitive layer and feature-owned surfaces, not a growing pile of page-local overrides.
- The dark palette in DuoYuan is Tailwind graphite (`gray-900`, `gray-800`, `gray-700`), not blue glass. Studio dark mode should therefore read as a graphite software console with a mint action lane, not as a saturated navy dashboard.
- Light mode is mostly a near-white porcelain canvas plus white panels. Studio tints the canvas slightly (`#fbfdfb`) to avoid glare, but controls, dropdowns, dialogs, tables, and work panes should remain crisp white instead of beige or gray.
- Header, dropdown, modal, tabs, and pagination all use visible borders and small shadows. Depth comes from hierarchy and edge contrast, not translucent gray overlays.
- Forms are a release gate: labels above, 40px-class height, solid field background, visible border, focus ring, helper/error text below, disabled opacity. A field that looks like a gray disabled block fails this contract.
- Component variants are finite and explicit. Buttons have primary/secondary/danger/success/outline/ghost; tabs have default/pills/underline; modals have sizes. Studio should add variants only when a real workflow needs them.
- Motion is operational: hover color, menu fade/scale, modal fade/scale, restrained media hover. Permanent trails, decorative glow loops, and ambient cursor effects are rejected.
- Product cards in DuoYuan are for repeated products. Studio should translate that into entity rows, matrices, split inspectors, and command lanes because most Studio pages are operational workflows, not browsing surfaces.

This analysis changes the Studio target from blue-tinted glass to **graphite SaaS ops**: neutral shell, white/light work surfaces, solid dark panels, mint as the only action identity, and peach/amber only as semantic warmth.

## DuoYuan Translation Matrix v7

Use this matrix when a future frontend pass says "follow DuoYuan". The reference is a source of component grammar, not a skin to paste over Studio.

| DuoYuan source | What works there | Studio translation | Do not copy |
| --- | --- | --- | --- |
| `tailwind.config.js` | One primary ramp, one neutral gray family, finite status colors. | Keep one OpenClaw mint/teal action identity plus semantic warning/success/danger tokens. | Do not bring back DuoYuan sky blue or add multiple competing accent ramps. |
| `src/css/app.css` | Small primitive layer for buttons, inputs, cards, badges, alerts, pagination, comments. | Keep `style.css` limited to tokens, shell, shared controls, shared rows, sheets, and base primitives. | Do not grow page-specific CSS in the global file. |
| `header.php` | Sticky solid navigation, single utility cluster, compact icon buttons, clear active/hover states. | Studio rail remains the single primary navigation; topbar remains a compact utility/context strip. | Do not reintroduce topbar route navigation, duplicated search navigation, or floating shell cards. |
| `button.php` | Explicit variants and sizes; loading/disabled are built into the component contract. | Use `.primary-button`, `.secondary-button`, `.compact-button`, danger/safe variants, and clear disabled/loading states. | Do not create one-off feature-local button colors or gradient CTAs. |
| `input.php` / `select.php` | Label above, helper/error below, solid field, visible border, focus ring, opaque dropdown. | Treat form/select clarity as a release gate across Config, Channels, Agents, Codex Stack, Chat, and Files. | Do not use translucent gray fields, placeholder-only labels, or feature-local select skins. |
| `modal.php` / `global/block-panel.php` | Page can dim; sheet body is opaque with header/body/footer zones. | Health output, install logs, smoke logs, command palette, editors, and inspectors use floating sheets/drawers. | Do not turn logs into permanent cards or blur routine controls. |
| `tabs.php` | Only default, pills, and underline variants; tabs switch local state. | Use segmented controls or top tabs for local workbench modes only. | Do not make tabs a second route navigation system. |
| `product-card.php` | Cards work because they represent repeated browsable products with media and compact facts. | Use cards only for repeated browsable records; operations use rows, matrices, split inspectors, action lanes, and sheets. | Do not rebuild admin pages as card walls. |
| `preview.html` | Simple section rhythm: header, action/category strip, focused section, repeated content, footer. | Studio page rhythm is identity, recommended action, mode/filter row, primary work surface, folded diagnostics/history. | Do not import marketplace hero sections, VIP gradients, footer link farms, or ecommerce density. |
| `static/dist/app.js` / Alpine patterns | State changes are local, direct, and visible: menu open, modal open, favorite, tab switch. | Motion and interactivity must explain state changes: open, close, save, validate, stream, retry, collapse. | Do not add cursor trails, decorative glow loops, or animations without workflow meaning. |

## DuoYuan Component Contract v4

The latest source pass re-read DuoYuan's WordPress implementation, not only its preview page:

- `src/css/app.css` is intentionally tiny: buttons, inputs, cards, badges, alerts, pagination, comments, and line clamps. Studio should keep the same primitive-first shape. If a Studio page needs several local selectors to restyle the same button/input/select/pill behavior, promote the behavior into shared tokens or a shared primitive instead of adding another page override.
- `header.php` uses a 64px sticky, solid, bordered navigation with one logo area, one nav area, and one utility cluster. Studio maps this to one shell rail plus one utility bar; do not duplicate primary navigation in command palette, top tabs, and route headers.
- `button.php` is variant-driven: primary, secondary, danger, success, outline, ghost; size is sm/md/lg; loading and disabled are built in. Studio buttons should follow the same finite vocabulary through existing `.primary-button`, `.secondary-button`, compact, danger, and text-button primitives.
- `input.php` and `select.php` are release gates for Studio forms: label above, help/error below, solid field body, visible border, clear focus ring, disabled opacity, opaque dropdown, and optional search inside the menu. Gray translucent fields that look disabled are rejected in both themes.
- `modal.php` and `template-parts/global/block-panel.php` prove that DuoYuan overlays can dim or slide over the page while the sheet body stays opaque. Studio command palette, health output, install logs, edit drawers, file details, and route switch confirmation should use solid sheets with bordered header/body/footer zones, not inline output cards or blurred glass panels.
- `tabs.php` keeps three variants: underline, pills, and default border tabs. Studio should use top tabs or segmented controls only where they switch one local workbench state; route-level navigation remains in the shell rail.
- `card.php` and `product-card.php` are repeated-content surfaces. They work because each card has a real repeated record, optional media, compact facts, and one scan path. Studio must not translate that into administrative card walls. For operations, use row lists, fact matrices, split inspectors, and action lanes.
- `preview.html` confirms the useful rhythm: sticky utility header, optional announcement, category/action strip, one focused section, then repeated content. Studio page order should be identity + next action, mode/filter row, primary work surface, then folded diagnostics/history.
- The Studio left rail follows DuoYuan's sticky navigation discipline: it is a flush solid rail with a single right divider, not a floating rounded card. Active route state uses a mint lane plus subtle fill; shell chrome must not add sidebar margin, rounded container edges, or decorative shadows.

Design consequences for Studio:

1. Shared primitives first: controls, rows, tabs, sheets, status pills, and empty/loading/error states should come from tokens and shared CSS, not page-local color tables. Shared status pills are primitive-owned: component CSS consumes `--status-pill-*` only, while semantic warning/success/danger mixes stay in global tokens so light and dark themes remain consistent.
2. One local navigation mechanism per view: shell rail for routes, top tabs for local modes, command palette for jump/search only.
3. Forms and selects are not decoration. Their contrast, hover, focus, disabled, help, and error states must be checked before a page is considered visually acceptable.
4. Shared controls must expose visible keyboard focus, press feedback, disabled styling, and invalid-field styling from the primitive layer. Do not solve these states inside individual Vue pages.
5. Floating output is a sheet pattern, not a card pattern. Logs and health output may open from any page, but the UI should stay anchored to the current workbench.
6. Cards are allowed only for repeated browsable records. If the user is installing, repairing, editing, routing, diagnosing, or approving, use rows, matrices, drawers, or command lanes.

## DuoYuan Layout Translation

Use DuoYuan as a product-system reference, not a visual skin:

- Page flow: every route starts with identity and one next action, then a mode/index row, then the working surface, then diagnostics or history. Avoid jumping from a header directly into many unrelated equal boxes.
- Module hierarchy: one dominant module per screen section. Secondary facts sit inside the same matrix or row group instead of becoming new cards.
- Index + detail: lists, plugins, skills, agents, channels, and config domains should use a rail/table plus selected detail pane. DuoYuan product grids are acceptable only when the user is browsing repeated content, not when they are fixing system state.
- Action strips: primary actions are solid and grouped. Secondary actions are compact, bordered, and physically near the thing they affect.
- Feedback: upload, install, health, preflight, smoke, and runtime output use an opaque floating sheet or a scoped runtime console. Permanent output cards are only allowed for short summaries.
- Naming: new CSS class names should describe intent (`matrix`, `row`, `section`, `panel`, `sheet`, `rail`, `stage`) rather than defaulting to `card`. Existing `card` names are refactor debt unless the surface is truly a repeated content card.

## Agent / Channels / Codex Stack Layout Directive

Agent and Channels are object-management workbenches. They must not combine a resource rail, a second side task rail, large hero header, top tabs, nested subtabs, action-card grids, and child route content in one view. Use a single object selector plus one primary task bar inside the active workspace:

- Agent: roster selector + top task bar + active task canvas. Tasks are Overview, Persona, Routing, Sessions, and Runtime; low-frequency Advanced JSON stays folded inside Runtime rather than becoming another first-level tab.
- Channels: provider/account tree + adaptive top task bar + active task canvas. Provider and account routes share one selection model instead of provider tabs plus account subtabs.
- Agent and Channels route-level sections must not use an additional side task rail. The top task bar is the only visible local section switcher; mobile may collapse that same bar into a horizontal scroller, but it remains the same control.
- Codex Stack is a guided operations workbench and may keep its compact side task rail when that improves step-by-step repair comprehension, but it must not add duplicated page-header tabs.
- User-facing Agent and Channels copy says route/routing rules, not binding. Backend route names and TypeScript identifiers may stay `binding` for compatibility, but labels, buttons, empty states, and confirmations should use routing language.
- The object selector is not route navigation. It only chooses the current Agent, provider, or account.
- The object-workbench task bar is a shared workbench primitive. Agent and Channels may keep local class hooks for tests and icons, but task nav button layout, hover, active, disabled, radius, border, background, and mobile horizontal scrolling belong in `shared/styles/studio-workbench.css`, not duplicated in feature CSS.
- Agent and Channels feature CSS must keep one final owner block for each workbench shell, side rail, stage header, and command-lane row. Do not leave earlier layout blocks that only work because a later DuoYuan patch overrides them.
- Agent overview identity and insight panes are single-owner overview surfaces. Put their border, background, radius, and focus-strip behavior in their base blocks, not in later P1 patch selectors.
- Agent and Channels rail rows, list panels, and selected-object state rows are single-owner primitives. Put flat row borders, active fills, meta typography, and session row grids in the base selector block instead of a later cleanup selector.
- Channels stage sections, route shells, focus strips, and empty states are single-owner workbench surfaces. Do not create shared reset blocks that are later overridden by the final stage skin.
- Channels route tables are row-based work surfaces, not card lists. Keep `binding-table`, `binding-table-row`, and `binding-table-item` as single-owner selectors; do not restyle them later with cascade cleanup blocks.
- Creation, credentials, raw JSON, and advanced edits open in sheets or collapsed advanced sections.
- The active canvas owns the selected object's identity strip, one recommended action, forms, rows, and inspectors.
- Object workbench detail grids should use fluid `minmax(0, …)` tracks instead of fixed 320px/420px minimums inside the main canvas; fixed lower bounds can make Agent sessions, Channels routing, and Codex Stack install panes look broken once the shell rail consumes space.
- Route activation must refresh current data without destroying dirty drafts. Use `onActivated` for Agent, Channels, and Codex Stack pages, but skip refresh when a form/document has unsaved local changes.
- On narrow widths, the object selector becomes a drawer and the top task bar becomes a compact horizontal segmented row.

Codex Stack is a guided operations workbench, not an object-management page. Its shell should use a compact task rail with Status, Install/Repair, Agent Bridge, Route Models, and Logs. The first screen shows current route state and one next action. Chain maps, service grids, smoke matrices, environment references, and raw logs stay folded under advanced details or floating output sheets. Codex Stack uses the active `cs-workspace` task shell; stale unused shells such as `cs-workspace-grid` are deleted instead of being left as cascade patches. Task stack, task badge, status pill, and log mode selectors each have one workspace owner block. Log-console selectors must stay scoped under `.cs-log-console` when they restyle shared Codex Stack primitives such as `cs-info-chip`, `cs-status-pill`, `cs-chip-row`, `cs-actions`, or `cs-disabled-help`. Codex Stack extracted panel CSS keeps shared primitives single-owner: status pills, action rows, headers, form grids, disabled help, run/smoke grids, and install steps must live in one base selector block instead of being copied into every extracted panel section.

## DuoYuan Product-System Extraction

The useful reference is DuoYuan's product-system discipline, not its marketplace content:

- Buttons are a small finite vocabulary: `primary`, `secondary`, `danger`, `success`, `outline`, `ghost`; all are inline-flex, medium weight, `rounded-lg`, focus-ring capable, and disabled states lower opacity instead of changing layout.
- Inputs and selects are solid fields: white in light mode, `gray-800`-class solid panels in dark mode, visible borders, 40px-class height, labels above, helper/error text below, and opaque dropdown menus. Studio fields must not look like disabled translucent slabs.
- Modal and dropdown bodies are opaque panels with bordered sections. The page may dim; the sheet itself stays readable and does not inherit muddy glass.
- Cards are for repeated product/content records. Studio operational flows should translate the same surface discipline into rows, split inspectors, command lanes, tables, and sheets instead of card walls.
- Diagnostic facts use matrix/table surfaces, not equal-height metric-card grids. When a page needs many key/value facts, group them in one bordered data matrix with row separators, tabular numbers, and quiet hover/focus states.
- Dashboard signal summaries follow the same rule: use action rows, fact tapes, and compact readiness rows inside the system snapshot instead of standalone metric cards, decorative chart panels, or a separate mini-chart section.
- Motion is attached to cause and effect: hover colors, menu fade/scale, restrained active feedback. Permanent cursor effects, light trails, or decorative loops are out of scope for core Studio flows.
- The sky primary ramp is a theme-local choice. Studio maps the same contrast logic to OpenClaw mint/teal, while peach/amber/red/green stay semantic.

Studio's current token target is:

- Light canvas: `#fbfdfb` with crisp white panels and `#f8fbf8` / `#edf6f1` secondary fills. This keeps the product mostly white with mint-tinted depth, while avoiding pure-white glare, beige/sand drift, and the gray wash users disliked.
- Dark canvas: `#090d11` with `#101820` / `#15202a` / `#1b2934` panels. This keeps dark mode graphite, deep, and readable without pure black, blue glass, or mid-gray mud.
- Primary action: `#0f766e` in light mode and mint highlight in dark mode; no blue shell identity.
- Inputs/selects/dropdowns: shared `--control-*` tokens first, feature overrides only when a route needs a special full-height workspace.

## DuoYuan Control Clarity v5

The newest DuoYuan source pass checked `template-parts/components/input.php`, `select.php`, `button.php`, `tabs.php`, `modal.php`, and `src/css/app.css` against Studio's current controls. The design target is now stricter:

- Form fields must feel installed into the product, not painted onto a translucent panel. Use solid `--control-bg`, visible `--control-border`, a small `--control-shadow`, 42px-class height, and a 3px focus ring.
- Native `<select class="form-input">` and shared `StudioSelect` must share the same border, shadow, menu, hover, and focus vocabulary. A dropdown that looks like a browser default or a gray disabled slab fails the design.
- `StudioSelect` carries the same release states as native controls: `disabled`, `invalid`, `aria-invalid`, `aria-expanded`, opaque menu body, visible focus ring, and press feedback. Do not create page-local select skins to solve validation or busy states.
- Light mode fields stay white, but their borders are stronger mint-neutral (`--control-border`) so a white form on a near-white canvas remains readable without adding gray panels.
- Dark mode fields stay graphite, one step above the canvas, with mint border feedback. Do not brighten them into mid-gray glass.
- Dropdown menus are opaque sheets with `--control-menu-shadow`; blur is reserved for page dimming only.
- This control layer is shared design-system CSS. Do not solve input/select contrast by adding feature-local colors in Vue pages.

## DuoYuan Token Single Source v6

Studio's global theme must now behave like DuoYuan's small primitive layer: one authoritative `:root` token block plus one `html[data-theme="light"]` override block, placed directly after CSS imports and before global selectors. Legacy bootstrap theme blocks are rejected because they let light mode inherit stale dark aliases, make tests pass for the wrong reason, and hide visual regressions behind cascade specificity.

Rules:

- Keep all shared shell, surface, text, field, modal, button, and status aliases in the final DuoYuan token layer.
- Keep the token layer at the top of `style.css` immediately after `@import`; rules should consume tokens, not appear before the token source.
- Keep base global selectors single-owner. `body`, `body::before`, `body::after`, and `.app-container` should each have one base block; do not add later duplicate blocks to patch the shell canvas or route background.
- Keep the shell rail single-owner. `.sidebar` owns the flush rail surface, border, background, radius, and shadow policy; `.sidebar-rail` is a semantic class and must not become a second visual patch block.
- Reference-only token ramps are not shared primitives. Do not keep unused `--duo-gray-*`, `--claw-navy-*`, legacy `--gold`, one-off transparent accents, or shell fill aliases after they have no runtime consumers; promote only tokens that components actually read. Warm semantic styling uses `--peach`, `--warning`, and the compatibility alias `--warn`.
- Shared CSS variables must resolve. `--surface-soft` is the soft fill primitive; do not reintroduce stale `--surface-muted` or `--soft-shadow` aliases. Strict `var(--*)` references must be defined unless they are documented third-party runtime geometry variables.
- Control primitives are single-owner. `.primary-button`, `.secondary-button`, `.compact-button`, `.surface-tab`, `.form-input`, `.form-textarea`, native `select.form-input`, and `StudioSelect` must get their base size, border, background, focus, disabled, and shadow behavior from one shared primitive block; later duplicate override blocks are refactor debt because they make light/dark contrast depend on cascade luck.
- If light mode needs an alias such as `--surface-base`, `--field-border`, `--text-primary`, or `--shell-panel-fill`, define it explicitly in the light override instead of relying on an earlier compatibility block.
- Do not add another global `:root` palette block for a new feature. Add feature-local layout tokens inside feature CSS only when the token is not a shared visual primitive.
- Tests should fail when `style.css` contains multiple root theme sources. A visual token should have one owner so shallow and dark modes do not drift independently.

## DuoYuan Graphite v4

The current Studio shell uses DuoYuan's component grammar, but the color strategy is now an OpenClaw-specific graphite/mint translation. The latest reference pass rechecked `preview.html`, `tailwind.config.js`, `src/css/app.css`, and DuoYuan's `input.php`, `select.php`, and `card.php` components:

- The final token source is the top `Studio DuoYuan Ops` block in `apps/web-vue/src/style.css`. Legacy Atlas variables may remain temporarily for compatibility only when they are re-bound inside this source; the final `:root` and `html[data-theme="light"]` blocks must define every visible alias used by shell, modals, sidebars, controls, status chips, gateway/version pills, and logo chrome.
- Dark mode uses near-black graphite canvas (`--mono-bg: #090d11`) with solid panel steps (`--mono-panel`, `--mono-panel-2`, `--mono-panel-3`). It must not look like a flat black terminal or a blue-gray glass dashboard.
- Light mode uses a near-white porcelain app canvas (`--mono-bg: #fbfdfb`) with white work surfaces. Gray is reserved for disabled state and low-emphasis text; borders and secondary fills lean mint-neutral so panels, inputs, route headers, and sidebars do not become gray or beige.
- Shared aliases such as `--modal-*`, `--shell-*`, `--gateway-status-*`, `--version-chip-*`, `--logo-icon-*`, `--control-*`, `--surface-*`, and `--line` must resolve through the DuoYuan/OpenClaw token set. legacy Atlas/glass aliases must be re-bound before a feature is considered migrated.
- Inputs, selects, tab buttons, command rows, and floating sheets are solid surfaces. Translucency is only allowed for page backdrop dimming or subtle canvas ambience, not routine controls.
- A feature pass is incomplete if the dark theme looks acceptable but the light theme becomes gray, or if the light theme looks white but the dark theme loses visible borders.
- DuoYuan form controls are not glass: labels sit above, help/error text sits below, fields are solid `bg-white` / `dark:bg-gray-800` equivalents, dropdowns are opaque, and focus rings are visible. Studio `StudioSelect`, `.form-input`, editor controls, and command rows must follow this shape.
- DuoYuan component variants are finite. Studio should prefer shared button/status/input/select primitives and feature-owned layout CSS over page-local color tables or one-off `rgba(...)` variants.
- Migrated feature CSS must be token-only unless the literal is non-visual content such as a placeholder example. For visible chrome, no raw `rgba(...)`, hardcoded `#hex`, `--sky`, `--atlas`, or `--glass` in a migrated feature stylesheet.
- The final shared token layer must keep routine controls and shell panels on solid surfaces. In light mode, `--control-bg`, `--control-menu-bg`, `--select-option-bg`, `--button-secondary-bg`, `--tab-bg`, `--modal-panel-bg`, and `--topbar-bg` resolve to crisp white panel colors. In dark mode, those same routine surfaces resolve to graphite panel colors such as `--mono-panel`, while the sidebar may sit one step deeper on `--mono-bg` for navigation contrast. These tokens must not resolve to `rgba(...)`, `color-mix(... transparent)`, or near-background placeholders that make fields look disabled.

Studio translation rules:

1. Use **one app accent**: OpenClaw mint/teal. DuoYuan sky is a reference-only concept; new Studio feature CSS must use `--acc`, `--peach`, and semantic status tokens instead of `--sky`.
2. Main surfaces are solid. Gradients belong only to the app canvas, hero-like page introductions, or tiny status highlights.
3. Dark mode is graphite neutral (`#090d11`, `#101820`, `#15202a`, `#1b2934`) with clear borders. Avoid blue-gray panels and muddy glass that make controls blend together.
4. Light mode is white on a warm off-white canvas, with subtle mint/peach ambient tint only in the background. Avoid large gray panels unless they communicate disabled or secondary state.
5. Repeated data may use cards or rows; operational workflows should use split panes, step lists, command rows, tables, and sheets.
6. For forms, labels, input height, focus rings, disabled state, helper text, and dropdown menus are release-quality requirements, not polish.
7. Every visual change must be checked in both themes. A good dark-mode decision that produces a gray light-mode page is rejected.

Source-backed constraints:

- DuoYuan's root `style.css` is only a WordPress theme header; the actual visual contract lives in `src/css/app.css`, `tailwind.config.js`, `preview.html`, and `template-parts/components/*`.
- `.dy-btn`, `.dy-input`, `.dy-card`, `.dy-badge`, `.dy-alert`, pagination, comments, and form components are intentionally small primitives. Studio should map these into global tokens and shared CSS primitives, not duplicate one-off page styling.
- Inputs, selects, dropdowns, and modals are opaque `bg-white` / `dark:bg-gray-800` surfaces with visible borders and focus rings. Semi-transparent gray fields, muddy disabled-looking backgrounds, and low-contrast placeholder text are rejected.
- DuoYuan cards are useful for product lists and repeated content, but Studio workflows should prefer rows, split inspectors, and command lanes. A page made mostly of cards fails the Studio product-console target even if the colors match.
- DuoYuan's hero gradients, VIP gradients, and marketplace decoration are local marketing/product patterns. They must not become Studio's shell, setup, repair, or configuration language.

Current Studio translation guardrails:

- Operational toggles are **option rows**, not cards. Feature pages should use names like `*-option-row`, `*-entry`, `*-section`, `*-matrix`, and `*-sheet`; new `*-card` names require a repeated content record with real card semantics.
- Feature CSS must not depend on DuoYuan's sky primary or legacy Atlas/glass tokens. Use `--acc` for OpenClaw action emphasis, `--line` / `--border-subtle` for structure, and semantic `--danger` / `--warn` / `--success` for status.
- Global tokens must not expose legacy sky/purple aliases such as `--sky`, `--violet`, `--claw-sky`, `--mono-purple`, or `--mono-sky-glow`; these names invite new work back into the rejected blue/purple visual lane.
- Shared controls must not carry hardcoded blue fallbacks or blue-tinted active states. Buttons, choice chips, and `StudioSelect` must resolve through `--accent-primary`, `--acc`, `--peach`, `--control-*`, and `--surface`; no `rgba(77,153,255)`, `rgba(111,211,255)`, or nested `var(..., #0f766e)` fallbacks.
- Shared controls must not hand-tune raw white highlight overlays. Primary danger/safe variants, active theme switches, floating save docks, and similar elevated controls use `--icon-highlight-*` plus shared shadow tokens so light mode stays crisp and dark mode does not become chalky.
- Shared primitive fallback chains must not point at the legacy `var(--surface)` alias, `--field-*` compatibility aliases, or shell-specific panel/stage/highlight tokens. `StatusPill`, `StudioSelect`, shared rows, and reusable popovers use `--surface-raised`, `--surface-base`, `--button-secondary-bg`, `--modal-panel-bg`, and `--control-*` so they stay portable across light, dark, and feature shells.
- Shared avatar upload and cropper chrome is also a shared control surface. `avatar-components.css` must use `--surface-*`, `--modal-*`, `--control-*`, `--line`, `--text`, and semantic `--danger`; no local white/red `rgba(...)` crop overlays or hardcoded color literals.
- The shell brand mark is theme chrome, not a fixed image palette. `LogoMark.vue` must consume `--logo-mark-*` tokens and `.logo-icon` must use `--logo-icon-shadow`; no hardcoded SVG hex, local white `rgba(...)`, or blue/purple logo gradients that fight the DuoYuan graphite/mint shell.
- Shared operate workspace primitives are cross-feature chrome. `operate-workspace.css` must keep rails, stages, tag chips, capability chips, and summary pills on `--surface-*`, `--border-*`, `--line`, `--acc`, `--peach`, `--text`, and `--muted`; no local white/teal/amber rgba, raw hex, or legacy Atlas/glass tokens.
- Floating output sheets are a shared primitive: every command/log/health output window must compose `floating-output-dock`, `floating-output-sheet`, `floating-output-sheet__head`, `floating-output-sheet__actions`, and `floating-output-sheet__log`, with feature CSS limited to size variables and local labels. The sheet body stays opaque DuoYuan-style; do not reintroduce gray glass blur, feature-local gradients, or permanent output cards.
- Drawer and dialog sheets use shared `--modal-*` tokens for backdrop, panel, rows, borders, and shadow; form fields inside sheets use `--control-*`. Feature drawers must not hand-tune light-mode white/gray `rgba(...)` surfaces.
- Configuration workbench chrome is a token-only surface. Tabs, subsections, save docks, advanced sheets, fallback rows, and provider/model rows must use `--config-*`, `--surface-*`, `--modal-*`, `--control-*`, `--mono-shadow-*`, `--icon-highlight-*`, `--acc`, and semantic status tokens. Raw `rgba(...)`, hardcoded hex, raw `black` / `white` shadow fallbacks, and feature-local success colors such as `#26d69a` are not allowed in `config-workspace.css`.
- Config no longer owns an appearance/preferences route. Do not reintroduce `config-preference-*`, `config-section-grid-appearance`, `fallback-section`, or `fallback-header`; current fallback UI uses `fallback-list`, `fallback-row`, and provider/model toolbar primitives inside the active split inspector.
- Chat shell chrome is also token-only. The route frame, sidebar, thread canvas, modal/menu/drawer/inspector surfaces, toast layer, host-exec confirmation dialog, and mobile overlays resolve through global `--surface-*`, `--modal-*`, `--line`, `--acc`, and semantic status tokens. `chat-shell-workspace.css` must not maintain its own hardcoded light/dark palette.
- Chat composer chrome follows the same rule: slash sheet masks, attachment chips, upload pools, preview dialogs, send/stop buttons, scrollbars, and status colors resolve through `--chat-*`, `--modal-*`, `--button-*`, and semantic tokens. `composer-bar.css` must not carry raw hex or `rgba(...)` color values.
- Chat session filter popovers and mobile sheets inherit the chat shell theme. `session-filter.css` must not define its own light/dark palette table; local theme classes may only map back to global `--modal-*`, `--line`, `--text`, `--muted`, and `--acc` tokens.
- Chat conversation chrome follows the same release gate. Rendering settings, session menus, warning badges, thread scrollbars, mobile dock actions, composer fade, mobile sheets, and queue sheets resolve through `--chat-*`, `--modal-*`, `--warning`, `--danger`, and button/status tokens. `conversation-pane.css` must not reintroduce raw hex, `rgba(...)`, or decorative gradients.
- Chat overlay and record-browser chrome is now the reference migrated sub-slice for Chat. Agent picker masks, cascade menus, picker chips, record-browser masks, record-browser shadows, and search error states resolve through `--modal-backdrop`, `--modal-shadow`, `--modal-row-bg`, `--acc`, and `--danger`; these files must not reintroduce raw `rgba(...)`, hardcoded `#hex`, gradients, Atlas, sky, glass, or blurred backdrops.
- Chat v2 core feature CSS is now a token-only migrated family. Session rails, queue rail, slash command menus/dialogs, Markdown/live preview, resource attachments, message bubbles, composer, conversation pane, filters, record browser, inspector, and overlays must use `--chat-*`, `--modal-*`, `--mono-shadow-*`, `--warning`, `--success`, and `--danger`; no Chat v2 feature stylesheet may reintroduce visible raw `rgba(...)`, hardcoded `#hex`, decorative gradients, legacy sky/Atlas/glass tokens, or blurred glass backdrops. Markdown live-preview PNG export must resolve its canvas/offscreen background through `--modal-panel-bg`, `--chat-modal-bg`, or `--surface-base` instead of hardcoded white. `slash-export-session.ts` is a portable downloaded HTML artifact with embedded static palette and sits outside the running Studio UI token gate.
- Files workspace chrome follows the solid DuoYuan product-console rule. VueFinder toolbars, menubars, icon shells, editor drawers, and file rows use `--file-manager-*`, `--surface-*`, `--line`, `--text`, `--muted`, and `--acc` tokens. `files-workspace.css` must not reintroduce raw hex, `rgba(...)`, or local decorative gradients.
- Channels workspace chrome follows the same token-only product rule. Provider rails, account rows, binding tables, issue lists, quick-edit panes, save bars, and drawers must use shared `--surface-*`, `--line`, `--border-*`, `--acc`, `--peach`, and semantic status tokens. `channels-*.css` must not reintroduce raw hex, `rgba(...)`, local blue/amber/red literals, or decorative gradients.
- Skills, Dreaming, Agents, Dashboard, Cron, and Terminal are now reference migrated slices for this rule. Their drawers, risk/status chips, timelines, rails, readiness rows, output sheets, terminal masks, command logs, modal masks, and callouts resolve through `--modal-*`, `--surface-*`, `--line`, `--code-bg`, `--terminal-xterm-*`, `--acc`, `--peach`, `--warning`, `--success`, and `--danger`. New work in these files should fail tests if it reintroduces local glass color literals.
- Shared avatar editing chrome follows the same primitive path. Upload previews, cropper dialog, crop mask, crop frame, preview facts, clear/error states, and close controls resolve through `--modal-*`, `--control-*`, `--status-pill-danger-*`, and `--text-*`; `avatar-components.css` must not reach back to legacy `--surface`, `--line`, `--muted`, `--danger`, or generic shadow aliases.
- Plugin diagnostics, install entries, and preflight verdict panels are operation-feedback rows, not page-local cards. Their base surfaces resolve through `--modal-row-bg` / `--control-*`; warning and danger states resolve through `--status-pill-accent-*` and `--status-pill-danger-*`, not direct `--peach`, `--danger`, `--line`, `--surface`, or `--muted` aliases.
- System diagnostics follows the same rule: the system control tower must not add its own `::before` ambient gradient layer. Page ambience belongs to the shared shell canvas; System owns rows, sheets, action lanes, and solid diagnostic surfaces.
- Terminal xterm colors are part of the app theme. `TerminalConsolePage.vue` must build its xterm theme from resolved `--terminal-xterm-*` CSS variables, not from embedded hardcoded palettes such as blue/purple terminal themes. Terminal containers and session context bars should use the same solid xterm/surface tokens instead of local navy gradients.
- Runtime utility chrome in Operate, System, System Events, and Terminal must not use the legacy `var(--surface)` alias or shell-only panel/stage/highlight tokens. Use `--surface-base`, `--surface-raised`, `--border-subtle`, `--line-strong`, and modal/output-sheet tokens according to role.
- Data-heavy pages should compress facts into matrices and row groups. If a status value is not directly actionable, it should sit in a fact row or details sheet rather than becoming a standalone panel.
- Codex Stack is now a token-only migrated feature family. `codex-stack-workspace.css`, `codex-stack-dashboard.css`, `codex-stack-install.css`, `codex-stack-settings.css`, and `codex-stack-cc-connect.css` must keep visible chrome on DuoYuan/OpenClaw tokens; raw `#hex`, local `rgba(...)`, old sky/blue status pills, hand-tuned sheet shadows, the legacy `var(--surface)` alias, and shell-only `--shell-panel-*` / `--shell-stage-*` / `--shell-highlight` tokens are regression signals.
- Tests should protect these product rules directly: no stale `toggle-card` use inside feature pages, no `--sky`/`--glass`/Atlas variables in DuoYuanized feature CSS, and no old card-wall class names after a page has been migrated.

## Aesthetic Direction

Primary direction: operational console using DuoYuan's WordPress component discipline plus OpenClaw's XiaoQiu visual signature: clean Tailwind-style SaaS components, mint primary actions, graphite dark surfaces, crisp white light surfaces, rounded `lg/xl` controls, compact product cards only where repetition is the data model, and clear overlay sheets for search, logs, and command output.

This is not a landing page, brand showcase, or Dribbble exercise. Studio is a troubleshooting and control product for users who may be installing, repairing, or switching model routes under pressure. Visual quality matters, but it must reduce doubt rather than add spectacle.

Reference blend:

- DuoYuan WordPress theme: canonical component reference for the Studio skin. Borrow its sticky white/dark navigation, clean canvas, solid surfaces, visible borders, `rounded-lg/rounded-xl`, `shadow-sm`, concise dropdown/search overlays, and category/status chips. Translate `sky-600/sky-700` primary actions into OpenClaw mint/teal for Studio.
- DuoYuan component files: button, input, card, product-card, tabs, select, modal, badge, empty, skeleton, and pagination patterns are preferred component references.
- Historical Studio backup: borrow only shell ergonomics and route stability. Do not keep its heavy grey/mint glass as the primary style.

## DuoYuan Implementation Readout

- `src/css/app.css` is intentionally primitive-first: `.dy-btn`, `.dy-input`, `.dy-card`, `.dy-badge`, `.dy-alert`, pagination, and comments are short wrappers over a stable Tailwind neutral ramp. Studio should preserve that shape by moving repeated UI decisions into shared tokens and feature CSS, not into one-off Vue style blocks.
- `preview.html` shows the useful interaction grammar: sticky utility navigation, compact category/action rows, `rounded-lg` controls, `rounded-xl` repeated content, visible focus rings, hover backgrounds, and image/metadata hierarchy. Studio should translate this into command rows, split panes, tables, and floating sheets; it should not copy the ecommerce hero or VIP decoration.
- `template-parts/global/block-panel.php` is the best overlay reference: fixed side sheet, opaque `bg-white` / `dark:bg-gray-800`, bordered header/footer, search input, category chips, row actions, and no translucent page chrome. Studio health checks, install logs, command output, file details, command palette, and confirm dialogs should follow this sheet grammar.
- `template-parts/home/index-v2-simple.php` shows dense sections succeeding only when each section has one job and one dominant scan path. Studio pages should avoid several equal cards competing for attention; use one next-action lane, then one work surface, then folded diagnostics/history.
- DuoYuan uses gradients only for marketing hero, VIP labels, or small icon/status decoration. Studio may keep subtle canvas ambience and small file/status icon treatments, but form controls, tables, route frames, drawers, menus, and editor shells must be solid token surfaces.
- File manager and code editor surfaces are part of the product shell. Their colors, search bars, context menus, modals, and CodeMirror theme values must resolve through global DuoYuan/OpenClaw tokens so Chat, Files, Config, and Terminal feel like one product.
- Raycast: command-palette discipline, hairline borders, compact controls.
- Linear-style SaaS consoles: quiet hierarchy, reliable form controls, and dense-but-readable tables.
- Apple-style subtraction: fewer visible containers, more confidence through spacing and alignment.

Avoid:

- Generic purple-blue AI gradients as the main identity. Do not turn the entire app blue; Studio's product accent is mint/teal.
- Flat grey dark mode that makes text hard to read. Dark must have a clear graphite canvas, solid graphite panels, and visible borders.
- Washed-out light mode where page background, panels, controls, and table rows merge together. Light must use white surfaces on a subtle off-white canvas.
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

- Frontend Design Pro Demo: use style families to break generic AI defaults. For Studio, borrow Swiss grid discipline, product-SaaS restraint, and clear component systems; reject neon cyberpunk, pure OLED luxury, and loud maximalism for core flows.
- UI UX Pro Max: accessibility, touch targets, loading/error states, and responsive behavior outrank decorative style. Treat WCAG, keyboard access, and clear feedback as release gates.
- Awesome Claude Design and Awesome DESIGN.md: describe UI through reusable tokens, component rules, previewable examples, and do/don't constraints. Studio should have one design brain, not scattered component taste.
- Anthropic warm editorial: useful for warmth and calmness, not for turning the app into a marketing page.
- Bencium Controlled mode: default for production; Innovative mode only for isolated prototypes.
- Taste Skill sliders: use explicit variance, density, and motion budgets before redesigning.
- SuperDesign: useful for producing alternate concepts and wireframes in parallel, but final Studio UI must be implemented in the existing Vue/Nuxt UI stack.
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
- Glass is not a shell primitive. Do not expose `--glass-*` tokens, do not use backdrop blur on global controls, sidebars, inputs, banners, or route stages. Floating sheets and modals may dim the page, but their bodies stay opaque DuoYuan surfaces with visible borders and small shadows.
- For concept exploration, generate at least two alternatives before committing to a major page redesign: Controlled Ops and Warm Editorial Ops. Keep the better structure; do not merge both aesthetics.

## Page Architecture

Every page should map to one of these patterns. If a page does not fit, redesign the information architecture before styling it.

## Full Feature Refactor Matrix

The Studio redesign is a product-wide layout replacement, not a color pass. Current Vue pages remain useful as API and state wiring, but their page chrome is not authoritative.

Global shell direction:

- The left rail is the only persistent primary navigation.
- The topbar is a compact utility bar: lightweight workspace breadcrumb, theme, and language. It must not become a second navigation surface or a second page title.
- The topbar is not a floating card. It uses a solid DuoYuan-style utility surface with a bottom rule only; no route-wide radius, panel shadow, or framed card chrome.
- The visible topbar identity is one-line and low-emphasis: group label plus route path. The full page title remains in the page header; if the route title is needed for assistive context, keep it in `aria-label`, not as another visible headline.
- Standard routes use the app canvas directly. Avoid wrapping every route in a giant bordered stage; feature pages own the real surfaces.
- The shared route stage is a layout host, not a panel. It may define grid/flex sizing and overflow behavior, but standard route stage visual chrome must remain borderless, transparent, zero-radius, and shadowless.
- Shell layout primitives should not rely on late DuoYuan overrides for their target spacing. `.shell-main`, `.shell-layout`, `.shell-main-stage`, and `.shell-route-stage` keep one base definition for route inset, shell gap, and transparent stage chrome; media rules only add real responsive behavior.
- Page identity rows are not cards. Use a light accent rail plus a bottom rule for title/context/actions; do not wrap every route header in filled panels, radius, and shadows.
- Shared option rows, setting blocks, status banners, and empty states are lightweight row surfaces by default. They may use a border and solid fill, but not default card shadows; feature pages must opt into elevation only when it communicates a real overlay or framed tool.
- Shared primitives should have one visual source of truth. Early/global utility blocks may define layout, padding, typography, and text color; border, radius, background, and shadow for shared rows/banners/empty states belong in the final DuoYuan primitive layer.
- Chat, files, and terminal keep their special full-height shells in feature CSS only. The global shell may attach explicit boolean classes for known workspace modes, but it must not emit generic `route-surface-*` hooks. Full-height flex stages, workspace padding, route-stage radius, and overflow rules stay with `chat-shell-workspace.css`, `files-workspace.css`, and `terminal-workspace.css`; these shells use the shared `--studio-workspace-radius` 12px product radius fallback, not a separate 18px oversized frame.
- Chat, files, and terminal controls, radius, surface contrast, and overlays must still follow DuoYuan component grammar.

Feature mapping:

| Feature | Target Pattern | Layout Rule | Current Refactor Priority |
| --- | --- | --- | --- |
| Dashboard | Workspace Strip | current state, one recommended action, recent route facts | P0 |
| Codex Stack | Setup / Repair Wizard + Runtime Console | guided setup, route choice, smoke status, floating output | P0 |
| Config | Split Inspector | domain list left, selected model/gateway/security editor right, save-and-validate strip | P0 |
| System | Health Action Lane + Data Review | health action lane first, diagnostics/events as review surfaces | P0 |
| Agents | Split Inspector | roster rail, selected agent stage, deep pages inside stage | P1 |
| Channels | Split Inspector | provider/account rail, selected provider or account stage | P1 |
| Cron | Split Inspector + Runtime Console | schedule rail, selected job editor, run output sheet | P1 |
| Skills | Data Review + Split Inspector | installed/market/local modes as segmented controls; table first, detail drawer second | P1 |
| Plugins | Data Review + Setup Wizard | plugin index, install/update workflow, preflight output sheet | P1 |
| Files | Runtime Workspace | one full-height explorer surface, selection inspector/drawer, no dashboard chrome | P2 |
| Terminal | Runtime Console | output-first, scoped controls, command/session drawer | P2 |
| Chat | Conversation Workspace | session rail, conversation stage, inspector drawer, composer fixed to context | P2 |
| Dreaming | Data Review | memory list/review/editor, less decorative mood surface | P2 |

Batch refactor rule:

1. Replace shell/page scaffolding first, then feature-specific content.
2. Move a feature to one target pattern before polishing individual controls.
3. When a feature has a list and an editor, use split inspector by default.
4. When a feature runs commands or streams output, use the shared floating output sheet primitive or a runtime console, never a permanent output card or a feature-local sheet skin.
5. Add tests that protect the pattern, not just one CSS value.

Implementation status:

- P0 scaffolds are in progress: Config now uses `config-workspace-strip`, `config-rail`, `config-tab-stage`, and `config-active-tab-matrix`; Dashboard uses `home-workspace-strip` with `home-action-list` rows; System uses `system-action-list` rows inside the health rail; and Codex Stack uses `cs-runtime-strip` for the dashboard overview. These are strip/action-lane/resource-stage contracts, not command-panel or nested page-shell contracts.
- Dashboard/home matrix surfaces are feature-owned data-review primitives. `dashboard-workspace.css` must use `--surface-base`, `--surface-raised`, `--border-subtle`, `--line`, and semantic status tokens; it must not depend on shell-internal `--shell-panel-*`, `--shell-stage-*`, `--shell-highlight`, or the legacy `var(--surface)` alias. Dashboard must keep the first screen to three zones: situation, common action entry, and system snapshot; readiness signals live as compact rows inside snapshot, not as a separate chart block.
- Config must not reintroduce nested `page-shell config-section-grid` inside the active stage or any `*ConfigTab.vue` child component. Config tab roots use `config-tab-stage config-section-grid`; old `config-tabs` / `config-tab-group` / `config-tab` rail classes, card-like active-tab facts, and direct `--shell-*` / `var(--surface)` surface aliases in `config-workspace.css` are forbidden.
- P1 scaffolds are in progress: Agents, Channels, Cron, Skills, and Plugins must use DuoYuan-style solid workspaces, not late Atlas/glass overrides. The current rule is: rail/background `--surface-raised`, stage/work surface `--surface-base`, separators `--line` or `--border-subtle`, small mono shadow, no Atlas, `--glass-*`, or direct `--shell-panel-*` / `--shell-stage-*` / `--shell-highlight` token references in these feature CSS files. Agents and Channels use the shared `operate-stage-strip` for the selected item header; do not reintroduce `operate-command-panel`.
- Skills and Plugins no longer use top-heavy command-panel slabs as their first screen. Their route intro is a compact workspace strip: short status copy, one accent rail, and a dense mode/runtime strip that leads into the real table, split inspector, or install workflow. Do not reintroduce `skills-command-panel`, `skills-mode-switch`, `plugins-command-center`, or `plugins-runtime-matrix`.
- Skills, Files, and Cron must not use the legacy `var(--surface)` alias in feature CSS. Use `--surface-base` for primary work areas, `--surface-raised` for chips/rows/subpanels, `--surface-overlay` for floating notices, `--button-secondary-bg` for inactive tab buttons, and `--modal-panel-bg` for modal bodies.
- Plugins surfaces are tokenized to DuoYuan primitives: page/stage surfaces use `--surface-base`, rails and chips use `--surface-raised`, inactive tab controls use `--button-secondary-bg`, and semantic notice blocks mix `--peach`, `--danger`, or `--success` into `--surface-base`. Do not use the legacy `var(--surface)` alias in `plugins-workspace.css`; it makes the light theme drift gray and the dark theme drift into glassy mid-tone slabs.
- Config, Dashboard, and System should not reintroduce `config-command-panel`, `home-command-*`, `system-command-*`, or `system-overview-command-panel`; use workspace strips, action rows, fact tapes, and floating output sheets instead.
- Agents no longer uses a selected-agent `command-center` slab or stream-pane cards on the overview screen. Keep the roster rail persistent, then use a single `agents-identity-strip` for current-agent context plus compact `agents-insight-pane` blocks for session/binding facts. Agents chrome, pills, tabs, modals, rail avatars, and binding rows now resolve through `--surface-base`, `--surface-raised`, `--modal-panel-bg`, `--button-secondary-bg`, and semantic status tokens only; do not reintroduce `agents-command-center`, `agents-stream-pane`, `agents-overview-section--primary`, or direct shell/glass surface aliases in `agents-workspace.css`.
- Channels provider overview follows the same strip rule. Use `channel-provider-strip` for the selected provider context, `channel-provider-facts` for the key/value lane, and the account/issue surfaces below it. Do not reintroduce `channel-command-center`, `channel-command-facts`, or command-card language for the provider overview.
- Channels feature CSS is migrated to explicit solid surface tokens. `channels-workspace.css`, `channels-pages.css`, and `channels-account.css` must not use the legacy `var(--surface)` alias or shell-specific `--shell-panel-*`, `--shell-stage-*`, or `--shell-highlight` tokens; choose `--surface-base`, `--surface-raised`, `--surface-overlay`, `--button-secondary-bg`, and `--line-strong` by component role.
- P2 remains open but substantially converted: Files use the full-height workspace shell with DuoYuan surface tokens, and file details now follow DuoYuan's `block-panel.php` side-sheet pattern instead of a centered modal. Terminal is now the reference runtime-console slice with tokenized xterm colors, floating output sheets, and no local `rgba(...)`, `#hex`, navy gradients, Atlas, sky, or glass residues in its feature CSS. Chat v2 now has token-only feature CSS across shell, session list, composer, conversation pane, message bubbles, resources, Markdown/live preview, queue rail, slash command surfaces, overlay surfaces, record browser, and inspector; live-preview image export also uses resolved theme surfaces rather than a fixed white canvas. Remaining Chat work is product-layout review and browser visual acceptance, not palette residue removal. Dreaming is now a data-review workbench slice: runtime enable/repair/refresh stays in the top runtime area, grounded replay actions live once in `dreaming-grounded-actions`, and status plus REM preview are grouped in `dreaming-review-board`. Do not reintroduce `dreaming-ops-strip`, `dreaming-stage__action-well`, centered Files details modals, or duplicate action clusters.
- Do not solve unfinished pages by appending another visual layer. Delete or replace stale feature CSS so the final rule that wins in the cascade is the intended design rule.

### Setup / Repair Wizard

Use for Codex Stack install, reinstall, repair, smoke validation, CPA/GPT switching, and gateway recovery.

- Header: current state and one recommended next action.
- Body: stepper or vertical command sequence with clear pass/fail state.
- Details: collapsed diagnostics, service output, raw logs, and manual commands.
- Output: floating log sheet with copy, retry, and close controls.
- Forbidden: permanent log cards, service-card walls, watchdog controls without context.

### Runtime Strip

Use for dashboard and high-level operational status.

- Header: ready / needs action / blocked state, not generic metrics.
- Primary area: one focused action lane.
- Secondary area: recent changes, warnings, and route facts.
- Details: drill-in panes and compact data matrices, not same-level cards.
- Forbidden: equal cards for everything, duplicate risk labels, decorative stats.

### Split Inspector

Use for models, gateways, accounts, channels, config, files, agents, and queues.

- Left pane: searchable object list or grouped navigation.
- Right pane: selected object detail, editor, or runbook.
- Footer or top strip: save/apply/test actions.
- Details: advanced fields behind disclosure.
- Forbidden: nested cards inside cards, multiple unrelated edit panels visible at once.

### Runtime Console

Use for terminal, service logs, health output, and long-running jobs.

- Main pane: streaming output with readable monospace scale.
- Side or top strip: filters, copy, retry, stop, and scope.
- Output should be visually separate from setup content but not become a page wall.
- Forbidden: tiny low-contrast logs, output hidden behind dense cards, decorative terminal chrome.

### Data Review

Use for history, events, jobs, and records.

- Table/list first, inspector second.
- Density may rise to 6/10, but row height and contrast must remain readable.
- Bulk actions must be explicit and reversible when possible.
- Forbidden: metric cards replacing actual searchable records.

## Component Composition

Primitive hierarchy:

1. Shell: sidebar rail, top identity bar, route stage.
2. Workflow surfaces: wizard, runtime strip, split inspector, runtime console.
3. Action rows: primary action, secondary actions, risk note.
4. Disclosure: advanced detail, raw output, manual commands.
5. Repeated items: rows, strips, tables, compact repeated cards only when repetition is the data model.

Rules:

- A page may have one hero-level runtime strip, not several competing panels.
- Cards are allowed only for repeated entities or a genuinely framed tool.
- Replace status-card clusters with compact state strips or rows.
- Replace "learn how this works" copy with inline labels, helper text, and progressive disclosure.
- Avoid local nav when the shell already provides route navigation.
- Keep controls near the thing they affect.

## Interaction Model

- Primary actions must show loading and completion feedback.
- Failed actions must state what failed, why it matters, and what to do next.
- Dangerous actions must describe the consequence before execution.
- Health checks and repair jobs must keep the user on the same page and show output in a floating sheet.
- Saving a model/gateway route should offer immediate validation and a clear choice between CPA route and official ChatGPT/Codex account route when relevant.
- Disabled controls must explain the condition that blocks them.
- Keyboard users must be able to reach every primary action, dialog, tab, and command.

## Visual Language

- Use generous negative space in first-use flows, not empty decoration.
- Use hairline dividers, section rhythm, and alignment before adding containers.
- Use tinted shadows only for elevated overlays, not every surface.
- Use one accent per screen, preferably OpenClaw mint/teal. Warm peach/amber is for warnings, premium markers, or secondary emphasis.
- Use icons as quick recognition aids, not as decoration.
- Use tabular/monospace figures for ports, timings, versions, checks, and process IDs.
- Use DuoYuan component neutrals as the system, but tint the Studio canvas with the OpenClaw palette: white panels on warm off-white in light mode, graphite panels in dark mode, and one deliberate mint action lane per screen.
- Use animation only for state transition, progress, focus, or hierarchy.

## DuoYuan Component Translation

Shared primitives should map DuoYuan components into Studio semantics:

- DuoYuan `.dy-btn` -> Studio `.primary-button`, `.secondary-button`, `.danger-link`, `.compact-button`.
  - Base: inline-flex, 40-44px height, 8-10px radius, medium weight, visible disabled opacity, focus ring.
  - Primary: solid teal `700` in Studio, because white text on brighter mint is marginal; hover uses teal `800`.
  - Secondary: white/gray-800 surface with gray border, not tinted glass.
- DuoYuan `.dy-input` / select -> Studio `.form-input`, `.form-textarea`, `.select-input`, `StudioSelect`.
  - Labels are visible, helper/error text sits directly below the field, placeholder contrast must pass readability checks.
  - Menus are solid white or gray-800 panels with border and shadow; blur is only for modal backdrops.
  - `.form-field` is layout only. Do not wrap every label/input pair in a bordered card; the input itself provides the affordance.
- DuoYuan `.dy-card` -> Studio repeated-item surfaces only.
  - Use `rounded-xl`, small shadow, visible border. Avoid card nesting and avoid equal card walls for workflows.
- DuoYuan dropdown/modal -> Studio command palette, confirm dialog, output sheet, and floating log sheet.
  - Overlay panels use shadow + border + solid surface, not frosted page sections.
  - Motion is fade/scale or slide sheet, 150-300ms, with reduced-motion support.
- DuoYuan tabs -> Studio top tabs or segmented controls.
  - Use mint-tinted selected backgrounds, not heavy gradient pills.
- DuoYuan skeleton/empty -> Studio loading/empty states.
  - Skeletons match the target list/table shape.
  - Empty states show one next action, not explanatory essays.

## Redesign Execution Order

1. Codex Stack install/repair/control: first-use workflow, CPA/GPT route clarity, smoke validation, floating logs.
2. Dashboard: one current-state runtime strip, no metric/card wall.
3. Config/model/gateway pages: split inspector with save-and-validate flow.
4. Channels/accounts: list-detail inspector and clear binding state.
5. Terminal/logs/events: runtime console and data review patterns.
6. Chat/files/agents: migrate remaining local styles and align shells after core operations are coherent.

For each page:

1. Identify the page architecture pattern.
2. Delete redundant cards, copy, nav, and stale context panels first.
3. Move CSS into the feature stylesheet before visual work grows.
4. Implement loading/error/disabled states together with the layout.
5. Verify dark and light mode together.

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

- Canvas: `#090d11`, `#0e141a`, `#121b23`
- Panel: `#101820` and `#15202a`
- Raised surface: `#1b2934`
- Border: `rgba(238, 245, 240, 0.16)` and mint-tinted focus borders
- Primary text: `#f6f8f6`
- Secondary text: `#d4ddd9`
- Muted text: `#96a7a8`
- Primary accent: `#0f766e`; bright mint `#79ead6` is for focus, active lanes, and low-opacity glow.
- Focus ring: `rgba(125, 235, 215, 0.24)`
- Warm/VIP accent: `#f6c177` / `#f59e0b` only for warnings, premium markers, or secondary emphasis.
- Success: `#16a34a`
- Danger: `#ff8f9a` / `#dc2626`
- Rule: dark mode follows DuoYuan's structure but OpenClaw's color signature: graphite canvas plus solid graphite panels, not a blue-gray glass overlay.
- Rule: page backgrounds may carry low-opacity mint/peach light. The visible product should still read as dark neutral canvas plus solid work surfaces.
- Rule: forms, rows, logs, dropdowns, and tables must be solid enough for long reading.
- Rule: sidebars in dark mode use a clear deep rail, mint active lane, visible border, and no washed-out frosted layer or active gradient smear.
- Rule: dark surfaces should use small shadows and borders for hierarchy; avoid large dark blur shadows that make the whole page look muddy.

Light mode:

- Canvas: `#fbfdfb` with white top surfaces, not a gray wash or beige field.
- Panel: `#ffffff`
- Soft surface: `#f8fbf8` / `#edf6f1` and mint mist only as subtle emphasis.
- Border: `#dce8e2` / mint focus borders
- Primary text: `#111827`
- Secondary text: `#344256`
- Muted text: `#6f7f8e`
- Primary accent: `#0f766e`; bright mint is not used for white-text buttons.
- Focus ring: `rgba(15, 118, 110, 0.18)`
- Warm/VIP accent: `#d97706` / `#ffd6a5`
- Success: `#16a34a`
- Danger: `#dc2626`
- Rule: light mode should feel clean like DuoYuan/Tailwind SaaS, not hospital-white glare and not muddy grey.
- Rule: the page canvas can be off-white, but cards, tables, forms, and dropdowns must be clear white with visible borders.
- Rule: avoid grey-on-grey controls; every input, select, tab, and row must have enough edge contrast.
- Rule: light mode may use white as the main surface. The canvas is warm off-white; depth comes from borders and small shadows, not random gray panels.

Color rules:

- Use one primary accent per view. Secondary colors are for semantic state only.
- Do not mix warm and cool grey ramps casually; all neutrals should be tinted by the Studio canvas.
- Avoid raw hex in feature components. Promote repeated values to semantic tokens.
- Text/background pairs must be readable in both themes before a palette is considered acceptable.

## Layout Rules

- First screen should answer: current state, recommended action, important route/model facts.
- Primary navigation has exactly one visible owner: the left Studio rail. The topbar is only for low-emphasis route context, theme, and language.
- The command palette is for commands and global preferences, not a second page-navigation menu.
- Health checks, install logs, and command output should open in floating dialogs, not become permanent card walls.
- Installation/repair pages should act like a guided wizard: status, next action, advanced details collapsed.
- Dashboard surfaces may be dense only after the user opens details.
- Use the Codex Stack task rail for major stack sections; avoid adding a second top-tab strip inside already side-nav-heavy views.
- Cards are for repeated items or framed tools. Use panes, strips, and inline command rows for workflow steps.
- Prefer split panes, command rows, progressive sheets, and floating logs over card grids.
- Do not duplicate navigation in side rail, top bar, and command/search surfaces.
- Context panels are removed unless they provide actionable state or editing controls.
- Avoid equal three-column card rows. If three items are required, use hierarchy, split columns, or a matrix with a clear dominant action.
- Keep Studio shell proportions close to product software, not marketing pages: compact 60-64px top identity rows, 40-44px controls, 8-12px radii, and 10-18px section rhythm.
- Sticky save docks, inline action bars, row matrices, and non-modal workflow surfaces use the shared 8-12px product radius. Larger radii are reserved for true modals, side sheets, media previews, or hero-like panels.
- Use DuoYuan-style responsive collapse rules: grids collapse before text compresses, side/inspector panes become sheets, and primary actions remain visible.

## CSS Ownership

- `apps/web-vue/src/style.css` is the shared design-system boundary: Tailwind import, semantic tokens, app shell, and reusable primitives only.
- Page-specific selectors should not be added to the global Atlas layer when touching a page. Move them into a feature stylesheet or the owning component and delete stale global duplicates.
- Large feature pages should graduate to feature CSS files when the local style block becomes hard to scan or when selectors are shared across sibling components. Preferred names are domain based, for example `plugins-workspace.css`, `dashboard-workspace.css`, or `codex-stack-workspace.css`.
- New Vue single-file component style blocks are not allowed for page or feature work. Use feature CSS files first; compact one-off component styles need an explicit cleanup reason and must not become the default.
- Static template inline styles are not allowed. Use feature classes and shared tokens for spacing, grid, flex, radius, surface, color, and border decisions.
- Dynamic `:style` is allowed only for runtime geometry that cannot be represented as a stable class: progress width, portal/menu position, drag/crop coordinates, CSS custom-property handoff from measured state, virtualized timeline transform, z-index arbitration, or user-controlled preview scale. If a value is a design choice, it belongs in CSS.
- New dynamic `:style` exceptions must be added to the system test with a short rationale naming the runtime category. A filename-only allowlist is not enough.
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

## DuoYuan Refactor Readout

- Chat shell, composer, session filter, conversation pane, and message bubble chrome now resolve through shared Chat/OpenClaw tokens instead of local hex, `rgba`, or decorative gradients.
- Message bubbles should behave like DuoYuan content blocks: solid readable surface, restrained 8-12px radius, tokenized hover depth, semantic success/warning/danger colors, and no per-component palette table.
- User-message attachments, inline chips, blockquotes, code pills, media preview dialogs, and copy/error states must inherit from `--chat-user-bubble-text`, `--chat-line`, `--chat-code-bg`, `--modal-backdrop`, `--modal-shadow`, `--warning`, and `--danger`.
- Code highlighting is part of the product theme, not an imported dark palette island. Map highlight roles to semantic tokens before adding new syntax colors.
- Preview/media backgrounds can be solid code/surface tokens. Do not reintroduce raw black or pure white in message preview chrome unless it is isolated content inside an iframe.
- System console light-mode overrides must not hardcode pure white, Tailwind gray borders, or mint fills. Route frames, command rows, overview matrices, tabs, chips, and output sheets use `--surface-*`, `--line`, `--modal-*`, and `--accent-primary` tokens so light mode stays crisp without becoming a gray/white patchwork.
- Shared confirmation dialogs and the command palette use the modal token family end to end: `--modal-backdrop`, `--modal-panel-bg`, `--modal-panel-bg-strong`, `--modal-row-*`, `--modal-border`, `--modal-shadow`, `--control-*`, and semantic tone tokens. They are shared operational sheets, not feature-specific glass overlays, and they must not depend on legacy `--surface-overlay`, `--border-strong`, `--shadow-popover`, `--acc`, `--line`, or `--muted` aliases.
- Shared drawer primitives use the same modal surface family as floating logs and confirmation dialogs: `--modal-backdrop`, `--modal-panel-bg`, `--modal-row-bg`, `--modal-border`, `--modal-shadow`, and `--control-*`. They must not depend on `--surface-overlay`, shell-stage fallbacks, transparent row fills, or legacy accent aliases.
- Shared button controls are single-owner primitives: base sizing/focus/press behavior lives in the combined `.primary-button`, `.secondary-button`, `.danger-link`, `.compact-button`, `.surface-tab` block; compact, danger, and active-tab variants live beside that block. Destructive and safe primary actions must use semantic `--danger` / `--success` plus modal/control borders, not legacy `--surface`, `--line`, or `--mint` aliases.
- Shared choice controls (`.choice-chip`, `.choice-pill`, and credential reveal toggles) are form controls, not badges. Base, hover, focus, active, and disabled states resolve through `--control-*`, `--button-secondary-*`, `--mono-accent`, and `--text-*`; active selection uses OpenClaw mint, while peach remains reserved for warning or premium semantics.

## Verification

Every meaningful visual pass must produce:

- Desktop dark screenshot for milestone visual reviews.
- Desktop light screenshot for milestone visual reviews.
- At least one Codex Stack screenshot for Codex Stack visual milestones.
- Console check for frontend errors.
- Typecheck before commit.

Do not repeatedly take screenshots during small CSS/token edits unless visual evidence is needed. For major style direction changes, show the user the running preview and summarize the exact design choice before continuing deeper.
