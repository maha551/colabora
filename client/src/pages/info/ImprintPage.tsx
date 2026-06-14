import { useTranslation } from 'react-i18next';
import { InfoPageLayout } from '../../components/info/InfoPageLayout';
import { LegalDocument } from '../../components/info/LegalDocument';
import { usePublicConfig } from '../../hooks/usePublicConfig';

interface ImprintPageProps {
  isAuthenticated?: boolean;
}

export function ImprintPage({ isAuthenticated }: ImprintPageProps) {
  const { t } = useTranslation('legal');
  const { config } = usePublicConfig();

  return (
    <InfoPageLayout title={t('pages.imprint')} isAuthenticated={isAuthenticated}>
      <LegalDocument
        slug="imprint"
        substitutions={{
          operatorName: config?.operatorName,
          operatorAddress: config?.operatorAddress,
          contactEmail: config?.contactEmail,
        }}
      />
    </InfoPageLayout>
  );
}
