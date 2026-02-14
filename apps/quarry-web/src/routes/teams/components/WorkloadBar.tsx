/**
 * WorkloadBar - Displays workload distribution for a team member
 */

import { useNavigate } from '@tanstack/react-router';

interface WorkloadBarProps {
  memberId: string;
  memberName: string;
  taskCount: number;
  percentage: number;
  maxTasks: number;
  onClick?: () => void;
}

export function WorkloadBar({
  memberId,
  memberName,
  taskCount,
  percentage,
  maxTasks,
  onClick,
}: WorkloadBarProps) {
  const barWidth = maxTasks > 0 ? Math.round((taskCount / maxTasks) * 100) : 0;
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      // Default behavior: navigate to tasks filtered by this member (TB105)
      navigate({
        to: '/tasks',
        search: { assignee: memberId, page: 1, limit: 25 },
      });
    }
  };

  return (
    <button
      className="flex items-center gap-3 w-full text-left hover:bg-gray-50 rounded p-1 -mx-1 transition-colors cursor-pointer group"
      data-testid={`workload-bar-${memberId}`}
      onClick={handleClick}
      title={`Click to view ${memberName}'s tasks`}
    >
      <div className="w-24 truncate text-sm text-gray-700 group-hover:text-blue-600">{memberName}</div>
      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="w-16 text-right text-sm text-gray-600">
        {taskCount} ({percentage}%)
      </div>
    </button>
  );
}
