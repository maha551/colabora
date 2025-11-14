import React from "react";
import { Document } from "../types";
import { Card } from "./ui/card";
import { CheckCircle2, FileText, Clock } from "lucide-react";


interface AgreedDocumentProps {
  document: Document;
  totalUsers: number;
}

export function AgreedDocument({ document, totalUsers }: AgreedDocumentProps) {

  const sortedParagraphs = [...document.paragraphs].sort((a, b) => a.order - b.order);

  // Get the highest approved change info (with highest approval percentage)
  const getHighestApprovedChangeInfo = (paragraph: any) => {
    if (!paragraph.history || paragraph.history.length === 0) return null;
    // Use document's acceptance threshold instead of hardcoded 75%
    const acceptanceThreshold = document.options?.acceptanceThreshold || 75.0;
    // Sort by approval percentage descending, then by acceptance date descending
    const highestApprovedChange = paragraph.history
      .filter((change: any) => change.approvalPercentage >= acceptanceThreshold)
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

  // Check if a paragraph has accepted changes by looking at history that meets threshold
  const hasAcceptedChanges = (paragraph: any) => {
    return getHighestApprovedChangeInfo(paragraph) !== null;
  };

    // Count paragraphs with accepted changes and non-empty content
    const acceptedParagraphsCount = sortedParagraphs.filter(p => hasAcceptedChanges(p) && (p.title || p.text) && (p.title || p.text).trim() !== '').length;

    // Count all paragraphs with any content (for agreed view)
    const paragraphsWithContent = sortedParagraphs.filter(p => !p.isDocumentTitle && (p.title || p.text) && (p.title || p.text).trim() !== '');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-6">

        {/* Empty State - No consensus reached */}
        {paragraphsWithContent.length === 0 && (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No Approved Content Yet
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                No content has reached consensus yet. Proposals need to meet the {document.options?.acceptanceThreshold || 75}% approval threshold to appear here.
              </p>
            </div>
          </div>
        )}

        {/* Paper-like Document */}
        {paragraphsWithContent.length > 0 && (
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

          {/* Document Content */}
          <div className="relative space-y-8 text-gray-900 dark:text-gray-100">
            {agreedParagraphs.map((paragraph, index) => {
              const hasChanges = hasAcceptedChanges(paragraph);
              const highestApprovedChange = getHighestApprovedChangeInfo(paragraph);

              // Skip document title as it's shown in the main header
              if (paragraph.isDocumentTitle) return null;

              // Get display text
              const displayText = paragraph.title || paragraph.text;
              // Skip paragraphs that are truly empty
              if (!displayText || displayText.trim() === '') {
                return null;
              }

              if (paragraph.title) {
                // Heading
                const headingLevel = Math.min(6, 2 + (paragraph.order || 0));
                return (
                  <div key={paragraph.id} className="relative">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:gap-3 gap-2">
                      {React.createElement(
                        `h${headingLevel}`,
                        { className: "text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight whitespace-pre-wrap" },
                        displayText.trim()
                      )}
                      {hasChanges && highestApprovedChange && (
                        <div className="hidden landscape:flex flex-col items-end text-xs text-green-600 gap-1 shrink-0">
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
                  </div>
                );
              }

              // Regular paragraph
              return (
                <div key={paragraph.id} className="relative">
                  <div className="flex flex-col sm:flex-row sm:gap-4 gap-2">
                    <p className="flex-1 leading-relaxed text-gray-800 dark:text-gray-200 text-justify indent-8 first-line:font-medium whitespace-pre-wrap">
                      {displayText.trim()}
                    </p>
                    {hasChanges && highestApprovedChange && (
                      <div className="hidden landscape:flex flex-col items-end text-xs text-green-600 gap-1 shrink-0">
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
                  {agreedParagraphs.length} agreed sections
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
