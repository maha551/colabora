import type { ParsedInfoPath } from '../../lib/infoRoutes';
import { InfoHubPage } from './InfoHubPage';
import { PrivacyPage } from './PrivacyPage';
import { TermsPage } from './TermsPage';
import { ImprintPage } from './ImprintPage';
import { AboutPage } from './AboutPage';
import { ContactPage } from './ContactPage';
import { InfoNotFoundPage } from './InfoNotFoundPage';

interface InfoPageRouterProps {
  route: ParsedInfoPath;
  isAuthenticated?: boolean;
}

export function InfoPageRouter({ route, isAuthenticated = false }: InfoPageRouterProps) {
  if (route.kind === 'hub') {
    return <InfoHubPage isAuthenticated={isAuthenticated} />;
  }
  if (route.kind === 'notFound') {
    return <InfoNotFoundPage isAuthenticated={isAuthenticated} />;
  }

  switch (route.slug) {
    case 'privacy':
      return <PrivacyPage isAuthenticated={isAuthenticated} />;
    case 'terms':
      return <TermsPage isAuthenticated={isAuthenticated} />;
    case 'imprint':
      return <ImprintPage isAuthenticated={isAuthenticated} />;
    case 'about':
      return <AboutPage isAuthenticated={isAuthenticated} />;
    case 'contact':
      return <ContactPage isAuthenticated={isAuthenticated} />;
    default:
      return <InfoNotFoundPage isAuthenticated={isAuthenticated} />;
  }
}
