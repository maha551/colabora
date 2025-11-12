import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { AlertTriangle, Settings, Users, Vote, Shield, Clock, FileText, Eye, EyeOff, Lock } from 'lucide-react';
import { OrganizationGovernanceRules, Organization } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';

interface GovernanceRulesDialogProps {
  organization: Organization;
  currentUser: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function GovernanceRulesDialog({
  organization,
  currentUser,
  open,
  onOpenChange,
  onSuccess
}: GovernanceRulesDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<Partial<OrganizationGovernanceRules>>({
    // Representative Elections
    representativeTermMonths: 12,
    representativeTermLimits: null,
    electionVotingMethod: 'simple_majority',
    electionQuorumPercentage: 0.5,
    electionNoticeDays: 14,

    // General Voting Rules
    defaultVotingDeadlineHours: 168,
    defaultQuorumPercentage: 0.5,
    anonymousVotingEnabled: true,
    voteChangeAllowed: false,

    // Representative Powers
    representativeCanCreateVotes: true,
    representativeCanInviteMembers: true,
    representativeCanManageDocuments: true,
    representativeApprovalRequired: true,

    // Audit & Compliance
    tamperProofEnabled: true,
    auditTrailEnabled: true
  });

  const [originalRules, setOriginalRules] = useState<OrganizationGovernanceRules | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (open) {
      loadCurrentRules();
    }
  }, [open, organization.id]);

  const loadCurrentRules = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.getGovernanceRules(organization.id);
      if (response.governanceRules) {
        setRules(response.governanceRules);
        setOriginalRules(response.governanceRules);
      }
    } catch (error) {
      console.error('Failed to load governance rules:', error);
      // Rules don't exist yet, use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleRuleChange = (field: keyof OrganizationGovernanceRules, value: any) => {
    setRules(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await governanceApi.updateGovernanceRules(organization.id, rules);
      toast.success('Governance rules updated successfully');
      setOriginalRules(rules as OrganizationGovernanceRules);
      setHasChanges(false);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to update governance rules:', error);
      toast.error('Failed to update governance rules');
    } finally {
      setSaving(false);
    }
  };

  const getVotingMethodDescription = (method: string) => {
    switch (method) {
      case 'simple_majority': return 'First candidate with >50% wins';
      case 'ranked_choice': return 'Voters rank candidates in order of preference';
      case 'approval': return 'Voters approve any number of candidates';
      default: return '';
    }
  };

  const isRepresentative = organization.representatives?.includes(currentUser.id);

  if (!isRepresentative) {
    return null; // Only representatives can access this dialog
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Governance Rules Configuration
          </DialogTitle>
          <DialogDescription>
            Configure democratic governance rules for {organization.name}.
            These rules apply to all organization documents and elections.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <Tabs defaultValue="elections" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="elections" className="gap-2">
                <Vote className="h-4 w-4" />
                Elections
              </TabsTrigger>
              <TabsTrigger value="voting" className="gap-2">
                <Settings className="h-4 w-4" />
                Voting
              </TabsTrigger>
              <TabsTrigger value="permissions" className="gap-2">
                <Users className="h-4 w-4" />
                Permissions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="elections" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Vote className="h-5 w-5" />
                    Representative Elections
                  </CardTitle>
                  <CardDescription>
                    Configure how representatives are elected and serve
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="term-months">Term Length (Months)</Label>
                      <Input
                        id="term-months"
                        type="number"
                        min="1"
                        max="60"
                        value={rules.representativeTermMonths}
                        onChange={(e) => handleRuleChange('representativeTermMonths', parseInt(e.target.value))}
                      />
                      <p className="text-sm text-gray-600">
                        How long representatives serve before needing re-election
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="term-limits">Term Limits</Label>
                      <Input
                        id="term-limits"
                        type="number"
                        min="0"
                        placeholder="No limit"
                        value={rules.representativeTermLimits || ''}
                        onChange={(e) => handleRuleChange('representativeTermLimits', e.target.value ? parseInt(e.target.value) : null)}
                      />
                      <p className="text-sm text-gray-600">
                        Maximum consecutive terms (leave empty for no limit)
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="voting-method">Voting Method</Label>
                    <Select
                      value={rules.electionVotingMethod}
                      onValueChange={(value) => handleRuleChange('electionVotingMethod', value)}
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
                    <p className="text-sm text-gray-600">
                      {getVotingMethodDescription(rules.electionVotingMethod || 'simple_majority')}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="quorum">Election Quorum (%)</Label>
                      <Input
                        id="quorum"
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        value={(rules.electionQuorumPercentage || 0) * 100}
                        onChange={(e) => handleRuleChange('electionQuorumPercentage', parseInt(e.target.value) / 100)}
                      />
                      <p className="text-sm text-gray-600">
                        Minimum participation required for valid election
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notice-days">Notice Period (Days)</Label>
                      <Input
                        id="notice-days"
                        type="number"
                        min="1"
                        max="90"
                        value={rules.electionNoticeDays}
                        onChange={(e) => handleRuleChange('electionNoticeDays', parseInt(e.target.value))}
                      />
                      <p className="text-sm text-gray-600">
                        Days notice before election starts
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="voting" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    General Voting Rules
                  </CardTitle>
                  <CardDescription>
                    Default settings for all organization votes and decisions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="deadline-hours">Default Deadline (Hours)</Label>
                      <Input
                        id="deadline-hours"
                        type="number"
                        min="1"
                        max="720"
                        value={rules.defaultVotingDeadlineHours}
                        onChange={(e) => handleRuleChange('defaultVotingDeadlineHours', parseInt(e.target.value))}
                      />
                      <p className="text-sm text-gray-600">
                        Default time for votes to remain open
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="default-quorum">Default Quorum (%)</Label>
                      <Input
                        id="default-quorum"
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        value={(rules.defaultQuorumPercentage || 0) * 100}
                        onChange={(e) => handleRuleChange('defaultQuorumPercentage', parseInt(e.target.value) / 100)}
                      />
                      <p className="text-sm text-gray-600">
                        Minimum participation for non-election votes
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          Anonymous Voting
                        </Label>
                        <p className="text-sm text-gray-600">
                          Hide voter identities by default
                        </p>
                      </div>
                      <Switch
                        checked={rules.anonymousVotingEnabled}
                        onCheckedChange={(checked) => handleRuleChange('anonymousVotingEnabled', checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          Vote Changes Allowed
                        </Label>
                        <p className="text-sm text-gray-600">
                          Allow members to change their votes
                        </p>
                      </div>
                      <Switch
                        checked={rules.voteChangeAllowed}
                        onCheckedChange={(checked) => handleRuleChange('voteChangeAllowed', checked)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Security & Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="flex items-center gap-2">
                        <Lock className="h-4 w-4" />
                        Tamper-Proof Records
                      </Label>
                      <p className="text-sm text-gray-600">
                        Cryptographically verify vote integrity
                      </p>
                    </div>
                    <Switch
                      checked={rules.tamperProofEnabled}
                      onCheckedChange={(checked) => handleRuleChange('tamperProofEnabled', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Audit Trail
                      </Label>
                      <p className="text-sm text-gray-600">
                        Log all governance actions
                      </p>
                    </div>
                    <Switch
                      checked={rules.auditTrailEnabled}
                      onCheckedChange={(checked) => handleRuleChange('auditTrailEnabled', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="permissions" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Representative Permissions
                  </CardTitle>
                  <CardDescription>
                    What actions representatives can perform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Create Policy Votes</Label>
                      <p className="text-sm text-gray-600">
                        Representatives can create policy implementation votes
                      </p>
                    </div>
                    <Switch
                      checked={rules.representativeCanCreateVotes}
                      onCheckedChange={(checked) => handleRuleChange('representativeCanCreateVotes', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Invite Members</Label>
                      <p className="text-sm text-gray-600">
                        Representatives can send membership invitations
                      </p>
                    </div>
                    <Switch
                      checked={rules.representativeCanInviteMembers}
                      onCheckedChange={(checked) => handleRuleChange('representativeCanInviteMembers', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Manage Documents</Label>
                      <p className="text-sm text-gray-600">
                        Representatives can create and manage organization documents
                      </p>
                    </div>
                    <Switch
                      checked={rules.representativeCanManageDocuments}
                      onCheckedChange={(checked) => handleRuleChange('representativeCanManageDocuments', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Approval Required</Label>
                      <p className="text-sm text-gray-600">
                        Representative approval needed for major actions
                      </p>
                    </div>
                    <Switch
                      checked={rules.representativeApprovalRequired}
                      onCheckedChange={(checked) => handleRuleChange('representativeApprovalRequired', checked)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> Changes to governance rules affect all current and future
                  organization documents and elections. Consider the impact on ongoing processes.
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? 'Saving...' : 'Save Governance Rules'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
