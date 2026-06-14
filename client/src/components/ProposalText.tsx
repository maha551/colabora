import React from 'react';
import { HeadingLevel, Organization, Document } from '../types';
import { cn } from './ui/utils';
import { getHeadingClass, getBodyClass, documentTypography } from '../lib/documentStyles';

interface ProposalTextProps {
  content: string;
  type: 'heading' | 'body';
  headingLevel?: HeadingLevel;
  isAccepted: boolean;
  isPending: boolean;
  isDocumentTitle?: boolean;
  onDoubleClick?: (e: React.MouseEvent, content: string, isHeading: boolean) => void;
  badge?: React.ReactNode; // Optional badge (e.g., "Leading proposal")
  organization?: Organization | null;
  document?: Document | null;
}

export function ProposalText({
  content,
  type,
  headingLevel,
  isAccepted,
  isPending,
  isDocumentTitle = false,
  onDoubleClick,
  badge,
  organization,
  document,
}: ProposalTextProps) {
  // Determine text color class using theme tokens
  const textColorClass = isAccepted 
    ? documentTypography.color.primary
    : isPending 
    ? documentTypography.color.secondary
    : documentTypography.color.primary;

  // Handle heading rendering
  if (type === 'heading') {
    const level = headingLevel || (isDocumentTitle ? 'h1' : 'h2');
    const headingClass = getHeadingClass(level, isDocumentTitle);
    const headingProps = {
      className: cn(
        textColorClass,
        headingClass,
        isDocumentTitle && 'mb-4' // Add margin for document title
      ),
      onDoubleClick: onDoubleClick ? (e) => onDoubleClick(e, content, true) : undefined,
    };

    return (
      <>
        {isDocumentTitle ? (
          <h1 {...headingProps}>{content}</h1>
        ) : level === 'h1' ? (
          <h1 {...headingProps}>{content}</h1>
        ) : level === 'h2' ? (
          <h2 {...headingProps}>{content}</h2>
        ) : (
          <h3 {...headingProps}>{content}</h3>
        )}
        {badge}
      </>
    );
  }

  // Handle body rendering
  return (
    <div className="space-y-2">
      <p 
        className={cn(getBodyClass(false), textColorClass)}
        onDoubleClick={onDoubleClick ? (e) => onDoubleClick(e, content, false) : undefined}
      >
        {content}
      </p>
      {badge}
    </div>
  );
}

