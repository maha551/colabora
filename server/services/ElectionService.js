/**
 * ElectionService - representative elections lifecycle.
 * Extracted from server/routes/governance.js (WP3).
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const TransactionManager = require('../database/services/TransactionManager');
const { logger } = require('../middleware/logger');
const { ApiError } = require('../middleware/errorHandler');
const { isActiveMember, isRepresentative } = require('../modules/permissions');
const { broadcastOrganizationUpdate } = require('../utils/websocketBroadcast');
const votingLockManager = require('../utils/votingLocks');
const voteVerificationLog = require('../utils/voteVerificationLog');
const { logAudit } = require('../utils/auditLog');
const { generateAnonymousToken } = require('../utils/anonymousToken');
const { computeVoteHash } = require('../utils/voteReceipt');
const { extractField } = require('../utils/fieldExtractor');

const GovernanceRulesService = require('./governance/GovernanceRulesService');

function getGovernanceRulesForOrg(db, organizationId) {
  return GovernanceRulesService.getGovernanceRules(db, organizationId);
}

function normalizeElectionVoteInput(body, votingMethod) {
  const candidateRanking = extractField(body, 'candidateRanking', 'candidate_ranking', []);
  const approvedCandidates = extractField(body, 'approvedCandidates', 'approved_candidates', []);
  const candidateId = extractField(body, 'candidateId', 'candidate_id');
  if (votingMethod === 'ranked_choice') {
    const ranking = Array.isArray(candidateRanking) ? candidateRanking : [];
    return ranking.filter(Boolean);
  }
  if (votingMethod === 'approval') {
    const approved = Array.isArray(approvedCandidates)
      ? approvedCandidates
      : (Array.isArray(candidateRanking) ? candidateRanking : []);
    return approved.filter(Boolean);
  }
  const id = candidateId || (Array.isArray(candidateRanking) ? candidateRanking[0] : null);
  return id ? [id] : [];
}

function parseElectionVoteChoice(voteChoice, votingMethod) {
  if (voteChoice == null || voteChoice === '') return null;
  if (votingMethod === 'ranked_choice') {
    try {
      const ranking = JSON.parse(voteChoice);
      return { candidateRanking: Array.isArray(ranking) ? ranking.filter(Boolean) : [voteChoice] };
    } catch {
      return { candidateRanking: [voteChoice] };
    }
  }
  if (votingMethod === 'approval') {
    try {
      const approved = JSON.parse(voteChoice);
      return { approvedCandidates: Array.isArray(approved) ? approved.filter(Boolean) : [voteChoice] };
    } catch {
      return { approvedCandidates: [voteChoice] };
    }
  }
  return { candidateId: voteChoice };
}

function hashVote(voteData) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(voteData));
  return hash.digest('hex');
}

async function createVoterTokensForElection(db, electionId, organizationId, createdBy) {
  const members = await TransactionManager.queryAll(db,
    'SELECT user_id FROM organization_members WHERE organization_id = ? AND status = ? AND user_id NOT IN (SELECT id FROM organizations)',
    [organizationId, 'active']);

  if (members.length === 0) return;

  const sessionId = uuidv4();
  await TransactionManager.query(db, `INSERT INTO voting_sessions (
    id, organization_id, session_type, related_entity_id, title, description,
    status, anonymous_voting, created_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    sessionId, organizationId, 'election', electionId, 'Representative Election',
    'Vote for organization representatives', 'active', 1, createdBy
  ]);

  const tokenInserts = members.map(async (member) => {
    const tokenId = uuidv4();
    const anonymousToken = generateAnonymousToken();
    await TransactionManager.query(db, `INSERT INTO voter_tokens (
      id, voting_session_id, user_id, anonymous_token
    ) VALUES (?, ?, ?, ?)`, [tokenId, sessionId, member.user_id, anonymousToken]);
  });
  await Promise.all(tokenInserts);
}

async function getElectionResults(db, organizationId, electionId) {
  const election = await TransactionManager.query(db, `
    SELECT re.*, COUNT(ec.id) as candidate_count
    FROM representative_elections re
    LEFT JOIN election_candidates ec ON re.id = ec.election_id
    WHERE re.id = ? AND re.organization_id = ?
    GROUP BY re.id
  `, [electionId, organizationId]);

  if (!election) throw ApiError.notFound('Election');

  const candidates = await TransactionManager.queryAll(db, `
    SELECT ec.*, u.name as user_name, u.email as user_email
    FROM election_candidates ec
    LEFT JOIN users u ON ec.user_id = u.id
    WHERE ec.election_id = ?
    ORDER BY ec.votes_received DESC, ec.nominated_at ASC
  `, [electionId]);

  const totalVotes = candidates.reduce((sum, c) => sum + (c.votes_received || 0), 0);
  const quorumPercentage = election.quorum_required > 0 ? (election.votes_cast / election.quorum_required) * 100 : 0;

  return {
    election,
    candidates,
    stats: {
      totalVotes,
      votesCast: election.votes_cast || 0,
      quorumRequired: election.quorum_required || 0,
      quorumPercentage,
      quorumReached: (election.votes_cast || 0) >= (election.quorum_required || 0),
      positionsAvailable: election.positions_available || 1
    }
  };
}

async function getUserVoteStatus(db, organizationId, electionId, userId) {
  const election = await TransactionManager.query(db, `
    SELECT id, status, anonymous_voting
    FROM representative_elections
    WHERE id = ? AND organization_id = ?
  `, [electionId, organizationId]);

  if (!election) throw ApiError.notFound('Election not found');

  const rules = await TransactionManager.query(db,
    'SELECT election_voting_method FROM organization_governance_rules WHERE organization_id = ?',
    [organizationId]);
  const votingMethod = rules?.election_voting_method || 'simple_majority';
  const isAnonymous = election.anonymous_voting === 1 || election.anonymous_voting === true;

  if (isAnonymous) {
    const tokenRow = await TransactionManager.query(db,
      'SELECT vt.anonymous_token, vs.id as session_id FROM voter_tokens vt JOIN voting_sessions vs ON vt.voting_session_id = vs.id WHERE vt.user_id = ? AND vs.related_entity_id = ? AND vs.session_type = ?',
      [userId, electionId, 'election']);
    if (!tokenRow) return { hasVoted: false, voteData: null };

    const ballot = await TransactionManager.query(db,
      'SELECT vote_choice FROM anonymous_vote_ballots WHERE voting_session_id = ? AND voter_token = ?',
      [tokenRow.session_id, tokenRow.anonymous_token]);
    if (!ballot) return { hasVoted: false, voteData: null };

    return { hasVoted: true, voteData: parseElectionVoteChoice(ballot.vote_choice, votingMethod) };
  }

  const userVotes = await TransactionManager.queryAll(db, `
    SELECT ev.id, ev.candidate_id, ev.vote_rank, ec.user_id as candidate_user_id
    FROM election_votes ev
    LEFT JOIN election_candidates ec ON ev.candidate_id = ec.id
    WHERE ev.election_id = ? AND ev.user_id = ?
    ORDER BY ev.vote_rank ASC, ev.created_at ASC
  `, [electionId, userId]);

  const hasVoted = userVotes && userVotes.length > 0;
  let voteData = null;
  if (hasVoted) {
    if (votingMethod === 'ranked_choice') {
      voteData = {
        candidateRanking: userVotes
          .sort((a, b) => (a.vote_rank || 0) - (b.vote_rank || 0))
          .map(v => v.candidate_id)
          .filter(id => id)
      };
    } else if (votingMethod === 'approval') {
      voteData = { approvedCandidates: userVotes.map(v => v.candidate_id).filter(id => id) };
    } else {
      voteData = { candidateId: userVotes[0]?.candidate_id || null };
    }
  }
  return { hasVoted, voteData };
}

async function listElections(db, organizationId) {
  const elections = await TransactionManager.queryAll(db, `
    SELECT re.*, u.name as created_by_name
    FROM representative_elections re
    LEFT JOIN users u ON re.created_by = u.id
    WHERE re.organization_id = ?
    ORDER BY re.created_at DESC
  `, [organizationId]);

  const electionIds = (elections || []).map(e => e.id).filter(id => id != null);
  const candidatesMap = {};
  if (electionIds.length === 0) return { elections: [] };

  const placeholders = electionIds.map(() => '?').join(',');
  const candidates = await TransactionManager.queryAll(db, `
    SELECT ec.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar, nb.name as nominated_by_name
    FROM election_candidates ec
    LEFT JOIN users u ON ec.user_id = u.id
    LEFT JOIN users nb ON ec.nominated_by = nb.id
    WHERE ec.election_id IN (${placeholders})
    ORDER BY ec.created_at ASC
  `, electionIds);

  candidates.forEach(candidate => {
    if (!candidatesMap[candidate.election_id]) candidatesMap[candidate.election_id] = [];
    candidatesMap[candidate.election_id].push({
      id: candidate.id,
      electionId: candidate.election_id,
      userId: candidate.user_id,
      candidateStatement: candidate.candidate_statement,
      acceptedNomination: candidate.accepted_nomination === true || candidate.accepted_nomination === true,
      nominatedBy: candidate.nominated_by,
      nominatedByName: candidate.nominated_by_name,
      nominationAcceptedAt: candidate.nomination_accepted_at,
      votesReceived: candidate.votes_received || 0,
      elected: candidate.elected === true || candidate.elected === true,
      electedPosition: candidate.elected_position,
      createdAt: candidate.created_at,
      updatedAt: candidate.updated_at,
      user: {
        id: candidate.user_id,
        name: candidate.user_name,
        email: candidate.user_email,
        avatar: candidate.user_avatar
      }
    });
  });

  let votingSessionByElection = {};
  try {
    const sessionRows = await TransactionManager.queryAll(db, `
      SELECT id, related_entity_id
      FROM voting_sessions
      WHERE related_entity_id IN (${electionIds.map(() => '?').join(',')}) AND session_type = 'election'
    `, electionIds);
    (sessionRows || []).forEach(row => {
      if (row.related_entity_id) votingSessionByElection[row.related_entity_id] = row.id;
    });
  } catch (sessionErr) {
    logger.debug('Could not fetch voting sessions for elections', { error: sessionErr.message });
  }

  const mappedElections = (elections || []).map(election => {
    let status = election.status;
    if (status === 'nomination') status = 'announced';
    else if (status === 'voting') status = 'active';
    return {
      id: election.id,
      organizationId: election.organization_id,
      electionTitle: election.election_title,
      electionDescription: election.election_description,
      status,
      positionsAvailable: election.positions_available,
      termStartDate: election.term_start_date,
      termEndDate: election.term_end_date,
      nominationStartsAt: election.nomination_starts_at,
      nominationEndsAt: election.nomination_ends_at,
      votingStartsAt: election.voting_starts_at,
      votingEndsAt: election.voting_ends_at,
      quorumRequired: election.quorum_required || 0,
      totalVoters: election.total_voters || 0,
      votesCast: election.votes_cast || 0,
      quorumMet: election.quorum_met === true || election.quorum_met === true,
      anonymousVoting: election.anonymous_voting === 1 || election.anonymous_voting === true,
      electionCompletedAt: election.election_completed_at,
      createdBy: election.created_by,
      createdByName: election.created_by_name,
      createdAt: election.created_at,
      updatedAt: election.updated_at,
      candidates: candidatesMap[election.id] || [],
      votingSessionId: votingSessionByElection[election.id] || null
    };
  });
  return { elections: mappedElections };
}

async function createElection(db, organizationId, userId, body, auditContext = {}) {
  const title = extractField(body, 'title', 'title');
  const description = extractField(body, 'description', 'description');
  const positionsAvailable = extractField(body, 'positionsAvailable', 'positions_available');
  const termMonths = extractField(body, 'termMonths', 'term_months');
  const rules = await getGovernanceRulesForOrg(db, organizationId);
  if (!rules) throw ApiError.validation('Organization governance rules not configured');
  if (!title || String(title).trim().length === 0) {
    throw ApiError.validation('Election title is required');
  }
  if (!positionsAvailable || Number(positionsAvailable) <= 0) {
    throw ApiError.validation('positionsAvailable must be greater than 0');
  }

  const electionId = uuidv4();
  const now = new Date();
  const termEndDate = new Date(now);
  termEndDate.setMonth(termEndDate.getMonth() + (termMonths || rules.representative_term_months));

  const memberCountRow = await TransactionManager.query(db,
    'SELECT COUNT(*) as memberCount FROM organization_members WHERE organization_id = ? AND status = ?',
    [organizationId, 'active']);
  const memberCount = Number(memberCountRow?.memberCount ?? memberCountRow?.membercount ?? 0) || 0;
  const quorumPercentage = Number(rules.election_quorum_percentage ?? 0);
  const quorumRequired = Math.ceil(memberCount * quorumPercentage);

  await TransactionManager.query(db, `INSERT INTO representative_elections (
    id, organization_id, election_title, election_description,
    positions_available, term_end_date, quorum_required,
    anonymous_voting, created_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    electionId, organizationId, title, description,
    positionsAvailable, termEndDate.toISOString(), quorumRequired,
    rules.anonymous_voting_enabled ? 1 : 0, userId
  ]);

  await logAudit(db, organizationId, 'election_created', userId, null, {
    electionId, title, positionsAvailable, termMonths
  }, auditContext);

  broadcastOrganizationUpdate(organizationId, 'election-created', {
    organizationId, electionId, title, positionsAvailable, status: 'draft'
  });

  try {
    const notificationService = require('../modules/notifications');
    const config = require('../config');
    const frontendUrl = config.FRONTEND_URL || 'http://localhost:3001';
    const members = await TransactionManager.queryAll(db, `
      SELECT u.id as user_id FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = ? AND om.status = 'active' AND om.user_id NOT IN (SELECT id FROM organizations)
    `, [organizationId]);
    if (members && members.length > 0) {
      const { extractUserIds } = require('../utils/memberUtils');
      const userIds = extractUserIds(members);
      const orgResult = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
      const orgRow = (orgResult?.rows && orgResult.rows[0]) || orgResult?.[0] || null;
      const eventData = {
        title: `New Election: ${title}`,
        message: `A new election "${title}" was created for ${positionsAvailable} position(s)`,
        link: require('../emails/urls').orgTab(organizationId, 'governance'),
        organizationName: orgRow?.name
      };
      await notificationService.notifyUsers(db, userIds, 'election_created', eventData, false);
    }
  } catch (error) {
    logger.error('Error queueing election creation for digest', { error: error.message, electionId });
  }

  return {
    election: {
      id: electionId,
      title,
      description,
      positionsAvailable,
      termEndDate: termEndDate.toISOString(),
      quorumRequired,
      anonymousVoting: rules.anonymous_voting_enabled,
      status: 'draft'
    }
  };
}

async function nominateCandidate(db, organizationId, electionId, userId, body) {
  const candidateUserId = extractField(body, 'candidateUserId', 'candidate_user_id');
  const nominationStatement = extractField(body, 'nominationStatement', 'nomination_statement');
  const isMember = await isActiveMember(db, userId, organizationId);
  if (!isMember) throw ApiError.forbidden('Only active members can nominate candidates');
  const isCandidateMember = await isActiveMember(db, candidateUserId, organizationId);
  if (!isCandidateMember) throw ApiError.validation('Candidate must be an active member');

  const election = await TransactionManager.query(db,
    'SELECT status FROM representative_elections WHERE id = ? AND organization_id = ?',
    [electionId, organizationId]);
  if (!election) throw ApiError.notFound('Election');
  if (election.status !== 'draft' && election.status !== 'nomination') {
    throw ApiError.validation('Cannot nominate candidates. Elections must be in draft or nomination phase.');
  }

  const candidateId = uuidv4();
  try {
    await TransactionManager.query(db, `INSERT INTO election_candidates (
      id, election_id, user_id, candidate_statement, nominated_by
    ) VALUES (?, ?, ?, ?, ?)`, [candidateId, electionId, candidateUserId, nominationStatement, userId]);
  } catch (err) {
    if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('duplicate key'))) {
      throw ApiError.validation('User is already nominated for this election');
    }
    logger.error('Error nominating candidate', { error: err.message, electionId, organizationId });
    throw ApiError.database('Failed to nominate candidate', { originalError: err.message });
  }
  return {
    candidate: {
      id: candidateId,
      userId: candidateUserId,
      statement: nominationStatement,
      nominatedBy: userId,
      acceptedNomination: false
    }
  };
}

async function acceptNomination(db, organizationId, electionId, candidateId, userId) {
  const candidate = await TransactionManager.query(db,
    'SELECT user_id FROM election_candidates WHERE id = ? AND election_id = ?', [candidateId, electionId]);
  if (!candidate) throw ApiError.notFound('Candidate');
  if (candidate.user_id !== userId) throw ApiError.forbidden('Can only accept your own nomination');

  await TransactionManager.query(db,
    'UPDATE election_candidates SET accepted_nomination = true, nomination_accepted_at = CURRENT_TIMESTAMP WHERE id = ?',
    [candidateId]);
  return { success: true, message: 'Nomination accepted successfully' };
}

async function startElection(db, organizationId, electionId, userId, body, auditContext = {}) {
  const votingStartDate = extractField(body, 'votingStartDate', 'voting_start_date');
  const votingEndDate = extractField(body, 'votingEndDate', 'voting_end_date');
  const election = await TransactionManager.query(db,
    'SELECT status, anonymous_voting FROM representative_elections WHERE id = ? AND organization_id = ?',
    [electionId, organizationId]);
  if (!election) throw ApiError.notFound('Election');
  if (election.status !== 'draft') throw ApiError.validation('Election is not in draft status');

  const startDate = votingStartDate ? new Date(votingStartDate) : new Date();
  const endDate = new Date(votingEndDate);
  if (endDate <= startDate) throw ApiError.validation('End date must be after start date');

  const memberCountRow = await TransactionManager.query(db,
    'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = ?',
    [organizationId, 'active']);
  const memberCount = memberCountRow?.count || 0;

  await TransactionManager.query(db, `UPDATE representative_elections SET
    status = 'voting',
    voting_starts_at = ?,
    voting_ends_at = ?,
    total_voters = ?,
    updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [startDate.toISOString(), endDate.toISOString(), memberCount, electionId]);

  const isAnonymous = election.anonymous_voting === 1 || election.anonymous_voting === true;
  if (isAnonymous) {
    try {
      await createVoterTokensForElection(db, electionId, organizationId, userId);
    } catch (tokenErr) {
      logger.error('Error creating voter tokens', { error: tokenErr.message, electionId });
    }
  }

  await logAudit(db, organizationId, 'election_started', userId, null, {
    electionId, startDate: startDate.toISOString(), endDate: endDate.toISOString()
  }, auditContext);

  broadcastOrganizationUpdate(organizationId, 'election-updated', {
    organizationId, electionId, oldPhase: 'draft', newPhase: 'voting', status: 'voting',
    votingStartsAt: startDate.toISOString(), votingEndsAt: endDate.toISOString()
  });

  try {
    const notificationService = require('../modules/notifications');
    const config = require('../config');
    const frontendUrl = config.FRONTEND_URL || 'http://localhost:3001';
    const electionTitleRow = await TransactionManager.query(db, 'SELECT election_title FROM representative_elections WHERE id = ?', [electionId]);
    if (electionTitleRow) {
      const members = await TransactionManager.queryAll(db, `
        SELECT u.id as user_id FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = ? AND om.status = 'active' AND om.user_id NOT IN (SELECT id FROM organizations)
      `, [organizationId]);
      if (members && members.length > 0) {
        const { extractUserIds } = require('../utils/memberUtils');
        const userIds = extractUserIds(members);
        const orgRow = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
        const eventData = {
          title: electionTitleRow.election_title || 'Election',
          votingDeadline: endDate.toISOString(),
          link: require('../emails/urls').orgTab(organizationId, 'governance'),
          organizationName: orgRow?.name,
          votingType: 'election'
        };
        await notificationService.notifyUsers(db, userIds, 'voting_started', eventData, true);
      }
    }
  } catch (error) {
    logger.error('Error sending election voting started notifications', { error: error.message, electionId });
  }

  return {
    success: true,
    message: 'Election started successfully',
    votingStartsAt: startDate.toISOString(),
    votingEndsAt: endDate.toISOString()
  };
}

async function castElectionVote(db, organizationId, electionId, userId, body) {
  const isMember = await isActiveMember(db, userId, organizationId);
  if (!isMember) throw ApiError.forbidden('Only active members can vote', 'NOT_ACTIVE_MEMBER');

  return await votingLockManager.withVoteLock('election', electionId, async () => {
    const election = await TransactionManager.query(db,
      'SELECT status, anonymous_voting FROM representative_elections WHERE id = ? AND organization_id = ?',
      [electionId, organizationId]);
    if (!election) throw ApiError.notFound('Election not found');
    if (election.status !== 'voting') throw ApiError.validation('Election is not currently active');

    const rules = await TransactionManager.query(db,
      'SELECT election_voting_method FROM organization_governance_rules WHERE organization_id = ?',
      [organizationId]);
    const votingMethod = rules?.election_voting_method || 'simple_majority';
    const isRankedChoice = votingMethod === 'ranked_choice';
    const isApproval = votingMethod === 'approval';
    const candidateIds = normalizeElectionVoteInput(body, votingMethod);
    if (candidateIds.length === 0) {
      throw ApiError.validation('No candidates selected', null, 'NO_CANDIDATES_SELECTED');
    }

    const validCandidates = await TransactionManager.queryAll(db,
      'SELECT id FROM election_candidates WHERE election_id = ? AND id IN (' + candidateIds.map(() => '?').join(',') + ')',
      [electionId, ...candidateIds]);
    if (validCandidates.length !== candidateIds.length) {
      throw ApiError.validation('Invalid candidate selection', null, 'INVALID_CANDIDATE');
    }

    const isAnonymous = election.anonymous_voting === 1 || election.anonymous_voting === true;

    if (isAnonymous) {
      const tokenRow = await TransactionManager.query(db,
        'SELECT vt.anonymous_token, vs.id as session_id FROM voter_tokens vt JOIN voting_sessions vs ON vt.voting_session_id = vs.id WHERE vt.user_id = ? AND vs.related_entity_id = ? AND vs.session_type = ?',
        [userId, electionId, 'election']);
      if (!tokenRow) throw ApiError.validation('Voting token not found', null, 'VOTING_TOKEN_NOT_FOUND');

      const existingVote = await TransactionManager.query(db,
        'SELECT id FROM anonymous_vote_ballots WHERE voting_session_id = ? AND voter_token = ?',
        [tokenRow.session_id, tokenRow.anonymous_token]);
      if (existingVote) throw ApiError.validation('You have already voted in this election', null, 'ALREADY_VOTED');

      const ballotId = uuidv4();
      const voteChoiceValue = isRankedChoice || isApproval
        ? JSON.stringify(candidateIds)
        : candidateIds[0];
      const voteData = {
        sessionId: tokenRow.session_id,
        token: tokenRow.anonymous_token,
        ranking: candidateIds,
        timestamp: new Date().toISOString()
      };
      const voteHash = hashVote(voteData);
      const voteRecordedAt = voteData.timestamp;

      await TransactionManager.executeInTransaction(db, async (txDb) => {
        await TransactionManager.execute(txDb, `INSERT INTO anonymous_vote_ballots (
          id, voting_session_id, voter_token, vote_choice, vote_hash, receipt_id
        ) VALUES (?, ?, ?, ?, ?, ?)`, [
          ballotId, tokenRow.session_id, tokenRow.anonymous_token, voteChoiceValue, voteHash, ballotId
        ]);
        await TransactionManager.execute(txDb,
          'UPDATE representative_elections SET votes_cast = votes_cast + 1 WHERE id = ?', [electionId]);
        if (!isRankedChoice) {
          for (const candidateId of candidateIds) {
            await TransactionManager.execute(txDb,
              'UPDATE election_candidates SET votes_received = votes_received + 1 WHERE id = ?', [candidateId]);
          }
        }
        await voteVerificationLog.appendLogEntry(txDb, {
          voteType: 'representative_election',
          contestId: tokenRow.session_id,
          choice: voteChoiceValue,
          timestamp: voteRecordedAt,
          receiptId: ballotId,
          voteHash
        });
      });

      return {
        success: true,
        message: 'Vote cast successfully',
        receiptId: ballotId,
        contestId: tokenRow.session_id,
        voteType: 'representative_election',
        voteRecordedAt,
        anonymousVoting: true
      };
    }

    const existingVote = await TransactionManager.query(db,
      'SELECT id FROM election_votes WHERE election_id = ? AND user_id = ? LIMIT 1',
      [electionId, userId]);
    if (existingVote) {
      throw ApiError.validation('You have already voted in this election', null, 'ALREADY_VOTED');
    }

    const ballotId = uuidv4();
    const voteRecordedAt = new Date().toISOString();
    const voteChoiceValue = isRankedChoice || isApproval
      ? JSON.stringify(candidateIds)
      : candidateIds[0];
    const voteHash = computeVoteHash('representative_election', {
      contestId: electionId,
      userId,
      choice: voteChoiceValue,
      timestamp: voteRecordedAt,
      receiptId: ballotId
    });

    await TransactionManager.executeInTransaction(db, async (txDb) => {
      if (isRankedChoice) {
        for (let rank = 0; rank < candidateIds.length; rank++) {
          await TransactionManager.execute(txDb, `INSERT INTO election_votes (
            id, election_id, candidate_id, user_id, vote_rank
          ) VALUES (?, ?, ?, ?, ?)`, [
            uuidv4(), electionId, candidateIds[rank], userId, rank + 1
          ]);
        }
      } else if (isApproval) {
        for (const candidateId of candidateIds) {
          await TransactionManager.execute(txDb, `INSERT INTO election_votes (
            id, election_id, candidate_id, user_id
          ) VALUES (?, ?, ?, ?)`, [uuidv4(), electionId, candidateId, userId]);
        }
      } else {
        await TransactionManager.execute(txDb, `INSERT INTO election_votes (
          id, election_id, candidate_id, user_id, vote_rank
        ) VALUES (?, ?, ?, ?, 1)`, [ballotId, electionId, candidateIds[0], userId]);
      }

      await TransactionManager.execute(txDb,
        'UPDATE representative_elections SET votes_cast = votes_cast + 1 WHERE id = ?', [electionId]);

      if (!isRankedChoice) {
        for (const candidateId of candidateIds) {
          await TransactionManager.execute(txDb,
            'UPDATE election_candidates SET votes_received = votes_received + 1 WHERE id = ?', [candidateId]);
        }
      }

      await voteVerificationLog.appendLogEntry(txDb, {
        voteType: 'representative_election',
        contestId: electionId,
        choice: voteChoiceValue,
        timestamp: voteRecordedAt,
        receiptId: ballotId,
        voteHash
      });
    });

    return {
      success: true,
      message: 'Vote cast successfully',
      ballotId,
      // Public (non-anonymous) votes are attributable and do not issue a verification receipt.
      contestId: electionId,
      voteType: 'representative_election',
      voteRecordedAt,
      anonymousVoting: false
    };
  });
}

async function updateElectionPhase(db, organizationId, electionId, userId, body, auditContext = {}) {
  const { newPhase } = body || {};
  const election = await TransactionManager.query(db, `SELECT id, organization_id, election_title, election_description, status, positions_available,
    term_start_date, term_end_date, nomination_starts_at, nomination_ends_at, voting_starts_at,
    voting_ends_at, quorum_required, anonymous_voting, total_voters, votes_cast, quorum_met,
    election_completed_at, created_by, trigger_type, triggered_by_term_id, auto_advance_phases,
    phase_transition_in_progress, created_at, updated_at
    FROM representative_elections WHERE id = ? AND organization_id = ?`, [electionId, organizationId]);
  if (!election) throw ApiError.notFound('Election');

  const now = new Date();
  let updates = { updated_at: now.toISOString() };

  if (newPhase === 'nomination') {
    if (election.status !== 'draft') throw ApiError.validation('Can only start nomination from draft status', null, 'INVALID_PHASE_TRANSITION');
    updates.status = 'nomination';
    updates.nomination_starts_at = now.toISOString();
    updates.nomination_ends_at = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (newPhase === 'voting') {
    if (election.status !== 'nomination') throw ApiError.validation('Can only start voting from nomination status', null, 'INVALID_PHASE_TRANSITION');
    const rules = await getGovernanceRulesForOrg(db, organizationId);
    const defaultVotingDays = rules?.default_voting_deadline_hours ? Math.ceil(rules.default_voting_deadline_hours / 24) : 7;
    const votingUpdates = {
      ...updates,
      status: 'voting',
      voting_starts_at: now.toISOString(),
      voting_ends_at: new Date(now.getTime() + defaultVotingDays * 24 * 60 * 60 * 1000).toISOString()
    };
    try {
      const memberCountRow = await TransactionManager.query(db, 'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = ?', [organizationId, 'active']);
      if (memberCountRow) votingUpdates.total_voters = memberCountRow.count;
    } catch (countErr) {
      logger.error('Error counting members for election', { error: countErr.message, organizationId });
    }
    const { validateFieldNames, getFieldWhitelist } = require('../utils/fieldValidation');
    const allowedFields = getFieldWhitelist('representative_elections');
    const updateFields = Object.keys(votingUpdates).filter(k => votingUpdates[k] !== undefined);
    validateFieldNames(updateFields, allowedFields);
    const setClause = updateFields.map(field => `${field} = ?`).join(', ');
    const updateValues = updateFields.map(f => votingUpdates[f]);
    await TransactionManager.query(db, `UPDATE representative_elections SET ${setClause} WHERE id = ?`, [...updateValues, electionId]);

    const isAnonymous = election.anonymous_voting === 1 || election.anonymous_voting === true;
    if (isAnonymous) {
      try {
        await createVoterTokensForElection(db, electionId, organizationId, userId);
      } catch (tokenErr) {
        logger.error('Error creating voter tokens', { error: tokenErr.message, electionId });
      }
    }
    await logAudit(db, organizationId, 'election_phase_updated', userId, null, { electionId, oldPhase: election.status, newPhase, updates: votingUpdates }, auditContext);
    broadcastOrganizationUpdate(organizationId, 'election-updated', { organizationId, electionId, oldPhase: election.status, newPhase, status: votingUpdates.status || election.status });
    try {
      const notificationService = require('../modules/notifications');
      const config = require('../config');
      const frontendUrl = config.FRONTEND_URL || 'http://localhost:3001';
      const members = await TransactionManager.queryAll(db, `
        SELECT u.id as user_id FROM organization_members om JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = ? AND om.status = 'active' AND om.user_id NOT IN (SELECT id FROM organizations)
      `, [organizationId]);
      if (members && members.length > 0) {
        const { extractUserIds } = require('../utils/memberUtils');
        const userIds = extractUserIds(members);
        const orgRow = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
        const eventData = {
          title: election.election_title || 'Election',
          votingDeadline: votingUpdates.voting_ends_at,
          link: require('../emails/urls').orgTab(organizationId, 'governance'),
          organizationName: orgRow?.name,
          votingType: 'election'
        };
        await notificationService.notifyUsers(db, userIds, 'voting_started', eventData, true);
      }
    } catch (error) {
      logger.error('Error sending election voting started notifications', { error: error.message, electionId });
    }
    return { success: true, message: `Election moved to ${newPhase} phase`, election: { ...election, ...votingUpdates } };
  } else if (newPhase === 'completed') {
    throw ApiError.validation('Use the /complete endpoint to finish elections', null, 'USE_COMPLETE_ENDPOINT');
  } else {
    throw ApiError.validation('Invalid phase transition', null, 'INVALID_PHASE_TRANSITION');
  }

  const { validateFieldNames, getFieldWhitelist } = require('../utils/fieldValidation');
  const allowedFields = getFieldWhitelist('representative_elections');
  const updateFields = Object.keys(updates);
  validateFieldNames(updateFields, allowedFields);
  const setClause = updateFields.map(field => `${field} = ?`).join(', ');
  const updateValues = Object.values(updates);
  await TransactionManager.query(db, `UPDATE representative_elections SET ${setClause} WHERE id = ?`, [...updateValues, electionId]);
  await logAudit(db, organizationId, 'election_phase_updated', userId, null, { electionId, oldPhase: election.status, newPhase, updates }, auditContext);
  broadcastOrganizationUpdate(organizationId, 'election-updated', { organizationId, electionId, oldPhase: election.status, newPhase, status: updates.status || election.status });
  return { success: true, message: `Election moved to ${newPhase} phase`, election: { ...election, ...updates } };
}

async function checkPhaseTransitions(db, organizationId) {
  const now = new Date().toISOString();
  const advancedElections = [];
  let electionsQuery = `
    SELECT id, status, nomination_ends_at, voting_ends_at, auto_advance_phases, phase_transition_in_progress, nomination_starts_at
    FROM representative_elections
    WHERE organization_id = ?
      AND auto_advance_phases = true
      AND phase_transition_in_progress = false
      AND status IN ('draft', 'nomination', 'voting')
      AND (
        (status = 'draft' AND nomination_starts_at <= ?)
        OR (status = 'nomination' AND nomination_ends_at <= ?)
        OR (status = 'voting' AND voting_ends_at <= ?)
      )
  `;
  const elections = await TransactionManager.queryAll(db, electionsQuery, [organizationId, now, now, now]);

  if (elections.length === 0) {
    return { success: true, message: 'No elections need phase transitions', advancedCount: 0 };
  }

  for (const election of elections) {
    try {
      const flagQuery = `UPDATE representative_elections SET phase_transition_in_progress = true WHERE id = ? AND phase_transition_in_progress = false`;
      await TransactionManager.execute(db, flagQuery, [election.id]);
      const checkElection = await TransactionManager.query(db, 'SELECT phase_transition_in_progress FROM representative_elections WHERE id = ?', [election.id]);
      const expectedValue = true;
      if (!checkElection || checkElection.phase_transition_in_progress !== expectedValue) continue;

      let newPhase = election.status;
      if (election.status === 'draft' && election.nomination_starts_at <= now) newPhase = 'nomination';
      else if (election.status === 'nomination' && election.nomination_ends_at <= now) newPhase = 'voting';

      if (newPhase !== election.status) {
        try {
          const updateQuery = `UPDATE representative_elections SET status = ?, phase_transition_in_progress = false, updated_at = ? WHERE id = ?`;
          await TransactionManager.execute(db, updateQuery, [newPhase, now, election.id]);
          advancedElections.push({ electionId: election.id, oldPhase: election.status, newPhase });
          broadcastOrganizationUpdate(organizationId, 'election-phase-advanced', { organizationId, electionId: election.id, oldPhase: election.status, newPhase });
        } catch (updateErr) {
          logger.error('Error updating election phase', { error: updateErr.message, electionId: election.id });
          const resetQuery = 'UPDATE representative_elections SET phase_transition_in_progress = false WHERE id = ?';
          await TransactionManager.execute(db, resetQuery, [election.id]);
        }
      } else {
        const resetQuery = 'UPDATE representative_elections SET phase_transition_in_progress = false WHERE id = ?';
        await TransactionManager.execute(db, resetQuery, [election.id]);
      }
    } catch (err) {
      logger.error('Error processing election phase transition', { error: err.message, electionId: election.id });
      try {
        const resetQuery = 'UPDATE representative_elections SET phase_transition_in_progress = false WHERE id = ?';
        await TransactionManager.execute(db, resetQuery, [election.id]);
      } catch (resetErr) {
        logger.error('Error resetting transition flag', { error: resetErr.message, electionId: election.id });
      }
    }
  }
  return { success: true, message: `Processed ${elections.length} elections`, advancedCount: advancedElections.length, advancedElections };
}

async function forcePhase(db, organizationId, electionId, userId, body, auditContext = {}) {
  const { newPhase } = body || {};
  if (!['nomination', 'voting', 'completed'].includes(newPhase)) {
    throw ApiError.validation('Invalid phase. Must be one of: nomination, voting, completed', null, 'INVALID_PHASE');
  }
  const election = await TransactionManager.query(db,
    'SELECT status, auto_advance_phases FROM representative_elections WHERE id = ? AND organization_id = ?',
    [electionId, organizationId]);
  if (!election) throw ApiError.notFound('Election');
  if (!election.auto_advance_phases) throw ApiError.validation('Cannot force phase: auto-advance is disabled for this election');

  const now = new Date().toISOString();
  await TransactionManager.query(db, `UPDATE representative_elections SET status = ?, updated_at = ? WHERE id = ?`, [newPhase, now, electionId]);
  await logAudit(db, organizationId, 'election_phase_forced', userId, null, { electionId, oldPhase: election.status, newPhase }, auditContext);
  broadcastOrganizationUpdate(organizationId, 'election-phase-advanced', { organizationId, electionId, oldPhase: election.status, newPhase, forced: true });
  return { success: true, message: `Election phase forced to ${newPhase}`, election: { id: electionId, status: newPhase } };
}

async function autoScheduleElections(db, organizationId, userId, auditContext = {}) {
  const terms = await TransactionManager.queryAll(db, `
    SELECT rt.*, u.name as user_name
    FROM representative_terms rt
    LEFT JOIN users u ON rt.user_id = u.id
    WHERE rt.organization_id = ? AND rt.term_status = 'active'
    ORDER BY rt.term_end_date ASC
  `, [organizationId]);

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiringTerms = terms.filter(term =>
    new Date(term.term_end_date) <= thirtyDaysFromNow && new Date(term.term_end_date) > now
  );
  if (expiringTerms.length === 0) {
    return { success: true, message: 'No representatives have terms expiring soon', scheduled: false };
  }

  const electionId = uuidv4();
  const electionTitle = `Automatic Election - ${expiringTerms.length} Positions`;
  const electionDescription = `Automatic election triggered by term expiration for: ${expiringTerms.map(t => t.user_name).join(', ')}`;
  const nominationStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const votingStart = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const votingEnd = new Date(votingStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  await TransactionManager.query(db, `
    INSERT INTO representative_elections (
      id, organization_id, election_title, election_description,
      positions_available, status, created_by,
      nomination_starts_at, nomination_ends_at,
      voting_starts_at, voting_ends_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    electionId, organizationId, electionTitle, electionDescription,
    expiringTerms.length, 'draft', userId,
    nominationStart.toISOString(), votingStart.toISOString(),
    votingStart.toISOString(), votingEnd.toISOString(),
    now.toISOString(), now.toISOString()
  ]);

  await logAudit(db, organizationId, 'election_auto_scheduled', userId, null, {
    electionId, reason: 'term_expiration',
    expiringTerms: expiringTerms.map(t => ({ userId: t.user_id, termEnd: t.term_end_date })),
    positions: expiringTerms.length
  }, auditContext);

  broadcastOrganizationUpdate(organizationId, 'election-created', {
    organizationId, electionId, title: electionTitle, positionsAvailable: expiringTerms.length, status: 'draft', autoScheduled: true
  });

  try {
    const notificationService = require('../modules/notifications');
    const config = require('../config');
    const frontendUrl = config.FRONTEND_URL || 'http://localhost:3001';
    const members = await TransactionManager.queryAll(db, `
      SELECT u.id as user_id FROM organization_members om JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = ? AND om.status = 'active' AND om.user_id NOT IN (SELECT id FROM organizations)
    `, [organizationId]);
    if (members && members.length > 0) {
      const { extractUserIds } = require('../utils/memberUtils');
      const userIds = extractUserIds(members);
      const orgRow = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
      const eventData = {
        title: `New Election: ${electionTitle}`,
        message: `An election "${electionTitle}" was automatically scheduled for ${expiringTerms.length} expiring position(s)`,
        link: require('../emails/urls').orgTab(organizationId, 'governance'),
        organizationName: orgRow?.name
      };
      await notificationService.notifyUsers(db, userIds, 'election_created', eventData, false);
    }
  } catch (error) {
    logger.error('Error queueing auto-scheduled election creation for digest', { error: error.message, electionId });
  }

  return {
    success: true,
    message: `Election auto-scheduled for ${expiringTerms.length} expiring positions`,
    election: {
      id: electionId,
      title: electionTitle,
      positions: expiringTerms.length,
      nominationStart: nominationStart.toISOString(),
      votingStart: votingStart.toISOString(),
      votingEnd: votingEnd.toISOString()
    }
  };
}

const cancelableElectionStatuses = ['draft', 'announced', 'nomination', 'active', 'voting'];
async function cancelElection(db, organizationId, electionId, userId) {
  const election = await TransactionManager.query(db,
    'SELECT id, status, created_by FROM representative_elections WHERE id = ? AND organization_id = ?',
    [electionId, organizationId]);
  if (!election) throw ApiError.notFound('Election not found');
  if (!cancelableElectionStatuses.includes(election.status)) {
    throw ApiError.badRequest('Election cannot be cancelled in its current status');
  }
  const isRep = await isRepresentative(db, userId, organizationId);
  const isCreator = election.created_by === userId;
  if (!isRep && !isCreator) {
    throw ApiError.forbidden('Only representatives or the election creator can cancel this election', 'NOT_AUTHORIZED');
  }
  await TransactionManager.execute(db,
    `UPDATE representative_elections SET status = 'cancelled', quorum_met = false, election_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [electionId]);
  broadcastOrganizationUpdate(organizationId, 'election-updated', { organizationId, electionId, status: 'cancelled' });
  return { success: true, message: 'Election cancelled' };
}

/**
 * Calculate ranked-choice voting winners from ballots.
 */
async function calculateRankedChoiceWinners(db, electionId, candidates, positionsAvailable, options = {}) {
  const { anonymousVoting = true } = options;
  let rankings = [];

  if (anonymousVoting) {
    const ballots = await TransactionManager.queryAll(db, `
      SELECT avb.vote_choice, avb.voter_token
      FROM anonymous_vote_ballots avb
      JOIN voting_sessions vs ON avb.voting_session_id = vs.id
      WHERE vs.related_entity_id = ? AND vs.session_type = 'election'
    `, [electionId]);

    rankings = ballots.map(ballot => {
      try {
        const ranking = JSON.parse(ballot.vote_choice);
        return Array.isArray(ranking) ? ranking : [ballot.vote_choice];
      } catch {
        return [ballot.vote_choice];
      }
    });
  } else {
    const voteRows = await TransactionManager.queryAll(db, `
      SELECT user_id, candidate_id, vote_rank
      FROM election_votes
      WHERE election_id = ?
      ORDER BY user_id ASC, vote_rank ASC, created_at ASC
    `, [electionId]);
    const byUser = new Map();
    for (const row of voteRows) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
      byUser.get(row.user_id).push(row.candidate_id);
    }
    rankings = Array.from(byUser.values());
  }

  const candidateIds = candidates.map(c => c.id);
  const winners = [];
  const eliminated = new Set();

  while (winners.length < positionsAvailable && winners.length + eliminated.size < candidateIds.length) {
    const voteCounts = new Map();
    candidateIds.forEach(id => {
      if (!eliminated.has(id) && !winners.some(w => w.id === id)) {
        voteCounts.set(id, 0);
      }
    });

    rankings.forEach(ranking => {
      for (const candidateId of ranking) {
        if (!eliminated.has(candidateId) && !winners.some(w => w.id === candidateId)) {
          voteCounts.set(candidateId, (voteCounts.get(candidateId) || 0) + 1);
          break;
        }
      }
    });

    const totalVotes = Array.from(voteCounts.values()).reduce((sum, count) => sum + count, 0);
    if (totalVotes === 0) break;

    const majorityThreshold = totalVotes / 2;
    let foundWinner = false;

    for (const [candidateId, votes] of voteCounts.entries()) {
      if (votes > majorityThreshold) {
        const candidate = candidates.find(c => c.id === candidateId);
        if (candidate) {
          winners.push(candidate);
          foundWinner = true;
          break;
        }
      }
    }

    if (foundWinner) continue;

    if (voteCounts.size === 0) break;

    let minVotes = Infinity;
    let candidateToEliminate = null;
    for (const [candidateId, votes] of voteCounts.entries()) {
      if (votes < minVotes) {
        minVotes = votes;
        candidateToEliminate = candidateId;
      }
    }
    if (candidateToEliminate) {
      eliminated.add(candidateToEliminate);
    } else {
      break;
    }
  }

  if (winners.length < positionsAvailable) {
    const remaining = candidates.filter(c =>
      !eliminated.has(c.id) && !winners.some(w => w.id === c.id)
    );
    const finalCounts = new Map();
    remaining.forEach(c => finalCounts.set(c.id, 0));
    rankings.forEach(ranking => {
      for (const candidateId of ranking) {
        if (finalCounts.has(candidateId)) {
          finalCounts.set(candidateId, finalCounts.get(candidateId) + 1);
          break;
        }
      }
    });
    remaining.sort((a, b) => (finalCounts.get(b.id) || 0) - (finalCounts.get(a.id) || 0));
    const additionalWinners = remaining.slice(0, positionsAvailable - winners.length);
    winners.push(...additionalWinners);
  }

  return winners.slice(0, positionsAvailable);
}

/**
 * Process election results (run inside transaction): quorum check, compute winners, update candidates/terms, add reps, finalize resignations, update election status, audit.
 */
async function processElectionResults(trx, organizationId, electionId, userId, auditContext = {}) {
  const election = await TransactionManager.query(trx,
    'SELECT status, positions_available, votes_cast, quorum_required, election_title, anonymous_voting FROM representative_elections WHERE id = ? AND organization_id = ?',
    [electionId, organizationId]
  );

  if (!election) {
    throw ApiError.notFound('Election not found');
  }
  if (election.status !== 'voting') {
    throw ApiError.badRequest('Election is not active');
  }

  const quorumMet = election.votes_cast >= election.quorum_required;
  if (!quorumMet) {
    await TransactionManager.execute(trx,
      'UPDATE representative_elections SET status = \'cancelled\', quorum_met = false, election_completed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [electionId]
    );
    return {
      success: false,
      message: 'Election cancelled due to insufficient participation (quorum not met)',
      quorumRequired: election.quorum_required,
      votesCast: election.votes_cast
    };
  }

  const rules = await TransactionManager.query(trx,
    'SELECT election_voting_method FROM organization_governance_rules WHERE organization_id = ?',
    [organizationId]
  );
  const votingMethod = rules?.election_voting_method || 'simple_majority';
  const isRankedChoice = votingMethod === 'ranked_choice';
  const isAnonymousElection = election.anonymous_voting === 1 || election.anonymous_voting === true;

  const candidates = await TransactionManager.queryAll(trx, `SELECT id, election_id, user_id, candidate_statement, accepted_nomination, nominated_by,
    nomination_accepted_at, votes_received, elected, elected_position, created_at, updated_at
    FROM election_candidates WHERE election_id = ?`,
  [electionId]);

  const positionsAvailable = election.positions_available;
  let electedCandidates = [];
  let electedUserIds = [];

  if (isRankedChoice) {
    electedCandidates = await calculateRankedChoiceWinners(trx, electionId, candidates, positionsAvailable, {
      anonymousVoting: isAnonymousElection
    });
    electedUserIds = electedCandidates.map(c => c.user_id);
  } else {
    candidates.sort((a, b) => (b.votes_received || 0) - (a.votes_received || 0));
    electedCandidates = candidates.slice(0, positionsAvailable);
    electedUserIds = electedCandidates.map(c => c.user_id);
  }

  let position = 1;
  for (const candidate of electedCandidates) {
    await TransactionManager.execute(trx,
      'UPDATE election_candidates SET elected = ?, elected_position = ? WHERE id = ?',
      [1, position, candidate.id]
    );
    const termId = uuidv4();
    const termEndDate = new Date();
    termEndDate.setMonth(termEndDate.getMonth() + 12);
    await TransactionManager.execute(trx, `INSERT INTO representative_terms (
      id, organization_id, user_id, term_number, elected_in_election_id,
      term_start_date, term_end_date
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`, [
      termId, organizationId, candidate.user_id, 1, electionId,
      termEndDate.toISOString()
    ]);
    position++;
  }

  for (const candidate of candidates) {
    if (!electedCandidates.some(ec => ec.id === candidate.id)) {
      await TransactionManager.execute(trx,
        'UPDATE election_candidates SET elected = false, elected_position = NULL WHERE id = ?',
        [candidate.id]
      );
    }
  }

  let pendingResignations = [];
  try {
    pendingResignations = await TransactionManager.queryAll(trx, `
      SELECT rt.id, rt.user_id, rt.organization_id
      FROM representative_terms rt
      WHERE rt.replacement_election_id = ?
        AND rt.resignation_pending = ?
        AND rt.term_status = 'active'
    `, [electionId, true]);
  } catch (resignErr) {
    logger.error('Error fetching pending resignations', { error: resignErr.message, electionId });
  }

  for (const uid of electedUserIds) {
    const repTableId = uuidv4();
    try {
      const insertSql = `INSERT INTO organization_representatives (id, organization_id, user_id, status, added_at)
        VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
        ON CONFLICT (organization_id, user_id) DO NOTHING`;
      await TransactionManager.execute(trx, insertSql, [repTableId, organizationId, uid]);
    } catch (err) {
      logger.error('Error adding elected representative', { error: err.message, userId: uid, organizationId });
      throw err;
    }
  }

  if (pendingResignations && pendingResignations.length > 0) {
    const now = new Date().toISOString();
    for (const resignation of pendingResignations) {
      await TransactionManager.execute(trx, `
        UPDATE representative_terms
        SET term_status = 'resigned',
            resignation_pending = ?,
            resigned_at = ?,
            updated_at = ?
        WHERE id = ?
      `, [false, now, now, resignation.id]);
      await TransactionManager.execute(trx, `
        UPDATE organization_representatives
        SET status = 'removed', removed_at = ?
        WHERE organization_id = ? AND user_id = ? AND status = 'active'
      `, [now, organizationId, resignation.user_id]);
    }
  }

  await TransactionManager.execute(trx,
    'UPDATE representative_elections SET status = \'completed\', quorum_met = true, election_completed_at = CURRENT_TIMESTAMP WHERE id = ?',
    [electionId]
  );

  if (auditContext.logAudit) {
    auditContext.logAudit(trx, organizationId, 'election_completed', userId, null, {
      electionId,
      positionsFilled: electedUserIds.length,
      electedUserIds
    }, auditContext.req);
  }

  return {
    success: true,
    election,
    electedCandidates: candidates.slice(0, positionsAvailable).map(c => ({
      userId: c.user_id,
      votesReceived: c.votes_received,
      position: candidates.indexOf(c) + 1
    })),
    electedUserIds,
    pendingResignations
  };
}

/**
 * Create a replacement election for a resigning representative (run inside transaction).
 */
async function createReplacementElection(trx, {
  organizationId,
  termId,
  quorumRequired,
  electionTitle = 'Automatic Election - Replacement for Resigned Representative',
  electionDescription = 'Election triggered by resignation of representative.',
  triggerType = 'resignation',
  createdBy,
}) {
  const now = new Date().toISOString();
  const electionId = uuidv4();
  const nominationStart = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
  const votingStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const votingEnd = new Date(votingStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (!createdBy) {
    throw new Error('createReplacementElection requires a valid createdBy user id');
  }
  await TransactionManager.execute(trx, `INSERT INTO representative_elections (id, organization_id, election_title, election_description, positions_available, status, created_by, trigger_type, triggered_by_term_id, nomination_starts_at, nomination_ends_at, voting_starts_at, voting_ends_at, quorum_required, auto_advance_phases, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    electionId, organizationId, electionTitle,
    electionDescription, 1, 'draft', createdBy, triggerType, termId || null,
    nominationStart.toISOString(), votingStart.toISOString(), votingStart.toISOString(), votingEnd.toISOString(),
    quorumRequired, true, now, now
  ]);
  return electionId;
}

async function completeElection(db, organizationId, electionId, userId, auditContext = {}) {
  const result = await votingLockManager.withVoteLock('election', electionId, async () => {
    return await TransactionManager.executeInTransaction(db, async (txDb) => {
      const ctx = { ...auditContext, logAudit, req: auditContext };
      return await processElectionResults(txDb, organizationId, electionId, userId, ctx);
    });
  });
  if (result.success === false) return result;
  broadcastOrganizationUpdate(organizationId, 'election-completed', {
    organizationId, electionId, positionsFilled: result.electedUserIds.length, electedUserIds: result.electedUserIds
  });
  if (result.pendingResignations && result.pendingResignations.length > 0) {
    for (const resignation of result.pendingResignations) {
      await logAudit(db, organizationId, 'rep_resignation_finalized', userId, resignation.user_id, {
        electionId, termId: resignation.id
      }, auditContext);
    }
    broadcastOrganizationUpdate(organizationId, 'representative-resignation-finalized', {
      organizationId, electionId, finalizedResignations: result.pendingResignations.map(pr => pr.user_id)
    });
  }
  (async () => {
    try {
      const notificationService = require('../modules/notifications');
      const config = require('../config');
      const frontendUrl = config.FRONTEND_URL || 'http://localhost:3001';
      const winnerNames = await Promise.all(result.electedUserIds.map(async (uid) => {
        const user = await TransactionManager.query(db, 'SELECT name FROM users WHERE id = ?', [uid]);
        return user?.name || 'Unknown';
      }));
      const members = await TransactionManager.queryAll(db, `
        SELECT u.id as user_id FROM organization_members om JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = ? AND om.status = 'active' AND om.user_id NOT IN (SELECT id FROM organizations)
      `, [organizationId]);
      if (members && members.length > 0) {
        const { extractUserIds } = require('../utils/memberUtils');
        const userIds = extractUserIds(members);
        const orgRow = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
        const eventData = {
          title: `Election Completed: ${result.election?.election_title || 'Election'}`,
          message: `Election "${result.election?.election_title || 'Election'}" has been completed. Winners: ${winnerNames.join(', ')}`,
          link: require('../emails/urls').orgTab(organizationId, 'governance'),
          organizationName: orgRow?.name
        };
        await notificationService.notifyUsers(db, userIds, 'election_completed', eventData, false);
      }
    } catch (error) {
      logger.error('Error queueing election completion for digest', { error: error.message, electionId });
    }
  })();
  return { success: true, message: 'Election completed successfully', electedCandidates: result.electedCandidates };
}

module.exports.getElectionResults = getElectionResults;
module.exports.getUserVoteStatus = getUserVoteStatus;
module.exports.listElections = listElections;
module.exports.createElection = createElection;
module.exports.nominateCandidate = nominateCandidate;
module.exports.acceptNomination = acceptNomination;
module.exports.startElection = startElection;
module.exports.castElectionVote = castElectionVote;
module.exports.updateElectionPhase = updateElectionPhase;
module.exports.checkPhaseTransitions = checkPhaseTransitions;
module.exports.forcePhase = forcePhase;
module.exports.autoScheduleElections = autoScheduleElections;
module.exports.cancelElection = cancelElection;
module.exports.completeElection = completeElection;
module.exports.calculateRankedChoiceWinners = calculateRankedChoiceWinners;
module.exports.processElectionResults = processElectionResults;
module.exports.createReplacementElection = createReplacementElection;
