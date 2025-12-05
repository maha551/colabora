import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Vote, ArrowRight, Settings, MessageSquare } from 'lucide-react';
import { Organization, RepresentativeElection, OrganizationGovernanceRules, Document, User } from '../../../types';
import { OrganizationPermissions } from '../../../hooks/useOrganizationPermissions';
import { governanceApi } from '../../../lib/api';
import { formatDistanceToNow } from 'date-fns';

interface DashboardTabProps {
  organization: Organization;
  currentUser: User;
  permissions: OrganizationPermissions;
  elections: RepresentativeElection[];
  governanceRules: OrganizationGovernanceRules | null;
  documents?: Document[];
  onCreateElection: () => void;
  onNavigateToDocuments?: () => void;
  onNavigateToMembers?: () => void;
  onNavigateToGovernance?: () => void;
}

interface RuleProposal {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'active' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  createdBy: {
    id: string;
    name: string;
  };
  votingDeadline?: string;
}

export function DashboardTab({
  organization,
  currentUser,
  permissions,
  elections,
  governanceRules,
  documents = [],
  onCreateElection,
  onNavigateToDocuments,
  onNavigateToMembers,
  onNavigateToGovernance
}: DashboardTabProps) {
  const [ruleProposals, setRuleProposals] = useState<RuleProposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRuleProposals();
  }, [organization.id]);

  const loadRuleProposals = async () => {
    try {
      setLoading(true);
      const response = await governanceApi.ruleProposalsApi.getRuleProposals(organization.id);
      setRuleProposals((response.ruleProposals || []) as unknown as RuleProposal[]);
    } catch (error) {
      console.error('Failed to load rule proposals:', error);
    } finally {
      setLoading(false);
    }
  };

  // Open votes on document rules (active rule proposals)
  const activeRuleProposals = ruleProposals.filter(p => p.status === 'active');

  // Documents in voting phase
  const votingDocuments = documents.filter(d => d.status === 'voting');

  // Most discussed paragraphs (from documents with most proposals/comments)
  const mostDiscussedParagraphs = documents
    .flatMap(doc => 
      (doc.paragraphs || []).map(para => ({
        documentId: doc.id,
        documentTitle: doc.title,
        paragraphId: para.id,
        paragraphText: para.text.substring(0, 100),
        proposalCount: para.proposals?.length || 0,
        commentCount: para.proposals?.reduce((sum, p) => sum + (p.comments?.length || 0), 0) || 0,
        totalActivity: (para.proposals?.length || 0) + (para.proposals?.reduce((sum, p) => sum + (p.comments?.length || 0), 0) || 0)
      }))
    )
    .sort((a, b) => b.totalActivity - a.totalActivity)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Organization Header */}
      <div>
        <h1 className="text-3xl font-bold">{organization.name}</h1>
        {organization.description && (
          <p className="text-gray-600 mt-2">{organization.description}</p>
        )}
      </div>

      {/* Open Votes on Document Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Open Votes on Document Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeRuleProposals.length > 0 ? (
            <div className="space-y-3">
              {activeRuleProposals.map(proposal => (
                <div key={proposal.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-medium">{proposal.title}</h4>
                    <p className="text-sm text-gray-600">
                      Proposed by {proposal.createdBy.name}
                      {proposal.votingDeadline && (
                        <span> • Ends {formatDistanceToNow(new Date(proposal.votingDeadline), { addSuffix: true })}</span>
                      )}
                    </p>
                  </div>
                  {onNavigateToGovernance && (
                    <Button size="sm" variant="outline" onClick={onNavigateToGovernance}>
                      Vote
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">No active rule proposals</p>
              <p className="text-sm text-gray-500 mb-4">
                There are currently no active votes on document rules. Rule proposals will appear here when they're open for voting.
              </p>
              {onNavigateToGovernance && (
                <Button variant="outline" size="sm" onClick={onNavigateToGovernance}>
                  View Governance
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents in Voting Phase */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5" />
            Documents in Voting Phase
          </CardTitle>
        </CardHeader>
        <CardContent>
          {votingDocuments.length > 0 ? (
            <div className="space-y-3">
              {votingDocuments.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-medium">{doc.title}</h4>
                    <p className="text-sm text-gray-600">
                      {doc.documentVotes?.length || 0} votes cast
                      {doc.votingDeadline && (
                        <span> • Ends {formatDistanceToNow(new Date(doc.votingDeadline), { addSuffix: true })}</span>
                      )}
                    </p>
                  </div>
                  {onNavigateToDocuments && (
                    <Button size="sm" variant="outline" onClick={() => onNavigateToDocuments()}>
                      View
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Vote className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">No documents in voting phase</p>
              <p className="text-sm text-gray-500 mb-4">
                Documents that are currently open for voting will appear here. Once a document enters the voting phase, members can cast their votes.
              </p>
              {onNavigateToDocuments && (
                <Button variant="outline" size="sm" onClick={() => onNavigateToDocuments()}>
                  View Documents
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Most Discussed Paragraphs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Most Discussed Paragraphs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mostDiscussedParagraphs.length > 0 ? (
            <div className="space-y-3">
              {mostDiscussedParagraphs.map((item, index) => (
                <div key={`${item.documentId}-${item.paragraphId}`} className="p-3 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          #{index + 1}
                        </Badge>
                        <span className="text-sm font-medium text-gray-700">{item.documentTitle}</span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{item.paragraphText}...</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        <span>{item.proposalCount} proposals</span>
                        <span>•</span>
                        <span>{item.commentCount} comments</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">No discussions yet</p>
              <p className="text-sm text-gray-500">
                Paragraphs with the most proposals and comments will appear here. Start engaging with documents to see activity.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overall Empty State - Only show if all sections are empty */}
      {activeRuleProposals.length === 0 && 
       votingDocuments.length === 0 && 
       mostDiscussedParagraphs.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-gray-500">
            <p>No active votes or discussions at the moment</p>
            <p className="text-sm mt-2">Check back later for updates</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
