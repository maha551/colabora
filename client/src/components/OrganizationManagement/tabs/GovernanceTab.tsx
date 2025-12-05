import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Shield, Settings, Vote, Users, Plus, Palette, Clock, Users as UsersIcon, Play, UserCheck, CheckCircle, XCircle } from 'lucide-react';
import { Organization, User, OrganizationGovernanceRules, RepresentativeElection, ElectionCandidate } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { GovernanceRulesDialog } from '../../governance/GovernanceRulesDialog';
import { GovernanceRulesVotingInterface } from '../../governance/GovernanceRulesVotingInterface';
import { ElectionCreationDialog } from '../../governance/ElectionCreationDialog';
import { RepresentativeManager } from '../../RepresentativeManager';
import { OrganizationBrandingDialog } from '../OrganizationBrandingDialog';
import { governanceApi } from '../../../lib/api';
import { toast } from 'sonner';
import { Badge } from '../../ui/badge';
import { Alert, AlertDescription } from '../../ui/alert';

interface GovernanceTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  governanceRules: OrganizationGovernanceRules | null;
  elections: RepresentativeElection[];
  onRefreshGovernance: () => Promise<void>;
  onRefreshElections: () => Promise<void>;
  onCreateElection: (electionData: any) => Promise<void>;
  governanceRefreshTrigger?: number;
}

export function GovernanceTab({
  organization,
  currentUser,
  permissions,
  governanceRules,
  elections,
  onRefreshGovernance,
  onRefreshElections,
  onCreateElection,
  governanceRefreshTrigger,
}: GovernanceTabProps) {
  const [showGovernanceRulesDialog, setShowGovernanceRulesDialog] = useState(false);
  const [showGovernanceRulesVoting, setShowGovernanceRulesVoting] = useState(false);
  const [showElectionCreationDialog, setShowElectionCreationDialog] = useState(false);
  const [showBrandingDialog, setShowBrandingDialog] = useState(false);

  const handleGovernanceRulesSuccess = async () => {
    await onRefreshGovernance();
    setShowGovernanceRulesDialog(false);
  };

  const handleElectionCreationSuccess = async () => {
    await onRefreshElections();
    setShowElectionCreationDialog(false);
  };

  const handleUpdateElectionPhase = async (electionId: string, newPhase: 'nomination' | 'voting') => {
    try {
      await governanceApi.updateElectionPhase(organization.id, electionId, newPhase);
      toast.success(`Election moved to ${newPhase} phase`);
      await onRefreshElections();
    } catch (error: any) {
      console.error('Failed to update election phase:', error);
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update election phase';
      toast.error(errorMessage);
    }
  };

  const getElectionStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      case 'announced':
      case 'nomination':
        return <Badge className="bg-blue-100 text-blue-800">Nomination Open</Badge>;
      case 'active':
      case 'voting':
        return <Badge className="bg-green-100 text-green-800">Voting Open</Badge>;
      case 'completed':
        return <Badge className="bg-gray-100 text-gray-800">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const isRepresentative = organization.representatives?.includes(currentUser.id);

  if (showGovernanceRulesVoting) {
    return (
      <GovernanceRulesVotingInterface
        organization={organization}
        currentUser={currentUser}
        onClose={() => setShowGovernanceRulesVoting(false)}
        refreshTrigger={governanceRefreshTrigger}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Governance</h2>
          <p className="text-gray-600">Manage representatives and governance rules</p>
        </div>
        {permissions.canCreateElections && (
          <Button onClick={() => setShowElectionCreationDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Election
          </Button>
        )}
      </div>

      {/* Representative Profiles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Representatives
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RepresentativeManager
            organization={organization}
            currentUser={currentUser}
            onUpdate={onRefreshGovernance}
          />
        </CardContent>
      </Card>

      {/* Governance Rules */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Governance Rules
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGovernanceRulesVoting(true)}
              >
                <Shield className="h-4 w-4 mr-2" />
                View Rules
              </Button>
              {permissions.canManageGovernanceRules && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGovernanceRulesDialog(true)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Propose Change
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {governanceRules ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Vote Threshold:</span>
                <span className="font-medium">{Math.round((governanceRules.voteThreshold || 0.5) * 100)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Quorum:</span>
                <span className="font-medium">{Math.round((governanceRules.defaultQuorumPercentage || 0.3) * 100)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Representative Term:</span>
                <span className="font-medium">{governanceRules.representativeTermMonths || 'N/A'} months</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Minimum Voting Period:</span>
                <span className="font-medium">{governanceRules.minimumVotingPeriodHours || 'N/A'} hours</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No governance rules configured yet</p>
          )}
        </CardContent>
      </Card>

      {/* Elections */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Vote className="h-5 w-5" />
              Representative Elections
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {elections.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Vote className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No elections yet</p>
              {permissions.canCreateElections && (
                <p className="text-sm mt-2">Create an election to select new representatives</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {elections.map((election) => {
                const isDraft = election.status === 'draft';
                const isNomination = election.status === 'announced' || election.status === 'nomination';
                const isVoting = election.status === 'active' || election.status === 'voting';
                const isCompleted = election.status === 'completed';
                const canManagePhase = isRepresentative && !isCompleted;

                return (
                  <div key={election.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{election.electionTitle}</h4>
                          {getElectionStatusBadge(election.status)}
                        </div>
                        {election.electionDescription && (
                          <p className="text-sm text-gray-600 mb-2">{election.electionDescription}</p>
                        )}
                        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <UsersIcon className="h-4 w-4" />
                            {election.positionsAvailable} position{election.positionsAvailable !== 1 ? 's' : ''}
                          </span>
                          {election.votingStartsAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              Voting: {new Date(election.votingStartsAt).toLocaleDateString()}
                            </span>
                          )}
                          {isVoting && election.votesCast > 0 && (
                            <span>
                              {election.votesCast} of {election.totalVoters} votes cast
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Phase Management Actions (Representatives Only) */}
                    {canManagePhase && (
                      <div className="flex gap-2 pt-2 border-t">
                        {isDraft && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleUpdateElectionPhase(election.id, 'nomination')}
                            className="gap-2"
                          >
                            <Play className="h-4 w-4" />
                            Start Nomination Period
                          </Button>
                        )}
                        {isNomination && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleUpdateElectionPhase(election.id, 'voting')}
                            className="gap-2"
                          >
                            <Play className="h-4 w-4" />
                            Close Nominations & Start Voting
                          </Button>
                        )}
                        {isVoting && (
                          <Alert>
                            <Clock className="h-4 w-4" />
                            <AlertDescription>
                              Voting is in progress. Use the complete election action to finalize results.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}

                    {/* Nominees Overview (Especially important during nomination phase) */}
                    {(isDraft || isNomination || isVoting) && election.candidates && election.candidates.length > 0 && (
                      <div className="pt-3 border-t">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-medium text-sm flex items-center gap-2">
                            <UserCheck className="h-4 w-4" />
                            Nominees ({election.candidates.length})
                          </h5>
                          {isNomination && (
                            <span className="text-xs text-gray-500">
                              {election.candidates.filter(c => c.acceptedNomination).length} accepted, {election.candidates.filter(c => !c.acceptedNomination).length} pending
                            </span>
                          )}
                          {isVoting && (
                            <span className="text-xs text-gray-500">
                              {election.positionsAvailable} position{election.positionsAvailable !== 1 ? 's' : ''} available
                            </span>
                          )}
                        </div>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {election.candidates.map((candidate) => (
                            <div
                              key={candidate.id}
                              className="flex items-start justify-between p-3 bg-gray-50 rounded border text-sm hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium truncate">
                                    {candidate.user?.name || 'Unknown User'}
                                  </span>
                                  {candidate.acceptedNomination ? (
                                    <Badge variant="default" className="text-xs bg-green-100 text-green-800 flex-shrink-0">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Accepted
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs flex-shrink-0">
                                      <Clock className="h-3 w-3 mr-1" />
                                      Pending Acceptance
                                    </Badge>
                                  )}
                                  {isVoting && candidate.votesReceived > 0 && (
                                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                                      {candidate.votesReceived} vote{candidate.votesReceived !== 1 ? 's' : ''}
                                    </Badge>
                                  )}
                                </div>
                                {candidate.candidateStatement && (
                                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                    {candidate.candidateStatement}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                                  {candidate.nominatedByName && (
                                    <span>Nominated by {candidate.nominatedByName}</span>
                                  )}
                                  {candidate.createdAt && (
                                    <span>• {new Date(candidate.createdAt).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No Nominees Message */}
                    {(isDraft || isNomination) && (!election.candidates || election.candidates.length === 0) && (
                      <div className="pt-3 border-t">
                        <p className="text-sm text-gray-500 text-center py-2">
                          No nominees yet. {isNomination ? 'Members can nominate candidates during the nomination period.' : 'Start the nomination period to allow candidates to nominate themselves.'}
                        </p>
                      </div>
                    )}

                    {/* Status Messages */}
                    {isDraft && (
                      <Alert>
                        <AlertDescription>
                          Election is in draft. Start the nomination period to allow candidates to nominate themselves.
                        </AlertDescription>
                      </Alert>
                    )}
                    {isNomination && (
                      <Alert>
                        <AlertDescription>
                          Nomination period is open. Members can nominate candidates until voting begins.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Organization Branding */}
      {permissions.canManageOrganization && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Organization Branding
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBrandingDialog(true)}
              >
                <Palette className="h-4 w-4 mr-2" />
                Customize
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Header Color:</span>
                <span className="font-medium">
                  <span
                    className="inline-block w-4 h-4 rounded border border-gray-300 mr-2"
                    style={{ backgroundColor: organization.brandingColor || '#3B82F6' }}
                  />
                  {organization.brandingColor || 'Default (#3B82F6)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Logo:</span>
                <span className="font-medium">
                  {organization.brandingLogoUrl ? 'Set' : 'Not set'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Custom Title:</span>
                <span className="font-medium">
                  {organization.brandingTitle || 'Using organization name'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      {showGovernanceRulesDialog && (
        <GovernanceRulesDialog
          organization={organization}
          currentUser={currentUser}
          open={showGovernanceRulesDialog}
          onOpenChange={setShowGovernanceRulesDialog}
          onSuccess={handleGovernanceRulesSuccess}
        />
      )}

      {showElectionCreationDialog && (
        <ElectionCreationDialog
          organization={organization}
          currentUser={currentUser}
          open={showElectionCreationDialog}
          onOpenChange={setShowElectionCreationDialog}
          onSuccess={handleElectionCreationSuccess}
        />
      )}

      {showBrandingDialog && (
        <OrganizationBrandingDialog
          organization={organization}
          currentUser={currentUser}
          open={showBrandingDialog}
          onOpenChange={setShowBrandingDialog}
          onSuccess={async () => {
            // Refresh organization data
            await onRefreshGovernance();
            setShowBrandingDialog(false);
          }}
        />
      )}
    </div>
  );
}
