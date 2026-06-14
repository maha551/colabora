import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '../ui/alert';
import { Icon } from '../ui/Icon';
import type { VerifyResult } from '../../lib/api/verification';

interface VerificationResultCardProps {
  result: VerifyResult;
}

export function VerificationResultCard({ result }: VerificationResultCardProps) {
  const { t } = useTranslation('organization');
  const [showHow, setShowHow] = useState(false);

  const kind = result.verificationKind || 'pro_contra';
  const summaryKey =
    kind === 'election'
      ? result.match
        ? 'transparencySection.electionVerifiedSummary'
        : 'transparencySection.electionMismatchSummary'
      : kind === 'meeting_options'
        ? result.match
          ? 'transparencySection.meetingVerifiedSummary'
          : 'transparencySection.meetingMismatchSummary'
        : result.match
          ? 'transparencySection.proContraVerifiedSummary'
          : 'transparencySection.proContraMismatchSummary';

  return (
    <Alert variant={result.match ? 'default' : 'destructive'} className="mt-3">
      <div className="flex items-start gap-2">
        {result.match ? (
          <Icon name="CheckCircle" className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
        ) : (
          <Icon name="XCircle" className="h-4 w-4 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium">
            {result.match ? t('transparencySection.matchYes') : t('transparencySection.matchNo')}
          </p>
          <AlertDescription className="mt-1">{t(summaryKey)}</AlertDescription>

          {kind === 'election' && result.announcedBallotCount != null && (
            <p className="text-sm mt-2 text-muted-foreground">
              {t('transparencySection.electionBallotCounts', {
                computed: result.ballotCount ?? 0,
                announced: result.announcedBallotCount,
              })}
            </p>
          )}

          {!result.match && result.diff && (
            <p className="text-sm mt-2">
              {t('transparencySection.verifyDiff', {
                pro: `${result.diff.pro >= 0 ? '+' : ''}${result.diff.pro}`,
                contra: `${result.diff.contra >= 0 ? '+' : ''}${result.diff.contra}`,
                neutral: `${result.diff.neutral >= 0 ? '+' : ''}${result.diff.neutral}`,
                total: `${result.diff.total >= 0 ? '+' : ''}${result.diff.total}`,
              })}
            </p>
          )}

          <button
            type="button"
            className="text-xs text-primary underline mt-2"
            onClick={() => setShowHow((v) => !v)}
          >
            {t('transparencySection.howVerificationWorks')}
          </button>
          {showHow && (
            <ol className="text-xs text-muted-foreground mt-2 list-decimal list-inside space-y-1">
              <li>{t('transparencySection.verifyStep1')}</li>
              <li>{t('transparencySection.verifyStep2')}</li>
              <li>{t('transparencySection.verifyStep3')}</li>
            </ol>
          )}
        </div>
      </div>
    </Alert>
  );
}
