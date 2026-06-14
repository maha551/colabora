import type { Components } from 'react-markdown';
import { COLORS, NAVIGATION, PANEL, RESPONSIVE } from '../../lib/designSystem';
import { cn } from '../ui/utils';

export interface PreparedLegalMarkdown {
  body: string;
  lastUpdated?: string;
}

/** Strip duplicate title, comments, and pull "Last updated" into metadata. */
export function prepareLegalMarkdown(raw: string): PreparedLegalMarkdown {
  let body = raw.replace(/<!--[\s\S]*?-->/g, '').trim();

  let lastUpdated: string | undefined;
  const lastUpdatedMatch = body.match(/^\*\*Last updated:\*\*\s*(.+)$/im);
  if (lastUpdatedMatch) {
    lastUpdated = lastUpdatedMatch[1]!.trim();
    body = body.replace(lastUpdatedMatch[0], '').trim();
  }

  // Page layout already shows the document title
  body = body.replace(/^#\s+.+\n+/m, '').trim();

  return { body, lastUpdated };
}

export const LEGAL_ARTICLE_CLASS = cn(
  'legal-document font-sans antialiased text-foreground',
  // Lead intro when the document opens with a paragraph (e.g. About)
  '[&>p:first-child]:text-lg [&>p:first-child]:md:text-2xl [&>p:first-child]:font-normal',
  '[&>p:first-child]:tracking-tight [&>p:first-child]:text-foreground [&>p:first-child]:mb-6'
);

interface LegalDocumentMetaProps {
  lastUpdated?: string;
  label?: string;
}

export function LegalDocumentMeta({ lastUpdated, label = 'Last updated' }: LegalDocumentMetaProps) {
  if (!lastUpdated) return null;
  return (
    <p className={cn(PANEL.header.subtitle, 'mb-6 border-b border-border/40 pb-5')}>
      {label}{' '}
      <time dateTime={lastUpdated} className="font-medium text-foreground/80">
        {lastUpdated}
      </time>
    </p>
  );
}

const bodyText = cn(RESPONSIVE.text, 'leading-normal', COLORS.text.secondary);
const sectionTitle = cn(PANEL.header.title, 'scroll-mt-24');
const sectionDivider = 'mt-8 border-b border-border/50 pb-2 first:mt-0 md:mt-10';

export const legalMarkdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className={cn(NAVIGATION.typography.title, 'scroll-mt-24 font-semibold text-foreground mt-8 mb-3 first:mt-0')}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className={cn(sectionTitle, sectionDivider, 'mb-3')}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className={cn('text-base md:text-lg font-semibold tracking-tight text-foreground scroll-mt-24 mt-6 mb-2')}>
      {children}
    </h3>
  ),
  p: ({ children }) => <p className={cn(bodyText, 'mb-4 last:mb-0')}>{children}</p>,
  ul: ({ children }) => (
    <ul className={cn('my-4 list-disc space-y-2 pl-5 marker:text-muted-foreground')}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className={cn('my-4 list-decimal space-y-2 pl-5 marker:text-muted-foreground')}>{children}</ol>
  ),
  li: ({ children }) => <li className={cn(bodyText, 'pl-0.5')}>{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-8 border-border/60" />,
  blockquote: ({ children }) => (
    <blockquote className={cn('my-4 border-l-4 border-border pl-4 italic', COLORS.text.secondary)}>
      {children}
    </blockquote>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
};
