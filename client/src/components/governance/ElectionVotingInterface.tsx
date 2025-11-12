import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Progress } from '../ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Checkbox } from '../ui/checkbox';
import { Vote, Users, Clock, Shield, Eye, CheckCircle, AlertTriangle } from 'lucide-react';
import { Organization, RepresentativeElection, ElectionCandidate } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';

interface ElectionVotingInterfaceProps {
  organization: Organization;
  election: RepresentativeElection;
  currentUser: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ElectionVotingInterface({
  organization,
  election,
  currentUser,
  open,
  onOpenChange,
  onSuccess
}: ElectionVotingInterfaceProps) {
  const [loading, setLoading] = useState(false);
  const [voting, setVoting] = useState(false);
  const [candidates, setCandidates] = useState<ElectionCandidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [voteConfirmed, setVoteConfirmed] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    if (open && election) {
      loadCandidates();
      checkVoteStatus();
    }
  }, [open, election]);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.getElections(organization.id);
      const currentElection = response.elections?.find(e => e.id === election.id);
      if (currentElection?.candidates) {
        setCandidates(currentElection.candidates);
      }
    } catch (error) {
      console.error('Failed to load candidates:', error);
      toast.error('Failed to load election candidates');
    } finally {
      setLoading(false);
    }
  };

  const checkVoteStatus = async () => {
    try {
      // In a real implementation, you'd check if the user has already voted
      // For now, we'll just set hasVoted to false
      setHasVoted(false);
    } catch (error) {
      console.error('Failed to check vote status:', error);
    }
  };

  const handleCandidateSelect = (candidateId: string, checked: boolean) => {
    if (election.votingMethod === 'approval') {
      // Approval voting - multiple selections allowed
      setSelectedCandidates(prev =>
        checked
          ? [...prev, candidateId]
          : prev.filter(id => id !== candidateId)
      );
    } else {
      // Single selection for ranked choice and simple majority
      setSelectedCandidates(checked ? [candidateId] : []);
    }
  };

  const handleRankedChoiceSelect = (candidateId: string, rank: number) => {
    const newSelections = [...selectedCandidates];
    newSelections[rank - 1] = candidateId;
    setSelectedCandidates(newSelections.slice(0, election.positionsAvailable));
  };

  const canVote = () => {
    if (hasVoted) return false;
    if (selectedCandidates.length === 0) return false;

    if (election.votingMethod === 'ranked_choice') {
      return selectedCandidates.length >= Math.min(3, candidates.length); // At least 3 rankings or all candidates
    }

    return true;
  };

  const handleVote = async () => {
    if (!canVote() || !voteConfirmed) return;

    setVoting(true);
    try {
      let voteData: any = {};

      if (election.votingMethod === 'ranked_choice') {
        voteData.candidateRanking = selectedCandidates;
      } else if (election.votingMethod === 'approval') {
        voteData.approvedCandidates = selectedCandidates;
      } else {
        // Simple majority
        voteData.candidateId = selectedCandidates[0];
      }

      await governanceApi.castElectionVote(organization.id, election.id, voteData);

      toast.success('Your vote has been cast successfully');
      setHasVoted(true);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to cast vote:', error);
      toast.error('Failed to cast vote. Please try again.');
    } finally {
      setVoting(false);
    }
  };

  const isActiveMember = organization.members?.some(m => m.userId === currentUser.id && m.status === 'active');

  if (!isActiveMember) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Access Denied
            </DialogTitle>
          </DialogHeader>
          <p className="text-gray-600">
            Only active organization members can vote in elections.
          </p>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  const votingProgress = election.totalVoters > 0 ? (election.votesCast / election.totalVoters) * 100 : 0;
  const timeRemaining = new Date(election.votingEndsAt) > new Date()
    ? Math.ceil((new Date(election.votingEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5" />
            {election.electionTitle}
          </DialogTitle>
          <DialogDescription>
            {election.electionDescription}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : hasVoted ? (
          <div className="text-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-900 mb-2">Vote Cast Successfully</h3>
            <p className="text-gray-600 mb-4">
              Thank you for participating in this election. Your vote has been recorded anonymously.
            </p>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Election Status */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">{candidates.length}</div>
                    <div className="text-gray-600">Candidates</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">{election.votesCast}</div>
                    <div className="text-gray-600">Votes Cast</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-orange-600">{timeRemaining}</div>
                    <div className="text-gray-600">Days Left</div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span>Voting Progress</span>
                    <span>{Math.round(votingProgress)}% ({election.votesCast}/{election.totalVoters})</span>
                  </div>
                  <Progress value={votingProgress} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Voting Method Info */}
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>Voting Method:</strong> {election.votingMethod?.replace('_', ' ')} •
                <strong>Privacy:</strong> {election.anonymousVoting ? 'Anonymous' : 'Public'} •
                <strong>Positions:</strong> {election.positionsAvailable}
              </AlertDescription>
            </Alert>

            {/* Candidates List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Candidates
                </CardTitle>
                <CardDescription>
                  Select your {election.votingMethod === 'ranked_choice' ? 'ranked preferences' : 'choice(s)'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {candidates.map((candidate, index) => (
                    <div key={candidate.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                      {election.votingMethod === 'ranked_choice' ? (
                        // Ranked choice voting
                        <Select
                          value={selectedCandidates.findIndex(id => id === candidate.id) + 1}
                          onValueChange={(rank) => handleRankedChoiceSelect(candidate.id, parseInt(rank))}
                        >
                          <SelectTrigger className="w-16">
                            <SelectValue placeholder="#" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: Math.min(election.positionsAvailable, candidates.length) }, (_, i) => (
                              <SelectItem key={i + 1} value={String(i + 1)}>
                                {i + 1}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        // Single choice or approval voting
                        <Checkbox
                          checked={selectedCandidates.includes(candidate.id)}
                          onCheckedChange={(checked) => handleCandidateSelect(candidate.id, checked as boolean)}
                        />
                      )}

                      <div className="flex-1">
                        <div className="font-medium">{candidate.user?.name || 'Unknown Candidate'}</div>
                        {candidate.nominationStatement && (
                          <div className="text-sm text-gray-600 mt-1">
                            {candidate.nominationStatement}
                          </div>
                        )}
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            Nominated {new Date(candidate.nominatedAt).toLocaleDateString()}
                          </Badge>
                          {candidate.userId === currentUser.id && (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                              Your Nomination
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {candidates.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No candidates have been nominated yet.</p>
                    <p className="text-sm">Check back later or consider nominating yourself.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Vote Confirmation */}
            {selectedCandidates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Confirm Your Vote
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium mb-2">Your Selection:</h4>
                    {election.votingMethod === 'ranked_choice' ? (
                      <div className="space-y-1">
                        {selectedCandidates.map((candidateId, rank) => {
                          const candidate = candidates.find(c => c.id === candidateId);
                          return (
                            <div key={candidateId} className="text-sm">
                              {rank + 1}. {candidate?.user?.name || 'Unknown'}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {selectedCandidates.map(candidateId => {
                          const candidate = candidates.find(c => c.id === candidateId);
                          return (
                            <div key={candidateId} className="text-sm">
                              • {candidate?.user?.name || 'Unknown'}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="confirm-vote"
                      checked={voteConfirmed}
                      onCheckedChange={setVoteConfirmed}
                    />
                    <Label htmlFor="confirm-vote" className="text-sm">
                      I confirm this is my final vote and understand it cannot be changed
                    </Label>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {!hasVoted && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleVote}
              disabled={!canVote() || !voteConfirmed || voting}
              className="gap-2"
            >
              <Vote className="h-4 w-4" />
              {voting ? 'Casting Vote...' : 'Cast Vote'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
