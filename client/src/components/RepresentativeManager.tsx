import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Users, UserPlus, UserMinus, Crown, AlertTriangle } from 'lucide-react';
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
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [removingRep, setRemovingRep] = useState<string | null>(null);

  const isRepresentative = organization.representatives?.includes(currentUser.id);
  const currentRepCount = organization.representatives?.length || 0;

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
      setSearchEmail('');
      setSearchResults([]);
      onUpdate();
    } catch (error) {
      console.error('Failed to nominate representative:', error);
      toast.error('Failed to nominate representative');
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
      setRemoveDialogOpen(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to remove representative:', error);
      toast.error('Failed to remove representative');
    } finally {
      setRemovingRep(null);
    }
  };

  const searchUsers = async () => {
    // In a real implementation, this would search for users
    // For now, we'll simulate finding users by email
    if (!searchEmail.trim()) return;

    try {
      // This is a placeholder - in production you'd have a user search API
      setSearchResults([{
        id: `user-${Date.now()}`,
        name: searchEmail.split('@')[0],
        email: searchEmail
      }]);
    } catch (error) {
      console.error('Failed to search users:', error);
      toast.error('Failed to search users');
    }
  };

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
                    Search for a user to nominate as a representative. They will gain executive powers.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="email">User Email</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id="email"
                        type="email"
                        placeholder="user@example.com"
                        value={searchEmail}
                        onChange={(e) => setSearchEmail(e.target.value)}
                      />
                      <Button onClick={searchUsers} variant="outline">
                        Search
                      </Button>
                    </div>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      <Label>Select User</Label>
                      {searchResults.map((user) => (
                        <div
                          key={user.id}
                          className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                            selectedUserId === user.id ? 'border-blue-500 bg-blue-50' : ''
                          }`}
                          onClick={() => setSelectedUserId(user.id)}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {user.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{user.name}</div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </div>
                      ))}
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {organization.representatives?.map((repId) => (
              <Card key={repId} className="relative">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        <Crown className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="font-medium">
                        Representative {organization.representatives?.indexOf(repId) + 1}
                      </div>
                      <div className="text-sm text-gray-500">ID: {repId}</div>
                      {repId === currentUser.id && (
                        <Badge variant="secondary" className="mt-1">You</Badge>
                      )}
                    </div>

                    {currentRepCount > 3 && repId !== currentUser.id && (
                      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Remove Representative</DialogTitle>
                            <DialogDescription>
                              Are you sure you want to remove this representative? This requires approval from all other representatives.
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
                              onClick={() => setRemoveDialogOpen(false)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
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
