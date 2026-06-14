import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { Paragraph, Document } from '../types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { cn } from '@/components/ui/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { OutlineItem, StructureOperation } from '@/types';
import { structureProposalsApi, ApiError, NetworkError, AuthError } from '@/lib/api';
import { logger } from '../lib/logger';
import { SPACING, COLORS, TOUCH_TARGETS, RESPONSIVE, RADIUS } from '@/lib/designSystem';
import { STATUS_COLORS } from '@/lib/statusColors';
interface StructureProposalModeProps {
  documentId: string;
  paragraphs: Paragraph[];
  document?: Document;
  onClose: () => void;
  onSuccess: () => void;
  inline?: boolean;
}

interface SortableItemProps {
  item: OutlineItem;
  onToggleMerge: (id: string) => void;
  onToggleDelete: (id: string) => void;
  mergeCandidates: string[];
  deleteCandidates: string[];
}

function SortableItem({ item, onToggleMerge, onToggleDelete, mergeCandidates, deleteCandidates }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isMergeCandidate = mergeCandidates.includes(item.id);
  const isDeleteCandidate = deleteCandidates.includes(item.id);

  const getItemStyle = () => {
    if (isDeleteCandidate) return cn(COLORS.bg.muted, STATUS_COLORS.rejected.border, 'border');
    if (isMergeCandidate) return cn(COLORS.bg.muted, STATUS_COLORS.active.border, 'border');
    return cn(COLORS.bg.surface, COLORS.border.standard, 'border');
  };

  const getIcon = () => {
    if (item.type === 'heading') {
      return <Icon name="FileText" className="w-5 h-5" />;
    }
    return <Icon name="File" className="w-5 h-5" />;
  };

  const getTitle = () => {
    if (item.title) return item.title;
    // For paragraphs, show first 50 characters
    return item.text.length > 50 ? `${item.text.substring(0, 50)}...` : item.text;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(SPACING.card.padding, "border hover:shadow-md transition-shadow", RADIUS.panel, getItemStyle())}
      {...attributes}
    >
      <div className={cn("flex items-center", SPACING.content.inline)}>
        <div
          ref={setActivatorNodeRef}
          {...listeners}
          className={cn("cursor-grab active:cursor-grabbing p-1 -m-1 touch-none", RADIUS.inline, COLORS.text.secondary)}
        >
          <Icon name="GripVertical" className={cn("w-5 h-5", COLORS.text.secondary, "mr-2")} />
        </div>
        <div className={cn("flex-1", COLORS.text.primary)}>{getIcon()}</div>
        <div className="flex-1">
          <div className={cn("font-medium", RESPONSIVE.text)}>
            {item.headingLevel && <span className={cn(COLORS.text.secondary, "mr-2")}>H{item.headingLevel.replace('h', '')}</span>}
            {getTitle()}
          </div>
          {item.type === 'paragraph' && item.text && (
            <div className={cn("text-xs", COLORS.text.secondary, "mt-1 line-clamp-2")}>
              {item.text}
            </div>
          )}
        </div>
        <div className={cn("flex", SPACING.tight.inline)}>
          <Checkbox
            checked={isMergeCandidate}
            onCheckedChange={() => onToggleMerge(item.id)}
            className="data-[state=checked]:bg-primary"
          />
          <span className={cn("text-xs", STATUS_COLORS.active.badge)}>Merge</span>
          <Checkbox
            checked={isDeleteCandidate}
            onCheckedChange={() => onToggleDelete(item.id)}
            className="data-[state=checked]:bg-destructive"
          />
          <span className={cn("text-xs", STATUS_COLORS.rejected.badge)}>Delete</span>
        </div>
      </div>
    </div>
  );
}

export function StructureProposalMode({ documentId, paragraphs, document, onClose, onSuccess, inline = false }: StructureProposalModeProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [originalOrder, setOriginalOrder] = useState<Map<string, number>>(new Map());
  const [mergeCandidates, setMergeCandidates] = useState<string[]>([]);
  const [deleteCandidates, setDeleteCandidates] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Convert paragraphs to outline items
  useEffect(() => {
    const items: OutlineItem[] = paragraphs
      .sort((a, b) => a.order - b.order)
      .map((para, index) => ({
        id: para.id,
        type: para.headingLevel ? 'heading' : 'paragraph',
        title: para.title,
        text: para.text,
        headingLevel: para.headingLevel,
        orderIndex: index,
      }));

    // Track original order for move detection
    const originalOrderMap = new Map<string, number>();
    items.forEach((item, index) => {
      originalOrderMap.set(item.id, index);
    });

    setOutlineItems(items);
    setOriginalOrder(originalOrderMap);
  }, [paragraphs]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setOutlineItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex).map((item, index) => ({
          ...item,
          orderIndex: index,
        }));
      });
    }
  };

  const toggleMerge = (id: string) => {
    setMergeCandidates(prev =>
      prev.includes(id)
        ? prev.filter(itemId => itemId !== id)
        : [...prev, id]
    );
  };

  const toggleDelete = (id: string) => {
    setDeleteCandidates(prev =>
      prev.includes(id)
        ? prev.filter(itemId => itemId !== id)
        : [...prev, id]
    );
  };

  const generateOperations = (): StructureOperation[] => {
    const operations: StructureOperation[] = [];

    // Create a set of valid paragraph IDs for validation
    const validParagraphIds = new Set(paragraphs.map(p => p.id));

    // Helper function to validate paragraph existence
    const validateParagraphExists = (id: string, operationType: string): boolean => {
      if (!validParagraphIds.has(id)) {
        logger.error(`Invalid ${operationType} operation: paragraph ${id} does not exist`);
        return false;
      }
      return true;
    };

    // Handle moves (reordering) - compare current position with original position
    // Create a map of current positions for accurate comparison
    const currentPositions = new Map<string, number>();
    outlineItems.forEach((item, index) => {
      currentPositions.set(item.id, index);
    });

    // Find items that have moved from their original positions
    outlineItems.forEach((item) => {
      const originalIndex = originalOrder.get(item.id);
      const currentIndex = currentPositions.get(item.id);

      if (originalIndex !== undefined && currentIndex !== undefined && originalIndex !== currentIndex) {
        if (validateParagraphExists(item.id, 'MOVE')) {
          operations.push({
            operationType: 'MOVE',
            targetParagraphId: item.id,
            newPositionIndex: currentIndex,
          });
        }
      }
    });

    // Handle merges
    if (mergeCandidates.length > 1) {
      const mergeTargets = mergeCandidates.slice(1); // First item is the target
      const targetId = mergeCandidates[0];

      // Validate all merge participants exist
      const allValid = [targetId, ...mergeTargets].every(id => validateParagraphExists(id, 'MERGE'));

      if (allValid) {
        operations.push({
          operationType: 'MERGE',
          sourceParagraphIds: mergeTargets,
          targetParagraphId: targetId,
        });
      }
    }

    // Handle deletions
    deleteCandidates.forEach(deleteId => {
      if (validateParagraphExists(deleteId, 'DELETE')) {
        operations.push({
          operationType: 'DELETE',
          targetParagraphId: deleteId,
        });
      }
    });

    return operations;
  };

  const handleSubmit = async () => {
    // Check document status - allow agreed when amendments open
    if (document?.status === 'rejected') {
      toast.error('Cannot create structure proposals on rejected documents');
      return;
    }
    if (document?.status === 'agreed' && !document.amendmentsOpen) {
      toast.error('Document is not open for amendments. Request an organization vote to open it.');
      return;
    }

    if (!title.trim()) {
      toast.error('Please provide a title for the structure proposal');
      return;
    }

    const operations = generateOperations();
    if (operations.length === 0) {
      toast.error('Please make some structural changes before submitting');
      return;
    }

    setIsSubmitting(true);
    const loadingToast = toast.loading('Creating structure proposal...');
    try {
      await structureProposalsApi.createStructureProposal(
        documentId,
        title.trim(),
        description.trim() || undefined,
        operations
      );
      toast.dismiss(loadingToast);
      toast.success('Structure proposal created successfully');
      onSuccess();
    } catch (error) {
      toast.dismiss(loadingToast);
      logger.error('Failed to create structure proposal:', error);

      let userMessage = 'Failed to create structure proposal. Please try again.';

      if (error instanceof AuthError) {
        userMessage = 'Your session has expired. Please log in again.';
      } else if (error instanceof NetworkError) {
        userMessage = 'Network error. Please check your connection and try again.';
      } else if (error instanceof ApiError) {
        if (error.status === 409) {
          userMessage = error.message; // "There is already an active structure proposal for this document"
        } else if (error.status === 400) {
          userMessage = 'Invalid proposal data. Please check your changes and try again.';
        } else if (error.status >= 500) {
          userMessage = 'Server error. Please try again later.';
        } else {
          userMessage = error.message || userMessage;
        }
      }

      toast.error(userMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges = () => {
    const operations = generateOperations();
    return operations.length > 0;
  };

  // Content component that can be used in both inline and modal modes
  const formContent = (
    <>
      <div className={cn(SPACING.card.padding, COLORS.border.standard, "border-b")}>
        <div className="mb-4 flex flex-col items-center justify-between gap-3 md:flex-row">
          <h2 className={cn("text-2xl font-bold", RESPONSIVE.text, "flex items-center gap-2")}>
            <Icon name="Rocket" className="w-6 h-6" /> Propose Document Restructure
          </h2>
          <Button variant="outline" onClick={onClose} className={TOUCH_TARGETS.button}>
            <Icon name="X" className="w-4 h-4 mr-1" /> Close
          </Button>
        </div>

        <div className={SPACING.content.gap}>
          <div>
            <label className={cn("block", RESPONSIVE.text, "font-medium mb-2")}>Proposal Title *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Reorganize Chapter 2 and merge related sections"
              className="w-full"
            />
          </div>

          <div>
            <label className={cn("block", RESPONSIVE.text, "font-medium mb-2")}>Description (Optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the structural changes you're proposing..."
              rows={3}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div className={cn('flex flex-1 flex-col overflow-hidden md:flex-row', inline ? 'min-h-[400px]' : '')}>
        <div className={cn("flex-1", SPACING.card.padding, "overflow-y-auto")}>
          <div className="mb-4">
            <h3 className={cn("text-lg font-semibold mb-2", RESPONSIVE.text)}>Document Outline</h3>
            <p className={cn("text-sm", COLORS.text.secondary, "mb-4")}>
              Drag items to reorder, check boxes to mark for merge or deletion.
            </p>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={outlineItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
              <div className={SPACING.tight.gap}>
                {outlineItems.map((item) => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    onToggleMerge={toggleMerge}
                    onToggleDelete={toggleDelete}
                    mergeCandidates={mergeCandidates}
                    deleteCandidates={deleteCandidates}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {outlineItems.length === 0 && (
            <div className={cn("text-center py-8", COLORS.text.secondary)}>
              No paragraphs found in this document.
            </div>
          )}
        </div>

        <div className={cn('hidden w-80 md:block', COLORS.border.standard, 'border-l', SPACING.card.padding, COLORS.bg.muted)}>
            <h3 className={cn("text-lg font-semibold mb-4", RESPONSIVE.text)}>Operations Preview</h3>

            {mergeCandidates.length > 1 && (
              <Alert className="mb-3">
                <AlertDescription>
                  <strong>Merge Operation:</strong> {mergeCandidates.length} sections will be merged into one.
                </AlertDescription>
              </Alert>
            )}

            {deleteCandidates.length > 0 && (
              <Alert className="mb-3">
                <AlertDescription>
                  <strong>Delete Operation:</strong> {deleteCandidates.length} sections will be marked for deletion.
                </AlertDescription>
              </Alert>
            )}

            {outlineItems.some(item => item.orderIndex !== outlineItems.findIndex(i => i.id === item.id)) && (
              <Alert className="mb-3">
                <AlertDescription>
                  <strong>Reorder Operation:</strong> Document sections will be reordered.
                </AlertDescription>
              </Alert>
            )}

            {!hasChanges() && (
              <div className={cn("text-center py-8", COLORS.text.secondary)}>
                No changes detected. Make some structural edits to see operations here.
              </div>
            )}

            <div className={cn("mt-6", SPACING.tight.gap)}>
              <div className={cn('flex flex-wrap md:flex-nowrap', SPACING.tight.inline)}>
                <Badge variant="secondary">Moves: {outlineItems.filter(item => item.orderIndex !== outlineItems.findIndex(i => i.id === item.id)).length}</Badge>
                <Badge variant="secondary">Merges: {mergeCandidates.length > 1 ? 1 : 0}</Badge>
                <Badge variant="secondary">Deletes: {deleteCandidates.length}</Badge>
              </div>
            </div>
          </div>
      </div>

      <div className={cn(SPACING.card.padding, COLORS.border.standard, "border-t", COLORS.bg.muted)}>
        <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
          <div className={cn("text-sm", COLORS.text.secondary, "flex items-center gap-2")}>
            <Icon name="AlertTriangle" className="w-4 h-4" />
            These changes cannot be easily undone. Make sure collaborators agree with the restructure.
          </div>
          <div className={cn("flex", SPACING.content.inline)}>
            <Button variant="outline" onClick={onClose} disabled={isSubmitting} className={TOUCH_TARGETS.button}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !title.trim() || !hasChanges()}
              className={TOUCH_TARGETS.button}
            >
              <Icon name="Rocket" className="w-4 h-4 mr-1" /> {isSubmitting ? 'Creating...' : 'Submit Structure Proposal'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  // Inline mode: render without fixed overlay
  if (inline) {
    return (
      <div className={cn(COLORS.bg.surface, "border", RADIUS.panel, "w-full overflow-hidden flex flex-col")}>
        {formContent}
      </div>
    );
  }

  // Modal mode: render with fixed overlay (original behavior)
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={cn(COLORS.bg.surface, RADIUS.panel, 'flex w-full max-w-[95vw] flex-col overflow-hidden max-md:max-h-[90dvh] md:max-h-[90vh] md:max-w-4xl')}>
        {formContent}
      </div>
    </div>
  );
}
