import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Icon } from "./ui/Icon";
import { toast } from "sonner";
import { authApi } from "../lib/api/auth";
import { logger } from "../lib/logger";
import { AppLogo } from "./shared/AppLogo";
import { COLORS, RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';

interface ResetPasswordProps {
  onBackToLogin?: () => void;
}

export function ResetPassword({ onBackToLogin }: ResetPasswordProps) {
  const { t } = useTranslation('auth');
  const [token, setToken] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Extract token from URL on mount
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlToken = searchParams.get("token");
    setToken(urlToken);
    
    if (!urlToken) {
      setTokenValid(false);
      setIsValidating(false);
      return;
    }

    // Token validation is done on submit - we just check if token exists
    setTokenValid(true);
    setIsValidating(false);
  }, []);

  const validatePassword = (password: string): string | null => {
    // Trim password for validation but don't modify the actual value
    const trimmed = password.trim();
    
    if (trimmed.length < 8) {
      return t('resetPassword.passwordMinLength');
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
    if (!passwordRegex.test(trimmed)) {
      return t('resetPassword.passwordComplexity');
    }
    
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error(t('resetPassword.invalidResetLink'));
      return;
    }

    // Clear previous errors
    setErrors({});

    // Trim passwords for validation and submission (consistent with backend expectations)
    const trimmedNewPassword = newPassword.trim();
    const trimmedConfirmPassword = confirmPassword.trim();
    
    // Validate new password (on trimmed version)
    const passwordError = validatePassword(trimmedNewPassword);
    if (passwordError) {
      setErrors({ newPassword: passwordError });
      toast.error(passwordError);
      return;
    }
    
    // Check if password is empty after trimming
    if (trimmedNewPassword.length === 0) {
      setErrors({ newPassword: t('resetPassword.passwordEmpty') });
      toast.error(t('resetPassword.passwordEmpty'));
      return;
    }
    if (trimmedNewPassword !== trimmedConfirmPassword) {
      setErrors({ confirmPassword: t('resetPassword.passwordsDoNotMatch') });
      toast.error(t('resetPassword.passwordsDoNotMatch'));
      return;
    }

    setIsSubmitting(true);

    try {
      // Send trimmed password to backend
      await authApi.resetPassword(token, trimmedNewPassword);
      toast.success(t('resetPassword.resetSuccess'));
      
      // Redirect to login after a short delay
      setTimeout(() => {
        if (onBackToLogin) {
          onBackToLogin();
        } else {
          window.location.href = "/";
        }
      }, 2000);
    } catch (error: any) {
      logger.error("Password reset error:", error);
      
      // Extract error code from various possible structures
      const errorCode = error?.code || error?.error?.code || error?.details?.code;
      const errorMessage = error?.message || error?.error?.message || error?.details?.message;
      const fieldErrors = error?.fieldErrors || error?.error?.details?.fieldErrors || error?.details?.fieldErrors;
      
      // Handle validation errors with field-specific messages
      if (errorCode === "VALIDATION_ERROR" && fieldErrors) {
        const newErrors: Record<string, string> = {};
        
        // Set field-specific errors
        if (fieldErrors.newPassword) {
          newErrors.newPassword = fieldErrors.newPassword;
        }
        if (fieldErrors.confirmPassword) {
          newErrors.confirmPassword = fieldErrors.confirmPassword;
        }
        if (fieldErrors.token) {
          newErrors.token = fieldErrors.token;
        }
        
        setErrors(newErrors);
        
        // Show the first error as toast
        const firstError = Object.values(fieldErrors)[0];
        if (firstError) {
          toast.error(Array.isArray(firstError) ? firstError[0] : firstError);
        }
      } else if (errorCode === "INVALID_RESET_TOKEN" || errorCode === "RESET_TOKEN_EXPIRED") {
        setTokenValid(false);
        toast.error(t('resetPassword.invalidOrExpiredLink'));
      } else if (errorCode === "RESET_TOKEN_ALREADY_USED") {
        setTokenValid(false);
        toast.error(t('resetPassword.linkAlreadyUsed'));
      } else if (errorMessage) {
        toast.error(errorMessage);
      } else {
        toast.error(t('resetPassword.resetFailed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Icon name="Loader2" className={`h-8 w-8 animate-spin ${COLORS.status.info}`} />
              <p className="text-sm text-muted-foreground">{t('resetPassword.validatingLink')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tokenValid || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <AppLogo />
            </div>
            <CardTitle>{t('resetPassword.invalidResetLinkTitle')}</CardTitle>
            <CardDescription>
              {t('resetPassword.invalidResetLinkDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={cn(RADIUS.control, "border p-4", COLORS.statusBg.error, "border-[var(--status-rejected-border)]")}>
              <div className="flex">
                <Icon name="AlertCircle" className={`h-5 w-5 mr-2 ${COLORS.status.error}`} />
                <div className={`text-sm ${COLORS.status.error}`}>
                  <p className="font-medium">Reset link expired or invalid</p>
                  <p className="mt-1">
                    Password reset links expire after 1 hour. Please request a new password reset link.
                  </p>
                </div>
              </div>
            </div>
            <Button
              onClick={() => {
                if (onBackToLogin) {
                  onBackToLogin();
                } else {
                  window.location.href = "/";
                }
              }}
              className="w-full"
            >
              {t('resetPassword.goToLogin')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <AppLogo />
          </div>
          <CardTitle>{t('resetPassword.resetYourPassword')}</CardTitle>
          <CardDescription>
            {t('resetPassword.enterNewPasswordHint')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="newPassword">
                {t('resetPassword.newPassword')} <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  placeholder={t('resetPassword.placeholderNew')}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (errors.newPassword) {
                      setErrors(prev => {
                        const next = { ...prev };
                        delete next.newPassword;
                        return next;
                      });
                    }
                  }}
                  disabled={isSubmitting}
                  className={errors.newPassword ? "border-red-500" : ""}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showNewPassword ? (
                    <Icon name="EyeOff" className="h-4 w-4" />
                  ) : (
                    <Icon name="Eye" className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.newPassword && (
                <p className="text-sm text-red-500">{errors.newPassword}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('resetPassword.passwordHint')}
              </p>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                {t('resetPassword.confirmPassword')} <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder={t('resetPassword.placeholderConfirm')}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errors.confirmPassword) {
                      setErrors(prev => {
                        const next = { ...prev };
                        delete next.confirmPassword;
                        return next;
                      });
                    }
                  }}
                  disabled={isSubmitting}
                  className={errors.confirmPassword ? "border-red-500" : ""}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <Icon name="EyeOff" className="h-4 w-4" />
                  ) : (
                    <Icon name="Eye" className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-sm text-red-500">{errors.confirmPassword}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Icon name="Loader2" className="h-4 w-4 mr-2 animate-spin" />
                  {t('resetPassword.resettingPassword')}
                </>
              ) : (
                t('resetPassword.submit')
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                if (onBackToLogin) {
                  onBackToLogin();
                } else {
                  window.location.href = "/";
                }
              }}
              disabled={isSubmitting}
            >
              {t('resetPassword.backToLogin')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
