import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { AlertTriangle } from 'lucide-react';
import { Organization } from '../../types';
import { governanceApi } from '../../lib/api';
import { toast } from 'sonner';

interface BootstrapCompletionDialogProps {
  organization: Organization;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function BootstrapCompletionDialog({
  organization,
  open,
  onOpenChange,
  onSuccess
}: BootstrapCompletionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const handleComplete = async () => {
    if (!confirm) {
      toast.error('Please confirm that you want to complete bootstrap mode');
      return;
    }

    setLoading(true);
    try {
      await governanceApi.completeBootstrap(organization.id, true);
      toast.success('Bootstrap mode completed successfully');
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to complete bootstrap:', error);
      toast.error(error.message || 'Failed to complete bootstrap mode');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete Bootstrap Mode</DialogTitle>
          <DialogDescription>
            Manually complete the bootstrap process for your organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>What this means:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Bootstrap mode will be disabled</li>
                <li>Current governance rules will be locked in</li>
                <li>Normal governance rules will apply going forward</li>
                <li>This action cannot be undone</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="confirm-bootstrap"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="confirm-bootstrap" className="text-sm">
              I understand that completing bootstrap will lock in the current governance rules
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleComplete}
              disabled={!confirm || loading}
            >
              {loading ? 'Completing...' : 'Complete Bootstrap'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

