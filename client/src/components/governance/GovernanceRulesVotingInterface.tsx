import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { Vote, Settings, Clock, Users, Shield, FileText, Eye, EyeOff, Lock, AlertTriangle, Plus, CheckCircle } from 'lucide-react';
import { Organization, OrganizationGovernanceRules } from '../../types';
import { governanceApi } from '../../lib/api';
import { RuleProposalDialog } from './RuleProposalDialog';
import { RuleProposalVotingInterface } from './RuleProposalVotingInterface';
import { toast } from 'sonner';

interface GovernanceRulesVotingInterfaceProps {
  organization: Organization;
  currentUser: any;
  onClose?: () => void;
}

interface RuleProposal {
  id: string;
  title: string;
  description: string;
  ruleField: string;
  proposedValue: any;
  options?: Array<{
    id: string;
    optionTitle: string;
    optionDescription?: string;
    proposedValue: any;
  }>;
  status: 'pending' | 'voting' | 'completed' | 'rejected';
  createdBy: {
    id: string;
    name: string;
  };
  votingDeadline?: string;
  votes?: Array<{
    userId: string;
    selectedOptionId?: string;
    voteChoice?: 'yes' | 'no' | 'abstain';
  }>;
}

export function GovernanceRulesVotingInterface({
  organization,
  currentUser,
  onClose
}: GovernanceRulesVotingInterfaceProps) {
  const [governanceRules, setGovernanceRules] = useState<OrganizationGovernanceRules | null>(null);
  const [ruleProposals, setRuleProposals] = useState<RuleProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRuleProposalDialog, setShowRuleProposalDialog] = useState(false);
  const [showRuleVotingInterface, setShowRuleVotingInterface] = useState(false);
  const [selectedRuleField, setSelectedRuleField] = useState<string>('');
  const [selectedProposalId, setSelectedProposalId] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [organization.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesResponse, proposalsResponse] = await Promise.all([
        governanceApi.getGovernanceRules(organization.id),
        governanceApi.ruleProposalsApi.getRuleProposals(organization.id)
      ]);

      setGovernanceRules(rulesResponse.governanceRules);
      setRuleProposals(proposalsResponse.ruleProposals || []);
    } catch (error) {
      console.error('Failed to load governance data:', error);
      toast.error('Failed to load governance rules');
    } finally {
      setLoading(false);
    }
  };

  const getRuleDisplayInfo = (field: string) => {
    const ruleLabels: Record<string, { label: string; icon: any; category: string; description: string }> = {
      // Representative Elections
      representativeTermMonths: {
        label: 'Representative Term Length',
        icon: Clock,
        category: 'Elections',
        description: 'How long representatives serve before needing re-election'
      },
      representativeTermLimits: {
        label: 'Representative Term Limits',
        icon: Users,
        category: 'Elections',
        description: 'Maximum consecutive terms (empty = no limit)'
      },
      electionVotingMethod: {
        label: 'Election Voting Method',
        icon: Vote,
        category: 'Elections',
        description: 'How votes are counted in elections'
      },
      electionQuorumPercentage: {
        label: 'Election Quorum',
        icon: Users,
        category: 'Elections',
        description: 'Minimum participation required for valid election'
      },
      electionNoticeDays: {
        label: 'Election Notice Period',
        icon: Clock,
        category: 'Elections',
        description: 'Days notice before election starts'
      },

      // General Voting Rules
      defaultVotingDeadlineHours: {
        label: 'Default Voting Deadline',
        icon: Clock,
        category: 'Voting',
        description: 'Default time for votes to remain open'
      },
      defaultQuorumPercentage: {
        label: 'Default Quorum',
        icon: Users,
        category: 'Voting',
        description: 'Minimum participation for non-election votes'
      },
      anonymousVotingEnabled: {
        label: 'Anonymous Voting',
        icon: EyeOff,
        category: 'Voting',
        description: 'Hide voter identities by default'
      },
      voteChangeAllowed: {
        label: 'Vote Changes Allowed',
        icon: Settings,
        category: 'Voting',
        description: 'Allow members to change their votes'
      },

      // Representative Powers
      representativeCanCreateVotes: {
        label: 'Representatives Can Create Votes',
        icon: Vote,
        category: 'Permissions',
        description: 'Representatives can create policy implementation votes'
      },
      representativeCanInviteMembers: {
        label: 'Representatives Can Invite Members',
        icon: Users,
        category: 'Permissions',
        description: 'Representatives can send membership invitations'
      },
      representativeCanManageDocuments: {
        label: 'Representatives Can Manage Documents',
        icon: FileText,
        category: 'Permissions',
        description: 'Representatives can create and manage organization documents'
      },
      representativeApprovalRequired: {
        label: 'Representative Approval Required',
        icon: Shield,
        category: 'Permissions',
        description: 'Representative approval needed for major actions'
      },

      // Security & Compliance
      tamperProofEnabled: {
        label: 'Tamper-Proof Records',
        icon: Lock,
        category: 'Security',
        description: 'Cryptographically verify vote integrity'
      },
      auditTrailEnabled: {
        label: 'Audit Trail',
        icon: FileText,
        category: 'Security',
        description: 'Log all governance actions'
      }
    };

    return ruleLabels[field] || { label: field, icon: Settings, category: 'Other', description: '' };
  };

  const getCurrentValueDisplay = (field: string, value: any) => {
    if (value === null || value === undefined) return 'Not set';

    const numberFields = ['representativeTermMonths', 'representativeTermLimits', 'electionNoticeDays', 'defaultVotingDeadlineHours'];
    const percentageFields = ['electionQuorumPercentage', 'defaultQuorumPercentage'];
    const booleanFields = ['anonymousVotingEnabled', 'voteChangeAllowed', 'representativeCanCreateVotes', 'representativeCanInviteMembers', 'representativeCanManageDocuments', 'representativeApprovalRequired', 'tamperProofEnabled', 'auditTrailEnabled'];

    if (numberFields.includes(field)) {
      return `${value} ${field.includes('Hours') ? 'hours' : field.includes('Days') ? 'days' : 'months'}`;
    }
    if (percentageFields.includes(field)) return `${Math.round(value * 100)}%`;
    if (booleanFields.includes(field)) return value ? 'Enabled' : 'Disabled';
    if (field === 'electionVotingMethod') {
      return value.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    return String(value);
  };

  const getActiveProposalForRule = (ruleField: string) => {
    return ruleProposals.find(proposal =>
      proposal.ruleField === ruleField &&
      proposal.status === 'active'
    );
  };

  const handleRuleClick = (ruleField: string) => {
    const activeProposal = getActiveProposalForRule(ruleField);
    const draftProposal = ruleProposals.find(proposal =>
      proposal.ruleField === ruleField && proposal.status === 'draft'
    );

    if (activeProposal) {
      // Show voting interface for this proposal
      setSelectedProposalId(activeProposal.id);
      setShowRuleVotingInterface(true);
    } else if (draftProposal && isRepresentative) {
      // Show start voting option for draft proposals (representatives only)
      handleStartVoting(draftProposal.id);
    } else {
      // Show proposal dialog
      setSelectedRuleField(ruleField);
      setShowRuleProposalDialog(true);
    }
  };

  const handleStartVoting = async (proposalId: string) => {
    try {
      await governanceApi.ruleProposalsApi.startRuleProposalVoting(organization.id, proposalId);
      toast.success('Voting started successfully');
      loadData(); // Refresh to show updated status
    } catch (error) {
      console.error('Failed to start voting:', error);
      toast.error('Failed to start voting');
    }
  };

  const handleProposalSuccess = () => {
    setShowRuleProposalDialog(false);
    setSelectedRuleField('');
    loadData(); // Refresh data to show new proposal
  };

  const getRuleStatusBadge = (ruleField: string) => {
    const activeProposal = getActiveProposalForRule(ruleField);
    const draftProposal = ruleProposals.find(proposal =>
      proposal.ruleField === ruleField && proposal.status === 'draft'
    );

    if (activeProposal) {
      return (
        <Badge variant="secondary" className="bg-orange-100 text-orange-800">
          <Vote className="h-3 w-3 mr-1" />
          Voting Active
        </Badge>
      );
    }
    if (draftProposal) {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          <Settings className="h-3 w-3 mr-1" />
          Awaiting Approval
        </Badge>
      );
    }
    return null;
  };

  const groupRulesByCategory = () => {
    const categories: Record<string, Array<{ field: string; value: any; info: any }>> = {};

    if (!governanceRules) return categories;

    Object.entries(governanceRules).forEach(([field, value]) => {
      // Skip non-rule fields
      if (['id', 'organizationId', 'createdAt', 'updatedAt'].includes(field)) return;

      const info = getRuleDisplayInfo(field);
      if (!categories[info.category]) {
        categories[info.category] = [];
      }
      categories[info.category].push({ field, value, info });
    });

    return categories;
  };

  const ruleCategories = groupRulesByCategory();
  const isRepresentative = organization.representatives?.includes(currentUser.id);
  const isActiveMember = organization.members?.some(m => m.userId === currentUser.id && m.status === 'active') || false;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (showRuleVotingInterface) {
    return (
      <RuleProposalVotingInterface
        organization={organization}
        currentUser={currentUser}
        proposalId={selectedProposalId}
        onBack={() => {
          setShowRuleVotingInterface(false);
          setSelectedProposalId('');
          loadData(); // Refresh data after voting
        }}
        onVoteComplete={() => {
          loadData(); // Refresh data after voting
        }}
      />
    );
  }

  if (!governanceRules) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Governance rules have not been configured for this organization yet.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Governance Rules</h2>
          <p className="text-gray-600">Current rules governing {organization.name}</p>
        </div>
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Click on any rule to propose a change or vote on active proposals. Changes require member approval to take effect.
        </AlertDescription>
      </Alert>

      {Object.entries(ruleCategories).map(([category, rules]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {React.createElement(getRuleDisplayInfo(rules[0].field).icon, { className: "h-5 w-5" })}
              {category}
            </CardTitle>
            <CardDescription>
              {category === 'Elections' && 'Configure how representatives are elected and serve'}
              {category === 'Voting' && 'Default settings for all organization votes and decisions'}
              {category === 'Permissions' && 'What actions representatives can perform'}
              {category === 'Security' && 'Security and compliance settings'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {rules.map(({ field, value, info }) => {
              const activeProposal = getActiveProposalForRule(field);
              const statusBadge = getRuleStatusBadge(field);

              return (
                <div
                  key={field}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleRuleClick(field)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{info.label}</h4>
                      {statusBadge}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{info.description}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Current: {getCurrentValueDisplay(field, value)}
                      </Badge>
                      {activeProposal && (
                        <Badge variant="secondary" className="text-xs">
                          Proposal: {activeProposal.title}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeProposal ? (
                      <Button size="sm" variant="default">
                        <Vote className="h-4 w-4 mr-1" />
                        Vote Now
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline">
                        <Plus className="h-4 w-4 mr-1" />
                        Propose Change
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {/* Draft Proposals (Representatives Only) */}
      {isRepresentative && ruleProposals.filter(p => p.status === 'draft').length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Pending Proposals ({ruleProposals.filter(p => p.status === 'draft').length})
            </CardTitle>
            <CardDescription>
              Rule change proposals awaiting your approval to start voting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ruleProposals.filter(p => p.status === 'draft').map(proposal => (
                <div key={proposal.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex-1">
                    <h4 className="font-medium">{proposal.title}</h4>
                    <p className="text-sm text-gray-600">
                      Proposed by {proposal.createdBy.name} • {getRuleDisplayInfo(proposal.ruleField).label}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">{proposal.description}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartVoting(proposal.id);
                    }}
                  >
                    <Vote className="h-4 w-4 mr-1" />
                    Start Voting
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Proposals Summary */}
      {ruleProposals.filter(p => p.status === 'active').length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Vote className="h-5 w-5" />
              Active Proposals ({ruleProposals.filter(p => p.status === 'active').length})
            </CardTitle>
            <CardDescription>
              Rule changes currently being voted on by members
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ruleProposals.filter(p => p.status === 'active').map(proposal => (
                <div key={proposal.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <h4 className="font-medium">{proposal.title}</h4>
                    <p className="text-sm text-gray-600">
                      Proposed by {proposal.createdBy.name} • {getRuleDisplayInfo(proposal.ruleField).label}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => {
                    setSelectedProposalId(proposal.id);
                    setShowRuleVotingInterface(true);
                  }}>
                    <Vote className="h-4 w-4 mr-1" />
                    Vote
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rule Proposal Dialog */}
      {showRuleProposalDialog && (
        <RuleProposalDialog
          organization={organization}
          currentUser={currentUser}
          open={showRuleProposalDialog}
          onOpenChange={setShowRuleProposalDialog}
          initialRuleField={selectedRuleField}
          onSuccess={handleProposalSuccess}
        />
      )}
    </div>
  );
}
