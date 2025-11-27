import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Plus, X, FileText, Settings } from 'lucide-react';
import { Organization, OrganizationGovernanceRules } from '../../types';
import { documentsApi, governanceApi } from '../../lib/api';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

interface DocumentCreationModalProps {
  organization: Organization;
  governanceRules: OrganizationGovernanceRules | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  parentId?: string;
}

export function DocumentCreationModal({
  organization,
  governanceRules,
  isOpen,
  onClose,
  onSuccess,
  parentId
}: DocumentCreationModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Document options with governance rule defaults
  const [acceptanceThreshold, setAcceptanceThreshold] = useState(75);
  const [votingAnonymous, setVotingAnonymous] = useState(false);
  const [votingAnonymityLocked, setVotingAnonymityLocked] = useState(false);
  const [voteChangeAllowed, setVoteChangeAllowed] = useState(true);
  const [structureProposalsEnabled, setStructureProposalsEnabled] = useState(true);

  // Load governance rules when modal opens
  useEffect(() => {
    if (isOpen && governanceRules) {
      // Initialize with organization's governance rules
      setAcceptanceThreshold(governanceRules.defaultAcceptanceThreshold || 75);
      setVotingAnonymous(governanceRules.anonymousVotingEnabled ?? false);
      setVoteChangeAllowed(governanceRules.voteChangeAllowed ?? true);
      setStructureProposalsEnabled(true); // Default to enabled
    } else if (isOpen && !governanceRules) {
      // Fallback defaults if no governance rules
      setAcceptanceThreshold(75);
      setVotingAnonymous(false);
      setVoteChangeAllowed(true);
      setStructureProposalsEnabled(true);
    }
  }, [isOpen, governanceRules]);

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
          acceptanceThreshold,
          votingAnonymous,
          votingAnonymityLocked,
          voteChangeAllowed,
          structureProposalsEnabled,
          parentId: parentId
        },
        'organizational',
        organization.id
      );

      toast.success('Document created successfully!');
      onSuccess();
      handleClose();
    } catch (error: unknown) {
      console.error('Failed to create document:', error);
      if (error instanceof Error && 'details' in error) {
        console.error('Error details:', (error as { details?: unknown }).details);
      }
      const errorMessage = error.details 
        ? `Validation failed: ${JSON.stringify(error.details)}`
        : (error.message || 'Failed to create document. Please try again.');
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setAcceptanceThreshold(75);
    setVotingAnonymous(false);
    setVotingAnonymityLocked(false);
    setVoteChangeAllowed(true);
    setStructureProposalsEnabled(true);
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

            {/* Document Options */}
            <Card className="border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Document Options
                </CardTitle>
                <CardDescription>
                  These settings are determined by your organization's governance rules and cannot be changed. They ensure consistency across all organizational documents.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Acceptance Threshold */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="acceptance-threshold" className="text-sm font-medium">
                      Acceptance Threshold
                    </Label>
                    <span className="text-sm text-gray-600">{acceptanceThreshold}%</span>
                  </div>
                  <Slider
                    id="acceptance-threshold"
                    min={1}
                    max={100}
                    step={1}
                    value={[acceptanceThreshold]}
                    onValueChange={(value) => setAcceptanceThreshold(value[0])}
                    className="w-full"
                    disabled={true}
                  />
                  <p className="text-xs text-gray-500">
                    Percentage of PRO votes required for proposals to be automatically accepted (set by organization governance rules)
                  </p>
                </div>

                {/* Voting Anonymity */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Voting Anonymity</Label>
                  <RadioGroup
                    value={votingAnonymous ? 'anonymous' : 'public'}
                    onValueChange={(value) => setVotingAnonymous(value === 'anonymous')}
                    className="flex flex-col space-y-2"
                    disabled={true}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="public" id="public-voting" />
                      <Label htmlFor="public-voting" className="text-sm">
                        Public Voting - Everyone can see who voted what
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="anonymous" id="anonymous-voting" />
                      <Label htmlFor="anonymous-voting" className="text-sm">
                        Anonymous Voting - Only vote counts are visible
                      </Label>
                    </div>
                  </RadioGroup>
                  <p className="text-xs text-gray-600 italic">
                    Set by organization governance rules
                  </p>
                </div>

                {/* Vote Flexibility */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Vote Flexibility</Label>
                  <RadioGroup
                    value={voteChangeAllowed ? 'flexible' : 'locked'}
                    onValueChange={(value) => setVoteChangeAllowed(value === 'flexible')}
                    className="flex flex-col space-y-2"
                    disabled={true}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="flexible" id="flexible-votes" />
                      <Label htmlFor="flexible-votes" className="text-sm">
                        Flexible - Users can change their votes anytime
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="locked" id="locked-votes" />
                      <Label htmlFor="locked-votes" className="text-sm">
                        Locked - Users cannot change votes after casting
                      </Label>
                    </div>
                  </RadioGroup>
                  <p className="text-xs text-gray-600 italic">
                    Set by organization governance rules
                  </p>
                </div>

                {/* Structure Proposals */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="structure-proposals" className="text-sm font-medium">
                      Allow Structure Proposals
                    </Label>
                    <p className="text-xs text-gray-500">
                      Members can propose changes to document structure and organization
                    </p>
                  </div>
                  <Switch
                    id="structure-proposals"
                    checked={structureProposalsEnabled}
                    onCheckedChange={setStructureProposalsEnabled}
                    disabled={true}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Organization Info */}
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Organizational Document
                </h4>
                <p className="text-sm text-blue-700 mb-2">
                  This document will be owned by the entire organization and will use the governance rules established in the Governance tab. All document settings are automatically set from these rules and cannot be customized per document.
                </p>
                <div className="text-xs text-blue-600 space-y-1">
                  <p>• All active organization members will be included as collaborators</p>
                  <p>• Document will be created in proposal status and require member voting for approval</p>
                  {parentId && <p>• Document will be created as a child of the selected parent document</p>}
                  <p>• Settings are determined by organization governance rules and cannot be customized</p>
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
