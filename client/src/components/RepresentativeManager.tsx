import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Users, UserPlus, UserMinus, Crown, AlertTriangle, Mail } from 'lucide-react';
import { toast } from 'sonner';

import { Organization, User } from '../types';
import { organizationsApi } from '../lib/api';

interface RepresentativeManagerProps {
  organization: Organization;
  currentUser: User;
  onUpdate: () => void;
}

export function RepresentativeManager({ organization, currentUser, onUpdate }: RepresentativeManagerProps) {
  const [nominateDialogOpen, setNominateDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [removingRep, setRemovingRep] = useState<string | null>(null);

  const isRepresentative = organization.representatives?.includes(currentUser.id);
  const currentRepCount = organization.representatives?.length || 0;

  // Get member data for each representative
  const getRepresentativeMember = (repId: string) => {
    return organization.members?.find(m => m.userId === repId);
  };

  const handleNominate = async () => {
    if (!selectedUserId) {
      toast.error('Please select a user to nominate');
      return;
    }

    try {
      setLoading(true);
      await organizationsApi.nominateRepresentative(organization.id, selectedUserId);
      toast.success('Representative nominated successfully');
      setNominateDialogOpen(false);
      setSelectedUserId('');
      onUpdate();
    } catch (error: any) {
      console.error('Failed to nominate representative:', error);
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to nominate representative';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (repId: string) => {
    if (currentRepCount <= 3) {
      toast.error('Cannot remove representative: minimum 3 required');
      return;
    }

    try {
      setRemovingRep(repId);
      await organizationsApi.removeRepresentative(organization.id, repId);
      toast.success('Representative removed successfully');
      setRemoveDialogOpen(null);
      onUpdate();
    } catch (error) {
      console.error('Failed to remove representative:', error);
      toast.error('Failed to remove representative');
    } finally {
      setRemovingRep(null);
    }
  };

  // Get available members (active members who are not already representatives)
  const getAvailableMembers = () => {
    const activeMembers = organization.members?.filter(m => m.status === 'active') || [];
    const existingRepIds = organization.representatives || [];
    
    // Filter out existing representatives
    return activeMembers.filter(member => !existingRepIds.includes(member.userId));
  };

  const availableMembers = getAvailableMembers();

  if (!isRepresentative) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Only representatives can manage organization representatives.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5" />
                Representatives ({currentRepCount}/∞)
              </CardTitle>
              <CardDescription>
                Manage organization representatives who make executive decisions
              </CardDescription>
            </div>

            <Dialog open={nominateDialogOpen} onOpenChange={setNominateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Nominate Representative
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nominate New Representative</DialogTitle>
                  <DialogDescription>
                    Select an active member to nominate as a representative. Only active members can be nominated.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {availableMembers.length === 0 ? (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        No available members to nominate. All active members are already representatives, or there are no active members in the organization.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-2">
                      <Label>Select Active Member</Label>
                      <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-md p-2">
                        {availableMembers.map((member) => {
                          const user = member.user;
                          const isSelected = selectedUserId === member.userId;
                          return (
                            <div
                              key={member.userId}
                              className={`p-3 border rounded cursor-pointer hover:bg-gray-50 transition-colors ${
                                isSelected ? 'border-blue-500 bg-blue-50' : ''
                              }`}
                              onClick={() => setSelectedUserId(member.userId)}
                            >
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  {user?.avatar ? (
                                    <AvatarImage src={user.avatar} alt={user.name} />
                                  ) : null}
                                  <AvatarFallback>
                                    {user?.name?.charAt(0).toUpperCase() || '?'}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <div className="font-medium">{user?.name || 'Unknown User'}</div>
                                  <div className="text-sm text-gray-500">{user?.email || ''}</div>
                                  {member.joinedAt && (
                                    <div className="text-xs text-gray-400 mt-1">
                                      Member since {new Date(member.joinedAt).toLocaleDateString()}
                                    </div>
                                  )}
                                </div>
                                {isSelected && (
                                  <div className="text-blue-600">
                                    <Users className="h-5 w-5" />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleNominate}
                      disabled={!selectedUserId || loading}
                      className="flex-1"
                    >
                      {loading ? 'Nominating...' : 'Nominate Representative'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setNominateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {organization.representatives?.map((repId) => {
              const member = getRepresentativeMember(repId);
              const user = member?.user;
              const displayName = user?.name || `Representative ${organization.representatives?.indexOf(repId)! + 1}`;
              const email = user?.email || '';
              const avatar = user?.avatar;
              const initials = displayName
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              const isCurrentUser = repId === currentUser.id;

              return (
                <Card key={repId} className="relative overflow-hidden hover:shadow-lg transition-shadow border-2">
                  {/* Crown badge overlay */}
                  <div className="absolute top-2 right-2 z-10">
                    <div className="bg-yellow-100 rounded-full p-1.5">
                      <Crown className="h-4 w-4 text-yellow-600" />
                    </div>
                  </div>

                  <CardContent className="p-6">
                    <div className="flex flex-col items-center text-center space-y-4">
                      {/* Avatar */}
                      <div className="relative">
                        <Avatar className="h-20 w-20 border-4 border-yellow-100 shadow-md">
                          {avatar ? (
                            <AvatarImage src={avatar} alt={displayName} />
                          ) : null}
                          <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-white text-xl font-semibold">
                            {initials || <Crown className="h-8 w-8" />}
                          </AvatarFallback>
                        </Avatar>
                        {isCurrentUser && (
                          <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
                            <Badge variant="default" className="text-xs px-2 py-0.5">
                              You
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Name */}
                      <div className="space-y-1">
                        <h3 className="font-semibold text-lg text-gray-900">
                          {displayName}
                        </h3>
                        {member?.status && (
                          <Badge 
                            variant={member.status === 'active' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {member.status === 'active' ? 'Active' : 'Legacy'} Member
                          </Badge>
                        )}
                      </div>

                      {/* Contact Information */}
                      {email && (
                        <div className="w-full space-y-2 pt-2 border-t">
                          <div className="flex items-center gap-2 text-sm text-gray-600 justify-center">
                            <Mail className="h-4 w-4" />
                            <a 
                              href={`mailto:${email}`}
                              className="hover:text-blue-600 hover:underline truncate max-w-[200px]"
                              title={email}
                            >
                              {email}
                            </a>
                          </div>
                          {member?.joinedAt && (
                            <div className="text-xs text-gray-500">
                              Joined {new Date(member.joinedAt).toLocaleDateString('en-US', { 
                                year: 'numeric', 
                                month: 'short', 
                                day: 'numeric' 
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Remove Button */}
                      {currentRepCount > 3 && !isCurrentUser && (
                        <div className="pt-2 w-full">
                          <Dialog 
                            open={removeDialogOpen === repId} 
                            onOpenChange={(open) => setRemoveDialogOpen(open ? repId : null)}
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                              >
                                <UserMinus className="h-4 w-4 mr-2" />
                                Remove
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Remove Representative</DialogTitle>
                                <DialogDescription>
                                  Are you sure you want to remove {displayName} as a representative? This requires approval from all other representatives.
                                </DialogDescription>
                              </DialogHeader>

                              <Alert>
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                  This action requires unanimous consent from all remaining representatives.
                                </AlertDescription>
                              </Alert>

                              <div className="flex gap-2 pt-4">
                                <Button
                                  variant="destructive"
                                  onClick={() => handleRemove(repId)}
                                  disabled={removingRep === repId}
                                  className="flex-1"
                                >
                                  {removingRep === repId ? 'Removing...' : 'Remove Representative'}
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => setRemoveDialogOpen(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {currentRepCount < 3 && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Warning: Organization has fewer than 3 representatives. This violates the minimum requirement for democratic governance.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
