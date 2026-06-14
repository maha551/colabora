/**
 * Tally verifier for vote export (Agent E).
 * Recomputes pro/contra/neutral/total from ballots and compares to announced result.
 * See docs/active/TALLY_SPEC.md §5 and docs/active/VERIFIABILITY_SPEC.md.
 */

const TransactionManager = require('../database/services/TransactionManager');
const ballotExport = require('./ballotExport');

function normalizeChoice(choice) {
  if (choice == null || typeof choice !== 'string') return null;
  const u = choice.trim().toUpperCase();
  if (u === 'YES' || u === 'PRO') return 'pro';
  if (u === 'NO' || u === 'CONTRA') return 'contra';
  if (u === 'ABSTAIN' || u === 'NEUTRAL') return 'neutral';
  return null;
}

function recomputeTallyFromBallots(ballots) {
  const counts = { pro: 0, contra: 0, neutral: 0, total: 0 };
  if (!Array.isArray(ballots)) return counts;
  for (const b of ballots) {
    const bucket = normalizeChoice(b && b.choice);
    if (bucket === 'pro') { counts.pro++; counts.total++; }
    else if (bucket === 'contra') { counts.contra++; counts.total++; }
    else if (bucket === 'neutral') { counts.neutral++; counts.total++; }
  }
  return counts;
}

function compareTally(computed, announced) {
  if (announced == null || typeof announced !== 'object') return { match: true };
  const a = {
    pro: Number(announced.pro) || 0,
    contra: Number(announced.contra) || 0,
    neutral: Number(announced.neutral) || 0,
    total: Number(announced.total) || 0
  };
  const match =
    (computed.pro === a.pro) &&
    (computed.contra === a.contra) &&
    (computed.neutral === a.neutral) &&
    (computed.total === a.total);
  if (match) return { match: true };
  return {
    match: false,
    diff: {
      pro: computed.pro - a.pro,
      contra: computed.contra - a.contra,
      neutral: computed.neutral - a.neutral,
      total: computed.total - a.total
    }
  };
}

function recomputeMeetingOptionCounts(ballots) {
  const counts = {};
  let total = 0;
  for (const b of ballots || []) {
    const key = String(b.choice);
    counts[key] = (counts[key] || 0) + 1;
    total++;
  }
  return { optionCounts: counts, total };
}

function compareMeetingOptionCounts(computed, announcedOptionCounts) {
  if (!announcedOptionCounts || typeof announcedOptionCounts !== 'object') {
    return { match: true };
  }
  const allKeys = new Set([
    ...Object.keys(computed.optionCounts || {}),
    ...Object.keys(announcedOptionCounts)
  ]);
  const diff = {};
  let match = true;
  for (const key of allKeys) {
    const c = computed.optionCounts[key] || 0;
    const a = Number(announcedOptionCounts[key]) || 0;
    if (c !== a) {
      match = false;
      diff[key] = c - a;
    }
  }
  if (computed.total !== Object.values(announcedOptionCounts).reduce((s, n) => s + (Number(n) || 0), 0)) {
    match = false;
  }
  return match ? { match: true } : { match: false, optionDiff: diff };
}

async function verifyElection(db, voteType, contestId, ballots) {
  const ctx = await ballotExport.resolveRepresentativeElectionContext(db, contestId);
  if (!ctx) {
    return { match: false, verificationKind: 'election', error: 'Election not found' };
  }
  const ballotCount = Array.isArray(ballots) ? ballots.length : 0;
  const electionRow = await TransactionManager.query(db, `
    SELECT votes_cast FROM representative_elections WHERE id = ?
  `, [ctx.electionId]);
  const announcedBallotCount = Number(electionRow?.votes_cast ?? electionRow?.votes_cast) || 0;

  const match = ballotCount === announcedBallotCount;
  const candidateDiff = {};
  if (!ctx.anonymousVoting && match && ballotCount > 0) {
    const candidates = await TransactionManager.queryAll(db, `
      SELECT id, votes_received FROM election_candidates WHERE election_id = ?
    `, [ctx.electionId]);
    const recomputed = {};
    for (const b of ballots) {
      const choice = b.choice;
      if (!choice || choice.startsWith('[')) continue;
      recomputed[choice] = (recomputed[choice] || 0) + 1;
    }
    for (const c of candidates || []) {
      const expected = Number(c.votes_received) || 0;
      const got = recomputed[c.id] || 0;
      if (expected !== got) {
        candidateDiff[c.id] = got - expected;
      }
    }
  }

  const candidateMatch = Object.keys(candidateDiff).length === 0;
  return {
    match: match && candidateMatch,
    verificationKind: 'election',
    ballotCount,
    announcedBallotCount,
    ...(Object.keys(candidateDiff).length > 0 ? { candidateDiff } : {})
  };
}

/**
 * Run verification for a contest export result.
 * @param {Object} db
 * @param {{ voteType, contestId, ballots, announcedResult?, announcedOptionCounts? }} exportResult
 */
async function verifyContestExport(db, exportResult) {
  const { voteType, contestId, ballots, announcedResult, announcedOptionCounts } = exportResult;

  if (voteType === 'representative_election') {
    return verifyElection(db, voteType, contestId, ballots);
  }

  if (voteType === 'meeting_vote') {
    const computed = recomputeMeetingOptionCounts(ballots);
    const comparison = compareMeetingOptionCounts(computed, announcedOptionCounts);
    return {
      verificationKind: 'meeting_options',
      match: comparison.match,
      computed: { optionCounts: computed.optionCounts, total: computed.total },
      announcedOptionCounts: announcedOptionCounts || undefined,
      ...(comparison.optionDiff ? { optionDiff: comparison.optionDiff } : {})
    };
  }

  const computed = recomputeTallyFromBallots(ballots);
  const comparison = compareTally(computed, announcedResult);
  return {
    verificationKind: 'pro_contra',
    match: comparison.match,
    computed: { pro: computed.pro, contra: computed.contra, neutral: computed.neutral, total: computed.total },
    announcedResult: announcedResult || undefined,
    ...(comparison.diff ? { diff: comparison.diff } : {})
  };
}

module.exports = {
  normalizeChoice,
  recomputeTallyFromBallots,
  compareTally,
  recomputeMeetingOptionCounts,
  compareMeetingOptionCounts,
  verifyElection,
  verifyContestExport
};
