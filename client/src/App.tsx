import { useState, useEffect } from "react";
import { Document, User, VersionHistory, ElementType, HeadingLevel, StructureProposal, Organization } from "./types";
import { DocumentEditor } from "./components/DocumentEditor";
import { AgreedDocument } from "./components/AgreedDocument";
import { DocumentDashboard } from "./components/DocumentDashboard";
import { ActivityFeedView } from "./components/ActivityFeedView";
import { UserProfile } from "./components/UserProfile";
import { Login } from "./components/Login";
import { AppHeader } from "./components/AppHeader";
import { StructureProposalMode } from "./components/StructureProposalMode";
import { StructureProposalCard } from "./components/StructureProposalCard";
import { StructureHistory } from "./components/StructureHistory";
import { OrganizationDashboard } from "./components/OrganizationDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Avatar, AvatarFallback } from "./components/ui/avatar";
import { CollaboratorManagement } from "./components/CollaboratorManagement";
import { Users, FileText, Edit3, Clock, CheckCircle2 } from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { documentsApi, authApi, proposalsApi, votesApi, commentsApi, paragraphsApi, structureProposalsApi, structureHistoryApi, organizationsApi, governanceApi } from "./lib/api";
import { toast } from "sonner";

export default function App() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"discussion" | "agreed" | "history">("discussion");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'documents' | 'activity' | 'document' | 'profile' | 'organizations' | 'organization'>('documents');
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [pendingOrganizationalDocument, setPendingOrganizationalDocument] = useState<string | null>(null);
  const [documentLoadKey, setDocumentLoadKey] = useState<number>(Date.now());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [structureProposals, setStructureProposals] = useState<StructureProposal[]>([]);
  const [showStructureProposalMode, setShowStructureProposalMode] = useState(false);

  // Load structure proposals for current document
  const loadStructureProposals = async () => {
    if (!currentDocument) {
      console.log('loadStructureProposals: No current document');
      return;
    }

    console.log('loadStructureProposals: Loading proposals for document:', currentDocument.id);

    try {
      const response = await structureProposalsApi.getStructureProposals(currentDocument.id);
      console.log('loadStructureProposals: Received response:', response);
      console.log('loadStructureProposals: Setting proposals:', response.structureProposals?.length || 0, 'items');
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

  // Helper function to map proposals to suggestions for backward compatibility
  const mapDocumentWithSuggestions = (document: any): Document | null => {
    if (!document) {
      return null;
    }

    const normalizedParagraphs = (document.paragraphs || []).map((paragraph: any) => {
      const rawSuggestions = paragraph.proposals || paragraph.suggestions || [];
      const proposals = rawSuggestions.map((proposal: any) => ({
        ...proposal,
        approved: Boolean(proposal.approved),
        headingLevel: (proposal.headingLevel || proposal.heading_level || (proposal.type === 'TITLE' ? 'h2' : undefined)) as HeadingLevel | undefined,
        votes: (proposal.votes || []).map((vote: any) => ({
          ...vote,
          createdAt: vote.createdAt || vote.created_at || null,
        })),
        comments: (proposal.comments || []).map((comment: any) => ({
          ...comment,
          createdAt: comment.createdAt || comment.created_at || null,
          updatedAt: comment.updatedAt || comment.updated_at || null,
        })),
      }));

      const history: VersionHistory[] = (paragraph.history || []).map((entry: any) => {
        const acceptedAtSource = entry.acceptedAt || entry.createdAt || entry.updatedAt || null;
        return {
          id: entry.id,
          paragraphId: entry.paragraphId || paragraph.id,
          userId: entry.userId,
          text: entry.text ?? entry.newText ?? paragraph.text,
          oldText: entry.oldText ?? entry.old_text ?? null,
          proposalId: entry.proposalId ?? entry.proposal_id ?? null,
          acceptedAt: acceptedAtSource ? new Date(acceptedAtSource) : new Date(),
          approvalPercentage: Number(entry.approvalPercentage ?? entry.approval_percentage ?? 0),
          type: entry.type || entry.proposalType || 'BODY',
          headingLevel: (entry.headingLevel || entry.heading_level || (entry.type === 'TITLE' ? 'h2' : undefined)) as HeadingLevel | undefined,
          user: entry.user || {
            id: entry.userId,
            name: entry.userName || '',
            email: entry.userEmail,
          },
        };
      });

      const orderIndex = Number(paragraph.order ?? paragraph.orderIndex ?? paragraph.order_index ?? 0);
      const isDocumentTitle = orderIndex < 0 || (typeof paragraph.id === 'string' && paragraph.id.endsWith('-title'));
      const paragraphTitle = paragraph.title ?? null;
      const paragraphText = paragraph.text ?? '';
      const headingLevel = (paragraph.headingLevel ?? paragraph.heading_level ?? (isDocumentTitle ? 'h1' : null)) as HeadingLevel | null;

      return {
        ...paragraph,
        title: paragraphTitle ?? undefined,
        text: paragraphText,
        order: orderIndex,
        isDocumentTitle,
        headingLevel,
        proposals,
        suggestions: proposals,
        history,
      };
    });

    const sortedParagraphs = normalizedParagraphs.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

    const owner = document.owner || {
      id: document.ownerId || document.owner_id,
      name: document.ownerName || document.owner_name,
      email: document.ownerEmail || document.owner_email,
    };

    const collaborators = (document.collaborators || []).map((collaborator: any) => ({
      id: collaborator.id,
      documentId: collaborator.documentId || collaborator.document_id || document.id,
      userId: collaborator.userId || collaborator.user_id || collaborator.user?.id,
      createdAt: collaborator.createdAt || collaborator.created_at || null,
      user: collaborator.user || {
        id: collaborator.userId || collaborator.user_id,
        name: collaborator.userName || collaborator.user_name || '',
        email: collaborator.userEmail || collaborator.user_email || '',
      },
    }));

    return {
      ...document,
      ownerId: document.ownerId || owner.id,
      owner,
      collaborators,
      paragraphs: sortedParagraphs,
    } as Document;
  };

  // Check authentication on component mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await authApi.getCurrentUser();
      setCurrentUser(response.user);
      loadDocuments(response.user);
    } catch (error) {
      // Not authenticated, show login
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    loadDocuments(user);
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
      // Clear token from localStorage
      localStorage.removeItem('authToken');
      setCurrentUser(null);
      setDocuments([]);
      setCurrentDocument(null);
      toast.success('Logged out successfully');
    } catch (error) {
      // Even if logout request fails, clear local data
      localStorage.removeItem('authToken');
      setCurrentUser(null);
      setDocuments([]);
      setCurrentDocument(null);
      toast.error('Logout failed, but you have been logged out locally');
    }
  };

  const handleProfileUpdate = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    // Update documents list with new user info if user is owner/collaborator
    setDocuments(prev => prev.map(doc => {
      if (doc.ownerId === updatedUser.id) {
        return { ...doc, owner: updatedUser };
      }
      return doc;
    }));
    // Update current document if viewing one
    if (currentDocument) {
      if (currentDocument.ownerId === updatedUser.id) {
        setCurrentDocument({
          ...currentDocument,
          owner: updatedUser,
        });
      }
    }
    // Navigate back to documents after profile update
    if (currentView === 'profile') {
      setCurrentView('documents');
    }
  };

  const handleShowDocuments = () => {
    setCurrentDocument(null);
    setCurrentView('documents');
  };

  const handleShowActivity = () => {
    setCurrentDocument(null);
    setCurrentView('activity');
  };

  const handleShowProfile = () => {
    setCurrentDocument(null);
    setCurrentView('profile');
  };

  const handleShowOrganizations = () => {
    setCurrentDocument(null);
    setCurrentView('organizations');
  };

  const handleBackToDocuments = () => {
    setCurrentDocument(null);
    setCurrentView('documents');
  };

  // Handle document selection
  const handleDocumentSelect = async (document: Document) => {
    try {
      setLoading(true);
      const response = await documentsApi.getDocument(document.id);
      if (response && response.document) {
        const normalizedDocument = mapDocumentWithSuggestions(response.document);
        setCurrentDocument(normalizedDocument);
        setDocumentLoadKey(Date.now()); // Force remount of all components to collapse comments
        setCurrentView('document');
        // Load structure proposals for this document
        await loadStructureProposals();
      }
    } catch (err) {
      toast.error('Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  // Load documents on component mount (only when authenticated)
  const loadDocuments = async (user?: User) => {
    const userToUse = user || currentUser;
    if (!userToUse) {
      console.log('No user available for loadDocuments');
      setLoading(false);
      return;
    }

    console.log('Loading documents for user:', userToUse.name);
    setLoading(true);
    setError(null);

    try {
      const response = await documentsApi.getDocuments();
      console.log('Documents API response:', response);

      if (response && response.documents) {
        const normalizedList = response.documents.map((doc: any) => mapDocumentWithSuggestions({ ...doc, paragraphs: doc.paragraphs || [] }))
          .filter(Boolean) as Document[];
        console.log('Setting documents:', normalizedList.length, 'documents');
        console.log('Documents data:', normalizedList.map(d => ({ id: d.id, title: d.title })));
        setDocuments(normalizedList);
        console.log('Documents state updated');

        // Don't auto-select any document - let user choose from dashboard
      } else {
        console.log('Invalid API response:', response);
        setError('Invalid API response');
        toast.error('Invalid API response');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load documents';
      console.error('loadDocuments error:', errorMessage, err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganizationalDocument = (organizationId: string) => {
    setPendingOrganizationalDocument(organizationId);
    setCurrentView('documents');
    setIsCreateDialogOpen(true);
  };

  // Reset pending organizational document when dialog closes
  useEffect(() => {
    if (!isCreateDialogOpen) {
      setPendingOrganizationalDocument(null);
    }
  }, [isCreateDialogOpen]);

  const handleCreateDocument = async (
    title: string,
    _description?: string,
    contributors?: string[],
    options?: {
      acceptanceThreshold?: number;
      votingAnonymous?: boolean;
      votingAnonymityLocked?: boolean;
      voteChangeAllowed?: boolean;
      structureProposalsEnabled?: boolean;
    },
    ownershipType?: 'personal' | 'shared' | 'organizational',
    organizationId?: string
  ) => {
    try {
      console.log('Creating document:', title, 'with contributors:', contributors, 'with options:', options, 'ownership:', ownershipType, 'org:', organizationId);
      const response = await documentsApi.createDocument(title, _description, contributors, options, ownershipType, organizationId);
      console.log('Document creation response:', response);

      // Add collaborators if specified
      if (contributors && contributors.length > 0 && response.document?.id) {
        console.log('Adding contributors:', contributors);
        for (const contributorId of contributors) {
          try {
            await documentsApi.addCollaborator(response.document.id, contributorId);
            console.log('Added contributor:', contributorId);
          } catch (error) {
            console.error('Failed to add contributor:', contributorId, error);
          }
        }
      }

      toast.success('Document created successfully');
      console.log('Reloading documents...');
      await loadDocuments(); // Reload documents list
      console.log('Documents reloaded');
    } catch (err) {
      console.error('Document creation failed:', err);
      toast.error('Failed to create document');
      throw err; // Re-throw to let the dashboard handle the error
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    try {
      await documentsApi.deleteDocument(documentId);
      await loadDocuments(); // Reload documents list
      // If the currently selected document was deleted, clear the selection
      if (currentDocument?.id === documentId) {
        setCurrentDocument(null);
      }
    } catch (err) {
      toast.error('Failed to delete document');
      throw err; // Re-throw to let the dashboard handle the error
    }
  };

  const handleAddSuggestion = async (
    paragraphId: string,
    data: {
      text: string;
      type?: 'BODY' | 'TITLE';
      headingLevel?: HeadingLevel;
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
      // Reload document to get updated proposals
      const response = await documentsApi.getDocument(currentDocument.id);
      const normalizedDocument = mapDocumentWithSuggestions(response.document);
      if (normalizedDocument) {
        setCurrentDocument(normalizedDocument);
        setDocuments(prev => prev.map(doc => (doc.id === normalizedDocument.id ? normalizedDocument : doc)));
      }
      toast.success('Suggestion added');
    } catch (err) {
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

      // Reload document to get updated votes
      const response = await documentsApi.getDocument(currentDocument.id);
      const normalizedDocument = mapDocumentWithSuggestions(response.document);
      if (normalizedDocument) {
        setCurrentDocument(normalizedDocument);
        setDocuments(prev => prev.map(doc => (doc.id === normalizedDocument.id ? normalizedDocument : doc)));
      }
      toast.success('Vote cast');
    } catch (err) {
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

      // Reload document to get updated comments
      const response = await documentsApi.getDocument(currentDocument.id);
      const normalizedDocument = mapDocumentWithSuggestions(response.document);
      if (normalizedDocument) {
        setCurrentDocument(normalizedDocument);
        setDocuments(prev => prev.map(doc => (doc.id === normalizedDocument.id ? normalizedDocument : doc)));
      }
      toast.success(parentId ? 'Reply added' : 'Comment added');
    } catch (err) {
      toast.error(parentId ? 'Failed to add reply' : 'Failed to add comment');
    }
  };

  const handleAddElement = async (
    elementType: ElementType,
    options?: {
      text?: string;
      title?: string;
      headingLevel?: HeadingLevel;
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
      const response = await documentsApi.getDocument(currentDocument.id);
      const normalizedDocument = mapDocumentWithSuggestions(response.document);
      if (normalizedDocument) {
        setCurrentDocument(normalizedDocument);
        setDocuments(prev => prev.map(doc => (doc.id === normalizedDocument.id ? normalizedDocument : doc)));
        setDocumentLoadKey(Date.now()); // Force remount of DocumentEditor to show new paragraph
      }
      toast.success('Paragraph suggestion created');
    } catch (err) {
      throw err;
    }
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
  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  // Calculate stats
  const totalSuggestions = currentDocument?.paragraphs?.reduce(
    (sum, p) => sum + (p.proposals?.length || 0),
    0
  ) || 0;

  const acceptedSuggestions = currentDocument?.paragraphs?.reduce((sum, p) => {
    return sum + (p.proposals?.filter((s) => s.approved).length || 0);
  }, 0) || 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading collaborative workspace...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => loadDocuments()}>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Global Header */}
      <AppHeader
        currentUser={currentUser}
        onLogout={handleLogout}
        onShowActivity={handleShowActivity}
        onShowProfile={handleShowProfile}
        onShowDocuments={handleShowDocuments}
        onShowOrganizations={handleShowOrganizations}
        showBackButton={currentView === 'activity' || currentView === 'document' || currentView === 'profile' || currentView === 'organizations' || currentView === 'organization'}
        onBack={handleBackToDocuments}
        title={
          currentView === 'document' && currentDocument ? currentDocument.title :
          currentView === 'activity' ? 'Activity Feed' :
          currentView === 'profile' ? 'Edit Profile' :
          currentView === 'organizations' ? 'Organizations' :
          currentView === 'organization' && selectedOrganization ? selectedOrganization.name :
          currentView === 'documents' ? 'Documents' :
          undefined
        }
        showCreateButton={currentView === 'documents'}
        onCreateDocument={() => setIsCreateDialogOpen(true)}
      />

      {/* Main Content */}
      {currentView === 'documents' && (
        <DocumentDashboard
          documents={documents}
          currentUser={currentUser}
          onSelectDocument={handleDocumentSelect}
          onCreateDocument={handleCreateDocument}
          onDeleteDocument={handleDeleteDocument}
          loading={loading}
          isCreateDialogOpen={isCreateDialogOpen}
          onSetCreateDialogOpen={setIsCreateDialogOpen}
          currentOrganizationId={pendingOrganizationalDocument}
        />
      )}

      {currentView === 'activity' && (
        <ActivityFeedView
          documents={documents}
          currentUser={currentUser}
          onNavigateToDocument={async (documentId) => {
            try {
              const response = await documentsApi.getDocument(documentId);
              if (response.document) {
                const normalizedDocument = mapDocumentWithSuggestions(response.document);
                setCurrentDocument(normalizedDocument);
                setCurrentView('document');
                setActiveTab('discussion');
                // Load structure proposals for this document
                await loadStructureProposals();
              }
            } catch (error) {
              console.error('Failed to load document:', error);
              toast.error('Failed to load document');
            }
          }}
          onAddComment={async (proposalId, documentId, paragraphId, text, parentId) => {
            try {
              await commentsApi.addComment(documentId, paragraphId, proposalId, { text, parentId });
              toast.success(parentId ? 'Reply added' : 'Comment added');
            } catch (error) {
              console.error('Failed to add comment:', error);
              toast.error(parentId ? 'Failed to add reply' : 'Failed to add comment');
              throw error;
            }
          }}
        />
      )}

      {currentView === 'profile' && (
        <div className="max-w-4xl mx-auto px-4 py-8">
          <UserProfile
            user={currentUser}
            onProfileUpdate={handleProfileUpdate}
            isModal={false}
          />
        </div>
      )}

      {currentView === 'organizations' && (
        <OrganizationDashboard
          currentUser={currentUser!}
          onCreateOrganizationalDocument={handleCreateOrganizationalDocument}
          onSelectOrganization={(org) => {
            setSelectedOrganization(org);
            setCurrentView('organization');
          }}
        />
      )}

      {currentView === 'organization' && selectedOrganization && (
        <OrganizationManagement
          organization={selectedOrganization}
          currentUser={currentUser!}
          onBack={() => {
            setSelectedOrganization(null);
            setCurrentView('organizations');
          }}
          onCreateOrganizationalDocument={handleCreateOrganizationalDocument}
        />
      )}

      {currentView === 'document' && currentDocument && (
        <>
          {/* Main Content */}
          <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Centered workspace description */}
        {currentDocument?.description && (
          <div className="text-center mb-6">
            <p className="text-sm text-gray-600">{currentDocument.description}</p>
          </div>
        )}


        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "discussion" | "agreed" | "history")}>
          <div className="flex justify-center mb-6 px-4">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="discussion" className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm">
                <Edit3 className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Discussion</span>
                {totalSuggestions > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {totalSuggestions}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="agreed" className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm">
                <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Agreed</span>
                {acceptedSuggestions > 0 && (
                  <Badge variant="default" className="ml-1 bg-green-600 text-xs">
                    {acceptedSuggestions}
                  </Badge>
                )}
              </TabsTrigger>
              {currentDocument?.structureProposalsEnabled && (
              <TabsTrigger value="history" className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm">
                <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">History</span>
              </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Document Status - Only show in agreed view */}
          {activeTab === 'agreed' && (
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Last updated: {new Date(currentDocument.updatedAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  {currentDocument.paragraphs.filter(p => !p.isDocumentTitle && (p.title || p.text) && (p.title || p.text).trim() !== '').length} sections agreed upon ({currentDocument.paragraphs.filter(p => p.history && p.history.length > 0).length} modified)
                </span>
              </div>
            </div>
          )}

          {/* Collaborators Display */}
          <div className="flex justify-center mb-8">
            <CollaboratorManagement
              document={currentDocument}
              currentUser={currentUser}
              onCollaboratorAdded={async (user) => {
                console.log('onCollaboratorAdded called with user:', user);
                // Refresh the document data to show the new collaborator
                try {
                  console.log('Refreshing document after adding collaborator...');
                  const response = await documentsApi.getDocument(currentDocument.id);
                  const normalizedDocument = mapDocumentWithSuggestions(response.document);
                  if (normalizedDocument) {
                    console.log('Updated document collaborators count:', normalizedDocument.collaborators.length);
                    setCurrentDocument(normalizedDocument);
                    // Update the document in the documents list as well
                    setDocuments(prev => prev.map(doc =>
                      (doc.id === normalizedDocument.id ? normalizedDocument : doc)
                    ));
                    console.log('Document state updated successfully');
                  }
                } catch (error) {
                  console.error('Failed to refresh document after adding collaborator:', error);
                }
              }}
              onCollaboratorRemoved={async (userId) => {
                console.log('onCollaboratorRemoved called with userId:', userId);
                // Refresh the document data to show removed collaborator
                try {
                  console.log('Refreshing document after removing collaborator...');
                  const response = await documentsApi.getDocument(currentDocument.id);
                  const normalizedDocument = mapDocumentWithSuggestions(response.document);
                  if (normalizedDocument) {
                    console.log('Updated document collaborators count:', normalizedDocument.collaborators.length);
                    setCurrentDocument(normalizedDocument);
                    // Update the document in the documents list as well
                    setDocuments(prev => prev.map(doc =>
                      (doc.id === normalizedDocument.id ? normalizedDocument : doc)
                    ));
                    console.log('Document state updated successfully');
                  }
                } catch (error) {
                  console.error('Failed to refresh document after removing collaborator:', error);
                }
              }}
            >
              <div className="flex items-center gap-2 sm:gap-3 text-sm text-gray-600 cursor-pointer hover:text-gray-900 transition-colors">
                <Users className="h-4 w-4" />
                <div className="flex items-center -space-x-1 sm:-space-x-2">
                  {/* Owner */}
                  <Avatar className="h-6 w-6 sm:h-8 sm:w-8 border-2 border-white">
                    <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                      {currentDocument.owner.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  {/* Collaborators */}
                  {currentDocument.collaborators.slice(0, 3).map((collaborator) => (
                    <Avatar key={collaborator.id} className="h-6 w-6 sm:h-8 sm:w-8 border-2 border-white">
                      <AvatarFallback className="text-xs bg-gray-200 text-gray-700">
                        {collaborator.user.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {currentDocument.collaborators.length > 3 && (
                    <Avatar className="h-6 w-6 sm:h-8 sm:w-8 border-2 border-white">
                      <AvatarFallback className="text-xs bg-gray-200 text-gray-700">
                        +{currentDocument.collaborators.length - 3}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
                <span className="font-medium text-xs sm:text-sm">
                  {(currentDocument.collaborators.length || 0) + 1} collab{(currentDocument.collaborators.length || 0) + 1 !== 1 ? 's' : ''}
                </span>
              </div>
            </CollaboratorManagement>
          </div>

          <TabsContent value="discussion" className="mt-0">
            <DocumentEditor
              key={documentLoadKey}
              document={currentDocument}
              totalUsers={(currentDocument?.collaborators.length || 0) + 1} // Owner + collaborators
              currentUser={currentUser}
              onAddSuggestion={handleAddSuggestion}
              onVote={handleVote}
              onComment={handleComment}
              onAddElement={handleAddElement}
            />
          </TabsContent>

          <TabsContent value="agreed" className="mt-0">
            <AgreedDocument
              document={currentDocument}
              totalUsers={(currentDocument?.collaborators.length || 0) + 1} // Owner + collaborators
            />
          </TabsContent>

          {currentDocument?.structureProposalsEnabled && (
          <TabsContent value="history" className="mt-0">
            <StructureHistory
              documentId={currentDocument.id}
              currentUserId={currentUser.id}
            />
          </TabsContent>
          )}
        </Tabs>

        {/* Structure Proposals Section - Moved to end of document */}
        {currentDocument?.structureProposalsEnabled && (
          <div className="mt-12 pt-8 border-t">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">🏗️ Structure Proposals</h2>
              {structureProposals.length > 0 && (
                <Badge variant="secondary" className="text-sm">
                  {structureProposals.length}
                </Badge>
              )}
            </div>
            <Button
              onClick={() => setShowStructureProposalMode(true)}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              🧩 Propose restructuring
            </Button>
          </div>

          {structureProposals.length > 0 ? (
            <div className="space-y-4">
              {structureProposals.map((proposal) => (
                <StructureProposalCard
                  key={proposal.id}
                  structureProposal={proposal}
                  documentId={currentDocument.id}
                  currentUserId={currentUser.id}
                  onVote={refreshStructureProposals}
                  onApply={() => {
                    // Refresh document and structure proposals after applying
                    loadDocuments();
                    refreshStructureProposals();
                  }}
                  canApply={currentDocument.ownerId === currentUser.id}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <div className="text-5xl mb-3">🏗️</div>
              <p className="text-base font-medium mb-1">No structure proposals yet.</p>
              <p className="text-sm">Use "Propose restructuring" to suggest major document changes.</p>
            </div>
          )}
        </div>
        )}
        </div>
        </>
      )}

      {/* Structure Proposal Mode */}
      {showStructureProposalMode && currentDocument && (
        <StructureProposalMode
          documentId={currentDocument.id}
          paragraphs={currentDocument.paragraphs}
          onClose={() => setShowStructureProposalMode(false)}
          onSuccess={() => {
            setShowStructureProposalMode(false);
            refreshStructureProposals();
          }}
        />
      )}
    </div>
  );
}
