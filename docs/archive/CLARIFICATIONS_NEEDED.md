# Clarifications Needed Before Starting Implementation

## 🎯 Business & Priority Questions

### 1. **Email Notification System**
**Current State:** Multiple TODOs indicate email notifications are not implemented:
- `server/modules/scheduler.js:289, 357`
- `server/modules/document-status.js:272`

**Questions:**
- Should we implement email notifications now, or remove the TODOs?
- If implementing, what email service should we use? (SendGrid, AWS SES, SMTP, etc.)
- What events should trigger emails? (proposal created, vote cast, document status changed, etc.)
- Is this a Phase 1 critical item or can it wait?

---

### 2. **Incomplete Features - Implement or Remove?**
**Current State:** Several features have TODOs indicating incomplete implementation:
- Admin role checks in document routes (`server/routes/documents.js:2379, 2424`)
- Average decision time calculation (`server/routes/governance.js:2020`)
- Policy votes API (`client/src/hooks/useOrganizationData.ts:158`)
- Election creation API (`client/src/hooks/useOrganizationData.ts:322`)

**Questions:**
- Are these features actively used/needed?
- Should we implement them in Phase 2, or remove the TODOs if not needed?
- What's the priority order if implementing?

---

### 3. **Breaking Changes Policy**
**Questions:**
- Are we allowed to make breaking changes to the API?
- Do we need to maintain backward compatibility?
- Are there active users we need to consider?
- Can we change database schema, or do we need migrations for existing data?

---

### 4. **Testing Requirements**
**Current State:** Tests exist but some are skipped (`describe.skip`)

**Questions:**
- What level of test coverage is required?
- Should we fix skipped tests or remove them?
- Do we need to add tests for all fixes, or just critical ones?
- Are integration tests required before deployment?

---

### 5. **Deployment Workflow**
**Current State:** 
- GitHub Actions workflows exist but reference AWS/ECR (may be outdated)
- Fly.io deployment via `fly deploy` or scripts
- `fly.toml` shows current Fly.io config

**Questions:**
- What's the actual deployment workflow? (GitHub Actions → Fly.io, or manual `fly deploy`?)
- Should we update/remove the AWS/ECR references in GitHub Actions?
- Do we need CI/CD pipeline fixes as part of Phase 1?
- Are there staging/production environments, or just production?

---

### 6. **Database Migration Strategy**
**Current State:**
- Multiple database files exist (50+ test databases)
- No clear migration system
- SQLite database on Fly.io volume

**Questions:**
- Do we need to preserve existing production data?
- Can we safely delete test database files?
- Should we implement a migration system in Phase 3, or is it urgent?
- How do we handle schema changes in production?

---

### 7. **Code Style & Standards**
**Current State:**
- Mix of callback and async/await patterns
- Inconsistent naming conventions
- No ESLint/Prettier config visible

**Questions:**
- Do you have existing code style preferences?
- Should we standardize on async/await everywhere, or keep callbacks where they are?
- Do you want ESLint/Prettier configured, or is it okay to skip for now?
- Any specific naming conventions to follow?

---

### 8. **JWT Security - Backward Compatibility**
**Current State:**
- JWT verification has issuer/audience checking disabled in one place
- This may have been done to fix existing auth issues

**Questions:**
- Are there existing tokens in production that would break if we re-enable issuer/audience checking?
- Should we implement a token migration strategy?
- Can we safely re-enable strict checking, or do we need a transition period?

---

### 9. **Error Handling Strategy**
**Current State:**
- Mix of try-catch and callback error handling
- Inconsistent error response formats

**Questions:**
- Should we standardize on async/await with try-catch everywhere?
- What error response format should we use? (consistent JSON structure)
- How should we handle errors in production? (log, notify, user-facing messages)

---

### 10. **Logging Strategy**
**Current State:**
- Extensive console.log usage
- Winston logger exists but not fully utilized

**Questions:**
- What log level should we use in production? (info, warn, error only?)
- Should we log to files, stdout, or external service?
- Do we need log aggregation (e.g., Datadog, LogRocket)?
- What sensitive data should never be logged?

---

### 11. **Environment Variables**
**Current State:**
- Some secrets have fallback values
- Validation only warns in production

**Questions:**
- Are Fly.io secrets already properly configured?
- Should we fail fast if secrets are missing, or use fallbacks?
- What's the minimum secret length/complexity requirement?
- Should we add a pre-deployment validation script?

---

### 12. **Organizational Document Workflow Verification**
**Current State:**
- Workflow exists: proposal → voting → agreed/rejected
- Scheduler handles transitions

**Questions:**
- Is this workflow currently working in production?
- Should we add tests to verify it works correctly?
- Are there known issues with the workflow we should fix?
- What's the expected behavior if voting deadline passes without quorum?

---

### 13. **Voting Threshold Configuration**
**Current State:**
- Documents have configurable `acceptance_threshold`
- Organizations can vote on thresholds via governance rules

**Questions:**
- Is the threshold voting feature fully implemented and working?
- Should we verify/test this as part of Phase 2?
- Are there edge cases we should handle? (e.g., threshold changes mid-vote)

---

### 14. **Phase Implementation Order**
**Questions:**
- Should we complete all of Phase 1 before starting Phase 2?
- Can we work on multiple phases in parallel?
- Are there dependencies between phases we should consider?
- What's the timeline expectation? (4 weeks realistic?)

---

### 15. **Documentation Requirements**
**Current State:**
- Some documentation exists but may be outdated
- Missing JSDoc comments in many places

**Questions:**
- How comprehensive should documentation be?
- Should we document all API endpoints?
- Do we need user-facing documentation updates?
- Is inline code documentation (JSDoc) required for all functions?

---

### 16. **Performance Considerations**
**Current State:**
- Activity feed limited to 50 items
- No pagination in some areas
- SQLite database (may have scaling concerns)

**Questions:**
- Are there performance issues we should address?
- Should we optimize queries as part of fixes?
- Is database performance a concern with current usage?
- Should we add database indexes as part of fixes?

---

### 17. **Security Audit**
**Questions:**
- Should we run a security audit before starting?
- Are there known security vulnerabilities we should prioritize?
- Should we add security headers, rate limiting improvements?
- Do we need to comply with any security standards (SOC2, GDPR, etc.)?

---

### 18. **Backup & Recovery**
**Current State:**
- SQLite database on Fly.io volume
- No clear backup strategy visible

**Questions:**
- Is there a backup strategy in place?
- Should we implement backups as part of fixes?
- How do we handle database corruption or data loss?
- Is this a Phase 1 critical item?

---

## 📋 Recommended Clarification Priority

### **Must Clarify Before Phase 1:**
1. ✅ Email notifications - implement or remove?
2. ✅ JWT security - backward compatibility concerns?
3. ✅ Deployment workflow - actual process?
4. ✅ Breaking changes policy
5. ✅ Environment variables - current Fly.io secrets status

### **Should Clarify Before Phase 2:**
6. Incomplete features - implement or remove?
7. Database migration strategy
8. Organizational document workflow - current status
9. Voting threshold configuration - verification needed?

### **Nice to Clarify:**
10. Code style preferences
11. Testing requirements
12. Documentation requirements
13. Performance considerations

---

## 🎯 Next Steps

1. **Review this list** and answer the questions
2. **Prioritize** which clarifications are most important
3. **Update** the strategy document with decisions
4. **Begin implementation** with clear direction

---

**Note:** Some of these may have obvious answers based on your preferences, but it's better to clarify upfront to avoid rework later.

