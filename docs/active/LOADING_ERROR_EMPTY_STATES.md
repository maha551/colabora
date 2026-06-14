# Loading, Error, and Empty State Patterns

This document describes the standard patterns for loading, error, and empty states in the client app. Use these conventions for consistency and maintainability.

## Loading states

### Prop naming

- **Use `isLoading`** for boolean loading state in component props and hooks.
- Avoid: `loading`, `isPending`, `isFetching`, or context-specific names like `documentLoading` at the component boundary when the child only needs a boolean. At the boundary you can pass `isLoading={documentLoading}`.
- When consuming props from parents that still use `loading`, map internally: `const isLoading = loading ?? false`.

### LoadingState component

Use **`client/src/components/ui/LoadingState.tsx`** for full-page or section content loading.

- **Skeleton mode** (`mode="skeleton"`): Use when the content will be replaced by a list, cards, or text.
  - `skeletonVariant="card"`: Document/list cards.
  - `skeletonVariant="list"`: List rows with avatar and lines.
  - `skeletonVariant="text"`: Paragraph-style lines.
  - `skeletonCount`: Number of skeleton items (e.g. 3, 5).
- **Spinner mode** (`mode="spinner"`): Use for full-page “Loading…” or inline action loading.
  - `spinnerSize`: `"sm"` | `"md"` | `"lg"`.

Examples:

```tsx
// Full-page or list content
<LoadingState isLoading={isLoading} mode="skeleton" skeletonVariant="card" skeletonCount={5}>
  <DocumentList documents={documents} />
</LoadingState>

// Full-page spinner (e.g. document loading)
<LoadingState isLoading={true} mode="spinner" spinnerSize="lg">
  <span />
</LoadingState>
```

- **LoadingSpinner** can still be used inside buttons or small inline actions; LoadingState uses it for `mode="spinner"`.

## Error states

### When to use what

- **Toasts** (`toast.error`): Transient or action errors (save failed, vote failed, network error on a user action). Use for one-off feedback that doesn’t replace the main content.
- **Inline ErrorState**: When the **main content** of a page or section failed to load (e.g. list of documents, member profile, search results). Show a clear message and a retry or navigation action.
- **ErrorBoundary**: For **React render errors** (uncaught exceptions in the component tree). Do not use it as the only way to handle data-load failures.

### ErrorState component

Use **`client/src/components/ui/ErrorState.tsx`** for inline “data load failed” UIs.

- Props: `message`, `onRetry?`, `onBack?`, `className?`.
- Use design tokens (e.g. `COLORS.status.error`, `SPACING`) for consistency.

Example:

```tsx
<ErrorState
  message="Search failed. Please try again."
  onRetry={() => performSearch(query, filters)}
/>
```

### Error boundary strategy

1. **App root**: One `ErrorBoundary` wraps the main app (e.g. in `App.tsx`) to catch render errors and show a fallback (Try Again, Reload, Report Error).
2. **Route / feature level**: Heavy sections (e.g. OrganizationManagement) may use additional `ErrorBoundary` wrappers with optional custom fallbacks so one failing tab doesn’t break the whole page.
3. **Data-load errors**: Handle with **toasts + inline ErrorState**, not only ErrorBoundary. ErrorBoundary does not catch async errors (e.g. failed `fetch`); those must be handled in the component and surfaced via toast and/or ErrorState.

## Empty states

### EmptyState component

Use **`client/src/components/ui/EmptyState.tsx`** for “no data” and “no results” screens.

- Props: `icon`, `title`, `description?`, `action?` (e.g. Button), `className?`.
- Use a consistent icon size (e.g. `h-16 w-16`) and the same padding and text hierarchy across the app.

Example:

```tsx
<EmptyState
  icon={<Icon name="Search" className="h-16 w-16" />}
  title="No documents found"
  description="Try a different search query."
  action={<Button onClick={onClearFilters}>Clear filters</Button>}
/>
```

- **ActivityFeedTabEmptyState** remains for activity feed tabs that need the extra “tip” block; visually align it with EmptyState (spacing, typography, icon size) or refactor it to use EmptyState internally if desired.

## Summary

| Pattern        | Use for                         | Component / approach      |
|----------------|---------------------------------|---------------------------|
| Loading        | Content that will be replaced   | `LoadingState` (skeleton) |
| Loading        | Full-page or action in progress | `LoadingState` (spinner)  |
| Error (action) | Save/vote/network failure       | `toast.error`             |
| Error (content)| Page/section failed to load    | `ErrorState` + toast      |
| Error (render) | Uncaught React errors           | `ErrorBoundary`           |
| Empty          | No data / no results            | `EmptyState`              |

Prop name for loading: **`isLoading`**.
