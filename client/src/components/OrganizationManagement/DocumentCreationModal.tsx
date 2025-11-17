import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Plus, X, FileText } from 'lucide-react';
import { Organization } from '../../types';
import { documentsApi } from '../../lib/api';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface DocumentCreationModalProps {
  organization: Organization;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  parentId?: string;
}

export function DocumentCreationModal({
  organization,
  isOpen,
  onClose,
  onSuccess,
  parentId
}: DocumentCreationModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Please enter a document title');
      return;
    }

    setIsSubmitting(true);
    try {
      await documentsApi.createDocument(
        title.trim(),
        description.trim() || undefined,
        undefined, // contributors - org members are auto-included
        {
          acceptanceThreshold: organization.votingThreshold * 100, // Convert to percentage
          votingAnonymous: false,
          votingAnonymityLocked: false,
          voteChangeAllowed: true,
          structureProposalsEnabled: true,
          parentId: parentId
        },
        'organizational',
        organization.id
      );

      toast.success('Document created successfully!');
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Failed to create document:', error);
      toast.error(error.message || 'Failed to create document. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Document
          </DialogTitle>
          <DialogDescription>
            Create a new organizational document. It will start as a proposal and require voting approval from organization members before becoming active.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* Document Title */}
            <div className="space-y-2">
              <Label htmlFor="document-title">Document Title *</Label>
              <Input
                id="document-title"
                placeholder="Enter document title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-white"
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="document-description">Description (Optional)</Label>
              <Textarea
                id="document-description"
                placeholder="Brief description of what this organizational document will contain"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="bg-white"
              />
            </div>

            {/* Organization Info */}
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Organizational Document
                </h4>
                <p className="text-sm text-blue-700 mb-2">
                  This document will be owned by the entire organization and follow the governance rules established in the Governance tab.
                </p>
                <div className="text-xs text-blue-600 space-y-1">
                  <p>• All active organization members will be included as collaborators</p>
                  <p>• Voting settings will use the organization's governance configuration</p>
                  <p>• Document will be created in proposal status and require member voting for approval</p>
                  {parentId && <p>• Document will be created as a child of the selected parent document</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-6 border-t mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Document
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
