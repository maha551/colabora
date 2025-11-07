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
  const [pendingProposals, setPendingProposals] = useState<PendingProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<'pending' | 'agreed'>('pending');

  // Load pending proposals
  useEffect(() => {
    const fetchPendingProposals = async () => {
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
        setLoading(false);
      }
    };

    fetchPendingProposals();
  }, []);

  const refreshData = () => {
    setLoading(true);
    // Re-trigger the useEffect
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Activity Feed</h1>
          <Button
            onClick={refreshData}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
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
            Pending Proposals ({pendingProposals.length})
          </Button>
          <Button
            variant={activePanel === 'agreed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActivePanel('agreed')}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Agreed Changes
          </Button>
        </div>

        {/* Content */}
        {activePanel === 'pending' && (
          <div className="space-y-4">
            {loading ? (
              <Card className="p-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading proposals...</p>
                </div>
              </Card>
            ) : pendingProposals.length === 0 ? (
              <Card className="p-12">
                <div className="text-center">
                  <p className="text-gray-600">No pending proposals at the moment.</p>
                  <p className="text-sm text-gray-500 mt-2">Check back later for new proposals to review!</p>
                </div>
              </Card>
            ) : (
              pendingProposals.slice(0, 10).map((proposal) => (
                <Card key={proposal.id} className="p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={proposal.user.avatar} />
                      <AvatarFallback>
                        {proposal.user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-gray-900">{proposal.user.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {proposal.type}
                        </Badge>
                        <span className="text-sm text-gray-500">
                          {new Date(proposal.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="mb-3">
                        <h3 className="font-medium text-gray-900 mb-1">
                          {proposal.documentTitle}
                          {proposal.paragraphTitle && (
                            <span className="text-gray-600"> • {proposal.paragraphTitle}</span>
                          )}
                        </h3>
                      </div>

                      {/* Content Preview */}
                      <div className="bg-gray-50 rounded-lg p-3 mb-4">
                        <div className="text-sm text-gray-700 line-clamp-2">
                          {proposal.proposedText}
                        </div>
                      </div>

                      {/* Vote Progress */}
                      <div className="flex items-center gap-4 mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <div className="flex items-center gap-1">
                              <ThumbsUp className="h-4 w-4 text-green-600" />
                              <span className="text-green-700 font-medium">{proposal.votes.pro}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Minus className="h-4 w-4 text-gray-600" />
                              <span className="text-gray-700">{proposal.votes.neutral}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <ThumbsDown className="h-4 w-4 text-red-600" />
                              <span className="text-red-700">{proposal.votes.contra}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => onNavigateToDocument(proposal.documentId)}
                          className="gap-2"
                        >
                          <MessageSquare className="h-4 w-4" />
                          View Discussion
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {activePanel === 'agreed' && (
          <Card className="p-12">
            <div className="text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Agreed Changes</h3>
              <p className="text-gray-600">Recent changes that have been accepted will appear here.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
