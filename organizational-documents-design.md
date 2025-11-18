# 🏛️ **Organizational Document Creation: Complete Design & Implementation Plan**

## 📊 **Current State Analysis**

### ✅ **Existing Components**
- **Document Creation**: Basic organizational document creation with proposal status
- **Voting Infrastructure**: `document_votes` table, `VoterManager` class, voting endpoints
- **Organization Management**: Membership validation, collaborator addition
- **Status Management**: Basic draft → proposal → agreed transitions
- **Agreement Logic**: `checkDocumentAgreementStatus()` function with deadline monitoring

### ❌ **Critical Gaps**
- **No Background Scheduler**: No automated deadline monitoring
- **Incomplete Status Flow**: Missing voting period and rejection states
- **No Quorum Logic**: Only approval percentage, no minimum participation
- **No Automated Transitions**: Status changes require manual triggers
- **Limited UI**: No voting interface for organizational documents

---

## 🏗️ **Design Architecture**

### **1. Status State Machine**

```
draft → proposal → voting → agreed
    ↓         ↓        ↓
   draft    expired   rejected
```

**Status Definitions:**
- **`draft`**: Initial state, document being created
- **`proposal`**: Document proposed to organization, awaiting deadline
- **`voting`**: Proposal deadline passed, active voting period
- **`agreed`**: Voting passed with required quorum and approval
- **`rejected`**: Voting failed or quorum not met
- **`expired`**: Proposal deadline passed without sufficient activity

### **2. Voting Period Management**

**Timeline:**
```
Document Created → Proposal Period (30 days) → Voting Period (7 days) → Final Status
```

**Configuration:**
- `proposal_deadline`: When proposal period ends
- `voting_deadline`: When voting period ends
- `min_voters_required`: Minimum votes for quorum
- `approval_threshold`: % of PRO votes required

### **3. Background Job System**

**Scheduler Components:**
- **Deadline Monitor**: Checks expired deadlines hourly
- **Status Updater**: Transitions documents between states
- **Notification Dispatcher**: Sends status change alerts

**Job Schedule:**
- `checkProposalDeadlines()`: Every 15 minutes
- `checkVotingDeadlines()`: Every 15 minutes
- `processExpiredDocuments()`: Every hour

---

## 📅 **Implementation Phases**

### **Phase 1: Core Infrastructure (Week 1)**

#### **1.1 Database Schema Enhancements**
```sql
-- Add voting period fields to documents table
ALTER TABLE documents ADD COLUMN voting_deadline DATETIME;
ALTER TABLE documents ADD COLUMN min_voters_required INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN voting_started_at DATETIME;

-- Add notification preferences
CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, notification_type)
);

-- Add document status history
CREATE TABLE IF NOT EXISTS document_status_history (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT,
  change_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);
```

#### **1.2 Background Job Scheduler**
```javascript
// server/modules/scheduler.js
class DocumentScheduler {
  constructor(db) {
    this.db = db;
    this.jobs = new Map();
  }

  start() {
    // Check proposal deadlines every 15 minutes
    this.jobs.set('proposal-check', setInterval(() => {
      this.checkProposalDeadlines();
    }, 15 * 60 * 1000));

    // Check voting deadlines every 15 minutes
    this.jobs.set('voting-check', setInterval(() => {
      this.checkVotingDeadlines();
    }, 15 * 60 * 1000));

    // Process expired documents hourly
    this.jobs.set('expired-check', setInterval(() => {
      this.processExpiredDocuments();
    }, 60 * 60 * 1000));
  }

  async checkProposalDeadlines() {
    // Find documents where proposal_deadline < now and status = 'proposal'
    // Transition to 'voting' status
  }

  async checkVotingDeadlines() {
    // Find documents where voting_deadline < now and status = 'voting'
    // Calculate final results and set to 'agreed' or 'rejected'
  }

  async processExpiredDocuments() {
    // Handle documents that have been in proposal too long without activity
  }
}
```

#### **1.3 Enhanced Status Management**
```javascript
// server/modules/document-status.js
class DocumentStatusManager {
  static async transitionToVoting(db, documentId, userId) {
    // Set voting_deadline = now + 7 days
    // Update status to 'voting'
    // Send notifications to all organization members
    // Log status change
  }

  static async transitionToAgreed(db, documentId, userId) {
    // Update status to 'agreed'
    // Send success notifications
    // Log status change
  }

  static async transitionToRejected(db, documentId, userId, reason) {
    // Update status to 'rejected'
    // Send rejection notifications
    // Log status change with reason
  }
}
```

### **Phase 2: Voting Logic Enhancement (Week 2)**

#### **2.1 Quorum and Approval Logic**
```javascript
// Enhanced checkDocumentAgreementStatus function
async function checkDocumentAgreementStatus(db, documentId) {
  const doc = await getDocumentInfo(db, documentId);
  const eligibleVoters = await VoterManager.getEligibleVoters(db, documentId);
  const totalEligible = eligibleVoters.length;

  // Get actual votes
  const votes = await getDocumentVotes(db, documentId);
  const actualVotes = votes.length;

  // Check quorum (minimum 30% participation)
  const quorumMet = actualVotes >= Math.ceil(totalEligible * 0.3);

  if (!quorumMet) {
    // Not enough participation
    if (isVotingDeadlinePassed(doc.voting_deadline)) {
      return DocumentStatusManager.transitionToRejected(
        db, documentId, 'system', 'insufficient_participation'
      );
    }
    return; // Wait for more votes
  }

  // Calculate approval
  const proVotes = votes.filter(v => v.vote === 'PRO').length;
  const approvalRate = proVotes / actualVotes;

  if (approvalRate >= doc.acceptance_threshold) {
    return DocumentStatusManager.transitionToAgreed(db, documentId, 'system');
  } else if (isVotingDeadlinePassed(doc.voting_deadline)) {
    return DocumentStatusManager.transitionToRejected(
      db, documentId, 'system', 'insufficient_approval'
    );
  }
}
```

#### **2.2 Voting Period Management**
```javascript
// server/routes/documents.js - Enhanced creation
if (ownershipType === 'organizational') {
  // Set organization-specific defaults
  const votingPeriodDays = 7; // Configurable
  const minVotersPercentage = 30; // Minimum participation required

  params = [
    documentId, trimmedTitle, trimmedDescription, userId, ownershipType, null,
    organizationId, parentId || null, 'proposal',
    proposalDeadline.toISOString(), // proposal_deadline
    finalAcceptanceThreshold, votingAnonymous, votingAnonymityLocked,
    voteChangeAllowed, structureProposalsEnabled,
    votingPeriodDays, minVotersPercentage // Additional fields
  ];
}
```

#### **2.3 Notification System**
```javascript
// server/modules/notifications.js
class NotificationManager {
  static async notifyStatusChange(db, documentId, oldStatus, newStatus, recipients) {
    const document = await getDocumentInfo(db, documentId);

    const notifications = recipients.map(userId => ({
      id: uuidv4(),
      user_id: userId,
      type: 'document_status_change',
      title: `Document Status Changed`,
      message: `Document "${document.title}" changed from ${oldStatus} to ${newStatus}`,
      document_id: documentId,
      data: { oldStatus, newStatus }
    }));

    // Store notifications in database
    // Send email notifications
    // Send in-app notifications
  }

  static async notifyVotingStarted(db, documentId, organizationId) {
    const members = await getOrganizationMembers(db, organizationId);
    const recipients = members.map(m => m.user_id);

    return this.notifyStatusChange(db, documentId, 'proposal', 'voting', recipients);
  }
}
```

### **Phase 3: Frontend Implementation (Week 3)**

#### **3.1 Voting Interface Component**
```jsx
// client/src/components/OrganizationalDocumentVoting.jsx
function OrganizationalDocumentVoting({ document, user }) {
  const [votes, setVotes] = useState([]);
  const [userVote, setUserVote] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [canVote, setCanVote] = useState(false);

  useEffect(() => {
    loadVotingData();
  }, [document.id]);

  const loadVotingData = async () => {
    const data = await documentsApi.getVotingStatus(document.id);
    setVotes(data.votes);
    setUserVote(data.userVote);
    setDeadline(data.deadline);
    setCanVote(data.canVote);
  };

  const castVote = async (voteType) => {
    await documentsApi.castVote(document.id, voteType);
    loadVotingData(); // Refresh data
  };

  return (
    <div className="voting-interface">
      <div className="voting-header">
        <h3>Organizational Voting</h3>
        <div className="deadline">
          Voting ends: {formatDeadline(deadline)}
        </div>
      </div>

      <div className="vote-summary">
        <div className="vote-counts">
          <span>Pro: {votes.filter(v => v.vote === 'PRO').length}</span>
          <span>Neutral: {votes.filter(v => v.vote === 'NEUTRAL').length}</span>
          <span>Contra: {votes.filter(v => v.vote === 'CONTRA').length}</span>
        </div>
        <div className="progress-bar">
          {/* Visual progress indicator */}
        </div>
      </div>

      {canVote && (
        <div className="vote-buttons">
          <button onClick={() => castVote('PRO')} disabled={userVote === 'PRO'}>
            👍 Approve
          </button>
          <button onClick={() => castVote('NEUTRAL')} disabled={userVote === 'NEUTRAL'}>
            🤔 Neutral
          </button>
          <button onClick={() => castVote('CONTRA')} disabled={userVote === 'CONTRA'}>
            👎 Reject
          </button>
        </div>
      )}
    </div>
  );
}
```

#### **3.2 Status Display Component**
```jsx
function DocumentStatusDisplay({ document, user }) {
  const [status, setStatus] = useState(document.status);
  const [deadline, setDeadline] = useState(document.proposal_deadline);

  useEffect(() => {
    // Subscribe to real-time status updates
    const unsubscribe = documentsApi.subscribeToStatusChanges(
      document.id,
      (newStatus, newDeadline) => {
        setStatus(newStatus);
        setDeadline(newDeadline);
      }
    );

    return unsubscribe;
  }, [document.id]);

  const getStatusInfo = () => {
    switch (status) {
      case 'proposal':
        return {
          icon: '⏳',
          text: 'Proposal Period',
          description: `Voting starts ${formatDeadline(deadline)}`
        };
      case 'voting':
        return {
          icon: '🗳️',
          text: 'Voting in Progress',
          description: `Ends ${formatDeadline(deadline)}`
        };
      case 'agreed':
        return {
          icon: '✅',
          text: 'Approved',
          description: 'Document has been approved by the organization'
        };
      case 'rejected':
        return {
          icon: '❌',
          text: 'Rejected',
          description: 'Document was not approved'
        };
      default:
        return { icon: '📝', text: 'Draft', description: 'Document is being drafted' };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className={`status-display status-${status}`}>
      <div className="status-icon">{statusInfo.icon}</div>
      <div className="status-content">
        <div className="status-title">{statusInfo.text}</div>
        <div className="status-description">{statusInfo.description}</div>
      </div>
    </div>
  );
}
```

### **Phase 4: Integration & Testing (Week 4)**

#### **4.1 API Enhancements**
```javascript
// server/routes/documents.js - New endpoints
router.get('/:id/voting-status', requireAuth, requireDocumentAccess, async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;

  try {
    const document = await getDocumentInfo(db, documentId);
    const canVote = await VoterManager.canUserVote(db, documentId, userId);
    const votes = await getDocumentVotes(db, documentId);
    const userVote = votes.find(v => v.user_id === userId);

    res.json({
      canVote,
      userVote: userVote?.vote,
      totalVotes: votes.length,
      votes: document.voting_anonymous ? [] : votes, // Hide voters if anonymous
      deadline: document.voting_deadline,
      quorum: document.min_voters_required
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get voting status' });
  }
});

router.post('/:id/start-voting', requireAuth, requireDocumentAccess, async (req, res) => {
  // Admin endpoint to manually start voting period (for testing)
  const db = req.app.locals.db;
  const documentId = req.params.id;

  try {
    await DocumentStatusManager.transitionToVoting(db, documentId, req.user.id);
    res.json({ message: 'Voting period started' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start voting' });
  }
});
```

#### **4.2 Real-time Updates**
```javascript
// server/modules/websocket.js
class WebSocketManager {
  static broadcastDocumentUpdate(documentId, update) {
    // Broadcast status changes to all connected clients viewing the document
    this.io.to(`document-${documentId}`).emit('document-update', update);
  }

  static subscribeToDocument(documentId, socket) {
    socket.join(`document-${documentId}`);
  }
}
```

#### **4.3 Comprehensive Testing**
```javascript
// tests/integration/organizational-documents.test.js
describe('Organizational Document Workflow', () => {
  let orgId, documentId, adminToken, memberToken;

  beforeAll(async () => {
    // Setup organization with members
    // Create organizational document
  });

  test('should create document in proposal status', () => {
    // Verify document created with proposal status
    // Verify all org members added as collaborators
  });

  test('should transition to voting after proposal deadline', () => {
    // Fast-forward time past proposal deadline
    // Verify status changes to 'voting'
    // Verify notifications sent
  });

  test('should allow organization members to vote', () => {
    // Test voting by different members
    // Verify vote recording
    // Verify anonymous voting if enabled
  });

  test('should reach agreement when quorum and approval met', () => {
    // Cast sufficient PRO votes
    // Verify status changes to 'agreed'
    // Verify notifications sent
  });

  test('should reject when approval threshold not met', () => {
    // Cast insufficient PRO votes
    // Wait for voting deadline
    // Verify status changes to 'rejected'
  });

  test('should handle insufficient participation', () => {
    // Cast few votes (below quorum)
    // Wait for deadline
    // Verify status changes to 'rejected'
  });
});
```

---

## 📋 **Technical Specifications**

### **Database Schema Changes**
```sql
-- Documents table additions
ALTER TABLE documents ADD COLUMN voting_deadline DATETIME;
ALTER TABLE documents ADD COLUMN min_voters_required INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN voting_started_at DATETIME;

-- New tables
CREATE TABLE user_notifications (...);
CREATE TABLE document_status_history (...);
```

### **Configuration Constants**
```javascript
// server/config.js additions
ORGANIZATIONAL_DOCUMENTS: {
  PROPOSAL_PERIOD_DAYS: 30,
  VOTING_PERIOD_DAYS: 7,
  DEFAULT_QUORUM_PERCENTAGE: 30,
  DEFAULT_APPROVAL_THRESHOLD: 75
}
```

### **API Endpoints**
- `GET /api/documents/:id/voting-status` - Get voting information
- `POST /api/documents/:id/start-voting` - Admin: start voting period
- `GET /api/documents/:id/status-history` - Get status change history
- `POST /api/notifications/preferences` - Manage notification settings

### **WebSocket Events**
- `document-status-changed` - Status transition notifications
- `voting-updated` - Real-time vote updates
- `deadline-approaching` - Deadline warnings

---

## 🚀 **Deployment Strategy**

### **5.1 Feature Flags**
```javascript
// Enable organizational documents gradually
FEATURE_FLAGS: {
  ORGANIZATIONAL_DOCUMENTS: process.env.NODE_ENV === 'production' ? false : true,
  AUTOMATED_SCHEDULER: false, // Enable after testing
  REAL_TIME_UPDATES: false    // Enable after WebSocket testing
}
```

### **5.2 Migration Strategy**
1. **Phase 1**: Deploy database schema changes (safe, backward compatible)
2. **Phase 2**: Deploy backend logic (scheduler, enhanced status management)
3. **Phase 3**: Deploy frontend voting interface
4. **Phase 4**: Enable automated scheduler and real-time features

### **5.5 Rollback Plan**
- **Database**: Schema changes are additive, can be safely rolled back
- **Code**: Feature flags allow instant disabling
- **Data**: Status history table preserves all state changes

---

## 🎯 **Success Metrics**

### **Functional Requirements**
- ✅ 100% of organizational documents transition through complete workflow
- ✅ All eligible voters can participate in voting
- ✅ Status changes happen automatically at correct times
- ✅ Notifications sent for all status changes
- ✅ UI provides clear voting interface and status tracking

### **Performance Requirements**
- ✅ Status checks complete within 5 seconds
- ✅ Voting updates reflect in UI within 2 seconds
- ✅ Notification delivery within 1 minute
- ✅ Background jobs don't impact API response times

### **Quality Requirements**
- ✅ 95%+ test coverage for organizational document logic
- ✅ Zero data loss in status transitions
- ✅ Comprehensive error handling and logging
- ✅ Responsive UI on all device types

---

## 📅 **Timeline & Milestones**

| Phase | Duration | Deliverables | Status |
|-------|----------|-------------|---------|
| **Phase 1: Infrastructure** | Week 1 | Database schema, scheduler, status management | 🔄 In Progress |
| **Phase 2: Voting Logic** | Week 2 | Quorum logic, voting periods, notifications | ⏳ Pending |
| **Phase 3: Frontend** | Week 3 | Voting UI, status display, real-time updates | ⏳ Pending |
| **Phase 4: Integration** | Week 4 | Testing, deployment, monitoring | ⏳ Pending |

**Total Duration: 4 weeks**
**Risk Level: Medium** (Building on existing solid foundation)
**Dependencies: Node-cron, WebSocket library, enhanced testing framework**
