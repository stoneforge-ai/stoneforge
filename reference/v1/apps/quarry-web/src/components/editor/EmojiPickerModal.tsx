/**
 * EmojiPickerModal - Modal for inserting emojis into the document editor
 *
 * TB153: Updated with ResponsiveModal for mobile support
 *
 * Features:
 * - Emoji picker with categories and search
 * - Click to insert emoji
 * - Recent emoji history (stored in localStorage)
 * - Keyboard navigation support
 * - Full-screen on mobile, centered on desktop
 *
 * Architecture:
 * - Emojis are stored as Unicode characters in Markdown
 * - No :shortcode: syntax in storage - pure Unicode for AI agent compatibility
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import EmojiPicker, {
  EmojiClickData,
  Theme,
  SuggestionMode,
  Categories,
} from 'emoji-picker-react';
import { ResponsiveModal, useIsMobile } from '@stoneforge/ui';

interface EmojiPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}

export function EmojiPickerModal({ isOpen, onClose, onSelect }: EmojiPickerModalProps) {
  // Track recent emojis for persistence - the value is used in setRecentEmojis callback
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, setRecentEmojis] = useState<string[]>([]);

  // Load recent emojis from localStorage
  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('stoneforge.recentEmojis');
      if (stored) {
        try {
          setRecentEmojis(JSON.parse(stored));
        } catch {
          setRecentEmojis([]);
        }
      }
    }
  }, [isOpen]);

  // Handle emoji selection
  const handleEmojiClick = useCallback(
    (emojiData: EmojiClickData) => {
      const emoji = emojiData.emoji;

      // Update recent emojis
      setRecentEmojis((prev) => {
        const filtered = prev.filter((e) => e !== emoji);
        const updated = [emoji, ...filtered].slice(0, 20); // Keep last 20
        localStorage.setItem('stoneforge.recentEmojis', JSON.stringify(updated));
        return updated;
      });

      // Insert the emoji
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose]
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Detect theme from document
  const theme = useMemo(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? Theme.DARK : Theme.LIGHT;
    }
    return Theme.LIGHT;
  }, [isOpen]); // Re-check when modal opens

  const isMobile = useIsMobile();

  // Footer with tips (hidden on mobile to save space)
  const footerContent = !isMobile ? (
    <p className="text-xs text-gray-500 dark:text-gray-400">
      Tip: Type <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">:emoji:</kbd> in the editor to quickly insert emojis
    </p>
  ) : null;

  return (
    <ResponsiveModal
      open={isOpen}
      onClose={onClose}
      title="Insert Emoji"
      size="sm"
      data-testid="emoji-picker-modal"
      footer={footerContent}
    >
      {/* Emoji Picker */}
      <div className="p-2">
        <EmojiPicker
          onEmojiClick={handleEmojiClick}
          theme={theme}
          searchPlaceholder="Search emojis..."
          suggestedEmojisMode={SuggestionMode.RECENT}
          categories={[
            {
              category: Categories.SUGGESTED,
              name: 'Recently Used',
            },
            {
              category: Categories.SMILEYS_PEOPLE,
              name: 'Smileys & People',
            },
            {
              category: Categories.ANIMALS_NATURE,
              name: 'Animals & Nature',
            },
            {
              category: Categories.FOOD_DRINK,
              name: 'Food & Drink',
            },
            {
              category: Categories.TRAVEL_PLACES,
              name: 'Travel & Places',
            },
            {
              category: Categories.ACTIVITIES,
              name: 'Activities',
            },
            {
              category: Categories.OBJECTS,
              name: 'Objects',
            },
            {
              category: Categories.SYMBOLS,
              name: 'Symbols',
            },
            {
              category: Categories.FLAGS,
              name: 'Flags',
            },
          ]}
          width={isMobile ? '100%' : 350}
          height={isMobile ? 'calc(100vh - 150px)' : 400}
          previewConfig={{
            showPreview: !isMobile,
          }}
          lazyLoadEmojis={true}
          data-testid="emoji-picker-grid"
        />
      </div>
    </ResponsiveModal>
  );
}

export default EmojiPickerModal;
