import { useTranslation } from 'react-i18next';
import { InfoPageLayout } from '../../components/info/InfoPageLayout';
import { Button } from '../../components/ui/button';
import { Icon } from '../../components/ui/Icon';
import { buildInfoPath } from '../../lib/infoRoutes';
import { COLORS } from '../../lib/designSystem';
import { cn } from '../../components/ui/utils';

interface InfoNotFoundPageProps {
  isAuthenticated?: boolean;
}

export function InfoNotFoundPage({ isAuthenticated }: InfoNotFoundPageProps) {
  const { t } = useTranslation('legal');

  return (
    <InfoPageLayout
      title={t('notFound.title')}
      isAuthenticated={isAuthenticated}
      width="narrow"
    >
      <div className="flex flex-col items-center text-center py-6 md:py-10">
        <span
          className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-muted/80 text-muted-foreground"
          aria-hidden
        >
          <Icon name="HelpCircle" size="lg" forceDefault />
        </span>
        <p className={cn('text-base md:text-lg leading-relaxed max-w-sm mb-8', COLORS.text.secondary)}>
          {t('notFound.description')}
        </p>
        <Button variant="outline" size="lg" asChild>
          <a href={buildInfoPath('hub')}>{t('notFound.backToHub')}</a>
        </Button>
      </div>
    </InfoPageLayout>
  );
}
