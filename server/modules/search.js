const { logger } = require('../middleware/logger');
const { buildAccessCheck, buildOwnerJoin, buildOwnerSelect } = require('../utils/documentQueries');

const MAX_QUERY_LENGTH = 500;
const DEFAULT_ENTITY_TYPES = ['document', 'paragraph', 'meeting'];

/**
 * Sanitize and validate a search query string.
 * @returns {string|null} Sanitized query or null if empty/invalid
 */
function sanitizeSearchQuery(query) {
  if (!query || typeof query !== 'string') {
    return null;
  }

  let working = query;
  if (working.length > MAX_QUERY_LENGTH) {
    logger.warn('Search query too long, truncating', {
      originalLength: working.length,
      maxLength: MAX_QUERY_LENGTH,
    });
    working = working.substring(0, MAX_QUERY_LENGTH);
  }

  let sanitizedQuery = working
    .trim()
    .replace(/\b(AND|OR|NOT)\b/gi, ' ')
    .replace(/[*:+\-|<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/"/g, '""');

  const safePattern = /^[a-zA-Z0-9\s.,!?;:'-]+$/;
  if (!safePattern.test(sanitizedQuery)) {
    sanitizedQuery = sanitizedQuery
      .replace(/[^a-zA-Z0-9\s.,!?;:'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (!sanitizedQuery) {
    return null;
  }

  const words = sanitizedQuery.split(/\s+/).filter((w) => w.length > 0);
  const wordPattern = /^[a-zA-Z0-9.,!?;:'-]+$/;
  const validWords = words.filter((word) => wordPattern.test(word));
  if (validWords.length === 0) {
    return null;
  }

  return sanitizedQuery;
}

function parseEntityTypes(types) {
  if (!types) return [...DEFAULT_ENTITY_TYPES];
  const raw = Array.isArray(types) ? types : String(types).split(',');
  const allowed = new Set(DEFAULT_ENTITY_TYPES);
  const parsed = raw.map((t) => String(t).trim().toLowerCase()).filter((t) => allowed.has(t));
  return parsed.length > 0 ? parsed : [...DEFAULT_ENTITY_TYPES];
}

function buildDocumentAccessJoins(prefix = 'd') {
  return `
    LEFT JOIN document_collaborators dc ON ${prefix}.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON ${prefix}.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON ${prefix}.organization_id = o.id AND o.is_active = true
  `;
}

function buildDocumentFilterConditions(filters, prefix = 'd') {
  const conditions = [];
  const params = [];
  const { organizationId, status, dateFrom, dateTo, authorId, documentId } = filters;

  if (organizationId) {
    conditions.push(`${prefix}.organization_id = ?`);
    params.push(organizationId);
  }
  if (documentId) {
    conditions.push(`${prefix}.id = ?`);
    params.push(documentId);
  }
  if (status) {
    conditions.push(`${prefix}.status = ?`);
    params.push(status);
  }
  if (dateFrom) {
    conditions.push(`${prefix}.created_at >= ?`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`${prefix}.created_at <= ?`);
    params.push(dateTo);
  }
  if (authorId) {
    conditions.push(`(${prefix}.owner_id = ? OR (${prefix}.ownership_type = 'organizational' AND ${prefix}.organization_id = ?))`);
    params.push(authorId, authorId);
  }

  return { conditions, params };
}

function mapDocumentRow(row) {
  return {
    entityType: 'document',
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    organizationId: row.organization_id,
    ownerId: row.owner_id,
    owner: {
      id: row.owner_id,
      name: row.owner_name,
      email: row.owner_email,
      avatar: row.owner_avatar,
    },
    organization: row.organization_name
      ? { id: row.organization_id, name: row.organization_name }
      : null,
    snippet: row.snippet,
    rank: Number(row.rank) || 0,
  };
}

function mapParagraphRow(row) {
  return {
    entityType: 'paragraph',
    paragraphId: row.paragraph_id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    documentKind: row.document_kind || null,
    meetingId: row.meeting_id || null,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    organizationId: row.organization_id,
    ownerId: row.owner_id,
    owner: {
      id: row.owner_id,
      name: row.owner_name,
      email: row.owner_email,
      avatar: row.owner_avatar,
    },
    organization: row.organization_name
      ? { id: row.organization_id, name: row.organization_name }
      : null,
    snippet: row.snippet,
    rank: Number(row.rank) || 0,
  };
}

function mapMeetingRow(row) {
  return {
    entityType: 'meeting',
    meetingId: row.meeting_id,
    id: row.meeting_id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    location: row.location,
    organizationId: row.organization_id,
    organization: row.organization_name
      ? { id: row.organization_id, name: row.organization_name }
      : null,
    minutesDocumentId: row.minutes_document_id || null,
    snippet: row.snippet,
    rank: Number(row.rank) || 0,
  };
}

/**
 * Build SQL fragment for document search (used in unified union).
 */
function buildDocumentSearchSql(userId, sanitizedQuery, filters, includePagination) {
  const titleDescConcat = `CONCAT(COALESCE(d.title, ''), ' ', COALESCE(d.description, ''))`;
  const searchVectorExpr = `COALESCE(d.search_vector, to_tsvector('english', ${titleDescConcat}))`;
  const { conditions, params: filterParams } = buildDocumentFilterConditions(filters, 'd');

  let sql = `
    SELECT
      'document'::text AS entity_type,
      d.id AS result_id,
      d.id,
      NULL::text AS paragraph_id,
      NULL::text AS document_id,
      NULL::text AS meeting_id,
      d.title,
      d.description,
      d.status,
      d.created_at,
      d.updated_at,
      d.organization_id,
      d.owner_id,
      NULL::text AS document_title,
      NULL::text AS document_kind,
      NULL::timestamp AS scheduled_at,
      NULL::text AS location,
      NULL::text AS minutes_document_id,
      ${buildOwnerSelect('d')},
      o.name AS organization_name,
      ts_headline('english', ${titleDescConcat}, plainto_tsquery('english', ?), 'StartSel=<mark>,StopSel=</mark>,MaxWords=35,MinWords=1') AS snippet,
      ts_rank_cd(${searchVectorExpr}, plainto_tsquery('english', ?)) AS rank
    FROM documents d
    ${buildOwnerJoin('d')}
    ${buildDocumentAccessJoins('d')}
    WHERE ${searchVectorExpr} @@ plainto_tsquery('english', ?)
      AND ${buildAccessCheck('d')}
  `;

  const params = [userId, userId, sanitizedQuery, sanitizedQuery, sanitizedQuery, userId, userId];
  if (conditions.length > 0) {
    sql += ` AND ${conditions.join(' AND ')}`;
    params.push(...filterParams);
  }

  if (includePagination) {
    sql += ' ORDER BY rank DESC';
    if (filters.limit != null) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }
    if (filters.offset != null) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }
  }

  return { sql, params };
}

function buildParagraphSearchSql(userId, sanitizedQuery, filters, includePagination) {
  const paragraphTextExpr = `CONCAT(COALESCE(p.title, ''), ' ', COALESCE(p.text, ''))`;
  const searchVectorExpr = `COALESCE(p.search_vector, to_tsvector('english', ${paragraphTextExpr}))`;
  const { conditions, params: filterParams } = buildDocumentFilterConditions(filters, 'd');

  let sql = `
    SELECT
      'paragraph'::text AS entity_type,
      p.id AS result_id,
      NULL::text AS id,
      p.id AS paragraph_id,
      d.id AS document_id,
      m.id AS meeting_id,
      COALESCE(NULLIF(p.title, ''), d.title, 'Paragraph') AS title,
      NULL::text AS description,
      d.status,
      p.created_at,
      p.updated_at,
      d.organization_id,
      d.owner_id,
      d.title AS document_title,
      d.document_kind,
      NULL::timestamp AS scheduled_at,
      NULL::text AS location,
      m.minutes_document_id,
      ${buildOwnerSelect('d')},
      o.name AS organization_name,
      ts_headline('english', COALESCE(p.text, ''), plainto_tsquery('english', ?), 'StartSel=<mark>,StopSel=</mark>,MaxWords=35,MinWords=1') AS snippet,
      ts_rank_cd(${searchVectorExpr}, plainto_tsquery('english', ?)) AS rank
    FROM paragraphs p
    JOIN documents d ON p.document_id = d.id
    LEFT JOIN meetings m ON m.minutes_document_id = d.id
    ${buildOwnerJoin('d')}
    ${buildDocumentAccessJoins('d')}
    WHERE ${searchVectorExpr} @@ plainto_tsquery('english', ?)
      AND ${buildAccessCheck('d')}
  `;

  const params = [userId, userId, sanitizedQuery, sanitizedQuery, sanitizedQuery, userId, userId];
  if (conditions.length > 0) {
    sql += ` AND ${conditions.join(' AND ')}`;
    params.push(...filterParams);
  }

  if (includePagination) {
    sql += ' ORDER BY rank DESC';
    if (filters.limit != null) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }
    if (filters.offset != null) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }
  }

  return { sql, params };
}

function buildMeetingSearchSql(userId, sanitizedQuery, filters, includePagination) {
  const searchVectorExpr = `COALESCE(m.search_vector, to_tsvector('english', COALESCE(m.search_text, '')))`;
  const searchTextExpr = `COALESCE(m.search_text, '')`;
  const conditions = [];
  const filterParams = [];

  if (filters.organizationId) {
    conditions.push('m.organization_id = ?');
    filterParams.push(filters.organizationId);
  }

  let sql = `
    SELECT
      'meeting'::text AS entity_type,
      m.id AS result_id,
      NULL::text AS id,
      NULL::text AS paragraph_id,
      NULL::text AS document_id,
      m.id AS meeting_id,
      m.title,
      NULL::text AS description,
      NULL::text AS status,
      m.created_at,
      m.updated_at,
      m.organization_id,
      NULL::text AS owner_id,
      NULL::text AS document_title,
      NULL::text AS document_kind,
      m.scheduled_at,
      m.location,
      m.minutes_document_id,
      NULL::text AS owner_name,
      NULL::text AS owner_email,
      NULL::text AS owner_avatar,
      NULL::text AS owner_type,
      o.name AS organization_name,
      ts_headline('english', ${searchTextExpr}, plainto_tsquery('english', ?), 'StartSel=<mark>,StopSel=</mark>,MaxWords=35,MinWords=1') AS snippet,
      ts_rank_cd(${searchVectorExpr}, plainto_tsquery('english', ?)) AS rank
    FROM meetings m
    JOIN organization_members om ON m.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    JOIN organizations o ON m.organization_id = o.id AND o.is_active = true
    WHERE ${searchVectorExpr} @@ plainto_tsquery('english', ?)
  `;

  const params = [sanitizedQuery, sanitizedQuery, userId, sanitizedQuery];
  if (conditions.length > 0) {
    sql += ` AND ${conditions.join(' AND ')}`;
    params.push(...filterParams);
  }

  if (includePagination) {
    sql += ' ORDER BY rank DESC';
    if (filters.limit != null) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }
    if (filters.offset != null) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }
  }

  return { sql, params };
}

function mapUnifiedRow(row) {
  if (row.entity_type === 'document') {
    return mapDocumentRow(row);
  }
  if (row.entity_type === 'paragraph') {
    return mapParagraphRow(row);
  }
  return mapMeetingRow(row);
}

/**
 * Search documents using PostgreSQL full-text search.
 */
async function searchDocuments(db, query, filters = {}, userId = null) {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  const { sql, params } = buildDocumentSearchSql(userId, sanitizedQuery, {
    ...filters,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
  }, true);

  try {
    const result = await db.raw(sql, params);
    const rows = result.rows || result || [];
    return rows.map(mapDocumentRow);
  } catch (err) {
    logger.error('Search error', { error: err.message, query: sanitizedQuery, stack: err.stack });
    throw err;
  }
}

async function searchParagraphs(db, query, filters = {}, userId = null) {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  const { sql, params } = buildParagraphSearchSql(userId, sanitizedQuery, {
    ...filters,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
  }, true);

  try {
    const result = await db.raw(sql, params);
    const rows = result.rows || result || [];
    return rows.map(mapParagraphRow);
  } catch (err) {
    logger.error('Paragraph search error', { error: err.message, query: sanitizedQuery, stack: err.stack });
    throw err;
  }
}

async function searchMeetings(db, query, filters = {}, userId = null) {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  const { sql, params } = buildMeetingSearchSql(userId, sanitizedQuery, {
    ...filters,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
  }, true);

  try {
    const result = await db.raw(sql, params);
    const rows = result.rows || result || [];
    return rows.map(mapMeetingRow);
  } catch (err) {
    logger.error('Meeting search error', { error: err.message, query: sanitizedQuery, stack: err.stack });
    throw err;
  }
}

/**
 * Unified search across documents, paragraphs, and meetings.
 */
async function searchUnified(db, query, filters = {}, userId = null) {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery || !userId) {
    return { results: [], count: 0, facets: {} };
  }

  const entityTypes = parseEntityTypes(filters.types);
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const unionParts = [];
  const unionParams = [];
  const countParts = [];
  const countParams = [];

  if (entityTypes.includes('document')) {
    const doc = buildDocumentSearchSql(userId, sanitizedQuery, filters, false);
    unionParts.push(doc.sql);
    unionParams.push(...doc.params);
    countParts.push(`SELECT 'document'::text AS entity_type FROM (${doc.sql}) doc_sub`);
    countParams.push(...doc.params);
  }
  if (entityTypes.includes('paragraph')) {
    const para = buildParagraphSearchSql(userId, sanitizedQuery, filters, false);
    unionParts.push(para.sql);
    unionParams.push(...para.params);
    countParts.push(`SELECT 'paragraph'::text AS entity_type FROM (${para.sql}) para_sub`);
    countParams.push(...para.params);
  }
  if (entityTypes.includes('meeting')) {
    const meet = buildMeetingSearchSql(userId, sanitizedQuery, filters, false);
    unionParts.push(meet.sql);
    unionParams.push(...meet.params);
    countParts.push(`SELECT 'meeting'::text AS entity_type FROM (${meet.sql}) meet_sub`);
    countParams.push(...meet.params);
  }

  if (unionParts.length === 0) {
    return { results: [], count: 0, facets: {} };
  }

  const unionSql = unionParts.join(' UNION ALL ');
  const resultsSql = `
    SELECT * FROM (${unionSql}) unified
    ORDER BY rank DESC
    LIMIT ? OFFSET ?
  `;
  const facetSql = `
    SELECT entity_type, COUNT(*)::int AS cnt
    FROM (${countParts.join(' UNION ALL ')}) facet_rows
    GROUP BY entity_type
  `;
  const totalSql = `
    SELECT COUNT(*)::int AS total
    FROM (${countParts.join(' UNION ALL ')}) total_rows
  `;

  try {
    const [resultsResult, facetResult, totalResult] = await Promise.all([
      db.raw(resultsSql, [...unionParams, limit, offset]),
      db.raw(facetSql, countParams),
      db.raw(totalSql, countParams),
    ]);

    const rows = resultsResult.rows || resultsResult || [];
    const facetRows = facetResult.rows || facetResult || [];
    const totalRows = totalResult.rows || totalResult || [];

    const facets = {};
    for (const row of facetRows) {
      facets[row.entity_type] = Number(row.cnt) || 0;
    }

    return {
      results: rows.map(mapUnifiedRow),
      count: Number(totalRows[0]?.total) || 0,
      facets,
    };
  } catch (err) {
    logger.error('Unified search error', { error: err.message, query: sanitizedQuery, stack: err.stack });
    throw err;
  }
}

/**
 * Get search suggestions/autocomplete across documents, meetings, and paragraphs.
 */
async function getSearchSuggestions(db, prefix, userId, options = {}) {
  if (!prefix || prefix.trim().length < 2 || !userId) {
    return [];
  }

  const { limit = 10, organizationId } = options;
  const sanitizedPrefix = prefix.trim().replace(/%/g, '\\%').replace(/_/g, '\\_');
  const likePattern = `CONCAT(?::text, '%')`;
  const params = [];
  const unionParts = [];

  let orgFilterDoc = '';
  let orgFilterMeet = '';
  if (organizationId) {
    orgFilterDoc = ' AND d.organization_id = ?';
    orgFilterMeet = ' AND m.organization_id = ?';
  }

  unionParts.push(`
    SELECT d.title AS suggestion, 'document'::text AS entity_type, d.id AS entity_id
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE d.title ILIKE ${likePattern}
      AND ${buildAccessCheck('d')}
      ${orgFilterDoc}
  `);
  params.push(userId, userId, sanitizedPrefix, userId, userId);
  if (organizationId) params.push(organizationId);

  unionParts.push(`
    SELECT m.title AS suggestion, 'meeting'::text AS entity_type, m.id AS entity_id
    FROM meetings m
    JOIN organization_members om ON m.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    JOIN organizations o ON m.organization_id = o.id AND o.is_active = true
    WHERE m.title ILIKE ${likePattern}
      ${orgFilterMeet}
  `);
  params.push(userId, sanitizedPrefix);
  if (organizationId) params.push(organizationId);

  unionParts.push(`
    SELECT LEFT(COALESCE(NULLIF(p.title, ''), p.text), 120) AS suggestion, 'paragraph'::text AS entity_type, p.id AS entity_id
    FROM paragraphs p
    JOIN documents d ON p.document_id = d.id
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE (p.title ILIKE ${likePattern} OR p.text ILIKE ${likePattern})
      AND ${buildAccessCheck('d')}
      ${orgFilterDoc}
  `);
  params.push(userId, userId, sanitizedPrefix, sanitizedPrefix, userId, userId);
  if (organizationId) params.push(organizationId);

  params.push(limit);

  const sql = `
    SELECT suggestion, entity_type, entity_id
    FROM (${unionParts.join(' UNION ALL ')}) suggestions
    WHERE suggestion IS NOT NULL AND suggestion <> ''
    ORDER BY suggestion
    LIMIT ?
  `;

  try {
    const result = await db.raw(sql, params);
    const rows = result.rows || result || [];
    return rows.map((r) => ({
      text: r.suggestion,
      entityType: r.entity_type,
      entityId: r.entity_id,
    }));
  } catch (err) {
    logger.error('Search suggestions error', { error: err.message, prefix, stack: err.stack });
    throw err;
  }
}

module.exports = {
  sanitizeSearchQuery,
  searchDocuments,
  searchParagraphs,
  searchMeetings,
  searchUnified,
  getSearchSuggestions,
};
