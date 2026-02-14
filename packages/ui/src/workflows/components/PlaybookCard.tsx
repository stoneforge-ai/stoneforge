/**
 * @stoneforge/ui Playbook Card
 *
 * Card component for displaying a playbook template.
 */

import { useState } from 'react';
import { BookOpen, Play, Settings, Trash2, MoreVertical, FileText } from 'lucide-react';
import type { Playbook } from '../types';

interface PlaybookCardProps {
  playbook: Playbook;
  onCreate: (playbookId: string) => void;
  onEdit?: (playbookId: string) => void;
  onDelete?: (playbookId: string) => void;
}

export function PlaybookCard({
  playbook,
  onCreate,
  onEdit,
  onDelete,
}: PlaybookCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="flex flex-col p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)] transition-colors duration-150"
      data-testid={`playbook-card-${playbook.id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text)]">{playbook.title}</h3>
            <p className="text-xs text-[var(--color-text-tertiary)] font-mono">{playbook.name}</p>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)] transition-colors"
            aria-label="Playbook actions"
          >
            <MoreVertical className="w-4 h-4 text-[var(--color-text-secondary)]" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-40 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg z-10">
              <button
                onClick={() => {
                  onCreate(playbook.id);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              >
                <Play className="w-4 h-4" />
                Create Workflow
              </button>
              {onEdit && (
                <button
                  onClick={() => {
                    onEdit(playbook.id);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                  data-testid={`playbook-edit-${playbook.id}`}
                >
                  <Settings className="w-4 h-4" />
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    onDelete(playbook.id);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
        <span className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          {playbook.steps.length} steps
        </span>
        <span>v{playbook.version}</span>
        {playbook.variables.length > 0 && (
          <span>{playbook.variables.length} variables</span>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
        <button
          onClick={() => onCreate(playbook.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
          data-testid={`playbook-create-${playbook.id}`}
        >
          <Play className="w-4 h-4" />
          Create Workflow
        </button>
      </div>
    </div>
  );
}
