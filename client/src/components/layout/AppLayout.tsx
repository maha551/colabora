import React from 'react';
import { AppHeader } from './AppHeader';
import { User, Organization } from '../../types';

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
  organization?: Organization | null;
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
  organization,
}: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Global Header with integrated organization branding */}
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
        organization={organization}
      />

      {/* Main Content */}
      {children}
    </div>
  );
}
