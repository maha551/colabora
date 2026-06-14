// Error Reports API Response Types

export interface ErrorReport {
  id: string;
  // Support both camelCase (from API transformation) and snake_case (fallback)
  userId?: string;
  user_id?: string;
  userEmail?: string;
  user_email?: string;
  title: string;
  description: string;
  errorMessage?: string;
  error_message?: string;
  errorStack?: string;
  error_stack?: string;
  url?: string;
  userAgent?: string;
  user_agent?: string;
  browserInfo?: string;
  browser_info?: string;
  screenResolution?: string;
  screen_resolution?: string;
  consoleLogs?: string;
  console_logs?: string;
  screenshotUrl?: string;
  screenshot_url?: string;
  status: 'new' | 'in_progress' | 'resolved' | 'dismissed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  assigned_to?: string;
  resolutionNotes?: string;
  resolution_notes?: string;
  createdAt: string;
  created_at: string;
  updatedAt: string;
  updated_at: string;
  resolvedAt?: string;
  resolved_at?: string;
}

export interface ErrorReportSubmission {
  title: string;
  description: string;
  error_message?: string;
  error_stack?: string;
  url?: string;
  console_logs?: string;
  screenshot_url?: string;
  browser_info?: string;
  screen_resolution?: string;
}

export interface ErrorReportsResponse {
  reports: ErrorReport[];
}

export interface ErrorReportResponse {
  report: ErrorReport;
}

export interface ErrorReportStats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

