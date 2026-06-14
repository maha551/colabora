// Custom hook for invitation handling
// Extracted from App.tsx to reduce complexity and improve modularity

import { useState, useEffect, useCallback } from 'react';
import { authApi, documentsApi } from '../lib/api';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import type { User, Organization } from '../types';

export type PendingOrganizationInvitation = {
  kind: 'organization';
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  invitationType: 'member' | 'representative';
  inviterName: string;
  expiresAt: string;
  createdAt: string;
};

export type PendingDocumentInvitation = {
  kind: 'document';
  id: string;
  documentId: string;
  documentTitle: string;
  email: string;
  inviterName: string | null;
  expiresAt: string;
  createdAt: string;
};

export type PendingInvitation = PendingOrganizationInvitation | PendingDocumentInvitation;

interface UseInvitationHandlingOptions {
  isAuthenticated: boolean;
  currentUser: User | null;
  organizations: Organization[];
  refreshOrganizations: () => Promise<Organization[]>;
  setSelectedOrganization: (org: Organization | null) => void;
  setCurrentView: (view: string) => void;
  onNavigateToDocument?: (documentId: string) => void | Promise<void>;
  /** Called after invitation is accepted (e.g. refresh pending invitations list) */
  onAfterAccept?: () => void | Promise<void>;
}

export function useInvitationHandling({
  isAuthenticated,
  currentUser,
  organizations: _organizations,
  refreshOrganizations,
  setSelectedOrganization,
  setCurrentView,
  onNavigateToDocument,
  onAfterAccept,
}: UseInvitationHandlingOptions) {
  const [invitationDialogOpen, setInvitationDialogOpen] = useState(false);
  const [pendingInvitation, setPendingInvitation] = useState<PendingInvitation | null>(null);
  const [validatingInvitation, setValidatingInvitation] = useState(false);
  const [pendingInvitationToken, setPendingInvitationToken] = useState<string | null>(null);

  // Check for invitation token when user is logged in
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;

    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('token');

    if (token) {
      setValidatingInvitation(true);
      const invitationType = searchParams.get('type');

      const validateInvitation = invitationType === 'document'
        ? documentsApi.validateDocumentInvitation(token)
        : authApi.validateInvitationToken(token);

      validateInvitation
        .then((result: { valid?: boolean; invitation?: Record<string, unknown>; error?: string }) => {
          if (result.valid && result.invitation) {
            const inviteEmail = String(result.invitation.email || '').toLowerCase();
            if (inviteEmail === currentUser.email.toLowerCase()) {
              if (invitationType === 'document') {
                setPendingInvitation({
                  kind: 'document',
                  id: String(result.invitation.id),
                  documentId: String(result.invitation.documentId),
                  documentTitle: String(result.invitation.documentTitle || 'Document'),
                  email: String(result.invitation.email),
                  inviterName: (result.invitation.inviterName as string | null) ?? null,
                  expiresAt: String(result.invitation.expiresAt),
                  createdAt: String(result.invitation.createdAt || new Date().toISOString()),
                });
              } else {
                setPendingInvitation({
                  kind: 'organization',
                  id: String(result.invitation.id),
                  organizationId: String(result.invitation.organizationId),
                  organizationName: String(result.invitation.organizationName || 'Organization'),
                  email: String(result.invitation.email),
                  invitationType: (result.invitation.invitationType as 'member' | 'representative') || 'member',
                  inviterName: String(result.invitation.inviterName || 'Organization'),
                  expiresAt: String(result.invitation.expiresAt),
                  createdAt: String(result.invitation.createdAt || new Date().toISOString()),
                });
              }
              setPendingInvitationToken(token);
              setInvitationDialogOpen(true);
            } else {
              toast.error('This invitation was sent to a different email address');
              window.history.replaceState({}, '', window.location.pathname);
            }
          } else {
            toast.error(result.error || 'Invalid invitation');
            window.history.replaceState({}, '', window.location.pathname);
          }
        })
        .catch((error) => {
          logger.error('Failed to validate invitation:', error);
          toast.error('Failed to validate invitation');
          window.history.replaceState({}, '', window.location.pathname);
        })
        .finally(() => {
          setValidatingInvitation(false);
        });
    }
  }, [isAuthenticated, currentUser]);

  const handleCloseInvitation = useCallback(() => {
    setInvitationDialogOpen(false);
    setPendingInvitation(null);
    setPendingInvitationToken(null);
    window.history.replaceState({}, '', window.location.pathname);
    toast.info('You can use the invitation link again from your email if you change your mind.', { duration: 5500 });
  }, []);

  const handleAcceptInvitation = useCallback(async () => {
    if (!pendingInvitation) {
      setPendingInvitation(null);
      return;
    }

    if (pendingInvitation.kind === 'document') {
      if (onNavigateToDocument) {
        await onNavigateToDocument(pendingInvitation.documentId);
      } else {
        setCurrentView('documents');
      }
      setPendingInvitation(null);
      setPendingInvitationToken(null);
      await onAfterAccept?.();
      return;
    }

    const organizationId = pendingInvitation.organizationId;

    await new Promise(resolve => setTimeout(resolve, 100));

    const updatedOrgs = await refreshOrganizations();
    const newOrg = updatedOrgs.find(org => org.id === organizationId);

    if (newOrg) {
      setSelectedOrganization(newOrg);
      setCurrentView('organization');
    } else {
      logger.warn('Organization not found immediately after refresh, retrying', {
        organizationId,
        foundOrgs: updatedOrgs.map(o => o.id),
      });

      setTimeout(async () => {
        const retryOrgs = await refreshOrganizations();
        const retryOrg = retryOrgs.find(org => org.id === organizationId);
        if (retryOrg) {
          setSelectedOrganization(retryOrg);
          setCurrentView('organization');
        } else {
          logger.error('Organization still not found after retry', {
            organizationId,
            foundOrgs: retryOrgs.map(o => o.id),
          });
          toast.error('Organization added, but may take a moment to appear. Please refresh the page.');
        }
      }, 500);
    }

    setPendingInvitation(null);
    setPendingInvitationToken(null);

    await onAfterAccept?.();
  }, [pendingInvitation, refreshOrganizations, setSelectedOrganization, setCurrentView, onNavigateToDocument, onAfterAccept]);

  return {
    invitationDialogOpen,
    pendingInvitation,
    pendingInvitationToken,
    validatingInvitation,
    handleCloseInvitation,
    handleAcceptInvitation,
  };
}
