import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Icon } from './ui/Icon';

import { StructureVersion } from '@/types';
import { structureHistoryApi } from '@/lib/api';
import { logger } from '../lib/logger';
import { useTimezone } from '../hooks/useTimezone';

interface StructureHistoryProps {
  documentId: string;
  currentUserId: string;
}

export function StructureHistory({ documentId, currentUserId }: StructureHistoryProps) {
  const [versions, setVersions] = useState<StructureVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<StructureVersion | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null);
  const { formatDateTime } = useTimezone();

  useEffect(() => {
    loadVersions();
  }, [documentId]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const response = await structureHistoryApi.getStructureVersions(documentId);
      setVersions(response.versions);
    } catch (err) {
      logger.error('Failed to load structure versions:', err);
      setError('Failed to load structure history');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (version: StructureVersion) => {
    if (!confirm(`Are you sure you want to restore the document to version ${version.versionNumber}? This will create a backup of the current state.`)) {
      return;
    }

    try {
      setRestoringVersion(version.id);
      await structureHistoryApi.restoreStructureVersion(documentId, version.id);
      alert('Document restored successfully! The current state has been backed up.');
      // Refresh the document and versions
      window.location.reload();
    } catch (err) {
      logger.error('Failed to restore version:', err);
      alert('Failed to restore version. Please try again.');
    } finally {
      setRestoringVersion(null);
    }
  };


  const getChangeTypeIcon = (changeType: string) => {
    const iconClassName = 'h-6 w-6';
    switch (changeType) {
      case 'structure_proposal': return <Icon name="Network" className={iconClassName} />;
      case 'manual': return <Icon name="Pencil" className={iconClassName} />;
      case 'initial': return <Icon name="FileText" className={iconClassName} />;
      default: return <Icon name="RefreshCw" className={iconClassName} />;
    }
  };

  const getChangeTypeLabel = (changeType: string) => {
    switch (changeType) {
      case 'structure_proposal': return 'Structure Proposal';
      case 'manual': return 'Manual Change';
      case 'initial': return 'Initial Version';
      default: return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Icon name="Clock" className="mx-auto h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Loading structure history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="max-w-2xl mx-auto">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-12">
        <Icon name="FileText" className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">
          No Structure History Yet
        </h3>
        <p className="text-muted-foreground mb-4">
          This document hasn't had any structural changes yet.
        </p>
        <p className="text-sm text-muted-foreground">
          Structure history will appear here when proposals are applied or manual changes are made.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">Structure History</h2>
        <p className="text-muted-foreground">
          View and restore previous versions of this document's structure
        </p>
      </div>

      <div className="space-y-4">
        {versions.map((version) => (
          <Card key={version.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">{getChangeTypeIcon(version.changeType)}</div>
                  <div>
                    <CardTitle className="text-lg">
                      Version {version.versionNumber}
                      {version.name && <span className="text-muted-foreground ml-2">• {version.name}</span>}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Icon name="User" className="h-3 w-3" />
                        {version.createdBy.name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="Calendar" className="h-3 w-3" />
                        {formatDateTime(version.createdAt)}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {getChangeTypeLabel(version.changeType)}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Version {version.versionNumber} Details</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        {version.description && (
                          <div>
                            <h4 className="font-medium mb-2">Description</h4>
                            <p className="text-muted-foreground">{version.description}</p>
                          </div>
                        )}

                        {version.proposalTitle && (
                          <div>
                            <h4 className="font-medium mb-2">Related Proposal</h4>
                            <p className="text-muted-foreground">{version.proposalTitle}</p>
                          </div>
                        )}

                        <div>
                          <h4 className="font-medium mb-2">Structure Snapshot</h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-3 bg-muted">
                            {version.structureSnapshot.map((item, index) => (
                              <div key={index} className="text-sm">
                                <span className="font-medium">{item.title || 'Untitled'}</span>
                                {item.headingLevel && <span className="text-muted-foreground ml-2">H{item.headingLevel.replace('h', '')}</span>}
                                {item.text && <span className="text-muted-foreground ml-2 truncate block">{item.text.substring(0, 100)}...</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {version.versionNumber !== 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(version)}
                      disabled={restoringVersion === version.id}
                      className="gap-1"
                    >
                      {restoringVersion === version.id ? (
                        <>
                          <Icon name="Clock" className="h-3 w-3 animate-spin" />
                          Restoring...
                        </>
                      ) : (
                        <>
                          <Icon name="RotateCcw" className="h-3 w-3" />
                          Restore
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {version.description && (
              <CardContent className="pt-0">
                <p className="text-muted-foreground text-sm">{version.description}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <Alert className="max-w-2xl mx-auto">
        <Icon name="AlertTriangle" className="h-4 w-4" />
        <AlertDescription>
          <strong>Important:</strong> Restoring to a previous version creates a backup of the current state.
          You can always restore back to the most recent version if needed.
        </AlertDescription>
      </Alert>
    </div>
  );
}
