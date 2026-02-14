/**
 * UserSelector - Dropdown to select the current human user
 *
 * Allows switching between human entities to view their inbox
 * and send messages as different users.
 *
 * Uses virtualization for efficient rendering of large user lists.
 *
 * Note: Requires @tanstack/react-virtual as a peer dependency.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { User, ChevronDown } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCurrentUser } from '../contexts';

const ITEM_HEIGHT = 36;
const MAX_VISIBLE_ITEMS = 8;
const DROPDOWN_MAX_HEIGHT = ITEM_HEIGHT * MAX_VISIBLE_ITEMS + 8; // +8 for padding

export function UserSelector() {
  const { currentUser, setCurrentUserId, humanEntities, isLoading } = useCurrentUser();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Virtualizer for the user list
  const virtualizer = useVirtualizer({
    count: humanEntities.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 3,
  });

  // Position the dropdown below the trigger
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const updateDropdownPosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width * 2,
        zIndex: 9999,
      });
    }
  }, []);

  // Update position when opening
  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      // Find current user index and highlight it
      const currentIndex = humanEntities.findIndex((e) => e.id === currentUser?.id);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, updateDropdownPosition, humanEntities, currentUser?.id]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => {
            const next = prev < humanEntities.length - 1 ? prev + 1 : prev;
            virtualizer.scrollToIndex(next, { align: 'auto' });
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => {
            const next = prev > 0 ? prev - 1 : prev;
            virtualizer.scrollToIndex(next, { align: 'auto' });
            return next;
          });
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < humanEntities.length) {
            setCurrentUserId(humanEntities[highlightedIndex].id);
            setIsOpen(false);
            triggerRef.current?.focus();
          }
          break;
        case 'Home':
          e.preventDefault();
          setHighlightedIndex(0);
          virtualizer.scrollToIndex(0, { align: 'start' });
          break;
        case 'End':
          e.preventDefault();
          setHighlightedIndex(humanEntities.length - 1);
          virtualizer.scrollToIndex(humanEntities.length - 1, { align: 'end' });
          break;
      }
    },
    [isOpen, highlightedIndex, humanEntities, setCurrentUserId, virtualizer]
  );

  const handleSelect = useCallback(
    (entityId: string) => {
      setCurrentUserId(entityId);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [setCurrentUserId]
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm text-[var(--color-text-tertiary)]">
        <User className="w-4 h-4" />
        <span>Loading...</span>
      </div>
    );
  }

  if (humanEntities.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm text-[var(--color-text-tertiary)]">
        <User className="w-4 h-4" />
        <span>No users</span>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const needsScroll = humanEntities.length > MAX_VISIBLE_ITEMS;

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors border border-[var(--color-border)]"
        data-testid="user-selector-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <User className="w-4 h-4" />
        <span className="truncate max-w-[120px]">{currentUser?.name ?? 'Select user'}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Portal */}
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 overflow-hidden"
            role="listbox"
            data-testid="user-selector-dropdown"
          >
            <div
              ref={listRef}
              className="overflow-auto p-1"
              style={{ maxHeight: DROPDOWN_MAX_HEIGHT }}
              onKeyDown={handleKeyDown}
            >
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualItems.map((virtualItem) => {
                  const entity = humanEntities[virtualItem.index];
                  const isSelected = entity.id === currentUser?.id;
                  const isHighlighted = virtualItem.index === highlightedIndex;

                  return (
                    <div
                      key={entity.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: ITEM_HEIGHT,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(entity.id)}
                        onMouseEnter={() => setHighlightedIndex(virtualItem.index)}
                        className={[
                          'w-full text-left px-3 py-1.5 text-sm',
                          'flex items-center justify-between',
                          'transition-colors',
                          isSelected
                            ? 'text-[var(--color-primary)] font-medium'
                            : 'text-[var(--color-text)]',
                          isHighlighted
                            ? 'bg-[var(--color-surface-hover)]'
                            : 'hover:bg-[var(--color-surface-hover)]',
                        ].join(' ')}
                        role="option"
                        aria-selected={isSelected}
                        data-testid={`user-selector-option-${entity.id}`}
                      >
                        <span className="truncate">{entity.name}</span>
                        {isSelected && (
                          <span className="text-[var(--color-primary)]">✓</span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Scroll indicator */}
            {needsScroll && (
              <div className="px-2 py-1 text-xs text-center text-[var(--color-text-tertiary)] border-t border-[var(--color-border)]">
                {humanEntities.length} users
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
