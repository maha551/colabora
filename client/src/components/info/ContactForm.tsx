import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { contactApi, ApiError, RateLimitError } from '../../lib/api';
import { SPACING } from '../../lib/designSystem';
import { cn } from '../ui/utils';

const LABEL_CLASS = 'text-sm font-medium md:text-base';

export function ContactForm() {
  const { t } = useTranslation('legal');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await contactApi.submit({ name, email, subject, message, website });
      toast.success(t('contact.success'));
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
      setWebsite('');
    } catch (error) {
      if (error instanceof RateLimitError) {
        toast.error(t('contact.rateLimited'));
      } else if (error instanceof ApiError) {
        toast.error(error.message || t('contact.error'));
      } else {
        toast.error(t('contact.error'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className={cn('space-y-5 md:space-y-6', SPACING.content.gap)}>
      {/* Honeypot — hidden from users */}
      <div className="absolute opacity-0 pointer-events-none h-0 overflow-hidden" aria-hidden>
        <Label htmlFor="contact-website">Website</Label>
        <Input
          id="contact-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-name" className={LABEL_CLASS}>
          {t('contact.name')}
        </Label>
        <Input
          id="contact-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('contact.namePlaceholder')}
          required
          maxLength={100}
          disabled={submitting}
          className="h-11"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-email" className={LABEL_CLASS}>{t('contact.email')}</Label>
        <Input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('contact.emailPlaceholder')}
          required
          disabled={submitting}
          className="h-11"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-subject" className={LABEL_CLASS}>{t('contact.subject')}</Label>
        <Input
          id="contact-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t('contact.subjectPlaceholder')}
          required
          maxLength={200}
          disabled={submitting}
          className="h-11"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-message" className={LABEL_CLASS}>{t('contact.message')}</Label>
        <Textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('contact.messagePlaceholder')}
          required
          rows={7}
          className="min-h-[9rem] text-base md:text-sm"
          maxLength={5000}
          disabled={submitting}
        />
      </div>

      <Button type="submit" className="h-11 w-full sm:w-auto sm:min-w-[10rem] text-base" disabled={submitting}>
        {submitting ? t('contact.submitting') : t('contact.submit')}
      </Button>
    </form>
  );
}
