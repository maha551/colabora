import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { organizationsApi } from '../../lib/api/organizations';
import { COLORS, PANEL, RADIUS } from '../../lib/designSystem';
import { LoadingState } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/button';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/utils';

export interface ParticipationGraphEditorProps {
  organizationId: string;
}

type GraphPath = { nodes: string[]; edges: string[] };

function findShortestPath(edges: Edge[], from: string, to: string): GraphPath | null {
  if (from === to) return { nodes: [from], edges: [] };

  const adj = new Map<string, Array<{ neighbor: string; edgeId: string }>>();
  for (const edge of edges) {
    for (const [source, target] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ] as const) {
      const list = adj.get(source) ?? [];
      list.push({ neighbor: target, edgeId: edge.id });
      adj.set(source, list);
    }
  }

  const queue = [from];
  const prev = new Map<string, { node: string; edgeId: string }>();
  const visited = new Set([from]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) break;
    for (const { neighbor, edgeId } of adj.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      prev.set(neighbor, { node: current, edgeId });
      queue.push(neighbor);
    }
  }

  if (!prev.has(to)) return null;

  const pathNodes: string[] = [];
  const pathEdges: string[] = [];
  let cursor = to;
  pathNodes.unshift(cursor);
  while (cursor !== from) {
    const step = prev.get(cursor);
    if (!step) break;
    pathEdges.unshift(step.edgeId);
    cursor = step.node;
    pathNodes.unshift(cursor);
  }

  return { nodes: pathNodes, edges: pathEdges };
}

function OrgGraphNode({ data, selected }: NodeProps) {
  const label = typeof data.label === 'string' ? data.label : '';
  const kind = typeof data.kind === 'string' ? data.kind : undefined;
  const onPath = Boolean(data.onPath);

  return (
    <div
      className={cn(
        'max-w-[9rem] rounded-md border bg-card px-2.5 py-2 shadow-sm transition-colors',
        onPath ? 'border-primary bg-primary/5' : 'border-border',
        selected && 'ring-2 ring-ring'
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !bg-border" />
      <p className="truncate text-xs font-medium text-foreground" title={label}>
        {label}
      </p>
      {kind && kind !== 'root' ? (
        <p className="truncate text-[10px] capitalize text-muted-foreground">{kind}</p>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !bg-border" />
    </div>
  );
}

const nodeTypes = { org: OrgGraphNode };

export function ParticipationGraphEditor({ organizationId }: ParticipationGraphEditorProps) {
  const { t } = useTranslation('organization');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathMode, setPathMode] = useState(false);
  const [pathPick, setPathPick] = useState<string[]>([]);
  const [highlightedPath, setHighlightedPath] = useState<GraphPath | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPathPick([]);
    setHighlightedPath(null);

    (async () => {
      try {
        const data = await organizationsApi.getParticipationGraph(organizationId);
        if (cancelled) return;
        const layout = (data.layout?.nodes || {}) as Record<string, { x?: number; y?: number }>;
        setNodes(
          data.nodes.map((n, i) => ({
            id: n.id,
            type: 'org',
            position: { x: layout[n.id]?.x ?? i * 180, y: layout[n.id]?.y ?? 0 },
            data: { label: n.name, kind: n.kind },
          }))
        );
        setEdges(
          data.edges.map((e) => ({
            id: e.id,
            source: e.sourceOrgId,
            target: e.targetOrgId,
            label: e.relationshipType,
            labelStyle: { fontSize: 10, fill: 'var(--muted-foreground)' },
          }))
        );
      } catch (e) {
        if (cancelled) return;
        const message =
          e instanceof Error
            ? e.message
            : t('participationGraph.loadError', { defaultValue: 'Failed to load participation graph' });
        setError(message);
        toast.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, t]);

  const pathNodeSet = useMemo(
    () => new Set(highlightedPath?.nodes ?? []),
    [highlightedPath]
  );
  const pathEdgeSet = useMemo(
    () => new Set(highlightedPath?.edges ?? []),
    [highlightedPath]
  );

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: { ...node.data, onPath: pathNodeSet.has(node.id) },
        selected: pathPick.includes(node.id),
      })),
    [nodes, pathNodeSet, pathPick]
  );

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        animated: pathEdgeSet.has(edge.id),
        style: pathEdgeSet.has(edge.id)
          ? { stroke: 'var(--primary)', strokeWidth: 2 }
          : undefined,
      })),
    [edges, pathEdgeSet]
  );

  const clearPath = useCallback(() => {
    setPathPick([]);
    setHighlightedPath(null);
  }, []);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!pathMode) return;
      setPathPick((prev) => {
        const next = prev.length >= 2 ? [node.id] : [...prev, node.id];
        if (next.length === 2) {
          const path = findShortestPath(edges, next[0], next[1]);
          if (!path) {
            toast.error(
              t('participationGraph.findPathNoPath', {
                defaultValue: 'No path found between these organizations.',
              })
            );
            setHighlightedPath(null);
          } else {
            setHighlightedPath(path);
          }
        } else {
          setHighlightedPath(null);
        }
        return next;
      });
    },
    [edges, pathMode, t]
  );

  const isEmpty = !loading && !error && nodes.length <= 1 && edges.length === 0;

  if (loading) {
    return <LoadingState isLoading mode="skeleton" skeletonVariant="card" skeletonCount={1} />;
  }

  if (error) {
    return (
      <div
        className={cn(
          RADIUS.panel,
          'flex min-h-[12rem] flex-col items-center justify-center gap-2 border border-border bg-muted/20 p-6 text-center'
        )}
      >
        <Icon name="AlertCircle" className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className={cn('text-sm', COLORS.text.secondary)}>{error}</p>
      </div>
    );
  }

  return (
    <div className={cn(RADIUS.chrome, 'border border-border bg-card shadow-sm')}>
      <div className={cn('flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3')}>
        <div className="min-w-0">
          <h3 className={PANEL.header.title}>
            {t('participationGraph.title', { defaultValue: 'Participation graph' })}
          </h3>
          <p className={PANEL.header.subtitle}>
            {t('participationGraph.description', {
              defaultValue: 'Organizations and relationships in your participation network.',
            })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {pathMode ? (
            <>
              <span className={cn('hidden text-xs sm:inline', COLORS.text.secondary)}>
                {pathPick.length < 2
                  ? t('participationGraph.findPathPickOne', {
                      defaultValue: 'Select a second organization…',
                    })
                  : t('participationGraph.findPathHint', {
                      defaultValue: 'Click two organizations to highlight the shortest path between them.',
                    })}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={clearPath}>
                {t('participationGraph.clearPath', { defaultValue: 'Clear highlight' })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPathMode(false);
                  clearPath();
                }}
              >
                {t('participationGraph.exitFindPath', { defaultValue: 'Done' })}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPathMode(true)}
              aria-pressed={pathMode}
            >
              <Icon name="Navigation" className="h-3.5 w-3.5" aria-hidden />
              {t('participationGraph.findPath', { defaultValue: 'Find path' })}
            </Button>
          )}
        </div>
      </div>

      <div className="relative h-[480px] w-full">
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          nodesDraggable={!pathMode}
          nodesConnectable={false}
          elementsSelectable={pathMode}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} />
          <Controls showInteractive={false} />
        </ReactFlow>

        {isEmpty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <EmptyState
              className="max-w-sm border-dashed bg-card/90 py-10 shadow-none"
              icon={<Icon name="Network" className="h-10 w-10" aria-hidden />}
              title={t('participationGraph.emptyTitle', {
                defaultValue: 'No related organizations yet',
              })}
              description={t('participationGraph.emptyDescription', {
                defaultValue:
                  'Child organizations and matrix links will appear here as your network grows.',
              })}
            />
          </div>
        ) : null}

        {pathMode ? (
          <p className="absolute bottom-3 left-3 right-3 rounded-md bg-background/90 px-3 py-1.5 text-center text-xs text-muted-foreground shadow-sm sm:hidden">
            {t('participationGraph.findPathHint', {
              defaultValue: 'Click two organizations to highlight the shortest path between them.',
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
