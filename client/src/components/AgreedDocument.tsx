import React, { useEffect } from "react";
import { Document, Paragraph, VersionHistory } from "../types";
import { Card } from "./ui/card";
import { CheckCircle2, FileText, Clock } from "lucide-react";


interface AgreedDocumentProps {
  document: Document;
  totalUsers: number;
}

export function AgreedDocument({ document, totalUsers }: AgreedDocumentProps) {
  // Debug: Log when document changes
  useEffect(() => {
    console.log('AgreedDocument received document update:', {
      documentId: document.id,
      paragraphCount: document.paragraphs.length,
      paragraphsWithHistory: document.paragraphs.filter(p => p.history && p.history.length > 0).length
    });
  }, [document]);

  const sortedParagraphs = [...document.paragraphs].sort((a, b) => a.order - b.order);

  // Get all approved changes (above acceptance threshold)
  const getAllApprovedChanges = (paragraph: Paragraph) => {
    if (!paragraph.history || paragraph.history.length === 0) return [];
    // Use document's acceptance threshold instead of hardcoded 75%
    const acceptanceThreshold = document.options?.acceptanceThreshold || 75.0;
    // Get all changes that meet the acceptance threshold
    const approvedChanges = paragraph.history
      .filter((change: VersionHistory) => {
        // Handle both camelCase and snake_case property names
        const approvalPct = change.approvalPercentage ?? change.approval_percentage ?? 0;
        const meetsThreshold = approvalPct >= acceptanceThreshold;
        // Debug logging (can be removed later)
        if (paragraph.isDocumentTitle && paragraph.history.length > 0) {
          console.log('Title paragraph history check:', {
            paragraphId: paragraph.id,
            historyCount: paragraph.history.length,
            approvalPct,
            threshold: acceptanceThreshold,
            meetsThreshold,
            change: change
          });
        }
        return meetsThreshold;
      });
    
    // Sort by: 1) Most votes (approvalPercentage DESC), 2) Most recent if tied (acceptedAt DESC)
    approvedChanges.sort((a: VersionHistory, b: VersionHistory) => {
      const aPct = a.approvalPercentage ?? a.approval_percentage ?? 0;
      const bPct = b.approvalPercentage ?? b.approval_percentage ?? 0;
      if (bPct !== aPct) {
        return bPct - aPct; // Higher approval first
      }
      // If approval is equal, most recent first
      const aDate = new Date(a.acceptedAt || a.createdAt || 0).getTime();
      const bDate = new Date(b.acceptedAt || b.createdAt || 0).getTime();
      return bDate - aDate;
    });
    
    return approvedChanges;
  };

  // Check if a paragraph has accepted changes by looking at history that meets threshold
  const hasAcceptedChanges = (paragraph: Paragraph) => {
    return getAllApprovedChanges(paragraph).length > 0;
  };

  // Get the most recent approved change content for display
  const getWinningProposalContent = (paragraph: Paragraph) => {
    const approvedChanges = getAllApprovedChanges(paragraph);
    if (approvedChanges.length > 0) {
      // Use the most recent approved change
      const winningChange = approvedChanges[0];
      // Handle both camelCase (after API conversion) and snake_case (direct from backend)
      const text = winningChange.newText ?? winningChange.new_text ?? winningChange.text ?? '';
      const headingLevel = winningChange.headingLevel ?? winningChange.heading_level;
      return {
        text,
        title: headingLevel ? text : undefined,
        headingLevel
      };
    }
    return null;
  };

    // Only show paragraphs that have been approved through voting (excluding title paragraph)
    const approvedParagraphs = sortedParagraphs.filter(p => !p.isDocumentTitle && hasAcceptedChanges(p));
    
    // Count paragraphs with accepted changes (excluding title paragraph to match display)
    const acceptedParagraphsCount = approvedParagraphs.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-6">

        {/* Empty State - No approved content yet */}
        {approvedParagraphs.length === 0 && (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No Approved Content Yet
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                No content has reached consensus yet. Paragraphs will appear here once they receive enough votes to meet the {document.options?.acceptanceThreshold || 75}% approval threshold.
              </p>
            </div>
          </div>
        )}

        {/* Paper-like Document */}
        {approvedParagraphs.length > 0 && (
          <Card className="p-12 rounded-none shadow-2xl bg-white dark:bg-gray-900 relative overflow-hidden border-2 border-gray-200 dark:border-gray-700">
          {/* Document Title */}
          <div className="mb-8 pb-6 border-b-2 border-gray-300 dark:border-gray-600">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 text-center">
              {document.title}
            </h1>
          </div>

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

          {/* Document Content - Agreed State */}
          <div className="relative space-y-8 text-gray-900 dark:text-gray-100">
            {approvedParagraphs.map((paragraph, index) => {
              const approvedChanges = getAllApprovedChanges(paragraph);

              if (approvedChanges.length === 0) return null;

              // Get the highest approved change (most recent with highest approval)
              const winningChange = approvedChanges[0];
              
              // Handle different property names for text (new_text, newText, text)
              const displayText = winningChange.new_text ?? winningChange.newText ?? winningChange.text ?? '';
              const isHeading = winningChange.heading_level || winningChange.headingLevel;
              const headingLevel = winningChange.heading_level || winningChange.headingLevel;
              const approvalPct = winningChange.approvalPercentage ?? winningChange.approval_percentage ?? 0;

              // Safety check - if no text, skip this paragraph
              if (!displayText || displayText.trim() === '') {
                console.warn('Winning change has no text:', winningChange);
                return null;
              }

              // Render as normal document content, not discussion format
              if (isHeading && headingLevel) {
                // Heading from winning proposal
                // Ensure headingLevel is a number (handle cases where it might be "h1" or already a number)
                const level = typeof headingLevel === 'string' && headingLevel.startsWith('h') 
                  ? parseInt(headingLevel.substring(1), 10) 
                  : parseInt(String(headingLevel), 10);
                const validLevel = (level >= 1 && level <= 6) ? level : 1; // Default to h1 if invalid
                
                return (
                  <div key={paragraph.id}>
                    {React.createElement(
                      `h${validLevel}`,
                      { className: "text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight whitespace-pre-wrap mb-4" },
                      displayText.trim()
                    )}
                    {/* Optional metadata for transparency */}
                    <div className="text-xs text-gray-500 mb-4 flex items-center gap-2">
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      <span>Approved with {approvalPct.toFixed(0)}% consensus</span>
                    </div>
                  </div>
                );
              }

              // Regular paragraph from winning proposal
              return (
                <div key={paragraph.id} className="relative">
                  <p className="leading-relaxed text-gray-800 dark:text-gray-200 text-justify indent-8 first-line:font-medium whitespace-pre-wrap mb-4">
                    {displayText.trim()}
                  </p>
                  {/* Optional metadata for transparency */}
                  <div className="text-xs text-gray-500 mb-6 flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <span>Approved with {approvalPct.toFixed(0)}% consensus</span>
                  </div>
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
                  {approvedParagraphs.length} approved sections
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
