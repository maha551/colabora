# Agent Task Prompts

**Date:** 2025-01-27  
**Purpose:** Prompts for other agents to complete remaining tasks

---

## Task 3: TypeScript Type Improvements - Replace `any` Types

### Context
We've started replacing `any` types in hooks (`useDocuments`, `useDocumentView`, `useOrganizationData`). There are more `any` types throughout the codebase that need proper type definitions.

### Current Status
- ✅ **COMPLETE:** 
  - `useDocuments.ts`: `currentUser: any` → `User | null`
  - `useDocumentView.ts`: `document: any` → `unknown` (needs further refinement)
  - `useOrganizationData.ts`: `policyVotes: any[]` → `PolicyVote[]`
- ⏳ **Remaining:** Many `any` types in components, API clients, and utilities

### Instructions

1. **Search for `any` Types:**
   ```bash
   # Find all files with 'any' types
   grep -r ": any" client/src --include="*.ts" --include="*.tsx"
   grep -r ": any\[\]" client/src --include="*.ts" --include="*.tsx"
   grep -r "any>" client/src --include="*.ts" --include="*.tsx"
   ```

2. **Priority Files to Fix:**
   - `client/src/lib/api.ts` - API response types
   - `client/src/components/*.tsx` - Component props and state
   - `client/src/hooks/*.ts` - Hook return types and parameters
   - `client/src/utils/*.ts` - Utility function types

3. **Create Proper Types:**
   - **For API Responses:** Create interfaces matching the actual API response structure
   - **For Component Props:** Use existing types from `client/src/types/index.ts` or create new ones
   - **For Function Parameters:** Use specific types instead of `any`
   - **For Arrays:** Use `Type[]` instead of `any[]`

4. **Example Replacements:**

   **API Response Types:**
   ```typescript
   // ❌ BEFORE
   async function getDocuments(): Promise<any> {
     return apiRequest('/api/documents');
   }
   
   // ✅ AFTER
   interface DocumentsResponse {
     documents: Document[];
   }
   
   async function getDocuments(): Promise<DocumentsResponse> {
     return apiRequest<DocumentsResponse>('/api/documents');
   }
   ```

   **Component Props:**
   ```typescript
   // ❌ BEFORE
   interface ComponentProps {
     data: any;
     onAction: (item: any) => void;
   }
   
   // ✅ AFTER
   interface ComponentProps {
     data: Document | Proposal | Suggestion; // Use union types if needed
     onAction: (item: Document) => void;
   }
   ```

   **Function Parameters:**
   ```typescript
   // ❌ BEFORE
   function processData(data: any): any {
     return transformedData;
   }
   
   // ✅ AFTER
   function processData(data: Document): ProcessedDocument {
     return transformedData;
   }
   ```

5. **Use Existing Types:**
   - Check `client/src/types/index.ts` for existing type definitions
   - Reuse types like `User`, `Document`, `Proposal`, `Suggestion`, `Paragraph`, etc.
   - Create new types only when necessary

6. **Handle Unknown/Untyped Data:**
   - For truly unknown data, use `unknown` instead of `any`
   - Add type guards or type assertions where needed
   - Example: `const data = response as Document;` (with validation)

7. **Files to Process (in order):**
   - Start with `client/src/lib/api.ts` (API client - high impact)
   - Then component files with `any` types
   - Then utility files
   - Finally, any remaining files

8. **Verification:**
   - Run TypeScript compiler: `cd client && npm run type-check` (if available)
   - Check for type errors in IDE
   - Ensure no `any` types remain in processed files

### Success Criteria
- All `any` types replaced with proper TypeScript types
- No type errors introduced
- Code maintains functionality
- Types are accurate and match actual data structures
- Reused existing types where possible

### Notes
- Some `any` types may be intentional (e.g., for generic utilities) - use judgment
- When in doubt, use `unknown` instead of `any` and add type guards
- Don't break existing functionality - types should match reality
- If a type is complex, create an interface/type alias for it

---

## Additional Notes for Both Tasks

### Testing
After completing each task:
1. Run the application and verify it still works
2. Check for any runtime errors
3. Verify logs are working correctly (for Task 2)
4. Check TypeScript compilation (for Task 3)

### Documentation
- Update `docs/active/PROJECT_COMPLETION_STATUS.md` with progress
- Note any issues or edge cases encountered
- Document any new types created (for Task 3)

### Communication
- If you encounter issues or need clarification, document them
- Note any files that may need special handling
- Report completion status and remaining work

---

**Good luck! 🚀**

