import React, { useEffect, useState, useMemo } from "react";
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
  TrendingUp
} from "lucide-react";
import { cn } from "./ui/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { toast } from "sonner";
import { DiffViewer } from "./DiffViewer";
import { VoteProgressBar } from "./VoteProgressBar";

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
  type: 'proposal_created' | 'proposal_accepted' | 'vote_cast' | 'comment_added';
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
}

export function ActivityFeedView({ documents, currentUser, onNavigateToDocument }: ActivityFeedViewProps) {
  const [allActivities, setAllActivities] = useState<(ActivityItem & { documentId: string; documentTitle: string })[]>([]);
  const [pendingProposals, setPendingProposals] = useState<PendingProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPending, setLoadingPending] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDocument, setFilterDocument] = useState<string>('all');
  const [activePanel, setActivePanel] = useState<'agreed' | 'pending' | 'debated'>('pending');
  const [agreedVersions, setAgreedVersions] = useState<any[]>([]);
  const [loadingAgreed, setLoadingAgreed] = useState(false);
  const [debatedProposals, setDebatedProposals] = useState<any[]>([]);
  const [loadingDebated, setLoadingDebated] = useState(false);
  const [lastViewedTimestamps, setLastViewedTimestamps] = useState<Record<string, string>>({});

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

  // Pending proposals filters and sorting
  const [pendingFilterDocument, setPendingFilterDocument] = useState<string>('all');
  const [pendingFilterType, setPendingFilterType] = useState<string>('all');
  const [pendingSortBy, setPendingSortBy] = useState<string>('newest');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [votingProposalId, setVotingProposalId] = useState<string | null>(null);
  const [showFullDocumentMap, setShowFullDocumentMap] = useState<Record<string, boolean>>({});
  const [fullDocumentParagraphsMap, setFullDocumentParagraphsMap] = useState<Record<string, any[]>>({});
  const [loadingFullDocumentMap, setLoadingFullDocumentMap] = useState<Record<string, boolean>>({});
  const [commentsMap, setCommentsMap] = useState<Record<string, any[]>>({});
  const [loadingCommentsMap, setLoadingCommentsMap] = useState<Record<string, boolean>>({});
  const [commentTextMap, setCommentTextMap] = useState<Record<string, string>>({});
  const [replyingToMap, setReplyingToMap] = useState<Record<string, string | null>>({});
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});

  // Helper function to check if a paragraph has accepted changes
  const hasAcceptedChanges = (paragraph: any) => {
    return paragraph.history && paragraph.history.length > 0;
  };

  // Helper function to get the highest approved change info
  const getHighestApprovedChangeInfo = (paragraph: any) => {
    if (!paragraph.history || paragraph.history.length === 0) return null;
    // Sort by approval percentage descending, then by acceptance date descending
    const highestApprovedChange = paragraph.history
      .filter((change: any) => change.approval_percentage >= 75)
      .sort((a: any, b: any) => {
        // First sort by approval percentage (highest first)
        if (b.approval_percentage !== a.approval_percentage) {
          return b.approval_percentage - a.approval_percentage;
        }
        // Then by acceptance date (most recent first)
        return new Date(b.accepted_at).getTime() - new Date(a.accepted_at).getTime();
      })[0];
    return highestApprovedChange;
  };

  // Helper function to get the accepted content for a paragraph
  const getAcceptedContent = (paragraph: any) => {
    console.log('🔍 getAcceptedContent called for paragraph:', paragraph.id, {
      hasProposals: paragraph.proposals?.length > 0,
      title: paragraph.title?.substring(0, 30) + '...',
      text: paragraph.text?.substring(0, 30) + '...'
    });

    // For contextual data, check proposals first
    if (paragraph.proposals && paragraph.proposals.length > 0) {
      const approvedProposal = paragraph.proposals.find((p: any) => p.approved);
      if (approvedProposal) {
        console.log('✅ Found approved proposal, returning:', approvedProposal.text?.substring(0, 50) + '...');
        return approvedProposal.text;
      }
      console.log('⚠️ Has proposals but none approved');
    }

    // Fall back to history-based logic for full document data
    const highestApprovedChange = getHighestApprovedChangeInfo(paragraph);
    if (highestApprovedChange) {
      console.log('✅ Found highest approved change, returning:', highestApprovedChange.new_text?.substring(0, 50) + '...');
      return highestApprovedChange.new_text;
    }
    console.log('⚠️ No approved changes in history');

    // For contextual data without approved proposals, use the basic text
    // For heading paragraphs, use title; for body paragraphs, use text
    if (paragraph.title && paragraph.title.trim()) {
      console.log('📄 Using title as content:', paragraph.title.substring(0, 50) + '...');
      return paragraph.title;
    }

    const result = paragraph.text || '';
    console.log('📄 Using text as content:', result.substring(0, 50) + '...');
    return result;
  };

  // Helper function to check if paragraph has accepted changes (for contextual data)
  const hasAcceptedChangesContext = (paragraph: any) => {
    if (paragraph.proposals && paragraph.proposals.length > 0) {
      return paragraph.proposals.some((p: any) => p.approved);
    }
    // Fall back to history-based logic
    return hasAcceptedChanges(paragraph);
  };

  // Helper function to get highest approved change info (for contextual data)
  const getHighestApprovedChangeInfoContext = (paragraph: any) => {
    if (paragraph.proposals && paragraph.proposals.length > 0) {
      const approvedProposals = paragraph.proposals.filter((p: any) => p.approved);
      if (approvedProposals.length > 0) {
        // Find the one with highest approval percentage
        const highestApproved = approvedProposals
          .sort((a: any, b: any) => {
            const aVotes = a.votes?.length || 0;
            const bVotes = b.votes?.length || 0;
            return bVotes - aVotes; // Simple approximation
          })[0];

        // Convert proposal to history-like format
        return {
          new_text: highestApproved.text,
          approval_percentage: highestApproved.votes ?
            (highestApproved.votes.filter((v: any) => v.vote === 'PRO').length / highestApproved.votes.length) * 100 : 100,
          accepted_at: highestApproved.created_at
        };
      }
    }
    // Fall back to history-based logic
    return getHighestApprovedChangeInfo(paragraph);
  };

  useEffect(() => {
    loadLastViewedTimestamps();
    fetchAllActivities();
    fetchPendingProposals();
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchAllActivities();
      fetchPendingProposals();
    }, 30000);
    return () => clearInterval(interval);
  }, [documents]);

  // Fetch agreed versions when activities are loaded
  useEffect(() => {
    if (allActivities.length > 0) {
      fetchAgreedVersions();
    }
  }, [allActivities]);

  // Fetch debated proposals when pending proposals or comments change
  useEffect(() => {
    if (pendingProposals.length > 0) {
      fetchDebatedProposals();
    }
  }, [pendingProposals, commentsMap]);

  // Fetch comments for all pending proposals
  useEffect(() => {
    pendingProposals.forEach(proposal => {
      if (!commentsMap[proposal.id]) {
        fetchComments(proposal.id, proposal.documentId, proposal.paragraphId);
      }
    });
  }, [pendingProposals]);

  // Filter and sort pending proposals
  const filteredAndSortedPendingProposals = useMemo(() => {
    try {
      let filtered = (pendingProposals || []).filter(proposal => {
        // Filter by document
        if (pendingFilterDocument !== 'all' && proposal?.documentId !== pendingFilterDocument) {
          return false;
        }

        // Filter by type
        if (pendingFilterType !== 'all' && proposal?.type !== pendingFilterType) {
          return false;
        }

        return true;
      });

      // Sort
      filtered.sort((a, b) => {
        try {
          switch (pendingSortBy) {
            case 'newest':
              return new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();
            case 'oldest':
              return new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime();
            case 'approval_high':
              const aApproval = (a?.totalUsers || 0) > 0 ? ((a?.votes?.pro || 0) / (a?.totalUsers || 1)) * 100 : 0;
              const bApproval = (b?.totalUsers || 0) > 0 ? ((b?.votes?.pro || 0) / (b?.totalUsers || 1)) * 100 : 0;
              return bApproval - aApproval;
            case 'approval_low':
              const aApprovalLow = (a?.totalUsers || 0) > 0 ? ((a?.votes?.pro || 0) / (a?.totalUsers || 1)) * 100 : 0;
              const bApprovalLow = (b?.totalUsers || 0) > 0 ? ((b?.votes?.pro || 0) / (b?.totalUsers || 1)) * 100 : 0;
              return aApprovalLow - bApprovalLow;
            case 'document':
              return (a?.documentTitle || '').localeCompare(b?.documentTitle || '');
            default:
              return 0;
          }
        } catch (error) {
          console.error('Error sorting proposals:', error);
          return 0;
        }
      });

      return filtered;
    } catch (error) {
      console.error('Error filtering/sorting pending proposals:', error);
      return pendingProposals || [];
    }
  }, [pendingProposals, pendingFilterDocument, pendingFilterType, pendingSortBy]);

  const fetchAllActivities = async () => {
    setLoading(true);
    try {
      const allActivitiesPromises = documents.map(async (doc) => {
        try {
          const response = await fetch(`/api/documents/${doc.id}/activity`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            return (data.activities || []).map((activity: ActivityItem) => ({
              ...activity,
              documentId: doc.id,
              documentTitle: doc.title,
            }));
          }
          return [];
        } catch (error) {
          console.error(`Failed to fetch activities for document ${doc.id}:`, error);
          return [];
        }
      });

      const results = await Promise.all(allActivitiesPromises);
      const combined = results.flat();
      
      // Sort by timestamp descending
      combined.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      setAllActivities(combined);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    } finally {
      setLoading(false);
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
      }
    } catch (error) {
      console.error('Failed to fetch pending proposals:', error);
    } finally {
      setLoadingPending(false);
    }
  };

  const fetchAgreedVersions = async () => {
    setLoadingAgreed(true);
    try {
      // For now, simulate agreed versions by filtering accepted proposals from activities
      // In a real implementation, this would be a dedicated API endpoint
      let acceptedActivities = allActivities.filter(activity => activity.type === 'proposal_accepted');

      // Filter by last viewed timestamp for "new since last time"
      const lastViewedAgreed = lastViewedTimestamps['agreed'];
      if (lastViewedAgreed) {
        const lastViewedDate = new Date(lastViewedAgreed);
        acceptedActivities = acceptedActivities.filter(activity =>
          new Date(activity.timestamp) > lastViewedDate
        );
      }

      // Transform activities into agreed versions format
      const agreedVersionsData = acceptedActivities.slice(0, 10).map(activity => ({
        id: `agreed-${activity.id}`,
        documentId: activity.documentId,
        documentTitle: activity.documentTitle,
        paragraphTitle: activity.paragraphTitle,
        acceptedText: activity.proposalText || 'Accepted content',
        acceptedAt: activity.timestamp,
        approvalPercentage: 85, // Mock data - would come from API
        userName: activity.userName,
        userId: activity.userId,
        previousText: 'Previous version of this content...', // Mock data
      }));

      setAgreedVersions(agreedVersionsData);
    } catch (error) {
      console.error('Failed to fetch agreed versions:', error);
    } finally {
      setLoadingAgreed(false);
    }
  };

  const fetchDebatedProposals = async () => {
    setLoadingDebated(true);
    try {
      // Calculate debate scores for pending proposals
      const debatedData = pendingProposals.map(proposal => {
        const commentCount = commentsMap[proposal.id]?.length || 0;
        const totalVotes = proposal.votes.total;
        const proVotes = proposal.votes.pro;
        const contraVotes = proposal.votes.contra;
        const neutralVotes = proposal.votes.neutral;

        // Calculate controversy score (high when PRO + CONTRA are both significant)
        const controversyScore = totalVotes > 0 ?
          (proVotes / totalVotes) * (contraVotes / totalVotes) * 4 : 0; // Multiply by 4 to boost the score

        // Calculate age factor (older proposals get slightly higher scores)
        const ageInHours = (new Date().getTime() - new Date(proposal.createdAt).getTime()) / (1000 * 60 * 60);
        const ageFactor = Math.min(ageInHours / 24, 2); // Cap at 2x multiplier for proposals older than 24 hours

        // Combined debate score
        const debateScore = (commentCount * 2) + (controversyScore * 10) + ageFactor;

        return {
          ...proposal,
          debateScore,
          commentCount,
          controversyScore,
          engagement: {
            comments: commentCount,
            proPercentage: totalVotes > 0 ? (proVotes / totalVotes) * 100 : 0,
            contraPercentage: totalVotes > 0 ? (contraVotes / totalVotes) * 100 : 0,
            neutralPercentage: totalVotes > 0 ? (neutralVotes / totalVotes) * 100 : 0,
          }
        };
      });

      // Sort by debate score descending and take top 10
      const topDebated = debatedData
        .sort((a, b) => b.debateScore - a.debateScore)
        .slice(0, 10);

      setDebatedProposals(topDebated);
    } catch (error) {
      console.error('Failed to fetch debated proposals:', error);
    } finally {
      setLoadingDebated(false);
    }
  };

  const handleVote = async (proposalId: string, documentId: string, paragraphId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    setVotingProposalId(proposalId);
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
        toast.success(`Voted ${voteType.toLowerCase()}`);
        // Remove from pending list immediately for responsive UI
        setPendingProposals(prev => prev.filter(p => p.id !== proposalId));
        // Refresh both activities and pending proposals
        fetchAllActivities();
        fetchPendingProposals();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to cast vote');
      }
    } catch (error) {
      console.error('Failed to cast vote:', error);
      toast.error('Failed to cast vote');
    } finally {
      setVotingProposalId(null);
    }
  };

  const toggleContextView = async (proposalId: string, documentId: string, paragraphId: string) => {
    console.log('🔄 toggleContextView called:', { proposalId, documentId, paragraphId });

    const isCurrentlyShowing = showFullDocumentMap[proposalId] ?? false; // Default to false (show diff only)
    console.log('Current show state:', isCurrentlyShowing);

    if (isCurrentlyShowing) {
      // Hide context
      console.log('Hiding context view');
      setShowFullDocumentMap(prev => ({ ...prev, [proposalId]: false }));
    } else {
      // Show context - fetch full document if not already loaded
      if (!fullDocumentParagraphsMap[proposalId]) {
        console.log('Fetching full document...');
        setLoadingFullDocumentMap(prev => ({ ...prev, [proposalId]: true }));
        try {
          // Load the full document like the agreed view
          const response = await fetch(`/api/documents/${documentId}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            },
          });

          console.log('API response status:', response.status);

          if (response.ok) {
            const responseData = await response.json();
            const document = responseData?.document; // API returns { document: {...} }

            if (!document) {
              console.error('No document in response:', responseData);
              toast.error('Invalid document response');
              return;
            }

            if (!document.paragraphs || !Array.isArray(document.paragraphs)) {
              console.error('No paragraphs array in document:', document);
              toast.error('Invalid document structure');
              return;
            }

            console.log('Document received:', {
              id: document.id,
              title: document.title,
              paragraphCount: document.paragraphs?.length || 0,
              paragraphs: document.paragraphs?.map(p => ({
                id: p.id,
                order: p.order,
                title: p.title,
                text: p.text?.substring(0, 50) + '...',
                isDocumentTitle: p.isDocumentTitle
              }))
            });

            // Sort paragraphs by order
            const sortedParagraphs = [...document.paragraphs].sort((a, b) => a.order - b.order);
            console.log('Sorted paragraphs:', sortedParagraphs.length);

            // Store the full document with metadata indicating this is context view
            setFullDocumentParagraphsMap(prev => ({
              ...prev,
              [proposalId]: {
                paragraphs: sortedParagraphs,
                targetParagraphId: paragraphId,
                isContextView: true
              }
            }));

            console.log('Stored context data for proposal:', proposalId);
          } else {
            console.error('API response not ok:', response.status, response.statusText);
          }
        } catch (error) {
          console.error('Failed to fetch document:', error);
          toast.error('Failed to load context');
        } finally {
          setLoadingFullDocumentMap(prev => ({ ...prev, [proposalId]: false }));
        }
      } else {
        console.log('Using cached document data');
      }
      console.log('Showing context view');
      setShowFullDocumentMap(prev => ({ ...prev, [proposalId]: true }));
    }
  };

  const fetchComments = async (proposalId: string, documentId: string, paragraphId: string) => {
    setLoadingCommentsMap(prev => ({ ...prev, [proposalId]: true }));
    try {
      const response = await fetch(
        `/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}/comments`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setCommentsMap(prev => ({ ...prev, [proposalId]: data.comments || [] }));
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setLoadingCommentsMap(prev => ({ ...prev, [proposalId]: false }));
    }
  };

  const handleAddComment = async (proposalId: string, documentId: string, paragraphId: string, parentId?: string) => {
    const text = parentId ? replyTextMap[`${proposalId}-${parentId}`] : commentTextMap[proposalId];
    if (!text || !text.trim()) return;

    try {
      const response = await fetch(
        `/api/documents/${documentId}/paragraphs/${paragraphId}/proposals/${proposalId}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          },
          body: JSON.stringify({ text: text.trim(), parentId }),
        }
      );

      if (response.ok) {
        toast.success('Comment added');
        // Clear the text
        if (parentId) {
          setReplyTextMap(prev => ({ ...prev, [`${proposalId}-${parentId}`]: '' }));
          setReplyingToMap(prev => ({ ...prev, [proposalId]: null }));
        } else {
          setCommentTextMap(prev => ({ ...prev, [proposalId]: '' }));
        }
        // Refresh comments
        fetchComments(proposalId, documentId, paragraphId);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to add comment');
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
      toast.error('Failed to add comment');
    }
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

  const formatFullTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getActivityIcon = (type: ActivityItem['type'], voteType?: string) => {
    switch (type) {
      case 'proposal_created':
        return <FileEdit className="h-5 w-5 text-blue-600" />;
      case 'proposal_accepted':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'vote_cast':
        if (voteType === 'PRO') return <ThumbsUp className="h-5 w-5 text-green-600" />;
        if (voteType === 'CONTRA') return <ThumbsDown className="h-5 w-5 text-red-600" />;
        return <Minus className="h-5 w-5 text-gray-600" />;
      case 'comment_added':
        return <MessageSquare className="h-5 w-5 text-purple-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getActivityDescription = (activity: ActivityItem): { title: string; detail: string } => {
    switch (activity.type) {
      case 'proposal_created':
        return {
          title: 'suggested a change',
          detail: activity.paragraphTitle 
            ? `to "${activity.paragraphTitle}"`
            : 'to paragraph',
        };
      case 'proposal_accepted':
        return {
          title: 'proposal was accepted',
          detail: activity.paragraphTitle 
            ? `in "${activity.paragraphTitle}"`
            : 'for paragraph',
        };
      case 'vote_cast':
        const voteText = activity.voteType === 'PRO' 
          ? 'approved' 
          : activity.voteType === 'CONTRA' 
          ? 'rejected' 
          : 'voted neutral on';
        return {
          title: `${voteText} a proposal`,
          detail: activity.paragraphTitle 
            ? `in "${activity.paragraphTitle}"`
            : '',
        };
      case 'comment_added':
        return {
          title: 'commented',
          detail: activity.commentText || '',
        };
      default:
        return { title: 'activity', detail: '' };
    }
  };

  const getActivityTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      'proposal_created': 'Proposals',
      'proposal_accepted': 'Acceptances',
      'vote_cast': 'Votes',
      'comment_added': 'Comments',
    };
    return labels[type] || type;
  };

  // Filter activities
  const filteredActivities = allActivities.filter(activity => {
    if (filterType !== 'all' && activity.type !== filterType) {
      return false;
    }
    if (filterDocument !== 'all' && activity.documentId !== filterDocument) {
      return false;
    }
    return true;
  });

  // Group activities by date
  const groupedActivities = filteredActivities.reduce((groups, activity) => {
    const date = new Date(activity.timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let groupKey: string;
    if (date.toDateString() === today.toDateString()) {
      groupKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = 'Yesterday';
    } else {
      groupKey = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(activity);
    return groups;
  }, {} as Record<string, typeof filteredActivities>);

  const activityStats = {
    total: allActivities.length,
    proposals: allActivities.filter(a => a.type === 'proposal_created').length,
    votes: allActivities.filter(a => a.type === 'vote_cast').length,
    comments: allActivities.filter(a => a.type === 'comment_added').length,
    acceptances: allActivities.filter(a => a.type === 'proposal_accepted').length,
  };

  if (loading && allActivities.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading activities...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Navigation Buttons */}
        <div className="flex gap-3 mb-6">
          <Button
            variant={activePanel === 'agreed' ? 'default' : 'outline'}
            className="flex-1 gap-2"
            onClick={() => {
              setActivePanel('agreed');
              updateLastViewedTimestamp('agreed');
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            New Agreed Versions
            {agreedVersions.length > 0 && (
              <Badge className="ml-2 bg-green-600 text-xs">
                {agreedVersions.length}
              </Badge>
            )}
          </Button>

          <Button
            variant={activePanel === 'pending' ? 'default' : 'outline'}
            className="flex-1 gap-2"
            onClick={() => {
              setActivePanel('pending');
              updateLastViewedTimestamp('pending');
            }}
          >
            <AlertCircle className="h-4 w-4" />
            Pending Votes
            {(filteredAndSortedPendingProposals || []).length > 0 && (
              <Badge className="ml-2 bg-orange-600 text-xs">
                {(filteredAndSortedPendingProposals || []).length}
              </Badge>
            )}
          </Button>

          <Button
            variant={activePanel === 'debated' ? 'default' : 'outline'}
            className="flex-1 gap-2"
            onClick={() => {
              setActivePanel('debated');
              updateLastViewedTimestamp('debated');
            }}
          >
            <TrendingUp className="h-4 w-4" />
            Most Debated
            {debatedProposals.length > 0 && (
              <Badge className="ml-2 bg-purple-600 text-xs">
                {debatedProposals.length}
              </Badge>
            )}
          </Button>
        </div>

        {/* Panel Content */}
        {activePanel === 'pending' && (
          <>
            {/* Pending Your Vote Section */}
            {(filteredAndSortedPendingProposals || []).length > 0 && (
          <Card className="mb-6 border-orange-200 bg-white shadow-lg">
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-4 border-b border-orange-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-full">
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-orange-900">
                      Pending Your Vote
                    </h2>
                    <p className="text-sm text-orange-700">
                      Review proposals and vote quickly below
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchPendingProposals()}
                    disabled={loadingPending}
                    className="h-7 px-2 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${loadingPending ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <Badge className="bg-orange-600 hover:bg-orange-700 text-white">
                    {(filteredAndSortedPendingProposals || []).length} {(filteredAndSortedPendingProposals || []).length === 1 ? 'proposal' : 'proposals'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Filters and Sorting */}
            <div className="px-4 py-3 border-b border-orange-200 bg-orange-25">
              <div className="flex flex-wrap gap-3 items-center justify-between">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-medium text-orange-900">Filter:</span>
                  </div>

                  <Select value={pendingFilterDocument} onValueChange={setPendingFilterDocument}>
                    <SelectTrigger className="w-[180px] h-8 text-sm">
                      <SelectValue placeholder="All Documents" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Documents</SelectItem>
                      {(documents || []).map((doc) => (
                        <SelectItem key={doc.id} value={doc.id}>
                          {doc.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={pendingFilterType} onValueChange={setPendingFilterType}>
                    <SelectTrigger className="w-[120px] h-8 text-sm">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="BODY">Content</SelectItem>
                      <SelectItem value="TITLE">Headings</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-medium text-orange-900">Sort:</span>
                  <Select value={pendingSortBy} onValueChange={setPendingSortBy}>
                    <SelectTrigger className="w-[140px] h-8 text-sm">
                      <SelectValue placeholder="Newest" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                      <SelectItem value="approval_high">High Approval</SelectItem>
                      <SelectItem value="approval_low">Low Approval</SelectItem>
                      <SelectItem value="document">Document Name</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <ScrollArea className="h-[600px]">
              <div className="p-4 space-y-3">
                {filteredAndSortedPendingProposals.map((proposal) => {
                  const totalUsers = proposal.totalUsers;
                  const approvalPercentage = totalUsers > 0 ? (proposal.votes.pro / totalUsers) * 100 : 0;

                  const showFullDoc = showFullDocumentMap[proposal.id];
                  const contextData = fullDocumentParagraphsMap[proposal.id];
                  const fullDocParagraphs = contextData?.paragraphs || [];
                  const isLoadingFullDoc = loadingFullDocumentMap[proposal.id];

                  return (
                    <Card key={proposal.id} className="overflow-hidden hover:shadow-md transition-shadow border-orange-100">
                      {/* Vote Progress Bar at top */}
                      <VoteProgressBar
                        totalUsers={totalUsers}
                        proVotes={proposal.votes.pro}
                        neutralVotes={proposal.votes.neutral}
                        contraVotes={proposal.votes.contra}
                        className="rounded-none border-b"
                      />
                      
                      {/* Header with user info - full width */}
                      <div className="p-4 border-b border-gray-200">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-9 w-9 flex-shrink-0 ring-2 ring-orange-100">
                            <AvatarImage src={proposal.user.avatar} />
                            <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                              {proposal.user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-900">
                                {proposal.user.name}
                              </span>
                              <Badge 
                                variant={proposal.type === 'TITLE' ? 'default' : 'outline'}
                                className="text-xs"
                              >
                                {proposal.type === 'TITLE' ? '📝 Title' : '📄 Body'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
                              <Badge
                                variant="secondary"
                                className="text-xs font-normal cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors"
                                onClick={() => onNavigateToDocument(proposal.documentId)}
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                {proposal.documentTitle}
                              </Badge>
                              {proposal.paragraphTitle && (
                                <>
                                  <span className="text-gray-400">•</span>
                                  <span className="font-medium">{proposal.paragraphTitle}</span>
                                </>
                              )}
                              <span className="text-gray-400">•</span>
                              <span className="text-gray-500">{formatTimestamp(proposal.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Two-column layout */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
                        {/* LEFT COLUMN: Document Content / Diff */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700">Proposed Change</h3>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleContextView(proposal.id, proposal.documentId, proposal.paragraphId)}
                              className="gap-2 text-xs"
                              disabled={isLoadingFullDoc}
                            >
                              <FileText className="h-3 w-3" />
                              {isLoadingFullDoc ? 'Loading...' : showFullDoc ? 'Show Diff Only' : 'Show Context'}
                            </Button>
                          </div>

                          {/* Content Area */}
                          {!showFullDoc ? (
                            // Show just the diff
                            <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                              <div className="p-3">
                                {proposal.currentText ? (
                                  <DiffViewer
                                    originalText={proposal.currentText}
                                    suggestion1Text={proposal.proposedText}
                                    suggestion1Author={proposal.user.name}
                                  />
                                ) : (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Badge className="bg-green-500 hover:bg-green-600">
                                        New {proposal.type === 'TITLE' ? 'Title' : 'Content'}
                                      </Badge>
                                    </div>
                                    <div className="p-4 bg-background rounded-md border">
                                      <span className="bg-green-200 dark:bg-green-900/50 text-foreground px-0.5 rounded">
                                        {proposal.proposedText}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            // Show contextual view with scroll
                            <ScrollArea className="h-[300px] border border-gray-200 rounded-lg bg-white">
                              <div className="p-4 space-y-4">
                                {contextData?.isContextView && (
                                  <div className="text-xs text-muted-foreground mb-2 text-center">
                                    Showing full agreed document with proposed change highlighted
                                  </div>
                                )}
                                {fullDocParagraphs.map((para: any) => {
                                  try {
                                    const isChangedParagraph = para.id === proposal.paragraphId;
                                    const acceptedContent = getAcceptedContent(para);

                                  console.log('🎨 Rendering paragraph:', {
                                    id: para.id,
                                    targetParagraphId: proposal.paragraphId,
                                    isChanged: isChangedParagraph,
                                    acceptedContent: acceptedContent?.substring(0, 50) + '...',
                                    title: para.title,
                                    text: para.text?.substring(0, 50) + '...',
                                    isDocumentTitle: para.isDocumentTitle,
                                    hasContent: contextData?.isContextView ?
                                      (para.title || para.text) && (para.title || para.text).trim() !== '' :
                                      acceptedContent && acceptedContent.trim() !== ''
                                  });

                                  // Use contextual functions for contextual data
                                  const hasChanges = contextData?.isContextView ?
                                    hasAcceptedChangesContext(para) : hasAcceptedChanges(para);
                                  const highestApprovedChange = contextData?.isContextView ?
                                    getHighestApprovedChangeInfoContext(para) : getHighestApprovedChangeInfo(para);


                                  // Skip document title as it's shown in the main header
                                  if (para.isDocumentTitle) {
                                    console.log('⏭️ Skipping document title');
                                    return null;
                                  }

                                  // For context view, show all paragraphs with content OR the changed paragraph (to show diff)
                                  // For non-context view, only show paragraphs with accepted changes
                                  const hasContent = contextData?.isContextView ?
                                    (para.title || para.text) && (para.title || para.text).trim() !== '' :
                                    acceptedContent && acceptedContent.trim() !== '';

                                  const shouldShow = hasContent || isChangedParagraph; // Always show changed paragraph for diff

                                  if (!shouldShow) {
                                    console.log('⏭️ Skipping paragraph - no content and not changed paragraph');
                                    return null;
                                  }

                                  console.log('✅ Rendering paragraph:', para.id, isChangedParagraph ? '(CHANGED)' : '(NORMAL)');

                                  return (
                                    <div
                                      key={para.id}
                                      className={cn(
                                        "p-3 rounded",
                                        isChangedParagraph && "bg-amber-50 border-2 border-amber-300"
                                      )}
                                    >
                                      {para.title && para.title.trim() ? (
                                        // Heading paragraph
                                        <div className="flex items-start gap-3">
                                          <h4 className="font-semibold text-gray-900 mb-2 flex-1">{acceptedContent}</h4>
                                          {hasChanges && highestApprovedChange && !isChangedParagraph && (
                                            <div className="flex flex-col items-end text-xs text-green-600 gap-1 shrink-0">
                                              <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
                                                <CheckCircle2 className="h-3 w-3" />
                                                <span className="font-medium">Accepted</span>
                                              </div>
                                              <span className="text-gray-500">
                                                {highestApprovedChange.approval_percentage.toFixed(0)}% approval
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      ) : isChangedParagraph ? (
                                        // Show inline diff for the proposed paragraph
                                        <div className="space-y-2">
                                          <div className="text-xs text-amber-700 font-medium mb-2">Proposed Change:</div>
                                          {console.log('🔄 Rendering inline diff for changed paragraph:', {
                                            acceptedContent: acceptedContent?.substring(0, 100) + '...',
                                            proposedText: proposal.proposedText?.substring(0, 100) + '...',
                                            proposalId: proposal.id
                                          })}
                                          <div className="flex gap-4">
                                            <p className="flex-1 leading-relaxed text-gray-700 dark:text-gray-300 text-justify indent-8 first-line:font-medium">
                                              <InlineDiffText
                                                originalText={acceptedContent && acceptedContent.trim() !== '...' ? acceptedContent : ''}
                                                modifiedText={proposal.proposedText || ''}
                                              />
                                            </p>
                                            <Badge className="mt-2 bg-amber-500 h-fit">Proposed Change</Badge>
                                          </div>
                                        </div>
                                      ) : (
                                        // Show accepted content for other paragraphs
                                        <div className="flex gap-4">
                                          <p className="flex-1 leading-relaxed text-gray-700 text-justify indent-8 first-line:font-medium">
                                            {acceptedContent}
                                          </p>
                                          {hasChanges && highestApprovedChange && (
                                            <div className="flex flex-col items-end text-xs text-green-600 gap-1 shrink-0">
                                              <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
                                                <CheckCircle2 className="h-3 w-3" />
                                                <span className="font-medium">Accepted</span>
                                              </div>
                                              <span className="text-gray-500">
                                                {highestApprovedChange.approval_percentage.toFixed(0)}% approval
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                  } catch (error) {
                                    console.error('Error rendering paragraph:', para.id, error);
                                    return (
                                      <div key={para.id} className="p-3 rounded bg-red-50 border border-red-200">
                                        <p className="text-red-600 text-sm">Error rendering paragraph {para.id}</p>
                                      </div>
                                    );
                                  }
                                })}
                              </div>
                            </ScrollArea>
                          )}
                        </div>

                        {/* RIGHT COLUMN: Discussion */}
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Discussion
                          </h3>
                          
                          <ScrollArea className="h-[500px] border border-gray-200 rounded-lg bg-white">
                            <div className="p-4 space-y-4">
                              {loadingCommentsMap[proposal.id] ? (
                                <div className="text-center py-8">
                                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                                  <p className="text-sm text-gray-500 mt-2">Loading comments...</p>
                                </div>
                              ) : (
                                <>
                                  {/* Comments List */}
                                  {(!commentsMap[proposal.id] || commentsMap[proposal.id].length === 0) ? (
                                    <p className="text-sm text-gray-500 text-center py-8 italic">
                                      No comments yet. Be the first to share your thoughts!
                                    </p>
                                  ) : (
                                    <div className="space-y-3">
                                      {commentsMap[proposal.id]
                                        .filter((comment: any) => !comment.parentId)
                                        .map((comment: any) => {
                                          const replies = commentsMap[proposal.id].filter((c: any) => c.parentId === comment.id);
                                          const isReplying = replyingToMap[proposal.id] === comment.id;
                                          
                                          return (
                                            <div key={comment.id} className="space-y-2">
                                              {/* Top-level Comment */}
                                              <div className="flex gap-3 p-3 rounded-lg bg-muted/30">
                                                <Avatar className="h-8 w-8 flex-shrink-0">
                                                  <AvatarImage src={comment.user?.avatar} />
                                                  <AvatarFallback className="bg-primary/10 text-xs">
                                                    {comment.user?.name.split(' ').map((n: string) => n[0]).join('')}
                                                  </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 space-y-2 min-w-0">
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-foreground">{comment.user?.name}</span>
                                                    <span className="text-xs text-muted-foreground">• {formatTimestamp(comment.createdAt)}</span>
                                                  </div>
                                                  <p className="text-sm text-foreground leading-relaxed break-words">{comment.text}</p>
                                                  <button
                                                    onClick={() => setReplyingToMap(prev => ({ ...prev, [proposal.id]: comment.id }))}
                                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                  >
                                                    Reply
                                                  </button>
                                                </div>
                                              </div>

                                              {/* Replies */}
                                              {replies.length > 0 && (
                                                <div className="ml-12 space-y-2 pl-6 border-l-2 border-border/50">
                                                  {replies.map((reply: any) => (
                                                    <div key={reply.id} className="flex gap-3 p-2 rounded bg-background">
                                                      <Avatar className="h-6 w-6 flex-shrink-0">
                                                        <AvatarImage src={reply.user?.avatar} />
                                                        <AvatarFallback className="bg-primary/10 text-xs">
                                                          {reply.user?.name.split(' ').map((n: string) => n[0]).join('')}
                                                        </AvatarFallback>
                                                      </Avatar>
                                                      <div className="flex-1 space-y-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                          <span className="text-sm font-medium text-foreground">{reply.user?.name}</span>
                                                          <span className="text-xs text-muted-foreground">• {formatTimestamp(reply.createdAt)}</span>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground leading-relaxed break-words">{reply.text}</p>
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}

                                              {/* Reply Form */}
                                              {isReplying && (
                                                <div className="ml-12 pl-6 border-l-2 border-border/50 space-y-2">
                                                  <Textarea
                                                    placeholder={`Reply to ${comment.user?.name}...`}
                                                    value={replyTextMap[`${proposal.id}-${comment.id}`] || ''}
                                                    onChange={(e) => setReplyTextMap(prev => ({ 
                                                      ...prev, 
                                                      [`${proposal.id}-${comment.id}`]: e.target.value 
                                                    }))}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                                        e.preventDefault();
                                                        handleAddComment(proposal.id, proposal.documentId, proposal.paragraphId, comment.id);
                                                      }
                                                      if (e.key === 'Escape') {
                                                        setReplyingToMap(prev => ({ ...prev, [proposal.id]: null }));
                                                        setReplyTextMap(prev => ({ ...prev, [`${proposal.id}-${comment.id}`]: '' }));
                                                      }
                                                    }}
                                                    className="min-h-[60px] text-sm"
                                                    autoFocus
                                                  />
                                                  <div className="flex gap-2 justify-end">
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => {
                                                        setReplyingToMap(prev => ({ ...prev, [proposal.id]: null }));
                                                        setReplyTextMap(prev => ({ ...prev, [`${proposal.id}-${comment.id}`]: '' }));
                                                      }}
                                                      className="text-xs"
                                                    >
                                                      Cancel
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      onClick={() => handleAddComment(proposal.id, proposal.documentId, proposal.paragraphId, comment.id)}
                                                      disabled={!replyTextMap[`${proposal.id}-${comment.id}`]?.trim()}
                                                      className="text-xs"
                                                    >
                                                      Send
                                                    </Button>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                    </div>
                                  )}

                                  {/* New Comment Form */}
                                  <div className="space-y-2 pt-4 border-t">
                                    <Textarea
                                      placeholder="Write a comment..."
                                      value={commentTextMap[proposal.id] || ''}
                                      onChange={(e) => setCommentTextMap(prev => ({ ...prev, [proposal.id]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                          e.preventDefault();
                                          handleAddComment(proposal.id, proposal.documentId, proposal.paragraphId);
                                        }
                                      }}
                                      className="min-h-[60px] text-sm"
                                    />
                                    <div className="flex justify-between items-center">
                                      <p className="text-xs text-muted-foreground">
                                        Tip: Press Cmd/Ctrl+Enter to post
                                      </p>
                                      <Button
                                        size="sm"
                                        onClick={() => handleAddComment(proposal.id, proposal.documentId, proposal.paragraphId)}
                                        disabled={!commentTextMap[proposal.id]?.trim()}
                                        className="text-xs"
                                      >
                                        Post Comment
                                      </Button>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>

                      {/* Voting Status & Buttons - full width at bottom */}
                      <div className="border-t border-gray-200 p-4 bg-gray-50">
                        {approvalPercentage >= 60 && (
                          <div className="flex justify-end mb-3">
                            <Badge className="bg-green-100 text-green-700 border-green-200">
                              {Math.round(approvalPercentage)}% approval
                            </Badge>
                          </div>
                        )}

                        <div className="flex gap-2 flex-wrap justify-center">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white gap-1.5 flex-1 sm:flex-none"
                            onClick={() => handleVote(proposal.id, proposal.documentId, proposal.paragraphId, 'PRO')}
                            disabled={votingProposalId === proposal.id}
                          >
                            <ThumbsUp className="h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 flex-1 sm:flex-none border-gray-300 hover:bg-gray-50"
                            onClick={() => handleVote(proposal.id, proposal.documentId, proposal.paragraphId, 'NEUTRAL')}
                            disabled={votingProposalId === proposal.id}
                          >
                            <Minus className="h-4 w-4" />
                            Neutral
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1.5 flex-1 sm:flex-none"
                            onClick={() => handleVote(proposal.id, proposal.documentId, proposal.paragraphId, 'CONTRA')}
                            disabled={votingProposalId === proposal.id}
                          >
                            <ThumbsDown className="h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>
        )}

        {/* Stats Cards - Only show for pending panel */}
        {activePanel === 'pending' && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card className="p-4">
              <div className="text-2xl font-bold text-gray-900">{activityStats.total}</div>
              <div className="text-sm text-gray-600">Total Activities</div>
            </Card>
            <Card className="p-4">
              <div className="text-2xl font-bold text-blue-600">{activityStats.proposals}</div>
              <div className="text-sm text-gray-600">Proposals</div>
            </Card>
            <Card className="p-4">
              <div className="text-2xl font-bold text-purple-600">{activityStats.votes}</div>
              <div className="text-sm text-gray-600">Votes</div>
            </Card>
            <Card className="p-4">
              <div className="text-2xl font-bold text-orange-600">{activityStats.comments}</div>
              <div className="text-sm text-gray-600">Comments</div>
            </Card>
            <Card className="p-4">
              <div className="text-2xl font-bold text-green-600">{activityStats.acceptances}</div>
              <div className="text-sm text-gray-600">Accepted</div>
            </Card>
          </div>
        )}

        {/* Filters and Activities - Only show for pending panel */}
        {activePanel === 'pending' && (
          <>
            {/* Filters */}
            <Card className="p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Filters:</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Activity Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="proposal_created">Proposals</SelectItem>
                      <SelectItem value="vote_cast">Votes</SelectItem>
                      <SelectItem value="comment_added">Comments</SelectItem>
                      <SelectItem value="proposal_accepted">Acceptances</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterDocument} onValueChange={setFilterDocument}>
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <SelectValue placeholder="Document" />
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

                  {(filterType !== 'all' || filterDocument !== 'all') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFilterType('all');
                        setFilterDocument('all');
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 text-sm text-gray-600">
                <Clock className="h-3 w-3" />
                <span>
                  Showing {filteredActivities.length} of {allActivities.length} activities
                </span>
                <span className="text-gray-400">•</span>
                <span>Last updated {formatTimestamp(lastRefresh.toISOString())}</span>
              </div>
            </Card>

            {/* Activities List */}
            {filteredActivities.length === 0 ? (
              <Card className="p-12">
                <div className="text-center text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium mb-2">No activities found</p>
                  <p className="text-sm">
                    {filterType !== 'all' || filterDocument !== 'all'
                      ? 'Try adjusting your filters'
                      : 'Start collaborating to see activities here'}
                  </p>
                </div>
              </Card>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedActivities).map(([dateGroup, activities]) => (
                  <div key={dateGroup}>
                    <div className="flex items-center gap-3 mb-4">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <h2 className="text-lg font-semibold text-gray-900">{dateGroup}</h2>
                      <div className="flex-1 h-px bg-gray-200"></div>
                    </div>

                    <div className="space-y-3">
                      {activities.map((activity) => {
                        const { title, detail } = getActivityDescription(activity);
                        const isCurrentUser = activity.userId === currentUser.id;

                        return (
                          <Card
                            key={activity.id}
                            className={cn(
                              "p-4 hover:shadow-md transition-shadow",
                              isCurrentUser && "bg-blue-50/50 border-blue-200"
                            )}
                          >
                            <div className="flex gap-4">
                              <div className="flex-shrink-0">
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={activity.userAvatar} />
                                  <AvatarFallback className="text-sm bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                    {activity.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1">
                                    <p className="text-sm">
                                      <span className="font-semibold text-gray-900">
                                        {isCurrentUser ? 'You' : activity.userName}
                                      </span>
                                      {' '}
                                      <span className="text-gray-600">{title}</span>
                                    </p>
                                    {detail && (
                                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                        {detail}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-3 mt-2">
                                      <Badge variant="secondary" className="text-xs">
                                        {activity.documentTitle}
                                      </Badge>
                                      <span className="text-xs text-gray-400">
                                        {formatFullTimestamp(activity.timestamp)}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex-shrink-0">
                                    {getActivityIcon(activity.type, activity.voteType)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* New Agreed Versions Panel */}
        {activePanel === 'agreed' && (
          <>
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
                  <p className="text-lg font-medium mb-2">No New Agreed Versions</p>
                  <p className="text-sm">
                    Recently accepted proposals will appear here, showing what changed in your documents.
                  </p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {agreedVersions.map((version) => (
                  <Card key={version.id} className="overflow-hidden border-green-200 hover:shadow-md transition-shadow">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 border-b border-green-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-100 rounded-full">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-green-900">
                              Proposal Accepted
                            </h3>
                            <p className="text-sm text-green-700">
                              {version.approvalPercentage}% approval • {formatTimestamp(version.acceptedAt)}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-green-600 hover:bg-green-700 text-white">
                          {version.approvalPercentage}% Approved
                        </Badge>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-4 space-y-4">
                      {/* Document and User Info */}
                      <div className="flex items-center justify-between text-sm text-gray-600">
                        <div className="flex items-center gap-4">
                          <Badge
                            variant="secondary"
                            className="cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors"
                            onClick={() => onNavigateToDocument(version.documentId)}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            {version.documentTitle}
                          </Badge>
                          {version.paragraphTitle && (
                            <>
                              <span className="text-gray-400">•</span>
                              <span className="font-medium">{version.paragraphTitle}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span>by</span>
                          <span className="font-medium">{version.userName}</span>
                        </div>
                      </div>

                      {/* Diff Display */}
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                          <h4 className="text-sm font-medium text-gray-700">What Changed</h4>
                        </div>
                        <div className="p-4 bg-white">
                          <div className="space-y-3">
                            {/* Previous Version */}
                            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded">
                              <div className="flex-shrink-0 mt-0.5">
                                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                              </div>
                              <div className="flex-1">
                                <div className="text-xs text-red-600 font-medium mb-1">Previous Version</div>
                                <p className="text-sm text-gray-700 line-through">{version.previousText}</p>
                              </div>
                            </div>

                            {/* New Version */}
                            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded">
                              <div className="flex-shrink-0 mt-0.5">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              </div>
                              <div className="flex-1">
                                <div className="text-xs text-green-600 font-medium mb-1">New Accepted Version</div>
                                <p className="text-sm text-gray-900">{version.acceptedText}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onNavigateToDocument(version.documentId)}
                          className="gap-2"
                        >
                          <FileText className="h-4 w-4" />
                          View in Document
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Most Debated Panel */}
        {activePanel === 'debated' && (
          <>
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
                {debatedProposals.map((proposal, index) => {
                  const totalUsers = proposal.totalUsers;
                  const approvalPercentage = totalUsers > 0 ? (proposal.votes.pro / totalUsers) * 100 : 0;
                  const isControversial = proposal.engagement.proPercentage > 30 && proposal.engagement.contraPercentage > 30;

                  return (
                    <Card key={proposal.id} className="overflow-hidden hover:shadow-md transition-shadow border-purple-200">
                      {/* Header with ranking */}
                      <div className="bg-gradient-to-r from-purple-50 to-violet-50 p-4 border-b border-purple-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                                <span className="text-sm font-bold text-purple-700">#{index + 1}</span>
                              </div>
                              <div className="p-2 bg-purple-100 rounded-full">
                                <TrendingUp className="h-5 w-5 text-purple-600" />
                              </div>
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-purple-900">
                                Most Debated Proposal
                              </h3>
                              <p className="text-sm text-purple-700">
                                High engagement • {proposal.engagement.comments} comments
                                {isControversial && " • Controversial"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isControversial && (
                              <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                                ⚖️ Controversial
                              </Badge>
                            )}
                            <Badge className="bg-purple-100 text-purple-700">
                              💬 {proposal.engagement.comments} comments
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Vote Progress Bar */}
                      <VoteProgressBar
                        totalUsers={totalUsers}
                        proVotes={proposal.votes.pro}
                        neutralVotes={proposal.votes.neutral}
                        contraVotes={proposal.votes.contra}
                        className="rounded-none border-b"
                      />

                      {/* Content */}
                      <div className="p-4 space-y-4">
                        {/* User and Document Info */}
                        <div className="flex items-start gap-3">
                          <Avatar className="h-9 w-9 flex-shrink-0 ring-2 ring-purple-100">
                            <AvatarImage src={proposal.user.avatar} />
                            <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                              {proposal.user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-900">
                                {proposal.user.name}
                              </span>
                              <Badge
                                variant={proposal.type === 'TITLE' ? 'default' : 'outline'}
                                className="text-xs"
                              >
                                {proposal.type === 'TITLE' ? '📝 Title' : '📄 Body'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
                              <Badge
                                variant="secondary"
                                className="text-xs font-normal cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors"
                                onClick={() => onNavigateToDocument(proposal.documentId)}
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                {proposal.documentTitle}
                              </Badge>
                              {proposal.paragraphTitle && (
                                <>
                                  <span className="text-gray-400">•</span>
                                  <span className="font-medium">{proposal.paragraphTitle}</span>
                                </>
                              )}
                              <span className="text-gray-400">•</span>
                              <span className="text-gray-500">{formatTimestamp(proposal.createdAt)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Proposed Content */}
                        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Proposed Change</h4>
                          <div className="space-y-2">
                            {proposal.currentText && (
                              <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded">
                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                                <div className="flex-1">
                                  <div className="text-xs text-red-600 mb-1">Current</div>
                                  <p className="text-sm text-gray-700 line-through">{proposal.currentText}</p>
                                </div>
                              </div>
                            )}
                            <div className="flex items-start gap-2 p-2 bg-purple-50 border border-purple-200 rounded">
                              <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
                              <div className="flex-1">
                                <div className="text-xs text-purple-600 mb-1">Proposed</div>
                                <p className="text-sm text-gray-900">{proposal.proposedText}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Engagement Stats */}
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                            <div className="text-lg font-bold text-green-700">{Math.round(proposal.engagement.proPercentage)}%</div>
                            <div className="text-xs text-green-600">Support</div>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="text-lg font-bold text-gray-700">{Math.round(proposal.engagement.neutralPercentage)}%</div>
                            <div className="text-xs text-gray-600">Neutral</div>
                          </div>
                          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="text-lg font-bold text-red-700">{Math.round(proposal.engagement.contraPercentage)}%</div>
                            <div className="text-xs text-red-600">Oppose</div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 flex-wrap justify-center">
                          <Button
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                            onClick={() => onNavigateToDocument(proposal.documentId)}
                          >
                            <MessageSquare className="h-4 w-4" />
                            Join Discussion
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-purple-300 hover:bg-purple-50"
                            onClick={() => handleVote(proposal.id, proposal.documentId, proposal.paragraphId, 'PRO')}
                            disabled={votingProposalId === proposal.id}
                          >
                            <ThumbsUp className="h-4 w-4" />
                            Vote
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        </div>
      </div>
    );
  }
}