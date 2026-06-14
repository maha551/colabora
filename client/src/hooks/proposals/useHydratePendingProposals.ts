import { useState, useEffect, useCallback, useRef } from 'react';
import type { PendingDecisionEntry } from '../../types/decisions';
import type { RuleProposal, StructureProposal, DocumentTreeProposal } from '../../types';
import { logger } from '../../lib/logger';
import {
  fetchRuleProposalsForOrgs,
  fetchStructureProposalsForDocuments,
  fetchTreeProposalsForDocuments,
  fetchElectionVoteStatuses,
  fetchOrgVoteBallotsForOrgs,
  type ElectionVoteStatus,
  type OrgVoteBallotChoice,
} from '../../lib/proposals/fetchProposalBatches';

function payloadId(entry: PendingDecisionEntry): string {
  const p = entry.payload as Record<string, unknown>;
  return String(p.id ?? '');
}

function collectHydrationKeys(entries: PendingDecisionEntry[]) {
  const ruleOrgIds: string[] = [];
  const ruleProposalIds = new Set<string>();
  const structureDocIds: string[] = [];
  const structureProposalIds = new Set<string>();
  const treeDocIds: string[] = [];
  const treeProposalIds = new Set<string>();
  const electionOrgIds: string[] = [];
  const electionIds = new Set<string>();
  const orgVoteOrgIds: string[] = [];
  const orgVoteIds = new Set<string>();

  for (const entry of entries) {
    const id = payloadId(entry);
    if (!id) continue;

    switch (entry.kind) {
      case 'rule_proposal':
        if (entry.organizationId) ruleOrgIds.push(entry.organizationId);
        ruleProposalIds.add(id);
        break;
      case 'structure_proposal': {
        const docId = String(
          (entry.payload as Record<string, unknown>).documentId ?? entry.documentId ?? ''
        );
        if (docId) structureDocIds.push(docId);
        structureProposalIds.add(id);
        break;
      }
      case 'tree_proposal': {
        const docId = String(
          (entry.payload as Record<string, unknown>).documentId ?? entry.documentId ?? ''
        );
        if (docId) treeDocIds.push(docId);
        treeProposalIds.add(id);
        break;
      }
      case 'election':
        if (entry.organizationId) electionOrgIds.push(entry.organizationId);
        electionIds.add(id);
        break;
      case 'organization_vote':
        if (entry.organizationId) orgVoteOrgIds.push(entry.organizationId);
        orgVoteIds.add(id);
        break;
      default:
        break;
    }
  }

  return {
    ruleOrgIds,
    ruleProposalIds,
    structureDocIds,
    structureProposalIds,
    treeDocIds,
    treeProposalIds,
    electionOrgIds,
    electionIds,
    orgVoteOrgIds,
    orgVoteIds,
  };
}

export interface HydratedPendingProposals {
  ruleProposalsById: Map<string, RuleProposal>;
  structureProposalsById: Map<string, StructureProposal>;
  treeProposalsById: Map<string, DocumentTreeProposal>;
  electionVoteStatusById: Map<string, ElectionVoteStatus>;
  orgVoteBallotById: Map<string, OrgVoteBallotChoice>;
  loading: boolean;
  error: string | null;
  refreshHydration: () => Promise<void>;
}

export function useHydratePendingProposals(
  pendingDecisions: PendingDecisionEntry[]
): HydratedPendingProposals {
  const [ruleProposalsById, setRuleProposalsById] = useState<Map<string, RuleProposal>>(new Map());
  const [structureProposalsById, setStructureProposalsById] = useState<Map<string, StructureProposal>>(new Map());
  const [treeProposalsById, setTreeProposalsById] = useState<Map<string, DocumentTreeProposal>>(new Map());
  const [electionVoteStatusById, setElectionVoteStatusById] = useState<Map<string, ElectionVoteStatus>>(new Map());
  const [orgVoteBallotById, setOrgVoteBallotById] = useState<Map<string, OrgVoteBallotChoice>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingRef = useRef(pendingDecisions);
  pendingRef.current = pendingDecisions;

  const runHydration = useCallback(async () => {
    const entries = pendingRef.current;
    const keys = collectHydrationKeys(entries);

    const needsHydration =
      keys.ruleProposalIds.size > 0 ||
      keys.structureProposalIds.size > 0 ||
      keys.treeProposalIds.size > 0 ||
      keys.electionIds.size > 0 ||
      keys.orgVoteIds.size > 0;

    if (!needsHydration) {
      setRuleProposalsById(new Map());
      setStructureProposalsById(new Map());
      setTreeProposalsById(new Map());
      setElectionVoteStatusById(new Map());
      setOrgVoteBallotById(new Map());
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [ruleMap, structureMap, treeMap, orgBallotMap] = await Promise.all([
        fetchRuleProposalsForOrgs(keys.ruleOrgIds),
        fetchStructureProposalsForDocuments(keys.structureDocIds),
        fetchTreeProposalsForDocuments(keys.treeDocIds),
        fetchOrgVoteBallotsForOrgs(keys.orgVoteOrgIds),
      ]);

      const electionStatusMap = new Map<string, ElectionVoteStatus>();
      const electionsByOrg = new Map<string, string[]>();
      for (const entry of entries) {
        if (entry.kind !== 'election' || !entry.organizationId) continue;
        const id = payloadId(entry);
        if (!id) continue;
        const list = electionsByOrg.get(entry.organizationId) ?? [];
        list.push(id);
        electionsByOrg.set(entry.organizationId, list);
      }
      await Promise.all(
        [...electionsByOrg.entries()].map(async ([orgId, ids]) => {
          const statuses = await fetchElectionVoteStatuses(orgId, ids);
          statuses.forEach((status, electionId) => {
            electionStatusMap.set(electionId, status);
          });
        })
      );

      setRuleProposalsById(ruleMap);
      setStructureProposalsById(structureMap);
      setTreeProposalsById(treeMap);
      setElectionVoteStatusById(electionStatusMap);
      setOrgVoteBallotById(orgBallotMap);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to hydrate pending proposals';
      logger.error('useHydratePendingProposals failed', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await runHydration();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingDecisions, runHydration]);

  const refreshHydration = useCallback(async () => {
    await runHydration();
  }, [runHydration]);

  return {
    ruleProposalsById,
    structureProposalsById,
    treeProposalsById,
    electionVoteStatusById,
    orgVoteBallotById,
    loading,
    error,
    refreshHydration,
  };
}
