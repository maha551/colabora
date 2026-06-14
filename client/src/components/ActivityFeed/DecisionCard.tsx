import React from 'react';

import { Document, Organization } from '../../types';

import { OrganizationAvatar } from '../shared/OrganizationAvatar';

import { resolveOrganizationAvatarData } from '../../utils/organizationUtils';

import { Button } from '../ui/button';

import { Icon } from '../ui/Icon';

import { cn } from '../ui/utils';

import type { DecisionEntry, DecisionKind } from '../../types/decisions';

import { RADIUS } from '../../lib/designSystem';

import {

  ParagraphChangeDecisionCard,

  RuleProposalDecisionCard,

  ElectionDecisionCard,

  OrganizationVoteDecisionCard,

  StructureProposalDecisionCard,

  TreeProposalDecisionCard,

  DocumentStatusDecisionCard,

  MeetingDecisionDecisionCard,

  DocumentDeletionDecisionCard,

} from './decisions';



interface DecisionCardProps {

  entry: DecisionEntry;

  onNavigateToDocument: (documentId: string) => void;

  onNavigateToOrganization?: (organizationId: string) => void;

  onNavigateToHash?: (hash: string) => void;

  isLast?: boolean;

  documents?: Document[];

  organizations?: Organization[];

  sourceHeaderVariant?: 'default' | 'prominent' | 'hidden';

}



const KIND_ICONS: Record<DecisionKind, string> = {

  paragraph_change: 'Edit3',

  rule_proposal: 'Shield',

  election: 'Vote',

  organization_vote: 'Vote',

  structure_proposal: 'Network',

  tree_proposal: 'Folder',

  document_status: 'FileText',

  meeting_decision: 'Video',

  document_deletion: 'Trash2',

};



export function DecisionCard({

  entry,

  onNavigateToDocument,

  onNavigateToOrganization,

  onNavigateToHash,

  isLast = false,

  documents = [],

  organizations = [],

  sourceHeaderVariant = 'default',

}: DecisionCardProps) {

  const doc = entry.documentId ? documents.find(d => d.id === entry.documentId) : null;

  const org = entry.organizationId

    ? organizations.find(o => o.id === entry.organizationId)

    : doc?.organizationId

      ? organizations.find(o => o.id === doc.organizationId)

      : null;

  const organizationBorderColor = org?.brandingColor ?? null;

  const organizationAvatarData = resolveOrganizationAvatarData(

    org,

    entry.organizationName || 'Organization'

  );



  const showTimelineSource = sourceHeaderVariant !== 'hidden';

  const hideContextLinks = showTimelineSource;

  const suppressContextDup = showTimelineSource;



  const isMeetingDecision = entry.kind === 'meeting_decision';

  const label = entry.documentTitle || entry.organizationName || 'Unknown';

  const isDocLevel = !!entry.documentId && !isMeetingDecision;

  const isOrgLevel = !isDocLevel && !isMeetingDecision && !!entry.organizationId;

  const meetingId = isMeetingDecision

    ? String((entry.payload as Record<string, unknown>)?.meetingId ?? '')

    : '';

  const meetingHash =

    isMeetingDecision && entry.organizationId && meetingId

      ? `#/organization/${entry.organizationId}/meetings/${meetingId}`

      : null;



  const renderContent = () => {

    switch (entry.kind) {

      case 'paragraph_change':

        return (

          <ParagraphChangeDecisionCard
            entry={entry}
            organizationBorderColor={organizationBorderColor}
            suppressContextDup={suppressContextDup}
          />

        );

      case 'rule_proposal':

        return (

          <RuleProposalDecisionCard

            entry={entry}

            onNavigateToOrganization={onNavigateToOrganization}

            organizationBorderColor={organizationBorderColor}

            organizationAvatarData={organizationAvatarData}

            hideContextLinks={hideContextLinks}

          />

        );

      case 'election':

        return (

          <ElectionDecisionCard

            entry={entry}

            onNavigateToOrganization={onNavigateToOrganization}

            organizationBorderColor={organizationBorderColor}

            organizationAvatarData={organizationAvatarData}

            hideContextLinks={hideContextLinks}

          />

        );

      case 'organization_vote':

        return (

          <OrganizationVoteDecisionCard

            entry={entry}

            onNavigateToDocument={entry.documentId ? onNavigateToDocument : undefined}

            onNavigateToOrganization={onNavigateToOrganization}

            organizationBorderColor={organizationBorderColor}

            organizationAvatarData={organizationAvatarData}

            hideContextLinks={hideContextLinks}

          />

        );

      case 'structure_proposal':

        return (

          <StructureProposalDecisionCard

            entry={entry}

            onNavigateToDocument={onNavigateToDocument}

            organizationBorderColor={organizationBorderColor}

            hideContextLinks={hideContextLinks}

          />

        );

      case 'tree_proposal':

        return (

          <TreeProposalDecisionCard

            entry={entry}

            onNavigateToDocument={onNavigateToDocument}

            organizationBorderColor={organizationBorderColor}

            hideContextLinks={hideContextLinks}

          />

        );

      case 'document_status':

        return (

          <DocumentStatusDecisionCard

            entry={entry}

            onNavigateToDocument={onNavigateToDocument}

            organizationBorderColor={organizationBorderColor}

            suppressContextDup={suppressContextDup}

          />

        );

      case 'meeting_decision':

        return (

          <MeetingDecisionDecisionCard

            entry={entry}

            onNavigateToDocument={onNavigateToDocument}

            onNavigateToOrganization={onNavigateToOrganization}

            onNavigateToHash={onNavigateToHash}

            organizationBorderColor={organizationBorderColor}

            organizationAvatarData={organizationAvatarData}

            hideContextLinks={hideContextLinks}

            suppressContextDup={suppressContextDup}

          />

        );

      case 'document_deletion':

        return (

          <DocumentDeletionDecisionCard

            entry={entry}

            onNavigateToOrganization={onNavigateToOrganization}

            organizationBorderColor={organizationBorderColor}

            organizationAvatarData={organizationAvatarData}

            hideContextLinks={hideContextLinks}

          />

        );

      default:

        return null;

    }

  };



  const sourceHeaderClassName =

    sourceHeaderVariant === 'prominent'

      ? 'mb-2 flex items-center gap-2 text-base font-bold text-foreground'

      : 'mb-2 flex items-center gap-2 text-sm font-semibold text-foreground';



  const kindIcon = KIND_ICONS[entry.kind] ?? 'Circle';



  return (

    <div className="relative flex gap-3">

      <div className="flex flex-col items-center self-stretch">

        <div className={cn('h-8 w-8 bg-muted flex items-center justify-center border border-border', RADIUS.pill)}>

          <Icon name={kindIcon} className="h-4 w-4 text-muted-foreground" />

        </div>

        {!isLast && (

          <div className="w-0.5 flex-1 bg-border/60 mt-2 min-h-[2rem]" />

        )}

      </div>



      <div className="flex-1 pb-4">

        {showTimelineSource && (

          <div className={sourceHeaderClassName}>

            {isMeetingDecision && meetingHash && onNavigateToHash ? (

              <Button

                variant="ghost"

                size="sm"

                onClick={() => onNavigateToHash(meetingHash)}

                className={

                  sourceHeaderVariant === 'prominent'

                    ? 'h-auto p-0 text-base font-bold text-foreground hover:text-primary'

                    : 'h-auto p-0 text-sm font-semibold text-foreground hover:text-primary'

                }

              >

                <Icon

                  name="Video"

                  className={sourceHeaderVariant === 'prominent' ? 'h-4 w-4 mr-1.5' : 'h-3 w-3 mr-1'}

                />

                {entry.documentTitle || label}

              </Button>

            ) : isDocLevel && entry.documentId ? (

              <Button

                variant="ghost"

                size="sm"

                onClick={() => onNavigateToDocument(entry.documentId!)}

                className={

                  sourceHeaderVariant === 'prominent'

                    ? 'h-auto p-0 text-base font-bold text-foreground hover:text-primary'

                    : 'h-auto p-0 text-sm font-semibold text-foreground hover:text-primary'

                }

              >

                <Icon

                  name="FileText"

                  className={sourceHeaderVariant === 'prominent' ? 'h-4 w-4 mr-1.5' : 'h-3 w-3 mr-1'}

                />

                {entry.documentTitle}

              </Button>

            ) : isOrgLevel && entry.organizationId && onNavigateToOrganization ? (

              <Button

                variant="ghost"

                size="sm"

                onClick={() => onNavigateToOrganization(entry.organizationId!)}

                className={

                  sourceHeaderVariant === 'prominent'

                    ? 'h-auto p-0 text-base font-bold text-foreground hover:text-primary'

                    : 'h-auto p-0 text-sm font-semibold text-foreground hover:text-primary'

                }

              >

                <Icon

                  name="Users"

                  className={sourceHeaderVariant === 'prominent' ? 'h-4 w-4 mr-1.5' : 'h-3 w-3 mr-1'}

                />

                {entry.organizationName || 'Organization'}

              </Button>

            ) : (

              <span className={sourceHeaderVariant === 'prominent' ? 'text-base font-bold' : 'text-sm font-semibold'}>

                {label}

              </span>

            )}

          </div>

        )}

        {renderContent()}

      </div>

    </div>

  );

}


