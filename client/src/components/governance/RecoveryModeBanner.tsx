import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '../ui/alert';
import { Icon } from '../ui/Icon';
import { RecoveryStatus } from '../../types';
import { COLORS } from '../../lib/designSystem';

interface RecoveryModeBannerProps {
  recoveryStatus: RecoveryStatus;
}

export function RecoveryModeBanner({
  recoveryStatus
}: RecoveryModeBannerProps) {
  const { t } = useTranslation('governance');

  if (!recoveryStatus.mode) return null;

  const getRecoveryReasonLabel = (reason: string | null): string => {
    if (!reason) return t('recoveryBanner.reasons.unknown');
    const key = `recoveryBanner.reasons.${reason}`;
    const translated = t(key, { defaultValue: '' });
    return translated || reason;
  };

  return (
    <Alert className="mb-4 border-orange-500 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
      <Icon name="AlertTriangle" className={`h-4 w-4 ${COLORS.status.active}`} />
      <AlertDescription>
        <div className="space-y-2">
          <div>
            <strong className="text-orange-900 dark:text-orange-100">{t('recoveryBanner.title')}</strong>
            <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
              {t('recoveryBanner.description')}
            </p>
          </div>

          {recoveryStatus.reason && (
            <div className="text-sm">
              <strong className="text-orange-900 dark:text-orange-100">{t('recoveryBanner.reasonLabel')}</strong>{' '}
              <span className="text-orange-700 dark:text-orange-300">
                {getRecoveryReasonLabel(recoveryStatus.reason)}
              </span>
            </div>
          )}

          <div className="text-sm text-orange-700 dark:text-orange-300">
            <strong>{t('recoveryBanner.whatYouCanDo')}</strong>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>{t('recoveryBanner.permissions.manageProposals')}</li>
              <li>{t('recoveryBanner.permissions.createDocuments')}</li>
              <li>{t('recoveryBanner.permissions.initializeElections')}</li>
              <li>{t('recoveryBanner.permissions.inviteMembers')}</li>
            </ul>
          </div>

          {recoveryStatus.canExit && (
            <div className="text-sm text-orange-600 dark:text-orange-400">
              {t('recoveryBanner.autoExitHint')}
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
