import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Users, Mail, UserPlus } from 'lucide-react';
import { Organization, User } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { EmailInviteSystem } from '../../EmailInviteSystem';
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Members</h2>
          <p className="text-gray-600">
            {activeMembers.length} active member{activeMembers.length !== 1 ? 's' : ''}
          </p>
        </div>
        {permissions.canInviteMembers && (
          <Button onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Members
          </Button>
        )}
      </div>

      {/* Member List */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Members</CardTitle>
        </CardHeader>
        <CardContent>
          {activeMembers.length > 0 || legacyMembers.length > 0 ? (
            <div className="space-y-6">
              {activeMembers.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  organization={organization}
                />
              ))}
              {legacyMembers.length > 0 && (
                <>
                  <div className="border-t my-4 pt-4">
                    <h3 className="text-sm font-medium text-gray-500 mb-3">Legacy Members</h3>
                    {legacyMembers.map((member) => (
                      <MemberCard
                        key={member.id}
                        member={member}
                        organization={organization}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="mb-1">No members yet</p>
              <p className="text-sm">Invite members to get started</p>
              {permissions.canInviteMembers && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowInviteDialog(true)}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Invite Members
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
