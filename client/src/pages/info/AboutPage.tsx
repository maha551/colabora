import { useTranslation } from 'react-i18next';
import { InfoPageLayout } from '../../components/info/InfoPageLayout';
import { LegalDocument } from '../../components/info/LegalDocument';

interface AboutPageProps {
  isAuthenticated?: boolean;
}

export function AboutPage({ isAuthenticated }: AboutPageProps) {
  const { t } = useTranslation('legal');

  return (
    <InfoPageLayout title={t('pages.about')} isAuthenticated={isAuthenticated}>
      <LegalDocument slug="about" />
    </InfoPageLayout>
  );
}
