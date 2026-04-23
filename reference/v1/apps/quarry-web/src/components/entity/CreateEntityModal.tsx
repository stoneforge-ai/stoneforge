/**
 * Create Entity Modal
 *
 * Modal dialog for creating new entities (agents, humans, systems).
 * Supports both desktop (centered dialog) and mobile (full-screen) layouts.
 */

import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Plus, Bot, User, Server } from 'lucide-react';
import { useIsMobile } from '../../hooks';

interface Entity {
  id: string;
  type: 'entity';
  name: string;
  entityType: 'agent' | 'human' | 'system';
  publicKey?: string;
  active?: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface CreateEntityInput {
  name: string;
  entityType: 'agent' | 'human' | 'system';
  publicKey?: string;
  tags?: string[];
}

interface CreateEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (entity: Entity) => void;
}

function useCreateEntity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEntityInput) => {
      const response = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create entity');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] });
    },
  });
}

const ENTITY_TYPE_OPTIONS = [
  { value: 'agent', label: 'Agent', description: 'AI agent - automated actors performing work', icon: Bot },
  { value: 'human', label: 'Human', description: 'Human user - manual actors in the system', icon: User },
  { value: 'system', label: 'System', description: 'System process - automated infrastructure', icon: Server },
] as const;

export function CreateEntityModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateEntityModalProps) {
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState<'agent' | 'human' | 'system'>('agent');
  const [publicKey, setPublicKey] = useState('');
  const [tags, setTags] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const createEntity = useCreateEntity();

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setEntityType('agent');
      setPublicKey('');
      setTags('');
      createEntity.reset();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    const input: CreateEntityInput = {
      name: name.trim(),
      entityType,
    };

    if (publicKey.trim()) {
      input.publicKey = publicKey.trim();
    }

    if (tags.trim()) {
      input.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    }

    try {
      const result = await createEntity.mutateAsync(input);
      onSuccess?.(result);
      onClose();
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const isMobileModal = useIsMobile();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="create-entity-modal" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="create-entity-modal-backdrop"
      />

      {/* Dialog - full screen on mobile */}
      <div className={`
        ${isMobileModal
          ? 'absolute inset-0'
          : 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh]'
        } flex flex-col
      `}>
        <div className={`
          bg-[var(--color-bg)] dark:bg-[var(--color-surface)] shadow-2xl border border-[var(--color-border)]
          overflow-hidden flex flex-col h-full
          ${isMobileModal ? '' : 'rounded-xl max-h-full'}
        `}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Create Entity</h2>
            <button
              onClick={onClose}
              className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded touch-target"
              aria-label="Close"
              data-testid="create-entity-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 overflow-auto flex-1">
            {/* Name */}
            <div className="mb-4">
              <label htmlFor="entity-name" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="entity-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter entity name..."
                className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-md bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-entity-name-input"
                required
              />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Must start with a letter, followed by alphanumeric characters, hyphens, or underscores
              </p>
            </div>

            {/* Entity Type */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Type <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2" data-testid="create-entity-type-options">
                {ENTITY_TYPE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <label
                      key={option.value}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors touch-target ${
                        entityType === option.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]'
                      }`}
                      data-testid={`create-entity-type-${option.value}`}
                    >
                      <input
                        type="radio"
                        name="entityType"
                        value={option.value}
                        checked={entityType === option.value}
                        onChange={() => setEntityType(option.value)}
                        className="sr-only"
                      />
                      <Icon className={`w-5 h-5 ${entityType === option.value ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--color-text-muted)]'}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium ${entityType === option.value ? 'text-blue-900 dark:text-blue-100' : 'text-[var(--color-text)]'}`}>
                          {option.label}
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)]">{option.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Public Key (optional) */}
            <div className="mb-4">
              <label htmlFor="entity-public-key" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Public Key <span className="text-[var(--color-text-muted)]">(optional)</span>
              </label>
              <textarea
                id="entity-public-key"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="Ed25519 public key, base64 encoded..."
                rows={3}
                className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-md bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                data-testid="create-entity-public-key-input"
              />
            </div>

            {/* Tags (optional) */}
            <div className="mb-4">
              <label htmlFor="entity-tags" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Tags <span className="text-[var(--color-text-muted)]">(optional)</span>
              </label>
              <input
                id="entity-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Enter tags separated by commas..."
                className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-md bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-entity-tags-input"
              />
            </div>

            {/* Error */}
            {createEntity.isError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-600 dark:text-red-400" data-testid="create-entity-error">
                {createEntity.error.message}
              </div>
            )}

            {/* Actions - stack on mobile */}
            <div className={`flex gap-3 pt-2 ${isMobileModal ? 'flex-col-reverse' : 'justify-end'}`}>
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors ${isMobileModal ? 'w-full' : ''}`}
                data-testid="create-entity-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || createEntity.isPending}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isMobileModal ? 'w-full' : ''}`}
                data-testid="create-entity-submit"
              >
                {createEntity.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Entity
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
