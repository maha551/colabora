import { useTranslation } from 'react-i18next';
import { InfoPageLayout } from '../../components/info/InfoPageLayout';
import { LegalDocument } from '../../components/info/LegalDocument';
import { usePublicConfig } from '../../hooks/usePublicConfig';

interface TermsPageProps {
  isAuthenticated?: boolean;
}

export function TermsPage({ isAuthenticated }: TermsPageProps) {
  const { t } = useTranslation('legal');
  const { config } = usePublicConfig();

  return (
    <InfoPageLayout title={t('pages.terms')} isAuthenticated={isAuthenticated}>
      <LegalDocument
        slug="terms"
        substitutions={{
          contactEmail: config?.contactEmail,
        }}
      />
    </InfoPageLayout>
  );
}
