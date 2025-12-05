# Task 3: TypeScript Type Improvements - Implementation Plan

**Date:** 2025-01-27  
**Status:** Planning Phase

## Executive Summary

This plan outlines the systematic replacement of all `any` types throughout the codebase with proper TypeScript types. The work will be done in phases, starting with high-impact areas (API layer) and moving to components and utilities.

## Current State Analysis

### Statistics
- **Total `any` occurrences:** ~123 instances across the codebase
- **Files affected:** ~40+ files
- **Priority areas:**
  1. `client/src/lib/api.ts` - 8 instances (high impact)
  2. Component props - ~50 instances (medium-high impact)
  3. Hooks - ~15 instances (medium impact)
  4. Error handling - ~20 instances (low-medium impact)
  5. Type definitions - 4 instances in `types/index.ts` (foundational)

### Categories of `any` Types

1. **API Response Types** (Priority: HIGH)
   - `apiRequest()` returns `Promise<any>`
   - `unapiRequest()` returns `Promise<any>`
   - Individual API functions lack return type annotations

2. **Component Props** (Priority: HIGH)
   - `currentUser: any` (appears in ~15 components)
   - `proposal: any`, `document: any`, `paragraph: any`
   - Event handlers: `onValueChange: (value: any) => void`

3. **Error Handling** (Priority: MEDIUM)
   - `catch (error: any)` blocks throughout
   - Should use `Error | unknown` with type guards

4. **WebSocket Data** (Priority: MEDIUM)
   - `data: any` in WebSocket message handlers

5. **State Variables** (Priority: MEDIUM)
   - `useState<any>(null)` in some components

6. **Type Definitions** (Priority: MEDIUM)
   - `StructureOperation.operationData?: any`
   - `StructureChange.oldData: any[]`
   - `StructureChange.newData: any`
   - `StructureChange.metadata: any`

7. **Array Types** (Priority: MEDIUM)
   - `any[]` should be `Type[]` (e.g., `Comment[]`, `Proposal[]`)

## Implementation Plan

### Phase 1: API Layer (Highest Priority)
**Files:** `client/src/lib/api.ts`

#### 1.1 Create API Response Type Interfaces
Create comprehensive response types for all API endpoints:

```typescript
// API Response Types
export interface DocumentsResponse {
  documents: Document[];
}

export interface DocumentResponse {
  document: Document;
}

export interface ParagraphResponse {
  paragraph: Paragraph;
}

export interface ProposalResponse {
  proposal: Proposal;
}

export interface VoteResponse {
  vote: Vote;
  message?: string;
}

export interface CommentResponse {
  comment: Comment;
  message?: string;
}

export interface OrganizationsResponse {
  organizations: Organization[];
}

export interface OrganizationResponse {
  organization: Organization;
}

export interface GovernanceRulesResponse {
  governanceRules: OrganizationGovernanceRules;
}

export interface ElectionsResponse {
  elections: RepresentativeElection[];
}

export interface VotingStatusResponse {
  document: Document;
  voting: {
    totalVotes: number;
    totalEligibleVoters: number;
    quorumRequired: number;
    quorumMet: boolean;
    voteBreakdown: {
      PRO: number;
      NEUTRAL: number;
      CONTRA: number;
    };
    approvalRate: number;
    canVote: boolean;
    userVote?: 'PRO' | 'NEUTRAL' | 'CONTRA';
  };
}

export interface StructureProposalsResponse {
  structureProposals: StructureProposal[];
}

export interface StructureProposalResponse {
  structureProposal: StructureProposal;
}

export interface AuthResponse {
  user: User;
  token?: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface RegisterResponse {
  user: User;
  token: string;
}

export interface CurrentUserResponse {
  user: User;
}

export interface DeletionStatusResponse {
  deletionProposed: boolean;
  deletionProposedAt?: string;
  deletionProposedBy?: string;
  deletionVoteDeadline?: string;
  deletionVotes?: {
    PRO: number;
    NEUTRAL: number;
    CONTRA: number;
  };
}
```

#### 1.2 Update `apiRequest` Function
```typescript
// BEFORE
export async function apiRequest(
  endpoint: string,
  options: RequestInit = {},
  retries: number = 2
): Promise<any>

// AFTER
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  retries: number = 2
): Promise<T>
```

#### 1.3 Update `unapiRequest` Function
```typescript
// BEFORE
async function unapiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any>

// AFTER
async function unapiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T>
```

#### 1.4 Update All API Functions with Return Types
```typescript
// Example: documentsApi
export const documentsApi = {
  async getDocuments(): Promise<DocumentsResponse> {
    return apiRequest<DocumentsResponse>('/api/documents');
  },
  
  async getDocument(id: string): Promise<DocumentResponse> {
    return apiRequest<DocumentResponse>(`/api/documents/${id}`);
  },
  
  // ... etc
}
```

#### 1.5 Fix `ApiError.details`
```typescript
// BEFORE
public details?: any

// AFTER
public details?: Record<string, unknown> | unknown
```

#### 1.6 Fix Internal Variables
```typescript
// BEFORE
let rawData: any = {}
const requestBody: any = { ... }

// AFTER
let rawData: Record<string, unknown> = {}
const requestBody: Record<string, unknown> = { ... }
```

#### 1.7 Fix Governance API Types
```typescript
// BEFORE
async updateGovernanceRules(organizationId: string, updates: any)

// AFTER
async updateGovernanceRules(
  organizationId: string, 
  updates: Partial<OrganizationGovernanceRules>
)
```

### Phase 2: Type Definitions (Foundational)
**Files:** `client/src/types/index.ts`

#### 2.1 Fix `StructureOperation.operationData`
```typescript
// Option 1: Use unknown with type guards
operationData?: unknown;

// Option 2: Create specific types for different operations
type SplitOperationData = {
  splitAt: number;
  newParagraphs: Array<{ text: string; order: number }>;
};

type MergeOperationData = {
  mergedText: string;
};

type OperationData = SplitOperationData | MergeOperationData | Record<string, unknown>;

// Then:
operationData?: OperationData;
```

#### 2.2 Fix `StructureChange` Types
```typescript
// BEFORE
export interface StructureChange {
  oldData: any[];
  newData: any;
  metadata: any;
}

// AFTER
export interface StructureChange {
  oldData: Array<{
    id: string;
    text: string;
    order: number;
    [key: string]: unknown;
  }>;
  newData: {
    id: string;
    text: string;
    order: number;
    [key: string]: unknown;
  };
  metadata: {
    operationType: StructureOperationType;
    performedBy: string;
    timestamp: string;
    [key: string]: unknown;
  };
}
```

### Phase 3: Hooks (Medium Priority)
**Files:** `client/src/hooks/*.ts`

#### 3.1 `useDocumentView.ts`
- Replace `currentUser: any` → `currentUser: User | null`
- Replace `catch (err: any)` → `catch (err: unknown)`
- Add type guards for error handling
- Fix map callbacks: `(paragraph: any)` → `(paragraph: unknown)`

#### 3.2 `useOrganizationData.ts`
- Replace `catch (error: any)` → `catch (error: unknown)`
- Replace `electionData: any` → proper interface
- Already has `PolicyVote[]` ✅

#### 3.3 `useDocuments.ts`
- Replace `catch (err: any)` → `catch (err: unknown)`
- Already has `User | null` ✅

#### 3.4 `useWebSocket.ts` and `useOrganizationWebSocket.ts`
- Replace `data: any` → `data: unknown`
- Add type guards or use generic types

### Phase 4: Component Props (High Priority)
**Files:** `client/src/components/**/*.tsx`

#### 4.1 Replace `currentUser: any`
**Affected components:**
- `Login.tsx`
- `DocumentViewPage.tsx`
- `DocumentsPage.tsx`
- `ActivityPage.tsx`
- `AppLayout.tsx`
- `DocumentDeletionProposal.tsx`
- `ElectionResults.tsx`
- `PublicGovernanceDashboard.tsx`
- `RuleProposalVotingInterface.tsx`
- `GovernanceRulesVotingInterface.tsx`
- `RuleProposalDialog.tsx`
- `CandidateNominationInterface.tsx`
- `ElectionVotingInterface.tsx`
- `ElectionCreationDialog.tsx`
- `GovernanceRulesDialog.tsx`

**Fix:**
```typescript
// BEFORE
currentUser: any;

// AFTER
currentUser: User | null;
```

#### 4.2 Replace Component-Specific Props
```typescript
// BEFORE
proposal: any;
document: any;
paragraph: any;
collaborator: any;

// AFTER
proposal: Proposal;
document: Document;
paragraph: Paragraph;
collaborator: DocumentCollaborator;
```

#### 4.3 Fix Event Handlers
```typescript
// BEFORE
onValueChange: (value: any) => void;
onChange: (value: any) => void;

// AFTER
onValueChange: (value: string) => void; // or appropriate type
onChange: (value: string | number | boolean) => void; // or union type
```

#### 4.4 Fix Array Props
```typescript
// BEFORE
policyVotes: any[];
paragraphs: any[];
organizations?: any[];
comments: any[];

// AFTER
policyVotes: PolicyVote[];
paragraphs: Paragraph[];
organizations?: Organization[];
comments: Comment[];
```

### Phase 5: Error Handling (Medium Priority)
**Files:** All files with `catch (error: any)`

#### 5.1 Standardize Error Handling
```typescript
// BEFORE
catch (error: any) {
  console.error('Error:', error);
  toast.error(error.message || 'An error occurred');
}

// AFTER
catch (error: unknown) {
  console.error('Error:', error);
  const message = error instanceof Error 
    ? error.message 
    : 'An error occurred';
  toast.error(message);
}
```

### Phase 6: State Variables (Low-Medium Priority)
**Files:** Components with `useState<any>`

#### 6.1 Fix State Types
```typescript
// BEFORE
const [deletionStatus, setDeletionStatus] = useState<any>(null);
const [enhancedDiffSuggestion, setEnhancedDiffSuggestion] = useState<any>(null);

// AFTER
const [deletionStatus, setDeletionStatus] = useState<DeletionStatusResponse | null>(null);
const [enhancedDiffSuggestion, setEnhancedDiffSuggestion] = useState<Proposal | null>(null);
```

### Phase 7: Utility Functions (Low Priority)
**Files:** `client/src/utils/*.ts`, `client/src/components/**/*.tsx`

#### 7.1 Fix Function Parameters
```typescript
// BEFORE
function findSimilarSuggestions(newText: string): any[] {
  // ...
}

// AFTER
function findSimilarSuggestions(newText: string): Proposal[] {
  // ...
}
```

## Implementation Order

1. **Phase 1: API Layer** (Days 1-2)
   - Create all API response types
   - Update `apiRequest` and `unapiRequest`
   - Update all API functions
   - Test API calls

2. **Phase 2: Type Definitions** (Day 2)
   - Fix `StructureOperation` and `StructureChange`
   - Test type compilation

3. **Phase 3: Hooks** (Day 3)
   - Fix all hooks
   - Test hook functionality

4. **Phase 4: Component Props** (Days 4-5)
   - Fix `currentUser` props
   - Fix other component props
   - Test components

5. **Phase 5: Error Handling** (Day 5)
   - Standardize error handling
   - Test error scenarios

6. **Phase 6: State Variables** (Day 6)
   - Fix useState types
   - Test state management

7. **Phase 7: Utilities** (Day 6)
   - Fix utility functions
   - Final cleanup

## Testing Strategy

### After Each Phase
1. Run TypeScript compiler: `cd client && npx tsc --noEmit`
2. Check for type errors in IDE
3. Run application and verify functionality
4. Test affected features manually

### Final Verification
1. Full TypeScript compilation check
2. No `any` types remaining (except intentional generics)
3. All features working correctly
4. No runtime errors

## Success Criteria

- ✅ All `any` types replaced with proper TypeScript types
- ✅ No type errors in TypeScript compilation
- ✅ Code maintains functionality (no breaking changes)
- ✅ Types are accurate and match actual data structures
- ✅ Existing types reused where possible
- ✅ New types created only when necessary
- ✅ Error handling uses `unknown` with type guards
- ✅ API responses are properly typed

## Notes and Considerations

1. **Generic Utilities**: Some `any` types may be intentional for generic utilities - use judgment
2. **Unknown vs Any**: When data is truly unknown, use `unknown` instead of `any` and add type guards
3. **Backward Compatibility**: Don't break existing functionality - types should match reality
4. **Complex Types**: If a type is complex, create an interface/type alias for it
5. **Gradual Migration**: Can be done incrementally, testing after each phase
6. **Type Guards**: Add type guards where needed for runtime type checking

## Files to Process (Priority Order)

### High Priority
1. `client/src/lib/api.ts` - API client (8 instances)
2. `client/src/types/index.ts` - Type definitions (4 instances)
3. `client/src/hooks/useDocumentView.ts` - Document view hook (10 instances)
4. `client/src/hooks/useOrganizationData.ts` - Organization hook (4 instances)

### Medium Priority
5. `client/src/components/App.tsx` - Main app component (15 instances)
6. `client/src/components/governance/*.tsx` - Governance components (~20 instances)
7. `client/src/components/OrganizationManagement/*.tsx` - Org management (~10 instances)
8. `client/src/pages/*.tsx` - Page components (~5 instances)

### Low Priority
9. `client/src/components/ActivityFeedView.tsx` - Activity feed (8 instances)
10. `client/src/components/ParagraphWithSuggestions.tsx` - Paragraph component (5 instances)
11. Remaining component files (~30 instances)

## Estimated Timeline

- **Total Estimated Time:** 5-6 days
- **Phase 1 (API):** 1-2 days
- **Phase 2 (Types):** 0.5 days
- **Phase 3 (Hooks):** 1 day
- **Phase 4 (Components):** 2 days
- **Phase 5-7 (Cleanup):** 1 day

---

**Next Steps:**
1. Review and approve this plan
2. Begin Phase 1: API Layer improvements
3. Test after each phase
4. Document any issues or edge cases encountered

