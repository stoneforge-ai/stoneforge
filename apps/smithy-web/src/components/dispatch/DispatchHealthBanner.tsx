import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useDaemonStatus } from '../../api/hooks/useDaemon';

interface DispatchHealthBannerProps {
  /** Optional layout classes applied to the outer banner element. Lets each mount site control its own page-specific padding without leaving an empty wrapper when the banner self-hides. */
  className?: string;
}

export function DispatchHealthBanner({ className }: DispatchHealthBannerProps = {}) {
  const { data } = useDaemonStatus();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (!data?.health?.hasStuckQueue) return null;

  const { readyUnassignedTasks } = data.health;

  const baseClasses = 'mb-4 flex items-start gap-3 px-4 py-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100';

  return (
    <div
      className={className ? `${className} ${baseClasses}` : baseClasses}
      data-testid="dispatch-health-banner"
      role="alert"
    >
      <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-medium">Dispatch is stuck.</div>
        <div className="mt-1">
          {readyUnassignedTasks} task(s) ready, no available workers. Register or enable a worker to start dispatching.
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
