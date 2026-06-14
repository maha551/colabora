import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi, type RateLimitEntry, type DocumentIntegrityResponse } from '../../lib/api/admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { LoadingState } from '../ui/LoadingState';
import { toast } from 'sonner';

export function AdminOpsPanel() {
  const { t } = useTranslation('admin');
  const [rateLimits, setRateLimits] = useState<RateLimitEntry[]>([]);
  const [rateLimitIp, setRateLimitIp] = useState('');
  const [loadingRateLimits, setLoadingRateLimits] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<DocumentIntegrityResponse | null>(null);
  const [loadingIntegrity, setLoadingIntegrity] = useState(false);

  const loadRateLimits = async () => {
    setLoadingRateLimits(true);
    try {
      const res = await adminApi.listRateLimits(rateLimitIp.trim() || undefined);
      setRateLimits(res.rateLimits || []);
      if (res.rateLimits?.length === 0) {
        toast.info(t('ops.noRateLimits'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('ops.rateLimitsFailed'));
      setRateLimits([]);
    } finally {
      setLoadingRateLimits(false);
    }
  };

  const clearRateLimits = async (ip?: string) => {
    try {
      const res = await adminApi.clearRateLimits(ip);
      toast.success(res.message || t('ops.cleared'));
      await loadRateLimits();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('ops.clearFailed'));
    }
  };

  const runIntegrityCheck = async () => {
    setLoadingIntegrity(true);
    try {
      const res = await adminApi.runDocumentIntegrityCheck();
      setIntegrityResult(res);
      toast.success(t('ops.integrityDone', { invalid: res.summary.invalid }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('ops.integrityFailed'));
    } finally {
      setLoadingIntegrity(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('ops.rateLimitsTitle')}</CardTitle>
          <CardDescription>{t('ops.rateLimitsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label>{t('ops.filterIp')}</Label>
              <Input value={rateLimitIp} onChange={(e) => setRateLimitIp(e.target.value)} placeholder="1.2.3.4" />
            </div>
            <Button onClick={loadRateLimits} disabled={loadingRateLimits}>{t('ops.loadRateLimits')}</Button>
            <Button variant="destructive" onClick={() => clearRateLimits(rateLimitIp.trim() || undefined)}>
              {rateLimitIp.trim() ? t('ops.clearIp') : t('ops.clearAll')}
            </Button>
          </div>
          {loadingRateLimits ? (
            <LoadingState isLoading={true} mode="spinner" spinnerSize="sm"><span /></LoadingState>
          ) : rateLimits.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('ops.key')}</TableHead>
                  <TableHead>{t('ops.hits')}</TableHead>
                  <TableHead>{t('ops.expires')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rateLimits.map((rl) => (
                  <TableRow key={rl.key}>
                    <TableCell className="font-mono text-xs max-w-xs truncate">{rl.key}</TableCell>
                    <TableCell>{rl.hits}</TableCell>
                    <TableCell>{rl.expiresIn}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('ops.integrityTitle')}</CardTitle>
          <CardDescription>{t('ops.integrityDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runIntegrityCheck} disabled={loadingIntegrity}>
            {loadingIntegrity ? t('ops.running') : t('ops.runIntegrity')}
          </Button>
          {integrityResult && (
            <div className="text-sm space-y-2">
              <p>{t('ops.integritySummary', integrityResult.summary)}</p>
              {integrityResult.invalidDocuments.length > 0 && (
                <ul className="list-disc pl-5">
                  {integrityResult.invalidDocuments.map((doc) => (
                    <li key={doc.id}>{doc.title || doc.id}{doc.reason ? `: ${doc.reason}` : ''}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
