/**
 * DocumentTagInput - Editable multi-tag input for documents
 */

import { useState, useRef, useEffect } from 'react';
import { Tag, X, Plus } from 'lucide-react';

interface DocumentTagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function DocumentTagInput({
  tags,
  onTagsChange,
  disabled = false,
  placeholder = 'Add tag...',
}: DocumentTagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering add mode
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleAddTag = () => {
    const trimmed = inputValue.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onTagsChange([...tags, trimmed]);
    }
    setInputValue('');
    setIsAdding(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onTagsChange(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Escape') {
      setInputValue('');
      setIsAdding(false);
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      // Remove last tag on backspace when input is empty
      handleRemoveTag(tags[tags.length - 1]);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      handleAddTag();
    } else {
      setIsAdding(false);
    }
  };

  return (
    <div data-testid="document-tag-input">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
        <Tag className="w-3 h-3" />
        Tags
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Existing tags */}
        {tags.map((tag) => (
          <span
            key={tag}
            data-testid={`document-tag-${tag}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 rounded"
          >
            {tag}
            {!disabled && (
              <button
                onClick={() => handleRemoveTag(tag)}
                className="hover:opacity-70 transition-opacity"
                data-testid={`remove-tag-${tag}`}
                aria-label={`Remove tag ${tag}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {/* Add tag input or button */}
        {!disabled && (
          isAdding ? (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder={placeholder}
              className="px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-w-[80px]"
              data-testid="tag-input"
            />
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              data-testid="add-tag-button"
            >
              <Plus className="w-3 h-3" />
              Add tag
            </button>
          )
        )}

        {/* Empty state when no tags and disabled */}
        {tags.length === 0 && disabled && (
          <span className="text-xs text-gray-400 dark:text-gray-500">No tags</span>
        )}
      </div>
    </div>
  );
}
