import { useState } from 'react';
import { Document } from '../types';
import { exportApi } from '../lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Icon } from './ui/Icon';
import { logger } from '../lib/logger';
import { COLORS, RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';

interface ExportDialogProps {
  document: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ document, open, onOpenChange }: ExportDialogProps) {
  const [format, setFormat] = useState<'pdf' | 'markdown' | 'docx'>('pdf');
  const [version, setVersion] = useState<'official' | 'with_amendments'>('official');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showVersionOption = document.status === 'agreed' && document.amendmentsOpen;

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    
    try {
      const exportVersion = showVersionOption ? version : undefined;
      const blob = await exportApi.exportDocument(document.id, format, exportVersion);
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${document.title || 'document'}.${format}`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      onOpenChange(false);
    } catch (err) {
      logger.error('Export failed', err);
      setError(err instanceof Error ? err.message : 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Document</DialogTitle>
          <DialogDescription>
            Choose a format to export "{document.title}"
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Format</label>
            <Select value={format} onValueChange={(value: 'pdf' | 'markdown' | 'docx') => setFormat(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[200]" sideOffset={4}>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="markdown">Markdown</SelectItem>
                <SelectItem value="docx">Word (.docx)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showVersionOption && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Version</label>
              <Select value={version} onValueChange={(value: 'official' | 'with_amendments') => setVersion(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200]" sideOffset={4}>
                  <SelectItem value="official">Export official content</SelectItem>
                  <SelectItem value="with_amendments">Export with pending amendments (preview)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <div className={cn('text-sm p-3', RADIUS.control, COLORS.status.error, COLORS.statusBg.error)}>
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={exporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <>
                <Icon name="Loader2" className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Icon name="Download" className="mr-2 h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
