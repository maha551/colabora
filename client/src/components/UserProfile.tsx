import React, { useState } from "react";
import { User } from "../types";
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
import { Textarea } from "./ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Camera, Loader2, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "./ui/utils";

interface UserProfileProps {
  user: User;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onProfileUpdate: (updatedUser: User) => void;
  isModal?: boolean;
}

export function UserProfile({ user, open, onOpenChange, onProfileUpdate, isModal = true }: UserProfileProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size should be less than 5MB');
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const updateData: any = {
        name: name.trim(),
        email: email.trim(),
        bio: bio.trim(),
      };

      // If there's a new avatar, include it
      if (avatarPreview) {
        updateData.avatar = avatarPreview;
      } else if (avatarUrl) {
        updateData.avatarUrl = avatarUrl;
      }

      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      const data = await response.json();
      
      // Update the user in parent component
      onProfileUpdate(data.user);

      toast.success('Profile updated successfully!');
      if (onOpenChange) {
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Profile update error:', error);
      toast.error('Failed to update profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    // Reset to original values
    setName(user.name);
    setEmail(user.email);
    setBio('');
    setAvatarUrl('');
    setAvatarPreview(null);
    if (onOpenChange) {
      onOpenChange(false);
    }
  };

  const currentAvatar = avatarPreview || avatarUrl || user.email;

  const formContent = (
    <form onSubmit={handleSubmit}>
      <div className="space-y-6 py-4">
            {/* Avatar Upload */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={currentAvatar} />
                  <AvatarFallback className="text-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                    {name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <label
                  htmlFor="avatar-upload"
                  className={cn(
                    "absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full cursor-pointer",
                    "hover:bg-blue-700 transition-colors shadow-lg"
                  )}
                >
                  <Camera className="h-4 w-4" />
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                    disabled={isSubmitting}
                  />
                </label>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600">Click camera to change avatar</p>
                <p className="text-xs text-gray-400 mt-1">Max size: 5MB</p>
              </div>
            </div>

            {/* Avatar URL (Alternative to upload) */}
            <div className="space-y-2">
              <Label htmlFor="avatar-url">Avatar URL (Optional)</Label>
              <Input
                id="avatar-url"
                type="url"
                placeholder="https://example.com/avatar.jpg"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-gray-500">
                Or paste a direct link to an image
              </p>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <Label htmlFor="bio">Bio (Optional)</Label>
              <Textarea
                id="bio"
                placeholder="Tell others about yourself..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                disabled={isSubmitting}
                className="min-h-[80px] resize-none"
                maxLength={200}
              />
              <p className="text-xs text-gray-500 text-right">
                {bio.length}/200 characters
              </p>
            </div>

          <div className="flex gap-2 pt-4">
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </form>
  );

  if (isModal) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update your profile information. Changes will be visible to all collaborators.
            </DialogDescription>
          </DialogHeader>
          {formContent}
        </DialogContent>
      </Dialog>
    );
  }

  return formContent;
}

