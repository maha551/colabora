import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { documentsApi } from '../../lib/api';
import type { Document, Paragraph, VersionHistory } from '../../types';
import { cn } from '../ui/utils';
import { DECISION_CARD, SPACING } from '../../lib/designSystem';

const MAX_PARAGRAPHS = 3;
const MAX_BODY_CHARS = 280;

function getWinningText(paragraph: Paragraph, acceptanceThreshold: number): { text: string; isHeading: boolean; headingLevel?: string } | null {
  if (!paragraph.history?.length) return null;
  const approved = paragraph.history.filter((h: VersionHistory) => {
    const pct = h.approvalPercentage;
    return pct != null && !Number.isNaN(pct) && pct >= acceptanceThreshold;
  });
  if (approved.length === 0) return null;
  approved.sort((a, b) => {
    const ap = a.approvalPercentage ?? 0;
    const bp = b.approvalPercentage ?? 0;
    if (bp !== ap) return bp - ap;
    return new Date(b.acceptedAt || b.createdAt || 0).getTime() - new Date(a.acceptedAt || a.createdAt || 0).getTime();
  });
  const win = approved[0];
  const text = (win.newText ?? win.text ?? '').trim();
  if (!text) return null;
  const isHeading = (win.type === 'TITLE' || paragraph.title != null);
  return {
    text,
    isHeading,
    headingLevel: win.headingLevel as string | undefined,
  };
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

interface AgreedViewPreviewProps {
  documentId: string;
  maxParagraphs?: number;
  maxBodyChars?: number;
  className?: string;
  /** Skip heading/title paragraphs and show body text only */
  bodyOnly?: boolean;
  /** When preview would only duplicate this title, render nothing */
  documentTitle?: string;
}

/**
 * Fetches the agreed view of a document and shows the first paragraph(s) as a compact preview.
 * Used in activity feed document cards (e.g. agreed/rejected, paragraph change).
 */
export function AgreedViewPreview({
  documentId,
  maxParagraphs = MAX_PARAGRAPHS,
  maxBodyChars = MAX_BODY_CHARS,
  className,
  bodyOnly = false,
  documentTitle,
}: AgreedViewPreviewProps) {
  const { t } = useTranslation('activity');
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    documentsApi
      .getAgreedDocument(documentId)
      .then((res) => {
        if (!cancelled && res?.document) setDoc(res.document);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (loading) {
    return (
      <div
        className={cn(DECISION_CARD.inset, 'text-muted-foreground animate-pulse', className)}
        aria-hidden
      >
        <div className="h-3.5 w-3/4 rounded bg-muted" />
        <div className="mt-1.5 h-3 w-full rounded bg-muted" />
      </div>
    );
  }

  if (error || !doc) return null;

  const threshold = doc.options?.acceptanceThreshold ?? 75;
  const sorted = [...(doc.paragraphs ?? [])].sort((a, b) => a.order - b.order);
  const items: { text: string; isHeading: boolean; level?: number }[] = [];

  for (const p of sorted) {
    if (items.length >= maxParagraphs) break;
    const win = getWinningText(p, threshold);
    if (!win) continue;
    if (bodyOnly && win.isHeading) continue;
    const level =
      win.headingLevel != null
        ? typeof win.headingLevel === 'string' && win.headingLevel.startsWith('h')
          ? parseInt(win.headingLevel.slice(1), 10)
          : parseInt(String(win.headingLevel), 10)
        : undefined;
    const validLevel = level != null && level >= 1 && level <= 6 ? level : 1;
    items.push({
      text: win.text,
      isHeading: win.isHeading,
      level: win.isHeading ? validLevel : undefined,
    });
  }

  if (items.length === 0) return null;

  const normalizedDocTitle = documentTitle ? normalizeTitle(documentTitle) : null;
  const onlyDuplicatesTitle =
    normalizedDocTitle != null &&
    items.every((item) => normalizeTitle(item.text) === normalizedDocTitle);
  if (onlyDuplicatesTitle) return null;

  let bodyCharsLeft = maxBodyChars;
  return (
    <div
      className={cn(DECISION_CARD.inset, 'text-muted-foreground', className)}
      aria-label={t('previewAgreedAria')}
    >
      <div className={SPACING.tight.gap}>
        {items.map((item, i) => {
          if (item.isHeading && item.level != null) {
            const Tag = `h${Math.min(item.level, 6)}` as keyof JSX.IntrinsicElements;
            return (
              <Tag
                key={i}
                className={cn(
                  'font-semibold text-foreground/90 truncate block',
                  item.level === 1 && 'text-base',
                  item.level === 2 && 'text-sm',
                  item.level !== 1 && item.level !== 2 && 'text-sm'
                )}
              >
                {item.text}
              </Tag>
            );
          }
          const show = bodyCharsLeft > 0;
          const slice = item.text.slice(0, bodyCharsLeft);
          const truncated = item.text.length > bodyCharsLeft;
          bodyCharsLeft -= item.text.length;
          if (!show || !slice) return null;
          return (
            <p key={i} className="leading-snug text-muted-foreground line-clamp-3">
              {truncated ? `${slice}\u2026` : slice}
            </p>
          );
        })}
      </div>
    </div>
  );
}
