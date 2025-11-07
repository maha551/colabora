import React, { useMemo, useState } from "react";
import { Document, User, ElementType, HeadingLevel, Paragraph } from "../types";
import { ParagraphWithSuggestions } from "./ParagraphWithSuggestions";
import { Button } from "./ui/button";
import { Plus, PlusCircle } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "./ui/utils";

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
  onAddElement: (
    elementType: ElementType,
    options?: {
      text?: string;
      title?: string;
      headingLevel?: HeadingLevel;
      order?: number;
    }
  ) => Promise<void> | void;
}

type InsertContext = {
  targetParagraphId: string | null;
  position: 'before' | 'after' | 'end';
};

type InlineAddButtonProps = {
  onClick: () => void;
  floating?: boolean;
  position?: "top" | "bottom";
};

function InlineAddButton({ onClick, floating = false, position = "top" }: InlineAddButtonProps) {
  if (!floating) {
    return (
      <div className="flex justify-center py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 sm:h-8 sm:w-8 rounded-full shadow-sm bg-white/95 dark:bg-slate-900/80 border border-border touch-manipulation"
          onClick={onClick}
          aria-label="Add paragraph"
        >
          <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
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
  };

  return (
    <div style={style}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 sm:h-8 sm:w-8 rounded-full shadow-sm bg-white/95 dark:bg-slate-900/80 border border-border touch-manipulation"
        onClick={onClick}
        style={{ pointerEvents: "auto" }}
        aria-label="Add paragraph"
      >
        <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
      </Button>
    </div>
  );
}

export function DocumentEditor({
  document,
  totalUsers,
  currentUser,
  onAddSuggestion,
  onVote,
  onComment,
  onAddElement,
}: DocumentEditorProps) {
  const sortedParagraphs = useMemo(
    () => [...document.paragraphs].sort((a, b) => {
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      return orderA - orderB;
    }),
    [document.paragraphs],
  );

  const titleParagraph = sortedParagraphs.find((paragraph) => paragraph.isDocumentTitle);
  const contentParagraphs = sortedParagraphs.filter((paragraph) => !paragraph.isDocumentTitle);

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

  const openNewParagraphDialog = (
    position: InsertContext["position"] = 'end',
    targetParagraphId: string | null = null,
    useInlineForm: boolean = false,
  ) => {
    setInsertContext({ position, targetParagraphId });
    setFormError(null);
    setNewParagraphBody("");

    // Allow choice for all paragraphs, including first one
    const isFirstParagraph = contentParagraphs.length === 0;
    // Don't force heading for first paragraph - let user choose
    setIncludeHeading(false); // Default to body text for consistency
    setNewParagraphHeading("");
    setNewParagraphHeadingLevel("h2");

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

  const handleSubmitNewParagraph = async () => {
    const body = newParagraphBody.trim();
    const heading = newParagraphHeading.trim();

    if (includeHeading) {
      // Heading mode: only heading text required
      if (!heading) {
        setFormError("Heading text is required.");
        return;
      }
    } else {
      // Body mode: only body text required
      if (!body) {
        setFormError("Paragraph body is required.");
        return;
      }
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const order = computeInsertOrder(insertContext);

      if (includeHeading) {
        // Create heading-only paragraph
        await onAddElement("paragraph", {
          text: "",
          title: heading,
          headingLevel: newParagraphHeadingLevel,
          order,
        });
      } else {
        // Create body-only paragraph
        await onAddElement("paragraph", {
          text: body,
          order,
        });
      }
      
      setIsInlineFormOpen(false);
      setNewParagraphBody("");
      // Reset to default state (body text for consistency)
      setIncludeHeading(false);
      setNewParagraphHeading("");
      setNewParagraphHeadingLevel("h2");
    } catch (error) {
      console.error("Error creating paragraph:", error);
      setFormError("Failed to create paragraph. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
      return (previousOrder + targetOrder) / 2;
    }

    const nextOrder = targetIndex < availableParagraphs.length - 1
      ? availableParagraphs[targetIndex + 1].order ?? targetOrder + 1
      : targetOrder + 1;

    return (targetOrder + nextOrder) / 2;
  };

  const handleCreateParagraph = async () => {
    const body = newParagraphBody.trim();
    const heading = newParagraphHeading.trim();

    if (includeHeading) {
      // Heading mode: only heading text required
      if (!heading) {
        setFormError("Heading text is required.");
        return;
      }
    } else {
      // Body mode: only body text required
      if (!body) {
        setFormError("Paragraph body is required.");
        return;
      }
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const order = computeInsertOrder(insertContext);

      if (includeHeading) {
        // Create heading-only paragraph
        await onAddElement("paragraph", {
          text: "",
          title: heading,
          headingLevel: newParagraphHeadingLevel,
          order,
        });
      } else {
        // Create body-only paragraph
        await onAddElement("paragraph", {
          text: body,
          order,
        });
      }
      
      setIsDialogOpen(false);
      setNewParagraphBody("");
      // Reset to default state (body text for consistency)
      setIncludeHeading(false);
      setNewParagraphHeading("");
      setNewParagraphHeadingLevel("h2");
      setInsertContext({ targetParagraphId: null, position: 'end' });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to add paragraph.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get all collaborators (owner + collaborators)
  const allCollaborators = [
    document.owner,
    ...document.collaborators.map(c => c.user)
  ];

  const renderParagraph = (paragraph: Paragraph) => {
    const isHovered = hoveredParagraphId === paragraph.id;
    return (
      <div
        key={paragraph.id}
        onMouseEnter={() => setHoveredParagraphId(paragraph.id)}
        onMouseLeave={() => setHoveredParagraphId((prev) => (prev === paragraph.id ? null : prev))}
        onFocus={() => setHoveredParagraphId(paragraph.id)}
        onBlur={() => setHoveredParagraphId((prev) => (prev === paragraph.id ? null : prev))}
        tabIndex={0}
        className={cn(
          "relative transition-all duration-200",
          isHovered ? "pb-8" : "pt-4 pb-4"
        )}
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
          isDocumentTitle={paragraph.isDocumentTitle}
          isHovered={isHovered}
          showContextButton={false}
        />
        {isHovered && (
          <InlineAddButton
            onClick={() => openNewParagraphDialog('after', paragraph.id, true)}
            floating
            position="bottom"
          />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-6">
        {(() => {
          // Empty state: Show centered plus button when no content paragraphs
          if (contentParagraphs.length === 0 && !isInlineFormOpen) {
            return (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <p className="text-gray-600 mb-2">Start your collaborative document</p>
                  <p className="text-sm text-muted-foreground mb-4">Add your first paragraph - choose between heading or body text</p>
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => openNewParagraphDialog('end', null, true)}
                    className="gap-2 touch-manipulation min-h-[48px] text-base"
                  >
                    <Plus className="h-5 w-5" />
                    Add First Paragraph
                  </Button>
                </div>
              </div>
            );
          }

          if (!isInlineFormOpen) {
            return contentParagraphs.map((paragraph) => renderParagraph(paragraph));
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
                <div key={`inline-form-${insertContext.targetParagraphId}`} className="space-y-3 p-4 border border-primary/20 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex gap-2 flex-wrap">
                      {/* All paragraphs now allow choice between Body and Heading */}
                      <Button
                        type="button"
                        size="sm"
                        variant={!includeHeading ? "default" : "outline"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIncludeHeading(false);
                        }}
                        className="touch-manipulation min-h-[44px] sm:min-h-auto"
                      >
                        Body
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={includeHeading ? "default" : "outline"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIncludeHeading(true);
                        }}
                        className="touch-manipulation min-h-[44px] sm:min-h-auto"
                      >
                        Heading
                      </Button>
                      {includeHeading && (
                        <Select
                          value={newParagraphHeadingLevel}
                          onValueChange={(value: HeadingLevel) => setNewParagraphHeadingLevel(value)}
                        >
                          <SelectTrigger className="w-[110px]">
                            <SelectValue placeholder="Heading level" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="h1">H1</SelectItem>
                            <SelectItem value="h2">H2</SelectItem>
                            <SelectItem value="h3">H3</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={closeInlineForm}
                      className="touch-manipulation min-h-[44px] sm:min-h-auto"
                    >
                      Cancel
                    </Button>
                  </div>

                  {includeHeading ? (
                    <div className="space-y-2">
                      <Label htmlFor="inline-heading-text" className="text-sm">Heading text</Label>
                      <Input
                        id="inline-heading-text"
                        value={newParagraphHeading}
                        onChange={(e) => setNewParagraphHeading(e.target.value)}
                        placeholder="Enter heading"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="inline-paragraph-body" className="text-sm">Paragraph text</Label>
                      <Textarea
                        id="inline-paragraph-body"
                        value={newParagraphBody}
                        onChange={(e) => setNewParagraphBody(e.target.value)}
                        className="min-h-[100px]"
                        placeholder="Enter the paragraph text..."
                      />
                    </div>
                  )}

                  {formError && (
                    <div className="text-sm text-destructive">{formError}</div>
                  )}

                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      onClick={handleSubmitNewParagraph}
                      disabled={isSubmitting}
                      className="touch-manipulation min-h-[44px] sm:min-h-auto"
                    >
                      <PlusCircle className="h-4 w-4 mr-1" />
                      {isSubmitting ? "Submitting..." : "Submit Suggestion"}
                    </Button>
                  </div>
                </div>
              );
            }

            result.push(renderParagraph(contentParagraphs[i]));

            if (insertContext.position === 'after' && targetIndex === i) {
              // Insert form after this paragraph
              result.push(
                <div key={`inline-form-${insertContext.targetParagraphId}`} className="space-y-3 p-4 border border-primary/20 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex gap-2 flex-wrap">
                      {/* All paragraphs now allow choice between Body and Heading */}
                      <Button
                        type="button"
                        size="sm"
                        variant={!includeHeading ? "default" : "outline"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIncludeHeading(false);
                        }}
                        className="touch-manipulation min-h-[44px] sm:min-h-auto"
                      >
                        Body
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={includeHeading ? "default" : "outline"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIncludeHeading(true);
                        }}
                        className="touch-manipulation min-h-[44px] sm:min-h-auto"
                      >
                        Heading
                      </Button>
                      {includeHeading && (
                        <Select
                          value={newParagraphHeadingLevel}
                          onValueChange={(value: HeadingLevel) => setNewParagraphHeadingLevel(value)}
                        >
                          <SelectTrigger className="w-[110px]">
                            <SelectValue placeholder="Heading level" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="h1">H1</SelectItem>
                            <SelectItem value="h2">H2</SelectItem>
                            <SelectItem value="h3">H3</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={closeInlineForm}
                      className="touch-manipulation min-h-[44px] sm:min-h-auto"
                    >
                      Cancel
                    </Button>
                  </div>

                  {includeHeading ? (
                    <div className="space-y-2">
                      <Label htmlFor="inline-heading-text" className="text-sm">Heading text</Label>
                      <Input
                        id="inline-heading-text"
                        value={newParagraphHeading}
                        onChange={(e) => setNewParagraphHeading(e.target.value)}
                        placeholder="Enter heading"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="inline-paragraph-body" className="text-sm">Paragraph text</Label>
                      <Textarea
                        id="inline-paragraph-body"
                        value={newParagraphBody}
                        onChange={(e) => setNewParagraphBody(e.target.value)}
                        className="min-h-[100px]"
                        placeholder="Enter the paragraph text..."
                      />
                    </div>
                  )}

                  {formError && (
                    <div className="text-sm text-destructive">{formError}</div>
                  )}

                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      onClick={handleSubmitNewParagraph}
                      disabled={isSubmitting}
                      className="touch-manipulation min-h-[44px] sm:min-h-auto"
                    >
                      <PlusCircle className="h-4 w-4 mr-1" />
                      {isSubmitting ? "Submitting..." : "Submit Suggestion"}
                    </Button>
                  </div>
                </div>
              );
            }
          }

          // Handle 'end' position
          if (insertContext.position === 'end') {
            result.push(
              <div key="inline-form-end" className="space-y-3 p-4 border border-primary/20 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex gap-2 flex-wrap">
                    {contentParagraphs.length === 0 ? (
                      // First paragraph must be a heading
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-medium">First item must be a heading</span>
                      </div>
                    ) : (
                      // Subsequent paragraphs allow choice
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant={!includeHeading ? "default" : "outline"}
                          onClick={() => setIncludeHeading(false)}
                        >
                          Body
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={includeHeading ? "default" : "outline"}
                          onClick={() => setIncludeHeading(true)}
                        >
                          Heading
                        </Button>
                      </>
                    )}
                    {includeHeading && (
                      <Select
                        value={newParagraphHeadingLevel}
                        onValueChange={(value: HeadingLevel) => setNewParagraphHeadingLevel(value)}
                      >
                        <SelectTrigger className="w-[110px]">
                          <SelectValue placeholder="Heading level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="h1">H1</SelectItem>
                          <SelectItem value="h2">H2</SelectItem>
                          <SelectItem value="h3">H3</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={closeInlineForm}
                  >
                    Cancel
                  </Button>
                </div>

                {includeHeading && (
                  <div className="space-y-2">
                    <Label htmlFor="inline-heading-text" className="text-sm">Heading text</Label>
                    <Input
                      id="inline-heading-text"
                      value={newParagraphHeading}
                      onChange={(e) => setNewParagraphHeading(e.target.value)}
                      placeholder="Enter heading"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="inline-paragraph-body" className="text-sm">
                    {includeHeading ? "Body text" : "Paragraph text"}
                  </Label>
                  <Textarea
                    id="inline-paragraph-body"
                    value={newParagraphBody}
                    onChange={(e) => setNewParagraphBody(e.target.value)}
                    className="min-h-[100px]"
                    placeholder={includeHeading ? "Enter the body text..." : "Enter the paragraph text..."}
                  />
                </div>

                {formError && (
                  <div className="text-sm text-destructive">{formError}</div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    onClick={handleSubmitNewParagraph}
                    disabled={isSubmitting}
                  >
                    <PlusCircle className="h-4 w-4 mr-1" />
                    {isSubmitting ? "Submitting..." : "Submit Suggestion"}
                  </Button>
                </div>
              </div>
            );
          }

          return result;
        })()}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? openNewParagraphDialog(insertContext.position, insertContext.targetParagraphId) : closeNewParagraphDialog())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Content</DialogTitle>
            <DialogDescription>
              Provide the content for the new item. Choose between body text or heading, then submit as a suggestion for approval.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="include-heading" className="text-sm">Type</Label>
              <div className="flex gap-2">
                {/* All paragraphs now allow choice between Body and Heading */}
                <Button
                  type="button"
                  size="sm"
                  variant={!includeHeading ? "default" : "outline"}
                  onClick={() => setIncludeHeading(false)}
                >
                  Body
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={includeHeading ? "default" : "outline"}
                  onClick={() => setIncludeHeading(true)}
                >
                  Heading
                </Button>
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
                  value={newParagraphHeadingLevel}
                  onValueChange={(value: HeadingLevel) => setNewParagraphHeadingLevel(value)}
                >
                  <SelectTrigger id="heading-level" className="w-[110px]">
                    <SelectValue placeholder="Heading level" />
                  </SelectTrigger>
                  <SelectContent>
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
            <Button onClick={handleCreateParagraph} disabled={isSubmitting}>
              Create Suggestion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
