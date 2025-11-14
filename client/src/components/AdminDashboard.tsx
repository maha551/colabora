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
import { Building2, Users, FileText, Shield, Plus, UserCheck, UserX, Eye, EyeOff } from 'lucide-react';
import { documentsApi } from '../lib/api';
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
    membershipPolicy: 'invitation' as 'open' | 'invitation',
    votingThreshold: 75,
    firstRepresentativeId: ''
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [statsResponse, orgsResponse, usersResponse] = await Promise.all([
        documentsApi.getAdminDashboard(),
        documentsApi.getAllOrganizationsAdmin(),
        documentsApi.getAllUsersAdmin()
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
    if (!orgForm.name.trim() || !orgForm.firstRepresentativeId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setCreatingOrg(true);
    try {
      await documentsApi.createOrganizationAdmin(
        orgForm.name,
        orgForm.description,
        orgForm.membershipPolicy,
        orgForm.votingThreshold / 100, // Convert percentage to decimal
        orgForm.firstRepresentativeId
      );

      toast.success('Organization created successfully');
      setCreateOrgDialogOpen(false);
      setOrgForm({
        name: '',
        description: '',
        membershipPolicy: 'invitation',
        votingThreshold: 75,
        firstRepresentativeId: ''
      });
      loadDashboardData(); // Refresh data
    } catch (error) {
      console.error('Failed to create organization:', error);
      toast.error('Failed to create organization');
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleToggleOrganizationStatus = async (orgId: string, isActive: boolean) => {
    try {
      await documentsApi.updateOrganizationStatus(orgId, !isActive);
      toast.success(`Organization ${!isActive ? 'activated' : 'deactivated'} successfully`);
      loadDashboardData(); // Refresh data
    } catch (error) {
      console.error('Failed to update organization status:', error);
      toast.error('Failed to update organization status');
    }
  };

  const handlePromoteUser = async (userId: string) => {
    try {
      await documentsApi.promoteUserToAdmin(userId);
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
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-1">Manage organizations, users, and system settings</p>
          </div>
          <Button onClick={onBack} variant="outline">
            Back to Documents
          </Button>
        </div>
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
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Organization</DialogTitle>
              <DialogDescription>
                Set up a new organization with initial settings and representative.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
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

              <div className="grid gap-2">
                <Label htmlFor="first-rep">First Representative *</Label>
                <Select
                  value={orgForm.firstRepresentativeId}
                  onValueChange={(value) => setOrgForm(prev => ({ ...prev, firstRepresentativeId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user as representative" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

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
