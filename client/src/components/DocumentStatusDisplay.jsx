/**
 * Document Status Display Component
 * Shows current status and timeline for organizational documents
 */

import React from 'react';
import { formatDistanceToNow, format } from 'date-fns';

function DocumentStatusDisplay({ document, compact = false }) {
  const getStatusInfo = () => {
    if (!document) return null;

    switch (document.status) {
      case 'proposal':
        return {
          icon: '⏳',
          label: 'Proposal',
          description: document.proposal_deadline
            ? `Voting starts ${formatDistanceToNow(new Date(document.proposal_deadline), { addSuffix: true })}`
            : 'Awaiting voting period',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200'
        };
      case 'voting':
        return {
          icon: '🗳️',
          label: 'Voting',
          description: document.voting_deadline
            ? `Ends ${formatDistanceToNow(new Date(document.voting_deadline), { addSuffix: true })}`
            : 'Voting in progress',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200'
        };
      case 'agreed':
        return {
          icon: '✅',
          label: 'Approved',
          description: 'Document has been approved by the organization',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200'
        };
      case 'rejected':
        return {
          icon: '❌',
          label: 'Rejected',
          description: 'Document was not approved',
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200'
        };
      case 'expired':
        return {
          icon: '⏰',
          label: 'Expired',
          description: 'Proposal period ended without sufficient activity',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200'
        };
      default:
        return {
          icon: '📝',
          label: 'Draft',
          description: 'Document is being prepared',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200'
        };
    }
  };

  const statusInfo = getStatusInfo();
  if (!statusInfo) return null;

  if (compact) {
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusInfo.bgColor} ${statusInfo.color} ${statusInfo.borderColor} border`}>
        <span className="mr-1">{statusInfo.icon}</span>
        {statusInfo.label}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border p-4 ${statusInfo.bgColor} ${statusInfo.borderColor}`}>
      <div className="flex items-center space-x-3">
        <span className="text-xl">{statusInfo.icon}</span>
        <div className="flex-1">
          <div className={`font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {statusInfo.description}
          </div>
        </div>

        {/* Timeline info for organizational documents */}
        {document.ownership_type === 'organizational' && (
          <div className="text-right text-xs text-gray-500">
            {document.proposal_deadline && (
              <div>
                Proposed: {format(new Date(document.created_at), 'MMM d, yyyy')}
              </div>
            )}
            {document.voting_started_at && (
              <div>
                Voting started: {format(new Date(document.voting_started_at), 'MMM d, yyyy')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress indicator for voting status */}
      {document.status === 'voting' && document.min_voters_required && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Minimum voters required</span>
            <span>{document.min_voters_required}</span>
          </div>
          <div className="text-xs text-gray-500">
            Organization requires minimum participation for valid voting
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentStatusDisplay;
