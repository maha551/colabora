import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Avatar, AvatarFallback } from '../../ui/avatar';
import { Users, Mail } from 'lucide-react';
import { Organization, User } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { RepresentativeManager } from '../../RepresentativeManager';
import { EmailInviteSystem } from '../../EmailInviteSystem';

interface MembersTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  onUpdate: () => void;
}

export function MembersTab({
  organization,
  currentUser,
  permissions,
  onUpdate,
}: MembersTabProps) {
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const activeMembers = organization.members?.filter(m => m.status === 'active') || [];
  const legacyMembers = organization.members?.filter(m => m.status === 'legacy') || [];

  return (
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
            {permissions.canInviteMembers && (
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
      {permissions.isRepresentative && (
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
              onUpdate={onUpdate}
            />
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      {showInviteDialog && (
        <EmailInviteSystem
          organization={organization}
          onSuccess={() => {
            setShowInviteDialog(false);
            onUpdate();
          }}
          onCancel={() => setShowInviteDialog(false)}
        />
      )}
    </div>
  );
}
