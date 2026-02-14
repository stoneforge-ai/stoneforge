/**
 * Tooltip component using Radix UI
 * Shows keyboard shortcut hints on hover
 */

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  delayDuration?: number;
}

export function Tooltip({
  children,
  content,
  shortcut,
  side = 'top',
  align = 'center',
  delayDuration = 200,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={4}
          className="z-50 px-2.5 py-1.5 text-xs rounded-md bg-gray-900 text-white shadow-lg
                     animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out
                     data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95
                     data-[side=top]:slide-in-from-bottom-2
                     data-[side=bottom]:slide-in-from-top-2
                     data-[side=left]:slide-in-from-right-2
                     data-[side=right]:slide-in-from-left-2"
          data-testid="tooltip-content"
        >
          <span className="flex items-center gap-2">
            <span>{content}</span>
            {shortcut && (
              <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-700 text-gray-200 font-mono text-[10px]">
                {shortcut}
              </kbd>
            )}
          </span>
          <TooltipPrimitive.Arrow className="fill-gray-900" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider>{children}</TooltipPrimitive.Provider>;
}
