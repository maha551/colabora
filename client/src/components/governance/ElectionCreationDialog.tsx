import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { Calendar, Vote, Users, Clock, AlertTriangle, Info } from 'lucide-react';
import { Organization, OrganizationGovernanceRules, User } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';

interface ElectionCreationDialogProps {
  organization: Organization;
  currentUser: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ElectionCreationDialog({
  organization,
  currentUser,
  open,
  onOpenChange,
  onSuccess
}: ElectionCreationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [governanceRules, setGovernanceRules] = useState<OrganizationGovernanceRules | null>(null);

  const [electionData, setElectionData] = useState({
    title: '',
    description: '',
    positionsAvailable: 1,
    termMonths: 12,
    votingStartDate: '',
    votingEndDate: '',
    nominationDeadline: ''
  });

  useEffect(() => {
    if (open) {
      loadGovernanceRules();
      initializeElectionData();
    }
  }, [open, organization.id]);

  const loadGovernanceRules = async () => {
    try {
      const response = await governanceApi.getGovernanceRules(organization.id);
      setGovernanceRules(response.governanceRules);
    } catch (error) {
      console.error('Failed to load governance rules:', error);
    }
  };

  const initializeElectionData = () => {
    const now = new Date();
    const noticeDays = governanceRules?.electionNoticeDays || 14;
    const votingStartDate = new Date(now.getTime() + noticeDays * 24 * 60 * 60 * 1000);
    const votingEndDate = new Date(votingStartDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days voting
    const nominationDeadline = new Date(votingStartDate.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days before voting

    setElectionData({
      title: `Representative Election - ${new Date().getFullYear()}`,
      description: `Election for ${organization.representatives?.length || 0} representative positions in ${organization.name}`,
      positionsAvailable: organization.representatives?.length || 1,
      termMonths: governanceRules?.representativeTermMonths || 12,
      votingStartDate: votingStartDate.toISOString().split('T')[0],
      votingEndDate: votingEndDate.toISOString().split('T')[0],
      nominationDeadline: nominationDeadline.toISOString().split('T')[0]
    });
  };

  const handleInputChange = (field: string, value: any) => {
    setElectionData(prev => ({ ...prev, [field]: value }));
  };

  const validateElectionData = () => {
    const errors = [];

    if (!electionData.title.trim()) errors.push('Election title is required');
    if (!electionData.description.trim()) errors.push('Election description is required');
    if (electionData.positionsAvailable < 1) errors.push('At least 1 position must be available');
    if (electionData.termMonths < 1) errors.push('Term must be at least 1 month');

    const now = new Date();
    const votingStart = new Date(electionData.votingStartDate);
    const votingEnd = new Date(electionData.votingEndDate);
    const nominationDeadline = new Date(electionData.nominationDeadline);

    if (votingStart <= now) errors.push('Voting start date must be in the future');
    if (votingEnd <= votingStart) errors.push('Voting end date must be after start date');
    if (nominationDeadline >= votingStart) errors.push('Nomination deadline must be before voting starts');

    return errors;
  };

  const handleCreateElection = async () => {
    const errors = validateElectionData();
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    setCreating(true);
    try {
      const response = await governanceApi.createElection(organization.id, {
        title: electionData.title,
        description: electionData.description,
        positionsAvailable: electionData.positionsAvailable,
        termMonths: electionData.termMonths
      });

      // Start the election
      await governanceApi.startElection(
        organization.id,
        response.election.id,
        {
          votingStartDate: electionData.votingStartDate,
          votingEndDate: electionData.votingEndDate
        }
      );

      toast.success('Election created and started successfully');
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create election:', error);
      toast.error('Failed to create election');
    } finally {
      setCreating(false);
    }
  };

  const isRepresentative = organization.representatives?.includes(currentUser.id);

  if (!isRepresentative) {
    return null; // Only representatives can access this dialog
  }

  const noticeDays = governanceRules?.electionNoticeDays || 14;
  const minStartDate = new Date(Date.now() + noticeDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5" />
            Create Representative Election
          </DialogTitle>
          <DialogDescription>
            Call a democratic election for representative positions in {organization.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Election Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Election Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Election Title</Label>
                <Input
                  id="title"
                  value={electionData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="e.g., Representative Election - 2024"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={electionData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Describe the purpose and context of this election"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="positions">Positions Available</Label>
                  <Input
                    id="positions"
                    type="number"
                    min="1"
                    max="20"
                    value={electionData.positionsAvailable}
                    onChange={(e) => handleInputChange('positionsAvailable', parseInt(e.target.value))}
                  />
                  <p className="text-sm text-gray-600">
                    Number of representatives to elect
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="term">Term Length (Months)</Label>
                  <Input
                    id="term"
                    type="number"
                    min="1"
                    max="60"
                    value={electionData.termMonths}
                    onChange={(e) => handleInputChange('termMonths', parseInt(e.target.value))}
                  />
                  <p className="text-sm text-gray-600">
                    How long winners will serve
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Election Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Election Timeline
              </CardTitle>
              <CardDescription>
                Set the schedule for nominations and voting
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Elections must be announced at least {noticeDays} days in advance according to governance rules.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nomination-deadline">Nomination Deadline</Label>
                  <Input
                    id="nomination-deadline"
                    type="date"
                    value={electionData.nominationDeadline}
                    onChange={(e) => handleInputChange('nominationDeadline', e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    max={electionData.votingStartDate}
                  />
                  <p className="text-sm text-gray-600">
                    Last day for candidates to nominate themselves
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="voting-start">Voting Starts</Label>
                    <Input
                      id="voting-start"
                      type="date"
                      value={electionData.votingStartDate}
                      onChange={(e) => handleInputChange('votingStartDate', e.target.value)}
                      min={minStartDate}
                    />
                    <p className="text-sm text-gray-600">
                      When voting opens to members
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="voting-end">Voting Ends</Label>
                    <Input
                      id="voting-end"
                      type="date"
                      value={electionData.votingEndDate}
                      onChange={(e) => handleInputChange('votingEndDate', e.target.value)}
                      min={electionData.votingStartDate}
                    />
                    <p className="text-sm text-gray-600">
                      When voting closes
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Election Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Election Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Organization:</span>
                  <p className="text-gray-600">{organization.name}</p>
                </div>
                <div>
                  <span className="font-medium">Positions:</span>
                  <p className="text-gray-600">{electionData.positionsAvailable}</p>
                </div>
                <div>
                  <span className="font-medium">Voting Method:</span>
                  <p className="text-gray-600">{governanceRules?.electionVotingMethod?.replace('_', ' ') || 'Simple majority'}</p>
                </div>
                <div>
                  <span className="font-medium">Quorum Required:</span>
                  <p className="text-gray-600">{Math.round((governanceRules?.electionQuorumPercentage || 0.5) * 100)}%</p>
                </div>
                <div>
                  <span className="font-medium">Anonymous Voting:</span>
                  <p className="text-gray-600">{governanceRules?.anonymousVotingEnabled ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <span className="font-medium">Term Length:</span>
                  <p className="text-gray-600">{electionData.termMonths} months</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateElection}
            disabled={creating}
            className="gap-2"
          >
            <Vote className="h-4 w-4" />
            {creating ? 'Creating Election...' : 'Create Election'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
