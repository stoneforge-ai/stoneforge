/**
 * TeamCard - Desktop team card display
 */

import { Users } from 'lucide-react';
import { MemberAvatarStack } from './MemberAvatarStack';
import type { Team } from '../types';

interface TeamCardProps {
  team: Team;
  isSelected: boolean;
  onClick: () => void;
}

export function TeamCard({ team, isSelected, onClick }: TeamCardProps) {
  const isActive = team.status !== 'tombstone';
  const memberCount = team.members?.length || 0;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border p-4 transition-colors cursor-pointer ${
        isSelected
          ? 'border-blue-500 ring-2 ring-blue-200'
          : 'border-gray-200 hover:border-gray-300'
      } ${!isActive ? 'opacity-60' : ''}`}
      data-testid={`team-card-${team.id}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center"
          data-testid={`team-avatar-${team.id}`}
        >
          <Users className="w-5 h-5 text-indigo-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 truncate">{team.name}</h3>
            {!isActive && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                Deleted
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono truncate">{team.id}</p>
        </div>

        <span
          className="px-2 py-1 text-xs font-medium rounded bg-indigo-100 text-indigo-800"
          data-testid={`team-member-count-${team.id}`}
        >
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </span>
      </div>

      {/* Member Avatar Stack */}
      {memberCount > 0 && (
        <div className="mt-3">
          <MemberAvatarStack memberIds={team.members} maxDisplay={5} />
        </div>
      )}

      {/* Tags */}
      {team.tags && team.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {team.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              {tag}
            </span>
          ))}
          {team.tags.length > 3 && (
            <span className="text-xs text-gray-500">+{team.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Created {new Date(team.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}
