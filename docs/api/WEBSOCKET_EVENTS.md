# WebSocket Events Documentation

This document describes all WebSocket events used in the Colabora application for real-time updates.

## Overview

The application uses Socket.IO for WebSocket communication. Events are broadcast to document rooms (`document-{documentId}`) and organization rooms (`organization-{organizationId}`) for real-time updates.

## WebSocket Connection

**Client Hook:** `client/src/hooks/useWebSocket.ts`  
**Server Manager:** `server/modules/websocket.js`

### Connection Setup

```typescript
// Client-side connection
const socket = io(WS_URL, {
  auth: {
    token: localStorage.getItem('authToken')
  }
});

// Register session (required after connect)
socket.emit('register-session');

// Subscribe to document room (server event: subscribe-document)
socket.emit('subscribe-document', 'doc-123');

// Subscribe to organization room (server event: subscribe-organization)
socket.emit('subscribe-organization', 'org-456');
```

**Transports:** The server accepts both `websocket` and `polling` transports (unless `WS_TRANSPORT_WEBSOCKET_ONLY=true`). Clients can fall back to polling when WebSocket is blocked.

**Connection state recovery:** When a client reconnects with recovery, the server re-runs the auth middleware (`skipMiddlewares: false`) so the JWT is re-validated and stale sessions are avoided.

## Document Events

Document events are broadcast to the `document-{documentId}` room.

### Event Types

| Event Type | Description | Payload |
|------------|-------------|---------|
| `vote` | Vote cast on proposal | `{ type: 'vote', proposalId: string, paragraphId: string, vote: Vote }` |
| `comment` | Comment added/updated | `{ type: 'comment', proposalId: string, paragraphId: string, comment: Comment }` |
| `proposal` | Proposal created/updated | `{ type: 'proposal', paragraphId: string, proposal: Proposal }` |
| `paragraph` | Paragraph updated (agreed view) | `{ type: 'paragraph', paragraphId: string, paragraph: Paragraph }` |
| `paragraph-created` | New paragraph created | `{ type: 'paragraph-created', paragraphId: string, paragraph: Paragraph }` |
| `paragraph-updated` | Paragraph text/title updated | `{ type: 'paragraph-updated', paragraphId: string, text?: string, title?: string, headingLevel?: string }` |
| `document-vote` | Document-level vote cast | `{ type: 'document-vote', votes: DocumentVote[] }` |
| `document-status-changed` | Document status changed | `{ type: 'document-status-changed', oldStatus: string, newStatus: string }` |
| `proposal-cutoff-reached` | Proposal deadline reached | `{ type: 'proposal-cutoff-reached', proposalsLocked: boolean, message?: string }` |
| `deletion-proposed` | Document deletion proposed | `{ type: 'deletion-proposed', deletionProposedBy: string, deletionVoteDeadline: string }` |
| `deletion-vote` | Vote cast on deletion | `{ type: 'deletion-vote', documentId: string, voteId: string, userId: string, vote: 'PRO' \| 'NEUTRAL' \| 'CONTRA', action: string, allVotes: Array<...>, isAnonymous: boolean }` |
| `deletion-cancelled` | Deletion proposal cancelled | `{ type: 'deletion-cancelled' }` |
| `document-deleted` | Document deleted | `{ type: 'document-deleted' }` |
| `deletion-vote-rejected` | Deletion vote rejected | `{ type: 'deletion-vote-rejected' }` |
| `structure-proposal-vote` | Vote on structure proposal | `{ type: 'structure-proposal-vote', proposalId: string, voteId: string, userId: string, vote: 'PRO' \| 'NEUTRAL' \| 'CONTRA', action: string, allVotes: Array<...>, isAnonymous: boolean }` |
| `tree-proposal-vote` | Vote on tree proposal | `{ type: 'tree-proposal-vote', ... }` |

### Client-side processing

Document **social events** are processed immediately on the client for real-time UI updates, without batching:

- `vote`, `comment`, `comment-upvote`, `proposal`, `paragraph-created`, `paragraph-updated`

These events are applied as soon as they are received (high priority). Other document event types (e.g. structure proposals, deletion votes, `document-updated`) are queued and processed in batches. When batching is used, the client deduplicates updates by an entity-scoped key (e.g. document + event type + paragraph id or proposal id) so that multiple updates for different entities in the same batch are all applied rather than collapsed into one.

### Event Structure

All document events follow this structure:

```typescript
interface DocumentUpdate {
  documentId: string;
  eventType: DocumentUpdateEventType;
  data: DocumentUpdateData;
  timestamp: string;
}
```

### Example: Vote Event

```typescript
{
  documentId: 'doc-123',
  eventType: 'vote',
  data: {
    type: 'vote',
    proposalId: 'prop-456',
    paragraphId: 'para-789',
    vote: {
      id: 'vote-123',
      userId: 'user-456',
      proposalId: 'prop-456',
      vote: 'PRO',
      createdAt: '2025-01-27T10:00:00Z'
    }
  },
  timestamp: '2025-01-27T10:00:00Z'
}
```

### Example: Comment Event

```typescript
{
  documentId: 'doc-123',
  eventType: 'comment',
  data: {
    type: 'comment',
    proposalId: 'prop-456',
    paragraphId: 'para-789',
    comment: {
      id: 'comment-123',
      proposalId: 'prop-456',
      userId: 'user-456',
      text: 'This looks good!',
      createdAt: '2025-01-27T10:00:00Z',
      parentId: null
    }
  },
  timestamp: '2025-01-27T10:00:00Z'
}
```

### Example: Proposal Event

```typescript
{
  documentId: 'doc-123',
  eventType: 'proposal',
  data: {
    type: 'proposal',
    paragraphId: 'para-789',
    proposal: {
      id: 'prop-456',
      paragraphId: 'para-789',
      text: 'New proposal text',
      type: 'BODY',
      status: 'active',
      createdAt: '2025-01-27T10:00:00Z'
    }
  },
  timestamp: '2025-01-27T10:00:00Z'
}
```

### Example: Document Status Changed

```typescript
{
  documentId: 'doc-123',
  eventType: 'document-status-changed',
  data: {
    type: 'document-status-changed',
    oldStatus: 'proposal',
    newStatus: 'voting'
  },
  timestamp: '2025-01-27T10:00:00Z'
}
```

## Organization Events

Organization events are broadcast to the `organization-{organizationId}` room.

### Event Types

| Event Type | Description | Payload |
|------------|-------------|---------|
| `governance-rules-updated` | Governance rules changed | `{ type: 'governance-rules-updated', organizationId: string, ... }` |
| `election-created` | New election created | `{ type: 'election-created', election: RepresentativeElection }` |
| `member-added` | Member added to organization | `{ type: 'member-added', member: User }` |
| `member-removed` | Member removed from organization | `{ type: 'member-removed', userId: string }` |
| `representative-nominated` | Representative nominated | `{ type: 'representative-nominated', representative: User }` |
| `representative-removed` | Representative removed | `{ type: 'representative-removed', userId: string }` |
| `organization-vote-created` | Organization vote created | `{ type: 'organization-vote-created', vote: OrganizationVote }` |
| `organization-vote-updated` | Organization vote updated | `{ type: 'organization-vote-updated', vote: OrganizationVote }` |
| `rule-proposal-created` | Rule proposal created | `{ type: 'rule-proposal-created', proposal: RuleProposal }` |
| `rule-proposal-approved` | Rule proposal approved | `{ type: 'rule-proposal-approved', proposal: RuleProposal }` |
| `election-phase-changed` | Election phase changed | `{ type: 'election-phase-changed', electionId: string, oldPhase: string, newPhase: string }` |
| `candidate-nominated` | Candidate nominated | `{ type: 'candidate-nominated', electionId: string, candidate: ElectionCandidate }` |
| `candidate-accepted` | Candidate accepted nomination | `{ type: 'candidate-accepted', electionId: string, candidateId: string }` |
| `election-vote-cast` | Election vote cast | `{ type: 'election-vote-cast', electionId: string, vote: ElectionVote }` |
| `election-completed` | Election completed | `{ type: 'election-completed', electionId: string, results: ElectionResults }` |
| `representative-resignation-requested` | Representative resignation requested | `{ type: 'representative-resignation-requested', representativeId: string }` |
| `representative-resignation-finalized` | Representative resignation finalized | `{ type: 'representative-resignation-finalized', representativeId: string }` |

### Event Structure

All organization events follow this structure:

```typescript
interface OrganizationUpdate {
  organizationId: string;
  eventType: OrganizationUpdateEventType;
  data: OrganizationUpdateData;
  timestamp: string;
}
```

### Example: Governance Rules Updated

```typescript
{
  organizationId: 'org-123',
  eventType: 'governance-rules-updated',
  data: {
    type: 'governance-rules-updated',
    organizationId: 'org-123',
    rules: {
      representativeTermMonths: 12,
      electionVotingMethod: 'ranked_choice',
      // ... other rules
    }
  },
  timestamp: '2025-01-27T10:00:00Z'
}
```

### Example: Election Created

```typescript
{
  organizationId: 'org-123',
  eventType: 'election-created',
  data: {
    type: 'election-created',
    election: {
      id: 'election-456',
      organizationId: 'org-123',
      title: 'Representative Election 2025',
      status: 'nomination',
      positionsAvailable: 3,
      createdAt: '2025-01-27T10:00:00Z'
    }
  },
  timestamp: '2025-01-27T10:00:00Z'
}
```

## Meeting room

Meeting room events are used for the Meeting Minutes feature: real-time updates for minutes events, votes, brainstorm, moderators, and finalization. Clients join the room `meeting-{meetingId}` to receive these updates.

### Subscribe / Unsubscribe

- **subscribe-meeting** (client → server): Payload `meetingId` (string). Server resolves the meeting’s `organization_id`, then checks organization access via `checkOrganizationAccess(userId, organizationId)`. If allowed, the socket joins the room `meeting-{meetingId}`. If not, the server emits **subscription-error** with `{ type: 'meeting', id: meetingId, error: 'Access denied' }` (or `'Authentication required'` / `'Invalid meeting ID'` / `'Subscription failed'` as appropriate).
- **unsubscribe-meeting** (client → server): Payload `meetingId` (string). Server removes the socket from the room `meeting-{meetingId}`.

### meeting-update (server → client)

Emitted to room `meeting-{meetingId}`. Payload shape:

```typescript
interface MeetingUpdate {
  eventType: MeetingUpdateEventType;
  data: MeetingUpdateData | null;
  timestamp: string; // ISO 8601
}
```

### Event types and payloads

| eventType | When | data shape |
|-----------|------|------------|
| `minutes-event-added` | New event appended to minutes | `{ event: MinutesEvent }`. For brainstorm start/end, use this and check `data.event.eventType` (`brainstorm_started` or `brainstorm_ended`); `brainstorm_ended` payload includes `sourceEventId` (the brainstorm_started event id). |
| `minutes-paragraph-added` | New paragraph added to minutes document | `{ paragraphId: string, item?: TimelineParagraphItem }` — when `item` is present, clients can merge into timeline; otherwise refetch timeline. |
| `minutes-paragraph-updated` | Paragraph in minutes document updated | `{ paragraphId: string, item?: TimelineParagraphItem }` — when `item` is present, clients can patch timeline; otherwise refetch. |
| `minutes-paragraph-removed` | Paragraph deleted from minutes document | `{ paragraphId: string }` — clients remove that item from timeline. |
| `vote-started` | Meeting vote created | `{ meetingVoteId: string, title: string, vote?: MeetingVote }` — when `vote` is present, clients can set active vote without refetch. |
| `vote-ended` | Meeting vote closed | `{ meetingVoteId: string, result: object, vote?: MeetingVote }` — when `vote` is present, clients can set active vote without refetch. |
| `vote-updated` | Someone cast or changed vote | `{ meetingVoteId: string, responseCounts: Array<{ optionId: string, count: number }> }` |
| `brainstorm-option-added` | Option added to brainstorm | `{ brainstormEventId: string, option: object }` |
| `moderator-added` | Invited moderator added | `{ userId: string, userName: string }` |
| `moderator-removed` | Invited moderator removed | `{ userId: string }` |
| `minutes-finalized` | Minutes finalized | `{ finalizedAt: string }` |
| `agenda-reordered` | Agenda items reordered | `{ order?: Array<{ id: string, orderIndex: number }> }` — when `order` is present, clients can reorder agenda in state; otherwise refetch. |
| `agenda-item-added` | Agenda item created | `{ agendaItem: { id, title, orderIndex, ... } }` |
| `agenda-item-updated` | Agenda item updated | `{ agendaItem: { id, title, ... } }` |
| `agenda-item-removed` | Agenda item deleted | `{ agendaItemId: string }` |
| `current-topic-changed` | Current topic set or cleared | `{ currentAgendaItemId: string \| null }` |
| `minutes-timeline-reordered` | Timeline items reordered | `{}` — clients refetch timeline |

All `data` fields are transformed to camelCase by the server (e.g. `meetingVoteId`, `responseCounts`, `brainstormEventId`, `createdAt`). Clients should support both enriched payloads (merge when present) and legacy payloads (refetch when optional fields are missing).

### Example: subscribe and listen

```typescript
// Subscribe when entering meeting page
socket.emit('subscribe-meeting', meetingId);

socket.on('meeting-update', (update: MeetingUpdate) => {
  switch (update.eventType) {
    case 'minutes-event-added':
      // update.data.event
      break;
    case 'minutes-paragraph-added':
      // update.data.paragraphId — refetch timeline
      break;
    case 'vote-started':
      // update.data.meetingVoteId, update.data.title
      break;
    case 'vote-ended':
      // update.data.meetingVoteId, update.data.result
      break;
    case 'minutes-finalized':
      // update.data.finalizedAt
      break;
    // ... other event types
  }
});

// Unsubscribe when leaving meeting page
socket.emit('unsubscribe-meeting', meetingId);
```

### Room management

- **Room name:** `meeting-{meetingId}`
- **Access:** Users with access to the meeting’s organization (same as organization member/rep check)
- **Server broadcast:** `webSocketManager.broadcastMeetingUpdate(meetingId, eventType, data)`

## Client-Side Event Handling

### Document Events

```typescript
import { useWebSocket } from '../hooks/useWebSocket';

function MyComponent({ documentId }) {
  const { socket, isConnected } = useWebSocket(documentId);
  
  useEffect(() => {
    if (!socket) return;
    
    socket.on('document-update', (update: DocumentUpdate) => {
      switch (update.eventType) {
        case 'vote':
          // Handle vote update
          break;
        case 'comment':
          // Handle comment update
          break;
        case 'proposal':
          // Handle proposal update
          break;
        // ... other event types
      }
    });
    
    return () => {
      socket.off('document-update');
    };
  }, [socket]);
}
```

### Organization Events

```typescript
import { useOrganizationWebSocket } from '../hooks/useOrganizationWebSocket';

function MyComponent({ organizationId }) {
  const { socket, isConnected } = useOrganizationWebSocket(organizationId);
  
  useEffect(() => {
    if (!socket) return;
    
    socket.on('organization-update', (update: OrganizationUpdate) => {
      switch (update.eventType) {
        case 'governance-rules-updated':
          // Handle rules update
          break;
        case 'election-created':
          // Handle election creation
          break;
        // ... other event types
      }
    });
    
    return () => {
      socket.off('organization-update');
    };
  }, [socket]);
}
```

## Server-Side Broadcasting

Events are broadcast from the server using the WebSocket manager:

```javascript
// server/modules/websocket.js
const webSocketManager = require('./modules/websocket');

// Broadcast to document room
webSocketManager.broadcastToDocument(documentId, {
  eventType: 'vote',
  data: {
    type: 'vote',
    proposalId: 'prop-456',
    paragraphId: 'para-789',
    vote: voteData
  }
});

// Broadcast to organization room
webSocketManager.broadcastToOrganization(organizationId, {
  eventType: 'governance-rules-updated',
  data: {
    type: 'governance-rules-updated',
    organizationId: organizationId,
    rules: updatedRules
  }
});
```

## Authentication

WebSocket connections require authentication via JWT token:

```typescript
const socket = io(WS_URL, {
  auth: {
    token: localStorage.getItem('authToken')
  }
});
```

The server validates the token on connection and authorizes room access based on user permissions.

## Room Management

### Document Rooms

- **Room Name:** `document-{documentId}`
- **Access:** Users with access to the document
- **Auto-join:** When component subscribes via `useWebSocket(documentId)`
- **Auto-leave:** When component unmounts

### Organization Rooms

- **Room Name:** `organization-{organizationId}`
- **Access:** Members of the organization
- **Auto-join:** When component subscribes via `useOrganizationWebSocket(organizationId)`
- **Auto-leave:** When component unmounts

### Meeting Rooms

- **Room Name:** `meeting-{meetingId}`
- **Access:** Users with access to the meeting’s organization (organization member or representative)
- **Subscribe:** Client sends `subscribe-meeting` with `meetingId`; server checks meeting access then joins the room
- **Unsubscribe:** Client sends `unsubscribe-meeting` with `meetingId`

## Error Handling

WebSocket connections handle errors gracefully:

```typescript
socket.on('connect_error', (error) => {
  console.error('WebSocket connection error:', error);
  // Handle reconnection logic
});

socket.on('disconnect', (reason) => {
  console.log('WebSocket disconnected:', reason);
  // Handle disconnection
});
```

## Reconnection

The Socket.IO client automatically handles reconnection with exponential backoff. The connection state is tracked via the `isConnected` flag in the hooks.

## Best Practices

1. **Always unsubscribe** from events when components unmount
2. **Check connection state** before sending events
3. **Handle errors gracefully** with user-friendly messages
4. **Use room-based subscriptions** to limit event scope
5. **Validate event data** before updating state
6. **Debounce rapid updates** if needed for performance

## Related Documentation

- [Frontend API Documentation](FRONTEND_API.md) - API functions that trigger WebSocket events
- [Error Handling Documentation](ERROR_HANDLING.md) - Error handling patterns
- [Client Features Documentation](CLIENT_FEATURES.md) - API client utilities

