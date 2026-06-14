import React from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { SPACING, COLORS } from '../lib/designSystem';
import { cn } from './ui/utils';

interface AppLoadingScreenProps {
  stage?: 'auth' | 'organizations';
}

export function AppLoadingScreen({ stage = 'auth' }: AppLoadingScreenProps) {
  const { t } = useTranslation('common');
  const getMessage = () => {
    switch (stage) {
      case 'auth':
        return t('loading.authenticating');
      case 'organizations':
        return t('loading.loadingWorkspace');
      default:
        return t('loading.loading');
    }
  };

  return (
    <div 
      className="min-h-screen bg-background flex items-center justify-center"
      role="status"
      aria-label={t('aria.loadingApplication')}
    >
      <div className={cn('text-center', SPACING.content.gap)}>
        <LoadingSpinner size="lg" className="mx-auto" />
        <p className={cn(COLORS.text.secondary, 'text-lg')}>{getMessage()}</p>
        {stage === 'organizations' && (
          <p className={cn(COLORS.text.hint, 'text-sm')}>{t('loading.preparingOrganizations')}</p>
        )}
      </div>
    </div>
  );
}
