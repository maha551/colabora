import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { ErrorReportForm } from '../components/ErrorReportForm';
import { Icon } from '../components/ui/Icon';
import { SPACING, COLORS } from '../lib/designSystem';
import { cn } from '../components/ui/utils';

interface ReportIssuePageProps {
  onBack: () => void;
}

export function ReportIssuePage({ onBack }: ReportIssuePageProps) {
  const { t } = useTranslation('nav');
  return (
    <div className={cn('min-h-screen', SPACING.layout.containPage)}>
      <div className={cn(SPACING.layout.contentMaxNarrow, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Icon name="AlertCircle" className={cn('h-5 w-5', COLORS.status.active)} />
              {t('reportIssue')}
            </CardTitle>
            <CardDescription>
              {t('reportIssueDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ErrorReportForm
              initialUrl={typeof window !== 'undefined' ? window.location.href : undefined}
              isActive={true}
              onSuccess={onBack}
              onCancel={onBack}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
