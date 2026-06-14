# Structure Proposals Feature Documentation

## Overview

Structure proposals allow users to propose major structural changes to documents, such as reordering sections, merging paragraphs, deleting content, and changing heading levels. These proposals require voting and approval before being applied to the document.

**Related: document tree proposals.** This document describes only **structure proposals** (document outline). **Document tree proposals** are a different system: they apply to the organization's document hierarchy (move, reorder, or delete documents or folders in the org tree), use the `/api/document-tree-proposals` API, and are triggered from the organization documents view. For the distinction between both systems and where they fit in the architecture, see [ARCHITECTURE.md](../ARCHITECTURE.md) (Proposal & Voting System → Structure proposals vs document tree proposals).

## Features

- **Create Structure Proposals**: Propose structural changes with multiple operations
- **Vote on Proposals**: Cast PRO, NEUTRAL, or CONTRA votes
- **Approval System**: Proposals are automatically approved when they meet the document's acceptance threshold
- **Apply Changes**: Document owners/representatives can apply approved proposals
- **Comments**: Discuss proposals with threaded comments
- **Real-time Updates**: WebSocket notifications for proposal events

## Supported Operations

1. **MOVE**: Reorder a section to a new position
2. **MERGE**: Merge multiple sections into one
3. **DELETE**: Mark a section for deletion
4. **RENAME_HEADING**: Change a heading's title
5. **CHANGE_HEADING_LEVEL**: Change a heading's level (h1-h6)
6. **INSERT_NEW**: Insert a new section at a specific position

**Note**: SPLIT operation is not yet implemented.

## API Endpoints

### Create Structure Proposal

```
POST /api/documents/:documentId/structure-proposals
```

**Request Body:**
```json
{
  "title": "Reorganize Chapter 2",
  "description": "Optional description",
  "operations": [
    {
      "operationType": "MOVE",
      "targetParagraphId": "paragraph-id",
      "newPositionIndex": 2
    }
  ]
}
```

**Response:**
```json
{
  "structureProposal": {
    "id": "proposal-id",
    "title": "Reorganize Chapter 2",
    "description": "Optional description",
    "approved": false,
    "applied": false,
    "operations": [...],
    "votes": [],
    "comments": []
  }
}
```

### Get Structure Proposals

```
GET /api/documents/:documentId/structure-proposals
```

Returns all structure proposals for a document, enriched with operations, votes, and comments.

### Get Single Structure Proposal

```
GET /api/documents/:documentId/structure-proposals/:proposalId
```

Returns a single structure proposal with all related data.

### Vote on Proposal

```
POST /api/documents/:documentId/structure-proposals/:proposalId/vote
```

**Request Body:**
```json
{
  "vote": "PRO" | "NEUTRAL" | "CONTRA"
}
```

### Apply Proposal

```
POST /api/documents/:documentId/structure-proposals/:proposalId/apply
```

Only document owners (or organization representatives) can apply approved proposals.

### Delete Proposal

```
DELETE /api/documents/:documentId/structure-proposals/:proposalId
```

Only the proposal creator can delete their proposal (if not yet applied).

### Add Comment

```
POST /api/documents/:documentId/structure-proposals/:proposalId/comments
```

**Request Body:**
```json
{
  "text": "Comment text",
  "parentId": "optional-parent-comment-id"
}
```

## Database Schema

### structure_proposals

- `id`: TEXT PRIMARY KEY
- `document_id`: TEXT NOT NULL
- `user_id`: TEXT NOT NULL
- `title`: TEXT NOT NULL
- `description`: TEXT
- `status`: TEXT (draft, proposed, approved, rejected)
- `approved`: BOOLEAN DEFAULT 0
- `applied`: BOOLEAN DEFAULT 0
- `changes`: TEXT (deprecated, operations stored in structure_operations table)
- `voting_deadline`: DATETIME
- `acceptance_threshold`: REAL DEFAULT 75.0
- `created_at`: DATETIME
- `updated_at`: DATETIME

### structure_operations

- `id`: TEXT PRIMARY KEY
- `structure_proposal_id`: TEXT NOT NULL
- `operation_type`: TEXT NOT NULL
- `source_paragraph_ids`: TEXT (JSON array)
- `target_paragraph_id`: TEXT
- `new_position_index`: INTEGER
- `new_parent_id`: TEXT
- `new_text`: TEXT
- `new_heading_level`: TEXT
- `operation_data`: TEXT (JSON)
- `created_at`: DATETIME

### structure_proposal_votes

- `id`: TEXT PRIMARY KEY
- `structure_proposal_id`: TEXT NOT NULL
- `user_id`: TEXT NOT NULL
- `vote`: TEXT (PRO, NEUTRAL, CONTRA)
- `created_at`: DATETIME
- `updated_at`: DATETIME

### structure_proposal_comments

- `id`: TEXT PRIMARY KEY
- `structure_proposal_id`: TEXT NOT NULL
- `user_id`: TEXT NOT NULL
- `text`: TEXT NOT NULL
- `parent_id`: TEXT
- `created_at`: DATETIME
- `updated_at`: DATETIME

## WebSocket Events

### structure-proposal-created

Broadcast when a new structure proposal is created.

```json
{
  "proposalId": "proposal-id",
  "title": "Proposal title",
  "userId": "user-id",
  "operationCount": 3,
  "approved": false
}
```

### structure-proposal-approved

Broadcast when a proposal is approved (meets acceptance threshold).

```json
{
  "proposalId": "proposal-id",
  "documentId": "document-id"
}
```

### structure-proposal-applied

Broadcast when a proposal is applied to the document.

```json
{
  "proposalId": "proposal-id",
  "documentId": "document-id",
  "userId": "user-id"
}
```

### structure-proposal-vote

Broadcast when a vote is cast or updated.

```json
{
  "proposalId": "proposal-id",
  "voteId": "vote-id",
  "userId": "user-id",
  "vote": "PRO",
  "action": "cast",
  "allVotes": [...],
  "isAnonymous": false
}
```

## Validation Rules

### Create Proposal

- Title: Required, 3-200 characters
- Description: Optional, max 2000 characters
- Operations: Required array, 1-100 operations
- Operation type: Must be one of: MOVE, MERGE, DELETE, RENAME_HEADING, CHANGE_HEADING_LEVEL, INSERT_NEW
- targetParagraphId: Must be valid UUID (when required)
- newPositionIndex: Must be 0-10000 (when required)
- newText: Max 10000 characters (when required)
- newHeadingLevel: Must be h1-h6 (when required)

### Vote

- Vote: Must be PRO, NEUTRAL, or CONTRA

### Comment

- Text: Required, 1-2000 characters
- parentId: Optional, must be valid UUID

## Limitations

1. **SPLIT Operation**: Not yet implemented
   - The SPLIT operation is defined in TypeScript types but not implemented in the backend
   - Frontend does not currently provide UI for creating SPLIT operations
   - Implementation would require operation_data schema for split points and new paragraph definitions
   - See `server/routes/structure-proposals.js:1673-1681` for implementation details
   - This feature is planned for a future release
2. **One Active Proposal**: Only one active (non-approved, non-applied) proposal per document at a time
3. **Paragraph Modifications**: Paragraphs cannot be modified while there are active structure proposals
4. **Apply Permission**: Only document owners (or organization representatives) can apply proposals

## Usage Guide

### Creating a Proposal

1. Navigate to the document view
2. Click "Propose restructuring" button
3. Drag and drop sections to reorder
4. Check boxes to mark sections for merge or deletion
5. Enter a title and optional description
6. Submit the proposal

### Voting on a Proposal

1. View the structure proposal card
2. Click PRO, NEUTRAL, or CONTRA button
3. Your vote is recorded and the proposal may be auto-approved if threshold is met

### Applying a Proposal

1. Wait for proposal to be approved (meets acceptance threshold)
2. As document owner/representative, click "Apply Changes" button
3. Confirm the action (changes cannot be easily undone)
4. The structural changes are applied to the document

## Error Handling

Common error codes:

- `400`: Validation error (invalid operation type, missing fields, etc.)
- `403`: Permission denied (not owner/representative for apply, not creator for delete)
- `404`: Proposal not found
- `409`: Conflict (active proposal exists, proposal already applied)
- `500`: Server error

## Testing

Integration tests are located in `tests/integration/structure-proposals.test.js` and cover:

- Creating proposals with various operations
- Voting on proposals
- Applying approved proposals
- Deleting proposals
- Adding comments
- Error cases (invalid operations, permissions, etc.)

