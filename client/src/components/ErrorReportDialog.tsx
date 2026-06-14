import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Icon } from './ui/Icon';
import { ErrorReportForm } from './ErrorReportForm';
import { COLORS } from '../lib/designSystem';
import { cn } from './ui/utils';

interface ErrorReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialError?: {
    message?: string;
    stack?: string;
  };
  initialUrl?: string;
}

export function ErrorReportDialog({
  open,
  onOpenChange,
  initialError,
  initialUrl,
}: ErrorReportDialogProps) {
  const { t } = useTranslation('nav');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="AlertCircle" className={cn('h-5 w-5', COLORS.status.active)} />
            {t('reportIssue')}
          </DialogTitle>
          <DialogDescription>
            {t('reportIssueDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <ErrorReportForm
            initialError={initialError}
            initialUrl={initialUrl}
            isActive={open}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
