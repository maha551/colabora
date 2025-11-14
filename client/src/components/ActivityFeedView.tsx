import React, { useEffect, useState } from "react";
import { User, Document } from "../types";
import { Card } from "./ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";
import {
  CheckCircle2,
  MessageSquare,
  FileEdit,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Clock,
  Calendar,
  Filter,
  RefreshCw,
  AlertCircle,
  FileText,
  Expand,
  ArrowUpDown,
  TrendingUp,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { cn } from "./ui/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./ui/tabs";
import { toast } from "sonner";
import { ActivityFeedProposalCard } from "./ActivityFeedProposalCard";
import { 
  adaptProposalToSuggestion, 
  extractDocumentContext, 
  getOriginalText, 
  ActivityFeedProposal,
  adaptAgreedVersionToSuggestion,
  extractDocumentContextFromVersion,
  AgreedVersion
} from "../utils/proposalAdapter";
import { VersionHistory } from "../types";

interface DiffSegment {
  text: string;
  type: "original" | "suggestion1" | "suggestion2" | "both" | "deletion";
}

function getInlineDiffSegments(original: string, modified: string): DiffSegment[] {
  try {
    // Handle null/undefined inputs
    const origText = original || "";
    const modText = modified || "";

    const originalWords = origText.split(/(\s+)/);
    const modifiedWords = modText.split(/(\s+)/);
    const segments: DiffSegment[] = [];

    const maxLen = Math.max(originalWords.length, modifiedWords.length);

    for (let i = 0; i < maxLen; i++) {
      const origWord = originalWords[i] || "";
      const modWord = modifiedWords[i] || "";

      if (origWord === modWord && origWord.trim()) {
        // Same word in both - show as original
        segments.push({ text: origWord, type: "original" });
      } else if (modWord && modWord.trim()) {
        // Word exists in modified but not in original (or different) - addition
        segments.push({ text: modWord, type: "suggestion1" });
      } else if (origWord && origWord.trim()) {
        // Word exists in original but not in modified - deletion
        segments.push({ text: origWord, type: "deletion" });
      }
    }

    return segments;
  } catch (error) {
    console.error('Error in getInlineDiffSegments:', error);
    // Return a safe fallback
    return [{ text: original || modified || "Error in diff", type: "original" }];
  }
}

function InlineDiffText({ originalText, modifiedText }: { originalText: string; modifiedText: string }) {
  try {
    const segments = getInlineDiffSegments(originalText, modifiedText);

    return (
      <>
        {segments.map((segment, index) => {
          try {
            if (segment.type === "original") {
              return (
                <span key={index} className="text-gray-700 dark:text-gray-300">
                  {segment.text}
                </span>
              );
            } else if (segment.type === "deletion") {
              return (
                <span
                  key={index}
                  className="text-red-600 dark:text-red-400 line-through bg-red-50 dark:bg-red-900/20 px-0.5 rounded-sm"
                >
                  {segment.text}
                </span>
              );
            } else {
              return (
                <span
                  key={index}
                  className="bg-amber-200 dark:bg-amber-900/50 text-gray-900 dark:text-gray-100 px-0.5 rounded-sm"
                >
                  {segment.text}
                </span>
              );
            }
          } catch (error) {
            console.error('Error rendering diff segment:', segment, error);
            return (
              <span key={index} className="text-red-500">
                [Error]
              </span>
            );
          }
        })}
      </>
    );
  } catch (error) {
    console.error('Error in InlineDiffText:', error);
    return (
      <span className="text-red-500">
        [Diff Error]
      </span>
    );
  }
}

interface ActivityItem {
  id: string;
  type: 'proposal_created' | 'proposal_accepted' | 'vote_cast' | 'comment_added' | 'structure_proposal_created' | 'structure_proposal_vote' | 'structure_proposal_approved' | 'structure_proposal_applied';
  userId: string;
  userName: string;
  userAvatar?: string;
  paragraphTitle?: string;
  proposalText?: string;
  voteType?: 'PRO' | 'NEUTRAL' | 'CONTRA';
  commentText?: string;
  timestamp: string;
}

interface PendingProposal {
  id: string;
  paragraphId: string;
  documentId: string;
  documentTitle: string;
  paragraphTitle?: string;
  proposedText: string;
  currentText: string;
  type: 'BODY' | 'TITLE';
  headingLevel?: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  votes: {
    total: number;
    pro: number;
    contra: number;
    neutral: number;
  };
  totalUsers: number;
}

interface ActivityFeedViewProps {
  documents: Document[];
  currentUser: User;
  onNavigateToDocument: (documentId: string) => void;
  onAddComment?: (proposalId: string, documentId: string, paragraphId: string, text: string, parentId?: string) => Promise<void>;
}

export function ActivityFeedView({ documents, currentUser, onNavigateToDocument, onAddComment }: ActivityFeedViewProps) {
  const [activePanel, setActivePanel] = useState<'agreed' | 'pending' | 'debated'>('agreed');
  const [agreedVersions, setAgreedVersions] = useState<AgreedVersion[]>([]);
  const [loadingAgreed, setLoadingAgreed] = useState(false);
  const [paragraphHistories, setParagraphHistories] = useState<Record<string, VersionHistory[]>>({});
  const [debatedProposals, setDebatedProposals] = useState<any[]>([]);
  const [loadingDebated, setLoadingDebated] = useState(false);
  const [pendingProposals, setPendingProposals] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [lastViewedTimestamps, setLastViewedTimestamps] = useState<Record<string, string>>({});
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<Record<string, string | null>>({});
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('all');
  const [pageSize] = useState(20);
  const [displayedCounts, setDisplayedCounts] = useState({
    agreed: 20,
    debated: 20,
    pending: 20,
  });


  // Load last viewed timestamps from localStorage
  const loadLastViewedTimestamps = () => {
    try {
      const stored = localStorage.getItem('activityFeedLastViewed');
      if (stored) {
        setLastViewedTimestamps(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load last viewed timestamps:', error);
    }
  };

  // Update last viewed timestamp for a panel
  const updateLastViewedTimestamp = (panel: string) => {
    const now = new Date().toISOString();
    const updated = { ...lastViewedTimestamps, [panel]: now };
    setLastViewedTimestamps(updated);
    try {
      localStorage.setItem('activityFeedLastViewed', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save last viewed timestamp:', error);
    }
  };

  // Load initial data
  useEffect(() => {
    loadLastViewedTimestamps();
    // Load data when panels are activated
  }, []);


  const fetchAgreedVersions = async () => {
    setLoadingAgreed(true);
    try {
      // Use the new backend API for agreed versions
      const params = new URLSearchParams();
      const lastViewedAgreed = lastViewedTimestamps['agreed'];
      if (lastViewedAgreed) {
        params.append('since', lastViewedAgreed);
      }

      const response = await fetch(`/api/agreed-versions?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const versions = data.versions || [];
        setAgreedVersions(versions);
        
        // Fetch history for each paragraph (we'll optimize this later)
        // Use a Set to track which paragraphs we're already fetching to avoid duplicates
        const fetchingHistory = new Set<string>();
        const historyPromises = versions.map(async (version: AgreedVersion) => {
          // Check if we already have history (using current state)
          if (paragraphHistories[version.paragraphId]) {
            return; // Already have it
          }
          
          // Skip if already fetching
          if (fetchingHistory.has(version.paragraphId)) {
            return;
          }
          
          fetchingHistory.add(version.paragraphId);
          
          try {
            // Fetch document to get paragraph history
            const docResponse = await fetch(`/api/documents/${version.documentId}`, {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
              },
            });
            if (docResponse.ok) {
              const docData = await docResponse.json();
              const paragraph = docData.document?.paragraphs?.find((p: any) => p.id === version.paragraphId);
              if (paragraph?.history) {
                const history: VersionHistory[] = paragraph.history.map((h: any) => ({
                  id: h.id,
                  paragraphId: h.paragraphId || version.paragraphId,
                  userId: h.userId,
                  text: h.newText || h.text,
                  oldText: h.oldText,
                  proposalId: h.proposalId,
                  acceptedAt: new Date(h.acceptedAt || h.createdAt),
                  approvalPercentage: h.approvalPercentage || 0,
                  type: h.proposalType || h.type || 'BODY',
                  headingLevel: h.headingLevel,
                  user: {
                    id: h.userId,
                    name: h.userName || '',
                    email: h.userEmail || '',
                  },
                }));
                setParagraphHistories(prev => {
                  // Double-check we don't overwrite existing history
                  if (prev[version.paragraphId]) {
                    return prev;
                  }
                  return { ...prev, [version.paragraphId]: history };
                });
              }
            }
          } catch (err) {
            console.error(`Failed to fetch history for paragraph ${version.paragraphId}:`, err);
          } finally {
            fetchingHistory.delete(version.paragraphId);
          }
        });
        
        // Don't await all - let them load in background
        Promise.all(historyPromises).catch(console.error);
      } else {
        console.error('Failed to fetch agreed versions:', response.status);
        setAgreedVersions([]);
      }
    } catch (error) {
      console.error('Failed to fetch agreed versions:', error);
      setAgreedVersions([]);
    } finally {
      setLoadingAgreed(false);
    }
  };

  const fetchDebatedProposals = async () => {
    setLoadingDebated(true);
    try {
      const response = await fetch('/api/debated-proposals', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDebatedProposals(data.proposals || []);
      } else {
        console.error('Failed to fetch debated proposals:', response.status);
        setDebatedProposals([]);
      }
    } catch (error) {
      console.error('Failed to fetch debated proposals:', error);
      setDebatedProposals([]);
    } finally {
      setLoadingDebated(false);
    }
  };

  const fetchPendingProposals = async () => {
    setLoadingPending(true);
    try {
      const response = await fetch('/api/pending-votes', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPendingProposals(data.proposals || []);
      } else {
        console.error('Failed to fetch pending proposals:', response.status);
        setPendingProposals([]);
      }
    } catch (error) {
      console.error('Failed to fetch pending proposals:', error);
      setPendingProposals([]);
    } finally {
      setLoadingPending(false);
    }
  };

  // Toggle expanded state for diff views
  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Toggle comments expansion
  const toggleCommentsExpanded = (proposalId: string) => {
    setExpandedComments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(proposalId)) {
        newSet.delete(proposalId);
      } else {
        newSet.add(proposalId);
      }
      return newSet;
    });
  };

  // Get preview text for proposed change
  const getChangePreview = (currentText: string, proposedText: string, maxLength: number = 80): string => {
    if (!proposedText) return 'No preview available';
    if (proposedText.length <= maxLength) return proposedText;
    return proposedText.substring(0, maxLength).trim() + '...';
  };

  // Organize comments hierarchically
  const getTopLevelComments = (comments: any[]) => {
    return comments.filter(c => !c.parentId);
  };

  const getReplies = (comments: any[], commentId: string) => {
    return comments.filter(c => c.parentId === commentId);
  };

  // Handle adding a comment/reply
  const handleAddComment = async (proposalId: string, documentId: string, paragraphId: string, text: string, parentId?: string) => {
    if (!onAddComment) {
      // Fallback: navigate to document
      onNavigateToDocument(documentId);
      return;
    }

    try {
      await onAddComment(proposalId, documentId, paragraphId, text, parentId);
      // Clear reply form
      setReplyingTo(prev => ({ ...prev, [proposalId]: null }));
      setReplyTexts(prev => ({ ...prev, [proposalId]: '' }));
      setCommentTexts(prev => ({ ...prev, [proposalId]: '' }));
      // Refresh proposals to get updated comments
      if (activePanel === 'debated') {
        fetchDebatedProposals();
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
      toast.error('Failed to add comment');
    }
  };

  // Start replying to a comment
  const startReply = (proposalId: string, commentId: string) => {
    setReplyingTo(prev => ({ ...prev, [proposalId]: commentId }));
    setReplyTexts(prev => ({ ...prev, [proposalId]: '' }));
    // Expand comments if collapsed
    if (!expandedComments.has(proposalId)) {
      setExpandedComments(prev => {
        const newSet = new Set(prev);
        newSet.add(proposalId);
        return newSet;
      });
    }
  };

  // Cancel reply
  const cancelReply = (proposalId: string) => {
    setReplyingTo(prev => ({ ...prev, [proposalId]: null }));
    setReplyTexts(prev => ({ ...prev, [proposalId]: '' }));
  };

  // Handle voting from Activity Feed
  const handleVote = async (proposalId: string, documentId: string, paragraphId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    try {
      const response = await fetch(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ vote: voteType }),
      });

      if (response.ok) {
        toast.success('Vote recorded');
        // Refresh the current tab
        if (activePanel === 'pending') {
          fetchPendingProposals();
        } else if (activePanel === 'debated') {
          fetchDebatedProposals();
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to record vote');
      }
    } catch (error) {
      console.error('Failed to vote:', error);
      toast.error('Failed to record vote');
    }
  };

  // Get all collaborators for a document
  const getAllCollaborators = (documentId: string): User[] => {
    const doc = documents.find(d => d.id === documentId);
    if (!doc) return [];
    
    const collaborators: User[] = [doc.owner];
    doc.collaborators.forEach(c => {
      if (!collaborators.find(u => u.id === c.user.id)) {
        collaborators.push(c.user);
      }
    });
    return collaborators;
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Filter proposals by selected document
  const filterByDocument = <T extends { documentId: string }>(items: T[]): T[] => {
    if (selectedDocumentId === 'all') return items;
    return items.filter(item => item.documentId === selectedDocumentId);
  };

  // Get displayed items (for infinite scroll)
  const getDisplayedItems = <T,>(items: T[], tab: 'agreed' | 'debated' | 'pending'): T[] => {
    const filtered = filterByDocument(items as any[]);
    return filtered.slice(0, displayedCounts[tab]);
  };

  // Check if there are more items to load
  const hasMore = (items: any[], tab: 'agreed' | 'debated' | 'pending'): boolean => {
    const filtered = filterByDocument(items);
    return filtered.length > displayedCounts[tab];
  };

  // Load more items
  const loadMore = (tab: 'agreed' | 'debated' | 'pending') => {
    setDisplayedCounts(prev => ({
      ...prev,
      [tab]: prev[tab] + pageSize,
    }));
  };

  // Load data when panels are activated
  useEffect(() => {
    if (activePanel === 'agreed') {
      fetchAgreedVersions();
    }
  }, [activePanel]);

  useEffect(() => {
    if (activePanel === 'debated') {
      fetchDebatedProposals();
    }
  }, [activePanel]);

  useEffect(() => {
    if (activePanel === 'pending') {
      fetchPendingProposals();
    }
  }, [activePanel]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Navigation Tabs */}
        <Tabs value={activePanel} onValueChange={(value) => {
          setActivePanel(value as 'agreed' | 'pending' | 'debated');
          // Reset displayed count when switching tabs
          setDisplayedCounts({
            agreed: pageSize,
            debated: pageSize,
            pending: pageSize,
          });
        }}>
          <div className="flex justify-center mb-4 px-4">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger
                value="agreed"
                className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm"
                aria-label={`Accepted versions tab with ${agreedVersions.length} accepted versions`}
              >
                <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />
                <span className="sm:hidden" aria-hidden="true">Done</span>
                <span className="hidden sm:inline" aria-hidden="true">Accepted</span>
                {agreedVersions.length > 0 && (
                  <Badge variant="default" className="ml-1 bg-green-600 text-xs" aria-label={`${agreedVersions.length} accepted versions`}>
                    {agreedVersions.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="debated"
                className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm"
                aria-label={`Discussed proposals tab with ${debatedProposals.length} discussed proposals`}
              >
                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />
                <span className="sm:hidden" aria-hidden="true">Disc</span>
                <span className="hidden sm:inline" aria-hidden="true">Discussed</span>
                {debatedProposals.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs" aria-label={`${debatedProposals.length} discussed proposals`}>
                    {debatedProposals.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="pending"
                className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm"
                aria-label={`Pending proposals tab with ${pendingProposals.length} pending proposals`}
              >
                <Clock className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />
                <span className="sm:hidden" aria-hidden="true">Wait</span>
                <span className="hidden sm:inline" aria-hidden="true">Pending</span>
                {pendingProposals.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs" aria-label={`${pendingProposals.length} pending proposals`}>
                    {pendingProposals.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Document Filter */}
          <div className="mb-6 flex items-center justify-center gap-3 px-4">
            <Filter className="h-4 w-4 text-gray-500" />
            <Select value={selectedDocumentId} onValueChange={setSelectedDocumentId}>
              <SelectTrigger className="w-[200px] bg-white">
                <SelectValue placeholder="Filter by document" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Documents</SelectItem>
                {documents.map(doc => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Content */}

          <TabsContent value="agreed" className="mt-0">
            {loadingAgreed ? (
              <Card className="p-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading agreed versions...</p>
                </div>
              </Card>
            ) : agreedVersions.length === 0 ? (
              <Card className="p-12">
                <div className="text-center text-gray-500">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-400" />
                  <h3 className="text-lg font-medium mb-2">No Agreed Versions Yet</h3>
                  <p className="text-sm">
                    Recently accepted proposals will appear here with their real approval percentages.
                  </p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {getDisplayedItems(agreedVersions, 'agreed').map((version: AgreedVersion) => {
                  const adaptedSuggestion = adaptAgreedVersionToSuggestion(version);
                  const documentContext = extractDocumentContextFromVersion(version);
                  const originalText = version.previousText;
                  const allCollaborators = getAllCollaborators(version.documentId);
                  const history = paragraphHistories[version.paragraphId] || [];

                  return (
                    <ActivityFeedProposalCard
                      key={version.id}
                      proposal={adaptedSuggestion}
                      documentContext={documentContext}
                      currentUser={currentUser}
                      totalUsers={allCollaborators.length}
                      allCollaborators={allCollaborators}
                      originalText={originalText}
                      history={history}
                      tabType="accepted"
                      onVote={(proposalId, documentId, paragraphId, voteType) => {
                        // Voting disabled for accepted proposals
                        toast.info('This proposal has already been accepted');
                      }}
                      onComment={(proposalId, documentId, paragraphId, text, parentId) => 
                        handleAddComment(proposalId, documentId, paragraphId, text, parentId)
                      }
                      onNavigateToDocument={onNavigateToDocument}
                    />
                  );
                })}
                {hasMore(agreedVersions, 'agreed') && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={() => loadMore('agreed')}
                      className="w-full sm:w-auto"
                    >
                      Load More ({filterByDocument(agreedVersions).length - displayedCounts.agreed} more)
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="debated" className="mt-0">
            {loadingDebated ? (
              <Card className="p-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Finding most debated proposals...</p>
                </div>
              </Card>
            ) : debatedProposals.length === 0 ? (
              <Card className="p-12">
                <div className="text-center text-gray-500">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 text-purple-400" />
                  <p className="text-lg font-medium mb-2">No Debated Proposals</p>
                  <p className="text-sm">
                    Proposals with high engagement and discussion will appear here.
                  </p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {getDisplayedItems(debatedProposals, 'debated').map((proposal: any, index: number) => {
                  // Adjust index for filtered results
                  const filtered = filterByDocument(debatedProposals);
                  const actualIndex = filtered.indexOf(proposal);
                  const adaptedSuggestion = adaptProposalToSuggestion(proposal);
                  const documentContext = extractDocumentContext(proposal);
                  const originalText = getOriginalText(proposal);
                  const allCollaborators = getAllCollaborators(proposal.documentId);

                  return (
                    <div key={proposal.id} className="space-y-2">
                      {/* Debate Ranking Badge */}
                      <div className="flex items-center gap-2 text-xs text-purple-700">
                        <span className="font-bold bg-purple-100 px-1.5 py-0.5 rounded">#{actualIndex + 1}</span>
                        <TrendingUp className="h-3 w-3" />
                        <span>Score: {proposal.debateScore}</span>
                        {proposal.engagement?.proPercentage > 30 && proposal.engagement?.contraPercentage > 30 && (
                          <>
                            <span>•</span>
                            <Badge className="bg-orange-100 text-orange-700 border-orange-200 px-1.5 py-0.5 text-xs font-semibold">
                              ⚖️ Controversial
                            </Badge>
                          </>
                        )}
                      </div>
                      
                      <ActivityFeedProposalCard
                        proposal={adaptedSuggestion}
                        documentContext={documentContext}
                        currentUser={currentUser}
                        totalUsers={proposal.totalUsers || 1}
                        allCollaborators={allCollaborators}
                        originalText={originalText}
                        tabType="debated"
                        onVote={(proposalId, documentId, paragraphId, voteType) => 
                          handleVote(proposalId, documentId, paragraphId, voteType)
                        }
                        onComment={(proposalId, documentId, paragraphId, text, parentId) => 
                          handleAddComment(proposalId, documentId, paragraphId, text, parentId)
                        }
                        onNavigateToDocument={onNavigateToDocument}
                      />
                    </div>
                  );
                })}
                {hasMore(debatedProposals, 'debated') && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={() => loadMore('debated')}
                      className="w-full sm:w-auto"
                    >
                      Load More ({filterByDocument(debatedProposals).length - displayedCounts.debated} more)
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pending" className="mt-0">
            {loadingPending ? (
              <Card className="p-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading pending proposals...</p>
                </div>
              </Card>
            ) : pendingProposals.length === 0 ? (
              <Card className="p-12">
                <div className="text-center text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-blue-400" />
                  <h3 className="text-lg font-medium mb-2">No Pending Proposals</h3>
                  <p className="text-sm">
                    All proposals in your documents have received your vote, or there are no active proposals.
                  </p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {getDisplayedItems(pendingProposals, 'pending').map((proposal: any) => {
                  const adaptedSuggestion = adaptProposalToSuggestion(proposal);
                  const documentContext = extractDocumentContext(proposal);
                  const originalText = getOriginalText(proposal);
                  const allCollaborators = getAllCollaborators(proposal.documentId);

                  return (
                    <ActivityFeedProposalCard
                      key={proposal.id}
                      proposal={adaptedSuggestion}
                      documentContext={documentContext}
                      currentUser={currentUser}
                      totalUsers={proposal.totalUsers || 1}
                      allCollaborators={allCollaborators}
                      originalText={originalText}
                      tabType="pending"
                      onVote={(proposalId, voteType) => 
                        handleVote(proposalId, proposal.documentId, proposal.paragraphId, voteType)
                      }
                      onComment={(proposalId, text, parentId) => 
                        handleAddComment(proposalId, proposal.documentId, proposal.paragraphId, text, parentId)
                      }
                      onNavigateToDocument={onNavigateToDocument}
                    />
                  );
                })}
                {hasMore(pendingProposals, 'pending') && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={() => loadMore('pending')}
                      className="w-full sm:w-auto"
                    >
                      Load More ({filterByDocument(pendingProposals).length - displayedCounts.pending} more)
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
