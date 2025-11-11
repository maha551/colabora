import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Clock, RotateCcw, FileText, User, Calendar } from 'lucide-react';

import { StructureVersion, StructureSnapshot, StructureChange } from '@/types';
import { structureHistoryApi } from '@/lib/api';

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

  useEffect(() => {
    loadVersions();
  }, [documentId]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const response = await structureHistoryApi.getStructureVersions(documentId);
      setVersions(response.versions);
    } catch (err) {
      console.error('Failed to load structure versions:', err);
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
      console.error('Failed to restore version:', err);
      alert('Failed to restore version. Please try again.');
    } finally {
      setRestoringVersion(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getChangeTypeIcon = (changeType: string) => {
    switch (changeType) {
      case 'structure_proposal': return '🏗️';
      case 'manual': return '✏️';
      case 'initial': return '📄';
      default: return '🔄';
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
        <Clock className="mx-auto h-8 w-8 animate-spin text-gray-400 mb-4" />
        <p className="text-gray-600">Loading structure history...</p>
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
        <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No Structure History Yet
        </h3>
        <p className="text-gray-600 mb-4">
          This document hasn't had any structural changes yet.
        </p>
        <p className="text-sm text-gray-500">
          Structure history will appear here when proposals are applied or manual changes are made.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Structure History</h2>
        <p className="text-gray-600">
          View and restore previous versions of this document's structure
        </p>
      </div>

      <div className="space-y-4">
        {versions.map((version) => (
          <Card key={version.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{getChangeTypeIcon(version.changeType)}</div>
                  <div>
                    <CardTitle className="text-lg">
                      Version {version.versionNumber}
                      {version.name && <span className="text-gray-500 ml-2">• {version.name}</span>}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {version.createdBy.name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(version.createdAt)}
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
                            <p className="text-gray-600">{version.description}</p>
                          </div>
                        )}

                        {version.proposalTitle && (
                          <div>
                            <h4 className="font-medium mb-2">Related Proposal</h4>
                            <p className="text-gray-600">{version.proposalTitle}</p>
                          </div>
                        )}

                        <div>
                          <h4 className="font-medium mb-2">Structure Snapshot</h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-3 bg-gray-50">
                            {version.structureSnapshot.map((item, index) => (
                              <div key={index} className="text-sm">
                                <span className="font-medium">{item.title || 'Untitled'}</span>
                                {item.headingLevel && <span className="text-gray-500 ml-2">H{item.headingLevel.replace('h', '')}</span>}
                                {item.text && <span className="text-gray-600 ml-2 truncate block">{item.text.substring(0, 100)}...</span>}
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
                          <Clock className="h-3 w-3 animate-spin" />
                          Restoring...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-3 w-3" />
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
                <p className="text-gray-600 text-sm">{version.description}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <Alert className="max-w-2xl mx-auto">
        <AlertDescription>
          <strong>⚠️ Important:</strong> Restoring to a previous version creates a backup of the current state.
          You can always restore back to the most recent version if needed.
        </AlertDescription>
      </Alert>
    </div>
  );
}
