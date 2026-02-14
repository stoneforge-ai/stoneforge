/**
 * @stoneforge/ui Workflow Editor Modal
 *
 * Visual editor for creating and editing playbook templates.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Save,
  AlertCircle,
  Loader2,
  BookOpen,
  Plus,
  Trash2,
  Code,
  Variable,
  List,
  GripVertical,
  Copy,
  Download,
  Upload,
  Check,
  ArrowUp,
  ArrowDown,
  Edit3,
  FileText,
  Terminal,
  ClipboardList,
  ChevronDown,
} from 'lucide-react';
import type { Playbook, VariableType, TaskTypeValue, Priority, Complexity, StepType, FunctionRuntime } from '../types';
import {
  usePlaybook,
  useCreatePlaybook,
  useUpdatePlaybook,
} from '../hooks';
import {
  TASK_TYPES,
  PRIORITIES,
  COMPLEXITIES,
  VARIABLE_TYPES,
  STEP_TYPES,
  FUNCTION_RUNTIMES,
} from '../constants';
import { generateStepId } from '../utils';

// ============================================================================
// Types
// ============================================================================

export interface WorkflowEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Playbook ID for editing (null for creating new) */
  playbookId?: string | null;
  /** Callback when playbook is successfully saved */
  onSuccess?: (playbook: Playbook) => void;
}

type EditorTab = 'steps' | 'variables' | 'yaml';

interface StepFormData {
  id: string;
  title: string;
  description: string;
  stepType: StepType;
  // Task step fields
  taskType: TaskTypeValue | '';
  priority: Priority | '';
  complexity: Complexity | '';
  assignee: string;
  // Function step fields
  runtime: FunctionRuntime;
  code: string;
  command: string;
  timeout: string;
  // Common fields
  dependsOn: string[];
  condition: string;
}

interface VariableFormData {
  name: string;
  description: string;
  type: VariableType;
  required: boolean;
  default: string;
  enum: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

type StepOutput = {
  id: string;
  title: string;
  description?: string;
  stepType?: StepType;
  // Task step fields
  taskType?: TaskTypeValue;
  priority?: Priority;
  complexity?: Complexity;
  assignee?: string;
  // Function step fields
  runtime?: FunctionRuntime;
  code?: string;
  command?: string;
  timeout?: number;
  // Common fields
  dependsOn?: string[];
  condition?: string;
};

function formDataToStep(data: StepFormData): StepOutput {
  const step: StepOutput = {
    id: data.id,
    title: data.title,
  };

  if (data.description.trim()) step.description = data.description.trim();
  if (data.dependsOn.length > 0) step.dependsOn = data.dependsOn;
  if (data.condition.trim()) step.condition = data.condition.trim();

  if (data.stepType === 'function') {
    // Function step
    step.stepType = 'function';
    step.runtime = data.runtime;
    if (data.runtime === 'shell') {
      if (data.command.trim()) step.command = data.command.trim();
    } else {
      if (data.code.trim()) step.code = data.code.trim();
    }
    if (data.timeout.trim()) {
      const timeoutNum = parseInt(data.timeout, 10);
      if (!isNaN(timeoutNum) && timeoutNum > 0) {
        step.timeout = timeoutNum;
      }
    }
  } else {
    // Task step (default)
    if (data.taskType) step.taskType = data.taskType as TaskTypeValue;
    if (data.priority) step.priority = data.priority as Priority;
    if (data.complexity) step.complexity = data.complexity as Complexity;
    if (data.assignee.trim()) step.assignee = data.assignee.trim();
  }

  return step;
}

function formDataToVariable(data: VariableFormData): {
  name: string;
  type: VariableType;
  required: boolean;
  description?: string;
  default?: unknown;
  enum?: unknown[];
} {
  const variable: {
    name: string;
    type: VariableType;
    required: boolean;
    description?: string;
    default?: unknown;
    enum?: unknown[];
  } = {
    name: data.name,
    type: data.type,
    required: data.required,
  };

  if (data.description.trim()) variable.description = data.description.trim();

  if (data.default.trim()) {
    switch (data.type) {
      case 'number':
        variable.default = Number(data.default);
        break;
      case 'boolean':
        variable.default = data.default === 'true';
        break;
      default:
        variable.default = data.default;
    }
  }

  if (data.enum.length > 0 && data.enum.some(v => v.trim())) {
    const enumValues = data.enum.filter(v => v.trim());
    switch (data.type) {
      case 'number':
        variable.enum = enumValues.map(Number);
        break;
      case 'boolean':
        variable.enum = enumValues.map(v => v === 'true');
        break;
      default:
        variable.enum = enumValues;
    }
  }

  return variable;
}

function generateYaml(
  name: string,
  title: string,
  steps: StepFormData[],
  variables: VariableFormData[]
): string {
  const lines: string[] = [];

  lines.push(`name: ${name}`);
  lines.push(`title: "${title}"`);
  lines.push(`version: 1`);

  if (variables.length > 0) {
    lines.push('');
    lines.push('variables:');
    for (const v of variables) {
      lines.push(`  - name: ${v.name}`);
      lines.push(`    type: ${v.type}`);
      lines.push(`    required: ${v.required}`);
      if (v.description) lines.push(`    description: "${v.description}"`);
      if (v.default) {
        const defaultVal = v.type === 'string' ? `"${v.default}"` : v.default;
        lines.push(`    default: ${defaultVal}`);
      }
      if (v.enum.length > 0 && v.enum.some(e => e.trim())) {
        lines.push('    enum:');
        for (const e of v.enum.filter(x => x.trim())) {
          const enumVal = v.type === 'string' ? `"${e}"` : e;
          lines.push(`      - ${enumVal}`);
        }
      }
    }
  }

  if (steps.length > 0) {
    lines.push('');
    lines.push('steps:');
    for (const s of steps) {
      lines.push(`  - id: ${s.id}`);
      lines.push(`    title: "${s.title}"`);
      if (s.description) lines.push(`    description: "${s.description}"`);

      // Function step fields
      if (s.stepType === 'function') {
        lines.push(`    step_type: function`);
        lines.push(`    runtime: ${s.runtime}`);
        if (s.runtime === 'shell' && s.command) {
          // Use block scalar for multi-line commands
          if (s.command.includes('\n')) {
            lines.push(`    command: |`);
            for (const cmdLine of s.command.split('\n')) {
              lines.push(`      ${cmdLine}`);
            }
          } else {
            lines.push(`    command: "${s.command}"`);
          }
        } else if (s.code) {
          // Use block scalar for code
          lines.push(`    code: |`);
          for (const codeLine of s.code.split('\n')) {
            lines.push(`      ${codeLine}`);
          }
        }
        if (s.timeout) lines.push(`    timeout: ${s.timeout}`);
      } else {
        // Task step fields
        if (s.taskType) lines.push(`    task_type: ${s.taskType}`);
        if (s.priority) lines.push(`    priority: ${s.priority}`);
        if (s.complexity) lines.push(`    complexity: ${s.complexity}`);
        if (s.assignee) lines.push(`    assignee: "${s.assignee}"`);
      }

      // Common fields
      if (s.dependsOn.length > 0) {
        lines.push('    depends_on:');
        for (const d of s.dependsOn) {
          lines.push(`      - ${d}`);
        }
      }
      if (s.condition) lines.push(`    condition: "${s.condition}"`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Step List Item Component
// ============================================================================

interface StepListItemProps {
  step: StepFormData;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function StepListItem({
  step,
  index,
  isSelected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  isFirst,
  isLast,
}: StepListItemProps) {
  const isFunctionStep = step.stepType === 'function';

  return (
    <div
      className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors duration-150 ${
        isSelected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50'
      }`}
      onClick={onSelect}
      data-testid={`step-item-${step.id}`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <GripVertical className="w-4 h-4 text-[var(--color-text-tertiary)] cursor-grab flex-shrink-0" />
        <span className="w-6 h-6 flex items-center justify-center bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs font-medium text-[var(--color-text-secondary)] flex-shrink-0">
          {index + 1}
        </span>
        {/* Step type indicator */}
        <span
          className={`flex items-center justify-center w-6 h-6 rounded flex-shrink-0 ${
            isFunctionStep
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
          }`}
          title={isFunctionStep ? 'Function step' : 'Task step'}
        >
          {isFunctionStep ? <Terminal className="w-3.5 h-3.5" /> : <ClipboardList className="w-3.5 h-3.5" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--color-text)] truncate">
            {step.title || 'Untitled step'}
          </div>
          <div className="text-xs text-[var(--color-text-tertiary)] font-mono truncate">
            {step.id}
            {isFunctionStep && step.runtime && (
              <span className="ml-1 text-purple-500">• {step.runtime}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {step.dependsOn.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            {step.dependsOn.length} dep{step.dependsOn.length > 1 ? 's' : ''}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          disabled={isFirst}
          className="p-1 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move up"
        >
          <ArrowUp className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          disabled={isLast}
          className="p-1 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move down"
        >
          <ArrowDown className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
          title="Delete step"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Step Form Component
// ============================================================================

interface StepFormProps {
  step: StepFormData;
  onChange: (step: StepFormData) => void;
  allStepIds: string[];
  onClose: () => void;
}

function StepForm({ step, onChange, allStepIds, onClose }: StepFormProps) {
  const availableDependencies = allStepIds.filter(id => id !== step.id);
  const isFunctionStep = step.stepType === 'function';

  const handleChange = (field: keyof StepFormData, value: unknown) => {
    onChange({ ...step, [field]: value });
  };

  const toggleDependency = (depId: string) => {
    const newDeps = step.dependsOn.includes(depId)
      ? step.dependsOn.filter(d => d !== depId)
      : [...step.dependsOn, depId];
    handleChange('dependsOn', newDeps);
  };

  return (
    <div className="space-y-4 max-h-[500px] overflow-y-auto" data-testid="step-form">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-[var(--color-text)]">Edit Step</h4>
        <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-hover)]">
          <X className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
      </div>

      {/* Step Type Toggle */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">Step Type</label>
        <div className="flex gap-2">
          {STEP_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => handleChange('stepType', t.value)}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                step.stepType === t.value
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]'
              }`}
              data-testid={`step-type-${t.value}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {step.stepType === 'function' ? 'Execute code directly' : 'Create an agent task'}
        </p>
      </div>

      {/* Step ID */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Step ID
        </label>
        <input
          type="text"
          value={step.id}
          onChange={(e) => handleChange('id', e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
          placeholder="step_id"
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 font-mono"
          data-testid="step-id-input"
        />
      </div>

      {/* Title */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={step.title}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="Step title"
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          data-testid="step-title-input"
        />
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Description
        </label>
        <textarea
          value={step.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Step description"
          rows={2}
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 resize-none"
          data-testid="step-description-input"
        />
      </div>

      {/* Function Step Fields */}
      {isFunctionStep && (
        <>
          {/* Runtime */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Runtime <span className="text-red-500">*</span>
            </label>
            <select
              value={step.runtime}
              onChange={(e) => handleChange('runtime', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
              data-testid="step-runtime-select"
            >
              {FUNCTION_RUNTIMES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {FUNCTION_RUNTIMES.find(r => r.value === step.runtime)?.description}
            </p>
          </div>

          {/* Code (for typescript/python) */}
          {step.runtime !== 'shell' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                Code <span className="text-red-500">*</span>
              </label>
              <textarea
                value={step.code}
                onChange={(e) => handleChange('code', e.target.value)}
                placeholder={step.runtime === 'typescript'
                  ? '// TypeScript code to execute\nexport default async function() {\n  // Your code here\n}'
                  : '# Python code to execute\ndef main():\n    # Your code here\n    pass'}
                rows={8}
                className="w-full px-3 py-2 text-sm font-mono bg-gray-900 text-green-400 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 resize-none"
                data-testid="step-code-input"
              />
            </div>
          )}

          {/* Command (for shell) */}
          {step.runtime === 'shell' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                Command <span className="text-red-500">*</span>
              </label>
              <textarea
                value={step.command}
                onChange={(e) => handleChange('command', e.target.value)}
                placeholder="echo 'Hello World' && ls -la"
                rows={4}
                className="w-full px-3 py-2 text-sm font-mono bg-gray-900 text-green-400 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 resize-none"
                data-testid="step-command-input"
              />
            </div>
          )}

          {/* Timeout */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Timeout (ms)
            </label>
            <input
              type="number"
              value={step.timeout}
              onChange={(e) => handleChange('timeout', e.target.value)}
              placeholder="30000"
              min="1"
              max="600000"
              className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
              data-testid="step-timeout-input"
            />
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Default: 30000ms (30 seconds). Max: 600000ms (10 minutes)
            </p>
          </div>
        </>
      )}

      {/* Task Step Fields */}
      {!isFunctionStep && (
        <>
          {/* Task Type, Priority, Complexity */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">Task Type</label>
              <select
                value={step.taskType}
                onChange={(e) => handleChange('taskType', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                data-testid="step-tasktype-select"
              >
                <option value="">None</option>
                {TASK_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">Priority</label>
              <select
                value={step.priority}
                onChange={(e) => handleChange('priority', e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                data-testid="step-priority-select"
              >
                <option value="">None</option>
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">Complexity</label>
              <select
                value={step.complexity}
                onChange={(e) => handleChange('complexity', e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                data-testid="step-complexity-select"
              >
                <option value="">None</option>
                {COMPLEXITIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignee */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">Assignee</label>
            <input
              type="text"
              value={step.assignee}
              onChange={(e) => handleChange('assignee', e.target.value)}
              placeholder="{{variable}} or entity name"
              className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
              data-testid="step-assignee-input"
            />
          </div>
        </>
      )}

      {/* Dependencies */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Dependencies
        </label>
        {availableDependencies.length === 0 ? (
          <p className="text-xs text-[var(--color-text-tertiary)] italic">
            No other steps available
          </p>
        ) : (
          <div className="flex flex-wrap gap-2" data-testid="step-dependencies">
            {availableDependencies.map(depId => (
              <button
                key={depId}
                onClick={() => toggleDependency(depId)}
                className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                  step.dependsOn.includes(depId)
                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]'
                }`}
              >
                {depId}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Variable Form Component
// ============================================================================

interface VariableFormProps {
  variable: VariableFormData;
  onChange: (variable: VariableFormData) => void;
  onClose: () => void;
}

function VariableForm({ variable, onChange, onClose }: VariableFormProps) {
  const handleChange = (field: keyof VariableFormData, value: unknown) => {
    onChange({ ...variable, [field]: value });
  };

  const addEnumValue = () => {
    handleChange('enum', [...variable.enum, '']);
  };

  const updateEnumValue = (index: number, value: string) => {
    const newEnum = [...variable.enum];
    newEnum[index] = value;
    handleChange('enum', newEnum);
  };

  const removeEnumValue = (index: number) => {
    handleChange('enum', variable.enum.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4" data-testid="variable-form">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-[var(--color-text)]">Edit Variable</h4>
        <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-hover)]">
          <X className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={variable.name}
          onChange={(e) => handleChange('name', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          placeholder="variable_name"
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 font-mono"
          data-testid="variable-name-input"
        />
      </div>

      {/* Type */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Type <span className="text-red-500">*</span>
        </label>
        <select
          value={variable.type}
          onChange={(e) => handleChange('type', e.target.value as VariableType)}
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          data-testid="variable-type-select"
        >
          {VARIABLE_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Required */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={variable.required}
          onChange={(e) => handleChange('required', e.target.checked)}
          className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)]"
          data-testid="variable-required-checkbox"
        />
        <span className="text-sm text-[var(--color-text)]">Required</span>
      </label>

      {/* Description */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">Description</label>
        <input
          type="text"
          value={variable.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="What this variable is for"
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          data-testid="variable-description-input"
        />
      </div>

      {/* Default Value */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">Default Value</label>
        {variable.type === 'boolean' ? (
          <select
            value={variable.default}
            onChange={(e) => handleChange('default', e.target.value)}
            className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            data-testid="variable-default-input"
          >
            <option value="">No default</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input
            type={variable.type === 'number' ? 'number' : 'text'}
            value={variable.default}
            onChange={(e) => handleChange('default', e.target.value)}
            placeholder={variable.type === 'number' ? '0' : 'default value'}
            className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            data-testid="variable-default-input"
          />
        )}
      </div>

      {/* Enum Values */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[var(--color-text-secondary)]">Allowed Values</label>
          <button
            onClick={addEnumValue}
            className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
        {variable.enum.length > 0 ? (
          <div className="space-y-2" data-testid="variable-enum-list">
            {variable.enum.map((val, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type={variable.type === 'number' ? 'number' : 'text'}
                  value={val}
                  onChange={(e) => updateEnumValue(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                />
                <button
                  onClick={() => removeEnumValue(i)}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-tertiary)] italic">
            No enum values. Variable accepts any value of its type.
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// YAML Preview Component
// ============================================================================

interface YamlPreviewProps {
  yaml: string;
  onImport: (yaml: string) => void;
}

function YamlPreview({ yaml, onImport }: YamlPreviewProps) {
  const [importMode, setImportMode] = useState(false);
  const [importText, setImportText] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'playbook.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    onImport(importText);
    setImportMode(false);
    setImportText('');
  };

  return (
    <div className="space-y-3" data-testid="yaml-preview">
      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={() => setImportMode(!importMode)}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
            importMode
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
          }`}
          data-testid="yaml-import-toggle"
        >
          <Upload className="w-4 h-4" />
          Import
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-surface-hover)]"
          data-testid="yaml-copy"
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-surface-hover)]"
          data-testid="yaml-download"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
      </div>

      {/* Import UI */}
      {importMode && (
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-3">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 px-3 py-2 text-sm bg-[var(--color-primary)] text-white rounded-lg cursor-pointer hover:bg-[var(--color-primary-hover)]">
              <FileText className="w-4 h-4" />
              Upload File
              <input
                type="file"
                accept=".yaml,.yml"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const content = event.target?.result as string;
                      onImport(content);
                      setImportMode(false);
                    };
                    reader.readAsText(file);
                  }
                }}
                className="hidden"
                data-testid="yaml-file-input"
              />
            </label>
            <span className="text-sm text-[var(--color-text-tertiary)]">or paste YAML below</span>
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste YAML content here..."
            rows={10}
            className="w-full px-3 py-2 text-sm font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 resize-none"
            data-testid="yaml-import-textarea"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setImportMode(false); setImportText(''); }}
              className="px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!importText.trim()}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              data-testid="yaml-import-confirm"
            >
              <Check className="w-4 h-4" />
              Import
            </button>
          </div>
        </div>
      )}

      {/* YAML Preview */}
      <pre
        className="p-4 bg-gray-900 text-green-400 rounded-lg overflow-auto text-xs font-mono max-h-96"
        data-testid="yaml-content"
      >
        {yaml}
      </pre>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function WorkflowEditorModal({
  isOpen,
  onClose,
  playbookId,
  onSuccess,
}: WorkflowEditorModalProps) {
  const isEditing = Boolean(playbookId);

  // Form state
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState<StepFormData[]>([]);
  const [variables, setVariables] = useState<VariableFormData[]>([]);
  const [activeTab, setActiveTab] = useState<EditorTab>('steps');
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [selectedVariableIndex, setSelectedVariableIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing playbook if editing
  const { data: playbookResponse, isLoading: isLoadingPlaybook, error: playbookError } = usePlaybook(playbookId ?? undefined);
  const playbook = playbookResponse?.playbook;

  // Mutations
  const createPlaybook = useCreatePlaybook();
  const updatePlaybook = useUpdatePlaybook();

  // Initialize form from existing playbook
  useEffect(() => {
    if (playbook && isEditing) {
      setName(playbook.name);
      setTitle(playbook.title);
      setSteps(playbook.steps.map(s => {
        const stepType = s.stepType ?? 'task';
        const isFunctionStep = stepType === 'function';
        return {
          id: s.id,
          title: s.title,
          description: s.description ?? '',
          stepType: stepType as StepType,
          // Task step fields
          taskType: isFunctionStep ? '' : (s as { taskType?: TaskTypeValue }).taskType ?? '',
          priority: isFunctionStep ? '' : (s as { priority?: Priority }).priority ?? '',
          complexity: isFunctionStep ? '' : (s as { complexity?: Complexity }).complexity ?? '',
          assignee: isFunctionStep ? '' : (s as { assignee?: string }).assignee ?? '',
          // Function step fields
          runtime: isFunctionStep ? ((s as { runtime?: FunctionRuntime }).runtime ?? 'typescript') : 'typescript',
          code: isFunctionStep ? ((s as { code?: string }).code ?? '') : '',
          command: isFunctionStep ? ((s as { command?: string }).command ?? '') : '',
          timeout: isFunctionStep ? ((s as { timeout?: number }).timeout?.toString() ?? '') : '',
          // Common fields
          dependsOn: s.dependsOn ?? [],
          condition: s.condition ?? '',
        };
      }));
      setVariables(playbook.variables.map(v => ({
        name: v.name,
        description: v.description ?? '',
        type: v.type,
        required: v.required,
        default: v.default !== undefined ? String(v.default) : '',
        enum: v.enum?.map(String) ?? [],
      })));
    }
  }, [playbook, isEditing]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setTitle('');
      setSteps([]);
      setVariables([]);
      setActiveTab('steps');
      setSelectedStepIndex(null);
      setSelectedVariableIndex(null);
      setError(null);
    }
  }, [isOpen]);

  // Generate YAML preview
  const yamlPreview = useMemo(() => {
    return generateYaml(name || 'my_playbook', title || 'My Playbook', steps, variables);
  }, [name, title, steps, variables]);

  // All step IDs for dependency selection
  const allStepIds = useMemo(() => steps.map(s => s.id), [steps]);

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!name.trim()) errors.push('Name is required');
    if (!title.trim()) errors.push('Title is required');
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name) && name.trim()) {
      errors.push('Name must start with letter/underscore');
    }
    for (const step of steps) {
      if (!step.id.trim()) errors.push('All steps must have an ID');
      if (!step.title.trim()) errors.push('All steps must have a title');
    }
    for (const variable of variables) {
      if (!variable.name.trim()) errors.push('All variables must have a name');
    }
    return errors;
  }, [name, title, steps, variables]);

  const canSave = validationErrors.length === 0 && !createPlaybook.isPending && !updatePlaybook.isPending;

  // Handlers
  const handleAddStep = useCallback((stepType: StepType = 'task') => {
    const newStep: StepFormData = {
      id: generateStepId(),
      title: '',
      description: '',
      stepType,
      // Task step fields
      taskType: '',
      priority: '',
      complexity: '',
      assignee: '',
      // Function step fields
      runtime: 'typescript',
      code: '',
      command: '',
      timeout: '',
      // Common fields
      dependsOn: [],
      condition: '',
    };
    setSteps(prev => [...prev, newStep]);
    setSelectedStepIndex(steps.length);
  }, [steps.length]);

  const handleUpdateStep = useCallback((index: number, updatedStep: StepFormData) => {
    setSteps(prev => prev.map((s, i) => i === index ? updatedStep : s));
  }, []);

  const handleDeleteStep = useCallback((index: number) => {
    const stepId = steps[index]?.id;
    setSteps(prev => {
      const newSteps = prev.filter((_, i) => i !== index);
      return newSteps.map(s => ({
        ...s,
        dependsOn: s.dependsOn.filter(d => d !== stepId),
      }));
    });
    setSelectedStepIndex(null);
  }, [steps]);

  const handleMoveStep = useCallback((index: number, direction: 'up' | 'down') => {
    setSteps(prev => {
      const newSteps = [...prev];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
      return newSteps;
    });
    setSelectedStepIndex(direction === 'up' ? index - 1 : index + 1);
  }, []);

  const handleAddVariable = useCallback(() => {
    const newVariable: VariableFormData = {
      name: '',
      description: '',
      type: 'string',
      required: false,
      default: '',
      enum: [],
    };
    setVariables(prev => [...prev, newVariable]);
    setSelectedVariableIndex(variables.length);
  }, [variables.length]);

  const handleUpdateVariable = useCallback((index: number, updatedVariable: VariableFormData) => {
    setVariables(prev => prev.map((v, i) => i === index ? updatedVariable : v));
  }, []);

  const handleDeleteVariable = useCallback((index: number) => {
    setVariables(prev => prev.filter((_, i) => i !== index));
    setSelectedVariableIndex(null);
  }, []);

  const handleImportYaml = useCallback((yamlText: string) => {
    try {
      // Simple YAML parser for playbook format
      const lines = yamlText.split('\n');
      let parsedName = '';
      let parsedTitle = '';
      const parsedSteps: StepFormData[] = [];
      const parsedVariables: VariableFormData[] = [];

      let currentSection: 'root' | 'steps' | 'variables' = 'root';
      let currentItem: Partial<StepFormData> | Partial<VariableFormData> | null = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Check for section headers
        if (trimmed === 'steps:') {
          currentSection = 'steps';
          currentItem = null;
          continue;
        }
        if (trimmed === 'variables:') {
          currentSection = 'variables';
          currentItem = null;
          continue;
        }

        // Parse key-value pairs
        const match = trimmed.match(/^-?\s*(\w+):\s*(.*)$/);
        if (!match) continue;

        const [, key, rawValue] = match;
        // Remove quotes from value
        const value = rawValue.replace(/^["']|["']$/g, '');

        if (currentSection === 'root') {
          if (key === 'name') parsedName = value;
          else if (key === 'title') parsedTitle = value;
        } else if (currentSection === 'steps') {
          if (trimmed.startsWith('-')) {
            // New step item
            if (currentItem && 'id' in currentItem) {
              parsedSteps.push({
                id: currentItem.id || generateStepId(),
                title: currentItem.title || '',
                description: currentItem.description || '',
                stepType: 'task',
                taskType: '',
                priority: '',
                complexity: '',
                assignee: '',
                runtime: 'typescript',
                code: '',
                command: '',
                timeout: '',
                dependsOn: [],
                condition: '',
              } as StepFormData);
            }
            currentItem = { id: value };
          } else if (currentItem) {
            if (key === 'title') (currentItem as Partial<StepFormData>).title = value;
            else if (key === 'description') (currentItem as Partial<StepFormData>).description = value;
          }
        } else if (currentSection === 'variables') {
          if (trimmed.startsWith('-')) {
            // New variable item
            if (currentItem && 'name' in currentItem && currentItem.name) {
              parsedVariables.push({
                name: currentItem.name || '',
                description: (currentItem as Partial<VariableFormData>).description || '',
                type: (currentItem as Partial<VariableFormData>).type || 'string',
                required: (currentItem as Partial<VariableFormData>).required || false,
                default: (currentItem as Partial<VariableFormData>).default || '',
                enum: [],
              } as VariableFormData);
            }
            currentItem = { name: value };
          } else if (currentItem) {
            if (key === 'type') (currentItem as Partial<VariableFormData>).type = value as VariableType;
            else if (key === 'required') (currentItem as Partial<VariableFormData>).required = value === 'true';
            else if (key === 'description') (currentItem as Partial<VariableFormData>).description = value;
            else if (key === 'default') (currentItem as Partial<VariableFormData>).default = value;
          }
        }
      }

      // Don't forget the last item
      if (currentItem) {
        if (currentSection === 'steps' && 'id' in currentItem) {
          parsedSteps.push({
            id: currentItem.id || generateStepId(),
            title: currentItem.title || '',
            description: currentItem.description || '',
            stepType: 'task',
            taskType: '',
            priority: '',
            complexity: '',
            assignee: '',
            runtime: 'typescript',
            code: '',
            command: '',
            timeout: '',
            dependsOn: [],
            condition: '',
          } as StepFormData);
        } else if (currentSection === 'variables' && 'name' in currentItem && currentItem.name) {
          parsedVariables.push({
            name: currentItem.name || '',
            description: (currentItem as Partial<VariableFormData>).description || '',
            type: (currentItem as Partial<VariableFormData>).type || 'string',
            required: (currentItem as Partial<VariableFormData>).required || false,
            default: (currentItem as Partial<VariableFormData>).default || '',
            enum: [],
          } as VariableFormData);
        }
      }

      // Apply imported values
      if (parsedName) setName(parsedName);
      if (parsedTitle) setTitle(parsedTitle);
      if (parsedSteps.length > 0) setSteps(parsedSteps);
      if (parsedVariables.length > 0) setVariables(parsedVariables);

      // Switch to steps tab to show imported content
      setActiveTab('steps');
      setError(null);
    } catch (err) {
      setError('Failed to parse YAML. Please check the format and try again.');
    }
  }, []);

  const handleSave = async () => {
    setError(null);

    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '));
      return;
    }

    try {
      const stepsData = steps.map(formDataToStep);
      const variablesData = variables.map(formDataToVariable);

      if (isEditing && playbookId) {
        const result = await updatePlaybook.mutateAsync({
          playbookId,
          title,
          steps: stepsData,
          variables: variablesData,
        });
        onSuccess?.(result.playbook);
      } else {
        const result = await createPlaybook.mutateAsync({
          name,
          title,
          steps: stepsData,
          variables: variablesData,
        });
        onSuccess?.(result.playbook);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save playbook');
    }
  };

  if (!isOpen) return null;

  const isPending = createPlaybook.isPending || updatePlaybook.isPending;

  return (
    <div className="fixed inset-0 z-50" data-testid="workflow-editor-container">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
        data-testid="workflow-editor-backdrop"
      />

      {/* Dialog */}
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
        <div
          className="w-full max-w-3xl max-h-[90vh] mx-auto bg-[var(--color-bg)] rounded-xl shadow-2xl border border-[var(--color-border)] animate-scale-in pointer-events-auto flex flex-col"
          style={{ pointerEvents: 'auto' }}
          data-testid="workflow-editor-dialog"
          role="dialog"
          aria-labelledby="workflow-editor-title"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />
              <h2 id="workflow-editor-title" className="text-lg font-semibold text-[var(--color-text)]">
                {isEditing ? 'Edit Template' : 'Create Template'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
              aria-label="Close dialog"
              data-testid="workflow-editor-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Loading state */}
          {isLoadingPlaybook && isEditing && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
            </div>
          )}

          {/* Error state */}
          {(error || playbookError) && (
            <div className="mx-4 mt-4 flex items-center gap-2 px-3 py-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error || playbookError?.message || 'An error occurred'}
            </div>
          )}

          {/* Content */}
          {(!isLoadingPlaybook || !isEditing) && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Name & Title */}
              <div className="px-4 pt-4 pb-3 border-b border-[var(--color-border)] space-y-3 flex-shrink-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                      placeholder="my_playbook"
                      disabled={isEditing}
                      className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 font-mono disabled:opacity-50"
                      data-testid="playbook-name-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="My Playbook"
                      className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                      data-testid="playbook-title-input"
                    />
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="px-4 border-b border-[var(--color-border)] flex-shrink-0">
                <nav className="flex gap-4" aria-label="Editor tabs">
                  <button
                    onClick={() => setActiveTab('steps')}
                    className={`flex items-center gap-1.5 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'steps'
                        ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent'
                    }`}
                    data-testid="tab-steps"
                  >
                    <List className="w-4 h-4" />
                    Steps
                    <span className="px-1.5 py-0.5 text-xs rounded-full bg-[var(--color-surface)]">
                      {steps.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('variables')}
                    className={`flex items-center gap-1.5 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'variables'
                        ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent'
                    }`}
                    data-testid="tab-variables"
                  >
                    <Variable className="w-4 h-4" />
                    Variables
                    <span className="px-1.5 py-0.5 text-xs rounded-full bg-[var(--color-surface)]">
                      {variables.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('yaml')}
                    className={`flex items-center gap-1.5 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'yaml'
                        ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent'
                    }`}
                    data-testid="tab-yaml"
                  >
                    <Code className="w-4 h-4" />
                    YAML
                  </button>
                </nav>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-auto p-4">
                {/* Steps Tab */}
                {activeTab === 'steps' && (
                  <div className="grid grid-cols-2 gap-4 h-full">
                    {/* Step List */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-[var(--color-text)]">Steps</h3>
                        <div className="relative group">
                          <button
                            className="flex items-center gap-1 px-2 py-1 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded"
                            data-testid="add-step-button"
                          >
                            <Plus className="w-4 h-4" />
                            Add Step
                            <ChevronDown className="w-3 h-3 ml-0.5" />
                          </button>
                          {/* Dropdown menu */}
                          <div className="absolute right-0 mt-1 w-48 py-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                            <button
                              onClick={() => handleAddStep('task')}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                              data-testid="add-task-step"
                            >
                              <ClipboardList className="w-4 h-4 text-blue-500" />
                              <div className="text-left">
                                <div className="font-medium">Task Step</div>
                                <div className="text-xs text-[var(--color-text-tertiary)]">Agent-executed task</div>
                              </div>
                            </button>
                            <button
                              onClick={() => handleAddStep('function')}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                              data-testid="add-function-step"
                            >
                              <Terminal className="w-4 h-4 text-purple-500" />
                              <div className="text-left">
                                <div className="font-medium">Function Step</div>
                                <div className="text-xs text-[var(--color-text-tertiary)]">Execute code directly</div>
                              </div>
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 max-h-[400px] overflow-auto" data-testid="step-list">
                        {steps.length === 0 ? (
                          <div className="text-center py-8 text-sm text-[var(--color-text-tertiary)]">
                            <List className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            No steps yet. Click &quot;Add Step&quot; to begin.
                          </div>
                        ) : (
                          steps.map((step, index) => (
                            <StepListItem
                              key={step.id || index}
                              step={step}
                              index={index}
                              isSelected={selectedStepIndex === index}
                              onSelect={() => setSelectedStepIndex(index)}
                              onMoveUp={() => handleMoveStep(index, 'up')}
                              onMoveDown={() => handleMoveStep(index, 'down')}
                              onDelete={() => handleDeleteStep(index)}
                              isFirst={index === 0}
                              isLast={index === steps.length - 1}
                            />
                          ))
                        )}
                      </div>
                    </div>

                    {/* Step Form */}
                    <div className="border-l border-[var(--color-border)] pl-4">
                      {selectedStepIndex !== null && steps[selectedStepIndex] ? (
                        <StepForm
                          step={steps[selectedStepIndex]}
                          onChange={(updated) => handleUpdateStep(selectedStepIndex, updated)}
                          allStepIds={allStepIds}
                          onClose={() => setSelectedStepIndex(null)}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-tertiary)]">
                          <div className="text-center">
                            <Edit3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            Select a step to edit
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Variables Tab */}
                {activeTab === 'variables' && (
                  <div className="grid grid-cols-2 gap-4 h-full">
                    {/* Variable List */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-[var(--color-text)]">Variables</h3>
                        <button
                          onClick={handleAddVariable}
                          className="flex items-center gap-1 px-2 py-1 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded"
                          data-testid="add-variable-button"
                        >
                          <Plus className="w-4 h-4" />
                          Add Variable
                        </button>
                      </div>
                      <div className="space-y-2 max-h-[400px] overflow-auto" data-testid="variable-list">
                        {variables.length === 0 ? (
                          <div className="text-center py-8 text-sm text-[var(--color-text-tertiary)]">
                            <Variable className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            No variables yet. Click &quot;Add Variable&quot; to begin.
                          </div>
                        ) : (
                          variables.map((variable, index) => (
                            <div
                              key={variable.name || index}
                              className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors duration-150 ${
                                selectedVariableIndex === index
                                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]'
                                  : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50'
                              }`}
                              onClick={() => setSelectedVariableIndex(index)}
                              data-testid={`variable-item-${variable.name}`}
                            >
                              <Variable className="w-4 h-4 text-[var(--color-primary)] flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-[var(--color-text)] truncate font-mono">
                                    {variable.name || 'unnamed'}
                                  </span>
                                  {variable.required && (
                                    <span className="text-red-500 text-xs">required</span>
                                  )}
                                </div>
                                <div className="text-xs text-[var(--color-text-tertiary)]">
                                  {variable.type}
                                  {variable.enum.length > 0 && ` (enum: ${variable.enum.length})`}
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteVariable(index); }}
                                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                                title="Delete variable"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Variable Form */}
                    <div className="border-l border-[var(--color-border)] pl-4">
                      {selectedVariableIndex !== null && variables[selectedVariableIndex] ? (
                        <VariableForm
                          variable={variables[selectedVariableIndex]}
                          onChange={(updated) => handleUpdateVariable(selectedVariableIndex, updated)}
                          onClose={() => setSelectedVariableIndex(null)}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-tertiary)]">
                          <div className="text-center">
                            <Edit3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            Select a variable to edit
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* YAML Tab */}
                {activeTab === 'yaml' && (
                  <YamlPreview yaml={yamlPreview} onImport={handleImportYaml} />
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)] flex-shrink-0">
            <div className="text-xs text-[var(--color-text-tertiary)]">
              {steps.length} step{steps.length !== 1 ? 's' : ''}, {variables.length} variable{variables.length !== 1 ? 's' : ''}
              {validationErrors.length > 0 && (
                <span className="ml-2 text-red-500">
                  ({validationErrors.length} validation error{validationErrors.length !== 1 ? 's' : ''})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors"
                data-testid="cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                data-testid="save-button"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {isEditing ? 'Save Changes' : 'Create Template'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
