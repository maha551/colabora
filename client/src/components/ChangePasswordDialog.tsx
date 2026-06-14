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
import { COLORS } from "../lib/designSystem";
import { cn } from "./ui/utils";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { t } = useTranslation('auth');
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return "Password must be at least 8 characters long";
    }
    if (!/[a-z]/.test(password)) {
      return "Password must contain at least one lowercase letter";
    }
    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least one uppercase letter";
    }
    if (!/\d/.test(password)) {
      return "Password must contain at least one number";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setErrors({});

    // Validate current password
    if (!currentPassword.trim()) {
      setErrors({ currentPassword: t('changePassword.currentPasswordRequired') });
      toast.error(t('changePassword.currentPasswordRequired'));
      return;
    }

    // Validate new password
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setErrors({ newPassword: passwordError });
      toast.error(passwordError);
      return;
    }

    // Validate password match
    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: t('changePassword.passwordsDoNotMatch') });
      toast.error(t('changePassword.passwordsDoNotMatch'));
      return;
    }

    // Check if new password is same as current
    if (currentPassword === newPassword) {
      setErrors({ newPassword: t('changePassword.newPasswordDifferent') });
      toast.error(t('changePassword.newPasswordDifferent'));
      return;
    }

    setIsSubmitting(true);

    try {
      await authApi.changePassword(currentPassword, newPassword);
      
      // Show success state
      setIsSuccess(true);
      toast.success(t('changePassword.success'));
      
      // Reset form
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrors({});
      
      // Close dialog after a brief delay to show success message
      setTimeout(() => {
        setIsSuccess(false);
        onOpenChange(false);
      }, 1500);
    } catch (error: any) {
      logger.error("Password change error:", error);
      
      // Extract error code from various possible structures
      const errorCode = error?.code || error?.error?.code || error?.details?.code;
      const errorMessage = error?.message || error?.error?.message || error?.details?.message;
      const fieldErrors = error?.fieldErrors || error?.error?.details?.fieldErrors || error?.details?.fieldErrors;
      
      // Handle validation errors with field-specific messages
      if (errorCode === "VALIDATION_ERROR" && fieldErrors) {
        const newErrors: Record<string, string> = {};
        
        // Set field-specific errors
        if (fieldErrors.currentPassword) {
          newErrors.currentPassword = fieldErrors.currentPassword;
        }
        if (fieldErrors.newPassword) {
          newErrors.newPassword = fieldErrors.newPassword;
        }
        if (fieldErrors.confirmPassword) {
          newErrors.confirmPassword = fieldErrors.confirmPassword;
        }
        
        setErrors(newErrors);
        
        // Show the first error as toast
        const firstError = Object.values(fieldErrors)[0];
        if (firstError) {
          toast.error(Array.isArray(firstError) ? firstError[0] : firstError);
        }
      } else if (errorCode === "INVALID_CURRENT_PASSWORD") {
        setErrors({ currentPassword: "Current password is incorrect" });
        toast.error(t('changePassword.currentPasswordIncorrect'));
      } else if (errorMessage) {
        toast.error(errorMessage);
      } else {
        toast.error(t('changePassword.failed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrors({});
    setIsSuccess(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>
            {isSuccess 
              ? "Your password has been changed successfully!"
              : "Enter your current password and choose a new password. Your new password must be at least 8 characters long and contain uppercase, lowercase, and a number."
            }
          </DialogDescription>
        </DialogHeader>
        {isSuccess ? (
          <div className="py-8 flex flex-col items-center justify-center space-y-4">
            <Icon name="CheckCircle2" className={cn('h-16 w-16', COLORS.status.success)} />
            <p className={cn('text-center text-lg font-medium', COLORS.status.success)}>
              Password changed successfully!
            </p>
            <p className="text-center text-sm text-muted-foreground">
              The dialog will close automatically...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
            {/* Current Password */}
            <div className="space-y-2">
              <Label htmlFor="currentPassword">
                Current Password <span className={COLORS.status.error}>*</span>
              </Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  placeholder={t('changePassword.placeholderCurrent')}
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    if (errors.currentPassword) {
                      setErrors(prev => {
                        const next = { ...prev };
                        delete next.currentPassword;
                        return next;
                      });
                    }
                  }}
                  disabled={isSubmitting}
                  className={errors.currentPassword ? "border-[var(--status-rejected-solid)]" : ""}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? (
                    <Icon name="EyeOff" className="h-4 w-4" />
                  ) : (
                    <Icon name="Eye" className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.currentPassword && (
                <p className={cn('text-sm', COLORS.status.error)}>{errors.currentPassword}</p>
              )}
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="newPassword">
                New Password <span className={COLORS.status.error}>*</span>
              </Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Enter your new password"
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
                  className={errors.newPassword ? "border-[var(--status-rejected-solid)]" : ""}
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
                <p className={cn('text-sm', COLORS.status.error)}>{errors.newPassword}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters with uppercase, lowercase, and a number
              </p>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                Confirm New Password <span className={COLORS.status.error}>*</span>
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder={t('changePassword.placeholderConfirm')}
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
                  className={errors.confirmPassword ? "border-[var(--status-rejected-solid)]" : ""}
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
                <p className={cn('text-sm', COLORS.status.error)}>{errors.confirmPassword}</p>
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
                  Changing...
                </>
              ) : (
                "Change Password"
              )}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
