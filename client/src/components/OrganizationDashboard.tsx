import { useState, useEffect } from "react";
import { Organization, User } from "../types";
import { organizationsApi } from "../lib/api";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Users, Plus } from "lucide-react";
import { RepresentativeSelector } from "./RepresentativeSelector";
import { toast } from "sonner";
import { OrganizationManagement } from "./OrganizationManagement/OrganizationManagement";
import { OrganizationCard } from "./OrganizationManagement/shared/OrganizationCard";

interface OrganizationDashboardProps {
  currentUser: User;
  onSelectOrganization: (organization: Organization) => void;
}

export function OrganizationDashboard({ currentUser, onSelectOrganization }: OrganizationDashboardProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Organization creation form state
  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [representatives, setRepresentatives] = useState<string[]>([]);
  const [membershipPolicy, setMembershipPolicy] = useState<'open' | 'invitation'>('invitation');
  const [votingEnabled, setVotingEnabled] = useState(false);
  const [votingThreshold, setVotingThreshold] = useState(0.5);
  const [creatingOrg, setCreatingOrg] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  // Auto-navigate for single organization users (admins see all organizations)
  useEffect(() => {
    if (organizations.length === 1 && currentUser.role !== 'admin') {
      onSelectOrganization(organizations[0]);
    }
  }, [organizations, currentUser.role, onSelectOrganization]);

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
        votingEnabled,
        votingThreshold
      );

      toast.success('Organization created successfully!');
      setShowCreateDialog(false);

      // Reset form
      setOrgName('');
      setOrgDescription('');
      setRepresentatives([]);
      setMembershipPolicy('invitation');
      setVotingEnabled(false);
      setVotingThreshold(0.5);

      // Reload organizations to show the new one
      await loadOrganizations();
    } catch (err: unknown) {
      console.error('Failed to create organization:', err);
      if (err && typeof err === 'object' && 'status' in err && err.status === 403) {
        toast.error('Only administrators can create organizations');
      } else {
        toast.error('Failed to create organization');
      }
    } finally {
      setCreatingOrg(false);
    }
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

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Organizations</h1>
          <p className="text-gray-600">Collaborative spaces for democratic decision-making</p>
        </div>
        {currentUser.role === 'admin' && (
          <Button className="gap-2" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Create Organization
          </Button>
        )}
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
            <OrganizationCard
              key={org.id}
              organization={org}
              currentUser={currentUser}
              onSelectOrganization={onSelectOrganization}
              mode="grid"
            />
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

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="votingEnabled"
                checked={votingEnabled}
                onChange={(e) => setVotingEnabled(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <Label htmlFor="votingEnabled">Enable Voting</Label>
            </div>

            {votingEnabled && (
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
            )}

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
