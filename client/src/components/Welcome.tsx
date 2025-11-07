import { useState } from "react";
import { User } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  FileText,
  Users,
  Vote,
  CheckCircle2,
  ArrowRight,
  Lightbulb,
  Target,
  Zap
} from "lucide-react";

interface WelcomeProps {
  currentUser: User;
  onCreateDocument: () => void;
  onDismiss: () => void;
}

export function Welcome({ currentUser, onCreateDocument, onDismiss }: WelcomeProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: "Welcome to Collaborative Drafting!",
      description: "Create and collaborate on documents with your team using our unique voting system.",
      icon: <Lightbulb className="h-8 w-8 text-yellow-500" />,
      content: (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-blue-600 text-white">
                {currentUser.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">Welcome, {currentUser.name}!</p>
              <p className="text-sm text-gray-600">Ready to start collaborating?</p>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "How It Works",
      description: "Our collaborative drafting process is simple and effective.",
      icon: <Target className="h-8 w-8 text-green-500" />,
      content: (
        <div className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-blue-600">1</span>
              </div>
              <div>
                <h4 className="font-medium">Create a Document</h4>
                <p className="text-sm text-gray-600">Start with a blank page or use a template</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-blue-600">2</span>
              </div>
              <div>
                <h4 className="font-medium">Invite Collaborators</h4>
                <p className="text-sm text-gray-600">Add team members to work together</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-blue-600">3</span>
              </div>
              <div>
                <h4 className="font-medium">Propose Changes</h4>
                <p className="text-sm text-gray-600">Suggest edits and improvements</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-blue-600">4</span>
              </div>
              <div>
                <h4 className="font-medium">Vote & Approve</h4>
                <p className="text-sm text-gray-600">Changes need 75% approval to be accepted</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Key Features",
      description: "Discover what makes collaborative drafting powerful.",
      icon: <Zap className="h-8 w-8 text-purple-500" />,
      content: (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Vote className="h-5 w-5 text-blue-600" />
                Democratic Voting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Every change requires 75% approval from all collaborators, ensuring consensus-driven decisions.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-green-600" />
                Real-time Collaboration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Multiple team members can propose, discuss, and vote on changes simultaneously.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-600" />
                Version History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Track all changes and maintain a complete history of your document's evolution.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Final Agreements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                View the finalized, agreed-upon version of your document with all approved changes.
              </CardDescription>
            </CardContent>
          </Card>
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Progress Indicator */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`w-3 h-3 rounded-full transition-colors ${
                  index <= currentStep ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Main Card */}
        <Card className="shadow-xl border-0">
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

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6 border-t">
              <Button
                variant="ghost"
                onClick={onDismiss}
                className="text-gray-600"
              >
                Skip Tour
              </Button>

              <div className="flex items-center gap-3">
                {currentStep > 0 && (
                  <Button variant="outline" onClick={prevStep}>
                    Previous
                  </Button>
                )}

                <Button onClick={nextStep} className="gap-2">
                  {currentStep === steps.length - 1 ? (
                    <>
                      Get Started
                      <ArrowRight className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Start Option */}
        {currentStep === 0 && (
          <div className="mt-6 text-center">
            <p className="text-gray-600 mb-3">Want to jump right in?</p>
            <Button
              variant="outline"
              onClick={onCreateDocument}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Create Your First Document
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
