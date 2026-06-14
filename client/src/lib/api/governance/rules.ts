// Governance Rules API functions
import { apiRequest } from '../client';
import type { OrganizationGovernanceRules } from '../../../types';
import type { 
  GovernanceRulesResponse
} from '../types';

export const rulesApi = {
  // Governance Rules
  async getGovernanceRules(organizationId: string): Promise<GovernanceRulesResponse> {
    return apiRequest<GovernanceRulesResponse>(`/api/governance/${organizationId}/governance-rules`)
  },

  async updateGovernanceRules(organizationId: string, updates: Partial<OrganizationGovernanceRules>): Promise<GovernanceRulesResponse> {
    return apiRequest<GovernanceRulesResponse>(`/api/governance/${organizationId}/governance-rules`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  },

  // Permissions
  async getPermissions(organizationId: string): Promise<{
    success: boolean;
    permissions: {
      canProposeRules: boolean;
      canCreateDocuments: boolean;
      canInitializeElections: boolean;
      canInviteMembers: boolean;
      canManageRuleProposals: boolean;
      canVoteInElections: boolean;
      canViewAnalytics: boolean;
      canExportData: boolean;
      canManageOrganization: boolean;
    };
    context: {
      isRepresentative: boolean;
      isActiveMember: boolean;
      isAdmin: boolean;
      bootstrapMode: boolean;
      recoveryMode: boolean;
    };
  }> {
    return apiRequest(`/api/governance/${organizationId}/permissions`)
  },

  // Bootstrap Status
  async getBootstrapStatus(organizationId: string): Promise<{
    success: boolean;
    bootstrap: {
      mode: boolean;
      completedAt: string | null;
      progress: {
        completed: number;
        total: number;
        checklist: Array<{
          rule: string;
          completed: boolean;
          proposalId?: string;
        }>;
      };
      canComplete: boolean;
      daysRemaining: number | null;
    };
  }> {
    return apiRequest(`/api/governance/${organizationId}/bootstrap-status`)
  },

  // Complete Bootstrap
  async completeBootstrap(organizationId: string, confirm: boolean): Promise<{
    success: boolean;
    message: string;
    bootstrap: {
      mode: boolean;
      completedAt: string;
    };
  }> {
    return apiRequest(`/api/governance/${organizationId}/bootstrap/complete`, {
      method: 'POST',
      body: JSON.stringify({ confirm }),
    })
  },

  // Validate Rule Change
  async validateRuleChange(organizationId: string, ruleField: string, proposedValue: unknown): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    conflicts: Array<{
      type: 'dependency' | 'deadlock' | 'cooldown' | 'duplicate';
      message: string;
      details?: unknown;
    }>;
  }> {
    return apiRequest(`/api/governance/${organizationId}/validate-rule-change`, {
      method: 'POST',
      body: JSON.stringify({ ruleField, proposedValue }),
    })
  },

  // Rule History
  async getRuleHistory(organizationId: string, options?: {
    ruleField?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    success: boolean;
    history: Array<{
      id: string;
      ruleField: string;
      oldValue: unknown;
      newValue: unknown;
      changedBy: {
        userId: string;
        userName: string;
        proposalId?: string;
      };
      changedAt: string;
    }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const params = new URLSearchParams();
    if (options?.ruleField) params.append('ruleField', options.ruleField);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const query = params.toString();
    return apiRequest(`/api/governance/${organizationId}/rule-history${query ? `?${query}` : ''}`)
  },
};

