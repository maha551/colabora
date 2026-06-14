import { useTranslation } from 'react-i18next';
import { InfoPageLayout } from '../../components/info/InfoPageLayout';
import { LegalDocument } from '../../components/info/LegalDocument';
import { usePublicConfig } from '../../hooks/usePublicConfig';

interface PrivacyPageProps {
  isAuthenticated?: boolean;
}

export function PrivacyPage({ isAuthenticated }: PrivacyPageProps) {
  const { t } = useTranslation('legal');
  const { config } = usePublicConfig();

  return (
    <InfoPageLayout title={t('pages.privacy')} isAuthenticated={isAuthenticated}>
      <LegalDocument
        slug="privacy"
        substitutions={{
          contactEmail: config?.contactEmail,
          operatorName: config?.operatorName,
          operatorAddress: config?.operatorAddress,
        }}
      />
    </InfoPageLayout>
  );
}
