import React from 'react';
import { AppHeader } from './AppHeader';
import { User } from '../../types';

interface AppLayoutProps {
  children: React.ReactNode;
  currentUser: User | null;
  onLogout: () => void;
  onShowActivity: () => void;
  onShowProfile: () => void;
  onShowDocuments: () => void;
  onShowOrganizations: () => void;
  onShowAdmin?: () => void;
  showBackButton?: boolean;
  onBack?: () => void;
  title?: string;
  showCreateButton?: boolean;
  onCreateDocument?: () => void;
}

export function AppLayout({
  children,
  currentUser,
  onLogout,
  onShowActivity,
  onShowProfile,
  onShowDocuments,
  onShowOrganizations,
  onShowAdmin,
  showBackButton = false,
  onBack,
  title,
  showCreateButton = false,
  onCreateDocument,
}: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Global Header */}
      <AppHeader
        currentUser={currentUser}
        onLogout={onLogout}
        onShowActivity={onShowActivity}
        onShowProfile={onShowProfile}
        onShowDocuments={onShowDocuments}
        onShowOrganizations={onShowOrganizations}
        onShowAdmin={onShowAdmin}
        showBackButton={showBackButton}
        onBack={onBack}
        title={title}
        showCreateButton={showCreateButton}
        onCreateDocument={onCreateDocument}
      />

      {/* Main Content */}
      {children}
    </div>
  );
}
