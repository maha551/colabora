import { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProfileData, ProfileLink, ProfileVisibility, User } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Icon } from '../ui/Icon';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { getUserColor } from '../../lib/userColors';
import { RADIUS } from '../../lib/designSystem';
import { useProfileUpdate } from '../../hooks/useProfileUpdate';
import { ProfileVisibilitySelect } from './ProfileVisibilitySelect';
import { TagInput, SuggestedTags } from './TagInput';
import { ProfilePreviewCard } from './ProfilePreviewCard';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const LINK_TYPES: ProfileLink['type'][] = ['website', 'linkedin', 'github', 'mastodon', 'custom'];
const SUGGESTED_INTERESTS = ['facilitation', 'governance', 'policy', 'legal', 'community'];
const SUGGESTED_SKILLS = ['mediation', 'translation', 'accounting', 'writing', 'design'];

function defaultContact() {
  return {
    phoneVisibility: 'hidden' as ProfileVisibility,
    emailVisibility: 'hidden' as ProfileVisibility,
    preferredMethod: 'email' as const,
  };
}

interface ProfileIdentityFormProps {
  user: User;
  onProfileUpdate: (user: User) => void;
}

export function ProfileIdentityForm({ user, onProfileUpdate }: ProfileIdentityFormProps) {
  const { t } = useTranslation('profile');
  const { t: tCommon } = useTranslation('common');
  const { updateProfile, isSubmitting } = useProfileUpdate(onProfileUpdate);

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [bio, setBio] = useState(user.bio || '');
  const [headline, setHeadline] = useState(user.profileData?.headline || '');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [links, setLinks] = useState<ProfileLink[]>(user.profileData?.links || []);
  const [phone, setPhone] = useState(user.profileData?.contact?.phone || '');
  const [phoneVisibility, setPhoneVisibility] = useState<ProfileVisibility>(
    user.profileData?.contact?.phoneVisibility || 'hidden'
  );
  const [emailVisibility, setEmailVisibility] = useState<ProfileVisibility>(
    user.profileData?.contact?.emailVisibility || 'hidden'
  );
  const [preferredMethod, setPreferredMethod] = useState<'email' | 'phone'>(
    user.profileData?.contact?.preferredMethod === 'phone' ? 'phone' : 'email'
  );
  const [interests, setInterests] = useState<string[]>(user.profileData?.tags?.interests || []);
  const [skills, setSkills] = useState<string[]>(user.profileData?.tags?.skills || []);
  const [tagsVisibility, setTagsVisibility] = useState<ProfileVisibility>(
    user.profileData?.tags?.visibility || 'org_members'
  );

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
    setBio(user.bio || '');
    setHeadline(user.profileData?.headline || '');
    setLinks(user.profileData?.links || []);
    setPhone(user.profileData?.contact?.phone || '');
    setPhoneVisibility(user.profileData?.contact?.phoneVisibility || 'hidden');
    setEmailVisibility(user.profileData?.contact?.emailVisibility || 'hidden');
    setPreferredMethod(user.profileData?.contact?.preferredMethod === 'phone' ? 'phone' : 'email');
    setInterests(user.profileData?.tags?.interests || []);
    setSkills(user.profileData?.tags?.skills || []);
    setTagsVisibility(user.profileData?.tags?.visibility || 'org_members');
    setAvatarUrl('');
    setAvatarPreview(null);
  }, [user]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error(tCommon('validation.imageSize', { maxMb: MAX_IMAGE_SIZE_BYTES / (1024 * 1024) }));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(tCommon('validation.selectImage'));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => setAvatarPreview(dataUrl);
      img.onerror = () => {
        toast.error(tCommon('validation.invalidImage'));
        setAvatarPreview(null);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value.trim();
    setAvatarUrl(url);
    if (!url) {
      setAvatarPreview(null);
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast.error(tCommon('validation.validUrl'));
      setAvatarPreview(null);
      return;
    }
    const img = new Image();
    img.onload = () => setAvatarPreview(url);
    img.onerror = () => {
      toast.error(tCommon('validation.invalidImageUrl'));
      setAvatarPreview(null);
    };
    img.src = url;
  };

  const addLink = () => {
    if (links.length >= 5) return;
    setLinks([...links, { type: 'website', url: '', visibility: 'org_members' }]);
  };

  const updateLink = (index: number, patch: Partial<ProfileLink>) => {
    setLinks(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(tCommon('validation.nameRequired'));
      return;
    }
    if (!email.trim()) {
      toast.error(tCommon('validation.emailRequired'));
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error(tCommon('validation.invalidEmail'));
      return;
    }

    const profileData: ProfileData = {
      headline: headline.trim(),
      links: links.filter((l) => l.url.trim()),
      contact: {
        ...defaultContact(),
        phone: phone.trim() || undefined,
        phoneVisibility,
        emailVisibility,
        preferredMethod,
      },
      tags: {
        interests,
        skills,
        visibility: tagsVisibility,
      },
    };

    const payload: Parameters<typeof updateProfile>[0] = {
      name: name.trim(),
      email: email.trim(),
      bio: bio.trim(),
      profileData,
    };

    if (avatarPreview) payload.avatar = avatarPreview;
    else if (avatarUrl) payload.avatarUrl = avatarUrl;

    await updateProfile(payload);
  };

  const currentAvatar = avatarPreview || avatarUrl || user.avatar || user.email;
  const previewUser: User = {
    ...user,
    name,
    bio,
    avatar: avatarPreview || avatarUrl || user.avatar,
    profileData: {
      headline: headline.trim(),
      links: links.filter((l) => l.url.trim()),
      contact: {
        ...defaultContact(),
        phone: phone.trim() || undefined,
        phoneVisibility,
        emailVisibility,
        preferredMethod,
      },
      tags: { interests, skills, visibility: tagsVisibility },
    },
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-6">
        <h2 className="text-lg font-semibold">{t('identitySection')}</h2>

        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar className="h-24 w-24 border-2" style={{ borderColor: getUserColor(user.id) }}>
              <AvatarImage src={currentAvatar} />
              <AvatarFallback className="text-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                {name.split(' ').map((n) => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <label
              htmlFor="avatar-upload"
              className={cn('absolute bottom-0 right-0 p-2 bg-blue-600 text-white cursor-pointer', RADIUS.pill, 'hover:bg-blue-700 transition-colors shadow-lg')}
            >
              <Icon name="Camera" className="h-4 w-4" />
              <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={isSubmitting} />
            </label>
          </div>
          <p className="text-sm text-muted-foreground">{t('avatarHint')}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="avatar-url">{t('avatarUrl')}</Label>
          <Input id="avatar-url" type="url" placeholder={t('avatarUrlPlaceholder')} value={avatarUrl} onChange={handleAvatarUrlChange} disabled={isSubmitting} />
          <p className="text-xs text-muted-foreground">{t('avatarUrlHint')}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">{tCommon('validation.nameRequired')} <span className="text-red-500">*</span></Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{tCommon('validation.emailRequired')} <span className="text-red-500">*</span></Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSubmitting} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="headline">{t('headline')}</Label>
          <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} disabled={isSubmitting} placeholder={t('headlinePlaceholder')} />
          <p className="text-xs text-muted-foreground text-right">{headline.length}/80</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">{t('bio')}</Label>
          <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} disabled={isSubmitting} className="min-h-[80px] resize-none" placeholder={t('bioPlaceholder')} />
          <p className="text-xs text-muted-foreground text-right">{bio.length}/500</p>
        </div>
      </section>

      <section className="space-y-4 pt-4 border-t">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('linksSection')}</h2>
          <Button type="button" variant="outline" size="sm" onClick={addLink} disabled={isSubmitting || links.length >= 5}>
            <Icon name="Plus" className="h-4 w-4 mr-1" />
            {t('addLink')}
          </Button>
        </div>
        {links.map((link, index) => (
          <div key={index} className={cn('space-y-3 p-4 border border-border', RADIUS.control)}>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">{t('addLink')} {index + 1}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeLink(index)} disabled={isSubmitting}>
                <Icon name="Trash2" className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('linkType')}</Label>
                <Select value={link.type} onValueChange={(v) => updateLink(index, { type: v as ProfileLink['type'] })} disabled={isSubmitting}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[200]">
                    {LINK_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('linkVisibility')}</Label>
                <ProfileVisibilitySelect value={link.visibility} onChange={(v) => updateLink(index, { visibility: v })} disabled={isSubmitting} />
              </div>
            </div>
            {link.type === 'custom' && (
              <div className="space-y-2">
                <Label>{t('linkLabel')}</Label>
                <Input value={link.label || ''} onChange={(e) => updateLink(index, { label: e.target.value })} disabled={isSubmitting} />
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('linkUrl')}</Label>
              <Input type="url" value={link.url} onChange={(e) => updateLink(index, { url: e.target.value })} placeholder="https://" disabled={isSubmitting} />
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-4 pt-4 border-t">
        <h2 className="text-lg font-semibold">{t('contactSection')}</h2>
        <div className="space-y-2">
          <Label htmlFor="phone">{t('phone')}</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isSubmitting} />
        </div>
        <div className="space-y-2">
          <Label>{t('phoneVisibility')}</Label>
          <ProfileVisibilitySelect value={phoneVisibility} onChange={setPhoneVisibility} disabled={isSubmitting} />
        </div>
        <div className="space-y-2">
          <Label>{t('emailVisibility')}</Label>
          <ProfileVisibilitySelect value={emailVisibility} onChange={setEmailVisibility} disabled={isSubmitting} />
          <p className="text-xs text-muted-foreground">{t('emailVisibilityHint')}</p>
        </div>
        <div className="space-y-2">
          <Label>{t('preferredContact')}</Label>
          <div className="space-y-2">
            {(['email', 'phone'] as const).map((method) => (
              <label key={method} className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" name="preferredMethod" value={method} checked={preferredMethod === method} onChange={() => setPreferredMethod(method)} disabled={isSubmitting} className="w-4 h-4" />
                <span className="text-sm">{t(method === 'email' ? 'contactEmail' : 'contactPhone')}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4 pt-4 border-t">
        <h2 className="text-lg font-semibold">{t('tagsSection')}</h2>
        <TagInput label={t('interests')} tags={interests} onChange={setInterests} placeholder={t('tagPlaceholder')} disabled={isSubmitting} />
        <SuggestedTags suggestions={SUGGESTED_INTERESTS} existing={interests} onAdd={(tag) => setInterests([...interests, tag])} disabled={isSubmitting || interests.length >= 10} />
        <TagInput label={t('skills')} tags={skills} onChange={setSkills} placeholder={t('tagPlaceholder')} disabled={isSubmitting} />
        <SuggestedTags suggestions={SUGGESTED_SKILLS} existing={skills} onAdd={(tag) => setSkills([...skills, tag])} disabled={isSubmitting || skills.length >= 10} />
        <div className="space-y-2">
          <Label>{t('tagsVisibility')}</Label>
          <ProfileVisibilitySelect value={tagsVisibility} onChange={setTagsVisibility} disabled={isSubmitting} />
        </div>
      </section>

      <section className="space-y-4 pt-4 border-t">
        <h2 className="text-lg font-semibold">{t('previewSection')}</h2>
        <p className="text-sm text-muted-foreground">{t('previewDescription')}</p>
        <ProfilePreviewCard user={previewUser} />
      </section>

      <div className="flex gap-2 pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Icon name="Loader2" className="h-4 w-4 mr-2 animate-spin" />
              {t('saving')}
            </>
          ) : (
            t('saveChanges')
          )}
        </Button>
      </div>
    </form>
  );
}
