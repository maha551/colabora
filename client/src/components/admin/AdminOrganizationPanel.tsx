import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi, type AdminOrganizationListItem, type AdminUserListItem } from '../../lib/api/admin';
import { Organization } from '../../types';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Icon } from '../ui/Icon';
import { LoadingState } from '../ui/LoadingState';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';

interface AdminOrganizationPanelProps {
  orgSummary: AdminOrganizationListItem | null;
  users: AdminUserListItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  onOpenInApp?: (organization: Organization) => void;
}

export function AdminOrganizationPanel({
  orgSummary,
  users,
  open,
  onOpenChange,
  onUpdated,
  onOpenInApp,
}: AdminOrganizationPanelProps) {
  const { t } = useTranslation('admin');
  const [loading, setLoading] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [membershipPolicy, setMembershipPolicy] = useState<'open' | 'invitation'>('invitation');
  const [votingThresholdPct, setVotingThresholdPct] = useState(75);
  const [memberEmails, setMemberEmails] = useState('');
  const [repEmails, setRepEmails] = useState('');
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addRepUserId, setAddRepUserId] = useState('');
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteForce, setDeleteForce] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadOrg = useCallback(async () => {
    if (!orgSummary?.id) return;
    setLoading(true);
    try {
      const data = await adminApi.getOrganization(orgSummary.id);
      const org = data.organization;
      setOrganization(org);
      setName(org.name);
      setDescription(org.description || '');
      setMembershipPolicy(org.membershipPolicy || 'invitation');
      setVotingThresholdPct(Math.round((org.votingThreshold ?? 0.75) * 100));
    } catch (error) {
      logger.error('Failed to load organization detail', error);
      toast.error(t('orgPanel.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [orgSummary?.id, t]);

  useEffect(() => {
    if (open && orgSummary?.id) {
      loadOrg();
    } else if (!open) {
      setOrganization(null);
      setDeleteConfirmName('');
      setDeleteForce(false);
    }
  }, [open, orgSummary?.id, loadOrg]);

  const handleSaveSettings = async () => {
    if (!orgSummary?.id) return;
    setSaving(true);
    try {
      await adminApi.updateOrganization(orgSummary.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        membershipPolicy,
        votingThreshold: votingThresholdPct / 100,
      });
      toast.success(t('orgPanel.settingsSaved'));
      await loadOrg();
      onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('orgPanel.settingsFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!orgSummary?.id || !organization) return;
    try {
      await adminApi.setOrganizationStatus(orgSummary.id, !organization.isActive);
      toast.success(t('orgPanel.statusUpdated'));
      setShowDeactivateConfirm(false);
      await loadOrg();
      onUpdated();
    } catch (error) {
      toast.error(t('orgPanel.statusFailed'));
    }
  };

  const handleHardDelete = async () => {
    if (!orgSummary?.id || !organization) return;
    try {
      await adminApi.deleteOrganization(orgSummary.id, deleteConfirmName, deleteForce);
      toast.success(t('orgPanel.deleted'));
      onOpenChange(false);
      onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('orgPanel.deleteFailed'));
    }
  };

  const parseEmails = (text: string) =>
    text.split(/[\n,;]/).map((e) => e.trim().toLowerCase()).filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  const handleInviteMembers = async () => {
    if (!orgSummary?.id) return;
    const emails = parseEmails(memberEmails);
    if (!emails.length) {
      toast.error(t('orgPanel.noValidEmails'));
      return;
    }
    try {
      const res = await adminApi.inviteMembers(orgSummary.id, emails);
      toast.success(t('orgPanel.invitesSent', { count: res.invitations }));
      setMemberEmails('');
    } catch (error) {
      toast.error(t('orgPanel.inviteFailed'));
    }
  };

  const handleInviteReps = async () => {
    if (!orgSummary?.id) return;
    const emails = parseEmails(repEmails);
    if (!emails.length) {
      toast.error(t('orgPanel.noValidEmails'));
      return;
    }
    try {
      const res = await adminApi.inviteRepresentatives(orgSummary.id, emails);
      toast.success(t('orgPanel.invitesSent', { count: res.invitations }));
      setRepEmails('');
    } catch (error) {
      toast.error(t('orgPanel.inviteFailed'));
    }
  };

  const handleAddMember = async () => {
    if (!orgSummary?.id || !addMemberUserId) return;
    try {
      await adminApi.addMember(orgSummary.id, addMemberUserId);
      toast.success(t('orgPanel.memberInviteSent', { defaultValue: 'Membership invitation sent' }));
      setAddMemberUserId('');
      await loadOrg();
      onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('orgPanel.memberAddFailed'));
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!orgSummary?.id) return;
    try {
      await adminApi.removeMember(orgSummary.id, userId);
      toast.success(t('orgPanel.memberRemoved'));
      await loadOrg();
      onUpdated();
    } catch (error) {
      toast.error(t('orgPanel.memberRemoveFailed'));
    }
  };

  const handleAddRep = async () => {
    if (!orgSummary?.id || !addRepUserId) return;
    try {
      await adminApi.addRepresentative(orgSummary.id, addRepUserId);
      toast.success(t('orgPanel.repAdded'));
      setAddRepUserId('');
      await loadOrg();
      onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('orgPanel.repAddFailed'));
    }
  };

  const activeMembers = organization?.members?.filter((m) => m.status === 'active') || [];
  const repIds = organization?.representatives || [];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{orgSummary?.name || t('orgPanel.title')}</SheetTitle>
            <SheetDescription>{t('orgPanel.description')}</SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="py-12 flex justify-center">
              <LoadingState isLoading={true} mode="spinner" spinnerSize="md"><span /></LoadingState>
            </div>
          ) : organization ? (
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant={organization.isActive ? 'default' : 'secondary'}>
                  {organization.isActive ? t('organizations.active') : t('organizations.inactive')}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {t('orgPanel.memberDocCounts', {
                    members: orgSummary?.memberCount ?? activeMembers.length,
                    documents: orgSummary?.documentCount ?? 0,
                  })}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {onOpenInApp && (
                  <Button variant="outline" size="sm" onClick={() => onOpenInApp(organization)}>
                    <Icon name="ExternalLink" className="h-4 w-4 mr-1" />
                    {t('orgPanel.openInApp')}
                  </Button>
                )}
                <Button
                  variant={organization.isActive ? 'destructive' : 'default'}
                  size="sm"
                  onClick={() => setShowDeactivateConfirm(true)}
                >
                  {organization.isActive ? t('orgPanel.deactivate') : t('orgPanel.reactivate')}
                </Button>
                {!organization.isActive && (
                  <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                    {t('orgPanel.hardDelete')}
                  </Button>
                )}
              </div>

              <Tabs defaultValue="settings">
                <TabsList className="w-full">
                  <TabsTrigger value="settings">{t('orgPanel.tabSettings')}</TabsTrigger>
                  <TabsTrigger value="members">{t('orgPanel.tabMembers')}</TabsTrigger>
                  <TabsTrigger value="reps">{t('orgPanel.tabReps')}</TabsTrigger>
                </TabsList>

                <TabsContent value="settings" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>{t('createOrg.orgName')}</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('createOrg.descriptionLabel')}</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('createOrg.membershipPolicy')}</Label>
                    <Select value={membershipPolicy} onValueChange={(v: 'open' | 'invitation') => setMembershipPolicy(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invitation">{t('createOrg.invitationOnly')}</SelectItem>
                        <SelectItem value="open">{t('createOrg.openMembership')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('createOrg.votingThreshold')}</Label>
                    <Input type="number" min={1} max={100} value={votingThresholdPct} onChange={(e) => setVotingThresholdPct(parseInt(e.target.value) || 75)} />
                  </div>
                  <Button onClick={handleSaveSettings} disabled={saving}>
                    {saving ? t('orgPanel.saving') : t('orgPanel.saveSettings')}
                  </Button>
                </TabsContent>

                <TabsContent value="members" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>{t('orgPanel.inviteMembersEmail')}</Label>
                    <Textarea value={memberEmails} onChange={(e) => setMemberEmails(e.target.value)} rows={3} placeholder="email@example.com" />
                    <Button size="sm" onClick={handleInviteMembers}>{t('orgPanel.sendInvites')}</Button>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('orgPanel.addMemberById')}</Label>
                    <div className="flex gap-2">
                      <Select value={addMemberUserId || '__none__'} onValueChange={(v) => setAddMemberUserId(v === '__none__' ? '' : v)}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder={t('orgPanel.selectUser')} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t('orgPanel.selectUser')}</SelectItem>
                          {users.filter((u) => !activeMembers.some((m) => m.userId === u.id)).map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={handleAddMember} disabled={!addMemberUserId}>{t('orgPanel.add')}</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('orgPanel.activeMembers')}</Label>
                    {activeMembers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('orgPanel.noMembers')}</p>
                    ) : (
                      activeMembers.map((m) => (
                        <div key={m.id} className="flex items-center justify-between border rounded p-2 text-sm">
                          <div>
                            <div className="font-medium">{m.user?.name || m.userId}</div>
                            <div className="text-muted-foreground">{m.user?.email}</div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => handleRemoveMember(m.userId)}>
                            {t('orgPanel.remove')}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="reps" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>{t('orgPanel.inviteRepsEmail')}</Label>
                    <Textarea value={repEmails} onChange={(e) => setRepEmails(e.target.value)} rows={3} />
                    <Button size="sm" onClick={handleInviteReps}>{t('orgPanel.sendInvites')}</Button>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('orgPanel.addRepById')}</Label>
                    <div className="flex gap-2">
                      <Select value={addRepUserId || '__none__'} onValueChange={(v) => setAddRepUserId(v === '__none__' ? '' : v)}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder={t('orgPanel.selectUser')} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t('orgPanel.selectUser')}</SelectItem>
                          {users.filter((u) => !repIds.includes(u.id)).map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={handleAddRep} disabled={!addRepUserId}>{t('orgPanel.add')}</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('orgPanel.currentReps')}</Label>
                    {repIds.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('orgPanel.noReps')}</p>
                    ) : (
                      repIds.map((repId) => {
                        const u = users.find((x) => x.id === repId);
                        return (
                          <div key={repId} className="border rounded p-2 text-sm">
                            {u ? `${u.name} (${u.email})` : repId}
                          </div>
                        );
                      })
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={showDeactivateConfirm} onOpenChange={setShowDeactivateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{organization?.isActive ? t('orgPanel.deactivateTitle') : t('orgPanel.reactivateTitle')}</DialogTitle>
            <DialogDescription>
              {organization?.isActive ? t('orgPanel.deactivateDescription') : t('orgPanel.reactivateDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeactivateConfirm(false)}>{t('createOrg.cancel')}</Button>
            <Button variant={organization?.isActive ? 'destructive' : 'default'} onClick={handleToggleStatus}>
              {organization?.isActive ? t('orgPanel.deactivate') : t('orgPanel.reactivate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('orgPanel.hardDeleteTitle')}</DialogTitle>
            <DialogDescription>{t('orgPanel.hardDeleteDescription', { name: organization?.name })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t('orgPanel.typeOrgName')}</Label>
              <Input value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={deleteForce} onChange={(e) => setDeleteForce(e.target.checked)} />
              {t('orgPanel.forceDelete')}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>{t('createOrg.cancel')}</Button>
            <Button variant="destructive" onClick={handleHardDelete} disabled={deleteConfirmName !== organization?.name}>
              {t('orgPanel.hardDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
