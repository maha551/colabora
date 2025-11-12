import { useState, useEffect } from "react";
import { Organization, User } from "../types";
import { organizationsApi } from "../lib/api";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Users, Vote, FileText, Settings, Plus, ArrowRight } from "lucide-react";
import { RepresentativeSelector } from "./RepresentativeSelector";
import { toast } from "sonner";
import { OrganizationManagement } from "./OrganizationManagement";

interface OrganizationDashboardProps {
  currentUser: User;
}

export function OrganizationDashboard({ currentUser }: OrganizationDashboardProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Organization creation form state
  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [representatives, setRepresentatives] = useState<string[]>([]);
  const [membershipPolicy, setMembershipPolicy] = useState<'open' | 'invitation'>('invitation');
  const [votingThreshold, setVotingThreshold] = useState(0.5);
  const [creatingOrg, setCreatingOrg] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      const response = await organizationsApi.getOrganizations();
      setOrganizations(response.organizations);
    } catch (err) {
      console.error('Failed to load organizations:', err);
      setError('Failed to load organizations');
      toast.error('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!orgName.trim()) {
      toast.error('Organization name is required');
      return;
    }

    if (representatives.length < 3) {
      toast.error('At least 3 representatives are required');
      return;
    }

    if (representatives.length > 10) {
      toast.error('Maximum 10 representatives allowed');
      return;
    }

    try {
      setCreatingOrg(true);
      const response = await organizationsApi.createOrganization(
        orgName.trim(),
        orgDescription.trim() || undefined,
        representatives,
        membershipPolicy,
        votingThreshold
      );

      toast.success('Organization created successfully!');
      setShowCreateDialog(false);

      // Reset form
      setOrgName('');
      setOrgDescription('');
      setRepresentatives([]);
      setMembershipPolicy('invitation');
      setVotingThreshold(0.5);

      // Reload organizations to show the new one
      await loadOrganizations();
    } catch (err: any) {
      console.error('Failed to create organization:', err);
      if (err.status === 403) {
        toast.error('Only administrators can create organizations');
      } else {
        toast.error('Failed to create organization');
      }
    } finally {
      setCreatingOrg(false);
    }
  };

  const getMembershipStatus = (org: Organization) => {
    // This would be determined by the API response
    // For now, assume all are members
    return 'Member';
  };

  const getRepresentativeStatus = (org: Organization) => {
    if (org.representatives?.includes(currentUser.id)) {
      return 'Representative';
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={loadOrganizations}>Try Again</Button>
      </div>
    );
  }

  // Show organization management if one is selected
  if (selectedOrganization) {
    return (
      <OrganizationManagement
        organization={selectedOrganization}
        currentUser={currentUser}
        onBack={() => setSelectedOrganization(null)}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Organizations</h1>
          <p className="text-gray-600">Collaborative spaces for democratic decision-making</p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" />
          Create Organization
        </Button>
      </div>

      {organizations.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Organizations Yet</h3>
            <p className="text-gray-600 mb-4">
              Organizations are collaborative spaces where groups can make democratic decisions.
            </p>
            <Button variant="outline">Learn More</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <Card key={org.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{org.name}</CardTitle>
                    {org.description && (
                      <CardDescription className="mt-1">{org.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    {getRepresentativeStatus(org) && (
                      <Badge variant="secondary" className="text-xs">
                        Rep
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Status */}
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Status: {getMembershipStatus(org)}</span>
                    <Badge variant={org.isActive ? "default" : "secondary"}>
                      {org.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  {/* Representatives */}
                  <div>
                    <div className="text-sm font-medium mb-2">Representatives</div>
                    <div className="flex -space-x-2">
                      {org.representatives?.slice(0, 3).map((repId, index) => (
                        <Avatar key={repId} className="h-8 w-8 border-2 border-white">
                          <AvatarFallback className="text-xs">
                            R{index + 1}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {(org.representatives?.length || 0) > 3 && (
                        <Avatar className="h-8 w-8 border-2 border-white">
                          <AvatarFallback className="text-xs bg-gray-100">
                            +{(org.representatives?.length || 0) - 3}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-lg font-semibold text-blue-600">
                        {/* This would come from API */}
                        12
                      </div>
                      <div className="text-xs text-gray-600">Members</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-green-600">
                        {/* This would come from API */}
                        3
                      </div>
                      <div className="text-xs text-gray-600">Active Votes</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-purple-600">
                        {/* This would come from API */}
                        8
                      </div>
                      <div className="text-xs text-gray-600">Documents</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedOrganization(org)}
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Manage
                    </Button>
                    {getRepresentativeStatus(org) && (
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Organization Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Organization</DialogTitle>
            <DialogDescription>
              Create a collaborative space for democratic decision-making. Only administrators can create organizations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="orgName">Organization Name *</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Enter organization name"
              />
            </div>

            <div>
              <Label htmlFor="orgDescription">Description</Label>
              <Textarea
                id="orgDescription"
                value={orgDescription}
                onChange={(e) => setOrgDescription(e.target.value)}
                placeholder="Describe the organization's purpose and goals"
                rows={3}
              />
            </div>

            <div>
              <Label>Membership Policy</Label>
              <select
                value={membershipPolicy}
                onChange={(e) => setMembershipPolicy(e.target.value as 'open' | 'invitation')}
                className="w-full p-2 border rounded-md"
              >
                <option value="invitation">Invitation Only</option>
                <option value="open">Open Membership</option>
              </select>
            </div>

            <div>
              <Label htmlFor="votingThreshold">Voting Threshold</Label>
              <Input
                id="votingThreshold"
                type="number"
                min="0.1"
                max="1.0"
                step="0.1"
                value={votingThreshold}
                onChange={(e) => setVotingThreshold(parseFloat(e.target.value))}
              />
              <p className="text-sm text-gray-600 mt-1">
                Percentage of votes needed to pass proposals (0.1 = 10%, 1.0 = 100%)
              </p>
            </div>

            <RepresentativeSelector
              selectedRepresentatives={representatives}
              onRepresentativesChange={setRepresentatives}
              minRequired={3}
              maxAllowed={10}
            />
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOrganization} disabled={creatingOrg}>
              {creatingOrg ? 'Creating...' : 'Create Organization'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
