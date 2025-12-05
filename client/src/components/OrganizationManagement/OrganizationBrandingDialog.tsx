import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Organization, User } from '../../types';
import { organizationsApi } from '../../lib/api';
import { toast } from 'sonner';
import { AppHeader } from '../layout/AppHeader';

interface OrganizationBrandingDialogProps {
  organization: Organization;
  currentUser: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function OrganizationBrandingDialog({
  organization,
  currentUser,
  open,
  onOpenChange,
  onSuccess
}: OrganizationBrandingDialogProps) {
  const [brandingColor, setBrandingColor] = useState(organization.brandingColor || '#3B82F6');
  const [brandingLogoUrl, setBrandingLogoUrl] = useState(organization.brandingLogoUrl || '');
  const [brandingTitle, setBrandingTitle] = useState(organization.brandingTitle || '');
  const [logoPreview, setLogoPreview] = useState<string | null>(organization.brandingLogoUrl || null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens/closes or organization changes
  useEffect(() => {
    if (open) {
      setBrandingColor(organization.brandingColor || '#3B82F6');
      setBrandingLogoUrl(organization.brandingLogoUrl || '');
      setBrandingTitle(organization.brandingTitle || '');
      setLogoPreview(organization.brandingLogoUrl || null);
    }
  }, [open, organization]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

      // Create preview and convert to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setLogoPreview(dataUrl);
        setBrandingLogoUrl(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setBrandingLogoUrl('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(brandingColor)) {
      toast.error('Please enter a valid hex color code (e.g., #3B82F6)');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build update object, only including fields that have values
      const updates: {
        brandingColor?: string;
        brandingLogoUrl?: string | null;
        brandingTitle?: string | null;
      } = {
        brandingColor,
      };

      // Only include logoUrl if it exists, or explicitly set to null to clear it
      if (brandingLogoUrl) {
        updates.brandingLogoUrl = brandingLogoUrl;
      } else if (organization.brandingLogoUrl) {
        // If there was a logo before and now it's empty, set to null to clear it
        updates.brandingLogoUrl = null;
      }

      // Only include title if it exists, or explicitly set to null to clear it
      const trimmedTitle = brandingTitle.trim();
      if (trimmedTitle) {
        updates.brandingTitle = trimmedTitle;
      } else if (organization.brandingTitle) {
        // If there was a title before and now it's empty, set to null to clear it
        updates.brandingTitle = null;
      }

      await organizationsApi.updateOrganization(organization.id, updates);

      toast.success('Organization branding updated successfully');
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Failed to update organization branding:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update organization branding');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create a preview organization object for the header preview
  const previewOrganization: Organization = {
    ...organization,
    brandingColor,
    brandingLogoUrl: logoPreview || undefined,
    brandingTitle: brandingTitle || undefined,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customize Organization Branding</DialogTitle>
          <DialogDescription>
            Customize the appearance of your organization header. Changes will be visible to all members.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Preview */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="border rounded-lg overflow-hidden">
              <AppHeader
                currentUser={currentUser}
                onLogout={() => {}}
                organization={previewOrganization}
                title={previewOrganization.brandingTitle || previewOrganization.name}
              />
            </div>
          </div>

          {/* Color Picker */}
          <div className="space-y-2">
            <Label htmlFor="brandingColor">Header Color</Label>
            <div className="flex gap-2">
              <Input
                id="brandingColor"
                type="text"
                value={brandingColor}
                onChange={(e) => setBrandingColor(e.target.value)}
                placeholder="#3B82F6"
                pattern="^#[0-9A-Fa-f]{6}$"
                className="flex-1"
              />
              <input
                type="color"
                value={brandingColor}
                onChange={(e) => setBrandingColor(e.target.value)}
                className="h-10 w-20 cursor-pointer rounded border"
              />
            </div>
            <p className="text-sm text-gray-500">
              Enter a hex color code or use the color picker
            </p>
          </div>

          {/* Logo Upload */}
          <div className="space-y-2">
            <Label htmlFor="logo">Logo (Optional)</Label>
            {logoPreview ? (
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-20 w-20 object-contain border rounded"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Logo preview</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveLogo}
                      className="mt-2"
                    >
                      Remove Logo
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <Input
                  id="logo"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="cursor-pointer"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Upload an image (max 5MB). PNG, JPG, or GIF recommended.
                </p>
              </div>
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="brandingTitle">Custom Title (Optional)</Label>
            <Input
              id="brandingTitle"
              type="text"
              value={brandingTitle}
              onChange={(e) => setBrandingTitle(e.target.value)}
              placeholder={organization.name}
              maxLength={100}
            />
            <p className="text-sm text-gray-500">
              Leave empty to use the organization name. Max 100 characters.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
