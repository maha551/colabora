import React, { useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { organizationsApi } from '../../lib/api/organizations';
import { LoadingState } from '../ui/LoadingState';

export interface ParticipationGraphEditorProps {
  organizationId: string;
}

export function ParticipationGraphEditor({ organizationId }: ParticipationGraphEditorProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await organizationsApi.getParticipationGraph(organizationId);
        if (cancelled) return;
        const layout = (data.layout?.nodes || {}) as Record<string, { x?: number; y?: number }>;
        setNodes(
          data.nodes.map((n, i) => ({
            id: n.id,
            position: { x: layout[n.id]?.x ?? i * 180, y: layout[n.id]?.y ?? 0 },
            data: { label: n.name },
          }))
        );
        setEdges(
          data.edges.map((e) => ({
            id: e.id,
            source: e.sourceOrgId,
            target: e.targetOrgId,
            label: e.relationshipType,
          }))
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  if (loading) return <LoadingState isLoading mode="skeleton" skeletonVariant="card" />;

  return (
    <div className="h-[480px] w-full rounded-md border border-border">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
