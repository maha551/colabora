import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';
import { Trophy, Users, Vote, CheckCircle, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { Organization, RepresentativeElection, ElectionCandidate, User } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';

interface ElectionResultsProps {
  organization: Organization;
  election: RepresentativeElection;
  currentUser: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ElectionResult {
  candidate: ElectionCandidate;
  votesReceived: number;
  votePercentage: number;
  elected: boolean;
  position?: number;
}

export function ElectionResults({
  organization,
  election,
  currentUser,
  open,
  onOpenChange,
  onSuccess
}: ElectionResultsProps) {
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [results, setResults] = useState<ElectionResult[]>([]);
  const [electionStats, setElectionStats] = useState({
    totalVotes: 0,
    turnoutPercentage: 0,
    quorumReached: false,
    canComplete: false
  });

  useEffect(() => {
    if (open && election) {
      loadElectionResults();
    }
  }, [open, election]);

  const loadElectionResults = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.getElectionResults(organization.id, election.id);

      const { election: electionData, candidates, stats } = response;

      // Convert candidates to ElectionResult format
      const results: ElectionResult[] = candidates.map((candidate: ElectionCandidate, index: number) => ({
        candidate: {
          id: candidate.id,
          electionId: election.id,
          userId: candidate.userId,
          user: { name: (candidate as unknown as { userName?: string; user_name?: string }).userName || (candidate as unknown as { userName?: string; user_name?: string }).user_name || 'Unknown' },
          nominatedAt: (candidate as unknown as { nominatedAt?: string; nominated_at?: string }).nominatedAt || (candidate as unknown as { nominatedAt?: string; nominated_at?: string }).nominated_at,
          nominationStatement: (candidate as unknown as { nominationStatement?: string; nomination_statement?: string }).nominationStatement || (candidate as unknown as { nominationStatement?: string; nomination_statement?: string }).nomination_statement,
          acceptedNomination: true,
          votesReceived: (candidate as unknown as { votes_received?: number }).votes_received || 0,
          elected: false
        } as ElectionCandidate,
        votesReceived: candidate.votes_received || 0,
        votePercentage: stats.totalVotes > 0 ? ((candidate.votes_received || 0) / stats.totalVotes) * 100 : 0,
        elected: (candidate.elected_position && candidate.elected_position <= stats.positionsAvailable),
        position: candidate.elected_position
      }));

      setResults(results);

      setElectionStats({
        totalVotes: stats.totalVotes,
        turnoutPercentage: stats.quorumPercentage,
        quorumReached: stats.quorumReached,
        canComplete: electionData.status === 'active' && stats.quorumReached
      });

    } catch (error) {
      console.error('Failed to load election results:', error);
      toast.error('Failed to load election results');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteElection = async () => {
    setCompleting(true);
    try {
      await governanceApi.completeElection(organization.id, election.id);
      toast.success('Election completed successfully! New representatives have been assigned.');
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to complete election:', error);
      toast.error('Failed to complete election');
    } finally {
      setCompleting(false);
    }
  };

  const isRepresentative = organization.representatives?.includes(currentUser.id);
  const electionEnded = new Date(election.votingEndsAt || '') < new Date();
  const canCompleteElection = isRepresentative && election.status === 'active' && electionStats.canComplete;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Election Results - {election.electionTitle}
          </DialogTitle>
          <DialogDescription>
            Final results and outcome of the representative election
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Election Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Vote className="h-5 w-5" />
                  Election Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{results.length}</div>
                    <div className="text-sm text-gray-600">Candidates</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{electionStats.totalVotes}</div>
                    <div className="text-sm text-gray-600">Total Votes</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${electionStats.quorumReached ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.round(electionStats.turnoutPercentage)}%
                    </div>
                    <div className="text-sm text-gray-600">Turnout</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${electionStats.quorumReached ? 'text-green-600' : 'text-red-600'}`}>
                      {electionStats.quorumReached ? '✓' : '✗'}
                    </div>
                    <div className="text-sm text-gray-600">Quorum</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span>Voter Turnout</span>
                    <span>{Math.round(electionStats.turnoutPercentage)}% ({electionStats.totalVotes} votes)</span>
                  </div>
                  <Progress value={electionStats.turnoutPercentage} className="h-2" />
                  <div className="text-xs text-gray-600 mt-1">
                    Required quorum: {election.quorumPercentage || 50}%
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Election Status */}
            {!electionEnded && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  <strong>Election still in progress.</strong> Voting ends on{' '}
                  {new Date(election.votingEndsAt || '').toLocaleDateString()} at{' '}
                  {new Date(election.votingEndsAt || '').toLocaleTimeString()}.
                </AlertDescription>
              </Alert>
            )}

            {electionEnded && !electionStats.quorumReached && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  <strong>Quorum not reached.</strong> This election did not meet the minimum participation requirement
                  and cannot be completed. A new election may need to be called.
                </AlertDescription>
              </Alert>
            )}

            {/* Results Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Election Results
                </CardTitle>
                <CardDescription>
                  Candidates ranked by votes received
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {results.map((result, index) => (
                    <div
                      key={result.candidate.id}
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        result.elected
                          ? 'bg-green-50 border-green-200'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          result.elected
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-200 text-gray-600'
                        }`}>
                          {result.position || (index + 1)}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">
                              {result.candidate.user?.name || 'Unknown Candidate'}
                            </div>
                            {result.elected && (
                              <Badge className="bg-green-100 text-green-800">
                                <Trophy className="h-3 w-3 mr-1" />
                                Elected
                              </Badge>
                            )}
                          </div>

                          {result.candidate.nominationStatement && (
                            <div className="text-sm text-gray-600 mt-1 line-clamp-1">
                              {result.candidate.nominationStatement}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold">
                          {result.votesReceived} votes
                        </div>
                        <div className="text-sm text-gray-600">
                          {Math.round(result.votePercentage)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {results.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Vote className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No results available yet.</p>
                    <p className="text-sm">Results will appear once voting begins.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Elected Representatives */}
            {results.some(r => r.elected) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    New Representatives
                  </CardTitle>
                  <CardDescription>
                    These candidates have been elected to serve as organization representatives
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {results
                      .filter(r => r.elected)
                      .sort((a, b) => (a.position || 0) - (b.position || 0))
                      .map(result => (
                        <div key={result.candidate.id} className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                            <CheckCircle className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-green-900">
                              {result.candidate.user?.name || 'Unknown Representative'}
                            </div>
                            <div className="text-sm text-green-700">
                              Position #{result.position} • {result.votesReceived} votes ({Math.round(result.votePercentage)}%)
                            </div>
                            <div className="text-xs text-green-600 mt-1">
                              Term: {election.termMonths} months starting immediately
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Election Completion Actions */}
            {canCompleteElection && (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-900">
                    <CheckCircle className="h-5 w-5" />
                    Complete Election
                  </CardTitle>
                  <CardDescription className="text-orange-800">
                    Election has ended and quorum was reached. Representatives can now be officially assigned.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Completing the election will:
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Assign elected candidates as organization representatives</li>
                        <li>Archive the election results permanently</li>
                        <li>Update representative terms and expiration dates</li>
                        <li>Notify all organization members of the results</li>
                      </ul>
                    </AlertDescription>
                  </Alert>

                  <Button
                    onClick={handleCompleteElection}
                    disabled={completing}
                    className="w-full"
                    size="lg"
                  >
                    {completing ? 'Completing Election...' : 'Complete Election & Assign Representatives'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
