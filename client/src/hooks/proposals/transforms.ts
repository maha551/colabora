import type { BaseProposal, ProposalType } from '../../components/shared/proposalTypes';
import type { RuleProposal, StructureProposal, DocumentTreeProposal, Document } from '../../types';

export function transformRuleProposal(rp: RuleProposal, userId?: string): BaseProposal {
  const userVote = rp.votes?.find((v) => v.userId === userId);
  let voteChoice: 'PRO' | 'NEUTRAL' | 'CONTRA' | undefined;
  if (userVote) {
    if (userVote.voteChoice === 'yes' || userVote.voteChoice === 'PRO') voteChoice = 'PRO';
    else if (userVote.voteChoice === 'no' || userVote.voteChoice === 'CONTRA') voteChoice = 'CONTRA';
    else if (userVote.voteChoice === 'abstain' || userVote.voteChoice === 'NEUTRAL') voteChoice = 'NEUTRAL';
  }
  const proVotes =
    rp.votesYes ??
    rp.votesPro ??
    rp.votes?.filter((v) => v.voteChoice === 'yes' || v.voteChoice === 'PRO').length ??
    0;
  const contraVotes =
    rp.votesNo ??
    rp.votesContra ??
    rp.votes?.filter((v) => v.voteChoice === 'no' || v.voteChoice === 'CONTRA').length ??
    0;
  const neutralVotes =
    rp.votesAbstain ??
    rp.votesNeutral ??
    rp.votes?.filter((v) => v.voteChoice === 'abstain' || v.voteChoice === 'NEUTRAL').length ??
    0;
  const totalVotes = rp.votesCast ?? (proVotes + contraVotes + neutralVotes);

  return {
    id: rp.id,
    type: 'rule' as ProposalType,
    status: rp.status,
    createdAt: rp.createdAt,
    deadline: rp.votingEndsAt || rp.votingDeadline,
    title: rp.title,
    description: rp.description,
    organizationId: rp.organizationId,
    createdBy: rp.createdBy,
    userVote: voteChoice,
    votes: { pro: proVotes, contra: contraVotes, neutral: neutralVotes, total: totalVotes },
    approvalPercentage: rp.approvalPercentage,
    quorumMet: rp.quorumMet,
    calculationMethod: rp.calculationMethod,
  };
}

export function transformStructureProposal(sp: StructureProposal, userId?: string): BaseProposal {
  const userVote = sp.votes?.find((v) => v.userId === userId);
  const proVotes = sp.votes?.filter((v) => v.vote === 'PRO').length ?? 0;
  const contraVotes = sp.votes?.filter((v) => v.vote === 'CONTRA').length ?? 0;
  const neutralVotes = sp.votes?.filter((v) => v.vote === 'NEUTRAL').length ?? 0;
  const totalVotes = sp.votes?.length ?? 0;
  return {
    id: sp.id,
    type: 'structure' as ProposalType,
    status: sp.applied ? 'applied' : sp.approved ? 'approved' : 'pending',
    createdAt: sp.createdAt,
    deadline: sp.votingDeadline ?? (sp as { voting_deadline?: string }).voting_deadline ?? undefined,
    title: sp.title,
    description: sp.description,
    documentId: sp.documentId,
    createdBy: sp.user,
    userVote: userVote?.vote,
    votes: { pro: proVotes, contra: contraVotes, neutral: neutralVotes, total: totalVotes },
  };
}

export function transformTreeProposal(tp: DocumentTreeProposal, userId?: string): BaseProposal {
  const userVote = tp.votes?.find((v) => v.userId === userId);
  const proVotes = tp.voteCounts?.pro ?? tp.votes?.filter((v) => v.vote === 'PRO').length ?? 0;
  const contraVotes = tp.voteCounts?.contra ?? tp.votes?.filter((v) => v.vote === 'CONTRA').length ?? 0;
  const neutralVotes = tp.voteCounts?.neutral ?? tp.votes?.filter((v) => v.vote === 'NEUTRAL').length ?? 0;
  const totalVotes = proVotes + contraVotes + neutralVotes;
  return {
    id: tp.id,
    type: 'tree' as ProposalType,
    status: tp.status,
    createdAt: tp.createdAt,
    deadline: tp.votingDeadline ?? (tp as { voting_deadline?: string }).voting_deadline ?? undefined,
    title: `Tree ${tp.operationType}: ${tp.reason || 'No reason provided'}`,
    description: tp.reason,
    documentId: tp.documentId,
    organizationId: tp.organizationId,
    createdBy: tp.proposedByName
      ? { id: tp.proposedByUserId, name: tp.proposedByName, email: tp.proposedByEmail }
      : undefined,
    userVote: userVote?.vote,
    votes: { pro: proVotes, contra: contraVotes, neutral: neutralVotes, total: totalVotes },
  };
}

export function transformDeletionProposal(doc: Document, userId?: string): BaseProposal | null {
  if (!doc.deletionProposedAt) return null;
  const userVote = doc.documentVotes?.find((v) => v.userId === userId);
  const proVotes = doc.documentVotes?.filter((v) => v.vote === 'PRO').length ?? 0;
  const contraVotes = doc.documentVotes?.filter((v) => v.vote === 'CONTRA').length ?? 0;
  const neutralVotes = doc.documentVotes?.filter((v) => v.vote === 'NEUTRAL').length ?? 0;
  const totalVotes = doc.documentVotes?.length ?? 0;
  return {
    id: `deletion-${doc.id}`,
    type: 'deletion' as ProposalType,
    status: doc.status === 'voting' ? 'active' : 'pending',
    createdAt: doc.deletionProposedAt,
    deadline: doc.deletionVoteDeadline,
    title: `Delete: ${doc.title}`,
    description: `Proposed deletion of document "${doc.title}"`,
    documentId: doc.id,
    organizationId: doc.organizationId,
    createdBy: doc.deletionProposedBy ? { id: doc.deletionProposedBy, name: 'Unknown' } : undefined,
    userVote: userVote?.vote,
    votes: { pro: proVotes, contra: contraVotes, neutral: neutralVotes, total: totalVotes },
  };
}
