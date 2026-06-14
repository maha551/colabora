/**
 * Window object extensions for third-party libraries and debugging
 */

interface Window {
  // html2canvas library (loaded dynamically)
  html2canvas?: (
    element: HTMLElement,
    options?: {
      height?: number;
      width?: number;
      scale?: number;
      [key: string]: unknown;
    }
  ) => Promise<HTMLCanvasElement>;

  // Console logs capture for error reporting (development/debugging)
  __consoleLogs__?: Array<{
    level: string;
    message: string;
    timestamp: string;
    [key: string]: unknown;
  }>;
}

