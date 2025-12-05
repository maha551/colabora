import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Organization, StructureProposal, Document, User, Vote, Comment, Proposal, VersionHistory, ElementType, HeadingLevel } from './types';
import { useWebSocket, DocumentUpdate } from './hooks/useWebSocket';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useDocuments } from './hooks/useDocuments';
import { useDocumentView } from './hooks/useDocumentView';
import { useUserOrganizations } from './hooks/useUserOrganizations';
import { useNavigationHistory } from './hooks/useNavigationHistory';

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
  // Navigation history for proper back button functionality (initialized early for use in logout wrapper)
  const { history, canGoBack, push, pop, clear: clearHistory } = useNavigationHistory();

  // Authentication state
  const {
    currentUser,
    authLoading,
    error: authError,
    handleLogin,
    handleLogout: originalHandleLogout,
    handleProfileUpdate,
    isAuthenticated,
  } = useAuth();

  // Wrap logout to clear navigation history
  const handleLogout = useCallback(async () => {
    clearHistory();
    await originalHandleLogout();
  }, [originalHandleLogout, clearHistory]);

  // Document management state
  const {
    documents,
    loading: documentsLoading,
    createDocument,
    deleteDocument,
    loadDocuments,
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
    updateDocument,
    mapDocumentWithSuggestions,
  } = useDocumentView();

  // User organizations for smart navigation
  const { organizations, loading: organizationsLoading, isSingleOrg, primaryOrganization, refreshOrganizations } = useUserOrganizations(currentUser);

  // UI state
  const [currentView, setCurrentView] = useState<'documents' | 'activity' | 'document' | 'profile' | 'organizations' | 'organization' | 'admin'>('activity');
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [documentOrganization, setDocumentOrganization] = useState<Organization | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [structureProposals, setStructureProposals] = useState<StructureProposal[]>([]);
  const [showStructureProposalMode, setShowStructureProposalMode] = useState(false);

  // Track if initial auto-navigation has occurred to prevent re-navigation
  const initialLoadCompleteRef = useRef(false);

  // Load structure proposals for current document
  const loadStructureProposalsRef = useRef<{ loading: boolean; lastLoadTime: number }>({ loading: false, lastLoadTime: 0 });
  
  const loadStructureProposals = useCallback(async () => {
    if (!currentDocument) return;

    // Prevent duplicate simultaneous requests
    const now = Date.now();
    if (loadStructureProposalsRef.current.loading) {
      console.log('loadStructureProposals already in progress, skipping...');
      return;
    }
    
    // Debounce: don't load more than once per 2 seconds
    if (now - loadStructureProposalsRef.current.lastLoadTime < 2000) {
      console.log('loadStructureProposals debounced, skipping...');
      return;
    }

    loadStructureProposalsRef.current.loading = true;
    loadStructureProposalsRef.current.lastLoadTime = now;

    try {
      const response = await structureProposalsApi.getStructureProposals(currentDocument.id);
      setStructureProposals(response.structureProposals || []);
    } catch (error) {
      console.error('Failed to load structure proposals:', error);
      setStructureProposals([]);
    } finally {
      loadStructureProposalsRef.current.loading = false;
    }
  }, [currentDocument?.id]); // Only depend on document ID, not the whole object

  // Refresh structure proposals
  const refreshStructureProposals = useCallback(() => {
    loadStructureProposals();
  }, [loadStructureProposals]);

  // Monitor URL hash for document links (deep linking - don't push to history)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#document/')) {
        const documentId = hash.replace('#document/', '');
        if (currentUser && documentId) {
          // Deep linking - load document but don't push to history
          loadDocumentById(documentId, currentUser).then(() => {
            setCurrentView('document');
          });
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

  // Reset initial load ref when user changes (e.g., after logout/login)
  useEffect(() => {
    if (!isAuthenticated) {
      initialLoadCompleteRef.current = false;
    }
  }, [isAuthenticated, currentUser?.id]);

  // Smart default view: Auto-navigate single-org users to their organization view
  useEffect(() => {
    // Only run once on initial load, after auth and organizations are loaded
    if (initialLoadCompleteRef.current || !isAuthenticated || organizationsLoading) {
      return;
    }

    // Ensure organizations array is actually populated (not just loading is false)
    // Auto-navigate if user has exactly 1 organization and is not admin
    if (organizations.length === 1 && primaryOrganization && currentUser?.role !== 'admin') {
      console.log('Auto-navigating single-org user to organization view:', {
        organizationId: primaryOrganization.id,
        organizationName: primaryOrganization.name,
        userRole: currentUser?.role,
        organizationsCount: organizations.length
      });
      setSelectedOrganization(primaryOrganization);
      setCurrentView('organization');
      initialLoadCompleteRef.current = true;
    } else {
      // Mark as complete even if we don't auto-navigate
      console.log('Not auto-navigating:', {
        organizationsCount: organizations.length,
        hasPrimaryOrg: !!primaryOrganization,
        userRole: currentUser?.role,
        isAdmin: currentUser?.role === 'admin'
      });
      initialLoadCompleteRef.current = true;
    }
  }, [isAuthenticated, organizationsLoading, organizations.length, isSingleOrg, primaryOrganization, currentUser?.role]);

  // Fetch organization when viewing a document that belongs to an organization
  useEffect(() => {
    if (currentDocument?.organizationId) {
      // Check if organization is already in the loaded organizations list
      const existingOrg = organizations.find(org => org.id === currentDocument.organizationId);
      if (existingOrg) {
        setDocumentOrganization(existingOrg);
      } else {
        // Fetch organization if not in the list
        organizationsApi.getOrganization(currentDocument.organizationId)
          .then(response => {
            setDocumentOrganization(response.organization);
          })
          .catch(error => {
            console.error('Failed to load document organization:', error);
            setDocumentOrganization(null);
          });
      }
    } else {
      setDocumentOrganization(null);
    }
  }, [currentDocument?.organizationId, organizations]);

  // Load structure proposals when document ID changes (not on every document update)
  useEffect(() => {
    if (currentDocument?.id) {
      loadStructureProposals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocument?.id]); // Only depend on document ID, not the whole object

  // Real-time updates via WebSocket (replaces polling)
  const handleDocumentUpdate = useCallback((update: DocumentUpdate) => {
    // Debug logging
    console.log('🔔 WebSocket update received:', {
      eventType: update.eventType,
      documentId: update.documentId,
      currentDocumentId: currentDocument?.id,
      hasData: !!update.data
    });
    
    if (!currentDocument || update.documentId !== currentDocument.id) {
      console.log('❌ Update ignored - wrong document or no current document');
      return;
    }

    // For vote updates, update the specific proposal's votes in state instantly (no API call needed)
    if (update.eventType === 'vote' && update.data?.proposalId) {
      console.log('✅ Processing vote update:', {
        proposalId: update.data.proposalId,
        paragraphId: update.data.paragraphId,
        hasAllVotes: !!update.data.vote?.allVotes,
        voteCount: update.data.vote?.allVotes?.length
      });
      
      const { proposalId, paragraphId, vote: voteData } = update.data;
      
      // If WebSocket includes all votes, use them directly (instant update, no API call)
      if (voteData?.allVotes) {
        console.log('📊 Updating votes from WebSocket:', voteData.allVotes.length, 'votes');
        
        // Clear voting state immediately when WebSocket update arrives
        setVotingState(prev => {
          const next = new Set(prev);
          next.delete(proposalId);
          return next;
        });
        
        updateDocument((prevDoc) => {
          if (!prevDoc) return prevDoc;
          
          // Create completely new document object
          return {
            ...prevDoc,
            paragraphs: prevDoc.paragraphs.map(para => {
              if (para.id !== paragraphId) return para;
              
              return {
                ...para,
                proposals: para.proposals.map(prop => {
                  if (prop.id !== proposalId) return prop;
                  
                  // Update votes directly from WebSocket message (instant!)
                  // Handle both anonymous and non-anonymous votes
                  // Always include userId (backend now always includes it)
                  const isAnonymous = voteData.isAnonymous || prevDoc.options?.votingAnonymous;
                  const currentUserId = currentUser?.id;
                  
                  const updatedVotes = voteData.allVotes.map((v: Vote) => {
                    // For anonymous voting, only show user info for own vote
                    const shouldShowUserInfo = !isAnonymous || v.userId === currentUserId;
                    
                    return {
                      id: v.id,
                      userId: v.userId, // Always included now
                      vote: v.vote,
                      createdAt: v.createdAt || v.created_at,
                      user: shouldShowUserInfo ? (v.user || undefined) : undefined
                    };
                  });
                  
                  // Return completely new proposal object
                  return {
                    ...prop,
                    votes: updatedVotes
                  };
                })
              };
            })
          };
        });
        return; // Done! No API call needed
      }
      
      // Fallback: if votes not included, do a lightweight reload
      // (This shouldn't happen, but handle gracefully)
      reloadDocument(true).catch(err => {
        console.error('Failed to reload after WebSocket update:', err);
      });
    } else if (update.eventType === 'paragraph' && update.data?.paragraphId) {
      // For paragraph updates (agreed view changes), update paragraph text/title and history instantly
      const { paragraphId, text, title, headingLevel, history: updatedHistory, reverted } = update.data;
      
      console.log('Received paragraph update via WebSocket:', { paragraphId, text, title, headingLevel, historyCount: updatedHistory?.length, reverted });
      
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        return {
          ...prevDoc,
          paragraphs: prevDoc.paragraphs.map(para => {
            if (para.id !== paragraphId) return para;
            
            // Map history entries from WebSocket format to client format
            const history = (updatedHistory || []).map((entry: VersionHistory) => ({
              id: entry.id,
              paragraphId: entry.paragraph_id || paragraphId,
              userId: entry.user_id,
              text: entry.new_text || entry.newText || text,
              oldText: entry.old_text || entry.oldText || null,
              proposalId: entry.proposal_id || entry.proposalId || null,
              acceptedAt: entry.created_at ? new Date(entry.created_at) : new Date(),
              approvalPercentage: Number(entry.approval_percentage || entry.approvalPercentage || 0),
              type: entry.type || 'BODY',
              headingLevel: entry.heading_level || entry.headingLevel || headingLevel,
              user: entry.user || { id: entry.user_id, name: '', email: '' }
            }));
            
            console.log(`Updating paragraph ${paragraphId}:`, {
              oldText: para.text,
              newText: text,
              oldTitle: para.title,
              newTitle: title,
              oldHistoryCount: para.history?.length || 0,
              newHistoryCount: history.length,
              history: history
            });
            
            return {
              ...para,
              text: text !== undefined ? text : para.text,
              title: title !== undefined ? title : para.title,
              headingLevel: headingLevel !== undefined ? headingLevel : para.headingLevel,
              history: history.length > 0 ? history : para.history // Use updated history if provided
            };
          })
        };
      });
      return; // Done! No API call needed
    } else if (update.eventType === 'comment' && update.data?.proposalId) {
      // For comment updates, add new comment to proposal's comments array
      console.log('✅ Processing comment update:', {
        proposalId: update.data.proposalId,
        paragraphId: update.data.paragraphId,
        commentId: update.data.comment?.id,
        commentText: update.data.comment?.text?.substring(0, 50) + '...'
      });
      
      const { proposalId, paragraphId, comment } = update.data;
      
      if (!comment || !comment.id) {
        console.warn('❌ Invalid comment data in WebSocket update');
        return;
      }
      
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        return {
          ...prevDoc,
          paragraphs: prevDoc.paragraphs.map(para => {
            if (para.id !== paragraphId) return para;
            
            return {
              ...para,
              proposals: para.proposals.map(prop => {
                if (prop.id !== proposalId) return prop;
                
                // Add new comment to comments array (avoid duplicates)
                const existingComments = prop.comments || [];
                const commentExists = existingComments.some((c: Comment) => c.id === comment.id);
                
                return {
                  ...prop,
                  comments: commentExists 
                    ? existingComments.map((c: Comment) => c.id === comment.id ? comment : c)
                    : [...existingComments, comment]
                };
              })
            };
          })
        };
      });
      
      toast.info('New comment added', { duration: 2000 });
      return; // Done! No API call needed
    } else if (update.eventType === 'proposal' && update.data?.paragraphId) {
      // For proposal updates, add new proposal to paragraph's proposals array
      console.log('✅ Processing proposal update:', {
        paragraphId: update.data.paragraphId,
        proposalId: update.data.proposal?.id,
        proposalText: update.data.proposal?.text?.substring(0, 50) + '...'
      });
      
      const { paragraphId, proposal } = update.data;
      
      if (!proposal || !proposal.id) {
        console.warn('❌ Invalid proposal data in WebSocket update');
        return;
      }
      
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        return {
          ...prevDoc,
          paragraphs: prevDoc.paragraphs.map(para => {
            if (para.id !== paragraphId) return para;
            
            // Check if proposal already exists (shouldn't, but handle gracefully)
            const existingProposals = para.proposals || [];
            const existingProposalIndex = existingProposals.findIndex((p: Proposal) => p.id === proposal.id);
            
            if (existingProposalIndex >= 0) {
              // Update existing proposal
              const updatedProposals = [...existingProposals];
              updatedProposals[existingProposalIndex] = {
                ...proposal,
                votes: proposal.votes || [],
                comments: proposal.comments || []
              };
              return {
                ...para,
                proposals: updatedProposals
              };
            } else {
              // Add new proposal
              return {
                ...para,
                proposals: [
                  ...existingProposals,
                  {
                    ...proposal,
                    votes: proposal.votes || [],
                    comments: proposal.comments || []
                  }
                ]
              };
            }
          })
        };
      });
      
      toast.success('New suggestion added', { duration: 2000 });
      return; // Done! No API call needed
    } else if (update.eventType === 'paragraph-created' && update.data?.paragraphId) {
      // New paragraph created - add to document
      console.log('✅ Processing paragraph creation:', {
        paragraphId: update.data.paragraphId,
        paragraphText: update.data.paragraph?.text?.substring(0, 50) + '...'
      });
      
      const { paragraphId, paragraph } = update.data;
      
      if (!paragraph || !paragraph.id) {
        console.warn('❌ Invalid paragraph data in WebSocket update');
        return;
      }
      
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        // Check if paragraph already exists
        const existingParagraph = prevDoc.paragraphs.find(p => p.id === paragraphId);
        if (existingParagraph) {
          console.log('Paragraph already exists, skipping add');
          return prevDoc;
        }
        
        return {
          ...prevDoc,
          paragraphs: [
            ...prevDoc.paragraphs,
            {
              id: paragraph.id,
              documentId: prevDoc.id,
              text: paragraph.text || '',
              title: paragraph.title || null,
              headingLevel: paragraph.headingLevel || null,
              order: paragraph.orderIndex || 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              proposals: [],
              history: []
            }
          ].sort((a, b) => (a.order || 0) - (b.order || 0))
        };
      });
      
      toast.success('New paragraph added', { duration: 2000 });
      return;
    } else if (update.eventType === 'paragraph-updated' && update.data?.paragraphId) {
      // Paragraph edited - update text/title
      console.log('✅ Processing paragraph update:', {
        paragraphId: update.data.paragraphId,
        newText: update.data.text?.substring(0, 50) + '...',
        newTitle: update.data.title
      });
      
      const { paragraphId, text, title, headingLevel } = update.data;
      
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        return {
          ...prevDoc,
          paragraphs: prevDoc.paragraphs.map(para => {
            if (para.id !== paragraphId) return para;
            
            return {
              ...para,
              text: text !== undefined ? text : para.text,
              title: title !== undefined ? title : para.title,
              headingLevel: headingLevel !== undefined ? headingLevel : para.headingLevel
            };
          })
        };
      });
      
      toast.info('Paragraph updated', { duration: 2000 });
      return;
    } else if (update.eventType === 'document-vote' && update.data?.documentId) {
      // For document-level vote updates, reload document to get fresh voting status
      // This ensures the voting component gets updated vote counts and status
      reloadDocument(true).catch(err => {
        console.error('Failed to reload after document vote update:', err);
      });
      
      // Show toast notification
      toast.success('Document vote updated');
      return; // Done! No API call needed
    } else if (update.eventType === 'document-status-changed') {
      // Handle document status changes (proposal → voting → agreed/rejected)
      // Reload document to get fresh status and voting data
      reloadDocument(true).catch(err => {
        console.error('Failed to reload after document status change:', err);
      });
      
      const oldStatus = update.data?.oldStatus || 'unknown';
      const newStatus = update.data?.newStatus || 'unknown';
      toast.success(`Document status changed: ${oldStatus} → ${newStatus}`);
      return;
    } else if (update.eventType === 'proposal-cutoff-reached') {
      // Handle proposal cutoff - disable new proposals
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        return {
          ...prevDoc,
          paragraphProposalsCutoff: update.data.cutoffDate || prevDoc.paragraphProposalsCutoff
        };
      });
      
      toast.info('Proposal cutoff reached. New proposals are now disabled.');
      return;
    } else if (update.eventType === 'deletion-proposed') {
      // Handle deletion proposal
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        return {
          ...prevDoc,
          deletionProposedAt: new Date().toISOString(),
          deletionProposedBy: update.data.proposedBy,
          deletionVoteDeadline: update.data.voteDeadline
        };
      });
      
      toast.warning('Document deletion has been proposed');
      return;
    } else if (update.eventType === 'deletion-vote') {
      // Handle deletion vote updates
      // Reload document to get updated deletion status
      if (currentDocument) {
        reloadDocument();
      }
      toast.info('Deletion vote updated');
      return;
    } else if (update.eventType === 'deletion-cancelled') {
      // Handle deletion cancellation
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        return {
          ...prevDoc,
          deletionProposedAt: undefined,
          deletionProposedBy: undefined,
          deletionVoteDeadline: undefined
        };
      });
      
      toast.success('Deletion proposal cancelled');
      return;
    } else if (update.eventType === 'document-deleted') {
      // Handle document deletion
      toast.error('Document has been deleted');
      // Navigate away from deleted document
      clearDocument();
      setCurrentView('documents');
      return;
    } else if (update.eventType === 'deletion-vote-rejected') {
      // Handle deletion vote rejection
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        return {
          ...prevDoc,
          deletionProposedAt: undefined,
          deletionProposedBy: undefined,
          deletionVoteDeadline: undefined
        };
      });
      
      toast.info('Deletion proposal rejected - insufficient votes');
      return;
    } else if (update.eventType === 'rule-proposal-approved') {
      // Handle rule proposal approval
      toast.success('Rule proposal approved and implemented');
      // Reload document to get updated governance rules
      if (currentDocument) {
        reloadDocument();
      }
      return;
    } else if (update.eventType === 'governance-rules-updated') {
      // Handle governance rules update (from organization WebSocket)
      // This is also handled in OrganizationManagement, but we can show a toast here too
      if (currentDocument && currentDocument.organizationId === update.data?.organizationId) {
        toast.info('Governance rules have been updated');
        // Optionally reload document to reflect new rules
        reloadDocument(true).catch(err => {
          console.error('Failed to reload after governance rules update:', err);
        });
      }
      return;
    } else {
      // For unknown update types, do a full reload as fallback
      reloadDocument(true).catch(err => {
        console.error('Failed to reload after WebSocket update:', err);
      });
    }
  }, [currentDocument, reloadDocument, updateDocument]);

  // Handler for activity feed WebSocket updates - will be passed to ActivityFeedView
  const activityFeedUpdateHandlerRef = useRef<((update: DocumentUpdate) => void) | null>(null);
  
  const handleActivityFeedUpdate = useCallback((update: DocumentUpdate) => {
    // Forward WebSocket updates to ActivityFeedView
    if (activityFeedUpdateHandlerRef.current) {
      activityFeedUpdateHandlerRef.current(update);
    }
  }, []);

  // Callback to receive handler from ActivityFeedView
  const setActivityFeedUpdateHandler = useCallback((handler: (update: DocumentUpdate) => void) => {
    activityFeedUpdateHandlerRef.current = handler;
  }, []);

  // Connect WebSocket when viewing a document OR activity feed
  const activityFeedDocumentIds = currentView === 'activity' && documents.length > 0
    ? documents.map(doc => doc.id)
    : undefined;
  
  useWebSocket({
    documentId: currentView === 'document' && currentDocument ? currentDocument.id : null,
    documentIds: activityFeedDocumentIds,
    userId: currentUser?.id || null,
    authToken: localStorage.getItem('authToken'),
    onDocumentUpdate: currentView === 'activity' ? handleActivityFeedUpdate : handleDocumentUpdate
  });

  // Refresh document list when navigating to documents view
  // Note: loadDocuments is stable (only depends on currentUser), so safe to include
  useEffect(() => {
    if (currentView === 'documents' && currentUser) {
      loadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, currentUser]); // Only depend on view and user, not loadDocuments

  // Navigation handlers
  const handleShowDocuments = () => {
    // Push current view to history before navigating
    if (currentView !== 'documents') {
      push({
        view: currentView,
        documentId: currentDocument?.id,
        organizationId: selectedOrganization?.id || documentOrganization?.id,
      });
    }
    clearDocument();
    setCurrentView('documents');
    // Documents will be loaded by useEffect when currentView changes
  };

  const handleShowActivity = () => {
    // Push current view to history before navigating
    if (currentView !== 'activity') {
      push({
        view: currentView,
        documentId: currentDocument?.id,
        organizationId: selectedOrganization?.id || documentOrganization?.id,
      });
    }
    clearDocument();
    setCurrentView('activity');
  };

  const handleShowProfile = () => {
    // Push current view to history before navigating
    if (currentView !== 'profile') {
      push({
        view: currentView,
        documentId: currentDocument?.id,
        organizationId: selectedOrganization?.id || documentOrganization?.id,
      });
    }
    clearDocument();
    setCurrentView('profile');
  };

  const handleShowOrganizations = () => {
    // Push current view to history before navigating
    if (currentView !== 'organizations') {
      push({
        view: currentView,
        documentId: currentDocument?.id,
        organizationId: selectedOrganization?.id || documentOrganization?.id,
      });
    }
    clearDocument();
    setCurrentView('organizations');
  };

  const handleShowAdmin = () => {
    // Push current view to history before navigating
    if (currentView !== 'admin') {
      push({
        view: currentView,
        documentId: currentDocument?.id,
        organizationId: selectedOrganization?.id || documentOrganization?.id,
      });
    }
    clearDocument();
    setCurrentView('admin');
  };

  // Proper back handler that restores previous navigation state
  const handleBack = () => {
    const previousState = pop();
    if (!previousState) {
      // Fallback to activity if no history
      clearDocument();
      setCurrentView('activity');
      window.location.hash = '';
      return;
    }

    // Restore previous state
    if (previousState.view === 'document' && previousState.documentId && currentUser) {
      loadDocumentById(previousState.documentId, currentUser).then(() => {
        setCurrentView('document');
        window.location.hash = `#document/${previousState.documentId}`;
      }).catch(() => {
        // If document load fails, fallback to documents view
        clearDocument();
        setCurrentView('documents');
        window.location.hash = '';
      });
    } else if (previousState.view === 'organization' && previousState.organizationId) {
      const org = organizations.find(o => o.id === previousState.organizationId);
      if (org) {
        setSelectedOrganization(org);
        setCurrentView('organization');
        clearDocument();
        window.location.hash = '';
      } else {
        // Fallback if org not found
        clearDocument();
        setCurrentView('organizations');
        window.location.hash = '';
      }
    } else {
      clearDocument();
      setCurrentView(previousState.view);
      window.location.hash = '';
    }
  };

  // Document selection handler
  const handleDocumentSelect = async (document: Document) => {
    // Push current view to history before navigating
    if (currentView !== 'document') {
      push({
        view: currentView,
        documentId: currentDocument?.id,
        organizationId: selectedOrganization?.id || documentOrganization?.id,
      });
    }
    await selectDocument(document);
    setCurrentView('document');
  };

  // Document editing handlers
  const handleAddSuggestion = async (
    paragraphId: string,
    data: {
      text: string;
      type?: 'BODY' | 'TITLE';
      headingLevel?: HeadingLevel;
    }
  ) => {
    if (!currentDocument || !currentUser) return;

    const text = data.text;
    const type = data.type ?? 'BODY';
    
    // Optimistic update - add proposal immediately
    const optimisticProposal = {
      id: `temp-${Date.now()}`,
      paragraphId: paragraphId,
      userId: currentUser.id,
      text: text,
      type: type,
      headingLevel: data.headingLevel || undefined,
      approved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email
      },
      votes: [],
      comments: []
    };

    // Add optimistic proposal to UI immediately
    updateDocument((prevDoc) => {
      if (!prevDoc) return prevDoc;
      
      return {
        ...prevDoc,
        paragraphs: prevDoc.paragraphs.map(para => {
          if (para.id !== paragraphId) return para;
          
          return {
            ...para,
            proposals: [...(para.proposals || []), optimisticProposal]
          };
        })
      };
    });

    try {
      const response = await proposalsApi.createProposal(currentDocument.id, paragraphId, {
        text,
        type,
        headingLevel: data.headingLevel
      });
      
      // WebSocket will update with real proposal, or we can replace optimistic one
      // The WebSocket update will replace the temp proposal with the real one
      toast.success('Suggestion added');
    } catch (err) {
      console.error('Failed to add suggestion:', err);
      
      // Rollback optimistic update on error
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        return {
          ...prevDoc,
          paragraphs: prevDoc.paragraphs.map(para => {
            if (para.id !== paragraphId) return para;
            
            return {
              ...para,
              proposals: para.proposals.filter((p: Proposal) => p.id !== optimisticProposal.id)
            };
          })
        };
      });
      
      toast.error('Failed to add suggestion');
    }
  };

  // Track voting state to prevent duplicate votes
  const [votingState, setVotingState] = useState<Set<string>>(new Set());

  const handleVote = async (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    if (!currentDocument) return;

    // Prevent duplicate votes (debouncing)
    if (votingState.has(suggestionId)) {
      return;
    }

    try {
      // Find the proposal and paragraph
      let paragraphId: string | undefined;
      let proposal: Proposal | undefined = undefined;
      for (const paragraph of currentDocument.paragraphs) {
        const foundProposal = paragraph.proposals.find(p => p.id === suggestionId);
        if (foundProposal) {
          paragraphId = paragraph.id;
          proposal = foundProposal;
          break;
        }
      }

      if (!paragraphId || !proposal) return;

      // Mark as voting to prevent duplicates and show loading state
      setVotingState(prev => new Set(prev).add(suggestionId));

      try {
        // Show loading feedback
        const loadingToast = toast.loading('Processing vote...');

        await votesApi.castVote(currentDocument.id, paragraphId, suggestionId, voteType);

        // Dismiss loading toast
        toast.dismiss(loadingToast);
        
        // WebSocket will provide the real-time update with all votes
        // Show success message briefly
        toast.success('Vote recorded', { duration: 2000 });
      } catch (error: unknown) {
        // Remove from voting state on error
        setVotingState(prev => {
          const next = new Set(prev);
          next.delete(suggestionId);
          return next;
        });
        
        console.error('Failed to cast vote:', error);
        const errorMessage = error instanceof Error 
          ? error.message 
          : (typeof error === 'object' && error !== null && 'response' in error && typeof error.response === 'object' && error.response !== null && 'data' in error.response && typeof error.response.data === 'object' && error.response.data !== null && 'error' in error.response.data
            ? String(error.response.data.error)
            : 'Failed to cast vote');
        toast.error(errorMessage);
        throw error;
      }

      // WebSocket update will clear voting state immediately (see handleDocumentUpdate)
      // Keep timeout as fallback in case WebSocket update is delayed (reduced to 1.5 seconds)
      setTimeout(() => {
        setVotingState(prev => {
          const next = new Set(prev);
          next.delete(suggestionId);
          return next;
        });
      }, 1500);
    } catch (err: unknown) {
      console.error('Failed to cast vote:', err);
      // Clear voting state on error
      setVotingState(prev => {
        const next = new Set(prev);
        next.delete(suggestionId);
        return next;
      });
      
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        toast.error('Too many requests. Please wait a moment before voting again.');
      } else {
        toast.error('Failed to cast vote');
      }
    }
  };

  const handleComment = async (suggestionId: string, text: string, parentId?: string) => {
    if (!currentDocument || !currentUser) return;

    // Find the proposal and paragraph
    let paragraphId: string | undefined;
    let proposal: Proposal | undefined = undefined;
    for (const paragraph of currentDocument.paragraphs) {
      const foundProposal = paragraph.proposals.find(p => p.id === suggestionId);
      if (foundProposal) {
        paragraphId = paragraph.id;
        proposal = foundProposal;
        break;
      }
    }

    if (!paragraphId || !proposal) return;

    // Optimistic update - add comment immediately
    const optimisticComment = {
      id: `temp-${Date.now()}`,
      proposalId: suggestionId,
      userId: currentUser.id,
      text: text,
      parentId: parentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email
      },
      parent: parentId ? undefined : undefined,
      replies: []
    };

    // Add optimistic comment to UI immediately
    updateDocument((prevDoc) => {
      if (!prevDoc) return prevDoc;
      
      return {
        ...prevDoc,
        paragraphs: prevDoc.paragraphs.map(para => {
          if (para.id !== paragraphId) return para;
          
          return {
            ...para,
            proposals: para.proposals.map(prop => {
              if (prop.id !== suggestionId) return prop;
              
              return {
                ...prop,
                comments: [...(prop.comments || []), optimisticComment]
              };
            })
          };
        })
      };
    });

    try {
      await commentsApi.addComment(currentDocument.id, paragraphId, suggestionId, { text, parentId });
      
      // WebSocket will update with real comment, replacing optimistic one
      toast.success(parentId ? 'Reply added' : 'Comment added');
    } catch (err) {
      console.error('Failed to add comment:', err);
      
      // Rollback optimistic update on error
      updateDocument((prevDoc) => {
        if (!prevDoc) return prevDoc;
        
        return {
          ...prevDoc,
          paragraphs: prevDoc.paragraphs.map(para => {
            if (para.id !== paragraphId) return para;
            
            return {
              ...para,
              proposals: para.proposals.map(prop => {
                if (prop.id !== suggestionId) return prop;
                
                return {
                  ...prop,
                  comments: prop.comments.filter((c: Comment) => c.id !== optimisticComment.id)
                };
              })
            };
          })
        };
      });
      
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
      await reloadDocument();
        toast.success('Paragraph suggestion created');
    } catch (err) {
      throw err;
    }
  };

  // Collaborator management
  const handleCollaboratorAdded = async (user: User) => {
    console.log('onCollaboratorAdded called with user:', user);
    // Refresh the document data to show the new collaborator
    try {
      console.log('Refreshing document after adding collaborator...');
      await reloadDocument();
      if (currentDocument) {
        console.log('Updated document collaborators count:', currentDocument.collaborators.length);
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
      await reloadDocument();
      if (currentDocument) {
        console.log('Updated document collaborators count:', currentDocument.collaborators.length);
      }
    } catch (error) {
      console.error('Failed to refresh document after removing collaborator:', error);
    }
  };

  // Activity feed handlers
  const handleNavigateToDocument = async (documentId: string) => {
    try {
      // Push current view to history before navigating
      if (currentView !== 'document') {
        push({
          view: currentView,
          documentId: currentDocument?.id,
          organizationId: selectedOrganization?.id || documentOrganization?.id,
        });
      }
      // Load the document directly
      await loadDocumentById(documentId, currentUser);
      setCurrentView('document');
      // Load structure proposals for this document
      await loadStructureProposals();
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
    // Push current view to history before navigating
    if (currentView !== 'organization') {
      push({
        view: currentView,
        documentId: currentDocument?.id,
        organizationId: selectedOrganization?.id || documentOrganization?.id,
      });
    }
    setSelectedOrganization(org);
    setCurrentView('organization');
  };

  const handleBackFromOrganization = () => {
    setSelectedOrganization(null);
    // For single-org users, go back to activity view; for multi-org users, go to organizations list
    if (isSingleOrg && currentUser?.role !== 'admin') {
      setCurrentView('activity');
    } else {
      setCurrentView('organizations');
    }
  };

  // Handler to refresh organization data after branding update
  const handleOrganizationBrandingUpdate = async (organizationId: string) => {
    try {
      const response = await organizationsApi.getOrganization(organizationId);
      const updatedOrg = response.organization;
      
      // Update selectedOrganization if it matches
      if (selectedOrganization?.id === organizationId) {
        setSelectedOrganization(updatedOrg);
      }
      
      // Update documentOrganization if it matches
      if (documentOrganization?.id === organizationId) {
        setDocumentOrganization(updatedOrg);
      }
      
      // Refresh organizations list to update primaryOrganization
      // This will automatically update primaryOrganization since it's derived from the organizations array
      await refreshOrganizations();
    } catch (error) {
      console.error('Failed to refresh organization:', error);
    }
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
  const showBackButton = canGoBack && (currentView !== 'activity' || history.length > 1);
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
        onBack={handleBack}
      title={title}
        showCreateButton={currentView === 'documents'}
        onCreateDocument={() => setIsCreateDialogOpen(true)}
        organization={
          // For single-org users, apply branding to all views
          isSingleOrg && primaryOrganization
            ? primaryOrganization
            : (currentView === 'organization' 
              ? selectedOrganization 
              : (currentView === 'document' && currentDocument?.organizationId 
                ? documentOrganization 
                : null))
        }
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
          onWebSocketUpdate={setActivityFeedUpdateHandler}
          organizations={organizations}
        />
      )}

      {currentView === 'profile' && currentUser && (
        <ProfilePage
            user={currentUser}
            onProfileUpdate={handleProfileUpdate}
          />
      )}

      {currentView === 'organizations' && currentUser && (
        <OrganizationDashboard
          currentUser={currentUser}
          onSelectOrganization={handleSelectOrganization}
        />
      )}

      {currentView === 'organization' && selectedOrganization && currentUser && (
        <OrganizationManagement
          organization={selectedOrganization}
          currentUser={currentUser}
          onBack={handleBackFromOrganization}
          onSelectDocument={handleDocumentSelect}
          onBrandingUpdate={handleOrganizationBrandingUpdate}
        />
      )}

      {currentView === 'admin' && currentUser?.role === 'admin' && (
        <AdminDashboard
          currentUser={currentUser}
          onBack={handleBack}
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