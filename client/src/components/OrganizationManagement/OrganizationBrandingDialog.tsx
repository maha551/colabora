import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Organization, User } from '../../types';
import { organizationsApi } from '../../lib/api';
import { toast } from 'sonner';
import { AppHeader } from '../layout/AppHeader';
import { DEFAULT_ORGANIZATION_COLOR } from '../../lib/constants';
import { logger } from '../../lib/logger';
import { RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';

// Image upload validation constants
// Must match backend validation: MAX_IMAGE_SIZE_BYTES in server/middleware/validation.js
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

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
  const { t } = useTranslation(['organization', 'common']);
  const maxMb = MAX_IMAGE_SIZE_BYTES / (1024 * 1024);
  const [brandingColor, setBrandingColor] = useState(organization.brandingColor || DEFAULT_ORGANIZATION_COLOR);
  const [brandingLogoUrl, setBrandingLogoUrl] = useState(organization.brandingLogoUrl || '');
  const [brandingTitle, setBrandingTitle] = useState(organization.brandingTitle || '');
  const [brandingBannerUrl, setBrandingBannerUrl] = useState(organization.brandingBannerUrl || '');
  const [iconSet, setIconSet] = useState<'lucide' | 'tabler' | 'heroicons'>(organization.iconSet || 'lucide');
  const [fontFamily, setFontFamily] = useState<'inter' | 'work-sans' | 'poppins' | 'merriweather'>(organization.fontFamily || 'inter');
  const [logoPreview, setLogoPreview] = useState<string | null>(organization.brandingLogoUrl || null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(organization.brandingBannerUrl || null);
  const [bannerUrlInput, setBannerUrlInput] = useState(organization.brandingBannerUrl || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens/closes or organization changes
  useEffect(() => {
    if (open) {
      setBrandingColor(organization.brandingColor || DEFAULT_ORGANIZATION_COLOR);
      setBrandingLogoUrl(organization.brandingLogoUrl || '');
      setBrandingTitle(organization.brandingTitle || '');
      setBrandingBannerUrl(organization.brandingBannerUrl || '');
      setIconSet(organization.iconSet || 'lucide');
      setFontFamily(organization.fontFamily || 'inter');
      setLogoPreview(organization.brandingLogoUrl || null);
      setBannerPreview(organization.brandingBannerUrl || null);
      setBannerUrlInput(organization.brandingBannerUrl || '');
    }
  }, [open, organization]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        toast.error(t('brandingDialog.toasts.imageTooLarge', { maxMb }));
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error(t('brandingDialog.toasts.selectImageFile'));
        return;
      }

      // Create preview and convert to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        
        // Validate that the image can actually be loaded
        const img = new Image();
        img.onload = () => {
          setLogoPreview(dataUrl);
          setBrandingLogoUrl(dataUrl);
        };
        img.onerror = () => {
          toast.error(t('brandingDialog.toasts.invalidImage'));
          setLogoPreview(null);
          setBrandingLogoUrl('');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setBrandingLogoUrl('');
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        toast.error(t('brandingDialog.toasts.imageTooLarge', { maxMb }));
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error(t('brandingDialog.toasts.selectImageFile'));
        return;
      }

      // Create preview and convert to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        
        // Validate that the image can actually be loaded
        const img = new Image();
        img.onload = () => {
          setBannerPreview(dataUrl);
          setBrandingBannerUrl(dataUrl);
          setBannerUrlInput(''); // Clear URL input when file is uploaded
        };
        img.onerror = () => {
          toast.error(t('brandingDialog.toasts.invalidImage'));
          setBannerPreview(null);
          setBrandingBannerUrl('');
          setBannerUrlInput('');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value.trim();
    setBannerUrlInput(url);
    if (url) {
      // Validate URL format
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // Validate that the image can actually be loaded
        const img = new Image();
        img.onload = () => {
          setBannerPreview(url);
          setBrandingBannerUrl(url);
        };
        img.onerror = () => {
          toast.error(t('brandingDialog.toasts.urlLoadFailed'));
          setBannerPreview(null);
          setBrandingBannerUrl('');
        };
        img.src = url;
      } else {
        toast.error(t('brandingDialog.toasts.invalidUrl'));
        setBannerPreview(null);
        setBrandingBannerUrl('');
      }
    } else {
      setBannerPreview(null);
      setBrandingBannerUrl('');
    }
  };

  const handleRemoveBanner = () => {
    setBannerPreview(null);
    setBrandingBannerUrl('');
    setBannerUrlInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(brandingColor)) {
      toast.error(t('brandingDialog.toasts.invalidHexColor'));
      return;
    }

    setIsSubmitting(true);

    try {
      // Build update object, only including fields that have values
      const updates: {
        brandingColor?: string;
        brandingLogoUrl?: string | null;
        brandingTitle?: string | null;
        brandingBannerUrl?: string | null;
        iconSet?: 'lucide' | 'tabler' | 'heroicons' | null;
        fontFamily?: 'inter' | 'work-sans' | 'poppins' | 'merriweather' | null;
      } = {
        brandingColor,
        iconSet: iconSet || null,
        fontFamily: fontFamily || null,
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

      // Only include bannerUrl if it exists, or explicitly set to null to clear it
      if (brandingBannerUrl) {
        updates.brandingBannerUrl = brandingBannerUrl;
      } else if (organization.brandingBannerUrl) {
        // If there was a banner before and now it's empty, set to null to clear it
        updates.brandingBannerUrl = null;
      }

      await organizationsApi.updateOrganization(organization.id, updates);

      toast.success(t('brandingDialog.toasts.updated'));
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      logger.error('Failed to update organization branding:', error);
      toast.error(error instanceof Error ? error.message : t('brandingDialog.toasts.updateFailed'));
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
    brandingBannerUrl: bannerPreview || undefined,
    iconSet,
    fontFamily,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('brandingDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('brandingDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Preview */}
          <div className="space-y-2">
            <Label>{t('brandingDialog.preview')}</Label>
            <div className={cn("border overflow-hidden", RADIUS.panel)}>
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
            <Label htmlFor="brandingColor">{t('brandingDialog.headerColor')}</Label>
            <div className="flex gap-2">
              <Input
                id="brandingColor"
                type="text"
                value={brandingColor}
                onChange={(e) => setBrandingColor(e.target.value)}
                placeholder={t('brandingDialog.colorPlaceholder')}
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
            <p className="text-sm text-muted-foreground">
              {t('brandingDialog.colorHint')}
            </p>
          </div>

          {/* Logo Upload */}
          <div className="space-y-2">
            <Label htmlFor="logo">{t('brandingDialog.logoOptional')}</Label>
            {logoPreview ? (
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <img
                    src={logoPreview}
                    alt={t('brandingDialog.logoPreviewAlt')}
                    className="h-20 w-20 object-contain border rounded"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">{t('brandingDialog.logoPreviewLabel')}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveLogo}
                      className="mt-2"
                    >
                      {t('brandingDialog.removeLogo')}
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
                <p className="text-sm text-muted-foreground mt-1">
                  {t('brandingDialog.logoUploadHint', { maxMb })}
                </p>
              </div>
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="brandingTitle">{t('brandingDialog.customTitleOptional')}</Label>
            <Input
              id="brandingTitle"
              type="text"
              value={brandingTitle}
              onChange={(e) => setBrandingTitle(e.target.value)}
              placeholder={organization.name}
              maxLength={100}
            />
            <p className="text-sm text-muted-foreground">
              {t('brandingDialog.customTitleHint')}
            </p>
          </div>

          {/* Banner Upload/URL */}
          <div className="space-y-2">
            <Label htmlFor="banner">{t('brandingDialog.dashboardBannerOptional')}</Label>
            {bannerPreview ? (
              <div className="space-y-2">
                <div className="space-y-2">
                  <img
                    src={bannerPreview}
                    alt={t('brandingDialog.bannerPreviewAlt')}
                    className={cn("w-full max-h-48 object-cover border", RADIUS.panel)}
                    onError={() => {
                      toast.error(t('brandingDialog.toasts.bannerLoadFailed'));
                      setBannerPreview(null);
                      setBrandingBannerUrl('');
                      setBannerUrlInput('');
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveBanner}
                  >
                    {t('brandingDialog.removeBanner')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="bannerFile" className="text-sm font-medium mb-2 block">
                    {t('brandingDialog.uploadImage')}
                  </Label>
                  <Input
                    id="bannerFile"
                    type="file"
                    accept="image/*"
                    onChange={handleBannerChange}
                    className="cursor-pointer"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('brandingDialog.bannerUploadHint')}
                  </p>
                </div>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">{t('brandingDialog.orDivider')}</span>
                  </div>
                </div>
                <div>
                  <Label htmlFor="bannerUrl" className="text-sm font-medium mb-2 block">
                    {t('brandingDialog.embedViaUrl')}
                  </Label>
                  <Input
                    id="bannerUrl"
                    type="url"
                    value={bannerUrlInput}
                    onChange={handleBannerUrlChange}
                    placeholder={t('brandingDialog.bannerUrlPlaceholder')}
                    className="w-full"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('brandingDialog.bannerUrlHint')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Icon Set */}
          <div className="space-y-2">
            <Label htmlFor="iconSet">{t('brandingDialog.iconSet')}</Label>
            <Select value={iconSet} onValueChange={(value) => setIconSet(value as 'lucide' | 'tabler' | 'heroicons')}>
              <SelectTrigger id="iconSet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[200]" sideOffset={4}>
                <SelectItem value="lucide">{t('brandingDialog.iconSetLucide')}</SelectItem>
                <SelectItem value="tabler">{t('brandingDialog.iconSetTabler')}</SelectItem>
                <SelectItem value="heroicons">{t('brandingDialog.iconSetHeroicons')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('brandingDialog.iconSetHint')}
            </p>
          </div>

          {/* Font Family */}
          <div className="space-y-2">
            <Label htmlFor="fontFamily">{t('brandingDialog.fontFamily')}</Label>
            <Select value={fontFamily} onValueChange={(value) => setFontFamily(value as 'inter' | 'work-sans' | 'poppins' | 'merriweather')}>
              <SelectTrigger id="fontFamily">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[200]" sideOffset={4}>
                <SelectItem value="inter">Inter</SelectItem>
                <SelectItem value="work-sans">Work Sans</SelectItem>
                <SelectItem value="poppins">Poppins</SelectItem>
                <SelectItem value="merriweather">Merriweather</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('brandingDialog.fontFamilyHint')}
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
              {t('common:buttons.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('brandingDialog.saving') : t('brandingDialog.saveChanges')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
