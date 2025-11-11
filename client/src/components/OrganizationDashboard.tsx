import { useState, useEffect } from "react";
import { Organization, User } from "../types";
import { organizationsApi } from "../lib/api";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Users, Vote, FileText, Settings, Plus } from "lucide-react";
import { toast } from "sonner";

interface OrganizationDashboardProps {
  currentUser: User;
}

export function OrganizationDashboard({ currentUser }: OrganizationDashboardProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Organizations</h1>
          <p className="text-gray-600">Collaborative spaces for democratic decision-making</p>
        </div>
        <Button className="gap-2">
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
                    <Button variant="outline" size="sm" className="flex-1">
                      <FileText className="h-4 w-4 mr-2" />
                      View Docs
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Vote className="h-4 w-4 mr-2" />
                      Votes
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
    </div>
  );
}
