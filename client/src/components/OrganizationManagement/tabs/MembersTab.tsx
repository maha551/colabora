import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Users, Mail } from 'lucide-react';
import { Organization, User } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { RepresentativeManager } from '../../RepresentativeManager';
import { EmailInviteSystem } from '../../EmailInviteSystem';
import { OrganizationStats } from '../shared/OrganizationStats';
import { MemberCard } from '../shared/MemberCard';

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
      <OrganizationStats 
        organization={organization}
        activeMembersCount={activeMembers.length}
        legacyMembersCount={legacyMembers.length}
      />

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
              <MemberCard
                key={member.id}
                member={member}
                organization={organization}
              />
            ))}

            {legacyMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                organization={organization}
              />
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
