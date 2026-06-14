// API Response Types
// Centralized re-export of all API response types

// Common types
export * from './common';

// Domain-specific types
export * from './documents';
export * from './organizations';
export * from './scheduling';
export * from './meetings';
export * from './meetingMinutes';
export * from './governance';
export * from './auth';
export * from './error-reports';
export * from './activity';

// Re-export TreeProposalsResponse and TreeProposalResponse from main types
export type { TreeProposalsResponse, TreeProposalResponse } from "../../../types";

