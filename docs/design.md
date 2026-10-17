# Design system

Threadline uses Material Design 3 tokens across the application and shared UI.
The CSS variables in `packages/ui/src/styles/globals.css` are the source of truth.

## Surfaces and color

Use semantic tokens from the shared theme. Do not add raw color values to
application components.

| Role | Light | Dark |
| --- | --- | --- |
| Background | `#fef7ff` | `#141218` |
| Surface | `#fef7ff` | `#1d1b20` |
| Surface container | `#f3edf7` | `#2b2930` |
| Surface variant | `#e7e0ec` | `#49454f` |
| Foreground | `#1d1b20` | `#e6e1e9` |
| Muted foreground | `#49454f` | `#cac4d0` |
| Primary | `#6750a4` | `#6750a4` |
| Destructive | `#b3261e` | `#b3261e` |

Use `bg-background`, `bg-card`, `bg-muted`, `bg-accent`, `text-foreground`,
`text-muted-foreground`, and the other semantic utilities. Use `bg-primary` for
the main action and `bg-destructive` for an action that cannot be undone.
Keep peer actions neutral. Status colors need a text or icon cue.

Keep `--primary` and `--destructive` fixed across themes. The focus ring can
change in dark mode so keyboard focus remains visible. Check foreground and
background contrast in both themes.

## Shape and spacing

Use the shared radius scale: `rounded-sm` is 8px, `rounded-md` is 12px, and
`rounded-lg` is 16px. Use `rounded-full` for circular controls and pills.
Do not add literal radii or values above 16px.

Use the 8px spacing base. Use 16px for standard groups and 32px between major
sections. Keep buttons and text inside the page margins. Let text and controls
wrap at narrow widths.

## Typography

Use Roboto for body text, Roboto Flex for headings, and Roboto Mono for code and
fixed-width values. Use the Tailwind type scale and semantic page-shell
components. Keep body text near 16px with a 1.5–1.6 line height. Use a tight
line height for short headings.

Inputs use at least 16px text on mobile. Use tabular numerals for values that
change. Keep long text readable and provide a way to reach truncated content.

## Components and interaction

`packages/ui` is the single source for shared shadcn components. Compose those
components instead of creating styled substitutes. Use semantic variants and
tokens. Use `className` for layout, not for local color or typography changes.

Cards use surface colors, the shared radius scale, and 24px internal spacing.
Buttons and inputs use 12px corners. Keep visible keyboard focus, persistent
field labels, readable error text, and reduced-motion support.

Use restrained, interruptible motion. Add press feedback only when it does not
interfere with reduced-motion preferences.
