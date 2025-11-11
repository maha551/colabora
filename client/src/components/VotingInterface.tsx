import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { Vote, Users, Clock, CheckCircle, Plus, BarChart3, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { Organization, User } from '../types';
import { organizationsApi } from '../lib/api';

interface VotingInterfaceProps {
  organization: Organization;
  currentUser: User;
  onUpdate: () => void;
}

interface OrganizationVote {
  id: string;
  title: string;
  description?: string;
  voteType: 'policy' | 'election' | 'spending' | 'document';
  proposedBy: string;
  status: 'proposed' | 'approved' | 'active' | 'completed';
  threshold: number;
  votingStartsAt?: string;
  votingEndsAt?: string;
  resultYes: number;
  resultNo: number;
  resultAbstain: number;
  createdAt: string;
  targetDocumentId?: string;
}

export function VotingInterface({ organization, currentUser, onUpdate }: VotingInterfaceProps) {
  const [votes, setVotes] = useState<OrganizationVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [voteDialogOpen, setVoteDialogOpen] = useState(false);
  const [selectedVote, setSelectedVote] = useState<OrganizationVote | null>(null);
  const [userChoice, setUserChoice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // New vote form
  const [newVoteTitle, setNewVoteTitle] = useState('');
  const [newVoteDescription, setNewVoteDescription] = useState('');
  const [newVoteType, setNewVoteType] = useState<OrganizationVote['voteType']>('policy');

  useEffect(() => {
    loadVotes();
  }, [organization.id]);

  const loadVotes = async () => {
    try {
      setLoading(true);
      const response = await organizationsApi.getVotes(organization.id);
      setVotes(response.votes);
    } catch (error) {
      console.error('Failed to load votes:', error);
      toast.error('Failed to load votes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVote = async () => {
    if (!newVoteTitle.trim()) {
      toast.error('Vote title is required');
      return;
    }

    try {
      setSubmitting(true);
      await organizationsApi.createVote(organization.id, newVoteTitle, newVoteDescription, [], undefined, newVoteType);

      toast.success('Vote proposal created successfully');
      setCreateDialogOpen(false);
      setNewVoteTitle('');
      setNewVoteDescription('');
      setNewVoteType('policy');
      loadVotes();
      onUpdate();
    } catch (error) {
      console.error('Failed to create vote:', error);
      toast.error('Failed to create vote proposal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCastVote = async () => {
    if (!selectedVote || !userChoice) {
      toast.error('Please select an option');
      return;
    }

    try {
      setSubmitting(true);
      const choiceIndex = userChoice === 'yes' ? 0 : userChoice === 'no' ? 1 : 2;
      await organizationsApi.castVote(organization.id, selectedVote.id, choiceIndex);

      toast.success('Vote cast successfully');
      setVoteDialogOpen(false);
      setSelectedVote(null);
      setUserChoice('');
      loadVotes();
      onUpdate();
    } catch (error) {
      console.error('Failed to cast vote:', error);
      toast.error('Failed to cast vote');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveVote = async (voteId: string) => {
    try {
      await organizationsApi.approveVote(organization.id, voteId);
      toast.success('Vote approved and opened for voting');
      loadVotes();
      onUpdate();
    } catch (error) {
      console.error('Failed to approve vote:', error);
      toast.error('Failed to approve vote');
    }
  };

  const getVoteStatusColor = (status: string) => {
    switch (status) {
      case 'proposed': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getVoteTypeIcon = (type: string) => {
    switch (type) {
      case 'policy': return '📋';
      case 'election': return '🗳️';
      case 'spending': return '💰';
      case 'document': return '📄';
      default: return '🗳️';
    }
  };

  const isRepresentative = organization.representatives?.includes(currentUser.id);
  const isActiveMember = organization.members?.some(m => m.userId === currentUser.id && m.status === 'active');

  const activeVotes = votes.filter(v => v.status === 'approved');
  const proposedVotes = votes.filter(v => v.status === 'proposed');

  return (
    <div className="space-y-6">
      {/* Header with Create Vote Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Organization Voting</h2>
          <p className="text-gray-600">Participate in democratic decision-making</p>
        </div>

        {isActiveMember && (
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Propose Vote
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Propose New Vote</DialogTitle>
                <DialogDescription>
                  Create a vote proposal for organization members to decide on.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Vote Title</Label>
                  <input
                    id="title"
                    type="text"
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="What are we voting on?"
                    value={newVoteTitle}
                    onChange={(e) => setNewVoteTitle(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Provide details about this vote..."
                    value={newVoteDescription}
                    onChange={(e) => setNewVoteDescription(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Vote Type</Label>
                  <RadioGroup value={newVoteType} onValueChange={(value) => setNewVoteType(value as OrganizationVote['voteType'])}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="policy" id="policy" />
                      <Label htmlFor="policy">Policy Change</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="election" id="election" />
                      <Label htmlFor="election">Election</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="spending" id="spending" />
                      <Label htmlFor="spending">Spending Decision</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="document" id="document" />
                      <Label htmlFor="document">Document Decision</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleCreateVote}
                    disabled={!newVoteTitle.trim() || submitting}
                    className="flex-1"
                  >
                    {submitting ? 'Creating...' : 'Create Vote Proposal'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Active Votes */}
      {activeVotes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Vote className="h-5 w-5" />
              Active Votes
            </CardTitle>
            <CardDescription>
              Cast your vote on currently active proposals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activeVotes.map((vote) => (
                <Card key={vote.id} className="border-l-4 border-l-green-500">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{getVoteTypeIcon(vote.voteType)}</span>
                          <h3 className="font-semibold">{vote.title}</h3>
                          <Badge className={getVoteStatusColor(vote.status)}>
                            {vote.status}
                          </Badge>
                        </div>

                        {vote.description && (
                          <p className="text-gray-600 mb-3">{vote.description}</p>
                        )}

                        <div className="grid grid-cols-3 gap-4 mb-3">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{vote.resultYes}</div>
                            <div className="text-sm text-gray-500">Yes</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-red-600">{vote.resultNo}</div>
                            <div className="text-sm text-gray-500">No</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-600">{vote.resultAbstain}</div>
                            <div className="text-sm text-gray-500">Abstain</div>
                          </div>
                        </div>

                        <Progress
                          value={(vote.resultYes / (vote.resultYes + vote.resultNo + vote.resultAbstain || 1)) * 100}
                          className="mb-2"
                        />
                        <div className="text-sm text-gray-500">
                          Threshold: {Math.round(vote.threshold * 100)}% approval needed
                        </div>
                      </div>

                      <Dialog open={voteDialogOpen && selectedVote?.id === vote.id} onOpenChange={(open) => {
                        setVoteDialogOpen(open);
                        if (!open) setSelectedVote(null);
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            onClick={() => setSelectedVote(vote)}
                            className="ml-4"
                          >
                            Vote Now
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Cast Your Vote</DialogTitle>
                            <DialogDescription>
                              {vote.title}
                            </DialogDescription>
                          </DialogHeader>

                          <RadioGroup value={userChoice} onValueChange={setUserChoice}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="yes" id="yes" />
                              <Label htmlFor="yes">Yes - I approve this proposal</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="no" id="no" />
                              <Label htmlFor="no">No - I do not approve this proposal</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="abstain" id="abstain" />
                              <Label htmlFor="abstain">Abstain - I choose not to vote</Label>
                            </div>
                          </RadioGroup>

                          <div className="flex gap-2 pt-4">
                            <Button
                              onClick={handleCastVote}
                              disabled={!userChoice || submitting}
                              className="flex-1"
                            >
                              {submitting ? 'Casting Vote...' : 'Cast Vote'}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => setVoteDialogOpen(false)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proposed Votes (Representatives Only) */}
      {isRepresentative && proposedVotes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Vote Proposals Awaiting Approval
            </CardTitle>
            <CardDescription>
              Review and approve vote proposals from members
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {proposedVotes.map((vote) => (
                <Card key={vote.id} className="border-l-4 border-l-yellow-500">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{getVoteTypeIcon(vote.voteType)}</span>
                          <h3 className="font-semibold">{vote.title}</h3>
                          <Badge className={getVoteStatusColor(vote.status)}>
                            {vote.status}
                          </Badge>
                        </div>

                        {vote.description && (
                          <p className="text-gray-600 mb-2">{vote.description}</p>
                        )}

                        <div className="text-sm text-gray-500">
                          Proposed by member • Threshold: {Math.round(vote.threshold * 100)}%
                        </div>
                      </div>

                      <Button
                        onClick={() => handleApproveVote(vote.id)}
                        className="ml-4 gap-2"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approve Vote
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {loading ? (
        <Card>
          <CardContent className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading votes...</p>
          </CardContent>
        </Card>
      ) : votes.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Vote className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Active Votes</h3>
            <p className="text-gray-600 mb-4">
              There are currently no active votes in this organization.
            </p>
            {isActiveMember && (
              <Button onClick={() => setCreateDialogOpen(true)} variant="outline">
                Propose First Vote
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
