import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { User as UserIcon, Plus, CheckCircle, Clock, X, AlertTriangle, Vote } from 'lucide-react';
import { Organization, RepresentativeElection, ElectionCandidate, User } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';

interface CandidateNominationInterfaceProps {
  organization: Organization;
  election: RepresentativeElection;
  currentUser: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CandidateNominationInterface({
  organization,
  election,
  currentUser,
  open,
  onOpenChange,
  onSuccess
}: CandidateNominationInterfaceProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<ElectionCandidate[]>([]);
  const [userNomination, setUserNomination] = useState<ElectionCandidate | null>(null);
  const [showNominationForm, setShowNominationForm] = useState(false);

  const [nominationData, setNominationData] = useState({
    nominationStatement: '',
    qualifications: '',
    experience: ''
  });

  useEffect(() => {
    if (open && election) {
      loadCandidates();
    }
  }, [open, election]);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.getElections(organization.id);
      const currentElection = response.elections?.find(e => e.id === election.id);
      if (currentElection?.candidates) {
        setCandidates(currentElection.candidates);
        // Check if current user has nominated
        const userNom = currentElection.candidates.find((c: ElectionCandidate) => c.userId === currentUser.id);
        setUserNomination(userNom || null);
      }
    } catch (error) {
      console.error('Failed to load candidates:', error);
      toast.error('Failed to load election candidates');
    } finally {
      setLoading(false);
    }
  };

  const handleNominationSubmit = async () => {
    if (!nominationData.nominationStatement.trim()) {
      toast.error('Nomination statement is required');
      return;
    }

    setSubmitting(true);
    try {
      await governanceApi.nominateCandidate(organization.id, election.id, {
        candidateUserId: currentUser.id,
        nominationStatement: nominationData.nominationStatement
      });

      toast.success('Nomination submitted successfully');
      setShowNominationForm(false);
      setNominationData({ nominationStatement: '', qualifications: '', experience: '' });
      loadCandidates(); // Refresh candidates list
      onSuccess?.();
    } catch (error) {
      console.error('Failed to submit nomination:', error);
      toast.error('Failed to submit nomination');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdrawNomination = async () => {
    if (!userNomination) return;

    try {
      // Note: We might need to add a withdraw endpoint, for now we'll show a message
      toast.info('Nomination withdrawal not yet implemented. Contact a representative.');
    } catch (error) {
      console.error('Failed to withdraw nomination:', error);
      toast.error('Failed to withdraw nomination');
    }
  };

  const getNominationStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending Review</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const isActiveMember = organization.members?.some(m => m.userId === currentUser.id && m.status === 'active');
  const nominationDeadline = election.nominationDeadline ? new Date(election.nominationDeadline) : null;
  const isNominationOpen = nominationDeadline ? new Date() < nominationDeadline : true;
  const canNominate = isActiveMember && isNominationOpen && !userNomination;

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
            Only active organization members can participate in nominations.
          </p>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5" />
            Candidate Nominations - {election.electionTitle}
          </DialogTitle>
          <DialogDescription>
            Organization members can nominate themselves to run for representative positions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Nomination Status & Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <UserIcon className="h-5 w-5" />
                  Your Nomination Status
                </span>
                {nominationDeadline && (
                  <div className="text-sm text-gray-600">
                    Deadline: {nominationDeadline.toLocaleDateString()}
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {userNomination ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <div className="font-medium text-green-900">You are nominated!</div>
                        <div className="text-sm text-green-700">
                          Status: {getNominationStatusBadge(userNomination.status)}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleWithdrawNomination}
                      disabled={userNomination.status === 'approved'}
                    >
                      Withdraw
                    </Button>
                  </div>

                  {userNomination.nominationStatement && (
                    <div>
                      <Label className="text-sm font-medium">Your Nomination Statement</Label>
                      <p className="mt-1 p-3 bg-gray-50 rounded text-sm">
                        {userNomination.nominationStatement}
                      </p>
                    </div>
                  )}
                </div>
              ) : canNominate ? (
                <div className="text-center py-6">
                  <User className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold mb-2">Ready to Run?</h3>
                  <p className="text-gray-600 mb-4">
                    Nominate yourself for a representative position in this election.
                  </p>
                  <Button onClick={() => setShowNominationForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Submit Nomination
                  </Button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold mb-2">
                    {isNominationOpen ? 'Already Nominated' : 'Nominations Closed'}
                  </h3>
                  <p className="text-gray-600">
                    {isNominationOpen
                      ? 'You have already submitted a nomination for this election.'
                      : 'The nomination period for this election has ended.'
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Nomination Form */}
          {showNominationForm && (
            <Card>
              <CardHeader>
                <CardTitle>Submit Your Nomination</CardTitle>
                <CardDescription>
                  Tell the organization why you want to serve as a representative
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nomination-statement">Nomination Statement *</Label>
                  <Textarea
                    id="nomination-statement"
                    placeholder="Why do you want to serve as a representative? What experience or qualifications do you bring?"
                    value={nominationData.nominationStatement}
                    onChange={(e) => setNominationData(prev => ({ ...prev, nominationStatement: e.target.value }))}
                    rows={4}
                    required
                  />
                  <p className="text-sm text-gray-600">
                    This will be visible to all organization members voting in the election.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qualifications">Qualifications (Optional)</Label>
                  <Textarea
                    id="qualifications"
                    placeholder="List any relevant experience, skills, or background..."
                    value={nominationData.qualifications}
                    onChange={(e) => setNominationData(prev => ({ ...prev, qualifications: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experience">Relevant Experience (Optional)</Label>
                  <Textarea
                    id="experience"
                    placeholder="Describe any leadership, governance, or organizational experience..."
                    value={nominationData.experience}
                    onChange={(e) => setNominationData(prev => ({ ...prev, experience: e.target.value }))}
                    rows={3}
                  />
                </div>

                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Your nomination will be reviewed by current representatives before being approved.
                    You will be notified of the decision.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* All Candidates List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Vote className="h-5 w-5" />
                All Candidates ({candidates.length})
              </CardTitle>
              <CardDescription>
                Candidates nominated for {election.positionsAvailable} representative positions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : candidates.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No candidates have been nominated yet.</p>
                  <p className="text-sm">Be the first to submit your nomination!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {candidates.map((candidate) => (
                    <div key={candidate.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">
                              {candidate.user?.name || 'Unknown Candidate'}
                              {candidate.userId === currentUser.id && (
                                <span className="text-sm text-blue-600 ml-2">(You)</span>
                              )}
                            </div>
                            {getNominationStatusBadge(candidate.status)}
                          </div>
                          {candidate.nominationStatement && (
                            <div className="text-sm text-gray-600 mt-1 line-clamp-2">
                              {candidate.nominationStatement}
                            </div>
                          )}
                          <div className="flex gap-4 mt-2 text-xs text-gray-500">
                            <span>Nominated {new Date(candidate.nominatedAt).toLocaleDateString()}</span>
                            {candidate.status === 'approved' && (
                              <span className="text-green-600">Approved for election</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          {showNominationForm ? (
            <>
              <Button variant="outline" onClick={() => setShowNominationForm(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleNominationSubmit}
                disabled={submitting || !nominationData.nominationStatement.trim()}
              >
                {submitting ? 'Submitting...' : 'Submit Nomination'}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
