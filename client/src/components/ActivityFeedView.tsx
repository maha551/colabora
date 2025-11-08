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
import { toast } from "sonner";
import { DiffViewer } from "./DiffViewer";
import { VoteProgressBar } from "./VoteProgressBar";
import { InlineExpandedView } from "./InlineExpandedView";

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
  const [activePanel, setActivePanel] = useState<'agreed' | 'pending' | 'debated'>('pending');
  const [agreedVersions, setAgreedVersions] = useState<any[]>([]);
  const [loadingAgreed, setLoadingAgreed] = useState(false);
  const [debatedProposals, setDebatedProposals] = useState<any[]>([]);
  const [loadingDebated, setLoadingDebated] = useState(false);
  const [pendingProposals, setPendingProposals] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [lastViewedTimestamps, setLastViewedTimestamps] = useState<Record<string, string>>({});
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());


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
        setAgreedVersions(data.versions || []);
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

  // Simple placeholder for voting - redirects to document
  const handleVote = async (proposalId: string, documentId: string, paragraphId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    // For now, just navigate to the document for voting
    onNavigateToDocument(documentId);
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

  // Load data when panels are activated
  useEffect(() => {
    if (activePanel === 'agreed' && agreedVersions.length === 0) {
      fetchAgreedVersions();
    }
  }, [activePanel]);

  useEffect(() => {
    if (activePanel === 'debated' && debatedProposals.length === 0) {
      fetchDebatedProposals();
    }
  }, [activePanel]);

  useEffect(() => {
    if (activePanel === 'pending' && pendingProposals.length === 0) {
      fetchPendingProposals();
    }
  }, [activePanel]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Activity Feed</h1>
          <Button
            onClick={() => {
              if (activePanel === 'pending') fetchPendingProposals();
              if (activePanel === 'agreed') fetchAgreedVersions();
              if (activePanel === 'debated') fetchDebatedProposals();
            }}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${(loadingPending || loadingAgreed || loadingDebated) ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-3 mb-6">
          <Button
            variant={activePanel === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActivePanel('pending')}
            className="gap-2"
          >
            <Clock className="h-4 w-4" />
            Pending Proposals
            {pendingProposals.length > 0 && (
              <Badge className="ml-2 bg-blue-600 text-xs">
                {pendingProposals.length}
              </Badge>
            )}
          </Button>
          <Button
            variant={activePanel === 'agreed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActivePanel('agreed')}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Agreed Changes
            {agreedVersions.length > 0 && (
              <Badge className="ml-2 bg-green-600 text-xs">
                {agreedVersions.length}
              </Badge>
            )}
          </Button>
          <Button
            variant={activePanel === 'debated' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActivePanel('debated')}
            className="gap-2"
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

        {/* Content */}
        {activePanel === 'pending' && (
          <>
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
                {pendingProposals.map((proposal) => {
                  const proCount = proposal.votes.pro;
                  const neutralCount = proposal.votes.neutral;
                  const contraCount = proposal.votes.contra;
                  const totalVotes = proposal.votes.total;
                  const notVotedCount = Math.max(proposal.totalUsers - totalVotes, 0);

                  const proPercentage = proposal.totalUsers > 0 ? (proCount / proposal.totalUsers) * 100 : 0;
                  const neutralPercentage = proposal.totalUsers > 0 ? (neutralCount / proposal.totalUsers) * 100 : 0;
                  const contraPercentage = proposal.totalUsers > 0 ? (contraCount / proposal.totalUsers) * 100 : 0;
                  const notVotedPercentage = proposal.totalUsers > 0 ? (notVotedCount / proposal.totalUsers) * 100 : 0;

                  return (
                    <Card key={proposal.id} className="overflow-hidden hover:shadow-md transition-shadow border-blue-200">
                      {/* Vote Status Bar at the very top */}
                      <div
                        className="flex h-3 w-full overflow-hidden cursor-pointer border-b"
                        style={{ backgroundColor: '#e5e7eb', minHeight: '12px' }}
                        title={`Click to view details - ${totalVotes} votes out of ${proposal.totalUsers} participants`}
                      >
                        {/* Not voted first (gray) */}
                        {notVotedPercentage > 0 && (
                          <div
                            className="transition-all duration-300"
                            style={{
                              width: `${notVotedPercentage}%`,
                              backgroundColor: '#9ca3af',
                              flex: `0 0 ${notVotedPercentage}%`
                            }}
                            title={`Not voted: ${notVotedCount}`}
                          />
                        )}
                        {/* Reject votes */}
                        {contraPercentage > 0 && (
                          <div
                            className="transition-all duration-300"
                            style={{
                              width: `${contraPercentage}%`,
                              backgroundColor: '#ef4444',
                              flex: `0 0 ${contraPercentage}%`
                            }}
                            title={`Reject: ${contraCount}`}
                          />
                        )}
                        {/* Neutral votes */}
                        {neutralPercentage > 0 && (
                          <div
                            className="transition-all duration-300"
                            style={{
                              width: `${neutralPercentage}%`,
                              backgroundColor: '#3b82f6',
                              flex: `0 0 ${neutralPercentage}%`
                            }}
                            title={`Neutral: ${neutralCount}`}
                          />
                        )}
                        {/* Approve votes */}
                        {proPercentage > 0 && (
                          <div
                            className="transition-all duration-300"
                            style={{
                              width: `${proPercentage}%`,
                              backgroundColor: '#22c55e',
                              flex: `0 0 ${proPercentage}%`
                            }}
                            title={`Approve: ${proCount}`}
                          />
                        )}
                      </div>

                      <div className="p-4 space-y-4">
                        {/* Compact Header with inline vote buttons */}
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <Avatar className="h-8 w-8 flex-shrink-0">
                              <AvatarImage src={proposal.user.avatar} />
                              <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                {proposal.user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-sm font-normal text-muted-foreground">{proposal.user.name}</span>
                                {proposal.type === 'TITLE' && (
                                  <Badge variant="outline" className="text-xs">
                                    Heading
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-gray-900 font-normal line-clamp-2">
                                "{proposal.proposedText}"
                              </p>
                              <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600 mt-1">
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

                          {/* Inline Vote Buttons - Icon Only */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleVote(proposal.id, proposal.documentId, proposal.paragraphId, 'PRO')}
                              className="h-8 w-8 p-0"
                              title={`Approve (${proCount})`}
                            >
                              <ThumbsUp className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleVote(proposal.id, proposal.documentId, proposal.paragraphId, 'NEUTRAL')}
                              className="h-8 w-8 p-0"
                              title={`Neutral (${neutralCount})`}
                            >
                              <span className="text-lg leading-none">○</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleVote(proposal.id, proposal.documentId, proposal.paragraphId, 'CONTRA')}
                              className="h-8 w-8 p-0"
                              title={`Reject (${contraCount})`}
                            >
                              <ThumbsDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Proposed Content */}
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                            <h4 className="text-sm font-medium text-gray-700">Proposed Change</h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleExpanded(`pending-${proposal.id}`)}
                              className="h-6 w-6 p-0"
                            >
                              {expandedItems.has(`pending-${proposal.id}`) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          {expandedItems.has(`pending-${proposal.id}`) ? (
                            <div className="p-0">
                              <InlineExpandedView
                                proposal={proposal}
                                currentUser={currentUser}
                                totalUsers={proposal.totalUsers}
                                onVote={handleVote}
                                onClose={() => toggleExpanded(`pending-${proposal.id}`)}
                              />
                            </div>
                          ) : (
                            <div className="p-4 bg-white">
                              <DiffViewer
                                originalText={proposal.currentText || ''}
                                suggestion1Text={proposal.proposedText}
                                suggestion1Author={proposal.user.name}
                              />
                            </div>
                          )}
                        </div>

                        {/* Action Button */}
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => onNavigateToDocument(proposal.documentId)}
                            className="gap-2"
                          >
                            <MessageSquare className="h-4 w-4" />
                            View Full Discussion
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

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
                  <h3 className="text-lg font-medium mb-2">No Agreed Versions Yet</h3>
                  <p className="text-sm">
                    Recently accepted proposals will appear here with their real approval percentages.
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
                        <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                          <h4 className="text-sm font-medium text-gray-700">What Changed</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(`agreed-${version.id}`)}
                            className="h-6 w-6 p-0"
                          >
                            {expandedItems.has(`agreed-${version.id}`) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        {expandedItems.has(`agreed-${version.id}`) ? (
                          <div className="p-4 bg-white">
                            {/* For agreed versions, show the full context in expanded view */}
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-3 bg-red-50 border border-red-200 rounded">
                                  <div className="text-xs text-red-600 font-medium mb-2">Previous Version</div>
                                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{version.previousText}</div>
                                </div>
                                <div className="p-3 bg-green-50 border border-green-200 rounded">
                                  <div className="text-xs text-green-600 font-medium mb-2">Accepted Version</div>
                                  <div className="text-sm text-gray-900 whitespace-pre-wrap">{version.acceptedText}</div>
                                </div>
                              </div>
                              <div className="text-center">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleExpanded(`agreed-${version.id}`)}
                                >
                                  Show Compact Diff
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-white">
                            <DiffViewer
                              originalText={version.previousText}
                              suggestion1Text={version.acceptedText}
                              suggestion1Author={version.userName}
                            />
                          </div>
                        )}
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
                {debatedProposals.map((proposal, index) => (
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
                              Score: {proposal.debateScore} • {proposal.engagement.comments} comments
                              {proposal.engagement.proPercentage > 30 && proposal.engagement.contraPercentage > 30 && " • Controversial"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {proposal.engagement.proPercentage > 30 && proposal.engagement.contraPercentage > 30 && (
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

                      {/* Proposed Content - Diff View */}
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                          <h4 className="text-sm font-medium text-gray-700">Proposed Change</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(`debated-${proposal.id}`)}
                            className="h-6 w-6 p-0"
                          >
                            {expandedItems.has(`debated-${proposal.id}`) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        {expandedItems.has(`debated-${proposal.id}`) ? (
                          <div className="p-0">
                            <InlineExpandedView
                              proposal={proposal}
                              currentUser={currentUser}
                              totalUsers={proposal.totalUsers || 0}
                              onVote={handleVote}
                              onClose={() => toggleExpanded(`debated-${proposal.id}`)}
                            />
                          </div>
                        ) : (
                          <div className="p-4 bg-white">
                            <DiffViewer
                              originalText={proposal.currentText || ''}
                              suggestion1Text={proposal.proposedText}
                              suggestion1Author={proposal.user.name}
                            />
                          </div>
                        )}
                      </div>

                      {/* Comments */}
                      {proposal.comments && proposal.comments.length > 0 && (
                        <div className="border-t pt-3">
                          <button
                            onClick={() => {
                              // For now, just show all comments since we're in a summary view
                              // Could be made collapsible if needed
                            }}
                            className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4" />
                              <span>
                                Discussion ({proposal.comments.length})
                              </span>
                              <Badge variant="secondary" className="h-5 text-xs">
                                {proposal.comments.length}
                              </Badge>
                            </div>
                          </button>

                          <div className="mt-4 space-y-3 max-h-64 overflow-y-auto">
                            {proposal.comments.slice(0, 10).map((comment) => (
                              <div key={comment.id} className="flex gap-3 p-3 rounded-lg bg-muted/30">
                                <Avatar className="h-8 w-8 flex-shrink-0">
                                  <AvatarImage src={comment.user.avatar} />
                                  <AvatarFallback className="bg-primary/10 text-xs">
                                    {comment.user.name.split(' ').map(n => n[0]).join('')}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-2 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">{comment.user.name}</span>
                                    <span className="text-xs text-muted-foreground">• {formatTimestamp(comment.createdAt)}</span>
                                  </div>
                                  <p className="text-sm text-foreground leading-relaxed break-words">{comment.text}</p>
                                </div>
                              </div>
                            ))}
                            {proposal.comments.length > 10 && (
                              <div className="text-center text-xs text-muted-foreground py-2">
                                And {proposal.comments.length - 10} more comments...
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Action Button */}
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => onNavigateToDocument(proposal.documentId)}
                          className="gap-2"
                        >
                          <MessageSquare className="h-4 w-4" />
                          Join Discussion
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
