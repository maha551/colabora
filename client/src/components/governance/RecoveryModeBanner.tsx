import React from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { AlertTriangle } from 'lucide-react';
import { RecoveryStatus } from '../../types';

interface RecoveryModeBannerProps {
  recoveryStatus: RecoveryStatus;
}

function getRecoveryReasonLabel(reason: string | null): string {
  const labels: Record<string, string> = {
    'no_representatives_and_members_cannot_manage': 'No representatives and members cannot manage proposals',
    'no_successful_votes_60_days': 'No successful votes in 60 days',
    'quorum_consistently_unmet': 'Quorum consistently unmet'
  };
  return labels[reason || ''] || reason || 'Unknown reason';
}

export function RecoveryModeBanner({
  recoveryStatus
}: RecoveryModeBannerProps) {
  if (!recoveryStatus.mode) return null;

  return (
    <Alert className="mb-4 border-orange-500 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
      <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
      <AlertDescription>
        <div className="space-y-2">
          <div>
            <strong className="text-orange-900 dark:text-orange-100">Recovery Mode Active</strong>
            <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
              Your organization is in recovery mode. This mode provides additional permissions to help restore normal governance.
            </p>
          </div>

          {recoveryStatus.reason && (
            <div className="text-sm">
              <strong className="text-orange-900 dark:text-orange-100">Reason:</strong>{' '}
              <span className="text-orange-700 dark:text-orange-300">
                {getRecoveryReasonLabel(recoveryStatus.reason)}
              </span>
            </div>
          )}

          <div className="text-sm text-orange-700 dark:text-orange-300">
            <strong>What you can do:</strong>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>All active members can propose and manage rule proposals</li>
              <li>All active members can create documents</li>
              <li>All active members can initialize elections</li>
              <li>All active members can invite new members</li>
            </ul>
          </div>

          {recoveryStatus.canExit && (
            <div className="text-sm text-orange-600 dark:text-orange-400">
              Recovery mode will automatically exit once normal governance is restored.
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

