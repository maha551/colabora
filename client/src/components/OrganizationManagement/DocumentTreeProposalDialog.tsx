import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { Move, Trash2, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { Document, DocumentTreeOperationType } from '../../types';
import { documentTreeProposalsApi } from '../../lib/api';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface DocumentTreeProposalDialogProps {
  document: Document;
  documents: Document[]; // All documents for parent selection
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DocumentTreeProposalDialog({
  document,
  documents,
  isOpen,
  onClose,
  onSuccess,
}: DocumentTreeProposalDialogProps) {
  const [operationType, setOperationType] = useState<DocumentTreeOperationType | ''>('');
  const [targetParentId, setTargetParentId] = useState<string>('');
  const [newOrder, setNewOrder] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setOperationType('');
      setTargetParentId('');
      setNewOrder('');
      setReason('');
    }
  }, [isOpen]);

  // Build document tree for parent selection (exclude current document and its descendants)
  const getAvailableParents = (): Document[] => {
    const excludeIds = new Set<string>([document.id]);
    
    // Add all descendants of current document
    const addDescendants = (docId: string) => {
      documents.forEach(doc => {
        if (doc.parentId === docId && !excludeIds.has(doc.id)) {
          excludeIds.add(doc.id);
          addDescendants(doc.id);
        }
      });
    };
    addDescendants(document.id);

    return documents.filter(doc => 
      !excludeIds.has(doc.id) && 
      doc.organizationId === document.organizationId
    );
  };

  const availableParents = getAvailableParents();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!operationType) {
      toast.error('Please select an operation type');
      return;
    }

    if (operationType === 'MOVE' && targetParentId === '') {
      // Allow empty string for root level
      // But we need to check if it's explicitly set
    }

    if (operationType === 'REORDER' && !newOrder) {
      toast.error('Please enter a new order number');
      return;
    }

    setIsSubmitting(true);
    try {
      await documentTreeProposalsApi.createProposal({
        documentId: document.id,
        operationType,
        targetParentId: operationType === 'MOVE' ? (targetParentId || undefined) : undefined,
        newOrder: operationType === 'REORDER' ? parseInt(newOrder) : undefined,
        reason: reason.trim() || undefined,
      });

      toast.success('Tree structure proposal created successfully!');
      onSuccess();
      onClose();
    } catch (error: unknown) {
      console.error('Failed to create tree proposal:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create proposal';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getOperationDescription = () => {
    switch (operationType) {
      case 'MOVE':
        return 'Move this document to a different parent in the tree structure.';
      case 'DELETE':
        return 'Propose deletion of this document from the tree. This requires voting approval.';
      case 'REORDER':
        return 'Change the order of this document among its siblings.';
      default:
        return 'Select an operation to propose a change to the document tree structure.';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Move className="h-5 w-5" />
            Propose Tree Structure Change
          </DialogTitle>
          <DialogDescription>
            Propose a change to the document tree structure. The proposal will require voting approval from organization members.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* Current Document Info */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <Label className="text-sm text-gray-600 mb-1">Current Document</Label>
              <p className="font-medium">{document.title}</p>
              {document.parentId && (
                <p className="text-sm text-gray-500 mt-1">
                  Current parent: {documents.find(d => d.id === document.parentId)?.title || 'Unknown'}
                </p>
              )}
            </div>

            {/* Operation Type Selection */}
            <div className="space-y-2">
              <Label htmlFor="operation-type">Operation Type *</Label>
              <Select
                value={operationType}
                onValueChange={(value) => setOperationType(value as DocumentTreeOperationType)}
              >
                <SelectTrigger id="operation-type">
                  <SelectValue placeholder="Select operation type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MOVE">
                    <div className="flex items-center gap-2">
                      <Move className="h-4 w-4" />
                      Move Document
                    </div>
                  </SelectItem>
                  <SelectItem value="DELETE">
                    <div className="flex items-center gap-2">
                      <Trash2 className="h-4 w-4" />
                      Delete Document
                    </div>
                  </SelectItem>
                  <SelectItem value="REORDER">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      Reorder Document
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">{getOperationDescription()}</p>
            </div>

            {/* Operation-specific fields */}
            {operationType === 'MOVE' && (
              <div className="space-y-2">
                <Label htmlFor="target-parent">Target Parent Document *</Label>
                <Select value={targetParentId} onValueChange={setTargetParentId}>
                  <SelectTrigger id="target-parent">
                    <SelectValue placeholder="Select parent document" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">(Root level - no parent)</SelectItem>
                    {availableParents.map((parent) => (
                      <SelectItem key={parent.id} value={parent.id}>
                        {parent.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableParents.length === 0 && (
                  <p className="text-xs text-gray-500">
                    No other documents available as parent (excluding this document and its children)
                  </p>
                )}
              </div>
            )}

            {operationType === 'REORDER' && (
              <div className="space-y-2">
                <Label htmlFor="new-order">New Order *</Label>
                <Input
                  id="new-order"
                  type="number"
                  min="0"
                  value={newOrder}
                  onChange={(e) => setNewOrder(e.target.value)}
                  placeholder="Enter new order number"
                />
                <p className="text-xs text-gray-500">
                  Lower numbers appear first. Documents with the same order are sorted by creation date.
                </p>
              </div>
            )}

            {operationType === 'DELETE' && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Warning:</strong> This will propose deletion of the document. If approved, the document and all its content will be permanently removed. This action cannot be undone.
                </AlertDescription>
              </Alert>
            )}

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this change should be made..."
                rows={3}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-6 border-t mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !operationType || (operationType === 'REORDER' && !newOrder)}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Creating...
                </>
              ) : (
                <>
                  Create Proposal
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
