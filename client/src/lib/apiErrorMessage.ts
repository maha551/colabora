export function getApiErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: unknown }).response;
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = (response as { data?: unknown }).data;
      if (typeof data === 'object' && data !== null && 'error' in data) {
        const apiError = (data as { error?: unknown }).error;
        if (typeof apiError === 'string' && apiError.trim()) {
          return apiError;
        }
      }
    }
  }

  return fallbackMessage;
}
