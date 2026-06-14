import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Document, User, ElementType, HeadingLevel, Paragraph, Organization, Comment } from "../types";
import { ParagraphWithSuggestions } from "./ParagraphWithSuggestions";
import { Button } from "./ui/button";
import { Icon } from "./ui/Icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "./ui/utils";
import { useScreenSize } from "../contexts/ScreenSizeContext";
import { useOnboarding } from "../hooks/useOnboarding";
import { OnboardingHint } from "./OnboardingHint";
import { InlineParagraphForm } from "./InlineParagraphForm";
import { logger } from '../lib/logger';
import { documentSpacing, buttonStyles } from '../lib/documentStyles';
import { SPACING, COLORS, RADIUS } from '../lib/designSystem';
import { ApiError, RateLimitError } from '../lib/api';
import { getVotingEligibleCollaborators } from '../utils/documentHelpers';

interface DocumentEditorProps {
  document: Document;
  totalUsers: number;
  currentUser: User;
  onAddSuggestion: (
    paragraphId: string,
    data: {
      text: string;
      type?: 'BODY' | 'TITLE';
      headingLevel?: HeadingLevel;
    }
  ) => void;
  onVote: (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => void;
  onComment: (suggestionId: string, text: string, parentId?: string) => void;
  onEditComment?: (suggestionId: string, commentId: string, text: string) => Promise<void>;
  onDeleteComment?: (suggestionId: string, commentId: string) => Promise<void>;
  onDeleteProposal?: (suggestionId: string) => Promise<void>;
  onLoadMoreComments?: (suggestionId: string, offset: number) => Promise<Comment[]>;
  onUpvoteComment?: (suggestionId: string, commentId: string, data: { upvoteCount: number; userUpvoted: boolean }) => void;
  onAddElement: (
    elementType: ElementType,
    options?: {
      text?: string;
      title?: string;
      headingLevel?: HeadingLevel;
      order?: number;
    }
  ) => Promise<void> | void;
  organization?: Organization | null;
  // Optional: Voting state for document proposals (only needed for document proposals)
  votingState?: Set<string>;
  setVotingState?: React.Dispatch<React.SetStateAction<Set<string>>>;
}

// Helper to check if proposals are disabled (organizational documents only)
function isProposalCutoffPassed(document: Document): boolean {
  if (document.ownershipType !== 'organizational') return false;
  if (document.status !== 'proposal') return false;
  if (!document.paragraphProposalsCutoff) return false;
  return new Date(document.paragraphProposalsCutoff) < new Date();
}

// Helper to check if proposals are allowed at all
function areProposalsAllowed(document: Document): boolean {
  // For organizational documents, allow in 'proposal' status or when amendments open
  if (document.ownershipType === 'organizational') {
    return (
      (document.status === 'proposal' && !isProposalCutoffPassed(document)) ||
      (document.status === 'agreed' && document.amendmentsOpen === true)
    );
  }
  // For personal/shared documents, allow unless finalized
  return document.status !== 'agreed' && document.status !== 'rejected';
}


type InsertContext = {
  targetParagraphId: string | null;
  position: 'before' | 'after' | 'end';
};

type InlineAddButtonProps = {
  onClick: () => void;
  floating?: boolean;
  position?: "top" | "bottom";
  ariaLabel: string;
};

function InlineAddButton({ onClick, floating = false, position = "top", ariaLabel }: InlineAddButtonProps) {
  if (!floating) {
    return (
      <div className="flex justify-center py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(buttonStyles.overlay)}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          <Icon name="Plus" className="h-5 w-5" />
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
    transform: position === "top" ? "translateY(-50%)" : "translateY(50%)",
    zIndex: 10,
  };

  return (
    <div style={style}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(buttonStyles.overlay)}
        onClick={onClick}
        style={{ pointerEvents: "auto" }}
        aria-label={ariaLabel}
      >
        <Icon name="Plus" className="h-5 w-5" />
      </Button>
    </div>
  );
}

export const DocumentEditor = React.memo(function DocumentEditor({
  document,
  totalUsers,
  currentUser,
  onAddSuggestion,
  onVote,
  onComment,
  onEditComment,
  onDeleteComment,
  onDeleteProposal,
  onLoadMoreComments,
  onUpvoteComment,
  onAddElement,
  organization,
  votingState,
  setVotingState,
}: DocumentEditorProps) {
  const { t } = useTranslation('documents');
  const { t: tOnboarding } = useTranslation('onboarding');
  const { isMobile, isTablet, isLargeDesktop } = useScreenSize();
  const { hasSeenHint } = useOnboarding();
  const hasTrackedFirstParagraph = useRef(false);

  const sortedParagraphs = useMemo(
    () => [...document.paragraphs].sort((a, b) => {
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      return orderA - orderB;
    }),
    [document.paragraphs],
  );

  const contentParagraphs = sortedParagraphs.filter((paragraph) => !paragraph.isDocumentTitle);

  // Track when first paragraph is added
  useEffect(() => {
    if (contentParagraphs.length > 0 && !hasTrackedFirstParagraph.current) {
      hasTrackedFirstParagraph.current = true;
    }
  }, [contentParagraphs.length]);

  const [hoveredParagraphId, setHoveredParagraphId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isInlineFormOpen, setIsInlineFormOpen] = useState(false);
  const [newParagraphBody, setNewParagraphBody] = useState("");
  const [includeHeading, setIncludeHeading] = useState(false);
  const [newParagraphHeading, setNewParagraphHeading] = useState("");
  const [newParagraphHeadingLevel, setNewParagraphHeadingLevel] = useState<HeadingLevel>("h2");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [insertContext, setInsertContext] = useState<InsertContext>({
    targetParagraphId: null,
    position: 'end',
  });
  const paragraphRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Scroll to matching content when document loads from search
  useEffect(() => {
    if (!document?.paragraphs) {
      return;
    }

    const paragraphId = sessionStorage.getItem('documentSearchParagraphId');
    const searchQuery = sessionStorage.getItem('documentSearchQuery');

    if (!paragraphId && !searchQuery) {
      return;
    }

    sessionStorage.removeItem('documentSearchParagraphId');
    sessionStorage.removeItem('documentSearchQuery');

    const matchingParagraph = paragraphId
      ? sortedParagraphs.find((para) => para.id === paragraphId)
      : sortedParagraphs.find((para) => {
          const queryLower = (searchQuery || '').toLowerCase().trim();
          if (!queryLower) return false;
          const text = (para.text || '').toLowerCase();
          const title = (para.title || '').toLowerCase();
          return text.includes(queryLower) || title.includes(queryLower);
        });

    if (matchingParagraph) {
      setTimeout(() => {
        const paragraphElement = paragraphRefs.current.get(matchingParagraph.id);
        if (paragraphElement) {
          paragraphElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
          paragraphElement.style.backgroundColor = 'rgba(255, 255, 0, 0.2)';
          setTimeout(() => {
            paragraphElement.style.backgroundColor = '';
          }, 2000);
        }
      }, 300);
    }
  }, [document?.id, sortedParagraphs]);

  const openNewParagraphDialog = (
    position: InsertContext["position"] = 'end',
    targetParagraphId: string | null = null,
    useInlineForm: boolean = false,
  ) => {
    setInsertContext({ position, targetParagraphId });
    setFormError(null);
    setNewParagraphBody("");

    // Check if this will be the first content paragraph
    const isFirstParagraph = contentParagraphs.length === 0;
    if (isFirstParagraph) {
      // First paragraph must always be a heading (H1)
      setIncludeHeading(true);
      setNewParagraphHeading("");
      setNewParagraphHeadingLevel("h1");
    } else {
      // Subsequent paragraphs allow choice
      setIncludeHeading(false); // Default to body text for consistency
      setNewParagraphHeading("");
      setNewParagraphHeadingLevel("h2");
    }

    if (useInlineForm) {
      setIsInlineFormOpen(true);
    } else {
      setIsDialogOpen(true);
    }
  };

  const closeNewParagraphDialog = () => {
    if (isSubmitting) return;
    setIsDialogOpen(false);
  };

  const closeInlineForm = () => {
    if (isSubmitting) return;
    setIsInlineFormOpen(false);
  };

  // Memoized handler for Switch toggle to prevent infinite re-renders
  // Preserves text when switching between heading and body modes
  const handleHeadingToggle = useCallback((checked: boolean) => {
    // Text is already stored in separate state variables (newParagraphHeading and newParagraphBody)
    // No need to explicitly preserve - the state variables maintain their values
    // Only the UI switches which field is shown, but both values are preserved
    setIncludeHeading(checked);
  }, []);

  const computeInsertOrder = (context: InsertContext): number => {
    const availableParagraphs = [...document.paragraphs].sort((a, b) => {
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      return orderA - orderB;
    });

    if (context.position === 'end' || !context.targetParagraphId) {
      const maxOrder = availableParagraphs.length
        ? Math.max(...availableParagraphs.map((p) => p.order ?? 0))
        : 0;
      return maxOrder + 1;
    }

    const targetIndex = availableParagraphs.findIndex(
      (p) => p.id === context.targetParagraphId,
    );

    if (targetIndex === -1) {
      const maxOrder = availableParagraphs.length
        ? Math.max(...availableParagraphs.map((p) => p.order ?? 0))
        : 0;
      return maxOrder + 1;
    }

    const targetOrder = availableParagraphs[targetIndex].order ?? 0;

    if (context.position === 'before') {
      const previousOrder = targetIndex > 0
        ? availableParagraphs[targetIndex - 1].order ?? targetOrder - 1
        : targetOrder - 1;
      // Ensure integer order - round to nearest integer, ensuring it's non-negative
      const computedOrder = (previousOrder + targetOrder) / 2;
      return Math.max(0, Math.round(computedOrder));
    }

    const nextOrder = targetIndex < availableParagraphs.length - 1
      ? availableParagraphs[targetIndex + 1].order ?? targetOrder + 1
      : targetOrder + 1;

    // Ensure integer order - round to nearest integer, ensuring it's non-negative
    const computedOrder = (targetOrder + nextOrder) / 2;
    return Math.max(0, Math.round(computedOrder));
  };

  const handleCreateParagraph = useCallback(async (formType: 'inline' | 'dialog') => {
    const body = newParagraphBody.trim();
    const heading = newParagraphHeading.trim();

    // Validation: ensure appropriate content based on paragraph type
    if (includeHeading) {
      // Heading mode: only heading text required
      if (!heading) {
        setFormError(t('editor.headingRequired'));
        return;
      }
    } else {
      // Body mode: only body text required
      if (!body) {
        setFormError(t('editor.bodyRequired'));
        return;
      }
    }

    setIsSubmitting(true);
    setFormError(null);
    
    try {
      const order = computeInsertOrder(insertContext);

      // Create paragraph with mutually exclusive fields
      if (includeHeading) {
        // Heading paragraph: title + headingLevel, no text field
        await onAddElement("paragraph", {
          // Don't include text field for headings
          title: heading,
          headingLevel: newParagraphHeadingLevel,
          order,
        });
      } else {
        // Body paragraph: text only, no title/headingLevel
        await onAddElement("paragraph", {
          text: body,
          order,
        });
      }

      // Close appropriate form based on type
      if (formType === 'inline') {
        setIsInlineFormOpen(false);
      } else {
        setIsDialogOpen(false);
        setInsertContext({ targetParagraphId: null, position: 'end' });
      }

      // Reset form state to defaults
      setNewParagraphBody("");
      setIncludeHeading(false);
      setNewParagraphHeading("");
      setNewParagraphHeadingLevel("h2");
      
    } catch (error) {
      // Consistent error handling with logging
      logger.error("Error creating paragraph:", error);
      
      // Extract field-specific errors if available
      let errorMessage = t('editor.failedToCreateParagraph');
      
      if (error instanceof RateLimitError) {
        // Handle rate limit errors with retry information
        const retryAfter = error.details && typeof error.details === 'object' && 'retryAfter' in error.details
          ? Number((error.details as { retryAfter?: number }).retryAfter)
          : undefined;
        
        if (retryAfter && retryAfter > 0) {
          const minutes = Math.ceil(retryAfter / 60);
          errorMessage = t('editor.tooManyRequestsWait', { minutes });
        } else {
          errorMessage = t('editor.tooManyRequests');
        }
      } else if (error instanceof ApiError) {
        if (error.hasFieldErrors()) {
          // Build user-friendly error message from field errors
          const fieldErrorMessages = error.getFieldErrorsArray().map(({ field, message }) => {
            // Map field names to user-friendly labels
            const fieldLabel = field === 'order' ? 'Order' :
                             field === 'text' ? 'Text' :
                             field === 'title' ? 'Title' :
                             field === 'headingLevel' ? 'Heading Level' :
                             field;
            return `${fieldLabel}: ${message}`;
          });
          
          if (fieldErrorMessages.length > 0) {
            errorMessage = fieldErrorMessages.join('. ');
          } else {
            errorMessage = error.message || errorMessage;
          }
        } else {
          errorMessage = error.message || errorMessage;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setFormError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    includeHeading, 
    newParagraphBody, 
    newParagraphHeading, 
    newParagraphHeadingLevel, 
    insertContext, 
    onAddElement
  ]);

  // Get all collaborators (owner + collaborators)
  // Memoized to prevent unnecessary recalculations
  const allCollaborators = useMemo(() => 
    getVotingEligibleCollaborators(document),
    [document]
  );

  // Memoize renderParagraph to prevent unnecessary re-renders
  const renderParagraph = useCallback((paragraph: Paragraph) => {
    const isHovered = hoveredParagraphId === paragraph.id;
    return (
      <div
        key={paragraph.id}
        ref={(el) => {
          if (el) {
            paragraphRefs.current.set(paragraph.id, el);
          } else {
            paragraphRefs.current.delete(paragraph.id);
          }
        }}
        onMouseEnter={() => setHoveredParagraphId(paragraph.id)}
        onMouseLeave={() => setHoveredParagraphId((prev) => (prev === paragraph.id ? null : prev))}
        onFocus={() => setHoveredParagraphId(paragraph.id)}
        onBlur={() => setHoveredParagraphId((prev) => (prev === paragraph.id ? null : prev))}
        tabIndex={0}
        className="relative transition-all duration-200"
      >
        <ParagraphWithSuggestions
          paragraph={paragraph}
          document={document}
          totalUsers={totalUsers}
          currentUser={currentUser}
          allCollaborators={allCollaborators}
          onAddSuggestion={onAddSuggestion}
          onVote={onVote}
          onComment={onComment}
          onEditComment={onEditComment}
          onDeleteComment={onDeleteComment}
          onDeleteProposal={onDeleteProposal}
          onLoadMoreComments={onLoadMoreComments}
          onUpvoteComment={onUpvoteComment}
          isDocumentTitle={paragraph.order === 1}
          isHovered={isHovered}
          showContextButton={false}
          organization={organization}
          votingState={votingState}
          setVotingState={setVotingState}
        />
        {(isHovered || isMobile) && (
          <InlineAddButton
            onClick={() => openNewParagraphDialog('after', paragraph.id, true)}
            floating
            ariaLabel={t('editor.addParagraph')}
            position="bottom"
          />
        )}
      </div>
    );
  }, [hoveredParagraphId, document, totalUsers, currentUser, allCollaborators, onAddSuggestion, onVote, onComment, onEditComment, onDeleteComment, onLoadMoreComments, onUpvoteComment, organization, isMobile, openNewParagraphDialog, votingState, setVotingState]);

  return (
    <div className="bg-card">
      {/* Remove outer vertical padding - parent handles it via py-4/6/8 */}
      <div className={`w-full ${
        isMobile 
          ? 'px-4' 
          : isTablet 
            ? 'px-6' 
            : isLargeDesktop 
              ? 'px-8' 
              : 'px-8'
      }`}>
        <div className={documentSpacing.discussionParagraphGap}>
        {(() => {
          // Empty state: Show centered plus button when no content paragraphs
          if (contentParagraphs.length === 0 && !isInlineFormOpen) {
            return (
              <div className="space-y-6">
                <OnboardingHint
                  hintKey="document-empty-state"
                  message={tOnboarding('documentEmptyState')}
                  variant="tip"
                  position="inline"
                  showOnce={true}
                  delay={500}
                />
                <div className="flex items-center justify-center py-16">
                <div className="text-center max-w-lg mx-auto">
                  <p className="text-lg font-medium text-foreground mb-2">Start your collaborative document</p>
                  <p className="text-sm text-muted-foreground mb-6">Begin by adding your first heading. This will serve as the document title.</p>
                  <div className="space-y-4">
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => openNewParagraphDialog('end', null, true)}
                      className="gap-2 touch-manipulation min-h-[52px] text-base px-8 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
                    >
                      <Icon name="Plus" className="h-5 w-5" />
                      Add First Heading
                    </Button>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      Tip: After adding content, you can edit paragraphs by double-clicking them, or make suggestions that others can vote on.
                    </p>
                  </div>
                </div>
                </div>
              </div>
            );
          }

          if (!isInlineFormOpen) {
            const paragraphs = contentParagraphs.map((paragraph) => renderParagraph(paragraph));
            
            // Show hint after first paragraph is added
            if (contentParagraphs.length === 1 && !hasSeenHint('first-paragraph-added')) {
              return (
                <div className="space-y-6">
                  {paragraphs}
                  <OnboardingHint
                    hintKey="first-paragraph-added"
                    message={tOnboarding('firstParagraphAdded')}
                    variant="tip"
                    position="inline"
                    showOnce={true}
                    delay={1000}
                  />
                  <InlineAddButton
                    onClick={() => openNewParagraphDialog('end', null, true)}
                    floating={false}
                    ariaLabel={t('editor.addParagraph')}
                    position="top"
                  />
                </div>
              );
            }
            
            // Add "add at end" button after all paragraphs
            return (
              <div className="space-y-6">
                {paragraphs}
                <InlineAddButton
                  onClick={() => openNewParagraphDialog('end', null, true)}
                  floating={false}
                  ariaLabel={t('editor.addParagraph')}
                  position="top"
                />
              </div>
            );
          }

          // When inline form is open, insert it at the correct position
          const result = [];
          const targetIndex = insertContext.targetParagraphId
            ? contentParagraphs.findIndex(p => p.id === insertContext.targetParagraphId)
            : -1;

          for (let i = 0; i < contentParagraphs.length; i++) {
            if (insertContext.position === 'before' && targetIndex === i) {
              // Insert form before this paragraph
              result.push(
                <InlineParagraphForm
                  key={`inline-form-${insertContext.targetParagraphId}`}
                  includeHeading={includeHeading}
                  newParagraphHeading={newParagraphHeading}
                  newParagraphBody={newParagraphBody}
                  newParagraphHeadingLevel={newParagraphHeadingLevel}
                  isSubmitting={isSubmitting}
                  formError={formError}
                  onHeadingToggle={handleHeadingToggle}
                  onHeadingChange={setNewParagraphHeading}
                  onBodyChange={setNewParagraphBody}
                  onHeadingLevelChange={setNewParagraphHeadingLevel}
                  onSubmit={() => handleCreateParagraph('inline')}
                  onCancel={closeInlineForm}
                  isFirstParagraph={false}
                  targetParagraphIndex={i}
                />
              );
            }

            result.push(renderParagraph(contentParagraphs[i]));

            if (insertContext.position === 'after' && targetIndex === i) {
              // Insert form after this paragraph
              result.push(
                <InlineParagraphForm
                  key={`inline-form-${insertContext.targetParagraphId}`}
                  includeHeading={includeHeading}
                  newParagraphHeading={newParagraphHeading}
                  newParagraphBody={newParagraphBody}
                  newParagraphHeadingLevel={newParagraphHeadingLevel}
                  isSubmitting={isSubmitting}
                  formError={formError}
                  onHeadingToggle={handleHeadingToggle}
                  onHeadingChange={setNewParagraphHeading}
                  onBodyChange={setNewParagraphBody}
                  onHeadingLevelChange={setNewParagraphHeadingLevel}
                  onSubmit={() => handleCreateParagraph('inline')}
                  onCancel={closeInlineForm}
                  isFirstParagraph={false}
                />
              );
            }
          }

          // Handle 'end' position
          if (insertContext.position === 'end') {
            result.push(
              <InlineParagraphForm
                key="inline-form-end"
                includeHeading={includeHeading}
                newParagraphHeading={newParagraphHeading}
                newParagraphBody={newParagraphBody}
                newParagraphHeadingLevel={newParagraphHeadingLevel}
                isSubmitting={isSubmitting}
                formError={formError}
                onHeadingToggle={handleHeadingToggle}
                onHeadingChange={setNewParagraphHeading}
                onBodyChange={setNewParagraphBody}
                onHeadingLevelChange={setNewParagraphHeadingLevel}
                onSubmit={() => handleCreateParagraph('inline')}
                onCancel={closeInlineForm}
                isFirstParagraph={contentParagraphs.length === 0}
              />
            );
          }

          return result;
        })()}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? openNewParagraphDialog(insertContext.position, insertContext.targetParagraphId) : closeNewParagraphDialog())}>
        <DialogContent className="w-[95vw] sm:max-w-lg md:max-w-xl">
          <DialogHeader>
            <DialogTitle>New Content</DialogTitle>
            <DialogDescription>
              Provide the content for the new item. Choose between body text or heading, then submit as a suggestion for approval.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <Label 
                htmlFor="dialog-content-type-toggle" 
                className={cn("text-sm font-medium", COLORS.text.secondary)}
              >
                Content type
              </Label>
              <div className={cn(
                "flex items-center px-2 py-1.5 border", RADIUS.control,
                COLORS.border.muted,
                "bg-muted/50",
                SPACING.tight.inline
              )}>
                <div className={cn("flex items-center", SPACING.tight.inline)}>
                  <Icon 
                    name={includeHeading ? "Heading" : "AlignLeft"} 
                    className={cn(
                      "h-4 w-4",
                      includeHeading ? COLORS.text.primary : COLORS.text.secondary
                    )}
                  />
                  <span className={cn(
                    "text-sm font-medium transition-colors",
                    includeHeading ? COLORS.text.primary : COLORS.text.secondary
                  )}>
                    {includeHeading ? "Heading" : "Body"}
                  </span>
                </div>
                <Switch
                  id="dialog-content-type-toggle"
                  checked={includeHeading}
                  onCheckedChange={handleHeadingToggle}
                  aria-label={`Switch to ${includeHeading ? "body" : "heading"} text`}
                  className="ml-1"
                />
              </div>
            </div>

            {includeHeading ? (
              <div className="space-y-2">
                <Label htmlFor="heading-text" className="text-sm">Heading text</Label>
                <Input
                  id="heading-text"
                  value={newParagraphHeading}
                  onChange={(e) => setNewParagraphHeading(e.target.value)}
                  placeholder="Enter heading"
                />
                <Label htmlFor="heading-level" className="text-sm">Heading level</Label>
                <Select
                  value={insertContext.position === 'end' && contentParagraphs.length === 0 ? 'h1' : newParagraphHeadingLevel}
                  onValueChange={(value: HeadingLevel) => setNewParagraphHeadingLevel(value)}
                  disabled={insertContext.position === 'end' && contentParagraphs.length === 0}
                >
                  <SelectTrigger id="heading-level" className="w-[110px]">
                    <SelectValue placeholder="Heading level" />
                  </SelectTrigger>
                  <SelectContent className="z-[200]" sideOffset={4}>
                    <SelectItem value="h1">H1</SelectItem>
                    <SelectItem value="h2">H2</SelectItem>
                    <SelectItem value="h3">H3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="paragraph-body" className="text-sm">Body text</Label>
                <Textarea
                  id="paragraph-body"
                  value={newParagraphBody}
                  onChange={(e) => setNewParagraphBody(e.target.value)}
                  placeholder="Write the paragraph content..."
                  className="min-h-[140px]"
                />
              </div>
            )}

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeNewParagraphDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => handleCreateParagraph('dialog')} disabled={isSubmitting}>
              Create Suggestion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
});
