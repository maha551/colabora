import React from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { AlertTriangle, Check, Circle, Clock } from 'lucide-react';
import { Organization, BootstrapStatus } from '../../types';
import { BootstrapCompletionDialog } from './BootstrapCompletionDialog';

interface BootstrapModeBannerProps {
  organization: Organization;
  bootstrapStatus: BootstrapStatus;
  onComplete?: () => void;
}

function getRuleLabel(rule: string): string {
  const labels: Record<string, string> = {
    membersCanProposeRules: 'Members Can Propose Rules',
    membersCanCreateDocuments: 'Members Can Create Documents',
    defaultQuorumPercentage: 'Default Quorum Percentage'
  };
  return labels[rule] || rule;
}

export function BootstrapModeBanner({
  organization,
  bootstrapStatus,
  onComplete
}: BootstrapModeBannerProps) {
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
      <Alert className="mb-4 border-blue-500 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
        <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription>
          <div className="space-y-3">
            <div>
              <strong className="text-blue-900 dark:text-blue-100">Bootstrap Mode Active</strong>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Your organization is setting up its governance constitution. 
                Vote on core rules to complete the bootstrap process.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-700 dark:text-blue-300">Progress</span>
                <span className="text-blue-900 dark:text-blue-100 font-medium">
                  {bootstrapStatus.progress.completed} of {bootstrapStatus.progress.total} core rules
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>

            <div className="space-y-1 text-sm">
              <div className="font-medium text-blue-900 dark:text-blue-100">Core Rules Checklist:</div>
              {bootstrapStatus.progress.checklist.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  {item.completed ? (
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Circle className="h-4 w-4 text-gray-400" />
                  )}
                  <span className={item.completed ? 'text-green-700 dark:text-green-300' : 'text-gray-600 dark:text-gray-400'}>
                    {getRuleLabel(item.rule)}
                  </span>
                </div>
              ))}
            </div>

            {bootstrapStatus.daysRemaining !== null && (
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <Clock className="h-4 w-4" />
                <span>Auto-completion in {bootstrapStatus.daysRemaining} day{bootstrapStatus.daysRemaining !== 1 ? 's' : ''}</span>
              </div>
            )}

            {bootstrapStatus.canComplete && (
              <Button 
                onClick={handleComplete}
                variant="outline"
                size="sm"
                className="mt-2 border-blue-600 text-blue-700 hover:bg-blue-100 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-900"
              >
                Complete Bootstrap Now
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

