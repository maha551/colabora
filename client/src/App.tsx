import React, { useState, useEffect } from 'react';
import { Organization } from './types';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useDocuments } from './hooks/useDocuments';
import { useDocumentView } from './hooks/useDocumentView';

// Layout and Pages
import { AppLayout } from './components/layout/AppLayout';
import { DocumentsPage } from './pages/DocumentsPage';
import { ActivityPage } from './pages/ActivityPage';
import { ProfilePage } from './pages/ProfilePage';
import { DocumentViewPage } from './pages/DocumentViewPage';
import { OrganizationDashboard } from './components/OrganizationDashboard';
import { OrganizationManagement } from './components/OrganizationManagement/OrganizationManagement';
import { AdminDashboard } from './components/AdminDashboard';
import { Login } from './components/Login';

// API and utilities
import { proposalsApi, votesApi, commentsApi, paragraphsApi, structureProposalsApi, organizationsApi } from './lib/api';
import { toast } from 'sonner';

export default function App() {
  // Authentication state
  const {
    currentUser,
    authLoading,
    error: authError,
    handleLogin,
    handleLogout,
    handleProfileUpdate,
    isAuthenticated,
  } = useAuth();

  // Document management state
  const {
    documents,
    loading: documentsLoading,
    createDocument,
    deleteDocument,
  } = useDocuments(currentUser);

  // Document view state
  const {
    currentDocument,
    documentLoadKey,
    loading: documentLoading,
    loadDocumentById,
    selectDocument,
    clearDocument,
    reloadDocument,
    mapDocumentWithSuggestions,
  } = useDocumentView();

  // UI state
  const [currentView, setCurrentView] = useState<'documents' | 'activity' | 'document' | 'profile' | 'organizations' | 'organization' | 'admin'>('activity');
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [structureProposals, setStructureProposals] = useState<any[]>([]);
  const [showStructureProposalMode, setShowStructureProposalMode] = useState(false);

  // Load structure proposals for current document
  const loadStructureProposals = async () => {
    if (!currentDocument) return;

    try {
      const response = await structureProposalsApi.getStructureProposals(currentDocument.id);
      setStructureProposals(response.structureProposals || []);
    } catch (error) {
      console.error('Failed to load structure proposals:', error);
      setStructureProposals([]);
    }
  };

  // Refresh structure proposals
  const refreshStructureProposals = () => {
    loadStructureProposals();
  };

  // Monitor URL hash for document links
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#document/')) {
        const documentId = hash.replace('#document/', '');
        if (currentUser && documentId) {
          loadDocumentById(documentId, currentUser);
        }
      }
    };

    // Check hash on mount and when user becomes available
    if (currentUser) {
      handleHashChange();
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentUser, loadDocumentById]);

  // Load structure proposals when document changes
  useEffect(() => {
    if (currentDocument) {
      loadStructureProposals();
    }
  }, [currentDocument]);

  // Navigation handlers
  const handleShowDocuments = () => {
    clearDocument();
    setCurrentView('documents');
  };

  const handleShowActivity = () => {
    clearDocument();
    setCurrentView('activity');
  };

  const handleShowProfile = () => {
    clearDocument();
    setCurrentView('profile');
  };

  const handleShowOrganizations = () => {
    clearDocument();
    setCurrentView('organizations');
  };

  const handleShowAdmin = () => {
    clearDocument();
    setCurrentView('admin');
  };

  const handleBackToDocuments = () => {
    clearDocument();
    setCurrentView('activity');
    window.location.hash = '';
  };

  // Document selection handler
  const handleDocumentSelect = async (document: any) => {
    await selectDocument(document);
        setCurrentView('document');
  };

  // Document editing handlers
  const handleAddSuggestion = async (
    paragraphId: string,
    data: {
      text: string;
      type?: 'BODY' | 'TITLE';
      headingLevel?: any;
    }
  ) => {
    if (!currentDocument) return;

    try {
      const text = data.text;
      const type = data.type ?? 'BODY';
      await proposalsApi.createProposal(currentDocument.id, paragraphId, {
        text,
        type,
        headingLevel: data.headingLevel
      });
      
      // Reload document
      const normalizedDocument = await reloadDocument();
        if (normalizedDocument) {
        toast.success('Suggestion added');
      }
    } catch (err) {
      console.error('Failed to add suggestion:', err);
      toast.error('Failed to add suggestion');
    }
  };

  const handleVote = async (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    if (!currentDocument) return;

    try {
      // Find the proposal and paragraph
      let paragraphId: string | undefined;
      for (const paragraph of currentDocument.paragraphs) {
        const proposal = paragraph.proposals.find(p => p.id === suggestionId);
        if (proposal) {
          paragraphId = paragraph.id;
          break;
        }
      }

      if (!paragraphId) return;

      await votesApi.castVote(currentDocument.id, paragraphId, suggestionId, voteType);

      // Reload document
      const normalizedDocument = await reloadDocument();
        if (normalizedDocument) {
        toast.success('Vote cast');
      }
    } catch (err) {
      console.error('Failed to cast vote:', err);
      toast.error('Failed to cast vote');
    }
  };

  const handleComment = async (suggestionId: string, text: string, parentId?: string) => {
    if (!currentDocument) return;

    try {
      // Find the proposal and paragraph
      let paragraphId: string | undefined;
      for (const paragraph of currentDocument.paragraphs) {
        const proposal = paragraph.proposals.find(p => p.id === suggestionId);
        if (proposal) {
          paragraphId = paragraph.id;
          break;
        }
      }

      if (!paragraphId) return;

      await commentsApi.addComment(currentDocument.id, paragraphId, suggestionId, { text, parentId });

      // Reload document
      const normalizedDocument = await reloadDocument();
        if (normalizedDocument) {
        toast.success(parentId ? 'Reply added' : 'Comment added');
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
      toast.error(parentId ? 'Failed to add reply' : 'Failed to add comment');
    }
  };

  const handleAddElement = async (
    elementType: any,
    options?: {
      text?: string;
      title?: string;
      headingLevel?: any;
      order?: number;
    }
  ) => {
    if (!currentDocument) return;

    try {
      if (elementType !== 'paragraph') {
        return;
      }

      const bodyText = options?.text?.trim();
      const titleText = options?.title?.trim();

      // For headings, we need either title text or body text
      // For body paragraphs, we need body text
      if (!bodyText && !titleText) {
        toast.error('Content is required');
        throw new Error('Content is required');
      }

      const order = options?.order ?? (() => {
        const allOrders = currentDocument.paragraphs.map((p) => (typeof p.order === 'number' ? p.order : 0));
        return allOrders.length ? Math.max(...allOrders) + 1 : 0;
      })();

      await paragraphsApi.createParagraph(currentDocument.id, {
        text: bodyText || "", // Empty string for headings
        title: titleText || undefined,
        headingLevel: options?.headingLevel,
        order: order,
        asSuggestion: true,
      });

      // Reload document
      const normalizedDocument = await reloadDocument();
        if (normalizedDocument) {
        toast.success('Paragraph suggestion created');
      }
    } catch (err) {
      throw err;
    }
  };

  // Collaborator management
  const handleCollaboratorAdded = async (user: any) => {
    console.log('onCollaboratorAdded called with user:', user);
    // Refresh the document data to show the new collaborator
    try {
      console.log('Refreshing document after adding collaborator...');
      const normalizedDocument = await reloadDocument();
      if (normalizedDocument) {
        console.log('Updated document collaborators count:', normalizedDocument.collaborators.length);
      }
    } catch (error) {
      console.error('Failed to refresh document after adding collaborator:', error);
    }
  };

  const handleCollaboratorRemoved = async (userId: string) => {
    console.log('onCollaboratorRemoved called with userId:', userId);
    // Refresh the document data to show removed collaborator
    try {
      console.log('Refreshing document after removing collaborator...');
      const normalizedDocument = await reloadDocument();
      if (normalizedDocument) {
        console.log('Updated document collaborators count:', normalizedDocument.collaborators.length);
      }
    } catch (error) {
      console.error('Failed to refresh document after removing collaborator:', error);
    }
  };

  // Activity feed handlers
  const handleNavigateToDocument = async (documentId: string) => {
    try {
      const response = await structureProposalsApi.getStructureProposals(documentId);
      if (response.document) {
        const normalizedDocument = mapDocumentWithSuggestions(response.document);
        selectDocument(normalizedDocument);
        setCurrentView('document');
        // Load structure proposals for this document
        await loadStructureProposals();
      }
    } catch (error) {
      console.error('Failed to load document:', error);
      toast.error('Failed to load document');
    }
  };

  const handleAddComment = async (proposalId: string, documentId: string, paragraphId: string, text: string, parentId?: string) => {
    try {
      await commentsApi.addComment(documentId, paragraphId, proposalId, { text, parentId });
      toast.success(parentId ? 'Reply added' : 'Comment added');
    } catch (error) {
      console.error('Failed to add comment:', error);
      toast.error(parentId ? 'Failed to add reply' : 'Failed to add comment');
      throw error;
    }
  };

  // Organization handlers
  const handleSelectOrganization = (org: Organization) => {
    setSelectedOrganization(org);
    setCurrentView('organization');
  };

  const handleBackFromOrganization = () => {
    setSelectedOrganization(null);
    setCurrentView('organizations');
  };

  // Document sharing
  const handleShareDocument = () => {
    const url = `${window.location.origin}${window.location.pathname}#document/${currentDocument?.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Document link copied to clipboard!');
  };

  // Structure proposal handlers
  const handleApplyStructureProposal = async (proposalId: string) => {
    // Refresh document and structure proposals after applying
    await reloadDocument();
    refreshStructureProposals();
  };

  const handleCreateStructureProposal = () => {
    setShowStructureProposalMode(true);
  };

  const handleCloseStructureProposalMode = () => {
    setShowStructureProposalMode(false);
  };

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // Calculate layout props
  const showBackButton = currentView === 'document' || currentView === 'profile' || currentView === 'organizations' || currentView === 'organization' || currentView === 'documents' || currentView === 'admin';
  const title = currentView === 'document' && currentDocument ? currentDocument.title :
                currentView === 'activity' ? 'Activity Feed' :
                currentView === 'profile' ? 'Edit Profile' :
                currentView === 'organizations' ? 'Organizations' :
                currentView === 'organization' && selectedOrganization ? selectedOrganization.name :
                currentView === 'documents' ? 'Documents' :
                currentView === 'admin' ? 'Admin Dashboard' :
                undefined;

  return (
    <AppLayout
        currentUser={currentUser}
        onLogout={handleLogout}
        onShowActivity={handleShowActivity}
        onShowProfile={handleShowProfile}
        onShowDocuments={handleShowDocuments}
        onShowOrganizations={handleShowOrganizations}
        onShowAdmin={currentUser?.role === 'admin' ? handleShowAdmin : undefined}
      showBackButton={showBackButton}
        onBack={handleBackToDocuments}
      title={title}
        showCreateButton={currentView === 'documents'}
        onCreateDocument={() => setIsCreateDialogOpen(true)}
    >
      {currentView === 'documents' && (
        <DocumentsPage
          documents={documents}
          currentUser={currentUser}
          onSelectDocument={handleDocumentSelect}
          onCreateDocument={createDocument}
          onDeleteDocument={deleteDocument}
          loading={documentsLoading}
          isCreateDialogOpen={isCreateDialogOpen}
          onSetCreateDialogOpen={setIsCreateDialogOpen}
        />
      )}

      {currentView === 'activity' && (
        <ActivityPage
          documents={documents}
          currentUser={currentUser}
          onNavigateToDocument={handleNavigateToDocument}
          onAddComment={handleAddComment}
        />
      )}

      {currentView === 'profile' && (
        <ProfilePage
            user={currentUser}
            onProfileUpdate={handleProfileUpdate}
          />
      )}

      {currentView === 'organizations' && (
        <OrganizationDashboard
          currentUser={currentUser}
          onSelectOrganization={handleSelectOrganization}
        />
      )}

      {currentView === 'organization' && selectedOrganization && (
        <OrganizationManagement
          organization={selectedOrganization}
          currentUser={currentUser}
          onBack={handleBackFromOrganization}
          onSelectDocument={handleDocumentSelect}
        />
      )}

      {currentView === 'admin' && currentUser?.role === 'admin' && (
        <AdminDashboard
          currentUser={currentUser}
          onBack={handleBackToDocuments}
        />
      )}

      {currentView === 'document' && currentDocument && (
        <DocumentViewPage
              document={currentDocument}
          totalUsers={(currentDocument?.collaborators.length || 0) + 1}
              currentUser={currentUser}
          documentLoadKey={documentLoadKey}
          structureProposals={structureProposals}
          showStructureProposalMode={showStructureProposalMode}
              onAddSuggestion={handleAddSuggestion}
              onVote={handleVote}
              onComment={handleComment}
              onAddElement={handleAddElement}
          onCollaboratorAdded={handleCollaboratorAdded}
          onCollaboratorRemoved={handleCollaboratorRemoved}
          onShareDocument={handleShareDocument}
          onApplyStructureProposal={handleApplyStructureProposal}
          onCreateStructureProposal={handleCreateStructureProposal}
          onCloseStructureProposalMode={handleCloseStructureProposalMode}
          refreshStructureProposals={refreshStructureProposals}
        />
      )}
    </AppLayout>
  );
}