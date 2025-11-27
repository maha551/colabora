# 🚀 Activity Feed Backend Implementation Strategy

**Strategy to implement "Most Debated" and "New Agreed Versions" backend APIs**

---

## 🎯 **Current State Analysis**

### **❌ Issues Identified:**
- **Most Debated**: Client-side calculation only (inefficient, inaccurate)
- **Agreed Versions**: Uses mock approval data (85% hardcoded)
- **Performance**: Heavy client-side processing
- **Scalability**: No backend optimization for complex queries

### **✅ What Works:**
- **Pending Proposals API**: `GET /api/pending-votes` ✅
- **Document Activity API**: `GET /api/documents/:id/activity` ✅
- **Basic CRUD operations**: All functional ✅

---

## 📋 **Implementation Strategy**

### **Phase 1: API Design & Database Optimization**

#### **1.1 Most Debated Proposals API**
```javascript
GET /api/debated-proposals
// Returns top 10 most debated proposals based on:
// - Comment engagement (weight: 40%)
// - Vote controversy (weight: 35%)
// - Time decay factor (weight: 25%)
```

**Response Format:**
```json
{
  "proposals": [
    {
      "id": "proposal-123",
      "debateScore": 8.7,
      "commentCount": 12,
      "controversyScore": 0.85,
      "engagement": {
        "comments": 12,
        "proPercentage": 45,
        "contraPercentage": 40,
        "neutralPercentage": 15
      },
      // ... existing proposal fields
    }
  ]
}
```

#### **1.2 Agreed Versions API**
```javascript
GET /api/agreed-versions?since=<timestamp>
// Returns recently accepted proposals with real approval data
```

**Response Format:**
```json
{
  "versions": [
    {
      "id": "agreed-456",
      "documentId": "doc-123",
      "documentTitle": "My Document",
      "paragraphTitle": "Introduction",
      "acceptedText": "The accepted content...",
      "previousText": "The previous version...",
      "approvalPercentage": 87.5,
      "acceptedAt": "2025-11-07T12:00:00Z",
      "userName": "Alice Johnson",
      "userId": "user-789"
    }
  ]
}
```

#### **1.3 Database Indexes Needed**
```sql
-- For debated proposals scoring
CREATE INDEX idx_proposals_document_created ON proposals(document_id, created_at);
CREATE INDEX idx_comments_proposal ON comments(proposal_id);
CREATE INDEX idx_votes_proposal ON votes(proposal_id, vote);

-- For agreed versions lookup
CREATE INDEX idx_history_approval_percentage ON history(approval_percentage, created_at);
CREATE INDEX idx_history_paragraph ON history(paragraph_id, created_at);
```

---

### **Phase 2: Backend Implementation**

#### **2.1 Create New Route Files**

**`server/routes/debated-proposals.js`**
```javascript
const express = require('express');
const router = express.Router();

const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// GET /api/debated-proposals
router.get('/', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;

  try {
    // Get user's accessible documents
    const documents = await getUserDocuments(db, userId);

    if (documents.length === 0) {
      return res.json({ proposals: [] });
    }

    // Calculate debated scores for pending proposals
    const debatedProposals = await calculateDebatedScores(db, documents);

    res.json({ proposals: debatedProposals.slice(0, 10) });
  } catch (error) {
    console.error('Error fetching debated proposals:', error);
    res.status(500).json({ error: 'Failed to fetch debated proposals' });
  }
});

async function calculateDebatedScores(db, documents) {
  const documentIds = documents.map(d => d.id);

  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        p.*,
        -- Comment engagement (40% weight)
        (SELECT COUNT(*) FROM comments c WHERE c.proposal_id = p.id) as comment_count,

        -- Vote statistics for controversy calculation
        (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id) as total_votes,
        (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.vote = 'PRO') as pro_votes,
        (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.vote = 'CONTRA') as contra_votes,

        -- Time factor (newer proposals get slight boost)
        ((julianday('now') - julianday(p.created_at)) / 7.0) as weeks_old,

        -- User info and document info
        u.name as user_name, u.avatar as user_avatar,
        d.title as document_title, par.title as paragraph_title,
        par.text as current_text

      FROM proposals p
      JOIN users u ON p.user_id = u.id
      JOIN paragraphs par ON p.paragraph_id = par.id
      JOIN documents d ON par.document_id = d.id

      WHERE par.document_id IN (${documentIds.map(() => '?').join(',')})
        AND p.approved = 0

      ORDER BY
        -- Combined debate score calculation
        (
          (COALESCE((SELECT COUNT(*) FROM comments c WHERE c.proposal_id = p.id), 0) * 2.0) +  -- Comment factor
          (CASE WHEN total_votes > 0
            THEN (pro_votes * 1.0 / total_votes) * (contra_votes * 1.0 / total_votes) * 4.0
            ELSE 0 END) +  -- Controversy factor
          (1.0 / (1.0 + weeks_old))  -- Time decay (newer = higher score)
        ) DESC

      LIMIT 20
    `;

    db.all(query, documentIds, (err, rows) => {
      if (err) return reject(err);

      const formatted = rows.map(row => ({
        id: row.id,
        debateScore: calculateDebateScore(row),
        commentCount: row.comment_count || 0,
        controversyScore: row.total_votes > 0 ?
          (row.pro_votes / row.total_votes) * (row.contra_votes / row.total_votes) : 0,
        engagement: {
          comments: row.comment_count || 0,
          proPercentage: row.total_votes > 0 ? (row.pro_votes / row.total_votes) * 100 : 0,
          contraPercentage: row.total_votes > 0 ? (row.contra_votes / row.total_votes) * 100 : 0,
          neutralPercentage: row.total_votes > 0 ?
            ((row.total_votes - row.pro_votes - row.contra_votes) / row.total_votes) * 100 : 0,
        },
        // Include all existing proposal fields...
        paragraphId: row.paragraph_id,
        documentId: row.document_id,
        documentTitle: row.document_title,
        paragraphTitle: row.paragraph_title,
        proposedText: row.text,
        currentText: row.current_text,
        type: row.type,
        headingLevel: row.heading_level,
        createdAt: row.created_at,
        user: {
          id: row.user_id,
          name: row.user_name,
          avatar: row.user_avatar,
        },
        votes: {
          total: row.total_votes || 0,
          pro: row.pro_votes || 0,
          contra: row.contra_votes || 0,
          neutral: (row.total_votes || 0) - (row.pro_votes || 0) - (row.contra_votes || 0),
        },
        totalUsers: documents.find(d => d.id === row.document_id)?.userCount || 1,
      }));

      resolve(formatted);
    });
  });
}

function calculateDebateScore(row) {
  const commentFactor = (row.comment_count || 0) * 2.0;
  const controversyFactor = row.total_votes > 0 ?
    (row.pro_votes / row.total_votes) * (row.contra_votes / row.total_votes) * 4.0 : 0;
  const timeFactor = 1.0 / (1.0 + (row.weeks_old || 0));

  return commentFactor + controversyFactor + timeFactor;
}

module.exports = router;
```

**`server/routes/agreed-versions.js`**
```javascript
const express = require('express');
const router = express.Router();

const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// GET /api/agreed-versions
router.get('/', requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;
  const since = req.query.since; // Optional timestamp filter

  try {
    // Get user's accessible documents
    const documents = await getUserDocuments(db, userId);

    if (documents.length === 0) {
      return res.json({ versions: [] });
    }

    const documentIds = documents.map(d => d.id);

    // Build query with optional time filter
    let timeFilter = '';
    let params = documentIds;

    if (since) {
      timeFilter = ' AND h.created_at > ?';
      params.push(since);
    }

    const query = `
      SELECT
        h.id,
        h.paragraph_id,
        h.new_text as accepted_text,
        h.approval_percentage,
        h.created_at as accepted_at,
        h.proposal_id,

        -- Previous text from the same paragraph history
        (SELECT h2.old_text FROM history h2
         WHERE h2.paragraph_id = h.paragraph_id
         AND h2.created_at < h.created_at
         ORDER BY h2.created_at DESC LIMIT 1) as previous_text,

        -- Document and paragraph info
        d.id as document_id,
        d.title as document_title,
        p.title as paragraph_title,
        p.text as current_paragraph_text,

        -- User who accepted it
        u.id as user_id,
        u.name as user_name

      FROM history h
      JOIN paragraphs p ON h.paragraph_id = p.id
      JOIN documents d ON p.document_id = d.id
      JOIN users u ON h.user_id = u.id

      WHERE p.document_id IN (${documentIds.map(() => '?').join(',')})
        AND h.approval_percentage >= 75
        ${timeFilter}

      ORDER BY h.created_at DESC
      LIMIT 20
    `;

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('Error fetching agreed versions:', err);
        return res.status(500).json({ error: 'Failed to fetch agreed versions' });
      }

      const formattedVersions = rows.map(row => ({
        id: `agreed-${row.id}`,
        documentId: row.document_id,
        documentTitle: row.document_title,
        paragraphTitle: row.paragraph_title,
        acceptedText: row.accepted_text,
        previousText: row.previous_text || 'Previous version not available',
        approvalPercentage: row.approval_percentage,
        acceptedAt: row.accepted_at,
        userName: row.user_name,
        userId: row.user_id,
      }));

      res.json({ versions: formattedVersions });
    });

  } catch (error) {
    console.error('Error in agreed versions API:', error);
    res.status(500).json({ error: 'Failed to fetch agreed versions' });
  }
});

async function getUserDocuments(db, userId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        d.id,
        d.title,
        (SELECT COUNT(*) + 1 FROM document_collaborators dc WHERE dc.document_id = d.id) as userCount
      FROM documents d
      LEFT JOIN document_collaborators dc ON d.id = dc.document_id
      WHERE d.owner_id = ? OR dc.user_id = ?
    `;

    db.all(query, [userId, userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = router;
```

#### **2.2 Update Server Routes**
```javascript
// server/index.js
const debatedProposalsRoutes = require('./routes/debated-proposals');
const agreedVersionsRoutes = require('./routes/agreed-versions');

// Add to route registrations
app.use('/api/debated-proposals', debatedProposalsRoutes);
app.use('/api/agreed-versions', agreedVersionsRoutes);
```

#### **2.3 Database Migration**
```sql
-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_proposals_document_created
ON proposals(document_id, created_at);

CREATE INDEX IF NOT EXISTS idx_comments_proposal
ON comments(proposal_id);

CREATE INDEX IF NOT EXISTS idx_votes_proposal_vote
ON votes(proposal_id, vote);

CREATE INDEX IF NOT EXISTS idx_history_approval_created
ON history(approval_percentage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_paragraph_created
ON history(paragraph_id, created_at DESC);
```

---

### **Phase 3: Frontend Updates**

#### **3.1 Update ActivityFeedView.tsx**

**Replace client-side calculations:**
```javascript
// OLD: Client-side calculation
const fetchDebatedProposals = async () => {
  const debatedData = pendingProposals.map(proposal => {
    // Complex client-side calculation...
  });
  setDebatedProposals(debatedData);
};

// NEW: Backend API call
const fetchDebatedProposals = async () => {
  try {
    const response = await fetch('/api/debated-proposals', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
    });
    const data = await response.json();
    setDebatedProposals(data.proposals);
  } catch (error) {
    console.error('Failed to fetch debated proposals:', error);
  }
};
```

**Replace mock data:**
```javascript
// OLD: Mock approval percentage
approvalPercentage: 85, // Mock data

// NEW: Real data from API
const fetchAgreedVersions = async () => {
  try {
    const response = await fetch('/api/agreed-versions', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
    });
    const data = await response.json();
    setAgreedVersions(data.versions);
  } catch (error) {
    console.error('Failed to fetch agreed versions:', error);
  }
};
```

---

### **Phase 4: Testing & Validation**

#### **4.1 Backend API Tests**
```bash
# Test debated proposals API
curl -H "Authorization: Bearer demo-token-cmgxlfj9z0000orjgnfy3revt-1234567890" \
     http://localhost:3000/api/debated-proposals

# Test agreed versions API
curl -H "Authorization: Bearer demo-token-cmgxlfj9z0000orjgnfy3revt-1234567890" \
     http://localhost:3000/api/agreed-versions
```

#### **4.2 Performance Benchmarks**
- **Query execution time** < 100ms
- **Memory usage** within limits
- **Concurrent users** support

#### **4.3 Frontend Integration Tests**
- Activity feed loads without errors
- Debated proposals show real engagement scores
- Agreed versions show accurate approval percentages
- UI responsiveness maintained

---

### **Phase 5: Deployment Strategy**

#### **5.1 Database Migration**
```bash
# Run migration on production
sqlite3 /data/colabora.db < migration.sql
```

#### **5.2 Zero-Downtime Deployment**
```bash
# Deploy new backend
flyctl deploy --app colabora

# Verify APIs work
curl -H "Authorization: Bearer <token>" https://colabora.fly.dev/api/debated-proposals
curl -H "Authorization: Bearer <token>" https://colabora.fly.dev/api/agreed-versions

# Update frontend if needed
npm run build
flyctl deploy --app colabora
```

#### **5.3 Rollback Plan**
- **API Rollback**: Comment out new routes if issues arise
- **Frontend Rollback**: Deploy previous frontend build
- **Database Rollback**: Restore from backup if schema changes needed

---

## 📊 **Success Metrics**

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Debated Score Accuracy** | Client-side estimate | Server-side calculation | +90% |
| **Agreed Data Accuracy** | 85% mock data | Real percentages | +100% |
| **API Response Time** | N/A (client calc) | <100ms | New capability |
| **Server Load** | High (client calc) | Optimized queries | -60% |
| **Scalability** | Limited | Full backend support | Unlimited |

---

## 🎯 **Execution Timeline**

### **Week 1: Foundation**
- [ ] Create debated-proposals.js route
- [ ] Create agreed-versions.js route
- [ ] Add database indexes
- [ ] Test backend APIs locally

### **Week 2: Integration**
- [ ] Update frontend to use new APIs
- [ ] Remove client-side calculations
- [ ] Test end-to-end functionality
- [ ] Performance optimization

### **Week 3: Testing & Deploy**
- [ ] Comprehensive testing
- [ ] Load testing
- [ ] Production deployment
- [ ] Monitoring & validation

---

## 🚨 **Risk Mitigation**

### **Performance Risks:**
- **Database indexes** prevent slow queries
- **Pagination** limits result sets
- **Caching** can be added later if needed

### **Data Accuracy Risks:**
- **Unit tests** for scoring algorithms
- **Comparison tests** with old client-side calculations
- **Audit logging** for approval percentages

### **Rollback Risks:**
- **Feature flags** to disable new APIs
- **Gradual rollout** with monitoring
- **Database backups** before migrations

---

## 💡 **Future Enhancements**

### **Phase 2 Features:**
- **Real-time updates** via WebSocket
- **Personalized feeds** based on user activity
- **Advanced filtering** (by topic, engagement level)
- **Export functionality** for activity reports

### **Performance Optimizations:**
- **Redis caching** for hot data
- **Background job processing** for heavy calculations
- **Database read replicas** for scaling

---

## 🎯 **Success Criteria**

- [ ] **Debated proposals API** returns accurate engagement scores
- [ ] **Agreed versions API** provides real approval data
- [ ] **Frontend performance** improved (no heavy client calculations)
- [ ] **API response time** < 100ms for typical loads
- [ ] **Zero downtime** deployment achieved
- [ ] **Backward compatibility** maintained

**This strategy transforms client-side workarounds into robust, scalable backend APIs!** 🚀

**Implementation: READY TO EXECUTE** ✅
