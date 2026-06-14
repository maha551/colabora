import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { LoadingState } from '../ui/LoadingState';
import { COLORS, RESPONSIVE } from '../../lib/designSystem';
import { cn } from '../ui/utils';
import {
  LEGAL_ARTICLE_CLASS,
  LegalDocumentMeta,
  legalMarkdownComponents,
  prepareLegalMarkdown,
} from './legalMarkdown';
import type { InfoSlug } from '../../lib/infoRoutes';

export interface LegalSubstitutions {
  operatorName?: string;
  operatorAddress?: string;
  contactEmail?: string;
}

interface LegalDocumentProps {
  slug: InfoSlug;
  substitutions?: LegalSubstitutions;
}

function applySubstitutions(markdown: string, subs: LegalSubstitutions): string {
  const email = subs.contactEmail?.trim();
  const emailMd = email ? `[${email}](mailto:${email})` : '[Contact email not configured]';

  return markdown
    .replace(/\{\{operatorName\}\}/g, subs.operatorName || '[Operator name not configured]')
    .replace(/\{\{operatorAddress\}\}/g, subs.operatorAddress || '[Address not configured]')
    .replace(/\{\{contactEmail\}\}/g, emailMd);
}

function looksLikeSpaFallback(text: string): boolean {
  const start = text.trimStart().slice(0, 32).toLowerCase();
  return start.startsWith('<!doctype') || start.startsWith('<html');
}

async function fetchLegalMarkdown(locale: string, slug: InfoSlug): Promise<string | null> {
  const tryLocales = locale === 'en' ? ['en'] : [locale, 'en'];
  for (const lng of tryLocales) {
    const res = await fetch(`/legal/${lng}/${slug}.md`);
    if (!res.ok) continue;
    const text = await res.text();
    if (looksLikeSpaFallback(text)) continue;
    return text;
  }
  return null;
}

export function LegalDocument({ slug, substitutions = {} }: LegalDocumentProps) {
  const { t, i18n } = useTranslation('legal');
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);

    void fetchLegalMarkdown(i18n.language, slug).then((text) => {
      if (cancelled) return;
      if (!text) {
        setMissing(true);
        setRawContent(null);
      } else {
        setRawContent(applySubstitutions(text, substitutions));
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [slug, i18n.language, substitutions.operatorName, substitutions.operatorAddress, substitutions.contactEmail]);

  const prepared = useMemo(() => {
    if (!rawContent) return null;
    return prepareLegalMarkdown(rawContent);
  }, [rawContent]);

  if (loading) {
    return (
      <LoadingState isLoading mode="spinner" spinnerSize="md" className="py-16">
        <span className={cn('text-base', COLORS.text.muted)}>{t('loading')}</span>
      </LoadingState>
    );
  }

  if (missing || !prepared?.body) {
    return (
      <p className={cn(RESPONSIVE.text, 'leading-normal py-4', COLORS.text.muted)}>
        {t('contentUnavailable')}
      </p>
    );
  }

  return (
    <>
      <LegalDocumentMeta lastUpdated={prepared.lastUpdated} label={t('meta.lastUpdated')} />
      <article className={LEGAL_ARTICLE_CLASS}>
        <ReactMarkdown
          rehypePlugins={[rehypeSanitize]}
          components={legalMarkdownComponents}
        >
          {prepared.body}
        </ReactMarkdown>
      </article>
    </>
  );
}
