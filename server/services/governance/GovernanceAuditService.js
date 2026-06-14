/**
 * GovernanceAuditService - public audit logs, export, and voting analytics.
 */

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../../database/services/TransactionManager');
const { logger } = require('../../middleware/logger');
const { safeJsonParse } = require('../../utils/jsonUtils');

async function getPublicAuditLogs(db, organizationId, options = {}) {
  const { actionType, startDate, endDate, limit = 20, offset = 0 } = options;
  let query = `SELECT oa.id, oa.action_type, oa.created_at, u1.name as performed_by_name, u2.name as affected_user_name, oa.details FROM organization_audit oa LEFT JOIN users u1 ON oa.performed_by_user_id = u1.id LEFT JOIN users u2 ON oa.affected_user_id = u2.id WHERE oa.organization_id = ?`;
  const params = [organizationId];
  if (actionType) { query += ' AND oa.action_type = ?'; params.push(actionType); }
  if (startDate) { query += ' AND oa.created_at >= ?'; params.push(startDate); }
  if (endDate) { query += ' AND oa.created_at <= ?'; params.push(endDate); }
  const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
  const countResult = await TransactionManager.query(db, countQuery, params);
  const total = countResult?.total || 0;
  query += ' ORDER BY oa.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  const logs = await TransactionManager.queryAll(db, query, params);
  const mappedLogs = (logs || []).map(log => ({
    id: log.id,
    action_type: log.action_type,
    created_at: log.created_at,
    createdAt: log.created_at,
    performed_by_name: log.performed_by_name,
    affected_user_name: log.affected_user_name,
    details: log.details ? (typeof log.details === 'string' ? safeJsonParse(log.details, {}) : (log.details || {})) : null
  }));
  return { logs: mappedLogs, total, pagination: { total, limit: parseInt(limit), offset: parseInt(offset), hasMore: (parseInt(offset) + parseInt(limit)) < total } };
}

async function getAuditStats(db, organizationId, options = {}) {
  const { days = 30 } = options;
  const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString();
  const [actionStats, userStats, dailyStats, totals] = await Promise.all([
    TransactionManager.queryAll(db, `SELECT action_type, COUNT(*) as count FROM organization_audit WHERE organization_id = ? AND created_at >= ? GROUP BY action_type ORDER BY count DESC`, [organizationId, startDate]),
    TransactionManager.queryAll(db, `SELECT u.name as user_name, COUNT(*) as activity_count FROM organization_audit oal LEFT JOIN users u ON oal.performed_by_user_id = u.id WHERE oal.organization_id = ? AND oal.created_at >= ? GROUP BY oal.performed_by_user_id ORDER BY activity_count DESC LIMIT 10`, [organizationId, startDate]),
    TransactionManager.queryAll(db, `SELECT DATE(created_at) as date, COUNT(*) as count FROM organization_audit WHERE organization_id = ? AND created_at >= ? GROUP BY DATE(created_at) ORDER BY date DESC`, [organizationId, startDate]),
    TransactionManager.query(db, `SELECT COUNT(*) as total_logs, COUNT(DISTINCT performed_by_user_id) as active_users, COUNT(DISTINCT CASE WHEN action_type LIKE '%election%' THEN id END) as election_actions, COUNT(DISTINCT CASE WHEN action_type LIKE '%vote%' THEN id END) as voting_actions FROM organization_audit WHERE organization_id = ? AND created_at >= ?`, [organizationId, startDate])
  ]);
  return {
    statistics: { period: `${days} days`, totalLogs: totals?.total_logs || 0, activeUsers: totals?.active_users || 0, electionActions: totals?.election_actions || 0, votingActions: totals?.voting_actions || 0 },
    actionBreakdown: actionStats || [],
    userActivity: userStats || [],
    dailyActivity: dailyStats || []
  };
}

async function exportAuditLogs(db, organizationId, options = {}) {
  const { startDate, endDate, format = 'csv' } = options;
  let query = `SELECT oal.created_at, oal.action_type, u1.name as performed_by, u2.name as affected_user, oal.details, oal.ip_address FROM organization_audit oal LEFT JOIN users u1 ON oal.performed_by_user_id = u1.id LEFT JOIN users u2 ON oal.affected_user_id = u2.id WHERE oal.organization_id = ?`;
  const params = [organizationId];
  if (startDate) { query += ' AND oal.created_at >= ?'; params.push(startDate); }
  if (endDate) { query += ' AND oal.created_at <= ?'; params.push(endDate); }
  query += ' ORDER BY oal.created_at DESC';
  const logs = await TransactionManager.queryAll(db, query, params);
  if (format === 'csv') {
    const csvHeader = 'Timestamp,Action Type,Performed By,Affected User,Details,IP Address\n';
    const csvRows = logs.map(log => [log.created_at, log.action_type, log.performed_by || '', log.affected_user || '', JSON.stringify(log.details || {}).replace(/"/g, '""'), log.ip_address || ''].map(field => `"${field}"`).join(',')).join('\n');
    return { format: 'csv', csv: csvHeader + csvRows, filename: `governance-audit-${organizationId}-${new Date().toISOString().split('T')[0]}.csv` };
  }
  return { format: 'json', auditLogs: logs };
}

async function calculateVotingAnalytics(db, organizationId, startDate, endDate) {
  let totalMembers = 0;
  try {
    const memberRow = await TransactionManager.query(db, 'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = \'active\'', [organizationId]);
    totalMembers = memberRow?.count || 0;
  } catch (err) {
    logger.error('Error getting member count for analytics', { error: err.message, organizationId });
    throw err;
  }
  let elections = [];
  try {
    elections = await TransactionManager.queryAll(db, `SELECT id, organization_id, status, total_voters, votes_cast, quorum_met FROM representative_elections WHERE organization_id = ? AND created_at >= ? AND created_at <= ?`, [organizationId, startDate.toISOString(), endDate.toISOString()]);
  } catch (err) { elections = []; }
  const electionsHeld = elections?.length || 0;
  let totalTurnout = 0, quorumAchievedCount = 0;
  if (elections && elections.length > 0) {
    elections.forEach(e => { if (e.total_voters > 0) totalTurnout += (e.votes_cast || 0) / e.total_voters; if (e.quorum_met) quorumAchievedCount++; });
  }
  const averageElectionTurnout = electionsHeld > 0 ? (totalTurnout / electionsHeld) * 100 : 0;
  const quorumAchievedPercentage = electionsHeld > 0 ? (quorumAchievedCount / electionsHeld) * 100 : 0;
  let sessions = [];
  try {
    sessions = await TransactionManager.queryAll(db, `SELECT id, status, voting_starts_at, completed_at, votes_cast_count, result FROM voting_sessions WHERE organization_id = ? AND created_at >= ? AND created_at <= ?`, [organizationId, startDate.toISOString(), endDate.toISOString()]);
  } catch (err) { sessions = []; }
  const totalDecisionsMade = sessions?.length || 0;
  let decisionsPassed = 0, decisionsFailed = 0, totalVotesCast = 0;
  if (sessions && sessions.length > 0) {
    sessions.forEach(s => { totalVotesCast += s.votes_cast_count || 0; if (s.result === 'approved') decisionsPassed++; else if (s.result === 'rejected' || s.result === 'failed') decisionsFailed++; });
  }
  const activeVoters = totalVotesCast > 0 && totalDecisionsMade > 0 ? Math.min(totalMembers, Math.ceil(totalVotesCast / totalDecisionsMade)) : 0;
  const averageVotesPerMember = totalMembers > 0 ? totalVotesCast / totalMembers : 0;
  let averageDecisionTimeHours = 0;
  const completedSessions = sessions?.filter(s => s.status === 'completed' && s.voting_starts_at && s.completed_at) || [];
  if (completedSessions.length > 0) {
    let totalHours = 0;
    completedSessions.forEach(session => { totalHours += (new Date(session.completed_at).getTime() - new Date(session.voting_starts_at).getTime()) / (1000 * 60 * 60); });
    averageDecisionTimeHours = totalHours / completedSessions.length;
  }
  return { totalMembers, activeVoters, totalVotesCast, averageVotesPerMember, electionsHeld, averageElectionTurnout, quorumAchievedPercentage, totalDecisionsMade, decisionsPassed, decisionsFailed, averageDecisionTimeHours: Math.round(averageDecisionTimeHours * 10) / 10 };
}

async function getVotingAnalytics(db, organizationId, options = {}) {
  const { period } = options;
  const now = new Date();
  let periodStart, periodEnd;
  switch (period) {
    case 'month': periodStart = new Date(now.getFullYear(), now.getMonth(), 1); periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); break;
    case 'quarter': { const q = Math.floor(now.getMonth() / 3) * 3; periodStart = new Date(now.getFullYear(), q, 1); periodEnd = new Date(now.getFullYear(), q + 3, 0); break; }
    case 'year': periodStart = new Date(now.getFullYear(), 0, 1); periodEnd = new Date(now.getFullYear(), 11, 31); break;
    default: periodStart = new Date(now.getFullYear(), now.getMonth(), 1); periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }
  const existing = await TransactionManager.query(db, `SELECT id, organization_id, period_start, period_end, total_members, active_voters, total_votes_cast, average_votes_per_member, elections_held, average_election_turnout, quorum_achieved_percentage, total_decisions_made, decisions_passed, decisions_failed, average_decision_time_hours, created_at, updated_at FROM voting_analytics WHERE organization_id = ? AND period_start = ? AND period_end = ?`, [organizationId, periodStart.toISOString().split('T')[0], periodEnd.toISOString().split('T')[0]]);
  if (existing) return { analytics: existing };
  try {
    const analytics = await calculateVotingAnalytics(db, organizationId, periodStart, periodEnd);
    try {
      const analyticsId = uuidv4();
      await TransactionManager.execute(db, `INSERT INTO voting_analytics (id, organization_id, period_start, period_end, total_members, active_voters, total_votes_cast, average_votes_per_member, elections_held, average_election_turnout, quorum_achieved_percentage, total_decisions_made, decisions_passed, decisions_failed, average_decision_time_hours) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [analyticsId, organizationId, periodStart.toISOString().split('T')[0], periodEnd.toISOString().split('T')[0], analytics.totalMembers, analytics.activeVoters, analytics.totalVotesCast, analytics.averageVotesPerMember, analytics.electionsHeld, analytics.averageElectionTurnout, analytics.quorumAchievedPercentage, analytics.totalDecisionsMade, analytics.decisionsPassed, analytics.decisionsFailed, analytics.averageDecisionTimeHours]);
      return { analytics: { id: analyticsId, ...analytics } };
    } catch (saveErr) {
      logger.error('Error saving analytics', { error: saveErr.message, organizationId });
      return { analytics };
    }
  } catch (calcErr) {
    logger.warn('Analytics calculation failed', { error: calcErr?.message, organizationId });
    let defaultAnalytics = { totalMembers: 0, activeVoters: 0, totalVotesCast: 0, averageVotesPerMember: 0, electionsHeld: 0, averageElectionTurnout: 0, quorumAchievedPercentage: 0, totalDecisionsMade: 0, decisionsPassed: 0, decisionsFailed: 0, averageDecisionTimeHours: 0 };
    try {
      const memberRow = await TransactionManager.query(db, 'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = \'active\'', [organizationId]);
      if (memberRow) defaultAnalytics.totalMembers = memberRow.count;
    } catch (err) {
      logger.warn('Failed to get member count for analytics fallback', { error: err.message, organizationId });
    }
    return { analytics: defaultAnalytics };
  }
}

module.exports = {
  getPublicAuditLogs,
  getAuditStats,
  exportAuditLogs,
  calculateVotingAnalytics,
  getVotingAnalytics
};
