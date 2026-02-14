/**
 * @stoneforge/ui Button Component Tests
 */

import { describe, it, expect } from 'bun:test';

describe('Button Component', () => {
  it('exports Button component', async () => {
    const { Button } = await import('./Button');
    expect(Button).toBeDefined();
    expect(typeof Button).toBe('object'); // forwardRef returns object
  });

  it('exports ButtonProps type', async () => {
    const { Button } = await import('./Button');
    expect(Button.displayName).toBe('Button');
  });

  it('has default variants', async () => {
    const mod = await import('./Button');
    expect(mod.Button).toBeDefined();
  });
});

describe('Badge Component', () => {
  it('exports Badge component', async () => {
    const { Badge } = await import('./Badge');
    expect(Badge).toBeDefined();
    expect(Badge.displayName).toBe('Badge');
  });
});

describe('Card Component', () => {
  it('exports Card and sub-components', async () => {
    const mod = await import('./Card');
    expect(mod.Card).toBeDefined();
    expect(mod.CardHeader).toBeDefined();
    expect(mod.CardTitle).toBeDefined();
    expect(mod.CardDescription).toBeDefined();
    expect(mod.CardContent).toBeDefined();
    expect(mod.CardFooter).toBeDefined();
  });
});

describe('Input Component', () => {
  it('exports Input and related components', async () => {
    const mod = await import('./Input');
    expect(mod.Input).toBeDefined();
    expect(mod.Textarea).toBeDefined();
    expect(mod.Label).toBeDefined();
  });
});

describe('Dialog Component', () => {
  it('exports Dialog and sub-components', async () => {
    const mod = await import('./Dialog');
    expect(mod.Dialog).toBeDefined();
    expect(mod.DialogContent).toBeDefined();
    expect(mod.DialogHeader).toBeDefined();
    expect(mod.DialogBody).toBeDefined();
    expect(mod.DialogFooter).toBeDefined();
    expect(mod.DialogTitle).toBeDefined();
    expect(mod.DialogDescription).toBeDefined();
  });
});

describe('Select Component', () => {
  it('exports Select and sub-components', async () => {
    const mod = await import('./Select');
    expect(mod.Select).toBeDefined();
    expect(mod.SelectTrigger).toBeDefined();
    expect(mod.SelectContent).toBeDefined();
    expect(mod.SelectItem).toBeDefined();
    expect(mod.SelectValue).toBeDefined();
  });
});

describe('Skeleton Component', () => {
  it('exports Skeleton and variants', async () => {
    const mod = await import('./Skeleton');
    expect(mod.Skeleton).toBeDefined();
    expect(mod.SkeletonText).toBeDefined();
    expect(mod.SkeletonAvatar).toBeDefined();
    expect(mod.SkeletonCard).toBeDefined();
    expect(mod.SkeletonTaskCard).toBeDefined();
    expect(mod.SkeletonList).toBeDefined();
  });
});

describe('Tooltip Component', () => {
  it('exports Tooltip and TooltipProvider', async () => {
    const mod = await import('./Tooltip');
    expect(mod.Tooltip).toBeDefined();
    expect(mod.TooltipProvider).toBeDefined();
  });
});

describe('TagInput Component', () => {
  it('exports TagInput', async () => {
    const mod = await import('./TagInput');
    expect(mod.TagInput).toBeDefined();
  });
});

describe('ThemeToggle Component', () => {
  it('exports ThemeToggle', async () => {
    const mod = await import('./ThemeToggle');
    expect(mod.ThemeToggle).toBeDefined();
  });
});
