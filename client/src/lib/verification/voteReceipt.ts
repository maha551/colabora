/**
 * Vote receipt persistence (local + server) for verifiability UX.
 */

import { verificationApi } from '../api/verification';
import { logger } from '../logger';

export interface VoteReceiptPayload {
  receiptId: string;
  contestId: string;
  voteType: string;
  voteRecordedAt?: string;
  organizationId?: string;
  contestTitle?: string;
}

const STORAGE_PREFIX = 'colabora:vote-receipts:v1';

function storageKey(userId: string, organizationId: string) {
  return `${STORAGE_PREFIX}:${userId}:${organizationId}`;
}

export function extractVoteReceipt(response: unknown): VoteReceiptPayload | null {
  if (!response || typeof response !== 'object') return null;
  const r = response as Record<string, unknown>;
  const receiptId = (r.receiptId ?? r.receipt_id ?? r.ballotId ?? r.ballot_id) as string | undefined;
  const contestId = (r.contestId ?? r.contest_id) as string | undefined;
  const voteType = (r.voteType ?? r.vote_type) as string | undefined;
  if (!receiptId || !contestId || !voteType) return null;
  return {
    receiptId: String(receiptId),
    contestId: String(contestId),
    voteType: String(voteType),
    voteRecordedAt: (r.voteRecordedAt ?? r.vote_recorded_at) as string | undefined,
    organizationId: (r.organizationId ?? r.organization_id) as string | undefined,
    contestTitle: (r.contestTitle ?? r.contest_title) as string | undefined,
  };
}

export function saveReceiptLocally(
  userId: string,
  organizationId: string,
  payload: VoteReceiptPayload
): void {
  try {
    const key = storageKey(userId, organizationId);
    const existing = JSON.parse(localStorage.getItem(key) || '[]') as VoteReceiptPayload[];
    const mapKey = `${payload.voteType}:${payload.contestId}`;
    const filtered = existing.filter(
      (item) => `${item.voteType}:${item.contestId}` !== mapKey
    );
    filtered.unshift({ ...payload, organizationId });
    localStorage.setItem(key, JSON.stringify(filtered.slice(0, 200)));
  } catch (err) {
    logger.warn('Failed to save vote receipt locally', err);
  }
}

export function listLocalReceipts(userId: string, organizationId: string): VoteReceiptPayload[] {
  try {
    const key = storageKey(userId, organizationId);
    return JSON.parse(localStorage.getItem(key) || '[]') as VoteReceiptPayload[];
  } catch {
    return [];
  }
}

export function getLocalReceipt(
  userId: string,
  organizationId: string,
  voteType: string,
  contestId: string
): VoteReceiptPayload | null {
  return (
    listLocalReceipts(userId, organizationId).find(
      (r) => r.voteType === voteType && r.contestId === contestId
    ) ?? null
  );
}

export async function persistReceipt(
  userId: string,
  organizationId: string,
  payload: VoteReceiptPayload
): Promise<void> {
  saveReceiptLocally(userId, organizationId, payload);
  try {
    await verificationApi.saveMyReceipt({
      organizationId,
      voteType: payload.voteType,
      contestId: payload.contestId,
      receiptId: payload.receiptId,
      contestTitle: payload.contestTitle,
      voteRecordedAt: payload.voteRecordedAt,
    });
  } catch (err) {
    logger.warn('Failed to save vote receipt on server', err);
  }
}

export async function checkReceiptOnOfficialList(
  voteType: string,
  contestId: string,
  receiptId: string
): Promise<boolean> {
  const { receiptIds } = await verificationApi.getReceipts(voteType, contestId);
  return receiptIds.includes(receiptId);
}
