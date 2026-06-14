import { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Icon } from './ui/Icon';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { AnimatedBackground } from './AnimatedBackground';
import { useDevicePerformance } from '../hooks/useDevicePerformance';
import { authApi, documentsApi, RateLimitError, clearRequestCache } from '../lib/api';
import { toast } from 'sonner';
import { User } from '../types';
import { SPACING, COLORS, NAVIGATION, ELEVATION } from '../lib/designSystem';
import { cn } from './ui/utils';
import { AppLogo } from './shared/AppLogo';
import { ForgotPasswordDialog } from './ForgotPasswordDialog';
import { logger } from '../lib/logger';
import { APP_NAME } from '../lib/constants';
import { TERMS_VERSION, PRIVACY_VERSION } from '../lib/legalVersions';
import { buildInfoPath } from '../lib/infoRoutes';
import { SiteFooterLinks } from './info/SiteFooterLinks';

interface LoginProps {
  onLogin: (user: User) => void;
  onRefreshOrganizations?: () => Promise<void>;
}

export function Login({ onLogin, onRefreshOrganizations }: LoginProps) {
  const { t } = useTranslation('auth');
  const { t: tLegal } = useTranslation('legal');
  const performanceTier = useDevicePerformance();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Rate limit state
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  // Registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [registering, setRegistering] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);

  // Invitation state
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [invitationData, setInvitationData] = useState<{
    organizationName: string;
    inviterName: string;
    invitationType: 'member' | 'representative' | 'document';
    email: string;
  } | null>(null);
  const [validatingInvitation, setValidatingInvitation] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);

  // Tab state - default to "register" if there's an invitation token
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('token') ? 'register' : 'login';
  });

  // Forgot password dialog state
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  // Check for invitation token in URL
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('token');
    const emailParam = searchParams.get('email');
    const invitationType = searchParams.get('type'); // 'document' or 'organization' (default)
    
    if (token) {
      setInvitationToken(token);
      setValidatingInvitation(true);
      // Switch to register tab when invitation token is present
      setActiveTab('register');
      
      // Validate invitation token (organization or document)
      const validateInvitation = invitationType === 'document'
        ? documentsApi.validateDocumentInvitation(token)
        : authApi.validateInvitationToken(token);
      
      validateInvitation
        .then((result: any) => {
          if (result.valid && result.invitation) {
            if (invitationType === 'document') {
              // Document invitation
              setInvitationData({
                organizationName: result.invitation.documentTitle || 'Document',
                inviterName: result.invitation.inviterName || 'A user',
                invitationType: 'document' as any,
                email: result.invitation.email,
              });
            } else {
              // Organization invitation
              setInvitationData({
                organizationName: result.invitation.organizationName,
                inviterName: result.invitation.inviterName,
                invitationType: result.invitation.invitationType,
                email: result.invitation.email,
              });
            }
            
            // If user already exists, show login tab instead of register
            if (result.userExists) {
              setActiveTab('login');
              setEmail(result.invitation.email); // Pre-fill email in login form
              toast.info(t('invitation.accountExistsLogin'));
            } else {
              // New user - show register tab and pre-fill email
              setActiveTab('register');
              setRegEmail(result.invitation.email);
            }
          } else {
            setInvitationError(result.error || t('invitation.invalidInvitation'));
            toast.error(result.error || t('invitation.invalidInvitation'));
          }
        })
        .catch((error) => {
          setInvitationError(error.message || t('invitation.failedToValidate'));
          toast.error(t('invitation.failedToValidate'));
        })
        .finally(() => {
          setValidatingInvitation(false);
        });
    } else if (emailParam) {
      // If email param exists but no token, pre-fill email
      setRegEmail(emailParam);
    }
  }, []); // Only run once on mount

  // Countdown timer for rate limiting
  useEffect(() => {
    if (!rateLimitedUntil) {
      setCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000));
      setCountdown(remaining);

      if (remaining === 0) {
        setRateLimitedUntil(null);
      }
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [rateLimitedUntil]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error(t('login.pleaseEnterEmailPassword'));
      return;
    }

    setLoading(true);
    const startTime = Date.now();
    logger.log('Login attempt started', { email, timestamp: startTime });
    
    try {
      const response = await authApi.login(email, password);
      const duration = Date.now() - startTime;
      logger.log('Login successful', { email, duration: `${duration}ms` });

      clearRequestCache();
      localStorage.setItem('authToken', response.token);
      onLogin(response.user);
      toast.success(t('login.success'));
      setRateLimitedUntil(null);
      setCountdown(0);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Login failed', { 
        email, 
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      });
      // Check if it's a rate limit error
      if (error instanceof RateLimitError) {
        // Extract retryAfter from error details
        const retryAfter = (error.details && typeof error.details === 'object' && 'retryAfter' in error.details)
          ? Number((error.details as { retryAfter?: number }).retryAfter)
          : 900; // Default to 15 minutes if not available
        
        if (retryAfter > 0) {
          const until = Date.now() + (retryAfter * 1000);
          setRateLimitedUntil(until);
          setCountdown(retryAfter);
        }
        // Don't show toast for rate limit - we'll show the Alert component instead
      } else {
        toast.error(error instanceof Error ? error.message : 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };


  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!regName || !regEmail || !regPassword || !regConfirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (regPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    // Basic password strength check
    const hasLowercase = /[a-z]/.test(regPassword);
    const hasUppercase = /[A-Z]/.test(regPassword);
    const hasNumber = /\d/.test(regPassword);

    if (!hasLowercase || !hasUppercase || !hasNumber) {
      toast.error('Password must contain at least one lowercase letter, one uppercase letter, and one number');
      return;
    }

    if (!acceptedLegal) {
      toast.error(tLegal('consent.required'));
      return;
    }

    setRegistering(true);
    try {
      const response = await authApi.register(regName, regEmail, regPassword, {
        invitationToken: invitationToken || undefined,
        acceptedTerms: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      });
      // Store token in localStorage (clear cache first so prior session data is not reused)
      clearRequestCache();
      localStorage.setItem('authToken', response.token);
      onLogin(response.user);
      
      // Clear invitation token from URL
      if (invitationToken) {
        // Clear URL parameters after processing
        window.history.replaceState({}, '', window.location.pathname);
        setInvitationToken(null);
        setInvitationData(null);
        
        // Refresh organizations after registration with invitation to ensure the new organization appears
        if (onRefreshOrganizations) {
          // Add a small delay to ensure backend has processed the membership
          setTimeout(async () => {
            try {
              await onRefreshOrganizations();
            } catch (error) {
              logger.error('Failed to refresh organizations after registration:', error);
            }
          }, 500);
        }
      }
      
      let successMessage = `Registration successful! Welcome to ${APP_NAME}!`;
      if (invitationData) {
        if (invitationData.invitationType === 'document') {
          successMessage = `Registration successful! You've been added as a collaborator on "${invitationData.organizationName}".`;
        } else {
          successMessage = `Registration successful! You've been added to ${invitationData.organizationName} as a ${invitationData.invitationType}.`;
        }
      }
      toast.success(successMessage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      
      // If user already exists with invitation, switch to login tab
      if (errorMessage.includes('already exists') && invitationToken) {
        setActiveTab('login');
        setEmail(regEmail); // Pre-fill email in login form
        toast.info(t('invitation.accountExistsLogin'));
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className={cn('min-h-screen flex items-center justify-center px-4 sm:px-6 py-10 sm:py-14 relative')}>
      <AnimatedBackground
        lazy={false}
        speed="static"
        maxLayers={1}
        heartbeat
        heartbeatPreset="relaxed"
        heartbeatOpacityOnly
        performanceTier={performanceTier}
        className="animated-background--login"
      />
      <div className={cn(SPACING.layout.contentMaxNarrow, 'relative z-10')}>
        <Card
          className={cn(
            SPACING.card.base,
            ELEVATION.card,
            'w-full gap-0 overflow-hidden border-border/70 bg-card/95 shadow-xl backdrop-blur-sm dark:shadow-none',
          )}
        >
        <CardHeader className="space-y-4 px-6 pb-0 pt-8 text-center sm:px-8 sm:pt-10">
          <div className="flex justify-center">
            <AppLogo size="lg" variant="monochrome" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            {APP_NAME.toUpperCase()}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-8 pt-6 sm:px-8 sm:pb-10 sm:pt-7">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'login' | 'register')} className="w-full gap-0">
            <TabsList className="mb-1 grid h-10 w-full grid-cols-2">
              <TabsTrigger value="login" className={NAVIGATION.tabs.trigger}>{t('login.title')}</TabsTrigger>
              <TabsTrigger value="register" className={NAVIGATION.tabs.trigger}>{t('register.title')}</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className={cn(NAVIGATION.tabs.contentMargin, 'space-y-5')}>
              {rateLimitedUntil && countdown > 0 && (
                <Alert variant="destructive">
                  <Icon name="AlertTriangle" className="h-4 w-4" forceDefault />
                  <AlertDescription>
                    <div className="text-sm font-semibold">Too many login attempts</div>
                    <div className="mt-1 text-sm text-destructive/90">
                      Please try again in {Math.floor(countdown / 60)} minute{Math.floor(countdown / 60) !== 1 ? 's' : ''}{countdown % 60 > 0 ? ` ${countdown % 60} second${countdown % 60 !== 1 ? 's' : ''}` : ''}.
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('login.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('login.placeholderEmail')}
                    disabled={loading}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">{t('login.password')}</Label>
                    <button
                      type="button"
                      onClick={() => setForgotPasswordOpen(true)}
                      className="text-xs font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
                    >
                      {t('login.forgotPassword')}
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('login.placeholderPassword')}
                    disabled={loading}
                    className="h-11"
                  />
                </div>
                <Button type="submit" className="mt-1 h-11 w-full text-sm font-semibold" disabled={loading}>
                  {loading ? t('login.submit') + '...' : t('login.submit')}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className={cn(NAVIGATION.tabs.contentMargin, 'space-y-5')}>
              {validatingInvitation && (
                <Alert>
                  <LoadingSpinner size="sm" className="mr-2" />
                  <AlertDescription className="text-sm">Validating invitation...</AlertDescription>
                </Alert>
              )}
              
              {invitationError && (
                <Alert variant="destructive">
                  <Icon name="AlertTriangle" className="h-4 w-4" forceDefault />
                  <AlertDescription className="text-sm">{invitationError}</AlertDescription>
                </Alert>
              )}
              
              {invitationData && !invitationError && (
                <Alert className={cn(COLORS.statusBg.info, 'border-border/60')}>
                  <Icon name="CheckCircle" className={`h-4 w-4 ${COLORS.status.info}`} forceDefault />
                  <AlertDescription>
                    <div className="text-sm font-semibold">You've been invited!</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {invitationData.invitationType === 'document' ? (
                        <>
                          <strong className="font-medium text-foreground">{invitationData.inviterName}</strong> has invited you to collaborate on the document{' '}
                          <strong className="font-medium text-foreground">"{invitationData.organizationName}"</strong>.
                        </>
                      ) : (
                        <>
                          <strong className="font-medium text-foreground">{invitationData.inviterName}</strong> has invited you to join{' '}
                          <strong className="font-medium text-foreground">{invitationData.organizationName}</strong> as a{' '}
                          <strong className="font-medium text-foreground">{invitationData.invitationType}</strong>.
                        </>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              
              <form onSubmit={handleRegister} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="regName">{t('register.name')}</Label>
                  <Input
                    id="regName"
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder={t('register.placeholderName')}
                    disabled={registering || validatingInvitation}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regEmail">{t('register.email')}</Label>
                  <Input
                    id="regEmail"
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder={t('register.placeholderEmail')}
                    disabled={registering || validatingInvitation || !!invitationData}
                    className={cn('h-11', invitationData && COLORS.bg.muted)}
                  />
                  {invitationData && (
                    <p className="text-xs leading-relaxed text-muted-foreground/90">
                      {t('register.invitationEmailLocked')}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regPassword">{t('register.password')}</Label>
                  <Input
                    id="regPassword"
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder={t('register.placeholderPassword')}
                    disabled={registering}
                    className="h-11"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground/90">
                    {t('resetPassword.passwordHint')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regConfirmPassword">{t('resetPassword.confirmPassword')}</Label>
                  <Input
                    id="regConfirmPassword"
                    type="password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder={t('register.placeholderConfirmPassword')}
                    disabled={registering}
                    className="h-11"
                  />
                </div>
                <div className="flex items-start gap-3 pt-1">
                  <Checkbox
                    id="accept-legal"
                    checked={acceptedLegal}
                    onCheckedChange={(checked) => setAcceptedLegal(checked === true)}
                    disabled={registering}
                    className="mt-0.5 size-5 shrink-0"
                  />
                  <label
                    htmlFor="accept-legal"
                    className="block min-w-0 flex-1 cursor-pointer text-sm font-normal leading-relaxed text-muted-foreground/90"
                  >
                    <Trans
                      i18nKey="legal:consent.label"
                      components={{
                        termsLink: (
                          <a
                            href={buildInfoPath('terms')}
                            className="text-primary underline-offset-4 hover:underline"
                          />
                        ),
                        privacyLink: (
                          <a
                            href={buildInfoPath('privacy')}
                            className="text-primary underline-offset-4 hover:underline"
                          />
                        ),
                      }}
                    />
                  </label>
                </div>
                <Button
                  type="submit"
                  className="mt-1 h-11 w-full text-sm font-semibold"
                  disabled={registering || !acceptedLegal}
                >
                  {registering ? t('register.submitting') : t('register.submit')}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

        </CardContent>
      </Card>
      <ForgotPasswordDialog
        open={forgotPasswordOpen}
        onOpenChange={setForgotPasswordOpen}
        onBackToLogin={() => {
          setForgotPasswordOpen(false);
          setActiveTab('login');
        }}
      />
      <SiteFooterLinks className="mt-8" />
      </div>
    </div>
  );
}
