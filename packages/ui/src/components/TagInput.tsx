import { useState, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
  'data-testid'?: string;
}

export function TagInput({
  tags,
  onChange,
  placeholder = 'Type and press comma to add tags',
  className = '',
  'data-testid': testId,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const addTag = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Check if the user just typed a comma
    if (value.includes(',')) {
      const parts = value.split(',');
      // Add all parts except the last one (which is after the comma)
      parts.slice(0, -1).forEach((part) => addTag(part));
      // Keep the last part in the input
      setInputValue(parts[parts.length - 1]);
    } else {
      setInputValue(value);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 p-2 border border-[var(--color-border)] rounded-md focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:border-transparent bg-[var(--color-input-bg)] min-h-[42px] ${className}`}
      data-testid={testId}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-sm bg-[var(--color-surface-elevated)] text-[var(--color-text)] rounded"
          data-testid={`tag-${tag}`}
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="p-0.5 hover:bg-[var(--color-surface-hover)] rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]"
            aria-label={`Remove tag ${tag}`}
            data-testid={`tag-remove-${tag}`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[100px] outline-none text-sm bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)]"
        data-testid={`${testId}-input`}
      />
    </div>
  );
}
