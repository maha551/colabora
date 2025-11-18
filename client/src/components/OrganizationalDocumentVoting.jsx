/**
 * Organizational Document Voting Interface
 * Displays voting status and allows users to cast votes on organizational documents
 */

import React, { useState, useEffect } from 'react';
import { documentsApi } from '../lib/api';
import { formatDistanceToNow, format } from 'date-fns';

function OrganizationalDocumentVoting({ document, user, onVoteCast }) {
  const [votingData, setVotingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [castingVote, setCastingVote] = useState(false);

  useEffect(() => {
    loadVotingData();
  }, [document.id]);

  const loadVotingData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await documentsApi.getVotingStatus(document.id);
      setVotingData(data);
    } catch (err) {
      console.error('Error loading voting data:', err);
      setError('Failed to load voting information');
    } finally {
      setLoading(false);
    }
  };

  const castVote = async (voteType) => {
    if (castingVote) return;

    try {
      setCastingVote(true);
      setError(null);

      // Cast the vote using existing API
      await documentsApi.castVote(document.id, voteType);

      // Reload voting data to show updated results
      await loadVotingData();

      // Notify parent component
      if (onVoteCast) {
        onVoteCast(voteType);
      }
    } catch (err) {
      console.error('Error casting vote:', err);
      setError('Failed to cast vote. Please try again.');
    } finally {
      setCastingVote(false);
    }
  };

  const getStatusInfo = () => {
    if (!votingData) return null;

    const { document: doc, voting } = votingData;

    switch (doc.status) {
      case 'proposal':
        return {
          icon: '⏳',
          title: 'Proposal Period',
          description: doc.proposalDeadline
            ? `Voting starts ${formatDistanceToNow(new Date(doc.proposalDeadline), { addSuffix: true })}`
            : 'Awaiting voting period',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50'
        };
      case 'voting':
        return {
          icon: '🗳️',
          title: 'Voting in Progress',
          description: doc.votingDeadline
            ? `Ends ${formatDistanceToNow(new Date(doc.votingDeadline), { addSuffix: true })}`
            : 'Voting period active',
          color: 'text-green-600',
          bgColor: 'bg-green-50'
        };
      case 'agreed':
        return {
          icon: '✅',
          title: 'Approved',
          description: 'Document has been approved by the organization',
          color: 'text-green-600',
          bgColor: 'bg-green-50'
        };
      case 'rejected':
        return {
          icon: '❌',
          title: 'Rejected',
          description: 'Document was not approved',
          color: 'text-red-600',
          bgColor: 'bg-red-50'
        };
      case 'expired':
        return {
          icon: '⏰',
          title: 'Expired',
          description: 'Proposal period ended without sufficient activity',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50'
        };
      default:
        return {
          icon: '📝',
          title: 'Draft',
          description: 'Document is being prepared',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50'
        };
    }
  };

  const getProgressPercentage = () => {
    if (!votingData) return 0;

    const { voting } = votingData;
    const totalEligible = voting.totalEligibleVoters || 1;
    return Math.min((voting.totalVotes / totalEligible) * 100, 100);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2 mb-6"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="text-red-600 text-sm mb-4">{error}</div>
        <button
          onClick={loadVotingData}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!votingData) return null;

  const { document: doc, voting } = votingData;
  const statusInfo = getStatusInfo();
  const progressPercentage = getProgressPercentage();

  return (
    <div className="bg-white rounded-lg border shadow-sm">
      {/* Status Header */}
      <div className={`p-4 border-b ${statusInfo.bgColor}`}>
        <div className="flex items-center space-x-3">
          <span className="text-2xl">{statusInfo.icon}</span>
          <div>
            <h3 className={`font-semibold ${statusInfo.color}`}>
              {statusInfo.title}
            </h3>
            <p className="text-sm text-gray-600">{statusInfo.description}</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Organization Info */}
        {doc.organizationName && (
          <div className="mb-4">
            <span className="text-sm text-gray-500">Organization:</span>
            <span className="ml-2 font-medium">{doc.organizationName}</span>
          </div>
        )}

        {/* Voting Statistics */}
        {doc.status === 'voting' && (
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Participation</span>
              <span>{voting.totalVotes} / {voting.totalEligibleVoters} voters</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{Math.round(progressPercentage)}% participation</span>
              <span>
                {voting.quorumMet ? '✅' : '❌'} Quorum: {voting.totalVotes >= voting.quorumRequired ? 'Met' : 'Required'}
              </span>
            </div>
          </div>
        )}

        {/* Vote Breakdown */}
        {doc.status === 'voting' && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Current Votes</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl mb-1">👍</div>
                <div className="text-lg font-bold text-green-600">{voting.voteBreakdown.PRO}</div>
                <div className="text-xs text-gray-500">Approve</div>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-1">🤔</div>
                <div className="text-lg font-bold text-yellow-600">{voting.voteBreakdown.NEUTRAL}</div>
                <div className="text-xs text-gray-500">Neutral</div>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-1">👎</div>
                <div className="text-lg font-bold text-red-600">{voting.voteBreakdown.CONTRA}</div>
                <div className="text-xs text-gray-500">Reject</div>
              </div>
            </div>

            {voting.totalVotes > 0 && (
              <div className="mt-3 text-center">
                <span className="text-sm text-gray-600">
                  Approval Rate: <span className="font-medium">{voting.approvalRate}%</span>
                  {doc.acceptanceThreshold && (
                    <span className="ml-1">
                      (Threshold: {doc.acceptanceThreshold}%)
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Voting Interface */}
        {doc.status === 'voting' && voting.canVote && (
          <div className="border-t pt-6">
            <h4 className="text-sm font-medium text-gray-700 mb-4">Cast Your Vote</h4>

            {voting.userVote && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-blue-700">
                    Your current vote: <span className="font-medium">{voting.userVote}</span>
                  </span>
                  {!doc.voteChangeAllowed && (
                    <span className="text-xs text-blue-600">(Vote locked)</span>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => castVote('PRO')}
                disabled={castingVote || (voting.userVote === 'PRO' && !doc.voteChangeAllowed)}
                className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                  voting.userVote === 'PRO'
                    ? 'bg-green-100 text-green-800 border-2 border-green-300'
                    : 'bg-white border-2 border-gray-200 text-gray-700 hover:bg-green-50 hover:border-green-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {castingVote ? '...' : '👍 Approve'}
              </button>

              <button
                onClick={() => castVote('NEUTRAL')}
                disabled={castingVote || (voting.userVote === 'NEUTRAL' && !doc.voteChangeAllowed)}
                className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                  voting.userVote === 'NEUTRAL'
                    ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-300'
                    : 'bg-white border-2 border-gray-200 text-gray-700 hover:bg-yellow-50 hover:border-yellow-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {castingVote ? '...' : '🤔 Neutral'}
              </button>

              <button
                onClick={() => castVote('CONTRA')}
                disabled={castingVote || (voting.userVote === 'CONTRA' && !doc.voteChangeAllowed)}
                className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                  voting.userVote === 'CONTRA'
                    ? 'bg-red-100 text-red-800 border-2 border-red-300'
                    : 'bg-white border-2 border-gray-200 text-gray-700 hover:bg-red-50 hover:border-red-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {castingVote ? '...' : '👎 Reject'}
              </button>
            </div>

            <div className="mt-3 text-xs text-gray-500 text-center">
              {doc.votingAnonymous ? 'Votes are anonymous' : 'Votes are visible to organization members'}
            </div>
          </div>
        )}

        {/* Final Status */}
        {(doc.status === 'agreed' || doc.status === 'rejected' || doc.status === 'expired') && (
          <div className="border-t pt-6">
            <div className={`p-4 rounded-lg ${doc.status === 'agreed' ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center space-x-2">
                <span className="text-lg">{statusInfo.icon}</span>
                <div>
                  <div className={`font-medium ${doc.status === 'agreed' ? 'text-green-800' : 'text-red-800'}`}>
                    {doc.status === 'agreed' ? 'Document Approved' : 'Document Rejected'}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Final voting results: {voting.voteBreakdown.PRO} approve, {voting.voteBreakdown.NEUTRAL} neutral, {voting.voteBreakdown.CONTRA} reject
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OrganizationalDocumentVoting;
