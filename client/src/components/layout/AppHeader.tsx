import React from 'react';
import { User, Organization } from '../types';
import { UserMenu } from '../UserMenu';
import { Button } from '../ui/button';
import { Plus } from 'lucide-react';

interface AppHeaderProps {
  currentUser: User;
  onLogout: () => void;
  onShowActivity?: () => void;
  onShowProfile?: () => void;
  onShowDocuments?: () => void;
  onShowOrganizations?: () => void;
  onShowAdmin?: () => void;
  showBackButton?: boolean;
  onBack?: () => void;
  title?: string;
  onCreateDocument?: () => void;
  showCreateButton?: boolean;
  organization?: Organization | null;
}

/**
 * Calculate luminance of a color to determine if text should be light or dark
 * Returns true if text should be light (for dark backgrounds)
 */
function shouldUseLightText(hexColor: string): boolean {
  if (!hexColor || !hexColor.startsWith('#')) {
    return false;
  }

  // Remove # and convert to RGB
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Use light text if background is dark (luminance < 0.5)
  return luminance < 0.5;
}

export function AppHeader({
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
  onCreateDocument,
  showCreateButton = false,
  organization,
}: AppHeaderProps) {
  // Determine branding values when organization is provided
  const useBranding = !!organization;
  const backgroundColor = useBranding 
    ? (organization.brandingColor || '#3B82F6')
    : '#ffffff';
  const logoUrl = organization?.brandingLogoUrl;
  const displayTitle = organization 
    ? (organization.brandingTitle || organization.name || title)
    : title;
  const textColor = useBranding && shouldUseLightText(backgroundColor) 
    ? '#ffffff' 
    : (useBranding ? '#000000' : '#111827');
  
  // Determine header styling
  const headerBackgroundColor = backgroundColor;
  const headerTextColor = textColor;
  const borderColor = useBranding ? 'transparent' : '#e5e7eb';

  return (
    <div 
      className="border-b"
      style={{
        backgroundColor: headerBackgroundColor,
        borderColor: borderColor,
      }}
    >
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {showBackButton && onBack && (
              <button
                onClick={onBack}
                className="p-2 rounded-md transition-colors"
                style={{
                  color: headerTextColor,
                  backgroundColor: useBranding ? 'rgba(0,0,0,0.1)' : undefined,
                }}
                onMouseEnter={(e) => {
                  if (useBranding) {
                    e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.2)';
                  } else {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }
                }}
                onMouseLeave={(e) => {
                  if (useBranding) {
                    e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)';
                  } else {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
                aria-label="Go back"
              >
                ←
              </button>
            )}
            {logoUrl && (
              <img
                src={logoUrl}
                alt={`${organization?.name || 'Organization'} logo`}
                className="h-10 w-10 object-contain rounded"
                onError={(e) => {
                  // Hide broken images
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            {displayTitle && (
              <h1 
                className="text-2xl font-bold"
                style={{ color: headerTextColor }}
              >
                {displayTitle}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-4">
            {showCreateButton && onCreateDocument && (
              <Button
                onClick={onCreateDocument}
                className="gap-2 !bg-black hover:!bg-gray-900 !text-white"
                variant="default"
              >
                <Plus className="h-4 w-4" />
                New Document
              </Button>
            )}
            <UserMenu
              currentUser={currentUser}
              onLogout={onLogout}
              onShowActivity={onShowActivity}
              onShowProfile={onShowProfile}
              onShowDocuments={onShowDocuments}
              onShowOrganizations={onShowOrganizations}
              onShowAdmin={onShowAdmin}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
