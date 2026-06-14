import React, { useCallback, useState } from 'react';
import type { VoteReceiptPayload } from '../lib/verification/voteReceipt';
import { extractVoteReceipt, persistReceipt } from '../lib/verification/voteReceipt';

interface UseVoteReceiptCaptureOptions {
  userId: string | undefined;
  organizationId: string | undefined;
  contestTitle?: string;
}

export function useVoteReceiptCapture({
  userId,
  organizationId,
  contestTitle,
}: UseVoteReceiptCaptureOptions) {
  const [lastReceipt, setLastReceipt] = useState<VoteReceiptPayload | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const captureFromResponse = useCallback(
    async (response: unknown, overrides?: Partial<VoteReceiptPayload>) => {
      const extracted = extractVoteReceipt(response);
      if (!extracted || !userId || !organizationId) return null;
      const payload: VoteReceiptPayload = {
        ...extracted,
        organizationId,
        contestTitle: overrides?.contestTitle ?? contestTitle ?? extracted.contestTitle,
        ...overrides,
      };
      await persistReceipt(userId, organizationId, payload);
      setLastReceipt(payload);
      setDialogOpen(true);
      return payload;
    },
    [userId, organizationId, contestTitle]
  );

  return {
    lastReceipt,
    dialogOpen,
    setDialogOpen,
    captureFromResponse,
  };
}
