import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { Icon } from '../ui/Icon';
import { Document, DocumentTreeOperationType } from '../../types';
import { documentTreeProposalsApi } from '../../lib/api';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import { RADIUS } from '../../lib/designSystem';
import { cn } from '../ui/utils';
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
  const { t } = useTranslation(['documents', 'common']);
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
  const MAX_SORT_ORDER = 10000;
  const currentSortOrder = document.sortOrder ?? null;
  const siblingCount = documents.filter((d) => d.parentId === document.parentId).length;
  const reorderValue = newOrder.trim();
  const reorderNumber = reorderValue === '' ? null : Number(reorderValue);
  const isReorderInteger = reorderNumber !== null && Number.isInteger(reorderNumber);
  const isReorderInRange = reorderNumber !== null && reorderNumber >= 0 && reorderNumber <= MAX_SORT_ORDER;
  const isReorderNoOp = reorderNumber !== null && currentSortOrder !== null && reorderNumber === currentSortOrder;
  const reorderError =
    operationType !== 'REORDER'
      ? null
      : reorderValue === ''
        ? t('treeProposal.reorderErrors.enterValue')
        : !isReorderInteger
          ? t('treeProposal.reorderErrors.wholeNumber')
          : !isReorderInRange
            ? t('treeProposal.reorderErrors.inRange', { max: MAX_SORT_ORDER })
            : isReorderNoOp
              ? t('treeProposal.reorderErrors.noOp')
              : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!operationType) {
      toast.error(t('treeProposal.toasts.selectOperation'));
      return;
    }

    if (operationType === 'MOVE' && targetParentId === '') {
      // Allow empty string for root level
      // But we need to check if it's explicitly set
    }

    if (operationType === 'REORDER' && reorderError) {
      toast.error(reorderError);
      return;
    }

    setIsSubmitting(true);
    try {
      await documentTreeProposalsApi.createProposal({
        documentId: document.id,
        operationType,
        targetParentId: operationType === 'MOVE' ? (targetParentId || undefined) : undefined,
        newOrder: operationType === 'REORDER' && reorderNumber !== null ? reorderNumber : undefined,
        reason: reason.trim() || undefined,
      });

      toast.success(t('treeProposal.toasts.created'));
      onSuccess();
      onClose();
    } catch (error: unknown) {
      logger.error('Failed to create tree proposal:', error);
      const errorMessage = error instanceof Error ? error.message : t('treeProposal.toasts.failed');
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getOperationDescription = () => {
    switch (operationType) {
      case 'MOVE':
        return t('treeProposal.operationDescriptions.move');
      case 'DELETE':
        return t('treeProposal.operationDescriptions.delete');
      case 'REORDER':
        return t('treeProposal.operationDescriptions.reorder');
      default:
        return t('treeProposal.operationDescriptions.default');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="Move" className="h-5 w-5" />
            {t('treeProposal.title')}
          </DialogTitle>
          <DialogDescription>
            {t('treeProposal.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* Current Document Info */}
            <div className={cn("p-3 bg-muted", RADIUS.panel)}>
              <Label className="text-sm text-muted-foreground mb-1">{t('treeProposal.currentDocument')}</Label>
              <p className="font-medium">{document.title}</p>
              {document.parentId && (
                <p className="text-sm text-muted-foreground mt-1">
                  {t('treeProposal.currentParent', {
                    title: documents.find(d => d.id === document.parentId)?.title || t('treeProposal.unknownParent'),
                  })}
                </p>
              )}
            </div>

            {/* Operation Type Selection */}
            <div className="space-y-2">
              <Label htmlFor="operation-type">{t('treeProposal.operationType')}</Label>
              <Select
                value={operationType}
                onValueChange={(value) => setOperationType(value as DocumentTreeOperationType)}
              >
                <SelectTrigger id="operation-type">
                  <SelectValue placeholder={t('treeProposal.selectOperationType')} />
                </SelectTrigger>
                <SelectContent className="z-[200]" sideOffset={4}>
                  <SelectItem value="MOVE">
                    <div className="flex items-center gap-2">
                      <Icon name="Move" className="h-4 w-4" />
                      {t('treeProposal.operations.move')}
                    </div>
                  </SelectItem>
                  <SelectItem value="DELETE">
                    <div className="flex items-center gap-2">
                      <Icon name="Trash2" className="h-4 w-4" />
                      {t('treeProposal.operations.delete')}
                    </div>
                  </SelectItem>
                  <SelectItem value="REORDER">
                    <div className="flex items-center gap-2">
                      <Icon name="ArrowUpDown" className="h-4 w-4" />
                      {t('treeProposal.operations.reorder')}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{getOperationDescription()}</p>
            </div>

            {/* Operation-specific fields */}
            {operationType === 'MOVE' && (
              <div className="space-y-2">
                <Label htmlFor="target-parent">{t('treeProposal.targetParent')}</Label>
                <Select value={targetParentId} onValueChange={setTargetParentId}>
                  <SelectTrigger id="target-parent">
                    <SelectValue placeholder={t('treeProposal.selectParent')} />
                  </SelectTrigger>
                  <SelectContent className="z-[200]" sideOffset={4}>
                    <SelectItem value="">{t('treeProposal.rootLevel')}</SelectItem>
                    {availableParents.map((parent) => (
                      <SelectItem key={parent.id} value={parent.id}>
                        {parent.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableParents.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('treeProposal.noParentsAvailable')}
                  </p>
                )}
              </div>
            )}

            {operationType === 'REORDER' && (
              <div className="space-y-2">
                <Label htmlFor="new-order">{t('treeProposal.newOrder')}</Label>
                <Input
                  id="new-order"
                  type="number"
                  min="0"
                  max={MAX_SORT_ORDER}
                  step="1"
                  value={newOrder}
                  onChange={(e) => setNewOrder(e.target.value)}
                  placeholder={t('treeProposal.enterOrderNumber')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('treeProposal.reorderHint', {
                    count: siblingCount,
                    current: currentSortOrder ?? t('treeProposal.reorderNotSet'),
                  })}
                </p>
                {reorderError && (
                  <p className="text-xs text-destructive">{reorderError}</p>
                )}
              </div>
            )}

            {operationType === 'DELETE' && (
              <Alert>
                <Icon name="AlertTriangle" className="h-4 w-4" />
                <AlertDescription>
                  <strong>{t('treeProposal.deleteWarning')}</strong> {t('treeProposal.deleteWarningBody')}
                </AlertDescription>
              </Alert>
            )}

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">{t('treeProposal.reason')}</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('treeProposal.reasonPlaceholder')}
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
              {t('common:buttons.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !operationType || (operationType === 'REORDER' && !!reorderError)}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className={cn("animate-spin h-4 w-4 border-b-2 border-white", RADIUS.pill)}></div>
                  {t('treeProposal.creating')}
                </>
              ) : (
                <>
                  {t('treeProposal.createProposal')}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
