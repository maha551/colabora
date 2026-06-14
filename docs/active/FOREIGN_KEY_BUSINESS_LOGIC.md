# Foreign Key Business Logic Implementation

**Date:** 2025-01-27  
**Status:** ✅ Implemented

---

## 📋 **Business Rules**

Based on user requirements:

1. **Private user content** → Should stay (preserve user_id, no ON DELETE CASCADE)
2. **Shared user content** → Should go to collaborators (preserve user_id, handle transfer in application logic)
3. **Organizational documents** → Already owned by organization (no user deletion impact)

---

## ✅ **Implementation Strategy**

### **1. Content & History Records** (Preserve History)
**No ON DELETE** - Keep user_id even if user is deleted:
- `proposals.user_id` - Preserve proposal history
- `votes.user_id` - Preserve vote history
- `comments.user_id` - Preserve comment history
- `history.user_id` - Preserve paragraph change history
- `structure_proposals.user_id` - Preserve structure proposal history
- `structure_proposal_votes.user_id` - Preserve structure vote history
- `structure_proposal_comments.user_id` - Preserve comment history
- `document_tree_proposals.proposed_by_user_id` - Preserve proposal history
- `document_tree_proposal_votes.user_id` - Preserve vote history
- `document_deletion_votes.user_id` - Preserve vote history
- `document_votes.user_id` - Preserve vote history
- `election_candidates.user_id` - Preserve candidate record
- `election_votes.user_id` - Preserve vote history
- `representative_terms.user_id` - Preserve term history
- `voting_session_votes.user_id` - Preserve vote (may be anonymous)
- `voter_tokens.user_id` - Preserve token
- `vote_ballots.user_id` - Preserve ballot
- `organization_members.user_id` - Preserve membership history
- `organization_representatives.user_id` - Preserve representative history

### **2. Optional References** (Set to NULL)
**ON DELETE SET NULL** - Allow NULL if user is deleted:
- `document_status_history.changed_by` - Preserve history but allow NULL
- `representative_elections.created_by` - Preserve election but allow NULL
- `election_candidates.nominated_by` - Allow NULL if nominator deleted
- `representative_terms.removed_by` - Allow NULL if remover deleted
- `voting_sessions.created_by` - Preserve session but allow NULL
- `policy_votes.created_by` - Preserve policy vote but allow NULL
- `organization_audit.performed_by_user_id` - Preserve audit but allow NULL
- `organization_audit.affected_user_id` - Preserve audit but allow NULL
- `governance_rule_proposals.created_by` - Preserve proposal but allow NULL
- `governance_rule_history.changed_by_user_id` - Preserve history but allow NULL
- `organization_votes.proposed_by_user_id` - Preserve vote but allow NULL
- `organization_votes.approved_by_rep_id` - Preserve vote but allow NULL
- `organization_members.invited_by_rep_id` - Allow NULL if inviter deleted
- `organization_invitations.invited_by` - Allow NULL if inviter deleted
- `organization_invitations.accepted_by_user_id` - Allow NULL if accepter deleted

### **3. User-Owned Documents** (Preserve Content)
**No foreign key on `documents.owner_id`** - Intentionally no FK because:
- Can reference either `users.id` OR `organizations.id`
- SQL doesn't support conditional foreign keys
- Validated via CHECK constraint and application-level validation
- **Private documents:** Preserve owner_id (no ON DELETE)
- **Shared documents:** Preserve owner_id, handle transfer to collaborators in application logic
- **Organizational documents:** Owned by organization (no user deletion impact)

### **4. Document Relationships**
- `documents.organization_id` → `ON DELETE CASCADE` - Delete org docs when org deleted
- `documents.parent_id` → `ON DELETE SET NULL` - Children become root when parent deleted
- `documents.deletion_proposed_by` → `ON DELETE SET NULL` - Allow NULL if proposer deleted

### **5. Notification & User Preferences** (Delete with User)
**ON DELETE CASCADE** - Delete when user is deleted:
- `notifications.user_id` - User-specific notifications
- `notification_preferences.user_id` - User preferences
- `notification_digest_queue.user_id` - User digest queue

### **6. Error Reports** (Set to NULL)
**ON DELETE SET NULL** - Preserve reports but allow NULL:
- `error_reports.user_id` - Allow NULL if reporter deleted
- `error_reports.assigned_to` - Allow NULL if assignee deleted

---

## 🔄 **Shared Document Ownership Transfer**

For shared documents when owner is deleted:
- **Current:** `owner_id` is preserved (no ON DELETE)
- **Future:** Application logic should transfer ownership to a collaborator
- **Implementation:** Add user deletion handler that:
  1. Finds all shared documents where user is owner
  2. Transfers ownership to first active collaborator
  3. If no collaborators, document becomes orphaned (preserved but inaccessible)

---

## ✅ **Summary**

**Preserved (No ON DELETE):**
- All content records (proposals, votes, comments, history)
- User-owned documents (private & shared)
- Membership and representative records

**Set to NULL (ON DELETE SET NULL):**
- Optional references (created_by, nominated_by, etc.)
- Audit trail references (preserve history but allow NULL)

**Deleted (ON DELETE CASCADE):**
- User-specific data (notifications, preferences)
- Organizational documents when org deleted

**Special Cases:**
- `documents.owner_id` - No FK (can be user or org)
- Shared documents - Handle transfer in application logic

---

## 📝 **Notes**

1. **User deletion** should be handled carefully:
   - Content is preserved (good for history)
   - Shared documents need ownership transfer logic
   - Application should handle "deleted user" display

2. **Organizational documents** are safe:
   - Owned by organization, not individual users
   - Deleted when organization is deleted (CASCADE)

3. **History preservation** is important:
   - All content records keep user_id
   - Application can show "Deleted User" for display
   - Audit trails remain intact

