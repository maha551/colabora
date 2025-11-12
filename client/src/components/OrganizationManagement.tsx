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

  const handleUpdate = () => {
    setRefreshKey(prev => prev + 1);
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

  // Load data when tabs are selected
  useEffect(() => {
    if (activeTab === 'documents') {
      loadOrganizationDocuments();
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
                          <Button className="w-full">
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
                      <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setActiveTab('governance')}>
                        <Shield className="h-4 w-4" />
                        Configure Governance Rules
                      </Button>
                      <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setActiveTab('documents')}>
                        <Plus className="h-4 w-4" />
                        Create Organization Document
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
                    <Button variant="outline" size="sm" onClick={() => {/* TODO: Open rules dialog */}}>
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

            {/* Rule Change Proposals */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Rule Change Proposals
                  {isRepresentative && (
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Propose Change
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No rule change proposals</p>
                  <p className="text-sm">Organization rules are current</p>
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
                    <Button variant="outline" size="sm">
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
                    Member voting participation
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Elections Held</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {analytics ? analytics.totalElections || 0 : 0}
                      </p>
                    </div>
                    <Vote className="h-8 w-8 text-blue-600" />
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                        Representative selections
                      </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Decisions Made</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {analytics ? analytics.totalDecisions || 0 : 0}
                      </p>
                    </div>
                    <CheckSquare className="h-8 w-8 text-purple-600" />
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                        Governance votes completed
                      </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Avg Decision Time</p>
                      <p className="text-2xl font-bold text-orange-600">
                        {analytics ? `${analytics.averageDecisionTimeHours || 0}h` : '--'}
                      </p>
                    </div>
                    <Clock className="h-8 w-8 text-orange-600" />
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                        From proposal to completion
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
    </div>
  );
}
