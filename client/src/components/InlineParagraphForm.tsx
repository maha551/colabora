import React from "react";
import { HeadingLevel } from "../types";
import { Button } from "./ui/button";
import { Icon } from "./ui/Icon";
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
import { SPACING, COLORS, RADIUS } from '../lib/designSystem';
import { cn } from "./ui/utils";

interface InlineParagraphFormProps {
  // Form state
  includeHeading: boolean;
  newParagraphHeading: string;
  newParagraphBody: string;
  newParagraphHeadingLevel: HeadingLevel;
  isSubmitting: boolean;
  formError: string | null;
  
  // Handlers
  onHeadingToggle: (checked: boolean) => void;
  onHeadingChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onHeadingLevelChange: (level: HeadingLevel) => void;
  onSubmit: () => void;
  onCancel: () => void;
  
  // Context
  isFirstParagraph: boolean;
  targetParagraphIndex?: number; // For 'before' position special handling
}

export function InlineParagraphForm({
  includeHeading,
  newParagraphHeading,
  newParagraphBody,
  newParagraphHeadingLevel,
  isSubmitting,
  formError,
  onHeadingToggle,
  onHeadingChange,
  onBodyChange,
  onHeadingLevelChange,
  onSubmit,
  onCancel,
  isFirstParagraph,
  targetParagraphIndex,
}: InlineParagraphFormProps) {
  // Determine heading level value - first paragraph or target index 0 forces H1
  const headingLevelValue = isFirstParagraph || targetParagraphIndex === 0 
    ? 'h1' 
    : newParagraphHeadingLevel;
  
  // First paragraph is always heading, so we use includeHeading for subsequent paragraphs
  const showToggle = !isFirstParagraph;
  const effectiveIncludeHeading = isFirstParagraph ? true : includeHeading;

  const handleSubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSubmit();
  };

  return (
    <div 
      className={cn("space-y-3 p-4 border border-primary/20 bg-muted/30", RADIUS.panel)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {isFirstParagraph ? (
            // First paragraph is always a heading (H1)
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium">First item will be styled as H1</span>
            </div>
          ) : (
            // Subsequent paragraphs allow choice
            <div className={cn("flex items-center", SPACING.tight.inline, "flex-wrap")}>
              <Label 
                htmlFor="content-type-toggle" 
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
                  id="content-type-toggle"
                  checked={includeHeading}
                  onCheckedChange={onHeadingToggle}
                  aria-label={`Switch to ${includeHeading ? "body" : "heading"} text`}
                  className="ml-1"
                />
              </div>
              {includeHeading && (
                <Select
                  value={newParagraphHeadingLevel}
                  onValueChange={(value: HeadingLevel) => onHeadingLevelChange(value)}
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
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="touch-manipulation min-h-[44px] sm:min-h-0"
        >
          Cancel
        </Button>
      </div>

      {isFirstParagraph ? (
        // First paragraph - always heading only
        <div className="space-y-2">
          <Label htmlFor="inline-heading-text" className="text-sm">H1 Heading text</Label>
          <Input
            id="inline-heading-text"
            value={newParagraphHeading}
            onChange={(e) => onHeadingChange(e.target.value)}
            placeholder="Enter your document's main heading"
          />
        </div>
      ) : (
        // Subsequent paragraphs - either heading only or body only (mutually exclusive)
        <>
          {includeHeading ? (
            <div className="space-y-2">
              <Label htmlFor="inline-heading-text" className="text-sm">Heading text</Label>
              <Input
                id="inline-heading-text"
                value={newParagraphHeading}
                onChange={(e) => onHeadingChange(e.target.value)}
                placeholder="Enter heading"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="inline-paragraph-body" className="text-sm">Paragraph text</Label>
              <Textarea
                id="inline-paragraph-body"
                value={newParagraphBody}
                onChange={(e) => onBodyChange(e.target.value)}
                className="min-h-[100px]"
                placeholder="Enter the paragraph text..."
              />
            </div>
          )}
        </>
      )}

      {formError && (
        <div className="text-sm text-destructive">{formError}</div>
      )}

      <div className="flex gap-2 justify-end">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="touch-manipulation min-h-[44px] sm:min-h-0"
        >
          <Icon name="PlusCircle" className="h-4 w-4 mr-1" />
          {isSubmitting ? "Submitting..." : "Submit Suggestion"}
        </Button>
      </div>
    </div>
  );
}

