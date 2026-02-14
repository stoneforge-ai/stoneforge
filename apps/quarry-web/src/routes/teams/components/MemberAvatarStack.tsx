/**
 * MemberAvatarStack - Displays stacked member avatars
 */

import { Users } from 'lucide-react';

interface MemberAvatarStackProps {
  memberIds: string[];
  maxDisplay?: number;
}

export function MemberAvatarStack({ memberIds, maxDisplay = 5 }: MemberAvatarStackProps) {
  const displayCount = Math.min(memberIds.length, maxDisplay);
  const remaining = memberIds.length - displayCount;

  return (
    <div className="flex -space-x-2" data-testid="member-avatar-stack">
      {Array.from({ length: displayCount }).map((_, i) => (
        <div
          key={i}
          className="w-8 h-8 rounded-full bg-gray-200 ring-2 ring-white flex items-center justify-center"
        >
          <Users className="w-4 h-4 text-gray-400" />
        </div>
      ))}
      {remaining > 0 && (
        <div className="w-8 h-8 rounded-full bg-gray-100 ring-2 ring-white flex items-center justify-center text-xs font-medium text-gray-600">
          +{remaining}
        </div>
      )}
    </div>
  );
}
