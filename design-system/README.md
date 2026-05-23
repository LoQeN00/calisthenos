# Kalisthenos — Design System

A design system for **kalisthenos** (stylized lowercase), a Polish-language calisthenics coaching SaaS. Trainers (Trenerzy) build personalized progression plans for their clients (podopieczni); clients work through the plans and log every set with a perceived-difficulty rating. The product feels closer to a calm productivity tool than a hyped-up fitness app — clean canvas, deliberate type, lime-green moments of energy.

> **Note on naming.** The folder you imported is spelled `kalistenos/` (no `h`); the product spells itself **kalisthenos** (with an `h`). Use the latter everywhere user-facing.

---

## Sources

This design system was derived from a single attached source — a bundled HTML prototype of the full trainer + trainee app.

- **Codebase / prototype:** `kalistenos/kalisthenos.html` (mounted local folder). A self-unpacking React-on-Babel SPA. Unpacked source lives under `_src/unpacked/` for reference (do not edit).
- No Figma file. No marketing site. No separate mobile/native code.

The prototype contains the full token system, components, icon set (line, Lucide-style, hand-rolled), seed data with realistic Polish copy, and screens for both roles. Everything in this system is faithfully lifted from there.

---

## Index

| File / folder | Purpose |
| --- | --- |
| `README.md` | This file. Brand, content + visual fundamentals, iconography, manifest. |
| `colors_and_type.css` | Single source of truth for color + typography CSS vars and base type styles. Import everywhere. |
| `SKILL.md` | Agent-Skill manifest for Claude Code or any agent using this system. |
| `fonts/` | The three webfonts (DM Sans, Space Grotesk, JetBrains Mono) as subsetted woff2. |
| `assets/` | Logos, icon set (`icons.jsx`). |
| `ui_kits/web-app/` | High-fidelity React recreation of the full kalisthenos web app. Both trainer + trainee surfaces. |
| `preview/` | Static design-system cards (tokens, type, components) rendered for the review pane. |
| `_src/unpacked/` | Original unpacked prototype source. Read-only reference. |

---

## Product context

**One product, two surfaces, one shell.** The same web app serves trainers and trainees — same chrome (top bar, side nav, main canvas), different navigation, different views. A user picker in the top-right swaps roles for the demo.

**Trainer surface (Trener):**
- **Pulpit** — Dashboard. Client list + recent sessions feed.
- **Podopieczni** — Clients. Per-client detail, workout history, body photos.
- **Biblioteka ćwiczeń** — Exercise library. Each exercise has a demo video tile, unit (REPS / SEC), tags, description.
- **Plany** — Plans. Versioned per client; status: active / draft / archived. The plan editor is the heart of the trainer workflow.

**Trainee surface (Podopieczny):**
- **Mój plan** — My plan (active plan summary).
- **Sesje** — Sessions list from the active plan.
- **Historia** — Logged sessions, each set + perceived difficulty 1–10.
- **Sylwetka** — Body photos uploaded for the trainer to review.

The taxonomy is what makes the app: **Plan → Session → Block (single or superset) → Exercise → Sets**. Every set you log has `reps` (or `sec`) and a `diff` rating 1–10 — that 10-step difficulty picker is one of the signature components.

---

## CONTENT FUNDAMENTALS

### Language
**Polish, always**, for the product surface itself. English only appears as exercise terminology (Pull-up, Muscle-up, Dragon Flag, Front Lever, Pistol Squat) — these are the calisthenics lingua franca and stay untranslated. If you mix Polish copy with an English exercise name, that's correct.

### Voice
**Quiet, professional, peer-to-peer.** Speaks to its user like a trainer talks to a serious athlete — direct, knowledgeable, no hype. Never gamified, never motivational-poster.

- Uses second-person familiar ("Twoja przestrzeń", "Twój plan") rather than formal Pan/Pani. The trainer-trainee relationship is close.
- Trainer-authored exercise descriptions are **technical, terse, imperative**: "Łopatki schowane, broda nad drążkiem." ("Shoulder blades tucked, chin over the bar.") No filler.
- Session notes from athletes read like a journal entry: short, honest, no exclamation marks for hype. Real example: *"Mocno czuć łapy. Front lever idzie do przodu."* ("Forearms really feel it. Front lever is coming along.")

### Casing
- **Brand name** `kalisthenos` is **always lowercase**, even at the start of sentences.
- **Headings** use sentence case: "Pulpit", "Nowy plan", "Biblioteka ćwiczeń". Never Title Case.
- **Eyebrows / labels / badge text** are mono and UPPERCASE: `REPS`, `SEC`, `AKTYWNY`, `DRAFT`, `ARCHIWUM`.
- **Buttons** are sentence case: "Nowy plan", "Dodaj ćwiczenie", "Zresetuj dane demo".

### Numbers + units
Every quantitative value uses **JetBrains Mono with tabular figures** (`font-feature-settings: "tnum"`). Sets/reps render as plain numbers (`5×8`, `3×15s`). Time is `mm:ss` (`0:42`). Rest is `120s`. Difficulty is `1–10`. Dates are written conversationally: *"3 dni temu"*, *"wczoraj"*, *"20 maj 2026"*.

### No emoji
Zero emoji in the product surface. No 🔥 streaks, no 💪 motivation, no ✅ checks. All status is conveyed via mono badges + dots and the line-icon set. Maintain this — adding emoji breaks the visual register.

### Examples of in-product copy (verbatim)
- Section eyebrow: `TRENER · ADAM NIEDŹWIEDŹ`
- Page title: `Pulpit`
- Sub: `4 aktywnych podopiecznych`
- CTA: `Nowe ćwiczenie`
- Empty state: `Brak aktywnego planu`
- Status badges: `aktywny`, `draft`, `archiwum`
- Reset confirm: `Zresetować wszystkie dane demo do stanu wyjściowego?`
- Demo picker header: `Demo · zaloguj jako`
- Trainee note: `Pierwszy muscle-up w pełnym ciszy! Reszta seria mocno spadła ale jest baza.`

### Tone summary
Calm, technical, respectful. The app trusts you know what `muscle-up` means. It does not nag, gamify, or congratulate. It tracks.

---

## VISUAL FOUNDATIONS

### The aesthetic in one line
**Warm off-white canvas, near-black ink, one electric-lime accent, one wedge of monospaced labels.** Think notes app meets engineering tool, with a single fluorescent moment per screen.

### Colors
- **Background** is `#F7F7F4` — a warm off-white with a hint of cream, not pure paper. Avoid `#FFFFFF` for page bg; reserve white (`--surface`) for cards on top.
- **Ink** is `#0E1116` — near-black with a hint of cool, never pure `#000`. Secondary ink `#2A2F38`. Muted `#6B7280`.
- **Accent** is `#C7F23C` (limonkowy / lime). Used **sparingly, never as a fill for large areas** — primary CTA only, the brand dot, the progress ring fill, a small dot inside the "active" status badge. One per screen, ideally. An alternative accent `#FF7A3D` (orange) is wired via `.accent-orange` body class.
- **Hairlines** `#E5E5DF` define almost every container — there is barely any shadow in this UI, the structure comes from these neutral 1px borders.
- **Dark mode** swaps to `#0B0E13` page / `#131822` surface, keeps the same lime accent. Dark mode is a first-class theme, not an afterthought.
- **Semantic** colors are reserved: green `#2F9E6A`, warn `#E2A23A`, danger `#E25C3A`. These also drive the difficulty picker (1–4 easy=green, 5–7 mid=warn, 8–10 hard=danger).

### Type
A three-font stack, each with one job. Never substitute.
- **Space Grotesk** — display (h1–h4), button text on dark/primary buttons, brand wordmark. Weight 600 default, slight negative letter-spacing.
- **DM Sans** — body, default for everything paragraph-y. Weights 400/500/600. Optical 14px base.
- **JetBrains Mono** — numbers, units, eyebrows, badges, status tails, dates, code. Tabular figures on. Often UPPERCASE with `letter-spacing: 0.08em`.

The mono is doing serious work here — it's not just for code. The eyebrow above every page title, the tail count next to a sidenav item, every set/rep number, every status badge — they're all mono. This monospace seam running through the UI is a defining motif.

### Spacing + density
- Base unit feels like ~4–6px. Common card padding `18px`, common gap `12–16px`, sidenav padding `18px 12px`, page padding `28px 36px`.
- The app reads as **comfortably dense, never airy**. Lots of structured info on screen at once. Lists use 14px row padding, not 24px.
- Standard control heights: btn 36px, btn-sm 30px, btn-lg 44px, btn-icon 36×36px square. Input height matches button.

### Backgrounds
**No backgrounds.** Solid `--bg` is the rule. No gradients, no textures, no patterns, no full-bleed photos, no illustrations. The only "imagery" in the entire app is the `<video-tile>` placeholder — a near-black box with a diagonal-stripe SVG-ish scanline overlay (a soft 45° repeating-linear-gradient) and a circular play button. That's it.

### Animation
- **Quiet and short.** Common timings: `0.10s` (hover background tints), `0.12s` (button hover), `0.14s` (overlay fade in), `0.18s` (modal rise, view crossfade).
- Easings are stock `ease` for almost everything; the segmented control in the tweaks panel uses `cubic-bezier(0.3, 0.7, 0.4, 1)` for a snappy snap.
- View transitions use a `slidein` keyframe — `8px → 0` translate + fade. Modals use `rise` — `8px → 0` translate + fade.
- **No bouncy springs, no parallax, no celebratory animation.** When a workout completes, you get a small toast, not confetti.

### Hover + press states
- **Buttons (default)**: hover lightens to `--surface-2` (the wells / sidenav background). Active: `transform: translateY(1px)`, no shadow change.
- **Buttons (primary, lime)**: hover applies `filter: brightness(0.95)` — slightly darker. Same on dark btn (`brightness(1.15)` since it's already black).
- **List rows**: hover background → `--surface-2`. No shadow.
- **Cards (`.card-hover`)**: hover `translateY(-2px)` + `--shadow-md` + border becomes `--line-2`. This is the only "lift" interaction in the system.
- **Nav items**: hover bg becomes `--surface-2`. Active = full `--ink` bg, `--bg` color text (inverted, no accent).

### Borders + shadows
- **Borders are the load-bearing structure.** Every card, every list, every input has a 1px `--line` border. Borders are visually thinner than they are; they're a soft neutral.
- **Shadows are reserved** for elevated surfaces — modals (`--shadow-lg`), toasts, the user picker dropdown. Cards in flow do *not* have shadows.
- **No inner shadows. No glow. No colored shadows.** Shadows are always neutral RGBA black.
- **No "protection gradients"** behind text on imagery — because there's no imagery.

### Corner radii
Three sizes, applied with discipline:
- `--radius-sm: 6px` — small chips, mono badges, the input-num cells in the editor.
- `--radius: 10px` — inputs, default buttons, secondary cards.
- `--radius-lg: 14px` — primary cards, the modal, lists. Anything that feels like a "panel."
- **999px pills** — the user chip, status pills, the role switch, toasts. Soft, container-y rounded shapes that read as "thing you click."

### Cards
The default card is: `var(--surface)` background, `1px solid var(--line)` border, `var(--radius-lg)` radius, `18px` padding, **no shadow**. That's it. `.card-hover` adds the lift behavior above. Cards never use the accent color as a fill; the accent appears only inside the card (a badge dot, an icon, a small button).

### Layout rules
- The shell is a **two-row grid**: fixed top bar (53px), then a two-column body — sidenav 232px + main canvas. The top bar is `position: sticky; top: 0`.
- Main canvas max-width 1320px, padding `28px 36px 64px`.
- At ≤880px the sidenav collapses to a horizontal sticky strip below the top bar; main canvas tightens to `18px 14px` padding.
- The sidenav scrolls independently. The top bar is the only fixed-position element; the rest scrolls in the canvas.

### Transparency + blur
- Used in **one specific place**: the modal backdrop. `rgba(14,17,22,.45)` + `backdrop-filter: blur(4px)`. Strong, deliberate, gives the overlay weight.
- The tweaks panel itself (when open in dev mode) is also a frosted glass surface, but that's UI chrome, not product UI.
- Otherwise: no blurs, no transparent surfaces. Solid is the rule.

### Imagery
**There is no photography in this product.** No hero images, no stock fitness photos, no illustrations of exercises. The exercise demos are shown as `<VideoTile>` placeholders — black boxes with a "DEMO" mono label, a duration timestamp, and a play button. Body-tracking photos are user-uploaded and shown as plain rounded thumbnails in a grid. If you need to demonstrate something, you draw it via UI primitives (a ring, a badge, a set of cells), not via illustration.

### Icons
Custom line-icon set, Lucide-style. See ICONOGRAPHY below.

### Motifs to repeat
- **Eyebrow + heading.** Tiny mono uppercase label on top of a Space Grotesk title. This is the page header pattern.
- **List with hairlines.** Rows separated by `--line`, no zebra striping, no shadows.
- **Mono tail count.** Sidenav items and filter pills have a faint mono numeral on the right (`Plany 6`, `Wszystkie 6`, `Aktywne 4`).
- **Difficulty cells.** 10 small square buttons; filled-in cells color-shift by tier (easy → mid → hard).
- **Status pill.** `<span class="badge active">●  aktywny</span>` — soft accent-tinted bg, mono uppercase, leading dot.
- **Progress ring.** 48px conic-gradient ring with mono count in middle (`3/5`).

### Motifs to avoid
- Gradient backgrounds, especially purple/blue tech-bro gradients.
- Decorative SVG illustrations of athletes, dumbbells, etc.
- Tinted shadows (lime-tinted, blue-tinted glow).
- Cards-with-left-border-accent.
- Emoji of any kind.
- Tooltips that auto-appear on hover.

---

## ICONOGRAPHY

### Approach
**One custom line-icon set, drawn in-house, Lucide-style.** Stroke-only, no fills (a few exceptions for dot accents inside an icon). 24×24 viewBox, `stroke-width: 1.75`, `linecap: round`, `linejoin: round`. Sized by `font-size` (uses `width="1em" height="1em"`), color via `currentColor` — so an icon inherits the text color of its parent.

The set lives at `assets/icons.jsx`. It exports a `window.Icons` object with the full set. Render via `<Icons.Dashboard />`, etc. To resize, set `font-size` on the parent; to color, set `color`.

### Available icons (current set)
`Dashboard, Users, Library, Plans, History, Plus, Search, Play, Pause, Chev, ChevDown, ChevLeft, Upload, Calendar, Clock, Check, Dot, Drag, More, Edit, Trash, X, Trainer, Trainee, Flame, Trend, Filter, Sun, Moon, Settings, Sparkle, Link, Arch, Note, Camera, Image, Body, Drop`

Coverage is intentionally domain-tight — nav, edit/add/remove, calendar/clock, role markers, body/photo, weather (sun/moon for theme), search. **If you need an icon outside this set, draw one in the same style** (24px box, 1.75 stroke, round caps, no fills) and add it to `icons.jsx`. Do **not** drop in Lucide/Heroicons sprites — they're close but the proportions and the slight chunkiness here are deliberate.

### Substitution caveat
If you're working in an environment where editing `icons.jsx` isn't possible and you need a missing icon urgently, **Lucide-React** at `stroke-width="1.75"` and `size={16}` is the closest match. Flag the substitution and add the proper hand-drawn icon to the set after.

### Sizes
- Default `<Icon />` rendered at `1em` — sized by parent's `font-size`.
- In buttons: `.btn .ico { width: 16px; height: 16px }` (set by base CSS).
- In nav items: `.nav-item .ico { width: 18px; height: 18px }`.
- In empty states: bumped to ~24px.

### Emoji policy
**Never.** No emoji anywhere. No 🔥 streaks, no 💪 buttons. If you want to signal "active," use the active status pill with its leading dot.

### Unicode chars
Used sparingly: `·` (middle dot) is the universal separator between metadata fragments ("Aktywny plan: Push/Pull/Legs · v2"). `✕` is the close button on tweaks panel chrome (not user-facing modals — those use the `<Icons.X />` line icon). No other unicode glyphs as icons.

### Logos
- `assets/logo-mark.svg` — 100×100 black tile with white "K". The brand mark you see top-left in the app.
- `assets/logo-wordmark.svg` — black square mark + black "kalisthenos" wordmark + lime dot to the right. For light backgrounds.
- `assets/logo-wordmark-dark.svg` — inverse, for dark backgrounds.

The lime dot to the right of the wordmark is **not optional** — it's part of the lockup. It carries the only color in the otherwise monochrome brand mark.

---

## Conventions for building with this system

- Always `@import "colors_and_type.css"` (or include via `<link>`) before any other stylesheet. Token variables come from there.
- Load fonts from `fonts/` (no remote Google Fonts fetch in production).
- Use the CSS vars, never the literal hex values, in components — that's what enables the dark + accent-orange switches to work.
- Prefer the existing component classes (`.btn`, `.btn-primary`, `.card`, `.list`, `.list-row`, `.badge`, `.input`, `.eyebrow`, etc.) over re-inventing. See `ui_kits/web-app/components/` for the canonical implementations.
- Polish copy. If you don't know the right Polish word, ask — don't guess in English.
