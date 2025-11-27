import React, { useState, useEffect } from 'react';
import { User, Organization } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Building2, Users, FileText, Shield, Plus, UserCheck, UserX, Eye, EyeOff, X, Settings } from 'lucide-react';
import { documentsApi, apiRequest } from '../lib/api';
import { toast } from 'sonner';

interface AdminStats {
  totalUsers: number;
  totalOrganizations: number;
  totalDocuments: number;
  activeOrganizations: number;
}

interface AdminUser extends User {
  organizationsCount: number;
}

interface AdminOrganization extends Organization {
  memberCount: number;
  documentCount: number;
  createdByName: string;
}

interface AdminDashboardProps {
  currentUser: User;
  onBack: () => void;
}

// Searchable Multi-Select Component for Representatives
interface RepresentativeSelectorProps {
  users: AdminUser[];
  selectedRepresentatives: string[];
  onSelectionChange: (selectedIds: string[]) => void;
}

function RepresentativeSelector({ users, selectedRepresentatives, onSelectionChange }: RepresentativeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchValue.toLowerCase()) ||
    user.email.toLowerCase().includes(searchValue.toLowerCase())
  );

  const selectedUsers = users.filter(user => selectedRepresentatives.includes(user.id));

  return (
    <div className="space-y-2">
      <Label>Select Representatives *</Label>
      <p className="text-sm text-gray-600">
        Choose one or more users to serve as representatives for this organization.
      </p>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selectedUsers.length > 0
              ? `${selectedUsers.length} representative${selectedUsers.length > 1 ? 's' : ''} selected`
              : "Select representatives..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search users..."
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {filteredUsers.map((user) => {
                const isSelected = selectedRepresentatives.includes(user.id);
                return (
                  <CommandItem
                    key={user.id}
                    onSelect={() => {
                      const newSelection = isSelected
                        ? selectedRepresentatives.filter(id => id !== user.id)
                        : [...selectedRepresentatives, user.id];
                      onSelectionChange(newSelection);
                    }}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${
                        isSelected ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <div className="flex flex-col">
                      <span>{user.name}</span>
                      <span className="text-sm text-gray-500">{user.email}</span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedUsers.map(user => (
            <Badge key={user.id} variant="secondary" className="flex items-center gap-1">
              {user.name}
              <X
                className="h-3 w-3 cursor-pointer hover:text-red-500"
                onClick={() => {
                  const newSelection = selectedRepresentatives.filter(id => id !== user.id);
                  onSelectionChange(newSelection);
                }}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminDashboard({ currentUser, onBack }: AdminDashboardProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [organizations, setOrganizations] = useState<AdminOrganization[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOrgDialogOpen, setCreateOrgDialogOpen] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Form state for organization creation
  const [orgForm, setOrgForm] = useState({
    name: '',
    description: '',
    representatives: [] as string[],
    membershipPolicy: 'invitation' as 'open' | 'invitation',
    votingThreshold: 75,
    governanceRules: {
      representativeTermMonths: 12,
      electionVotingMethod: 'simple_majority' as 'simple_majority' | 'ranked_choice' | 'approval',
      electionQuorumPercentage: 50,
      defaultVotingDeadlineHours: 168,
      documentProposalPeriodDays: 365
    }
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [statsResponse, orgsResponse, usersResponse] = await Promise.all([
        apiRequest('/api/admin/dashboard'),
        apiRequest('/api/admin/organizations'),
        apiRequest('/api/admin/users')
      ]);

      setStats(statsResponse.stats);
      setOrganizations(orgsResponse.organizations || []);
      setUsers(usersResponse.users || []);
    } catch (error) {
      console.error('Failed to load admin dashboard:', error);
      toast.error('Failed to load admin dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!orgForm.name.trim() || orgForm.representatives.length === 0) {
      toast.error('Please fill in all required fields and select at least one representative');
      return;
    }

    setCreatingOrg(true);
    try {
      const requestBody = {
        name: orgForm.name,
        representatives: orgForm.representatives,
        description: orgForm.description,
        membershipPolicy: orgForm.membershipPolicy,
        votingThreshold: orgForm.votingThreshold / 100, // Convert percentage to decimal
        governanceRules: {
          representativeTermMonths: orgForm.governanceRules.representativeTermMonths,
          electionVotingMethod: orgForm.governanceRules.electionVotingMethod,
          electionQuorumPercentage: orgForm.governanceRules.electionQuorumPercentage / 100,
          defaultVotingDeadlineHours: orgForm.governanceRules.defaultVotingDeadlineHours,
          documentProposalPeriodDays: orgForm.governanceRules.documentProposalPeriodDays
        }
      };

      await apiRequest('/api/admin/organizations', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      toast.success('Organization created successfully');
      setCreateOrgDialogOpen(false);
      setOrgForm({
        name: '',
        description: '',
        representatives: [],
        membershipPolicy: 'invitation',
        votingThreshold: 75,
        governanceRules: {
          representativeTermMonths: 12,
          electionVotingMethod: 'simple_majority',
          electionQuorumPercentage: 50,
          defaultVotingDeadlineHours: 168,
          documentProposalPeriodDays: 365
        }
      });
      loadDashboardData(); // Refresh data
    } catch (error) {
      console.error('Failed to create organization:', error);
      const errorMessage = error instanceof Error ? error.message : 
                          (typeof error === 'object' && error.details) ? error.details : 
                          'Failed to create organization';
      toast.error(errorMessage);
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleToggleOrganizationStatus = async (orgId: string, isActive: boolean) => {
    try {
      await apiRequest(`/api/admin/organizations/${orgId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !isActive }),
      });
      toast.success(`Organization ${!isActive ? 'activated' : 'deactivated'} successfully`);
      loadDashboardData(); // Refresh data
    } catch (error) {
      console.error('Failed to update organization status:', error);
      toast.error('Failed to update organization status');
    }
  };

  const handlePromoteUser = async (userId: string) => {
    try {
      await apiRequest(`/api/admin/promote-admin/${userId}`, {
        method: 'POST',
      });
      toast.success('User promoted to admin successfully');
      loadDashboardData(); // Refresh data
    } catch (error) {
      console.error('Failed to promote user:', error);
      toast.error('Failed to promote user');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center">Loading admin dashboard...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Description */}
      <div className="mb-8">
        <p className="text-gray-600">Manage organizations, users, and system settings</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Organizations</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOrganizations}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeOrganizations} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Documents</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDocuments}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Your Role</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Admin</div>
              <p className="text-xs text-muted-foreground">
                {currentUser.email}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Organization Button */}
      <div className="mb-6">
        <Dialog open={createOrgDialogOpen} onOpenChange={setCreateOrgDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create New Organization
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Organization</DialogTitle>
              <DialogDescription>
                Set up a new organization with representatives and governance rules.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="representatives">Representatives</TabsTrigger>
                <TabsTrigger value="governance">Governance</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="org-name">Organization Name *</Label>
                    <Input
                      id="org-name"
                      value={orgForm.name}
                      onChange={(e) => setOrgForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter organization name"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="org-description">Description</Label>
                    <Input
                      id="org-description"
                      value={orgForm.description}
                      onChange={(e) => setOrgForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Optional description"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="membership-policy">Membership Policy</Label>
                    <Select
                      value={orgForm.membershipPolicy}
                      onValueChange={(value: 'open' | 'invitation') =>
                        setOrgForm(prev => ({ ...prev, membershipPolicy: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invitation">Invitation Only</SelectItem>
                        <SelectItem value="open">Open Membership</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="voting-threshold">Voting Threshold (%)</Label>
                    <Input
                      id="voting-threshold"
                      type="number"
                      min="1"
                      max="100"
                      value={orgForm.votingThreshold}
                      onChange={(e) => setOrgForm(prev => ({
                        ...prev,
                        votingThreshold: parseInt(e.target.value) || 75
                      }))}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="representatives" className="space-y-4">
                <RepresentativeSelector
                  users={users}
                  selectedRepresentatives={orgForm.representatives}
                  onSelectionChange={(selectedIds) =>
                    setOrgForm(prev => ({ ...prev, representatives: selectedIds }))
                  }
                />
              </TabsContent>

              <TabsContent value="governance" className="space-y-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rep-term">Representative Term (Months)</Label>
                    <Input
                      id="rep-term"
                      type="number"
                      min="1"
                      max="120"
                      value={orgForm.governanceRules.representativeTermMonths}
                      onChange={(e) => setOrgForm(prev => ({
                        ...prev,
                        governanceRules: {
                          ...prev.governanceRules,
                          representativeTermMonths: parseInt(e.target.value) || 12
                        }
                      }))}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="election-method">Election Voting Method</Label>
                    <Select
                      value={orgForm.governanceRules.electionVotingMethod}
                      onValueChange={(value: 'simple_majority' | 'ranked_choice' | 'approval') =>
                        setOrgForm(prev => ({
                          ...prev,
                          governanceRules: {
                            ...prev.governanceRules,
                            electionVotingMethod: value
                          }
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple_majority">Simple Majority</SelectItem>
                        <SelectItem value="ranked_choice">Ranked Choice</SelectItem>
                        <SelectItem value="approval">Approval Voting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="election-quorum">Election Quorum (%)</Label>
                    <Input
                      id="election-quorum"
                      type="number"
                      min="0"
                      max="100"
                      value={orgForm.governanceRules.electionQuorumPercentage}
                      onChange={(e) => setOrgForm(prev => ({
                        ...prev,
                        governanceRules: {
                          ...prev.governanceRules,
                          electionQuorumPercentage: parseInt(e.target.value) || 50
                        }
                      }))}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="voting-deadline">Default Voting Deadline (Hours)</Label>
                    <Input
                      id="voting-deadline"
                      type="number"
                      min="1"
                      max="720"
                      value={orgForm.governanceRules.defaultVotingDeadlineHours}
                      onChange={(e) => setOrgForm(prev => ({
                        ...prev,
                        governanceRules: {
                          ...prev.governanceRules,
                          defaultVotingDeadlineHours: parseInt(e.target.value) || 168
                        }
                      }))}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="proposal-period">Document Proposal Period (Days)</Label>
                    <Input
                      id="proposal-period"
                      type="number"
                      min="1"
                      max="3650"
                      value={orgForm.governanceRules.documentProposalPeriodDays}
                      onChange={(e) => setOrgForm(prev => ({
                        ...prev,
                        governanceRules: {
                          ...prev.governanceRules,
                          documentProposalPeriodDays: parseInt(e.target.value) || 365
                        }
                      }))}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCreateOrgDialogOpen(false)}
                disabled={creatingOrg}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateOrganization} disabled={creatingOrg}>
                {creatingOrg ? 'Creating...' : 'Create Organization'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="organizations" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="organizations">Organizations</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="organizations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Organizations</CardTitle>
              <CardDescription>
                Manage all organizations in the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizations.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell>{org.createdByName}</TableCell>
                      <TableCell>{org.memberCount}</TableCell>
                      <TableCell>{org.documentCount}</TableCell>
                      <TableCell>
                        <Badge variant={org.isActive ? "default" : "secondary"}>
                          {org.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={org.isActive ? "destructive" : "default"}
                          onClick={() => handleToggleOrganizationStatus(org.id, org.isActive)}
                        >
                          {org.isActive ? (
                            <>
                              <EyeOff className="h-3 w-3 mr-1" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <Eye className="h-3 w-3 mr-1" />
                              Activate
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Users</CardTitle>
              <CardDescription>
                Manage user roles and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Organizations</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? "default" : "secondary"}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.organizationsCount}</TableCell>
                      <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {user.role !== 'admin' && (
                          <Button
                            size="sm"
                            onClick={() => handlePromoteUser(user.id)}
                          >
                            <UserCheck className="h-3 w-3 mr-1" />
                            Promote to Admin
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
