import { useState } from "react";
import { useTranslation } from "react-i18next";
import { User } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Icon } from "./ui/Icon";
import { COLORS, SPACING, RADIUS } from "../lib/designSystem";
import { cn } from "./ui/utils";

interface WelcomeProps {
  currentUser: User;
  onCreateDocument: () => void;
  onDismiss: () => void;
}

export function Welcome({ currentUser, onCreateDocument, onDismiss }: WelcomeProps) {
  const { t } = useTranslation('onboarding');
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: t('welcome.title'),
      description: t('welcome.description'),
      icon: <Icon name="Lightbulb" className={`h-8 w-8 ${COLORS.status.warning}`} />,
      content: (
        <div className="space-y-4">
          <div className={cn('flex items-center gap-3 p-4', RADIUS.panel, COLORS.statusBg.info)}>
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-[var(--status-active-solid)] text-primary-foreground">
                {currentUser.name?.split(' ').map(n => n[0]).join('') || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{t('welcome.userWelcome', { name: currentUser.name })}</p>
              <p className="text-sm text-muted-foreground">{t('welcome.readyToCollaborate')}</p>
            </div>
          </div>
        </div>
      )
    },
    {
      title: t('welcome.howItWorksTitle'),
      description: t('welcome.howItWorksDescription'),
      icon: <Icon name="Target" className={`h-8 w-8 ${COLORS.status.success}`} />,
      content: (
        <div className="space-y-4">
          <div className="grid gap-3">
            {[
              { title: t('welcome.createDocumentTitle'), desc: t('welcome.createDocumentDescription') },
              { title: t('welcome.inviteCollaboratorsTitle'), desc: t('welcome.inviteCollaboratorsDescription') },
              { title: t('welcome.proposeChangesTitle'), desc: t('welcome.proposeChangesDescription') },
              { title: t('welcome.voteAndApproveTitle'), desc: t('welcome.voteAndApproveDescription') },
            ].map((item, index) => (
              <div key={item.title} className={cn('flex items-start gap-3 p-3 border border-border', RADIUS.panel)}>
                <div className={cn('flex-shrink-0 w-8 h-8 flex items-center justify-center', RADIUS.pill, COLORS.statusBg.info)}>
                  <span className={`text-sm font-bold ${COLORS.status.info}`}>{index + 1}</span>
                </div>
                <div>
                  <h4 className="font-medium">{item.title}</h4>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      title: t('welcome.featuresTitle'),
      description: t('welcome.featuresDescription'),
      icon: <Icon name="Zap" className="h-8 w-8 text-[var(--badge-purple-text)]" />,
      content: (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { icon: 'Vote', title: t('welcome.democraticVotingTitle'), desc: t('welcome.democraticVotingDescription'), color: COLORS.status.info },
            { icon: 'Users', title: t('welcome.realtimeCollaborationTitle'), desc: t('welcome.realtimeCollaborationDescription'), color: COLORS.status.success },
            { icon: 'FileText', title: t('welcome.versionHistoryTitle'), desc: t('welcome.versionHistoryDescription'), color: 'text-[var(--badge-purple-text)]' },
            { icon: 'CheckCircle2', title: t('welcome.finalAgreementsTitle'), desc: t('welcome.finalAgreementsDescription'), color: COLORS.status.success },
          ].map((feature) => (
            <Card key={feature.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Icon name={feature.icon as 'Vote'} className={`h-5 w-5 ${feature.color}`} />
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.desc}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      )
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onCreateDocument();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const currentStepData = steps[currentStep];

  return (
    <div className={cn("min-h-screen", COLORS.bg.page, COLORS.text.primary)}>
      <div className={cn(SPACING.layout.contentMaxNarrow, SPACING.page.x, SPACING.page.top, SPACING.page.y)}>
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "w-3 h-3 transition-colors", RADIUS.pill,
                  index <= currentStep ? "bg-primary" : COLORS.bg.muted
                )}
              />
            ))}
          </div>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="text-center pb-6">
            <div className="flex justify-center mb-4">
              {currentStepData.icon}
            </div>
            <CardTitle className="text-2xl mb-2">{currentStepData.title}</CardTitle>
            <CardDescription className="text-lg">
              {currentStepData.description}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {currentStepData.content}

            <div className="flex items-center justify-between pt-6 border-t">
              <Button
                variant="ghost"
                onClick={onDismiss}
                className="text-muted-foreground"
              >
                {t('welcome.skipTour')}
              </Button>

              <div className="flex items-center gap-3">
                {currentStep > 0 && (
                  <Button variant="outline" onClick={prevStep}>
                    {t('welcome.previous')}
                  </Button>
                )}

                <Button onClick={nextStep} className="gap-2">
                  {currentStep === steps.length - 1 ? (
                    <>
                      {t('welcome.getStarted')}
                      <Icon name="ArrowRight" className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      {t('next')}
                      <Icon name="ArrowRight" className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {currentStep === 0 && (
          <div className="mt-6 text-center">
            <p className="text-muted-foreground mb-3">{t('welcome.jumpRightIn')}</p>
            <Button
              variant="outline"
              onClick={onCreateDocument}
              className="gap-2"
            >
              <Icon name="FileText" className="h-4 w-4" />
              {t('welcome.createFirstDocument')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
