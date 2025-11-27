/**
 * Organizational Document Status Component
 * Displays document status, deadlines, and workflow information
 */

import React from 'react';
import { Document } from '../types';
import { formatDistanceToNow, format } from 'date-fns';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Clock, CheckCircle2, XCircle, Hourglass, FileText, AlertCircle } from 'lucide-react';

interface OrganizationalDocumentStatusProps {
  document: Document;
}

export function OrganizationalDocumentStatus({ document }: OrganizationalDocumentStatusProps) {
  if (!document || document.ownershipType !== 'organizational') {
    return null;
  }

  // Safety check - return null if document is missing required fields
  if (!document.id) {
    return null;
  }

  const getStatusInfo = () => {
    switch (document.status) {
      case 'proposal':
        return {
          icon: <Hourglass className="h-5 w-5" />,
          label: 'Proposal Period',
          color: 'bg-blue-100 text-blue-800 border-blue-200',
          description: 'Document is in proposal phase. Members can submit proposals.',
          deadline: document.proposalDeadline
        };
      case 'voting':
        return {
          icon: <FileText className="h-5 w-5" />,
          label: 'Voting Period',
          color: 'bg-green-100 text-green-800 border-green-200',
          description: 'Document is being voted on by organization members.',
          deadline: document.votingDeadline
        };
      case 'agreed':
        return {
          icon: <CheckCircle2 className="h-5 w-5" />,
          label: 'Approved',
          color: 'bg-green-100 text-green-800 border-green-200',
          description: 'Document has been approved by the organization.',
          deadline: null
        };
      case 'rejected':
        return {
          icon: <XCircle className="h-5 w-5" />,
          label: 'Rejected',
          color: 'bg-red-100 text-red-800 border-red-200',
          description: 'Document was not approved by the organization.',
          deadline: null
        };
      case 'expired':
        return {
          icon: <AlertCircle className="h-5 w-5" />,
          label: 'Expired',
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          description: 'Proposal period ended without sufficient activity.',
          deadline: null
        };
      default:
        return {
          icon: <FileText className="h-5 w-5" />,
          label: 'Draft',
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          description: 'Document is being prepared.',
          deadline: null
        };
    }
  };

  const statusInfo = getStatusInfo();
  const now = new Date();
  
  // Check if proposal cutoff has passed
  const proposalCutoffPassed = document.paragraphProposalsCutoff 
    ? new Date(document.paragraphProposalsCutoff) < now
    : false;

  // Check if deadline is approaching (within 24 hours)
  const deadlineApproaching = statusInfo.deadline 
    ? new Date(statusInfo.deadline).getTime() - now.getTime() < 24 * 60 * 60 * 1000
    : false;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <div className={`p-2 rounded-lg ${statusInfo.color}`}>
            {statusInfo.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <Badge variant="outline" className={statusInfo.color}>
                {statusInfo.label}
              </Badge>
              {proposalCutoffPassed && document.status === 'proposal' && (
                <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
                  Proposals Locked
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {statusInfo.description}
            </p>
            
            {statusInfo.deadline && (
              <div className="flex items-center space-x-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className={deadlineApproaching ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
                  {deadlineApproaching ? 'Deadline approaching: ' : 'Deadline: '}
                  {format(new Date(statusInfo.deadline), 'MMM d, yyyy HH:mm')}
                  {' '}
                  ({formatDistanceToNow(new Date(statusInfo.deadline), { addSuffix: true })})
                </span>
              </div>
            )}

            {document.paragraphProposalsCutoff && document.status === 'proposal' && (
              <div className="flex items-center space-x-2 text-sm mt-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className={proposalCutoffPassed ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
                  Proposal cutoff: {format(new Date(document.paragraphProposalsCutoff), 'MMM d, yyyy HH:mm')}
                  {proposalCutoffPassed && ' (Passed - new proposals disabled)'}
                </span>
              </div>
            )}

            {document.votingStartedAt && (
              <div className="flex items-center space-x-2 text-sm mt-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Voting started: {format(new Date(document.votingStartedAt), 'MMM d, yyyy HH:mm')}
                </span>
              </div>
            )}

            {document.adoptedAt && (
              <div className="flex items-center space-x-2 text-sm mt-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-muted-foreground">
                  Adopted: {format(new Date(document.adoptedAt), 'MMM d, yyyy HH:mm')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

