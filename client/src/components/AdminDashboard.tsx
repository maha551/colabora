import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Organization } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Icon } from './ui/Icon';
import { LoadingState } from './ui/LoadingState';
import { adminApi, errorReportsApi, type ErrorReport, type ErrorReportStats } from '../lib/api';
import type { AdminOrganizationListItem, AdminUserListItem, AdminDashboardStats } from '../lib/api/types/admin';
import { AdminOrganizationPanel } from './admin/AdminOrganizationPanel';
import { AdminOpsPanel } from './admin/AdminOpsPanel';
import { AdminAuditPanel } from './admin/AdminAuditPanel';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import { useTimezone } from '../hooks/useTimezone';
import { SPACING, COLORS } from '../lib/designSystem';
import { cn } from './ui/utils';

interface AdminStats {
  totalUsers: number;
  totalOrganizations: number;
  totalDocuments: number;
  activeOrganizations: number;
}

interface AdminUser extends User {
  organizationsCount: number;
  isActive?: boolean;
  suspendedAt?: string | null;
}

interface AdminOrganization extends Organization {
  memberCount: number;
  documentCount: number;
  createdByName: string;
}

interface AdminDashboardProps {
  currentUser: User;
  onBack: () => void;
  onOrganizationCreated?: () => void;
  onAdminOpenOrganization?: (organization: Organization) => void;
}

// Searchable Multi-Select Component for Representatives
interface RepresentativeSelectorProps {
  users: AdminUser[];
  selectedRepresentatives: string[];
  onSelectionChange: (selectedIds: string[]) => void;
}

function RepresentativeSelector({ users, selectedRepresentatives, onSelectionChange }: RepresentativeSelectorProps) {
  const { t } = useTranslation('admin');
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchValue.toLowerCase()) ||
    user.email.toLowerCase().includes(searchValue.toLowerCase())
  );

  const selectedUsers = users.filter(user => selectedRepresentatives.includes(user.id));

  return (
    <div className="space-y-2">
      <Label>{t('createOrg.selectRepresentatives')}</Label>
      <p className="text-sm text-muted-foreground">
        {t('createOrg.selectRepresentativesHelp')}
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
              ? t('createOrg.representativesSelected', { count: selectedUsers.length })
              : t('createOrg.selectRepresentativesPlaceholder')}
            <Icon name="ChevronsUpDown" className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="z-[110] w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder={t('createOrg.searchUsers')}
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandEmpty>{t('createOrg.noUsersFound')}</CommandEmpty>
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
                    <Icon
                      name="Check"
                      className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')}
                    />
                    <div className="flex flex-col">
                      <span>{user.name}</span>
                      <span className="text-sm text-muted-foreground">{user.email}</span>
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
              <Icon
                name="X"
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

export function AdminDashboard({ currentUser, onBack, onOrganizationCreated, onAdminOpenOrganization }: AdminDashboardProps) {
  const { t } = useTranslation('admin');
  const { formatDate, formatDateTime } = useTimezone();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [organizations, setOrganizations] = useState<AdminOrganization[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [createOrgDialogOpen, setCreateOrgDialogOpen] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [errorReports, setErrorReports] = useState<ErrorReport[]>([]);
  const [errorReportStats, setErrorReportStats] = useState<ErrorReportStats | null>(null);
  const [loadingErrorReports, setLoadingErrorReports] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ErrorReport | null>(null);
  const [reportStatusFilter, setReportStatusFilter] = useState<string>('all');
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(25);
  const [reportTotal, setReportTotal] = useState(0);
  const [activeTab, setActiveTab] = useState('organizations');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrgSummary, setSelectedOrgSummary] = useState<AdminOrganizationListItem | null>(null);
  const [orgPanelOpen, setOrgPanelOpen] = useState(false);
  const [suspendDialogUser, setSuspendDialogUser] = useState<AdminUser | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  // Form state for organization creation
  const [orgForm, setOrgForm] = useState({
    name: '',
    description: '',
    representatives: [] as string[],
    representativeEmails: [] as string[],
    representativeMode: 'select' as 'select' | 'email', // 'select' for existing users, 'email' for email invitations
    membershipPolicy: 'invitation' as 'open' | 'invitation',
    votingThreshold: 75,
    governanceRules: {
      representativeTermMonths: 12,
      electionVotingMethod: 'simple_majority' as 'simple_majority' | 'ranked_choice' | 'approval',
      electionQuorumPercentage: 50,
      defaultVotingDeadlineHours: 168,
      documentProposalPeriodDays: 365,
      paragraphProposalCutoffDays: 7
    }
  });
  const [representativeEmailsText, setRepresentativeEmailsText] = useState('');

  // Reset form to defaults when dialog opens
  useEffect(() => {
    if (createOrgDialogOpen) {
      setOrgForm({
        name: '',
        description: '',
        representatives: [] as string[],
        representativeEmails: [] as string[],
        representativeMode: 'select' as 'select' | 'email',
        membershipPolicy: 'invitation' as 'open' | 'invitation',
        votingThreshold: 75,
        governanceRules: {
          representativeTermMonths: 12,
          electionVotingMethod: 'simple_majority' as 'simple_majority' | 'ranked_choice' | 'approval',
          electionQuorumPercentage: 50,
          defaultVotingDeadlineHours: 168,
          documentProposalPeriodDays: 365,
          paragraphProposalCutoffDays: 7
        }
      });
      setRepresentativeEmailsText('');
    }
  }, [createOrgDialogOpen]);

  useEffect(() => {
    loadDashboardData();
    loadErrorReports();
  }, [reportStatusFilter, reportPage, reportPageSize]);

  const loadDashboardData = useCallback(async () => {
    if (refreshing) return; // Prevent multiple simultaneous refreshes
    setRefreshing(true);
    if (!loading) setLoading(true);
    try {
      const [statsResponse, orgsResponse, usersResponse] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.listOrganizations(),
        adminApi.listUsers()
      ]);

      setStats({
        totalUsers: Number((statsResponse.stats as AdminDashboardStats).totalUsers ?? 0),
        totalOrganizations: Number((statsResponse.stats as AdminDashboardStats).totalOrganizations ?? 0),
        totalDocuments: Number((statsResponse.stats as AdminDashboardStats).totalDocuments ?? 0),
        activeOrganizations: Number((statsResponse.stats as AdminDashboardStats).activeOrganizations ?? 0),
      });
      setOrganizations(orgsResponse.organizations || []);
      setUsers(usersResponse.users || []);
    } catch (error) {
      logger.error('Failed to load admin dashboard:', error);
      toast.error(t('toasts.failedToLoadDashboard'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // Empty deps - function doesn't depend on any props/state that should trigger recreation

  // Refresh organizations data when switching to organizations tab
  useEffect(() => {
    if (activeTab === 'organizations') {
      loadDashboardData();
    }
  }, [activeTab, loadDashboardData]);

  const loadErrorReports = async () => {
    setLoadingErrorReports(true);
    try {
      const offset = (reportPage - 1) * reportPageSize;
      const [reportsResponse, statsResponse] = await Promise.all([
        errorReportsApi.getReports(
          reportStatusFilter === 'all' ? undefined : reportStatusFilter,
          reportPageSize,
          offset
        ),
        errorReportsApi.getStats()
      ]);

      setErrorReports(reportsResponse.reports || []);
      setErrorReportStats(statsResponse);
      // Update total from stats if available, otherwise estimate from current page
      if (statsResponse.total !== undefined) {
        setReportTotal(statsResponse.total);
      } else {
        // Estimate: if we got a full page, there might be more
        setReportTotal(reportsResponse.reports.length === reportPageSize 
          ? (reportPage * reportPageSize) + 1 
          : (reportPage - 1) * reportPageSize + reportsResponse.reports.length);
      }
    } catch (error) {
      logger.error('Failed to load error reports:', error);
      toast.error(t('toasts.failedToLoadErrorReports'));
    } finally {
      setLoadingErrorReports(false);
    }
  };

  const handleUpdateReportStatus = async (
    reportId: string, 
    status?: ErrorReport['status'], 
    priority?: ErrorReport['priority'],
    assignedTo?: string,
    resolutionNotes?: string
  ) => {
    try {
      const updates: {
        status?: ErrorReport['status'];
        priority?: ErrorReport['priority'];
        assigned_to?: string;
        resolution_notes?: string;
      } = {};
      
      if (status !== undefined) updates.status = status;
      if (priority !== undefined) updates.priority = priority;
      if (assignedTo !== undefined) updates.assigned_to = assignedTo;
      if (resolutionNotes !== undefined) updates.resolution_notes = resolutionNotes;

      await errorReportsApi.updateReport(reportId, updates);
      toast.success(t('toasts.reportUpdated'));
      
      // Reload reports to get fresh data
      const offset = (reportPage - 1) * reportPageSize;
      const [reportsResponse, statsResponse] = await Promise.all([
        errorReportsApi.getReports(
          reportStatusFilter === 'all' ? undefined : reportStatusFilter,
          reportPageSize,
          offset
        ),
        errorReportsApi.getStats()
      ]);

      setErrorReports(reportsResponse.reports || []);
      setErrorReportStats(statsResponse);
      
      // Update selected report if it's the one being updated
      if (selectedReport?.id === reportId) {
        const updatedReport = reportsResponse.reports.find(r => r.id === reportId);
        if (updatedReport) {
          setSelectedReport(updatedReport);
        }
      }
    } catch (error) {
      logger.error('Failed to update report:', error);
      toast.error(t('toasts.failedToUpdateReport'));
    }
  };

  const handleCreateOrganization = async () => {
    const trimmedName = orgForm.name.trim();
    if (!trimmedName) {
      toast.error(t('toasts.pleaseEnterOrgName'));
      return;
    }

    if (trimmedName.length < 2) {
      toast.error(t('toasts.orgNameMin'));
      return;
    }

    if (trimmedName.length > 100) {
      toast.error(t('toasts.orgNameMax'));
      return;
    }

    // Validate based on mode
    if (orgForm.representativeMode === 'select' && orgForm.representatives.length === 0) {
      toast.error(t('toasts.pleaseSelectRepresentative'));
      return;
    }

    if (orgForm.representativeMode === 'email' && orgForm.representativeEmails.length === 0) {
      toast.error(t('toasts.pleaseEnterRepresentativeEmail'));
      return;
    }

    setCreatingOrg(true);
    try {
      // Ensure defaults are always applied with proper types
      const membershipPolicy: 'open' | 'invitation' = (orgForm.membershipPolicy === 'open' || orgForm.membershipPolicy === 'invitation')
        ? orgForm.membershipPolicy
        : 'invitation';
      
      const votingThresholdValue = orgForm.votingThreshold;
      const votingThreshold = (typeof votingThresholdValue === 'number' && !isNaN(votingThresholdValue) && votingThresholdValue > 0)
        ? votingThresholdValue / 100 // Convert percentage to decimal
        : 0.75; // Default to 75% if invalid

      const requestBody: {
        name: string;
        membershipPolicy: 'open' | 'invitation';
        votingThreshold: number;
      } = {
        name: trimmedName,
        membershipPolicy: membershipPolicy,
        votingThreshold: votingThreshold,
      };

      // Debug logging (remove in production)
      logger.log('Creating organization with body:', {
        name: requestBody.name,
        membershipPolicy: requestBody.membershipPolicy,
        votingThreshold: requestBody.votingThreshold,
        membershipPolicyType: typeof requestBody.membershipPolicy,
        votingThresholdType: typeof requestBody.votingThreshold,
        orgFormState: {
          membershipPolicy: orgForm.membershipPolicy,
          votingThreshold: orgForm.votingThreshold
        }
      });

      // Only include description if it's not empty (backend validation expects optional but if provided must be valid)
      const trimmedDescription = orgForm.description.trim();
      if (trimmedDescription) {
        if (trimmedDescription.length > 500) {
          toast.error(t('toasts.descriptionMax'));
          setCreatingOrg(false);
          return;
        }
        requestBody.description = trimmedDescription;
      }

      // Include governanceRules with all required fields
      requestBody.governanceRules = {
        representativeTermMonths: orgForm.governanceRules.representativeTermMonths,
        electionVotingMethod: orgForm.governanceRules.electionVotingMethod,
        electionQuorumPercentage: orgForm.governanceRules.electionQuorumPercentage / 100,
        defaultVotingDeadlineHours: orgForm.governanceRules.defaultVotingDeadlineHours,
        documentProposalPeriodDays: orgForm.governanceRules.documentProposalPeriodDays,
        paragraphProposalCutoffDays: orgForm.governanceRules.paragraphProposalCutoffDays
      };

      // Add representatives or representativeEmails based on mode
      if (orgForm.representativeMode === 'select') {
        requestBody.representatives = orgForm.representatives;
        logger.log('Sending representatives (select mode):', orgForm.representatives);
      } else {
        requestBody.representativeEmails = orgForm.representativeEmails;
        logger.log('Sending representativeEmails (email mode):', {
          mode: orgForm.representativeMode,
          emails: orgForm.representativeEmails,
          emailCount: orgForm.representativeEmails.length,
          requestBodyKeys: Object.keys(requestBody)
        });
      }

      logger.log('Final request body before sending:', {
        ...requestBody,
        representativeEmails: requestBody.representativeEmails,
        representatives: requestBody.representatives
      });

      const response = await adminApi.createOrganization(requestBody);

      const successMessage = response.message || t('toasts.orgCreated');
      toast.success(successMessage);
      setCreateOrgDialogOpen(false);
      setOrgForm({
        name: '',
        description: '',
        representatives: [],
        representativeEmails: [],
        representativeMode: 'select',
        membershipPolicy: 'invitation',
        votingThreshold: 75,
        governanceRules: {
          representativeTermMonths: 12,
          electionVotingMethod: 'simple_majority',
          electionQuorumPercentage: 50,
          defaultVotingDeadlineHours: 168,
          documentProposalPeriodDays: 365,
          paragraphProposalCutoffDays: 7
        }
      });
      setRepresentativeEmailsText('');
      loadDashboardData(); // Refresh admin dashboard data
      
      // Trigger organization list refresh for all users (including members)
      if (onOrganizationCreated) {
        onOrganizationCreated();
      }
    } catch (error: unknown) {
      logger.error('Failed to create organization:', error);
      let errorMessage = t('toasts.failedToCreateOrg');
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = String((error as { message: unknown }).message);
      }
      
      if (typeof error === 'object' && error !== null) {
        // Check for field-specific validation errors
        if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
          const fieldMessages = Object.entries(error.fieldErrors)
            .map(([field, msg]) => `${field}: ${msg}`)
            .join(', ');
          errorMessage = t('toasts.validationFailed', { details: fieldMessages });
        } else if (error.details) {
          // Check if details is an array of field errors
          if (Array.isArray(error.details)) {
            const fieldMessages = error.details
              .map((detail: { field?: string; message?: string; msg?: string; error?: string }) => detail.field ? `${detail.field}: ${detail.message || detail.msg || detail.error}` : detail.message || detail.msg || detail.error)
              .join(', ');
            errorMessage = t('toasts.validationFailed', { details: fieldMessages });
          } else if (typeof error.details === 'string') {
            errorMessage = error.details;
          } else if (error.details.details && Array.isArray(error.details.details)) {
            const fieldMessages = error.details.details
              .map((detail: { field?: string; message?: string; msg?: string; error?: string }) => detail.field ? `${detail.field}: ${detail.message || detail.msg || detail.error}` : detail.message || detail.msg || detail.error)
              .join(', ');
            errorMessage = t('toasts.validationFailed', { details: fieldMessages });
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
      }
      
      toast.error(errorMessage);
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleToggleOrganizationStatus = async (orgId: string, isActive: boolean) => {
    try {
      await adminApi.setOrganizationStatus(orgId, !isActive);
      toast.success(t('toasts.orgStatusUpdated', { action: !isActive ? 'activated' : 'deactivated' }));
      loadDashboardData(); // Refresh data
    } catch (error) {
      logger.error('Failed to update organization status:', error);
      toast.error(t('toasts.failedToUpdateOrgStatus'));
    }
  };

  const handlePromoteUser = async (userId: string) => {
    try {
      await adminApi.promoteAdmin(userId);
      toast.success(t('toasts.userPromoted'));
      loadDashboardData();
    } catch (error) {
      logger.error('Failed to promote user:', error);
      toast.error(t('toasts.failedToPromoteUser'));
    }
  };

  const handleDemoteUser = async (userId: string) => {
    try {
      await adminApi.demoteAdmin(userId);
      toast.success(t('users.demoted'));
      loadDashboardData();
    } catch (error) {
      logger.error('Failed to demote user:', error);
      toast.error(t('users.demoteFailed'));
    }
  };

  const handleSuspendUser = async (user: AdminUser, isActive: boolean, reason?: string) => {
    try {
      await adminApi.updateUserStatus(user.id, isActive, reason);
      toast.success(isActive ? t('users.unsuspended') : t('users.suspended'));
      setSuspendDialogUser(null);
      setSuspendReason('');
      loadDashboardData();
    } catch (error) {
      logger.error('Failed to update user status:', error);
      toast.error(t('users.statusFailed'));
    }
  };

  const openOrgPanel = (org: AdminOrganization) => {
    setSelectedOrgSummary({
      id: org.id,
      name: org.name,
      description: org.description,
      memberCount: org.memberCount,
      documentCount: org.documentCount,
      isActive: org.isActive,
      createdByName: org.createdByName,
      createdAt: org.createdAt,
    });
    setOrgPanelOpen(true);
  };

  if (loading) {
    return (
      <div className={cn('min-h-screen', SPACING.layout.containPage, 'flex items-center justify-center')}>
        <div className="text-center">
          <LoadingState isLoading={true} mode="spinner" spinnerSize="lg" className="mx-auto mb-4">
            <span />
          </LoadingState>
          <p className="text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen', SPACING.layout.containPage)}>
      <div className={cn('max-w-4xl mx-auto min-w-0', SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
      {/* Description */}
      <div className="mb-8">
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('stats.totalUsers')}</CardTitle>
              <Icon name="Users" className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('stats.organizations')}</CardTitle>
              <Icon name="Users" className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOrganizations}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeOrganizations} {t('stats.active')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('stats.documents')}</CardTitle>
              <Icon name="FileText" className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDocuments}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('stats.yourRole')}</CardTitle>
              <Icon name="Shield" className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{t('stats.admin')}</div>
              <p className="text-xs text-muted-foreground">
                {currentUser.email}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Organization Button */}
      <div className={SPACING.section.margin}>
        <Dialog open={createOrgDialogOpen} onOpenChange={setCreateOrgDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Icon name="Plus" className="h-4 w-4" />
              {t('createOrg.button')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('createOrg.title')}</DialogTitle>
              <DialogDescription>
                {t('createOrg.description')}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="basic">{t('createOrg.tabBasic')}</TabsTrigger>
                <TabsTrigger value="representatives">{t('createOrg.tabRepresentatives')}</TabsTrigger>
                <TabsTrigger value="governance">{t('createOrg.tabGovernance')}</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="org-name">{t('createOrg.orgName')}</Label>
                    <Input
                      id="org-name"
                      value={orgForm.name}
                      onChange={(e) => setOrgForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder={t('createOrg.orgNamePlaceholder')}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="org-description">{t('createOrg.descriptionLabel')}</Label>
                    <Input
                      id="org-description"
                      value={orgForm.description}
                      onChange={(e) => setOrgForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder={t('createOrg.descriptionPlaceholder')}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="membership-policy">{t('createOrg.membershipPolicy')}</Label>
                    <Select
                      value={orgForm.membershipPolicy || 'invitation'}
                      onValueChange={(value: 'open' | 'invitation') =>
                        setOrgForm(prev => ({ ...prev, membershipPolicy: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invitation">{t('createOrg.invitationOnly')}</SelectItem>
                        <SelectItem value="open">{t('createOrg.openMembership')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="voting-threshold">{t('createOrg.votingThreshold')}</Label>
                    <Input
                      id="voting-threshold"
                      type="number"
                      min="1"
                      max="100"
                      value={orgForm.votingThreshold || 75}
                      onChange={(e) => setOrgForm(prev => ({
                        ...prev,
                        votingThreshold: parseInt(e.target.value) || 75
                      }))}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="representatives" className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('createOrg.representativeMethod')}</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="rep-mode"
                          value="select"
                          checked={orgForm.representativeMode === 'select'}
                          onChange={(e) => setOrgForm(prev => ({ ...prev, representativeMode: 'select' as const }))}
                          className="w-4 h-4"
                        />
                        <span>{t('createOrg.selectExistingUsers')}</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="rep-mode"
                          value="email"
                          checked={orgForm.representativeMode === 'email'}
                          onChange={(e) => setOrgForm(prev => ({ ...prev, representativeMode: 'email' as const }))}
                          className="w-4 h-4"
                        />
                        <span>{t('createOrg.inviteViaEmail')}</span>
                      </label>
                    </div>
                  </div>

                  {orgForm.representativeMode === 'select' ? (
                    <RepresentativeSelector
                      users={users}
                      selectedRepresentatives={orgForm.representatives}
                      onSelectionChange={(selectedIds) =>
                        setOrgForm(prev => ({ ...prev, representatives: selectedIds }))
                      }
                    />
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="rep-emails">{t('createOrg.representativeEmails')}</Label>
                      <Textarea
                        id="rep-emails"
                        placeholder={t('createOrg.representativeEmailsPlaceholder')}
                        value={representativeEmailsText}
                        onChange={(e) => {
                          setRepresentativeEmailsText(e.target.value);
                          // Parse emails
                          const emailList = e.target.value
                            .split(/[\n,;]/)
                            .map(email => email.trim().toLowerCase())
                            .filter(email => email.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
                          setOrgForm(prev => ({ ...prev, representativeEmails: emailList }));
                        }}
                        rows={6}
                        className="font-mono text-sm"
                      />
                      <p className="text-sm text-muted-foreground">
                        {t('createOrg.representativeEmailsHelp')}
                      </p>
                      {orgForm.representativeEmails.length > 0 && (
                        <div className="mt-2 p-3 bg-muted rounded border">
                          <p className="text-sm font-medium mb-2">
                            {t('createOrg.emailsWillBeInvited', { count: orgForm.representativeEmails.length })}:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {orgForm.representativeEmails.map((email, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {email}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {representativeEmailsText && orgForm.representativeEmails.length === 0 && (
                        <p className={`text-sm ${COLORS.status.error}`}>
                          {t('createOrg.pleaseEnterValidEmails')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="governance" className="space-y-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rep-term">{t('createOrg.repTermMonths')}</Label>
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
                    <Label htmlFor="election-method">{t('createOrg.electionMethod')}</Label>
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
                    <Label htmlFor="election-quorum">{t('createOrg.electionQuorum')}</Label>
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
                    <Label htmlFor="voting-deadline">{t('createOrg.defaultVotingDeadline')}</Label>
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
                    <Label htmlFor="proposal-period">{t('createOrg.documentProposalPeriod')}</Label>
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

                  <div className="grid gap-2">
                    <Label htmlFor="paragraph-cutoff">{t('createOrg.paragraphProposalCutoff')}</Label>
                    <Input
                      id="paragraph-cutoff"
                      type="number"
                      min="0"
                      max="365"
                      value={orgForm.governanceRules.paragraphProposalCutoffDays}
                      onChange={(e) => setOrgForm(prev => ({
                        ...prev,
                        governanceRules: {
                          ...prev.governanceRules,
                          paragraphProposalCutoffDays: parseInt(e.target.value) || 7
                        }
                      }))}
                    />
                    <p className="text-xs text-muted-foreground">{t('createOrg.paragraphCutoffHelp')}</p>
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
                {t('createOrg.cancel')}
              </Button>
              <Button onClick={handleCreateOrganization} disabled={creatingOrg}>
                {creatingOrg ? t('createOrg.creating') : t('createOrg.create')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className={cn('w-full flex flex-row', SPACING.content.inline)}>
        <TabsList className="flex flex-col w-48 h-fit">
          <TabsTrigger value="organizations" className="w-full justify-start">{t('tabs.organizations')}</TabsTrigger>
          <TabsTrigger value="users" className="w-full justify-start">{t('tabs.users')}</TabsTrigger>
          <TabsTrigger value="operations" className="w-full justify-start">{t('tabs.operations')}</TabsTrigger>
          <TabsTrigger value="audit" className="w-full justify-start">{t('tabs.audit')}</TabsTrigger>
          <TabsTrigger value="error-reports" className="w-full justify-start">
            <Icon name="Bug" className="h-4 w-4 mr-2" />
            {t('tabs.errorReports')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organizations" className={cn(SPACING.content.gap, 'flex-1')}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('organizations.title')}</CardTitle>
                  <CardDescription>
                    {t('organizations.description')}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadDashboardData}
                  disabled={refreshing || loading}
                  className="gap-2"
                >
                  <Icon name="RefreshCw" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {organizations.length === 0 ? (
                <div className={cn('text-center text-muted-foreground', SPACING.page.y)}>
                  {t('organizations.noOrganizations')}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('organizations.name')}</TableHead>
                      <TableHead>{t('organizations.createdBy')}</TableHead>
                      <TableHead>{t('organizations.members')}</TableHead>
                      <TableHead>{t('organizations.documents')}</TableHead>
                      <TableHead>{t('organizations.status')}</TableHead>
                      <TableHead>{t('organizations.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organizations.map((org) => (
                      <TableRow key={org.id}>
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell>{org.createdByName || t('organizations.unknown')}</TableCell>
                        <TableCell>{org.memberCount}</TableCell>
                        <TableCell>{org.documentCount}</TableCell>
                        <TableCell>
                          <Badge variant={org.isActive ? "default" : "secondary"}>
                            {org.isActive ? t('organizations.active') : t('organizations.inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => openOrgPanel(org)}>
                              {t('orgPanel.manage')}
                            </Button>
                            <Button
                              size="sm"
                              variant={org.isActive ? "destructive" : "default"}
                              onClick={() => handleToggleOrganizationStatus(org.id, org.isActive)}
                            >
                            {org.isActive ? (
                              <>
                                <Icon name="EyeOff" className="h-3 w-3 mr-1" />
                                {t('organizations.deactivate')}
                              </>
                            ) : (
                              <>
                                <Icon name="Eye" className="h-3 w-3 mr-1" />
                                {t('organizations.activate')}
                              </>
                            )}
                          </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className={cn(SPACING.content.gap, 'flex-1')}>
          <Card>
            <CardHeader>
              <CardTitle>{t('users.title')}</CardTitle>
              <CardDescription>
                {t('users.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <div className={cn('text-center text-muted-foreground', SPACING.page.y)}>
                  No users found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Organizations</TableHead>
                      <TableHead>{t('users.joined')}</TableHead>
                      <TableHead>{t('users.actions')}</TableHead>
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
                        {user.isActive === false && (
                          <Badge variant="destructive" className="ml-1">{t('users.suspended')}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{user.organizationsCount}</TableCell>
                      <TableCell>{formatDate(user.createdAt ?? user.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.id !== currentUser.id && user.role !== 'admin' && (
                            <Button size="sm" onClick={() => handlePromoteUser(user.id)}>
                              <Icon name="UserCheck" className="h-3 w-3 mr-1" />
                              {t('users.promoteToAdmin')}
                            </Button>
                          )}
                          {user.id !== currentUser.id && user.role === 'admin' && (
                            <Button size="sm" variant="outline" onClick={() => handleDemoteUser(user.id)}>
                              {t('users.demoteAdmin')}
                            </Button>
                          )}
                          {user.id !== currentUser.id && (
                            user.isActive === false ? (
                              <Button size="sm" variant="outline" onClick={() => handleSuspendUser(user, true)}>
                                {t('users.unsuspend')}
                              </Button>
                            ) : (
                              <Button size="sm" variant="destructive" onClick={() => setSuspendDialogUser(user)}>
                                {t('users.suspend')}
                              </Button>
                            )
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operations" className="space-y-4 flex-1">
          <AdminOpsPanel />
        </TabsContent>

        <TabsContent value="audit" className="space-y-4 flex-1">
          <AdminAuditPanel />
        </TabsContent>

        <TabsContent value="error-reports" className="space-y-4 flex-1">
          {errorReportStats && (
            <>
              {/* Status Stats */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.totalReports')}</CardTitle>
                    <Icon name="Bug" className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{errorReportStats.total || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.new')}</CardTitle>
                    <Icon name="AlertCircle" className={`h-4 w-4 ${COLORS.status.active}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{errorReportStats.byStatus?.new || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.inProgress')}</CardTitle>
                    <Icon name="AlertCircle" className={`h-4 w-4 ${COLORS.status.info}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{errorReportStats.byStatus?.in_progress || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('reports.resolved')}</CardTitle>
                    <Icon name="AlertCircle" className={`h-4 w-4 ${COLORS.status.success}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{errorReportStats.byStatus?.resolved || 0}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Priority Stats */}
              {errorReportStats.byPriority && (
                <div className="grid gap-4 md:grid-cols-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">{t('reports.critical')}</CardTitle>
                      <Icon name="AlertCircle" className={`h-4 w-4 ${COLORS.status.error}`} />
                    </CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${COLORS.status.error}`}>
                        {errorReportStats.byPriority.critical || 0}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
<CardTitle className="text-sm font-medium">{t('reports.high')}</CardTitle>
                    <Icon name="AlertCircle" className={`h-4 w-4 ${COLORS.status.active}`} />
                    </CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${COLORS.status.active}`}>
                        {errorReportStats.byPriority.high || 0}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">{t('reports.medium')}</CardTitle>
                      <Icon name="AlertCircle" className={`h-4 w-4 ${COLORS.status.warning}`} />
                    </CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${COLORS.status.warning}`}>
                        {errorReportStats.byPriority.medium || 0}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">{t('reports.low')}</CardTitle>
                      <Icon name="AlertCircle" className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-muted-foreground">
                        {errorReportStats.byPriority.low || 0}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('reports.title')}</CardTitle>
                  <CardDescription>
                    {t('reports.description')}
                  </CardDescription>
                </div>
                <Select value={reportStatusFilter} onValueChange={setReportStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t('reports.filterByStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('reports.allStatuses')}</SelectItem>
                    <SelectItem value="new">{t('reports.new')}</SelectItem>
                    <SelectItem value="in_progress">{t('reports.inProgress')}</SelectItem>
                    <SelectItem value="resolved">{t('reports.resolved')}</SelectItem>
                    <SelectItem value="dismissed">{t('reports.dismissed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingErrorReports ? (
                <div className="py-8 flex justify-center">
                  <LoadingState isLoading={true} mode="spinner" spinnerSize="md">
                    <span />
                  </LoadingState>
                </div>
              ) : errorReports.length === 0 ? (
                <div className={cn('text-center text-muted-foreground', SPACING.page.y)}>
                  {t('reports.noReports')}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('reports.tableTitle')}</TableHead>
                      <TableHead>{t('reports.tableUser')}</TableHead>
                      <TableHead>{t('reports.assignedTo')}</TableHead>
                      <TableHead>{t('reports.statusLabel')}</TableHead>
                      <TableHead>{t('reports.priority')}</TableHead>
                      <TableHead>{t('reports.date')}</TableHead>
                      <TableHead>{t('organizations.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errorReports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="font-medium max-w-xs truncate">
                          {report.title}
                        </TableCell>
                        <TableCell>
                          {(report.userEmail ?? report.user_email) || (report.userId ?? report.user_id) || t('reports.anonymous')}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const assignedToId = report.assignedTo ?? report.assigned_to;
                            if (!assignedToId) return <span className="text-muted-foreground">{t('reports.unassigned')}</span>;
                            const assignedUser = users.find(u => u.id === assignedToId);
                            return assignedUser ? (assignedUser.name || assignedUser.email) : assignedToId;
                          })()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              report.status === 'resolved'
                                ? 'default'
                                : report.status === 'in_progress'
                                ? 'secondary'
                                : 'destructive'
                            }
                          >
                            {report.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              report.priority === 'critical'
                                ? 'destructive'
                                : report.priority === 'high'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {report.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatDate(report.createdAt ?? report.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedReport(report)}
                            >
                              <Icon name="Eye" className="h-3 w-3 mr-1" />
                              {t('reports.view')}
                            </Button>
                            {report.status !== 'resolved' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleUpdateReportStatus(report.id, 'resolved')
                                }
                              >
                                {t('reports.resolve')}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Pagination Controls */}
              {!loadingErrorReports && errorReports.length > 0 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">{t('reports.pageSize')}</Label>
                    <Select
                      value={reportPageSize.toString()}
                      onValueChange={(value) => {
                        setReportPageSize(parseInt(value));
                        setReportPage(1); // Reset to first page when changing page size
                      }}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReportPage(p => Math.max(1, p - 1))}
                      disabled={reportPage === 1}
                    >
                      {t('reports.previous')}
                    </Button>
                    <span className="text-sm">
                      {t('reports.pageOf', { current: reportPage, total: Math.ceil(reportTotal / reportPageSize) || 1 })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReportPage(p => p + 1)}
                      disabled={reportPage * reportPageSize >= reportTotal}
                    >
                      {t('reports.next')}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Error Report Detail Dialog */}
      {selectedReport && (
        <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedReport.title}</DialogTitle>
              <DialogDescription>
                {t('reports.submittedOn', { date: formatDateTime(selectedReport.createdAt ?? selectedReport.created_at) })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">{t('reports.descriptionLabel')}</Label>
                <p className="mt-1 text-sm">{selectedReport.description}</p>
              </div>

              {(selectedReport.errorMessage ?? selectedReport.error_message) && (
                <div>
                  <Label className="text-sm font-semibold">{t('reports.errorMessage')}</Label>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
                    {selectedReport.errorMessage ?? selectedReport.error_message}
                  </pre>
                </div>
              )}

              {(selectedReport.errorStack ?? selectedReport.error_stack) && (
                <div>
                  <Label className="text-sm font-semibold">{t('reports.stackTrace')}</Label>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-48">
                    {selectedReport.errorStack ?? selectedReport.error_stack}
                  </pre>
                </div>
              )}

              {selectedReport.url && (
                <div>
                  <Label className="text-sm font-semibold">{t('reports.url')}</Label>
                  <p className="mt-1 text-sm break-all">{selectedReport.url}</p>
                </div>
              )}

              {(selectedReport.consoleLogs ?? selectedReport.console_logs) && (
                <div>
                  <Label className="text-sm font-semibold">{t('reports.consoleLogs')}</Label>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                    {selectedReport.consoleLogs ?? selectedReport.console_logs}
                  </pre>
                </div>
              )}

              {(selectedReport.screenshotUrl ?? selectedReport.screenshot_url) && (
                <div>
                  <Label className="text-sm font-semibold">{t('reports.screenshot')}</Label>
                  <img
                    src={selectedReport.screenshotUrl ?? selectedReport.screenshot_url}
                    alt="Screenshot"
                    className="mt-1 max-w-full rounded border"
                  />
                </div>
              )}

              {(selectedReport.userAgent ?? selectedReport.user_agent) && (
                <div>
                  <Label className="text-sm font-semibold">{t('reports.userAgent')}</Label>
                  <p className="mt-1 text-sm break-all text-xs">
                    {selectedReport.userAgent ?? selectedReport.user_agent}
                  </p>
                </div>
              )}

              {(selectedReport.browserInfo ?? selectedReport.browser_info) && (
                <div>
                  <Label className="text-sm font-semibold">{t('reports.browserInfo')}</Label>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                    {(() => {
                      const browserInfo = selectedReport.browserInfo ?? selectedReport.browser_info;
                      try {
                        return typeof browserInfo === 'string' 
                          ? JSON.stringify(JSON.parse(browserInfo), null, 2)
                          : JSON.stringify(browserInfo, null, 2);
                      } catch {
                        return browserInfo;
                      }
                    })()}
                  </pre>
                </div>
              )}

              {(selectedReport.screenResolution ?? selectedReport.screen_resolution) && (
                <div>
                  <Label className="text-sm font-semibold">Screen Resolution</Label>
                  <p className="mt-1 text-sm">
                    {selectedReport.screenResolution ?? selectedReport.screen_resolution}
                  </p>
                </div>
              )}

              {(selectedReport.updatedAt ?? selectedReport.updated_at) && (
                <div>
                  <Label className="text-sm font-semibold">{t('reports.lastUpdated')}</Label>
                  <p className="mt-1 text-sm">
                    {formatDateTime(selectedReport.updatedAt ?? selectedReport.updated_at)}
                  </p>
                </div>
              )}

              {(selectedReport.resolvedAt ?? selectedReport.resolved_at) && (
                <div>
                  <Label className="text-sm font-semibold">{t('reports.resolvedAt')}</Label>
                  <p className="mt-1 text-sm">
                    {formatDateTime(selectedReport.resolvedAt ?? selectedReport.resolved_at)}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold">{t('reports.statusLabel')}</Label>
                  <Select
                    value={selectedReport.status}
                    onValueChange={(value) =>
                      handleUpdateReportStatus(
                        selectedReport.id,
                        value as ErrorReport['status']
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">{t('reports.new')}</SelectItem>
                      <SelectItem value="in_progress">{t('reports.inProgress')}</SelectItem>
                      <SelectItem value="resolved">{t('reports.resolved')}</SelectItem>
                      <SelectItem value="dismissed">{t('reports.dismissed')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-semibold">{t('reports.priorityLabel')}</Label>
                  <Select
                    value={selectedReport.priority}
                    onValueChange={(value) =>
                      handleUpdateReportStatus(
                        selectedReport.id,
                        selectedReport.status,
                        value as ErrorReport['priority']
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t('reports.low')}</SelectItem>
                      <SelectItem value="medium">{t('reports.medium')}</SelectItem>
                      <SelectItem value="high">{t('reports.high')}</SelectItem>
                      <SelectItem value="critical">{t('reports.critical')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold">{t('reports.assignTo')}</Label>
                <Select
                  value={(selectedReport.assignedTo ?? selectedReport.assigned_to) || 'unassigned'}
                  onValueChange={(value) =>
                    handleUpdateReportStatus(
                      selectedReport.id,
                      undefined,
                      undefined,
                      value === 'unassigned' ? '' : value
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">{t('reports.unassigned')}</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-semibold">{t('reports.resolutionNotes')}</Label>
                <Textarea
                  placeholder={t('reports.resolutionNotesPlaceholder')}
                  value={selectedReport.resolutionNotes ?? selectedReport.resolution_notes ?? ''}
                  onChange={(e) => {
                    // Update local state for immediate feedback
                    setSelectedReport({
                      ...selectedReport,
                      resolutionNotes: e.target.value,
                      resolution_notes: e.target.value
                    });
                  }}
                  onBlur={(e) => {
                    // Save on blur
                    const currentNotes = selectedReport.resolutionNotes ?? selectedReport.resolution_notes ?? '';
                    if (e.target.value !== currentNotes) {
                      handleUpdateReportStatus(
                        selectedReport.id,
                        undefined,
                        undefined,
                        undefined,
                        e.target.value || undefined
                      );
                    }
                  }}
                  rows={4}
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedReport(null)}>
                {t('reports.close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      </div>

      <AdminOrganizationPanel
        orgSummary={selectedOrgSummary}
        users={users}
        open={orgPanelOpen}
        onOpenChange={setOrgPanelOpen}
        onUpdated={loadDashboardData}
        onOpenInApp={onAdminOpenOrganization}
      />

      <Dialog open={!!suspendDialogUser} onOpenChange={(open) => !open && setSuspendDialogUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.suspendTitle')}</DialogTitle>
            <DialogDescription>{t('users.suspendDescription', { name: suspendDialogUser?.name })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('users.suspendReason')}</Label>
            <Textarea value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogUser(null)}>{t('createOrg.cancel')}</Button>
            <Button variant="destructive" onClick={() => suspendDialogUser && handleSuspendUser(suspendDialogUser, false, suspendReason)}>
              {t('users.suspend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
