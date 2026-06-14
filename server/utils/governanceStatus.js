/**
 * Governance rule proposal status transitions and status metadata.
 * Used by GovernanceService and routes; no dependency on route files.
 */

const VALID_STATUS_TRANSITIONS = {
  'draft': ['active'],
  'active': ['approved', 'rejected', 'expired'],
  'approved': ['implemented'],
  'rejected': [],
  'expired': [],
  'implemented': []
};

function validateStatusTransition(currentStatus, newStatus) {
  if (!currentStatus || !newStatus) {
    return {
      valid: false,
      error: 'Status is required',
      details: { currentStatus, newStatus }
    };
  }

  const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus.toLowerCase()] || [];
  const isValid = allowedTransitions.includes(newStatus.toLowerCase());

  if (!isValid) {
    return {
      valid: false,
      error: `Invalid status transition from ${currentStatus} to ${newStatus}`,
      details: {
        currentStatus,
        newStatus,
        allowedTransitions,
        message: `Cannot transition from "${currentStatus}" to "${newStatus}". Allowed transitions: ${allowedTransitions.join(', ')}`
      }
    };
  }

  return { valid: true };
}

function getStatusInfo(status) {
  const statusInfo = {
    'draft': {
      label: 'Draft',
      description: 'Proposal is being prepared and has not started voting',
      canEdit: true,
      canStartVoting: true,
      canVote: false,
      color: 'gray'
    },
    'active': {
      label: 'Active',
      description: 'Voting is currently open for this proposal',
      canEdit: false,
      canStartVoting: false,
      canVote: true,
      color: 'blue'
    },
    'approved': {
      label: 'Approved',
      description: 'Proposal has been approved by voters',
      canEdit: false,
      canStartVoting: false,
      canVote: false,
      canImplement: true,
      color: 'green'
    },
    'rejected': {
      label: 'Rejected',
      description: 'Proposal was rejected by voters',
      canEdit: false,
      canStartVoting: false,
      canVote: false,
      color: 'red'
    },
    'expired': {
      label: 'Expired',
      description: 'Voting deadline has passed without reaching threshold',
      canEdit: false,
      canStartVoting: false,
      canVote: false,
      color: 'orange'
    },
    'implemented': {
      label: 'Implemented',
      description: 'Proposal has been implemented and rule change is active',
      canEdit: false,
      canStartVoting: false,
      canVote: false,
      color: 'purple'
    }
  };

  return statusInfo[status?.toLowerCase()] || {
    label: status || 'Unknown',
    description: 'Unknown status',
    canEdit: false,
    canStartVoting: false,
    canVote: false,
    color: 'gray'
  };
}

module.exports = {
  VALID_STATUS_TRANSITIONS,
  validateStatusTransition,
  getStatusInfo
};
