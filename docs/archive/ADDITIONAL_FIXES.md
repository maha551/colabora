# Additional Document Creation Fixes

## Issue Found: Parent Document Validation Bug for Organizational Documents

### Problem
When creating an organizational document with a `parentId`, the parent validation was never executed because:
1. The organizational check returns early (line 594)
2. The parent validation check happens after the return statement
3. Result: Organizational documents with parentId could be created without validating the parent belongs to the organization

### Location
`server/routes/documents.js` lines 558-615

### Fix
Moved parent validation inside the organizational check callback, so it runs after organization validation but before document creation:

```javascript
// For organizational documents, check representative status
if (ownershipType === 'organizational') {
  // ... organization validation ...
  db.get(..., (err, org) => {
    // ... check org ...
    
    // If parentId is provided, validate it before creating document
    if (parentId) {
      db.get('SELECT ...', [parentId], (parentErr, parentDoc) => {
        // Validate parent belongs to same organization
        // Validate parent ownership type matches
        createDocument();
      });
    } else {
      createDocument();
    }
  });
}
```

### Impact
- ✅ Organizational documents with parentId now properly validate parent
- ✅ Prevents creating documents with invalid parent relationships
- ✅ Maintains data integrity for document hierarchies

## Code Cleanup

### Removed Duplicate Validation
Removed redundant `organizationId` check that was happening twice:
- Removed early check at line 541-544
- Kept the check at line 559-562 (which also handles the async callback)

## Testing Recommendations

1. **Test Organizational Document with Parent:**
   - Create organizational document with valid parentId (same org)
   - Should succeed ✅
   - Create organizational document with invalid parentId (different org)
   - Should fail with validation error ✅

2. **Test Organizational Document without Parent:**
   - Create organizational document without parentId
   - Should succeed ✅

3. **Test Personal Document with Parent:**
   - Create personal document with valid parentId
   - Should succeed ✅

## Files Modified

1. `server/routes/documents.js` - Fixed parent validation for organizational documents, removed duplicate check

