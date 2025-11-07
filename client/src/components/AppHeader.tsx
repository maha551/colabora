import React from 'react';
import { User } from '../types';
import { UserMenu } from './UserMenu';

interface AppHeaderProps {
  currentUser: User;
  onLogout: () => void;
  onShowActivity?: () => void;
  onShowProfile?: () => void;
  onShowDocuments?: () => void;
  showBackButton?: boolean;
  onBack?: () => void;
  title?: string;
}

export function AppHeader({
  currentUser,
  onLogout,
  onShowActivity,
  onShowProfile,
  onShowDocuments,
  showBackButton = false,
  onBack,
  title,
}: AppHeaderProps) {
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {showBackButton && onBack && (
              <button
                onClick={onBack}
                className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                aria-label="Go back"
              >
                ←
              </button>
            )}
            {title && (
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            )}
          </div>

          <div className="flex items-center gap-4">
            <UserMenu
              currentUser={currentUser}
              onLogout={onLogout}
              onShowActivity={onShowActivity}
              onShowProfile={onShowProfile}
              onShowDocuments={onShowDocuments}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
