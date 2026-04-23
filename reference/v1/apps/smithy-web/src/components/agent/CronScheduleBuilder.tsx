/**
 * CronScheduleBuilder - Human-friendly cron schedule builder
 *
 * Provides a visual schedule builder that generates valid cron expressions.
 * Users can pick from common patterns (hourly, daily, weekly, monthly) and
 * customize them, or toggle to raw cron syntax for advanced use.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, Code, Calendar } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

type Frequency = 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

interface BuilderState {
  frequency: Frequency;
  interval: number; // 1 = every, 2 = every other, 4 = every 4th, etc.
  minute: number;
  hour: number;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  dayOfMonth: number;
}

export interface CronScheduleBuilderProps {
  /** Current cron expression value */
  value: string;
  /** Callback when the cron expression changes */
  onChange: (schedule: string) => void;
  /** Test ID prefix for testing */
  testIdPrefix?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

const FREQUENCY_OPTIONS: { value: Frequency; label: string; description: string }[] = [
  { value: 'minutely', label: 'Minutes', description: 'Runs every N minutes' },
  { value: 'hourly', label: 'Hourly', description: 'Runs every N hours' },
  { value: 'daily', label: 'Daily', description: 'Runs every N days' },
  { value: 'weekly', label: 'Weekly', description: 'Runs once every week' },
  { value: 'monthly', label: 'Monthly', description: 'Runs once every month' },
  { value: 'custom', label: 'Custom', description: 'Write a cron expression directly' },
];

/** Common interval options for each frequency */
const INTERVAL_OPTIONS: Record<string, number[]> = {
  minutely: [1, 2, 3, 5, 10, 15, 20, 30],
  hourly: [1, 2, 3, 4, 6, 8, 12],
  daily: [1, 2, 3, 5, 7, 10, 14, 30],
};

// ============================================================================
// Cron Utilities
// ============================================================================

/**
 * Validates a cron expression (mirrors backend isValidCronExpression).
 */
export function isValidCronExpression(schedule: string): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    return false;
  }
  const cronFieldPattern = /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*)(\/\d+)?$/;
  return parts.every(part => cronFieldPattern.test(part) || part === '*');
}

/**
 * Generates a cron expression from builder state.
 * Supports step values via the interval field (e.g., interval=4 with hourly generates a step cron).
 */
function builderToCron(state: BuilderState): string {
  const interval = state.interval ?? 1;
  switch (state.frequency) {
    case 'minutely':
      return interval > 1
        ? `*/${interval} * * * *`
        : '* * * * *';
    case 'hourly':
      return interval > 1
        ? `${state.minute} */${interval} * * *`
        : `${state.minute} * * * *`;
    case 'daily':
      return interval > 1
        ? `${state.minute} ${state.hour} */${interval} * *`
        : `${state.minute} ${state.hour} * * *`;
    case 'weekly':
      return `${state.minute} ${state.hour} * * ${state.dayOfWeek}`;
    case 'monthly':
      return `${state.minute} ${state.hour} ${state.dayOfMonth} * *`;
    case 'custom':
      return ''; // Handled by raw input
  }
}

/**
 * Attempts to parse a cron expression back into builder state.
 * Returns null if the expression doesn't match a builder pattern.
 * Supports step values (star-slash-N) in minute, hour, and day fields.
 */
function cronToBuilder(cron: string): BuilderState | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minutePart, hourPart, dayPart, monthPart, weekdayPart] = parts;

  // Check if parts are simple numbers or wildcards
  const isSimpleNum = (p: string) => /^\d+$/.test(p);
  const isWild = (p: string) => p === '*';
  const isStep = (p: string) => /^\*\/\d+$/.test(p);
  const toNum = (p: string) => parseInt(p, 10);
  const getStep = (p: string) => toNum(p.split('/')[1]);

  // Minutely with step: */N * * * *
  if (isStep(minutePart) && isWild(hourPart) && isWild(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    return { frequency: 'minutely', interval: getStep(minutePart), minute: 0, hour: 0, dayOfWeek: 1, dayOfMonth: 1 };
  }

  // Every minute: * * * * *
  if (isWild(minutePart) && isWild(hourPart) && isWild(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    return { frequency: 'minutely', interval: 1, minute: 0, hour: 0, dayOfWeek: 1, dayOfMonth: 1 };
  }

  // Hourly with step: N */N * * *
  if (isSimpleNum(minutePart) && isStep(hourPart) && isWild(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    return { frequency: 'hourly', interval: getStep(hourPart), minute: toNum(minutePart), hour: 0, dayOfWeek: 1, dayOfMonth: 1 };
  }

  // Hourly: N * * * *
  if (isSimpleNum(minutePart) && isWild(hourPart) && isWild(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    return { frequency: 'hourly', interval: 1, minute: toNum(minutePart), hour: 0, dayOfWeek: 1, dayOfMonth: 1 };
  }

  // Daily with step: N N */N * *
  if (isSimpleNum(minutePart) && isSimpleNum(hourPart) && isStep(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    return { frequency: 'daily', interval: getStep(dayPart), minute: toNum(minutePart), hour: toNum(hourPart), dayOfWeek: 1, dayOfMonth: 1 };
  }

  // Daily: N N * * *
  if (isSimpleNum(minutePart) && isSimpleNum(hourPart) && isWild(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    return { frequency: 'daily', interval: 1, minute: toNum(minutePart), hour: toNum(hourPart), dayOfWeek: 1, dayOfMonth: 1 };
  }

  // Weekly: N N * * N
  if (isSimpleNum(minutePart) && isSimpleNum(hourPart) && isWild(dayPart) && isWild(monthPart) && isSimpleNum(weekdayPart)) {
    return { frequency: 'weekly', interval: 1, minute: toNum(minutePart), hour: toNum(hourPart), dayOfWeek: toNum(weekdayPart), dayOfMonth: 1 };
  }

  // Monthly: N N N * *
  if (isSimpleNum(minutePart) && isSimpleNum(hourPart) && isSimpleNum(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    return { frequency: 'monthly', interval: 1, minute: toNum(minutePart), hour: toNum(hourPart), dayOfWeek: 1, dayOfMonth: toNum(dayPart) };
  }

  return null;
}

/**
 * Generates a human-readable description of a cron expression.
 */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return 'Invalid cron expression';

  // Handle 6-part (with seconds) by ignoring seconds
  const [minutePart, hourPart, dayPart, monthPart, weekdayPart] =
    parts.length === 6 ? parts.slice(1) : parts;

  const isWild = (p: string) => p === '*';
  const isSimpleNum = (p: string) => /^\d+$/.test(p);
  const toNum = (p: string) => parseInt(p, 10);

  const formatTime = (h: number, m: number): string => {
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const getDayName = (d: number): string => {
    return DAYS_OF_WEEK[d % 7]?.label ?? `day ${d}`;
  };

  const getOrdinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Handle step patterns like */5
  const isStep = (p: string) => p.startsWith('*/');
  const getStep = (p: string) => toNum(p.split('/')[1]);

  // Every N minutes
  if (isStep(minutePart) && isWild(hourPart) && isWild(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    const step = getStep(minutePart);
    return `Every ${step} minute${step === 1 ? '' : 's'}`;
  }

  // Every minute
  if (isWild(minutePart) && isWild(hourPart) && isWild(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    return 'Every minute';
  }

  // Every N hours at minute M: M */N * * *
  if (isSimpleNum(minutePart) && isStep(hourPart) && isWild(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    const step = getStep(hourPart);
    const m = toNum(minutePart);
    const hourDesc = `Every ${step} hour${step === 1 ? '' : 's'}`;
    return m === 0 ? hourDesc : `${hourDesc} at minute ${m}`;
  }

  // Every hour at minute N
  if (isSimpleNum(minutePart) && isWild(hourPart) && isWild(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    const m = toNum(minutePart);
    return m === 0
      ? 'Every hour, on the hour'
      : `Every hour at minute ${m}`;
  }

  // Every N days at specific time: M H */N * *
  if (isSimpleNum(minutePart) && isSimpleNum(hourPart) && isStep(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    const step = getStep(dayPart);
    return `Every ${step} day${step === 1 ? '' : 's'} at ${formatTime(toNum(hourPart), toNum(minutePart))}`;
  }

  // Every day at specific time
  if (isSimpleNum(minutePart) && isSimpleNum(hourPart) && isWild(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    return `Every day at ${formatTime(toNum(hourPart), toNum(minutePart))}`;
  }

  // Every week on specific day at specific time
  if (isSimpleNum(minutePart) && isSimpleNum(hourPart) && isWild(dayPart) && isWild(monthPart) && isSimpleNum(weekdayPart)) {
    return `Every ${getDayName(toNum(weekdayPart))} at ${formatTime(toNum(hourPart), toNum(minutePart))}`;
  }

  // Every month on specific day at specific time
  if (isSimpleNum(minutePart) && isSimpleNum(hourPart) && isSimpleNum(dayPart) && isWild(monthPart) && isWild(weekdayPart)) {
    return `${getOrdinal(toNum(dayPart))} of every month at ${formatTime(toNum(hourPart), toNum(minutePart))}`;
  }

  // Fallback: try to describe what we can
  return `Custom schedule: ${cron}`;
}

// ============================================================================
// Component
// ============================================================================

const defaultBuilderState: BuilderState = {
  frequency: 'hourly',
  interval: 1,
  minute: 0,
  hour: 9,
  dayOfWeek: 1, // Monday
  dayOfMonth: 1,
};

export function CronScheduleBuilder({
  value,
  onChange,
  testIdPrefix = 'cron-builder',
}: CronScheduleBuilderProps) {
  // Mode: 'builder' or 'raw'
  const [mode, setMode] = useState<'builder' | 'raw'>('builder');
  const [builder, setBuilder] = useState<BuilderState>(defaultBuilderState);
  const [rawValue, setRawValue] = useState(value);
  const [rawError, setRawError] = useState<string | null>(null);

  // On mount or when value prop changes externally, try to parse into builder
  useEffect(() => {
    const parsed = cronToBuilder(value);
    if (parsed) {
      setBuilder(parsed);
      setMode('builder');
    } else if (value && value !== builderToCron(builder)) {
      // Can't parse — show in raw mode
      setRawValue(value);
      // Only switch to raw if it's truly custom (not a builder-generated value)
      if (value !== '0 * * * *') {
        setMode('raw');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Generate cron from builder whenever builder state changes
  const generatedCron = useMemo(() => builderToCron(builder), [builder]);

  // Human-readable description
  const description = useMemo(() => {
    const cronToDescribe = mode === 'raw' ? rawValue : generatedCron;
    if (!cronToDescribe) return '';
    return describeCron(cronToDescribe);
  }, [mode, rawValue, generatedCron]);

  // Update parent when builder changes
  const handleBuilderChange = useCallback(
    (updates: Partial<BuilderState>) => {
      setBuilder(prev => {
        const next = { ...prev, ...updates };
        const cron = builderToCron(next);
        if (cron) {
          onChange(cron);
        }
        return next;
      });
    },
    [onChange]
  );

  // Update parent when raw value changes
  const handleRawChange = useCallback(
    (newValue: string) => {
      setRawValue(newValue);
      if (isValidCronExpression(newValue)) {
        setRawError(null);
        onChange(newValue);
      } else if (newValue.trim()) {
        setRawError('Invalid cron expression. Expected format: * * * * * (minute hour day month weekday)');
      } else {
        setRawError(null);
      }
    },
    [onChange]
  );

  // Toggle between modes
  const toggleMode = useCallback(() => {
    if (mode === 'builder') {
      // Switching to raw — populate with generated expression
      setRawValue(generatedCron);
      setRawError(null);
      setMode('raw');
    } else {
      // Switching to builder — try to parse raw expression
      const parsed = cronToBuilder(rawValue);
      if (parsed) {
        setBuilder(parsed);
        setMode('builder');
      } else {
        // Can't parse; set to custom and keep in builder with defaults
        setBuilder(defaultBuilderState);
        onChange(builderToCron(defaultBuilderState));
        setMode('builder');
      }
    }
  }, [mode, generatedCron, rawValue, onChange]);

  // Generate minute options
  const minuteOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 60; i += 5) {
      options.push(i);
    }
    return options;
  }, []);

  // Generate hour options
  const hourOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 24; i++) {
      options.push(i);
    }
    return options;
  }, []);

  const formatHour = (h: number): string => {
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:00 ${period}`;
  };

  const formatMinute = (m: number): string => {
    return `:${m.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-2" data-testid={testIdPrefix}>
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={toggleMode}
          className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] transition-colors"
          data-testid={`${testIdPrefix}-mode-toggle`}
        >
          {mode === 'builder' ? (
            <>
              <Code className="w-3 h-3" />
              Use cron syntax
            </>
          ) : (
            <>
              <Calendar className="w-3 h-3" />
              Use schedule builder
            </>
          )}
        </button>
      </div>

      {mode === 'builder' ? (
        /* ====================== Builder Mode ====================== */
        <div className="space-y-2">
          {/* Frequency selector */}
          <div className="flex flex-wrap gap-1">
            {FREQUENCY_OPTIONS.filter(f => f.value !== 'custom').map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  handleBuilderChange({ frequency: option.value, interval: 1 });
                }}
                className={`
                  px-2.5 py-1 text-xs rounded-full border transition-all
                  ${builder.frequency === option.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-primary)] font-medium'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]'
                  }
                `}
                data-testid={`${testIdPrefix}-freq-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Conditional inputs based on frequency */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            {/* Minutely: every [N] minutes */}
            {builder.frequency === 'minutely' && (
              <>
                <span>Every</span>
                <select
                  value={builder.interval}
                  onChange={e => handleBuilderChange({ interval: parseInt(e.target.value, 10) })}
                  className="
                    px-2 py-1 text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`${testIdPrefix}-interval`}
                >
                  {INTERVAL_OPTIONS.minutely.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>minute{builder.interval === 1 ? '' : 's'}</span>
              </>
            )}

            {/* Hourly: every [N] hours at minute [M] */}
            {builder.frequency === 'hourly' && (
              <>
                <span>Every</span>
                <select
                  value={builder.interval}
                  onChange={e => handleBuilderChange({ interval: parseInt(e.target.value, 10) })}
                  className="
                    px-2 py-1 text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`${testIdPrefix}-interval`}
                >
                  {INTERVAL_OPTIONS.hourly.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>hour{builder.interval === 1 ? '' : 's'} at minute</span>
                <select
                  value={builder.minute}
                  onChange={e => handleBuilderChange({ minute: parseInt(e.target.value, 10) })}
                  className="
                    px-2 py-1 text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`${testIdPrefix}-minute`}
                >
                  {minuteOptions.map(m => (
                    <option key={m} value={m}>{formatMinute(m)}</option>
                  ))}
                </select>
              </>
            )}

            {/* Daily: every [N] days at HH:MM */}
            {builder.frequency === 'daily' && (
              <>
                <span>Every</span>
                <select
                  value={builder.interval}
                  onChange={e => handleBuilderChange({ interval: parseInt(e.target.value, 10) })}
                  className="
                    px-2 py-1 text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`${testIdPrefix}-interval`}
                >
                  {INTERVAL_OPTIONS.daily.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>day{builder.interval === 1 ? '' : 's'} at</span>
                <select
                  value={builder.hour}
                  onChange={e => handleBuilderChange({ hour: parseInt(e.target.value, 10) })}
                  className="
                    px-2 py-1 text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`${testIdPrefix}-hour`}
                >
                  {hourOptions.map(h => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
                <select
                  value={builder.minute}
                  onChange={e => handleBuilderChange({ minute: parseInt(e.target.value, 10) })}
                  className="
                    px-2 py-1 text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`${testIdPrefix}-minute`}
                >
                  {minuteOptions.map(m => (
                    <option key={m} value={m}>{formatMinute(m)}</option>
                  ))}
                </select>
              </>
            )}

            {/* Weekly: on [day] at [time] */}
            {builder.frequency === 'weekly' && (
              <>
                <span>on</span>
                <select
                  value={builder.dayOfWeek}
                  onChange={e => handleBuilderChange({ dayOfWeek: parseInt(e.target.value, 10) })}
                  className="
                    px-2 py-1 text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`${testIdPrefix}-day-of-week`}
                >
                  {DAYS_OF_WEEK.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
                <span>at</span>
                <select
                  value={builder.hour}
                  onChange={e => handleBuilderChange({ hour: parseInt(e.target.value, 10) })}
                  className="
                    px-2 py-1 text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`${testIdPrefix}-hour`}
                >
                  {hourOptions.map(h => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
                <select
                  value={builder.minute}
                  onChange={e => handleBuilderChange({ minute: parseInt(e.target.value, 10) })}
                  className="
                    px-2 py-1 text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`${testIdPrefix}-minute`}
                >
                  {minuteOptions.map(m => (
                    <option key={m} value={m}>{formatMinute(m)}</option>
                  ))}
                </select>
              </>
            )}

            {/* Monthly: on day [N] at [time] */}
            {builder.frequency === 'monthly' && (
              <>
                <span>on day</span>
                <select
                  value={builder.dayOfMonth}
                  onChange={e => handleBuilderChange({ dayOfMonth: parseInt(e.target.value, 10) })}
                  className="
                    px-2 py-1 text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`${testIdPrefix}-day-of-month`}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <span>at</span>
                <select
                  value={builder.hour}
                  onChange={e => handleBuilderChange({ hour: parseInt(e.target.value, 10) })}
                  className="
                    px-2 py-1 text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`${testIdPrefix}-hour`}
                >
                  {hourOptions.map(h => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
                <select
                  value={builder.minute}
                  onChange={e => handleBuilderChange({ minute: parseInt(e.target.value, 10) })}
                  className="
                    px-2 py-1 text-xs
                    bg-[var(--color-bg)]
                    border border-[var(--color-border)]
                    rounded
                    focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
                  "
                  data-testid={`${testIdPrefix}-minute`}
                >
                  {minuteOptions.map(m => (
                    <option key={m} value={m}>{formatMinute(m)}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* Generated cron expression (visible for learning) */}
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-xs">
            <Clock className="w-3 h-3 text-[var(--color-text-tertiary)] flex-shrink-0" />
            <span className="font-mono text-[var(--color-text-secondary)]">{generatedCron}</span>
            <span className="text-[var(--color-text-tertiary)]">—</span>
            <span className="text-[var(--color-text-tertiary)]">{description}</span>
          </div>
        </div>
      ) : (
        /* ====================== Raw Mode ====================== */
        <div className="space-y-1.5">
          <input
            type="text"
            value={rawValue}
            onChange={e => handleRawChange(e.target.value)}
            placeholder="0 * * * * (every hour)"
            className={`
              w-full px-2 py-1
              text-xs font-mono
              bg-[var(--color-bg)]
              border rounded
              focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30
              ${rawError
                ? 'border-red-400 dark:border-red-600'
                : 'border-[var(--color-border)]'
              }
            `}
            data-testid={`${testIdPrefix}-raw-input`}
          />

          {/* Validation error */}
          {rawError && (
            <p className="text-xs text-red-600 dark:text-red-400" data-testid={`${testIdPrefix}-raw-error`}>
              {rawError}
            </p>
          )}

          {/* Human-readable description for valid expressions */}
          {!rawError && rawValue.trim() && isValidCronExpression(rawValue) && (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-xs">
              <Clock className="w-3 h-3 text-[var(--color-text-tertiary)] flex-shrink-0" />
              <span className="text-[var(--color-text-tertiary)]">{description}</span>
            </div>
          )}

          {/* Syntax help */}
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Format: minute (0-59) hour (0-23) day (1-31) month (1-12) weekday (0-6, Sun=0)
          </p>
        </div>
      )}
    </div>
  );
}
