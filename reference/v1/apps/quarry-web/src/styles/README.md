# Stoneforge Design Tokens

This directory contains the design token system for the Stoneforge web platform. Design tokens are the single source of truth for visual styling and ensure consistency across the application.

## Overview

The token system is inspired by modern design systems like Linear, Notion, and Obsidian. It provides:

- **Color Palette**: Primary, secondary, accent, semantic (success, warning, error), and neutral scales
- **Spacing**: Consistent 4px grid system
- **Typography**: Font families, sizes, weights, and line heights
- **Border Radius**: Standardized corner rounding values
- **Shadows**: Layered elevation system
- **Transitions**: Consistent animation timings

## Files

- `tokens.css` - All design tokens as CSS custom properties with Tailwind v4 integration

## Usage

### CSS Custom Properties

All tokens are available as CSS custom properties:

```css
.my-component {
  background-color: var(--color-bg);
  color: var(--color-text);
  padding: var(--spacing-4);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  transition: all var(--duration-normal) var(--ease-in-out);
}
```

### Tailwind Utilities

Tokens are integrated with Tailwind v4 via the `@theme` directive. Use standard Tailwind classes:

```jsx
<div className="bg-primary-500 text-white p-4 rounded-lg shadow-md">
  Content
</div>
```

### Theme Switching

The design system supports light and dark modes:

```css
/* Light mode (default) */
:root {
  --color-bg: #ffffff;
  --color-text: #111827;
}

/* Dark mode */
:root.dark,
:root.theme-dark {
  --color-bg: #0d0d0d;
  --color-text: #f9fafb;
}
```

Toggle dark mode by adding the `.dark` or `.theme-dark` class to the `:root` element.

## Token Reference

### Colors

#### Primary Scale (Blue)
| Token | Light Mode | Dark Mode |
|-------|------------|-----------|
| `--color-primary-50` | #eff6ff | - |
| `--color-primary-100` | #dbeafe | - |
| `--color-primary-200` | #bfdbfe | - |
| `--color-primary-300` | #93c5fd | - |
| `--color-primary-400` | #60a5fa | - |
| `--color-primary-500` | #3b82f6 | - |
| `--color-primary-600` | #2563eb | - |
| `--color-primary-700` | #1d4ed8 | - |
| `--color-primary-800` | #1e40af | - |
| `--color-primary-900` | #1e3a8a | - |
| `--color-primary-950` | #172554 | - |

#### Semantic Colors
| Token | Purpose |
|-------|---------|
| `--color-bg` | Page background |
| `--color-bg-secondary` | Secondary/elevated backgrounds |
| `--color-bg-tertiary` | Tertiary backgrounds |
| `--color-text` | Primary text |
| `--color-text-secondary` | Secondary/muted text |
| `--color-border` | Default borders |
| `--color-surface` | Card/component surfaces |
| `--color-surface-hover` | Hover state for surfaces |

#### Status Colors
| Type | Light Mode | Dark Mode |
|------|------------|-----------|
| Success | `--color-success-*` (Green scale) | Adjusted for dark backgrounds |
| Warning | `--color-warning-*` (Amber scale) | Adjusted for dark backgrounds |
| Error | `--color-error-*` (Red scale) | Adjusted for dark backgrounds |

### Spacing (4px Grid)

| Token | Value | Pixels |
|-------|-------|--------|
| `--spacing-1` | 0.25rem | 4px |
| `--spacing-2` | 0.5rem | 8px |
| `--spacing-3` | 0.75rem | 12px |
| `--spacing-4` | 1rem | 16px |
| `--spacing-5` | 1.25rem | 20px |
| `--spacing-6` | 1.5rem | 24px |
| `--spacing-8` | 2rem | 32px |
| `--spacing-10` | 2.5rem | 40px |
| `--spacing-12` | 3rem | 48px |
| `--spacing-16` | 4rem | 64px |
| `--spacing-20` | 5rem | 80px |
| `--spacing-24` | 6rem | 96px |

### Typography

#### Font Families
- `--font-family-sans` - System UI sans-serif stack
- `--font-family-serif` - System UI serif stack
- `--font-family-mono` - System UI monospace stack

#### Font Sizes
| Token | Value | Pixels |
|-------|-------|--------|
| `--font-size-xs` | 0.75rem | 12px |
| `--font-size-sm` | 0.875rem | 14px |
| `--font-size-base` | 1rem | 16px |
| `--font-size-lg` | 1.125rem | 18px |
| `--font-size-xl` | 1.25rem | 20px |
| `--font-size-2xl` | 1.5rem | 24px |
| `--font-size-3xl` | 1.875rem | 30px |
| `--font-size-4xl` | 2.25rem | 36px |

#### Font Weights
| Token | Value |
|-------|-------|
| `--font-weight-normal` | 400 |
| `--font-weight-medium` | 500 |
| `--font-weight-semibold` | 600 |
| `--font-weight-bold` | 700 |

### Border Radius

| Token | Value | Pixels |
|-------|-------|--------|
| `--radius-sm` | 0.125rem | 2px |
| `--radius-DEFAULT` | 0.25rem | 4px |
| `--radius-md` | 0.375rem | 6px |
| `--radius-lg` | 0.5rem | 8px |
| `--radius-xl` | 0.75rem | 12px |
| `--radius-2xl` | 1rem | 16px |
| `--radius-full` | 9999px | Full circle |

### Shadows

| Token | Use Case |
|-------|----------|
| `--shadow-xs` | Subtle elevation (inputs) |
| `--shadow-sm` | Low elevation (cards) |
| `--shadow-md` | Medium elevation (dropdowns) |
| `--shadow-lg` | High elevation (modals) |
| `--shadow-xl` | Highest elevation (dialogs) |
| `--shadow-focus` | Focus ring for interactive elements |

### Transitions

| Token | Value | Use Case |
|-------|-------|----------|
| `--duration-fast` | 100ms | Micro-interactions (hover states) |
| `--duration-normal` | 200ms | Standard interactions (toggles) |
| `--duration-slow` | 300ms | Larger animations (modals) |
| `--duration-slower` | 500ms | Complex animations |

#### Timing Functions
| Token | Value |
|-------|-------|
| `--ease-linear` | Linear |
| `--ease-in` | Accelerate |
| `--ease-out` | Decelerate |
| `--ease-in-out` | Accelerate then decelerate |
| `--ease-bounce` | Bounce effect |

## Changing the Primary Color

To change the primary color across the entire application, update the `--color-primary-*` tokens in `tokens.css`:

```css
:root {
  /* Change to a teal primary color */
  --color-primary-50: #f0fdfa;
  --color-primary-100: #ccfbf1;
  --color-primary-200: #99f6e4;
  --color-primary-300: #5eead4;
  --color-primary-400: #2dd4bf;
  --color-primary-500: #14b8a6;
  --color-primary-600: #0d9488;
  --color-primary-700: #0f766e;
  --color-primary-800: #115e59;
  --color-primary-900: #134e4a;
  --color-primary-950: #042f2e;
}
```

All components using `--color-primary` will automatically update.

## Z-Index Scale

| Token | Value | Use Case |
|-------|-------|----------|
| `--z-index-dropdown` | 1000 | Dropdown menus |
| `--z-index-sticky` | 1020 | Sticky headers |
| `--z-index-modal-backdrop` | 1040 | Modal overlay |
| `--z-index-modal` | 1050 | Modal content |
| `--z-index-popover` | 1060 | Popovers |
| `--z-index-tooltip` | 1070 | Tooltips |
| `--z-index-toast` | 1080 | Toast notifications |
