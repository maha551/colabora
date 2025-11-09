import React, { useState, useEffect } from 'react';
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

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { OutlineItem, StructureOperation, HeadingLevel } from '@/types';
import { structureProposalsApi } from '@/lib/api';

interface StructureProposalModeProps {
  documentId: string;
  paragraphs: any[];
  onClose: () => void;
  onSuccess: () => void;
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
    if (isDeleteCandidate) return 'bg-red-50 border-red-200';
    if (isMergeCandidate) return 'bg-blue-50 border-blue-200';
    return 'bg-white border-gray-200';
  };

  const getIcon = () => {
    if (item.type === 'heading') {
      return '📄';
    }
    return '📝';
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
      className={`p-3 border rounded-lg cursor-move hover:shadow-md transition-shadow ${getItemStyle()}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">{getIcon()}</span>
        <div className="flex-1">
          <div className="font-medium text-sm">
            {item.headingLevel && <span className="text-gray-500 mr-2">H{item.headingLevel.replace('h', '')}</span>}
            {getTitle()}
          </div>
          {item.type === 'paragraph' && item.text && (
            <div className="text-xs text-gray-500 mt-1 line-clamp-2">
              {item.text}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Checkbox
            checked={isMergeCandidate}
            onCheckedChange={() => onToggleMerge(item.id)}
            className="data-[state=checked]:bg-blue-600"
          />
          <span className="text-xs text-blue-600">Merge</span>
          <Checkbox
            checked={isDeleteCandidate}
            onCheckedChange={() => onToggleDelete(item.id)}
            className="data-[state=checked]:bg-red-600"
          />
          <span className="text-xs text-red-600">Delete</span>
        </div>
      </div>
    </div>
  );
}

export function StructureProposalMode({ documentId, paragraphs, onClose, onSuccess }: StructureProposalModeProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
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
    setOutlineItems(items);
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

    // Handle moves (reordering)
    outlineItems.forEach((item, newIndex) => {
      if (item.orderIndex !== newIndex) {
        operations.push({
          operationType: 'MOVE',
          targetParagraphId: item.id,
          newPositionIndex: newIndex,
        });
      }
    });

    // Handle merges
    if (mergeCandidates.length > 1) {
      const mergeTargets = mergeCandidates.slice(1); // First item is the target
      const targetId = mergeCandidates[0];

      operations.push({
        operationType: 'MERGE',
        sourceParagraphIds: mergeTargets,
        targetParagraphId: targetId,
      });
    }

    // Handle deletions
    deleteCandidates.forEach(deleteId => {
      operations.push({
        operationType: 'DELETE',
        targetParagraphId: deleteId,
      });
    });

    return operations;
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert('Please provide a title for the structure proposal');
      return;
    }

    const operations = generateOperations();
    if (operations.length === 0) {
      alert('Please make some structural changes before submitting');
      return;
    }

    setIsSubmitting(true);
    try {
      await structureProposalsApi.createStructureProposal(
        documentId,
        title.trim(),
        description.trim() || undefined,
        operations
      );
      onSuccess();
    } catch (error) {
      console.error('Failed to create structure proposal:', error);
      alert('Failed to create structure proposal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges = () => {
    const operations = generateOperations();
    return operations.length > 0;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">🧩 Propose Document Restructure</h2>
            <Button variant="outline" onClick={onClose}>
              ✕ Close
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Proposal Title *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Reorganize Chapter 2 and merge related sections"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description (Optional)</label>
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

        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Document Outline</h3>
              <p className="text-sm text-gray-600 mb-4">
                Drag items to reorder, check boxes to mark for merge or deletion.
              </p>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={outlineItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
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
              <div className="text-center py-8 text-gray-500">
                No paragraphs found in this document.
              </div>
            )}
          </div>

          <div className="w-80 border-l p-6 bg-gray-50">
            <h3 className="text-lg font-semibold mb-4">Operations Preview</h3>

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
              <div className="text-center py-8 text-gray-500">
                No changes detected. Make some structural edits to see operations here.
              </div>
            )}

            <div className="mt-6 space-y-2">
              <div className="flex gap-2">
                <Badge variant="secondary">📋 Moves: {outlineItems.filter(item => item.orderIndex !== outlineItems.findIndex(i => i.id === item.id)).length}</Badge>
                <Badge variant="secondary">🔗 Merges: {mergeCandidates.length > 1 ? 1 : 0}</Badge>
                <Badge variant="secondary">🗑️ Deletes: {deleteCandidates.length}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              ⚠️ These changes cannot be easily undone. Make sure collaborators agree with the restructure.
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !title.trim() || !hasChanges()}
              >
                {isSubmitting ? 'Creating...' : '🚀 Submit Structure Proposal'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
