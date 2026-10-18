# Design system

Threadline follows a warm, quiet system: a cream canvas, near-black ink, a serif for
display text and a grotesk for everything else. Depth comes from surface colour, not
shadow. The CSS variables in `packages/ui/src/styles/globals.css` are the source of
truth.

## Surfaces and color

Use semantic tokens from the shared theme. Do not add raw color values to
application components.

| Role | Light | Dark |
| --- | --- | --- |
| Background (canvas) | `#fffdf5` | `#121210` |
| Card, popover | `#ffffff` | `#1c1c19` |
| Surface container | `#fbf8ef` | `#232320` |
| Muted, secondary | `#f4f1e6` | `#232320` |
| Accent (sand) | `#f6edd7` | `#2e2e29` |
| Band (dark section) | `#2a2b22` | `#1c1c19` |
| Foreground | `#1b1c14` | `#f6f5ef` |
| Muted foreground | `#5e5f52` | `#a6a69a` |
| Primary | `#1b1c14` | `#f6f3e6` |
| Thread (evidence accent) | `#828761` | `#a3a882` |
| Border | `#e0dfd8` | `#35352f` |
| Destructive | `#a8321f` | `#e0705c` |

Use `bg-background`, `bg-card`, `bg-muted`, `bg-accent`, `bg-band`, `text-foreground`,
`text-muted-foreground` and the other semantic utilities. `bg-primary` is the main
action. Primary inverts in dark mode so a button always contrasts with the canvas.
Keep peer actions neutral (`outline`, `ghost`).

`thread` is the one accent. It marks a link between evidence and a field: a thread line,
a quote rule, a step connector. Do not use it for buttons, headings or decoration. It
is below 4.5:1 on cream, so never set body text in it; use `text-tertiary` for
highlighted words.

Status colors (`destructive`, `success`, `warning`) exist because a CRM needs them.
Always pair them with a text or shape cue.

## Shape and spacing

| Token | Size | Use |
| --- | --- | --- |
| `rounded-sm` | 8px | Small chips, avatars |
| `rounded-md` | 12px | Inputs, small containers |
| `rounded-lg` | 16px | Popovers, dialogs, dense app cards |
| `rounded-xl` | 24px | Feature cards and mock-ups on marketing pages |
| `rounded-full` | pill | Every button and every badge-like pill |

Buttons are pills; that is built into `Button` in `packages/ui`. Do not add literal
radii.

Use the 8px spacing base. Use 16px inside cards and controls, 24px between related
blocks, and 80–112px between marketing sections. Keep a 16px side gutter on phones.

## Typography

| Role | Font | Notes |
| --- | --- | --- |
| Display, `h1`, `h2` | Newsreader (`font-heading`) | Weight 400, negative tracking (−0.02em to −0.035em), line height 1.0–1.1 |
| Body, UI, `h3`–`h6` | Hanken Grotesk (`font-sans`) | 15–18px, line height 1.5–1.75 |
| Code, fixed-width values | JetBrains Mono (`font-mono`) | Not for labels |

Do not set the serif below 22px. Do not use all-caps labels or monospace labels for
decoration. Inputs use at least 16px text on mobile. Use tabular numerals for values
that change.

## Components and interaction

`packages/ui` is the single source for shared shadcn components. Compose those
components instead of creating styled substitutes. Use `className` for layout, not for
local color or typography changes.

Shadows are rare: `shadow-inset` on the primary button, `shadow-md` for a floating
card or mock-up. Prefer a surface change (`bg-card` on `bg-background`, or a `bg-band`
section) to a shadow.

Keep visible keyboard focus, persistent field labels and readable error text. Motion
is restrained: the landing hero draws its threads once on load, and every animation is
off under `prefers-reduced-motion`.

## Brand

The logo (`packages/ui/src/components/logo.tsx`) is one thread that steps from a
conversation line to a record line, with a node at each end. The wordmark sets
"Threadline" in Newsreader beside it. The favicon and app icons in `apps/app/public`
put the cream mark on an ink tile, with the end node in the thread colour.
