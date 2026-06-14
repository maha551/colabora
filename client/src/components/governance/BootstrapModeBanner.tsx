import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '../ui/alert';
import { useRuleLabels } from '../../hooks/useRuleLabels';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Icon } from '../ui/Icon';
import { Organization, BootstrapStatus } from '../../types';
import { BootstrapCompletionDialog } from './BootstrapCompletionDialog';
import { COLORS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

interface BootstrapModeBannerProps {
  organization: Organization;
  bootstrapStatus: BootstrapStatus;
  onComplete?: () => void;
}

export function BootstrapModeBanner({
  organization,
  bootstrapStatus,
  onComplete
}: BootstrapModeBannerProps) {
  const { t } = useTranslation('governance');
  const { getRuleLabel } = useRuleLabels();
  const [showCompletionDialog, setShowCompletionDialog] = React.useState(false);

  if (!bootstrapStatus.mode) return null;

  const progressPercent = (bootstrapStatus.progress.completed / bootstrapStatus.progress.total) * 100;

  const handleComplete = () => {
    setShowCompletionDialog(true);
  };

  const handleCompletionSuccess = () => {
    setShowCompletionDialog(false);
    onComplete?.();
  };

  return (
    <>
      <Alert className={`mb-4 border border-[var(--status-active-border)] ${COLORS.statusBg.info}`}>
        <Icon name="AlertTriangle" className={cn('h-4 w-4', COLORS.status.info)} />
        <AlertDescription>
          <div className="space-y-3">
            <div>
              <strong className={COLORS.status.info}>{t('bootstrapBanner.title')}</strong>
              <p className={`text-sm mt-1 ${COLORS.status.info}`}>
                {t('bootstrapBanner.description')}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className={COLORS.status.info}>{t('bootstrapBanner.progress')}</span>
                <span className={`font-medium ${COLORS.status.info}`}>
                  {t('bootstrapBanner.coreRulesProgress', {
                    completed: bootstrapStatus.progress.completed,
                    total: bootstrapStatus.progress.total,
                  })}
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>

            <div className="space-y-1 text-sm">
              <div className="font-medium text-blue-900 dark:text-blue-100">{t('bootstrapBanner.checklistTitle')}</div>
              {bootstrapStatus.progress.checklist.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  {item.completed ? (
                    <Icon name="Check" className={`h-4 w-4 ${COLORS.status.success}`} />
                  ) : (
                    <Icon name="Circle" className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={item.completed ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'}>
                    {getRuleLabel(item.rule)}
                  </span>
                </div>
              ))}
            </div>

            {bootstrapStatus.daysRemaining !== null && (
              <div className={cn('flex items-center gap-2 text-sm', COLORS.status.info)}>
                <Icon name="Clock" className="h-4 w-4" />
                <span>{t('bootstrapBanner.autoCompletion', { count: bootstrapStatus.daysRemaining })}</span>
              </div>
            )}

            {bootstrapStatus.canComplete && (
              <Button 
                onClick={handleComplete}
                variant="outline"
                size="sm"
                className={`mt-2 border-[var(--status-active-border)] hover:opacity-90 ${COLORS.status.info} ${COLORS.statusBg.info}`}
              >
                {t('bootstrapBanner.completeNow')}
              </Button>
            )}
          </div>
        </AlertDescription>
      </Alert>

      {showCompletionDialog && (
        <BootstrapCompletionDialog
          organization={organization}
          open={showCompletionDialog}
          onOpenChange={setShowCompletionDialog}
          onSuccess={handleCompletionSuccess}
        />
      )}
    </>
  );
}
