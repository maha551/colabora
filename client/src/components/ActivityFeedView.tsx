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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./ui/tabs";
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
  const [activePanel, setActivePanel] = useState<'agreed' | 'pending' | 'debated'>('agreed');
  const [agreedVersions, setAgreedVersions] = useState<any[]>([]);
  const [loadingAgreed, setLoadingAgreed] = useState(false);
  const [debatedProposals, setDebatedProposals] = useState<any[]>([]);
  const [loadingDebated, setLoadingDebated] = useState(false);
  const [pendingProposals, setPendingProposals] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [lastViewedTimestamps, setLastViewedTimestamps] = useState<Record<string, string>>({});
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());


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
        <Tabs value={activePanel} onValueChange={(value) => setActivePanel(value as 'agreed' | 'pending' | 'debated')}>
          <div className="flex justify-center mb-6 px-4">
            <TabsList className="w-full sm:w-auto bg-white border border-gray-200 shadow-sm">
              <TabsTrigger 
                value="agreed" 
                className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm text-gray-500 data-[state=active]:bg-green-50 data-[state=active]:text-green-700 data-[state=active]:border-b-2 data-[state=active]:border-green-600 data-[state=active]:font-semibold data-[state=active]:shadow-sm transition-all"
              >
                <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Accepted</span>
                {agreedVersions.length > 0 && (
                  <Badge variant="default" className="ml-1 bg-green-600 text-white text-xs px-1.5 py-0.5 font-medium">
                    {agreedVersions.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="debated" 
                className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm text-gray-500 data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 data-[state=active]:border-b-2 data-[state=active]:border-purple-600 data-[state=active]:font-semibold data-[state=active]:shadow-sm transition-all"
              >
                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Discussed</span>
                {debatedProposals.length > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 font-medium">
                    {debatedProposals.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="pending" 
                className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm text-gray-500 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:font-semibold data-[state=active]:shadow-sm transition-all"
              >
                <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Pending</span>
                {pendingProposals.length > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 font-medium">
                    {pendingProposals.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
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
              <div className="space-y-3">
                {agreedVersions.map((version) => (
                  <Card key={version.id} className="overflow-hidden border-green-200 hover:shadow-md transition-all hover:border-green-300 shadow-sm">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3.5 border-b border-green-200">
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
                        <Badge className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 text-xs font-semibold">
                          {version.approvalPercentage}% Approved
                        </Badge>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-3.5 space-y-3">
                      {/* Document and User Info */}
                      <div className="flex items-center justify-between text-sm text-gray-600">
                        <div className="flex items-center gap-4">
                          <Badge
                            variant="secondary"
                            className="cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors px-2 py-0.5 text-xs font-medium"
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
                      <div className="flex justify-end pt-1">
                        <Button
                          size="sm"
                          onClick={() => onNavigateToDocument(version.documentId)}
                          className="gap-2 bg-black hover:bg-gray-800 text-white shadow-sm font-medium"
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
              <div className="space-y-3">
                {debatedProposals.map((proposal, index) => (
                  <Card key={proposal.id} className="overflow-hidden hover:shadow-md transition-all hover:border-purple-300 border-purple-200 shadow-sm">
                    {/* Compact Header - Single Line */}
                    <div className="bg-gradient-to-r from-purple-50 to-violet-50 p-2.5 border-b border-purple-200">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">#{index + 1}</span>
                          <TrendingUp className="h-3 w-3 text-purple-600" />
                          <h3 className="text-base font-semibold text-purple-900">
                            Most Debated Proposal
                          </h3>
                          <span className="text-xs text-purple-700">•</span>
                          <span className="text-xs text-purple-700">Score: {proposal.debateScore}</span>
                          <span className="text-xs text-purple-700">•</span>
                          <span className="text-xs text-purple-700">💬 {proposal.engagement.comments}</span>
                          {proposal.engagement.proPercentage > 30 && proposal.engagement.contraPercentage > 30 && (
                            <>
                              <span className="text-xs text-purple-700">•</span>
                              <Badge className="bg-orange-100 text-orange-700 border-orange-200 px-1.5 py-0.5 text-xs font-semibold">
                                ⚖️ Controversial
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-3 space-y-2.5">
                      {/* Compact User and Document Info - Single Line */}
                      <div className="flex items-center gap-2 text-xs text-gray-600 flex-wrap">
                        <Avatar className="h-6 w-6 flex-shrink-0">
                          <AvatarImage src={proposal.user.avatar} />
                          <AvatarFallback className="text-[10px] bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                            {proposal.user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-gray-900">{proposal.user.name}</span>
                        <span className="text-gray-400">in</span>
                        <Badge
                          variant="secondary"
                          className="text-xs font-medium cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors px-1.5 py-0 h-5"
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
                        <Badge
                          variant={proposal.type === 'TITLE' ? 'default' : 'outline'}
                          className="text-xs h-5 ml-auto"
                        >
                          {proposal.type === 'TITLE' ? '📝 Title' : '📄 Body'}
                        </Badge>
                      </div>

                      {/* Proposed Change - Collapsible by Default */}
                      <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                        <button
                          onClick={() => toggleExpanded(`debated-${proposal.id}`)}
                          className="w-full bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-gray-700">Proposed Change</h4>
                            <span className="text-xs text-gray-500">by {proposal.user.name}</span>
                            {!expandedItems.has(`debated-${proposal.id}`) && (
                              <span className="text-xs text-gray-500 truncate">
                                • {getChangePreview(proposal.currentText || '', proposal.proposedText)}
                              </span>
                            )}
                          </div>
                          {expandedItems.has(`debated-${proposal.id}`) ? (
                            <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
                          )}
                        </button>
                        {expandedItems.has(`debated-${proposal.id}`) && (
                          <div className="p-0">
                            <InlineExpandedView
                              proposal={proposal}
                              currentUser={currentUser}
                              totalUsers={proposal.totalUsers || 0}
                              onVote={handleVote}
                              onClose={() => toggleExpanded(`debated-${proposal.id}`)}
                            />
                          </div>
                        )}
                      </div>

                      {/* Compact Comments - Show 2-3 by default */}
                      {proposal.comments && proposal.comments.length > 0 && (
                        <div className="border-t border-gray-100 pt-2">
                          <div className="flex items-center gap-2 mb-2">
                            <MessageSquare className="h-3 w-3 text-gray-500" />
                            <span className="text-xs font-medium text-gray-700">
                              Discussion ({proposal.comments.length})
                            </span>
                          </div>
                          
                          <div className="space-y-2">
                            {(expandedComments.has(proposal.id) 
                              ? proposal.comments 
                              : proposal.comments.slice(0, 2)
                            ).map((comment) => (
                              <div key={comment.id} className="flex gap-2 p-2 rounded bg-muted/30">
                                <Avatar className="h-6 w-6 flex-shrink-0">
                                  <AvatarImage src={comment.user.avatar} />
                                  <AvatarFallback className="bg-primary/10 text-[10px]">
                                    {comment.user.name.split(' ').map(n => n[0]).join('') || 'U'}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="text-xs font-medium text-foreground">{comment.user.name}</span>
                                    <span className="text-xs text-muted-foreground">• {formatTimestamp(comment.createdAt)}</span>
                                  </div>
                                  <p className="text-xs text-foreground leading-relaxed break-words">{comment.text}</p>
                                </div>
                              </div>
                            ))}
                            
                            {proposal.comments.length > 2 && (
                              <button
                                onClick={() => toggleCommentsExpanded(proposal.id)}
                                className="text-xs text-gray-600 hover:text-gray-900 transition-colors py-1"
                              >
                                {expandedComments.has(proposal.id) 
                                  ? `Show less` 
                                  : `Show ${proposal.comments.length - 2} more comments`
                                }
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Action Button */}
                      <div className="flex justify-end pt-1 border-t border-gray-100">
                        <Button
                          size="sm"
                          onClick={() => onNavigateToDocument(proposal.documentId)}
                          className="gap-2 bg-black hover:bg-gray-800 text-white shadow-sm font-medium h-8 text-xs"
                        >
                          <MessageSquare className="h-3 w-3" />
                          Join Discussion
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
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
              <div className="space-y-3">
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
                    <Card key={proposal.id} className="overflow-hidden hover:shadow-md transition-shadow border-blue-200 shadow-sm">
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

                      <div className="p-3.5 space-y-3">
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
                            className="gap-2 bg-black hover:bg-gray-800 text-white shadow-sm font-medium"
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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
