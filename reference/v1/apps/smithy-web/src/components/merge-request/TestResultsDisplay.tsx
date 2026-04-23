/**
 * TestResultsDisplay - Visual display of test results
 *
 * Features:
 * - Progress bar showing pass/fail ratio
 * - Test counts (passed, failed, skipped)
 * - Duration display
 * - Error message display
 */

import { CheckCircle2, XCircle, AlertTriangle, Clock, SkipForward } from 'lucide-react';
import type { TestResult } from '../../api/types';

interface TestResultsDisplayProps {
  result: TestResult;
  compact?: boolean;
}

export function TestResultsDisplay({ result, compact = false }: TestResultsDisplayProps) {
  const {
    passed,
    totalTests,
    passedTests,
    failedTests,
    skippedTests,
    durationMs,
    errorMessage,
  } = result;

  const hasDetails = totalTests !== undefined;
  const passPercentage = hasDetails && totalTests > 0
    ? Math.round(((passedTests ?? 0) / totalTests) * 100)
    : passed ? 100 : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        {passed ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : (
          <XCircle className="w-4 h-4 text-red-500" />
        )}
        <span className={passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
          {hasDetails ? (
            `${passedTests ?? 0}/${totalTests} passed`
          ) : (
            passed ? 'Passed' : 'Failed'
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="test-results-display">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {passed ? (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Tests Passed</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">Tests Failed</span>
            </div>
          )}
        </div>
        {durationMs !== undefined && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatDuration(durationMs)}</span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {hasDetails && totalTests > 0 && (
        <div className="space-y-2">
          <div className="h-2 bg-[var(--color-surface-elevated)] rounded-full overflow-hidden">
            <div className="h-full flex">
              {/* Passed portion */}
              {(passedTests ?? 0) > 0 && (
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${((passedTests ?? 0) / totalTests) * 100}%` }}
                />
              )}
              {/* Failed portion */}
              {(failedTests ?? 0) > 0 && (
                <div
                  className="h-full bg-red-500"
                  style={{ width: `${((failedTests ?? 0) / totalTests) * 100}%` }}
                />
              )}
              {/* Skipped portion */}
              {(skippedTests ?? 0) > 0 && (
                <div
                  className="h-full bg-yellow-500"
                  style={{ width: `${((skippedTests ?? 0) / totalTests) * 100}%` }}
                />
              )}
            </div>
          </div>

          {/* Counts */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{passedTests ?? 0} passed</span>
            </div>
            {(failedTests ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <XCircle className="w-3.5 h-3.5" />
                <span>{failedTests} failed</span>
              </div>
            )}
            {(skippedTests ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
                <SkipForward className="w-3.5 h-3.5" />
                <span>{skippedTests} skipped</span>
              </div>
            )}
            <div className="text-[var(--color-text-tertiary)] ml-auto">
              {passPercentage}% pass rate
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <pre className="text-xs font-mono text-red-700 dark:text-red-300 whitespace-pre-wrap break-words overflow-x-auto">
              {errorMessage}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
