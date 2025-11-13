import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { Plus, X, Settings, AlertTriangle, Vote, Users, Shield, Clock } from 'lucide-react';
import { Organization, OrganizationGovernanceRules } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';

interface RuleProposalDialogProps {
  organization: Organization;
  currentUser: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface RuleOption {
  optionTitle: string;
  optionDescription?: string;
  proposedValue: any;
}

export function RuleProposalDialog({
  organization,
  currentUser,
  open,
  onOpenChange,
  onSuccess
}: RuleProposalDialogProps) {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [currentRules, setCurrentRules] = useState<OrganizationGovernanceRules | null>(null);

  const [proposalData, setProposalData] = useState({
    title: '',
    description: '',
    ruleField: '',
    proposedValue: '',
    useOptions: false,
    options: [] as RuleOption[]
  });

  useEffect(() => {
    if (open) {
      loadCurrentRules();
      resetForm();
    }
  }, [open, organization.id]);

  const loadCurrentRules = async () => {
    setLoading(true);
    try {
      const response = await governanceApi.getGovernanceRules(organization.id);
      setCurrentRules(response.governanceRules);
    } catch (error) {
      console.error('Failed to load governance rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setProposalData({
      title: '',
      description: '',
      ruleField: '',
      proposedValue: '',
      useOptions: false,
      options: []
    });
  };

  const handleInputChange = (field: string, value: any) => {
    setProposalData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddOption = () => {
    setProposalData(prev => ({
      ...prev,
      options: [...prev.options, { optionTitle: '', optionDescription: '', proposedValue: '' }]
    }));
  };

  const handleRemoveOption = (index: number) => {
    setProposalData(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const handleOptionChange = (index: number, field: string, value: any) => {
    setProposalData(prev => ({
      ...prev,
      options: prev.options.map((opt, i) =>
        i === index ? { ...opt, [field]: value } : opt
      )
    }));
  };

  const getRuleFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      representativeTermMonths: 'Representative Term Length',
      representativeTermLimits: 'Representative Term Limits',
      electionVotingMethod: 'Election Voting Method',
      electionQuorumPercentage: 'Election Quorum Percentage',
      electionNoticeDays: 'Election Notice Period',
      defaultVotingDeadlineHours: 'Default Voting Deadline',
      defaultQuorumPercentage: 'Default Quorum Percentage',
      anonymousVotingEnabled: 'Anonymous Voting',
      voteChangeAllowed: 'Vote Changes Allowed',
      representativeCanCreateVotes: 'Representatives Can Create Votes',
      representativeCanInviteMembers: 'Representatives Can Invite Members',
      representativeCanManageDocuments: 'Representatives Can Manage Documents',
      representativeApprovalRequired: 'Representative Approval Required',
      tamperProofEnabled: 'Tamper-Proof Records',
      auditTrailEnabled: 'Audit Trail Enabled'
    };
    return labels[field] || field;
  };

  const getRuleFieldType = (field: string) => {
    const numberFields = [
      'representativeTermMonths', 'representativeTermLimits', 'electionNoticeDays',
      'defaultVotingDeadlineHours'
    ];
    const percentageFields = ['electionQuorumPercentage', 'defaultQuorumPercentage'];
    const booleanFields = [
      'anonymousVotingEnabled', 'voteChangeAllowed', 'representativeCanCreateVotes',
      'representativeCanInviteMembers', 'representativeCanManageDocuments',
      'representativeApprovalRequired', 'tamperProofEnabled', 'auditTrailEnabled'
    ];
    const selectFields = ['electionVotingMethod'];

    if (numberFields.includes(field)) return 'number';
    if (percentageFields.includes(field)) return 'percentage';
    if (booleanFields.includes(field)) return 'boolean';
    if (selectFields.includes(field)) return 'select';
    return 'text';
  };

  const getCurrentValueDisplay = (field: string, value: any) => {
    const fieldType = getRuleFieldType(field);

    switch (fieldType) {
      case 'percentage':
        return `${Math.round(value * 100)}%`;
      case 'boolean':
        return value ? 'Enabled' : 'Disabled';
      case 'select':
        return value.replace('_', ' ');
      default:
        return String(value);
    }
  };

  const renderValueInput = (field: string, value: string, onChange: (value: any) => void) => {
    const fieldType = getRuleFieldType(field);

    switch (fieldType) {
      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter number"
          />
        );
      case 'percentage':
        return (
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              min="0"
              max="100"
              value={value ? Math.round(parseFloat(value) * 100) : ''}
              onChange={(e) => onChange(parseInt(e.target.value) / 100)}
              placeholder="0"
            />
            <span className="text-sm text-gray-600">%</span>
          </div>
        );
      case 'boolean':
        return (
          <Select value={value} onValueChange={(val) => onChange(val === 'true')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Enabled</SelectItem>
              <SelectItem value="false">Disabled</SelectItem>
            </SelectContent>
          </Select>
        );
      case 'select':
        if (field === 'electionVotingMethod') {
          return (
            <Select value={value} onValueChange={onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple_majority">Simple Majority</SelectItem>
                <SelectItem value="ranked_choice">Ranked Choice</SelectItem>
                <SelectItem value="approval">Approval Voting</SelectItem>
              </SelectContent>
            </Select>
          );
        }
        return (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter value"
          />
        );
      default:
        return (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter value"
          />
        );
    }
  };

  const validateProposal = () => {
    const errors = [];

    if (!proposalData.title.trim()) errors.push('Proposal title is required');
    if (!proposalData.description.trim()) errors.push('Proposal description is required');
    if (!proposalData.ruleField) errors.push('Rule field must be selected');

    if (proposalData.useOptions) {
      if (proposalData.options.length < 2) errors.push('At least 2 options are required for multiple choice');
      if (proposalData.options.some(opt => !opt.optionTitle.trim())) {
        errors.push('All option titles are required');
      }
    } else {
      if (!proposalData.proposedValue && proposalData.proposedValue !== false && proposalData.proposedValue !== 0) {
        errors.push('Proposed value is required');
      }
    }

    return errors;
  };

  const handleCreateProposal = async () => {
    const errors = validateProposal();
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    setCreating(true);
    try {
      const proposalPayload = {
        title: proposalData.title.trim(),
        description: proposalData.description.trim(),
        ruleField: proposalData.ruleField,
        proposedValue: proposalData.proposedValue,
        ...(proposalData.useOptions && { options: proposalData.options })
      };

      await governanceApi.ruleProposalsApi.createRuleProposal(organization.id, proposalPayload);

      toast.success('Rule change proposal created successfully');
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create rule proposal:', error);
      toast.error('Failed to create rule proposal');
    } finally {
      setCreating(false);
    }
  };

  const isRepresentative = organization.representatives?.includes(currentUser.id);

  if (!isRepresentative) {
    return null; // Only representatives can access this dialog
  }

  const availableRuleFields = [
    { value: 'representativeTermMonths', label: 'Representative Term Length (months)' },
    { value: 'representativeTermLimits', label: 'Representative Term Limits' },
    { value: 'electionVotingMethod', label: 'Election Voting Method' },
    { value: 'electionQuorumPercentage', label: 'Election Quorum Percentage' },
    { value: 'electionNoticeDays', label: 'Election Notice Period (days)' },
    { value: 'defaultVotingDeadlineHours', label: 'Default Voting Deadline (hours)' },
    { value: 'defaultQuorumPercentage', label: 'Default Quorum Percentage' },
    { value: 'anonymousVotingEnabled', label: 'Anonymous Voting' },
    { value: 'voteChangeAllowed', label: 'Allow Vote Changes' },
    { value: 'representativeCanCreateVotes', label: 'Representatives Can Create Votes' },
    { value: 'representativeCanInviteMembers', label: 'Representatives Can Invite Members' },
    { value: 'representativeCanManageDocuments', label: 'Representatives Can Manage Documents' },
    { value: 'representativeApprovalRequired', label: 'Representative Approval Required' },
    { value: 'tamperProofEnabled', label: 'Tamper-Proof Records' },
    { value: 'auditTrailEnabled', label: 'Audit Trail Enabled' }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Propose Governance Rule Change
          </DialogTitle>
          <DialogDescription>
            Propose a change to {organization.name}'s governance rules. The proposal will be voted on by organization members.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Proposal Details */}
            <Card>
              <CardHeader>
                <CardTitle>Proposal Details</CardTitle>
                <CardDescription>Describe the rule change you want to propose</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Proposal Title *</Label>
                  <Input
                    id="title"
                    value={proposalData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="e.g., Extend representative terms to 18 months"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    value={proposalData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Explain the reasoning and expected impact of this change"
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rule-field">Rule to Change *</Label>
                  <Select value={proposalData.ruleField} onValueChange={(value) => handleInputChange('ruleField', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a governance rule" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRuleFields.map(field => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {proposalData.ruleField && currentRules && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Current value:</strong> {getCurrentValueDisplay(proposalData.ruleField, currentRules[proposalData.ruleField as keyof OrganizationGovernanceRules])}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Proposed Change */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Proposed Change</span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="use-options" className="text-sm">Multiple choice</Label>
                    <Switch
                      id="use-options"
                      checked={proposalData.useOptions}
                      onCheckedChange={(checked) => handleInputChange('useOptions', checked)}
                    />
                  </div>
                </CardTitle>
                <CardDescription>
                  {proposalData.useOptions
                    ? "Present multiple options for members to choose from"
                    : "Propose a single new value for this rule"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!proposalData.useOptions ? (
                  <div className="space-y-2">
                    <Label htmlFor="proposed-value">New Value *</Label>
                    {renderValueInput(proposalData.ruleField, proposalData.proposedValue, (value) => handleInputChange('proposedValue', value))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Options</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddOption}
                        className="gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Add Option
                      </Button>
                    </div>

                    {proposalData.options.map((option, index) => (
                      <Card key={index} className="border-l-4 border-l-blue-500">
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-4">
                            <div className="flex-1 space-y-3">
                              <div className="space-y-2">
                                <Label>Option Title *</Label>
                                <Input
                                  value={option.optionTitle}
                                  onChange={(e) => handleOptionChange(index, 'optionTitle', e.target.value)}
                                  placeholder={`Option ${index + 1} title`}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Description (optional)</Label>
                                <Textarea
                                  value={option.optionDescription || ''}
                                  onChange={(e) => handleOptionChange(index, 'optionDescription', e.target.value)}
                                  placeholder="Describe this option"
                                  rows={2}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Value</Label>
                                {renderValueInput(proposalData.ruleField, option.proposedValue, (value) => handleOptionChange(index, 'proposedValue', value))}
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveOption(index)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}

                    {proposalData.options.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <Vote className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No options added yet</p>
                        <p className="text-sm">Click "Add Option" to create voting choices</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Impact Assessment */}
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> This proposal will be voted on by all active organization members.
                If approved, the governance rule will be immediately updated. Consider the impact on ongoing elections and documents.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateProposal}
            disabled={creating}
            className="gap-2"
          >
            <Vote className="h-4 w-4" />
            {creating ? 'Creating Proposal...' : 'Create Proposal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
