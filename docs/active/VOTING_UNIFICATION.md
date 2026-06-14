# Voting Flow Unification

This codebase now treats voting as a shared product capability rather than a set of unrelated screens.

## Core Rules

- Use the shared vote vocabulary from `client/src/lib/voting.ts`.
- Keep selection controls in shared primitives such as `VoteButtonGroup`, `VoteRadioGroup`, and `MultipleChoiceVoting`.
- Keep result/progress displays in `VoteResultsDisplay` and `VoteProgressBar`.
- Use `useVoteSubmission` for request lifecycle handling and `useOptimisticVote` for paragraph-level optimistic updates.

## Adapter Layer

- Use `client/src/lib/votingAdapters.ts` for domain normalization.
- Document voting should map API responses into a single state update path.
- Rule voting should normalize backend payloads before the view layer sees them.
- Deletion vote progress should use aggregated counts instead of synthetic vote arrays.

## Status Vocabulary

- `draft` means prepared but not open.
- `active` means voting is open.
- `completed` means the vote has been closed and resolved.
- `approved`, `implemented`, and `applied` are success outcomes.
- `rejected`, `expired`, and `cancelled` are terminal negative outcomes.

## Performance Guidelines

- Do not expand vote counts into placeholder arrays when a count-based display is enough.
- Memoize derived vote counts and filter results on heavy screens.
- Prefer a single refresh or websocket confirmation path rather than multiple overlapping reloads.

## Extending Voting

When adding a new voting surface:

1. Define its adapter in `client/src/lib/votingAdapters.ts`.
2. Reuse shared vote controls and status helpers.
3. Add progress/result rendering through the shared display components.
4. Add at least one regression test for optimistic behavior or response normalization.

