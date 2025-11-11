import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { ArrowLeft, Building, Users, Vote, Mail, Settings } from 'lucide-react';

import { Organization, User } from '../types';
import { RepresentativeManager } from './RepresentativeManager';
import { VotingInterface } from './VotingInterface';
import { EmailInviteSystem } from './EmailInviteSystem';

interface OrganizationManagementProps {
  organization: Organization;
  currentUser: User;
  onBack: () => void;
}

export function OrganizationManagement({ organization, currentUser, onBack }: OrganizationManagementProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUpdate = () => {
    setRefreshKey(prev => prev + 1);
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="gap-2">
            <Building className="h-4 w-4" />
            Overview
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
