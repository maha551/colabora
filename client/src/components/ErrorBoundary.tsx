import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Icon } from './ui/Icon';
import { logger } from '../lib/logger';
import { errorReportsApi } from '../lib/api';
import { ErrorReportDialog } from './ErrorReportDialog';
import { COLORS } from '../lib/designSystem';
import { cn } from './ui/utils';
import i18n from '../i18n';

const IS_DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showErrorReport: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    showErrorReport: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Error Boundary caught an error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    const reportDescription = errorInfo?.componentStack?.trim()
      || (typeof window !== 'undefined'
        ? `ErrorBoundary captured a React error at ${window.location.pathname}`
        : 'ErrorBoundary captured a React error');

    errorReportsApi
      .submitReport({
        title: 'React Error',
        description: reportDescription,
        error_message: error.message,
        error_stack: error.stack,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      })
      .catch((err) => {
        logger.warn('Failed to submit error report', err);
      });

    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined, showErrorReport: false });
  };

  private handleShowErrorReport = () => {
    this.setState({ showErrorReport: true });
  };

  private handleCloseErrorReport = () => {
    this.setState({ showErrorReport: false });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const t = (key: string) => i18n.t(key, { ns: 'errors' });

      return (
        <>
          <Card className={`border-[var(--status-rejected-border)] ${COLORS.statusBg.error}`}>
            <CardHeader>
              <CardTitle className={cn('flex items-center gap-2', COLORS.status.error)}>
                <Icon name="AlertTriangle" className="h-5 w-5" />
                {t('errorBoundary.title')}
              </CardTitle>
              <CardDescription className={COLORS.status.error}>
                {t('errorBoundary.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {IS_DEV && this.state.error && (
                <div className="bg-red-100 border border-red-300 rounded p-3">
                  <p className="text-sm font-mono text-red-800">
                    {this.state.error.message}
                  </p>
                  {this.state.error.stack && (
                    <details className="mt-2">
                      <summary className={cn('text-xs cursor-pointer', COLORS.status.error)}>
                        {t('errorBoundary.stackTrace')}
                      </summary>
                      <pre className={cn('text-xs mt-1 whitespace-pre-wrap overflow-auto', COLORS.status.error)}>
                        {this.state.error.stack}
                      </pre>
                    </details>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={this.handleRetry}
                  className="gap-2"
                >
                  <Icon name="RefreshCw" className="h-4 w-4" />
                  {t('errorBoundary.tryAgain')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  {t('errorBoundary.reloadPage')}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={this.handleShowErrorReport}
                  className="gap-2"
                >
                  <Icon name="Bug" className="h-4 w-4" />
                  {t('errorBoundary.reportError')}
                </Button>
              </div>
            </CardContent>
          </Card>
          <ErrorReportDialog
            open={this.state.showErrorReport}
            onOpenChange={this.handleCloseErrorReport}
            initialError={{
              message: this.state.error?.message,
              stack: this.state.error?.stack,
            }}
            initialUrl={window.location.href}
          />
        </>
      );
    }

    return <>{this.props.children}</>;
  }
}
