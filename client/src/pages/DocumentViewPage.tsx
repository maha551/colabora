import React, { useState } from 'react';
import { Document } from '../types';
import { DocumentEditor } from '../components/DocumentEditor';
import { AgreedDocument } from '../components/AgreedDocument';
import { StructureHistory } from '../components/StructureHistory';
import { CollaboratorManagement } from '../components/CollaboratorManagement';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Users, FileText, Edit3, Clock, CheckCircle2 } from 'lucide-react';
import { StructureProposalCard } from '../components/StructureProposalCard';
import { StructureProposalMode } from '../components/StructureProposalMode';
import { StructureProposal } from '../types';
import { toast } from 'sonner';

interface DocumentViewPageProps {
  document: Document;
  totalUsers: number;
  currentUser: any;
  documentLoadKey: number;
  structureProposals: StructureProposal[];
  showStructureProposalMode: boolean;
  onAddSuggestion: (
    paragraphId: string,
    data: {
      text: string;
      type?: 'BODY' | 'TITLE';
      headingLevel?: any;
    }
  ) => Promise<void>;
  onVote: (suggestionId: string, voteType: 'PRO' | 'NEUTRAL' | 'CONTRA') => Promise<void>;
  onComment: (suggestionId: string, text: string, parentId?: string) => Promise<void>;
  onAddElement: (
    elementType: any,
    options?: {
      text?: string;
      title?: string;
      headingLevel?: any;
      order?: number;
    }
  ) => Promise<void>;
  onCollaboratorAdded: (user: any) => Promise<void>;
  onCollaboratorRemoved: (userId: string) => Promise<void>;
  onShareDocument: () => void;
  onApplyStructureProposal: (proposalId: string) => Promise<void>;
  onCreateStructureProposal: () => void;
  onCloseStructureProposalMode: () => void;
  refreshStructureProposals: () => void;
}

export function DocumentViewPage({
  document,
  totalUsers,
  currentUser,
  documentLoadKey,
  structureProposals,
  showStructureProposalMode,
  onAddSuggestion,
  onVote,
  onComment,
  onAddElement,
  onCollaboratorAdded,
  onCollaboratorRemoved,
  onShareDocument,
  onApplyStructureProposal,
  onCreateStructureProposal,
  onCloseStructureProposalMode,
  refreshStructureProposals,
}: DocumentViewPageProps) {
  const [activeTab, setActiveTab] = useState<'discussion' | 'agreed' | 'history'>('discussion');

  const totalSuggestions = document?.paragraphs?.reduce(
    (sum, p) => sum + (p.proposals?.length || 0),
    0
  ) || 0;

  const acceptedSuggestions = document?.paragraphs?.reduce((sum, p) => {
    return sum + (p.proposals?.filter((s) => s.approved).length || 0);
  }, 0) || 0;

  return (
    <>
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Centered workspace description */}
        {document?.description && (
          <div className="text-center mb-6">
            <p className="text-sm text-gray-600">{document.description}</p>
          </div>
        )}

        {/* Share button */}
        <div className="text-center mb-6">
          <Button
            onClick={onShareDocument}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
            </svg>
            Share Document
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "discussion" | "agreed" | "history")}>
          <div className="flex justify-center mb-6 px-4">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="discussion" className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm" aria-label={`Draft tab with ${totalSuggestions} proposals`}>
                <Edit3 className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />
                <span className="sm:hidden" aria-hidden="true">Draft</span>
                <span className="hidden sm:inline" aria-hidden="true">Draft</span>
                {totalSuggestions > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs" aria-label={`${totalSuggestions} proposals`}>
                    {totalSuggestions}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="agreed" className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm" aria-label={`Final tab with ${acceptedSuggestions} approved paragraphs`}>
                <FileText className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />
                <span className="sm:hidden" aria-hidden="true">Final</span>
                <span className="hidden sm:inline" aria-hidden="true">Final</span>
                {acceptedSuggestions > 0 && (
                  <Badge variant="default" className="ml-1 bg-green-600 text-xs" aria-label={`${acceptedSuggestions} approved paragraphs`}>
                    {acceptedSuggestions}
                  </Badge>
                )}
              </TabsTrigger>
              {document?.structureProposalsEnabled && (
                <TabsTrigger value="history" className="gap-1 sm:gap-2 flex-1 sm:flex-none text-xs sm:text-sm" aria-label="Document structure history">
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />
                  <span className="sm:hidden" aria-hidden="true">Hist</span>
                  <span className="hidden sm:inline" aria-hidden="true">History</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Document Status - Only show in agreed view */}
          {activeTab === 'agreed' && (
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Last updated: {new Date(document.updatedAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  {document.paragraphs.filter(p => !p.isDocumentTitle && (p.title || p.text) && (p.title || p.text).trim() !== '').length} sections agreed upon ({document.paragraphs.filter(p => p.history && p.history.length > 0).length} modified)
                </span>
              </div>
            </div>
          )}

          {/* Collaborators Display */}
          <div className="flex justify-center mb-8">
            <CollaboratorManagement
              document={document}
              currentUser={currentUser}
              onCollaboratorAdded={onCollaboratorAdded}
              onCollaboratorRemoved={onCollaboratorRemoved}
            >
              <div className="flex items-center gap-2 sm:gap-3 text-sm text-gray-600 cursor-pointer hover:text-gray-900 transition-colors">
                <Users className="h-4 w-4" />
                <div className="flex items-center -space-x-1 sm:-space-x-2">
                  {/* Owner */}
                  <Avatar className="h-6 w-6 sm:h-8 sm:w-8 border-2 border-white">
                    <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                      {document.owner.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  {/* Collaborators */}
                  {document.collaborators.slice(0, 3).map((collaborator) => (
                    <Avatar key={collaborator.id} className="h-6 w-6 sm:h-8 sm:w-8 border-2 border-white">
                      <AvatarFallback className="text-xs bg-gray-200 text-gray-700">
                        {collaborator.user.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {document.collaborators.length > 3 && (
                    <Avatar className="h-6 w-6 sm:h-8 sm:w-8 border-2 border-white">
                      <AvatarFallback className="text-xs bg-gray-200 text-gray-700">
                        +{document.collaborators.length - 3}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
                <span className="font-medium text-xs sm:text-sm">
                  {(document.collaborators.length || 0) + 1} collab{(document.collaborators.length || 0) + 1 !== 1 ? 's' : ''}
                </span>
              </div>
            </CollaboratorManagement>
          </div>

          <TabsContent value="discussion" className="mt-0">
            <DocumentEditor
              key={documentLoadKey}
              document={document}
              totalUsers={totalUsers}
              currentUser={currentUser}
              onAddSuggestion={onAddSuggestion}
              onVote={onVote}
              onComment={onComment}
              onAddElement={onAddElement}
            />
          </TabsContent>

          <TabsContent value="agreed" className="mt-0">
            <AgreedDocument
              document={document}
              totalUsers={totalUsers}
            />
          </TabsContent>

          {document?.structureProposalsEnabled && (
            <TabsContent value="history" className="mt-0">
              <StructureHistory
                documentId={document.id}
                currentUserId={currentUser.id}
              />
            </TabsContent>
          )}
        </Tabs>

        {/* Structure Proposals Section - Moved to end of document */}
        {document?.structureProposalsEnabled && (
          <div className="mt-12 pt-8 border-t">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">🏗️ Structure Proposals</h2>
                {structureProposals.length > 0 && (
                  <Badge variant="secondary" className="text-sm">
                    {structureProposals.length}
                  </Badge>
                )}
              </div>
              <Button
                onClick={onCreateStructureProposal}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                🧩 Propose restructuring
              </Button>
            </div>

            {structureProposals.length > 0 ? (
              <div className="space-y-4">
                {structureProposals.map((proposal) => (
                  <StructureProposalCard
                    key={proposal.id}
                    structureProposal={proposal}
                    documentId={document.id}
                    currentUserId={currentUser.id}
                    onVote={refreshStructureProposals}
                    onApply={() => onApplyStructureProposal(proposal.id)}
                    canApply={document.ownerId === currentUser.id}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <div className="text-5xl mb-3">🏗️</div>
                <p className="text-base font-medium mb-1">No structure proposals yet.</p>
                <p className="text-sm">Use "Propose restructuring" to suggest major document changes.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Structure Proposal Mode */}
      {showStructureProposalMode && (
        <StructureProposalMode
          documentId={document.id}
          paragraphs={document.paragraphs}
          onClose={onCloseStructureProposalMode}
          onSuccess={() => {
            onCloseStructureProposalMode();
            refreshStructureProposals();
          }}
        />
      )}
    </>
  );
}
