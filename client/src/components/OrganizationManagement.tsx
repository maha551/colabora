import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { ArrowLeft, Building, Users, Vote, Mail, Settings, FileText, Plus } from 'lucide-react';

import { Organization, User, Document } from '../types';
import { RepresentativeManager } from './RepresentativeManager';
import { VotingInterface } from './VotingInterface';
import { EmailInviteSystem } from './EmailInviteSystem';
import { organizationsApi } from '../lib/api';
import { toast } from 'sonner';

interface OrganizationManagementProps {
  organization: Organization;
  currentUser: User;
  onBack: () => void;
  onCreateOrganizationalDocument?: (organizationId: string) => void;
}

export function OrganizationManagement({ organization, currentUser, onBack, onCreateOrganizationalDocument }: OrganizationManagementProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshKey, setRefreshKey] = useState(0);
  const [orgDocuments, setOrgDocuments] = useState<Document[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

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

  // Load documents when documents tab is selected
  useEffect(() => {
    if (activeTab === 'documents') {
      loadOrganizationDocuments();
    }
  }, [activeTab, organization.id]);

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
          <TabsTrigger value="overview" className="gap-2">
            <Building className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="representatives" className="gap-2">
            <Users className="h-4 w-4" />
            Representatives
          </TabsTrigger>
          <TabsTrigger value="voting" className="gap-2">
            <Vote className="h-4 w-4" />
            Voting
          </TabsTrigger>
          <TabsTrigger value="invitations" className="gap-2">
            <Mail className="h-4 w-4" />
            Invitations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Organization Details */}
            <Card>
              <CardHeader>
                <CardTitle>Organization Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Name</label>
                  <p className="text-gray-900">{organization.name}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Description</label>
                  <p className="text-gray-900">{organization.description || 'No description provided'}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Membership Policy</label>
                  <Badge variant={organization.membershipPolicy === 'open' ? 'default' : 'secondary'}>
                    {organization.membershipPolicy === 'open' ? 'Open' : 'Invitation Only'}
                  </Badge>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Voting Threshold</label>
                  <p className="text-gray-900">{Math.round(organization.votingThreshold * 100)}%</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <Badge variant={organization.isActive ? 'default' : 'destructive'}>
                    {organization.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Recent Members */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Members</CardTitle>
                <CardDescription>Latest additions to the organization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {activeMembers.slice(0, 5).map((member) => (
                    <div key={member.id} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {member.user.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="font-medium">{member.user.name}</div>
                        <div className="text-sm text-gray-500">
                          Joined {new Date(member.joinedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        Active
                      </Badge>
                    </div>
                  ))}

                  {activeMembers.length === 0 && (
                    <p className="text-gray-500 text-center py-4">No active members yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
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

        <TabsContent value="representatives" className="mt-6">
          <RepresentativeManager
            organization={organization}
            currentUser={currentUser}
            onUpdate={handleUpdate}
          />
        </TabsContent>

        <TabsContent value="voting" className="mt-6">
          <VotingInterface
            organization={organization}
            currentUser={currentUser}
            onUpdate={handleUpdate}
          />
        </TabsContent>

        <TabsContent value="invitations" className="mt-6">
          <EmailInviteSystem
            organization={organization}
            currentUser={currentUser}
            onUpdate={handleUpdate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
