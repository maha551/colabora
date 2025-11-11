import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

import { StructureProposal, StructureOperation } from '@/types';
import { structureProposalsApi } from '@/lib/api';

interface StructureProposalCardProps {
  structureProposal: StructureProposal;
  documentId: string;
  currentUserId: string;
  onVote: () => void;
  onApply?: () => void;
  canApply?: boolean;
}

export function StructureProposalCard({
  structureProposal,
  documentId,
  currentUserId,
  onVote,
  onApply,
  canApply = false
}: StructureProposalCardProps) {
  const [isVoting, setIsVoting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showDiff, setShowDiff] = useState(false);

  const userVote = structureProposal.votes.find(vote => vote.userId === currentUserId);
  const isApproved = structureProposal.approved;
  const isApplied = structureProposal.applied;
  const isCreator = structureProposal.user.id === currentUserId;

  const voteCounts = {
    pro: structureProposal.votes.filter(v => v.vote === 'PRO').length,
    neutral: structureProposal.votes.filter(v => v.vote === 'NEUTRAL').length,
    contra: structureProposal.votes.filter(v => v.vote === 'CONTRA').length,
  };

  const handleVote = async (vote: 'PRO' | 'NEUTRAL' | 'CONTRA') => {
    if (isVoting || isApplied) return;

    setIsVoting(true);
    try {
      await structureProposalsApi.voteOnStructureProposal(documentId, structureProposal.id, vote);
      onVote();
    } catch (error) {
      console.error('Failed to vote:', error);
      alert('Failed to cast vote. Please try again.');
    } finally {
      setIsVoting(false);
    }
  };

  const handleApply = async () => {
    if (isApplying || !isApproved || isApplied) return;

    if (!confirm('Are you sure you want to apply this structure change? This action cannot be easily undone.')) {
      return;
    }

    setIsApplying(true);
    try {
      await structureProposalsApi.applyStructureProposal(documentId, structureProposal.id);
      onApply?.();
    } catch (error) {
      console.error('Failed to apply structure proposal:', error);
      alert('Failed to apply structure proposal. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting || isApplied) return;

    if (!confirm('Are you sure you want to delete this structure proposal? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      await structureProposalsApi.deleteStructureProposal(documentId, structureProposal.id);
      onVote(); // Refresh the proposals list
    } catch (error) {
      console.error('Failed to delete structure proposal:', error);
      alert('Failed to delete structure proposal. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;

    try {
      await structureProposalsApi.addCommentToStructureProposal(
        documentId,
        structureProposal.id,
        commentText.trim()
      );
      setCommentText('');
      setShowCommentDialog(false);
      onVote(); // Refresh data
    } catch (error) {
      console.error('Failed to add comment:', error);
      alert('Failed to add comment. Please try again.');
    }
  };

  const renderOperationSummary = (operation: StructureOperation) => {
    switch (operation.operationType) {
      case 'MOVE':
        return `Move section to position ${operation.newPositionIndex}`;
      case 'MERGE':
        return `Merge ${operation.sourceParagraphIds?.length || 0} sections into one`;
      case 'DELETE':
        return 'Mark section for deletion';
      case 'RENAME_HEADING':
        return `Rename heading to "${operation.newText}"`;
      case 'CHANGE_HEADING_LEVEL':
        return `Change heading level to ${operation.newHeadingLevel}`;
      case 'INSERT_NEW':
        return 'Insert new section';
      default:
        return operation.operationType;
    }
  };

  const getStatusBadge = () => {
    if (isApplied) {
      return <Badge variant="secondary" className="bg-green-100 text-green-800">✅ Applied</Badge>;
    }
    if (isApproved) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800">👍 Approved</Badge>;
    }
    return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">⏳ Voting</Badge>;
  };

  return (
    <Card className="w-full border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🏗️</div>
            <div>
              <CardTitle className="text-lg">{structureProposal.title}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Avatar className="w-6 h-6">
                  <AvatarImage src="" />
                  <AvatarFallback className="text-xs">
                    {structureProposal.user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-gray-600">{structureProposal.user.name}</span>
                <span className="text-sm text-gray-500">
                  {new Date(structureProposal.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {structureProposal.description && (
          <p className="text-gray-700">{structureProposal.description}</p>
        )}

        {/* Operations Summary */}
        <div className="bg-gray-50 p-3 rounded-lg">
          <h4 className="font-medium mb-2">Structural Changes ({structureProposal.operations.length})</h4>
          <div className="space-y-1">
            {structureProposal.operations.slice(0, 3).map((op, index) => (
              <div key={index} className="text-sm text-gray-600 flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                {renderOperationSummary(op)}
              </div>
            ))}
            {structureProposal.operations.length > 3 && (
              <div className="text-sm text-gray-500">
                +{structureProposal.operations.length - 3} more operations
              </div>
            )}
          </div>
        </div>

        {/* Vote Counts */}
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              👍 {voteCounts.pro}
            </Badge>
            <Badge variant="secondary" className="bg-gray-100 text-gray-800">
              ➖ {voteCounts.neutral}
            </Badge>
            <Badge variant="secondary" className="bg-red-100 text-red-800">
              👎 {voteCounts.contra}
            </Badge>
          </div>
          <span className="text-sm text-gray-500">
            {structureProposal.votes.length} votes cast
          </span>
        </div>

        {/* Voting Buttons */}
        {!isApplied && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={userVote?.vote === 'PRO' ? 'default' : 'outline'}
              onClick={() => handleVote('PRO')}
              disabled={isVoting}
              className="flex-1"
            >
              👍 PRO
            </Button>
            <Button
              size="sm"
              variant={userVote?.vote === 'NEUTRAL' ? 'default' : 'outline'}
              onClick={() => handleVote('NEUTRAL')}
              disabled={isVoting}
              className="flex-1"
            >
              ➖ NEUTRAL
            </Button>
            <Button
              size="sm"
              variant={userVote?.vote === 'CONTRA' ? 'default' : 'outline'}
              onClick={() => handleVote('CONTRA')}
              disabled={isVoting}
              className="flex-1"
            >
              👎 CONTRA
            </Button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t">
          <Dialog open={showDiff} onOpenChange={setShowDiff}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1">
                🔍 View Changes
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Structural Changes Preview</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {structureProposal.operations.map((op, index) => (
                  <Alert key={index}>
                    <AlertDescription>
                      <strong>{op.operationType}:</strong> {renderOperationSummary(op)}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showCommentDialog} onOpenChange={setShowCommentDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1">
                💬 Comment ({structureProposal.comments.length})
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Comment</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Share your thoughts on this restructure..."
                  rows={4}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setShowCommentDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleAddComment}>
                    Post Comment
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {isCreator && !isApplied && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : '🗑️ Delete Proposal'}
            </Button>
          )}

          {canApply && isApproved && !isApplied && (
            <Button
              variant="default"
              size="sm"
              onClick={handleApply}
              disabled={isApplying}
              className="bg-green-600 hover:bg-green-700"
            >
              {isApplying ? 'Applying...' : '✅ Apply Changes'}
            </Button>
          )}
        </div>

        {/* Comments Preview */}
        {structureProposal.comments.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-2">Recent Comments</div>
            <div className="space-y-2">
              {structureProposal.comments.slice(0, 2).map((comment) => (
                <div key={comment.id} className="text-sm bg-gray-50 p-2 rounded">
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar className="w-4 h-4">
                      <AvatarFallback className="text-xs">
                        {comment.user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{comment.user.name}</span>
                    <span className="text-gray-500 text-xs">
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-gray-700">{comment.text}</p>
                </div>
              ))}
              {structureProposal.comments.length > 2 && (
                <div className="text-sm text-gray-500 text-center">
                  +{structureProposal.comments.length - 2} more comments
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
