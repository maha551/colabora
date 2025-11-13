import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Progress } from './ui/progress';
import { ArrowLeft, Building, Users, Vote, Mail, Settings, FileText, Plus, BarChart3, Shield, TrendingUp, Clock, Activity, CheckSquare } from 'lucide-react';

import { Organization, User, Document, OrganizationGovernanceRules, RepresentativeElection, VotingAnalytics } from '../types';
import { RepresentativeManager } from './RepresentativeManager';
import { VotingInterface } from './VotingInterface';
import { EmailInviteSystem } from './EmailInviteSystem';
import { GovernanceRulesDialog } from './governance/GovernanceRulesDialog';
import { ElectionCreationDialog } from './governance/ElectionCreationDialog';
import { ElectionVotingInterface } from './governance/ElectionVotingInterface';
import { ElectionResults } from './governance/ElectionResults';
import { RuleProposalDialog } from './governance/RuleProposalDialog';
import { organizationsApi, governanceApi } from '../lib/api';
import { toast } from 'sonner';

interface OrganizationManagementProps {
  organization: Organization;
  currentUser: User;
  onBack: () => void;
  onCreateOrganizationalDocument?: (organizationId: string) => void;
}

export function OrganizationManagement({ organization, currentUser, onBack, onCreateOrganizationalDocument }: OrganizationManagementProps) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [orgDocuments, setOrgDocuments] = useState<Document[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

  // Governance state
  const [governanceRules, setGovernanceRules] = useState<OrganizationGovernanceRules | null>(null);
  const [elections, setElections] = useState<RepresentativeElection[]>([]);
  const [analytics, setAnalytics] = useState<VotingAnalytics | null>(null);
  const [loadingGovernance, setLoadingGovernance] = useState(false);
  const [loadingElections, setLoadingElections] = useState(false);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [policyVotes, setPolicyVotes] = useState<any[]>([]);
  const [loadingPolicyVotes, setLoadingPolicyVotes] = useState(false);

  // Dialog states
  const [showGovernanceRulesDialog, setShowGovernanceRulesDialog] = useState(false);
  const [showElectionCreationDialog, setShowElectionCreationDialog] = useState(false);
  const [selectedElection, setSelectedElection] = useState<RepresentativeElection | null>(null);
  const [showElectionVotingDialog, setShowElectionVotingDialog] = useState(false);
  const [showElectionResultsDialog, setShowElectionResultsDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showAuditDialog, setShowAuditDialog] = useState(false);
  const [showRuleProposalDialog, setShowRuleProposalDialog] = useState(false);

  const handleUpdate = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleGovernanceRulesSuccess = () => {
    loadGovernanceRules();
    setShowGovernanceRulesDialog(false);
  };

  const handleElectionCreationSuccess = () => {
    loadElections();
    setShowElectionCreationDialog(false);
  };

  const handleElectionVoteSuccess = () => {
    loadElections();
    setShowElectionVotingDialog(false);
  };

  const handleOpenElectionVoting = (election: RepresentativeElection) => {
    setSelectedElection(election);
    setShowElectionVotingDialog(true);
  };

  const loadOrganizationDocuments = async () => {
    setLoadingDocuments(true);
    try {
      const response = await organizationsApi.getOrganizationDocuments(organization.id);
      setOrgDocuments(response.documents || []);
    } catch (error) {
      console.error('Failed to load organization documents:', error);
      toast.error('Failed to load organization documents');
    } finally {
      setLoadingDocuments(false);
    }
  };

  const loadGovernanceRules = async () => {
    setLoadingGovernance(true);
    try {
      const response = await governanceApi.getGovernanceRules(organization.id);
      setGovernanceRules(response.governanceRules);
    } catch (error) {
      console.error('Failed to load governance rules:', error);
      // Governance rules might not exist yet, that's ok
      setGovernanceRules(null);
    } finally {
      setLoadingGovernance(false);
    }
  };

  const loadElections = async () => {
    setLoadingElections(true);
    try {
      const response = await governanceApi.getElections(organization.id);
      setElections(response.elections || []);
    } catch (error) {
      console.error('Failed to load elections:', error);
      setElections([]);
    } finally {
      setLoadingElections(false);
    }
  };

  const loadAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const response = await governanceApi.getVotingAnalytics(organization.id, 'month');
      setAnalytics(response.analytics);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      setAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const loadPolicyVotes = async () => {
    setLoadingPolicyVotes(true);
    try {
      const response = await governanceApi.policyVotesApi.getPolicyVotes(organization.id);
      setPolicyVotes(response.policyVotes || []);
    } catch (error) {
      console.error('Failed to load policy votes:', error);
      setPolicyVotes([]);
    } finally {
      setLoadingPolicyVotes(false);
    }
  };

  const handlePolicyVote = async (voteId: string) => {
    // Simple vote casting for now - in production this should open a proper voting dialog
    try {
      // For demonstration, we'll cast a random vote
      const voteOptions = ['yes', 'no', 'abstain'];
      const randomVote = voteOptions[Math.floor(Math.random() * voteOptions.length)];

      await governanceApi.policyVotesApi.voteOnPolicy(organization.id, voteId, randomVote);
      toast.success(`Vote cast: ${randomVote.toUpperCase()}`);
      loadPolicyVotes(); // Refresh the votes
    } catch (error: any) {
      if (error.message?.includes('already voted')) {
        toast.info('You have already voted on this policy');
      } else {
        toast.error('Failed to cast vote');
      }
    }
  };

  // Load data when tabs are selected
  useEffect(() => {
    if (activeTab === 'documents') {
      loadOrganizationDocuments();
      loadPolicyVotes();
    } else if (activeTab === 'governance') {
      loadGovernanceRules();
    } else if (activeTab === 'analytics') {
      loadAnalytics();
    }
  }, [activeTab, organization.id]);

  // Load elections data (needed for dashboard)
  useEffect(() => {
    loadElections();
  }, [organization.id]);

  // Check for expired representative terms and create elections if needed
  useEffect(() => {
    if (isRepresentative && governanceRules) {
      checkForExpiredTerms();
    }
  }, [isRepresentative, governanceRules, organization.representatives]);

  const checkForExpiredTerms = async () => {
    try {
      // This would typically be done server-side, but for now we'll do a basic check
      const now = new Date();
      const representativesWithExpiredTerms = organization.representatives?.filter(rep => {
        // In a real implementation, we'd check each representative's term end date
        // For now, we'll assume terms expire after the governance rule term length
        // This is a simplified implementation
        return false; // Skip automatic election creation for now
      });

      if (representativesWithExpiredTerms && representativesWithExpiredTerms.length > 0) {
        // Show notification that elections need to be created
        console.log(`${representativesWithExpiredTerms.length} representative terms have expired. Elections should be created.`);

        // In a real implementation, this would automatically create elections
        // For now, we'll just show a warning to representatives
      }
    } catch (error) {
      console.error('Error checking for expired terms:', error);
    }
  };

  const isRepresentative = organization.representatives?.includes(currentUser.id);
  const isActiveMember = organization.members?.some(m => m.userId === currentUser.id && m.status === 'active');

  const activeMembers = organization.members?.filter(m => m.status === 'active') || [];
  const legacyMembers = organization.members?.filter(m => m.status === 'legacy') || [];

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Organizations
        </Button>

        <div className="flex items-center gap-3">
          <Building className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">{organization.name}</h1>
            <p className="text-gray-600">{organization.description}</p>
          </div>
        </div>

        <div className="ml-auto flex gap-2">
          {isRepresentative && (
            <Badge variant="default" className="bg-purple-100 text-purple-800">
              Representative
            </Badge>
          )}
          {isActiveMember && (
            <Badge variant="default" className="bg-green-100 text-green-800">
              Active Member
            </Badge>
          )}
        </div>
      </div>

      {/* Organization Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{activeMembers.length}</div>
            <div className="text-sm text-gray-600">Active Members</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{organization.representatives?.length || 0}</div>
            <div className="text-sm text-gray-600">Representatives</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{legacyMembers.length}</div>
            <div className="text-sm text-gray-600">Legacy Members</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {Math.round(organization.votingThreshold * 100)}%
            </div>
            <div className="text-sm text-gray-600">Vote Threshold</div>
          </CardContent>
        </Card>
      </div>

      {/* Management Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="dashboard" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="governance" className="gap-2">
            <Shield className="h-4 w-4" />
            Governance
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab - Representative Overview with Election Integration */}
        <TabsContent value="dashboard" className="mt-6">
          <div className="space-y-6">
            {/* Current Representatives Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Current Representatives
                </CardTitle>
                <CardDescription>
                  Elected representatives who govern this organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex -space-x-2 mb-4">
                  {organization.representatives?.map((repId, index) => (
                    <Avatar key={repId} className="h-12 w-12 border-2 border-white">
                      <AvatarFallback className="text-sm">
                        R{index + 1}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span className="text-gray-600">Total Representatives:</span>
                    <span className="font-medium ml-2">{organization.representatives?.length || 0}</span>
                </div>
                <div>
                    <span className="text-gray-600">Next Election:</span>
                    <span className="font-medium ml-2">Dec 2024</span>
                </div>
                </div>
              </CardContent>
            </Card>

            {/* Election Due Warning */}
            {isRepresentative && governanceRules && (() => {
              // Simple check: if no recent elections, suggest creating one
              const recentElections = elections.filter(e =>
                new Date(e.createdAt || '').getTime() > Date.now() - (governanceRules.representativeTermMonths * 30 * 24 * 60 * 60 * 1000)
              );
              const needsElection = recentElections.length === 0;

              return needsElection && (
                <Card className="border-yellow-200 bg-gradient-to-r from-yellow-50 to-orange-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-orange-900">
                      <Clock className="h-5 w-5" />
                      Election Due
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-orange-800 mb-4">
                      It's time to hold a representative election. The last election was more than {governanceRules.representativeTermMonths} months ago.
                    </p>
                    <Button
                      className="bg-orange-600 hover:bg-orange-700"
                      onClick={() => setShowElectionCreationDialog(true)}
                    >
                      <Vote className="h-4 w-4 mr-2" />
                      Create Election
                    </Button>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Active Elections Overlay */}
            {elections.some(e => e.status === 'active') && (
              <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-yellow-50">
              <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-900">
                    <Vote className="h-5 w-5" />
                    Representative Election Active
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  {(() => {
                    const activeElection = elections.find(e => e.status === 'active');
                    if (!activeElection) return null;

                    return (
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-medium">{activeElection.electionTitle}</h3>
                          <p className="text-sm text-gray-600">{activeElection.electionDescription}</p>
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-lg font-bold">{activeElection.positionsAvailable}</div>
                            <div className="text-gray-600">Positions</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold">{activeElection.votesCast}/{activeElection.totalVoters}</div>
                            <div className="text-gray-600">Votes Cast</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold">{new Date(activeElection.votingEndsAt || '').toLocaleDateString()}</div>
                            <div className="text-gray-600">Ends</div>
                          </div>
                        </div>

                        {isActiveMember && (
                          <Button
                            className="w-full"
                            onClick={() => handleOpenElectionVoting(elections.find(e => e.status === 'active')!)}
                          >
                            Vote in Election
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Governance Health & Quick Actions */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Governance Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Representative Terms</span>
                    <Badge variant="default" className="bg-green-100 text-green-800">Healthy</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Decision Making</span>
                    <Badge variant="default" className="bg-blue-100 text-blue-800">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Member Participation</span>
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Monitor</Badge>
                    </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {isRepresentative && (
                    <>
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-2"
                        onClick={() => setShowGovernanceRulesDialog(true)}
                      >
                        <Shield className="h-4 w-4" />
                        Configure Governance Rules
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-2"
                        onClick={() => setShowElectionCreationDialog(true)}
                      >
                        <Vote className="h-4 w-4" />
                        Call Election
                      </Button>
                    </>
                  )}
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setActiveTab('analytics')}>
                    <TrendingUp className="h-4 w-4" />
                    View Participation Analytics
                  </Button>
              </CardContent>
            </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <div className="space-y-6">
            {/* Create Document Button (Representatives only) */}
            {isRepresentative && (
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Organization Documents</h3>
                  <p className="text-sm text-gray-600">
                    Documents owned by {organization.name}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    if (onCreateOrganizationalDocument) {
                      onCreateOrganizationalDocument(organization.id);
                    } else {
                      // Fallback: navigate to documents view
                      window.location.hash = '#/documents';
                      toast.success('Redirecting to document creation...');
                    }
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create Document
                </Button>
              </div>
            )}

            {/* Documents List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documents ({orgDocuments.length})
                </CardTitle>
                <CardDescription>
                  {isRepresentative
                    ? "All documents owned by this organization"
                    : "Documents owned by this organization that you have access to"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingDocuments ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-gray-600 mt-2">Loading documents...</p>
                  </div>
                ) : orgDocuments.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Organization Documents</h3>
                    <p className="text-gray-600 mb-4">
                      {isRepresentative
                        ? "This organization doesn't have any documents yet. Create the first one!"
                        : "This organization hasn't created any documents yet."
                      }
                    </p>
                    {isRepresentative && (
                      <Button variant="outline" className="gap-2">
                        <Plus className="h-4 w-4" />
                        Create First Document
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orgDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-blue-600" />
                            <div>
                              <h4 className="font-medium">{doc.title}</h4>
                              <p className="text-sm text-gray-600 line-clamp-2">
                                {doc.description || 'No description'}
                              </p>
                              <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                <span>Owner: {doc.owner?.name || doc.owner_name}</span>
                                <span>Created: {new Date(doc.createdAt).toLocaleDateString()}</span>
                                {doc.collaborators && doc.collaborators.length > 0 && (
                                  <span>{doc.collaborators.length} collaborator{doc.collaborators.length !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            Organizational
                          </Badge>
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Document Policy Votes Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CheckSquare className="h-5 w-5" />
                    Document Policy Votes
                  </span>
                  {isRepresentative && (
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Policy Vote
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>
                  Active votes on implementing policies from organization documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Get active policy votes from real data
                  const activePolicyVotes = policyVotes?.filter(v => v.status === 'active') || [];

                  return activePolicyVotes.length > 0 ? (
                    <div className="space-y-4">
                      {activePolicyVotes.map(vote => {
                        const totalVotes = (vote.votes_yes || 0) + (vote.votes_no || 0) + (vote.votes_abstain || 0);
                        const approvalPercentage = totalVotes > 0 ? ((vote.votes_yes || 0) / totalVotes) * 100 : 0;
                        const timeRemaining = vote.deadline_at ? Math.ceil((new Date(vote.deadline_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 7;
                        const meetsThreshold = approvalPercentage >= (vote.threshold_percentage || 50);

                        return (
                          <div key={vote.id} className="p-4 border rounded-lg">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h3 className="font-medium">{vote.title}</h3>
                                {vote.description && (
                                  <p className="text-sm text-gray-600 mt-1">{vote.description}</p>
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                  {vote.document_id && (
                                    <Badge variant="outline" className="text-xs">
                                      📄 Document Policy
                                    </Badge>
                                  )}
                                  <Badge variant="secondary" className="text-xs">
                                    ⏰ {timeRemaining > 0 ? `${timeRemaining} days left` : 'Ended'}
                                  </Badge>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-bold">
                                  {Math.round(approvalPercentage)}%
                                </div>
                                <div className="text-xs text-gray-600">
                                  {vote.votes_yes || 0}/{totalVotes} approve
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span>Approval Progress</span>
                                <span>{Math.round(approvalPercentage)}% of {totalVotes} votes</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${meetsThreshold ? 'bg-green-500' : 'bg-blue-500'}`}
                                  style={{ width: `${Math.min(approvalPercentage, 100)}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-xs text-gray-600">
                                <span>Threshold: {vote.threshold_percentage || 50}%</span>
                                <span className={meetsThreshold ? 'text-green-600' : 'text-red-600'}>
                                  {meetsThreshold ? '✓ Meets threshold' : '✗ Below threshold'}
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-2 mt-4">
                              {vote.document_id && (
                                <Button size="sm" variant="outline">
                                  View Document
                                </Button>
                              )}
                              {isActiveMember && timeRemaining > 0 && (
                                <Button
                                  size="sm"
                                  onClick={() => handlePolicyVote(vote.id)}
                                >
                                  Vote Now
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <CheckSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No active policy votes</p>
                      <p className="text-sm">Policy implementation votes will appear here when representatives create them</p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Governance Tab - Internal Rules Management */}
        <TabsContent value="governance" className="mt-6">
          <div className="space-y-6">
            {/* Current Rules Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Organizational Rules
                  {isRepresentative && (
                    <Button variant="outline" size="sm" onClick={() => setShowRuleProposalDialog(true)}>
                      <Settings className="h-4 w-4 mr-2" />
                      Propose Rule Change
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>
                  Internal governance rules for organization operations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingGovernance ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : governanceRules ? (
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                      <h4 className="font-medium text-gray-900">Representative Governance</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Term Length:</span>
                          <span className="font-medium">{governanceRules.representativeTermMonths} months</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Election Method:</span>
                          <span className="font-medium">{governanceRules.electionVotingMethod.replace('_', ' ')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Election Quorum:</span>
                          <span className="font-medium">{Math.round(governanceRules.electionQuorumPercentage * 100)}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium text-gray-900">Decision Making</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Anonymous Voting:</span>
                          <Badge variant={governanceRules.anonymousVotingEnabled ? 'default' : 'secondary'}>
                            {governanceRules.anonymousVotingEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Default Quorum:</span>
                          <span className="font-medium">{Math.round(governanceRules.defaultQuorumPercentage * 100)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Approval Required:</span>
                          <Badge variant={governanceRules.representativeApprovalRequired ? 'default' : 'secondary'}>
                            {governanceRules.representativeApprovalRequired ? 'Required' : 'Not Required'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Governance rules not yet configured</p>
                    <p className="text-sm">Representatives can set up governance rules</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Governance Votes */}
            <Card>
              <CardHeader>
                <CardTitle>Active Governance Votes</CardTitle>
                <CardDescription>Votes on organizational rules and structure changes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <Vote className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No active governance votes</p>
                  <p className="text-sm">Organizational rules are stable</p>
                  {isRepresentative && (
                    <Button className="mt-4" variant="outline">
                      Propose Rule Change
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Elections History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Vote className="h-5 w-5" />
                  Election History
                </CardTitle>
                <CardDescription>
                  Past and current representative elections
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingElections ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : elections.length > 0 ? (
                  <div className="space-y-3">
                    {elections.slice(0, 5).map(election => (
                      <div key={election.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{election.electionTitle}</div>
                            <Badge
                              variant={
                                election.status === 'completed' ? 'default' :
                                election.status === 'active' ? 'destructive' :
                                'secondary'
                              }
                              className="text-xs"
                            >
                              {election.status}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {election.positionsAvailable} positions • {new Date(election.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {(election.status === 'active' || election.status === 'completed') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedElection(election);
                                setShowElectionResultsDialog(true);
                              }}
                            >
                              View Results
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Vote className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No elections held yet</p>
                    <p className="text-sm">Elections will appear here once created</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Rule Change Proposals */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Rule Change Proposals
                  </span>
                  {isRepresentative && (
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Propose Change
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>
                  Propose and vote on changes to organization governance rules
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <Settings className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No rule change proposals</p>
                  <p className="text-sm">Organization rules are current</p>
                </div>
              </CardContent>
            </Card>

            {/* Governance Audit Logs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Governance Audit Log
                  </span>
                  {isRepresentative && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAuditDialog(true)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Logs
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>
                  Complete audit trail of all governance activities and decisions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Governance audit logs available to representatives</p>
                  <p className="text-sm">Track all election, voting, and rule change activities</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Members Tab - People Management */}
        <TabsContent value="members" className="mt-6">
          <div className="space-y-6">
            {/* Member Statistics */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{activeMembers.length}</div>
                  <div className="text-sm text-gray-600">Active Members</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">{organization.representatives?.length || 0}</div>
                  <div className="text-sm text-gray-600">Representatives</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-600">{legacyMembers.length}</div>
                  <div className="text-sm text-gray-600">Legacy Members</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{Math.round(organization.votingThreshold * 100)}%</div>
                  <div className="text-sm text-gray-600">Vote Threshold</div>
                </CardContent>
              </Card>
            </div>

            {/* Member List and Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Organization Members
                  {isRepresentative && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowInviteDialog(true)}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Invite Members
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>
                  Manage organization membership and roles
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {activeMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            {member.user.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{member.user.name}</div>
                          <div className="text-sm text-gray-500">
                            Joined {new Date(member.joinedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {organization.representatives?.includes(member.userId) && (
                          <Badge variant="default" className="bg-purple-100 text-purple-800">
                            Representative
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          Active
                        </Badge>
                      </div>
                    </div>
                  ))}

                  {legacyMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg opacity-60">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            {member.user.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{member.user.name}</div>
                          <div className="text-sm text-gray-500">
                            Legacy member
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Legacy
                      </Badge>
                    </div>
                  ))}

                  {activeMembers.length === 0 && legacyMembers.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No members yet</p>
                      <p className="text-sm">Invite members to get started</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Representative Management */}
            {isRepresentative && (
              <Card>
                <CardHeader>
                  <CardTitle>Representative Management</CardTitle>
                  <CardDescription>
                    Manage representative roles and assignments
                  </CardDescription>
                </CardHeader>
                <CardContent>
          <RepresentativeManager
            organization={organization}
            currentUser={currentUser}
            onUpdate={handleUpdate}
          />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Analytics Tab - Governance Analytics */}
        <TabsContent value="analytics" className="mt-6">
          <div className="space-y-6">
            {/* Analytics Controls */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Governance Analytics</h2>
                <p className="text-gray-600">Track participation, decisions, and organizational health</p>
              </div>
              <Button variant="outline" size="sm">
                Last 30 Days
              </Button>
            </div>

            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Participation Rate</p>
                      <p className="text-2xl font-bold text-green-600">
                        {analytics ? `${Math.round(analytics.participationRate || 0)}%` : '--'}
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-green-600" />
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Member voting participation across all elections
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Elections Held</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {analytics ? analytics.totalElections || 0 : elections.length}
                      </p>
                    </div>
                    <Vote className="h-8 w-8 text-blue-600" />
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                        Representative elections completed
                      </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Governance Votes</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {analytics ? analytics.totalDecisions || 0 : '--'}
                      </p>
                    </div>
                    <CheckSquare className="h-8 w-8 text-purple-600" />
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                        Governance decisions and rule changes
                      </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Active Members</p>
                      <p className="text-2xl font-bold text-orange-600">
                        {activeMembers.length}
                      </p>
                    </div>
                    <Users className="h-8 w-8 text-orange-600" />
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                        Currently active organization members
                      </p>
                </CardContent>
              </Card>
            </div>

            {/* Participation Trends Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Participation Trends</CardTitle>
                <CardDescription>Member voting participation over time</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingAnalytics ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
                    <div className="text-center">
                      <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600">Participation chart will be implemented here</p>
                      <p className="text-sm text-gray-500">Showing voting activity trends</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Governance Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Governance Activity</CardTitle>
                <CardDescription>Latest governance decisions and elections</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Sample activity items - replace with real data */}
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                    <Vote className="h-4 w-4 text-green-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Representative Election Completed</p>
                      <p className="text-xs text-gray-600">3 new representatives elected • 2 days ago</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                    <Shield className="h-4 w-4 text-blue-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Governance Rule Updated</p>
                      <p className="text-xs text-gray-600">Anonymous voting enabled • 1 week ago</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                    <CheckSquare className="h-4 w-4 text-purple-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Policy Vote Passed</p>
                      <p className="text-xs text-gray-600">85% approval on new budget policy • 2 weeks ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

      </Tabs>

      {/* Governance Dialogs */}
      <GovernanceRulesDialog
        organization={organization}
        currentUser={currentUser}
        open={showGovernanceRulesDialog}
        onOpenChange={setShowGovernanceRulesDialog}
        onSuccess={handleGovernanceRulesSuccess}
      />

      <ElectionCreationDialog
            organization={organization}
            currentUser={currentUser}
        open={showElectionCreationDialog}
        onOpenChange={setShowElectionCreationDialog}
          onSuccess={() => {
            handleElectionCreationSuccess();
            // Refresh organization data to reflect any changes
            setRefreshKey(prev => prev + 1);
          }}
          />

      {selectedElection && (
        <ElectionVotingInterface
          organization={organization}
          election={selectedElection}
          currentUser={currentUser}
          open={showElectionVotingDialog}
          onOpenChange={setShowElectionVotingDialog}
          onSuccess={handleElectionVoteSuccess}
        />
      )}

      {selectedElection && (
        <ElectionResults
          organization={organization}
          election={selectedElection}
          currentUser={currentUser}
          open={showElectionResultsDialog}
          onOpenChange={setShowElectionResultsDialog}
          onSuccess={() => {
            setShowElectionResultsDialog(false);
            // Refresh organization data to reflect new representatives
            setRefreshKey(prev => prev + 1);
          }}
        />
      )}

      {showInviteDialog && (
          <EmailInviteSystem
            organization={organization}
            currentUser={currentUser}
          open={showInviteDialog}
          onOpenChange={setShowInviteDialog}
          onSuccess={() => {
            setShowInviteDialog(false);
            // Refresh member list if needed
            handleUpdate();
          }}
        />
      )}

      <RuleProposalDialog
        organization={organization}
        currentUser={currentUser}
        open={showRuleProposalDialog}
        onOpenChange={setShowRuleProposalDialog}
        onSuccess={() => {
          setShowRuleProposalDialog(false);
          // Refresh governance data if needed
          handleUpdate();
        }}
      />
    </div>
  );
}
