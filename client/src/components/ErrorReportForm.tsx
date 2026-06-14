import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Icon } from './ui/Icon';
import { errorReportsApi, ApiError, type ErrorReportSubmission } from '../lib/api';
import { getUserFriendlyErrorMessage } from '../utils/errorMessages';
import { toast } from 'sonner';
import { logger } from '../lib/logger';

export interface ErrorReportFormProps {
  initialError?: {
    message?: string;
    stack?: string;
  };
  initialUrl?: string;
  /** Called after successful submit (e.g. close modal or navigate back) */
  onSuccess: () => void;
  /** Optional cancel/back (e.g. close modal or go back). If not provided, no Cancel button. */
  onCancel?: () => void;
  /** When true, form can sync URL from window (e.g. modal open or page mounted) */
  isActive?: boolean;
}

export function ErrorReportForm({
  initialError,
  initialUrl,
  onSuccess,
  onCancel,
  isActive = true,
}: ErrorReportFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errorMessage, setErrorMessage] = useState(initialError?.message || '');
  const [errorStack, setErrorStack] = useState(initialError?.stack || '');
  const [url, setUrl] = useState(initialUrl || window.location.href);
  const [consoleLogs, setConsoleLogs] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation('errors');

  useEffect(() => {
    if (isActive && !url) {
      setUrl(window.location.href);
    }
  }, [isActive, url]);

  const compressImage = (dataUrl: string, maxWidth: number = 1920, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const captureScreenshot = async () => {
    setCapturingScreenshot(true);
    try {
      const html2canvas = window.html2canvas;
      if (html2canvas) {
        const canvas = await html2canvas(document.body, {
          height: window.innerHeight,
          width: window.innerWidth,
          scale: 0.5,
        });
        let dataUrl = canvas.toDataURL('image/png');
        if (dataUrl.length > 1000000) {
          dataUrl = await compressImage(dataUrl, 1920, 0.7);
          toast.success('Screenshot captured and compressed');
        } else {
          toast.success('Screenshot captured');
        }
        setScreenshotUrl(dataUrl);
      } else {
        fileInputRef.current?.click();
      }
    } catch (error) {
      logger.error('Failed to capture screenshot', { error });
      toast.error('Failed to capture screenshot. You can upload one manually.');
      fileInputRef.current?.click();
    } finally {
      setCapturingScreenshot(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File too large. Please use an image smaller than 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result as string;
        if (result.length > 1000000) {
          const compressed = await compressImage(result, 1920, 0.7);
          setScreenshotUrl(compressed);
          toast.success('Screenshot uploaded and compressed');
        } else {
          setScreenshotUrl(result);
          toast.success('Screenshot uploaded');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const collectConsoleLogs = () => {
    try {
      const consoleLogsFromWindow = window.__consoleLogs__ || [];
      if (consoleLogsFromWindow.length > 0) {
        const logsText = consoleLogsFromWindow
          .slice(-50)
          .map((entry: { level?: string; message?: string }) => `[${entry.level || 'log'}] ${entry.message || ''}`)
          .join('\n');
        setConsoleLogs(logsText);
        toast.success('Console logs collected');
      } else {
        const logs = prompt('Paste any relevant console logs here (if any):');
        if (logs) setConsoleLogs(logs);
      }
    } catch (error) {
      logger.error('Failed to collect console logs', { error });
      const logs = prompt('Paste any relevant console logs here (if any):');
      if (logs) setConsoleLogs(logs);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (title.trim().length < 3) {
      toast.error('Title must be at least 3 characters');
      return;
    }
    if (!description.trim()) {
      toast.error('Please enter a description');
      return;
    }
    if (description.trim().length < 10) {
      toast.error('Description must be at least 10 characters');
      return;
    }

    setSubmitting(true);
    try {
      const report: ErrorReportSubmission = {
        title: title.trim(),
        description: description.trim(),
        error_message: errorMessage || undefined,
        error_stack: errorStack || undefined,
        url: url || undefined,
        console_logs: consoleLogs || undefined,
        screenshot_url: screenshotUrl || undefined,
        browser_info: JSON.stringify({
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
          cookieEnabled: navigator.cookieEnabled,
          onLine: navigator.onLine,
        }),
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
      };

      await errorReportsApi.submitReport(report);
      toast.success('Error report submitted successfully. Thank you!');
      setTitle('');
      setDescription('');
      setErrorMessage('');
      setErrorStack('');
      setConsoleLogs('');
      setScreenshotUrl('');
      onSuccess();
    } catch (error: unknown) {
      logger.error('Failed to submit error report', { error });
      let message = getUserFriendlyErrorMessage(error, 'Failed to submit error report. Please try again.');
      if (error instanceof ApiError && error.hasFieldErrors()) {
        const parts = error.getFieldErrorsArray().map((e) => e.message);
        if (parts.length > 0) message = parts.join('; ');
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="er-title">{t('reportForm.titleLabel')}</Label>
        <Input
          id="er-title"
          placeholder={t('reportForm.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="er-description">{t('reportForm.descriptionLabel')}</Label>
        <Textarea
          id="er-description"
          placeholder={t('reportForm.descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          disabled={submitting}
        />
      </div>

      {errorMessage && (
        <div className="space-y-2">
          <Label htmlFor="er-error-message">Error Message</Label>
          <Input
            id="er-error-message"
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
            disabled={submitting}
          />
        </div>
      )}

      {errorStack && (
        <div className="space-y-2">
          <Label htmlFor="er-error-stack">Error Stack Trace</Label>
          <Textarea
            id="er-error-stack"
            value={errorStack}
            onChange={(e) => setErrorStack(e.target.value)}
            rows={4}
            className="font-mono text-xs"
            disabled={submitting}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="er-url">Page URL</Label>
        <Input
          id="er-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="er-console-logs">{t('reportForm.consoleLabel')}</Label>
        <div className="flex gap-2">
          <Textarea
            id="er-console-logs"
            placeholder={t('reportForm.consolePlaceholder')}
            value={consoleLogs}
            onChange={(e) => setConsoleLogs(e.target.value)}
            rows={3}
            className="font-mono text-xs"
            disabled={submitting}
          />
          <Button type="button" variant="outline" size="sm" onClick={collectConsoleLogs} disabled={submitting}>
            {t('reportForm.addLogs')}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Screenshot (optional)</Label>
        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={captureScreenshot}
            disabled={submitting || capturingScreenshot}
            className="gap-2"
          >
            <Icon name="Image" className="h-4 w-4" />
            {capturingScreenshot ? 'Capturing...' : screenshotUrl ? 'Screenshot Ready' : 'Capture Screenshot'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting}
            className="gap-2"
          >
            <Icon name="Image" className="h-4 w-4" />
            Upload Image
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
        {screenshotUrl && (
          <div className="mt-2">
            <img
              src={screenshotUrl}
              alt="Screenshot preview"
              className="max-w-full h-32 object-contain border rounded"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setScreenshotUrl('')} className="mt-1 text-xs">
              Remove
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={submitting || !title.trim() || !description.trim()}
          className="gap-2"
        >
          {submitting ? (
            <>
              <Icon name="Loader2" className="h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Report'
          )}
        </Button>
      </div>
    </div>
  );
}
