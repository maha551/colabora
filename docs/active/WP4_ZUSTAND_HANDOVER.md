# WP4 Zustand State Management — Handover for WP7f

## Store API

### useAuthStore (`client/src/stores/useAuthStore.ts`)
- **State:** `currentUser: User | null`, `authLoading: boolean`, `error: string | null`
- **Actions:** `setUser(user)`, `setAuthLoading(loading)`, `setError(error)`, `getAuthToken(): string | null`, `logout()`
- **Usage:** `useAuthStore((s) => s.currentUser)` etc. Hook `useAuth()` is implemented on top of this store and exposes `authToken` via `getAuthToken()`.

### useDocumentStore (`client/src/stores/useDocumentStore.ts`)
- **State:** `document: Document | null`, `documentLoadKey: number`, `agreedViewRefreshKey: number`, `loading: boolean`, `error: string | null`
- **Actions:** `setDocument(doc)`, `setDocumentLoadKey(key)`, `bumpDocumentLoadKey()`, `incrementAgreedViewRefreshKey()`, `setLoading(loading)`, `setError(error)`
- **Sync:** App syncs `currentDocument` and `documentLoadKey` from `useDocumentView()` into the store on each render.

### useVotingStore (`client/src/stores/useVotingStore.ts`)
- **State:** `votingState: Set<string>`
- **Actions:** `setVotingState(updater: Set<string> | (prev => Set<string>))`
- **Usage:** Same signature as React setState for drop-in replacement.

### useRealTimeStore (`client/src/stores/useRealTimeStore.ts`)
- **State:** `realTimeUpdatesEnabled: boolean`, `queuedUpdates: DocumentUpdate[]`
- **Actions:** `setRealTimeUpdatesEnabled(enabled)`, `setQueuedUpdates(updates)`, `clearQueuedUpdates()`
- **Derived:** `queuedUpdatesCount = queuedUpdates.length` (computed by consumers).

All stores are re-exported from `client/src/stores/index.ts`.

## Components already migrated to stores

- **DocumentViewPage:** Reads `document`, `documentLoadKey`, `agreedViewRefreshKey`, `currentUser`, real-time state, and voting state from the four stores. No longer receives these as props.
- **CollaboratorManagement:** Receives real-time and voting from DocumentViewPage, which gets them from stores; toggle/apply still use store actions and `onApplyQueuedUpdates` prop (logic in `useWebSocketUpdates`).
- **DocumentEditor, ParagraphWithSuggestions, SuggestionCard:** Receive `votingState` and `setVotingState` from DocumentViewPage, which now gets them from `useVotingStore`.
- **ActivityPage:** Uses `useVotingStore` for voting state; no longer receives voting props from AppRouter.
- **useDocumentOperations:** Uses `useVotingStore` for voting state internally.
- **useWebSocketUpdates:** Uses `useRealTimeStore` and `useVotingStore`; no longer receives voting/real-time from App.
- **Auth store consumers (≥3):** DocumentViewPage, `useTimezone`, `useTerritoryContext` read from `useAuthStore`. `useAuth()` is implemented on top of the store.

## DocumentViewPage props after WP4

**Current props (21):**  
`structureProposals`, `showStructureProposalMode`, `onAddSuggestion`, `onVote`, `onComment`, `onEditComment`, `onDeleteComment`, `onDeleteProposal`, `onLoadMoreComments`, `onUpvoteComment`, `onAddElement`, `onCollaboratorAdded`, `onCollaboratorRemoved`, `onStructureProposalCompleted`, `onCreateStructureProposal`, `onCloseStructureProposalMode`, `refreshStructureProposals`, `onSelectDocument`, `onDeleteDocument`, `onApplyQueuedUpdates`, `onNavigateToOrganization`.

**Candidates for WP7f (move to stores or context):**
- `documentLoadKey` — already in store; could be removed from any remaining prop surface if still passed elsewhere.
- `agreedViewRefreshKey` — in store.
- Structure proposal group: `structureProposals`, `showStructureProposalMode`, `onStructureProposalCompleted`, `onCreateStructureProposal`, `onCloseStructureProposalMode`, `refreshStructureProposals` could be wrapped in a structure-proposals context or store.
- Callback props (`onVote`, `onComment`, etc.) — can remain as props or be wrapped by a document-actions hook/store used by the page.

## Dependencies

- **Added:** `zustand` in `client/package.json`. Run `npm install` in `client/` if not already done.

## Test status

- Linter passes for modified files.
- No new tests were added; existing behavior preserved. Recommend running `npm run build` and full test suite before WP7f.
