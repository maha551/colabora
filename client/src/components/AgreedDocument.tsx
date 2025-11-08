import React, { useState } from "react";
import { Document } from "../types";
import { Card } from "./ui/card";
import { CheckCircle2, FileText, Clock, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { useIsMobile } from "./ui/use-mobile";

function InlineAddButton({ onClick, floating = false, position = "top" }: {
  onClick: () => void;
  floating?: boolean;
  position?: "top" | "bottom";
}) {
  if (!floating) {
    return (
      <div className="flex justify-center py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full shadow-sm bg-white/95 dark:bg-slate-900/80 border border-border touch-manipulation"
          onClick={onClick}
          aria-label="Add paragraph"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  const style: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
    top: position === "top" ? 0 : undefined,
    bottom: position === "bottom" ? 0 : undefined,
    transform: position === "top" ? "translateY(-60%)" : "translateY(60%)",
    zIndex: 10,
  };

  return (
    <div style={style}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 rounded-full shadow-sm bg-white/95 dark:bg-slate-900/80 border border-border touch-manipulation"
        onClick={onClick}
        style={{ pointerEvents: "auto" }}
        aria-label="Add paragraph"
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}

interface AgreedDocumentProps {
  document: Document;
  totalUsers: number;
  onAddElement?: (
    elementType: 'paragraph',
    options?: {
      text?: string;
      title?: string;
      headingLevel?: any;
      order?: number;
    }
  ) => Promise<void> | void;
}

export function AgreedDocument({ document, totalUsers, onAddElement }: AgreedDocumentProps) {
  const isMobile = useIsMobile();
  const [hoveredParagraphId, setHoveredParagraphId] = useState<string | null>(null);

  const sortedParagraphs = [...document.paragraphs].sort((a, b) => a.order - b.order);

  // Check if a paragraph has accepted changes by looking at history
  const hasAcceptedChanges = (paragraph: any) => {
    return paragraph.history && paragraph.history.length > 0;
  };

  // Get the highest approved change info (with highest approval percentage)
  const getHighestApprovedChangeInfo = (paragraph: any) => {
    if (!paragraph.history || paragraph.history.length === 0) return null;
    // Sort by approval percentage descending, then by acceptance date descending
    const highestApprovedChange = paragraph.history
      .filter((change: any) => change.approvalPercentage >= 75)
      .sort((a: any, b: any) => {
        // First sort by approval percentage (highest first)
        if (b.approvalPercentage !== a.approvalPercentage) {
          return b.approvalPercentage - a.approvalPercentage;
        }
        // Then by acceptance date (most recent first)
        return new Date(b.acceptedAt).getTime() - new Date(a.acceptedAt).getTime();
      })[0];
    return highestApprovedChange;
  };

    // Count paragraphs with accepted changes and non-empty content
    const acceptedParagraphsCount = sortedParagraphs.filter(p => hasAcceptedChanges(p) && (p.title || p.text) && (p.title || p.text).trim() !== '').length;

    // Count all paragraphs with any content (for agreed view - includes both changed and unchanged paragraphs)
    const paragraphsWithContent = sortedParagraphs.filter(p => !p.isDocumentTitle && (p.title || p.text) && (p.title || p.text).trim() !== '');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Document Status */}
          <div className="text-center">
          <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Last updated: {new Date(document.updatedAt).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              {paragraphsWithContent.length} sections agreed upon ({acceptedParagraphsCount} modified)
            </span>
          </div>
        </div>

        {/* Empty State - No consensus reached */}
        {paragraphsWithContent.length === 0 && (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No Consensus Reached
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                The document has no content yet. Start collaborating by adding paragraphs in the discussion view.
              </p>
            </div>
          </div>
        )}

        {/* Paper-like Document */}
        {paragraphsWithContent.length > 0 && (
          <Card className="p-12 rounded-none shadow-2xl bg-white dark:bg-gray-900 relative overflow-hidden border-2 border-gray-200 dark:border-gray-700">
          {/* Realistic paper texture and effects */}
          
          <div className="absolute inset-0 pointer-events-none">
            {/* Subtle paper texture */}
            <div className="absolute inset-0 opacity-[0.015] bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.1)_0%,transparent_50%)] bg-[length:20px_20px]" />

            {/* Page lines */}
            <div className="absolute inset-0 opacity-[0.03]">
              <svg width="100%" height="100%" className="absolute inset-0">
                <defs>
                  <pattern id="pageLines" patternUnits="userSpaceOnUse" width="100%" height="28">
                    <line x1="0" y1="27" x2="100%" y2="27" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#pageLines)" />
              </svg>
            </div>

            {/* Corner fold effect */}
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-transparent via-transparent to-gray-200 dark:to-gray-600 opacity-20" />
          </div>

          {/* Document Content */}
          <div className="relative space-y-8 text-gray-900 dark:text-gray-100">
            {sortedParagraphs.map((paragraph, index) => {
              const hasChanges = hasAcceptedChanges(paragraph);
              const highestApprovedChange = getHighestApprovedChangeInfo(paragraph);

              // Skip document title as it's shown in the main header
              if (paragraph.isDocumentTitle) return null;

              // Skip paragraphs that are empty
              const displayText = paragraph.title || paragraph.text;
              if (!displayText || displayText.trim() === '') {
                return null;
              }

              if (paragraph.title) {
                // Heading
                const headingLevel = Math.min(6, 2 + (paragraph.order || 0));
                const isHovered = hoveredParagraphId === paragraph.id;
                return (
                  <div
                    key={paragraph.id}
                    className="relative"
                    onMouseEnter={() => setHoveredParagraphId(paragraph.id)}
                    onMouseLeave={() => setHoveredParagraphId(null)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:gap-3 gap-2">
                      {React.createElement(
                        `h${headingLevel}`,
                        { className: "text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight" },
                        displayText
                      )}
                      {hasChanges && highestApprovedChange && (
                        <div className="hidden sm:flex flex-col items-end text-xs text-green-600 gap-1 shrink-0">
                          <div className="flex items-center gap-1 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded">
                            <CheckCircle2 className="h-3 w-3" />
                            <span className="font-medium">Accepted</span>
                          </div>
                          <span className="text-gray-500">
                            {highestApprovedChange.approvalPercentage.toFixed(0)}% approval
                          </span>
                          <span className="text-gray-500">
                            {new Date(highestApprovedChange.acceptedAt).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                    {(isHovered || isMobile) && onAddElement && (
                      <InlineAddButton
                        onClick={() => {
                          const contentParagraphs = sortedParagraphs.filter(p => !p.isDocumentTitle && (p.title || p.text) && (p.title || p.text).trim() !== '');
                          const maxOrder = contentParagraphs.length > 0 ? Math.max(...contentParagraphs.map(p => p.order || 0)) : 0;
                          onAddElement('paragraph', { order: maxOrder + 1 });
                        }}
                        floating
                        position="bottom"
                      />
                    )}
                  </div>
                );
              }

              // Regular paragraph
              const isHovered = hoveredParagraphId === paragraph.id;
              return (
                <div
                  key={paragraph.id}
                  className="relative"
                  onMouseEnter={() => setHoveredParagraphId(paragraph.id)}
                  onMouseLeave={() => setHoveredParagraphId(null)}
                >
                  <div className="flex flex-col sm:flex-row sm:gap-4 gap-2">
                    <p className="flex-1 leading-relaxed text-gray-800 dark:text-gray-200 text-justify indent-8 first-line:font-medium">
                      {displayText}
                    </p>
                    {hasChanges && highestApprovedChange && (
                      <div className="hidden sm:flex flex-col items-end text-xs text-green-600 gap-1 shrink-0">
                        <div className="flex items-center gap-1 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded">
                          <CheckCircle2 className="h-3 w-3" />
                          <span className="font-medium">Accepted</span>
                        </div>
                        <span className="text-gray-500">
                          {highestApprovedChange.approvalPercentage.toFixed(0)}% approval
                        </span>
                        <span className="text-gray-500">
                          {new Date(highestApprovedChange.acceptedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                  {(isHovered || isMobile) && onAddElement && (
                    <InlineAddButton
                      onClick={() => {
                        const contentParagraphs = sortedParagraphs.filter(p => !p.isDocumentTitle && (p.title || p.text) && (p.title || p.text).trim() !== '');
                        const maxOrder = contentParagraphs.length > 0 ? Math.max(...contentParagraphs.map(p => p.order || 0)) : 0;
                        onAddElement('paragraph', { order: maxOrder + 1 });
                      }}
                      floating
                      position="bottom"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Document Footer */}
          <div className="mt-16 pt-8 border-t-2 border-gray-300 dark:border-gray-600">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  {paragraphsWithContent.length} agreed sections
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  {acceptedParagraphsCount} collaboratively modified
                </span>
              </div>
              <div className="text-right">
                <p className="font-medium">Collaborative Drafting Platform</p>
                <p>Generated on {new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </Card>
        )}
        </div>
      </div>
    </div>
  );
}
