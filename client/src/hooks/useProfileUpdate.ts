import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { authApi } from '../lib/api/auth';
import type { UpdateProfilePayload } from '../lib/api/types/auth';
import type { User } from '../types';
import { logger } from '../lib/logger';

export function useProfileUpdate(onProfileUpdate: (user: User) => void) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateProfile = useCallback(async (payload: UpdateProfilePayload) => {
    setIsSubmitting(true);
    try {
      const data = await authApi.updateProfile(payload);
      onProfileUpdate(data.user);
      toast.success('Profile updated successfully!');
      return data.user;
    } catch (error) {
      logger.error('Profile update error:', error);
      toast.error('Failed to update profile. Please try again.');
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [onProfileUpdate]);

  return { updateProfile, isSubmitting };
}
