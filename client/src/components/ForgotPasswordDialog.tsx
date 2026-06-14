import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Icon } from "./ui/Icon";
import { toast } from "sonner";
import { authApi } from "../lib/api/auth";
import { logger } from "../lib/logger";
import { COLORS, RADIUS } from '../lib/designSystem';
import { cn } from "./ui/utils";

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBackToLogin?: () => void;
}

export function ForgotPasswordDialog({ open, onOpenChange, onBackToLogin }: ForgotPasswordDialogProps) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous error
    setError(null);

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      setError(t('forgotPassword.emailRequired'));
      toast.error(t('forgotPassword.emailRequired'));
      return;
    }

    if (!emailRegex.test(email)) {
      setError(t('forgotPassword.invalidEmail'));
      toast.error(t('forgotPassword.invalidEmail'));
      return;
    }

    setIsSubmitting(true);

    try {
      await authApi.forgotPassword(email.trim());
      setIsSuccess(true);
      toast.success(t('forgotPassword.resetLinkSent'));
    } catch (error: any) {
      logger.error("Forgot password error:", error);
      
      // Always show success message (security: prevent email enumeration)
      // But log the actual error for debugging
      setIsSuccess(true);
      
      if (error?.error?.message) {
        toast.error(error.error.message);
      } else {
        toast.error(t('forgotPassword.failedToSend'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setEmail("");
    setError(null);
    setIsSuccess(false);
    onOpenChange(false);
  };

  const handleBackToLogin = () => {
    handleCancel();
    if (onBackToLogin) {
      onBackToLogin();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Forgot Password</DialogTitle>
          <DialogDescription>
            {isSuccess
              ? "If an account exists with this email, a password reset link has been sent."
              : "Enter your email address and we'll send you a link to reset your password."}
          </DialogDescription>
        </DialogHeader>
        {!isSuccess ? (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email Address <span className={COLORS.status.error}>*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('forgotPassword.placeholderEmail')}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) {
                      setError(null);
                    }
                  }}
                  disabled={isSubmitting}
                  className={error ? "border-[var(--status-rejected-solid)]" : ""}
                  required
                />
                {error && (
                  <p className={cn('text-sm', COLORS.status.error)}>{error}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Icon name="Loader2" className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 py-4">
            <div className={cn(RADIUS.control, "border p-4", COLORS.statusBg.success, "border-[var(--status-approved-border)]")}>
              <p className={`text-sm ${COLORS.status.success}`}>
                If an account exists with the email address <strong>{email}</strong>, a password reset link has been sent. Please check your inbox and follow the instructions to reset your password.
              </p>
              <p className={`text-xs ${COLORS.status.success} mt-2`}>
                The link will expire in 1 hour. If you didn't receive the email, please check your spam folder or try again.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleBackToLogin}
              >
                Back to Login
              </Button>
              <Button
                type="button"
                onClick={handleCancel}
              >
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
