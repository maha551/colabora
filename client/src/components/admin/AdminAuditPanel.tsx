import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi, type PlatformAuditEntry } from '../../lib/api/admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { LoadingState } from '../ui/LoadingState';
import { useTimezone } from '../../hooks/useTimezone';
import { toast } from 'sonner';

export function AdminAuditPanel() {
  const { t } = useTranslation('admin');
  const { formatDateTime } = useTimezone();
  const [entries, setEntries] = useState<PlatformAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PlatformAuditEntry | null>(null);
  const pageSize = 25;

  const load = async () => {
    setLoading(true);
    try {
      const [logsRes, statsRes] = await Promise.all([
        adminApi.getAuditLogs({ limit: pageSize, offset: (page - 1) * pageSize }),
        adminApi.getAuditStats(),
      ]);
      setEntries(logsRes.actions || []);
      setTotal(statsRes.total ?? logsRes.total ?? 0);
    } catch (error) {
      toast.error(t('audit.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page]);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t('audit.title')}</CardTitle>
            <CardDescription>{t('audit.description', { total })}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>{t('audit.refresh')}</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 flex justify-center">
              <LoadingState isLoading={true} mode="spinner" spinnerSize="md"><span /></LoadingState>
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t('audit.empty')}</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('audit.action')}</TableHead>
                    <TableHead>{t('audit.admin')}</TableHead>
                    <TableHead>{t('audit.target')}</TableHead>
                    <TableHead>{t('audit.date')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                      <TableCell>{entry.adminName || entry.adminUserId}</TableCell>
                      <TableCell className="text-xs">
                        {entry.targetType ? `${entry.targetType}:${entry.targetId || '—'}` : '—'}
                      </TableCell>
                      <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setSelected(entry)}>
                          {t('audit.view')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-between mt-4">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {t('reports.previous')}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {t('reports.pageOf', { current: page, total: Math.ceil(total / pageSize) || 1 })}
                </span>
                <Button variant="outline" size="sm" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>
                  {t('reports.next')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selected.action}</DialogTitle>
            </DialogHeader>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">
              {JSON.stringify(selected.details, null, 2)}
            </pre>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
