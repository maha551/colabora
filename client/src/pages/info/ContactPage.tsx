import { useTranslation } from 'react-i18next';
import { InfoPageLayout } from '../../components/info/InfoPageLayout';
import { ContactForm } from '../../components/info/ContactForm';

interface ContactPageProps {
  isAuthenticated?: boolean;
}

export function ContactPage({ isAuthenticated }: ContactPageProps) {
  const { t } = useTranslation('legal');

  return (
    <InfoPageLayout
      title={t('pages.contact')}
      subtitle={t('contact.description')}
      isAuthenticated={isAuthenticated}
      width="narrow"
    >
      <ContactForm />
    </InfoPageLayout>
  );
}
