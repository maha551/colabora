import { useState, useEffect } from 'react';
import { Document, UnifiedHistoryEntry, StructureVersion, VersionHistory, Paragraph, Organization } from '../types';
import { structureHistoryApi } from '../lib/api';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Icon } from './ui/Icon';
import { logger } from '../lib/logger';
import { useTimezone } from '../hooks/useTimezone';
import { COLORS, RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';
import { ParagraphChangeCard } from './shared/ParagraphChangeCard';

interface UnifiedHistoryTimelineProps {
  document: Document;
  documentId: string;
  organization?: Organization | null;
}

// Structure Change Card Component
function StructureChangeCard({ entry, onRestore, restoringVersion, organizationBorderColor }: {
  entry: UnifiedHistoryEntry;
  onRestore: (version: StructureVersion) => void;
  restoringVersion: string | null;
  organizationBorderColor?: string | null;
}) {
  const version = entry.structureVersion!;
  const [showDetails, setShowDetails] = useState(false);
  const { formatDateTime } = useTimezone();

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

  const getCardStyle = () => {
    if (organizationBorderColor) {
      return { borderColor: organizationBorderColor, borderWidth: '2px' as const };
    }
    return undefined;
  };
  const cardStyle = getCardStyle();

  return (
    <Card
      className={cn(
        COLORS.bg.surface,
        COLORS.border.standard,
        !organizationBorderColor && 'shadow-lg ring-1 ring-primary/10',
        'hover:shadow-md transition-shadow'
      )}
      style={cardStyle}
    >
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
                  {formatDateTime(entry.timestamp)}
                </span>
                <Badge variant="outline" className={cn('text-xs', COLORS.statusBadge.info)}>
                  {getChangeTypeLabel(version.changeType)}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Dialog open={showDetails} onOpenChange={setShowDetails}>
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
                onClick={() => onRestore(version)}
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
  );
}


// Timeline Entry Component
function TimelineEntry({ 
  entry, 
  isLast, 
  onRestore, 
  restoringVersion,
  organizationBorderColor,
}: { 
  entry: UnifiedHistoryEntry;
  isLast: boolean;
  onRestore: (version: StructureVersion) => void;
  restoringVersion: string | null;
  organizationBorderColor?: string | null;
}) {
  return (
    <div className="relative flex gap-4">
      {/* Timeline line and dot */}
      <div className="flex flex-col items-center">
        <div className={cn(RADIUS.pill, "w-4 h-4 border-2", 
          entry.type === 'structure' 
            ? 'bg-blue-500 border-blue-600' 
            : 'bg-green-500 border-green-600'
        , "z-10")} />
        {!isLast && (
          <div className="w-0.5 h-full bg-border mt-2" />
        )}
      </div>

      {/* Entry content */}
      <div className="flex-1 pb-8">
        {entry.type === 'structure' ? (
          <StructureChangeCard 
            entry={entry} 
            onRestore={onRestore}
            restoringVersion={restoringVersion}
            organizationBorderColor={organizationBorderColor}
          />
        ) : (
          <ParagraphChangeCard
            history={entry.paragraphHistory!}
            paragraph={entry.paragraph}
            organizationBorderColor={organizationBorderColor}
          />
        )}
      </div>
    </div>
  );
}

export function UnifiedHistoryTimeline({ document, documentId, organization }: UnifiedHistoryTimelineProps) {
  const [entries, setEntries] = useState<UnifiedHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null);

  useEffect(() => {
    loadUnifiedHistory();
  }, [documentId, document]);

  const loadUnifiedHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch structure versions
      const structureVersions: StructureVersion[] = [];
      try {
        const structureResponse = await structureHistoryApi.getStructureVersions(documentId);
        structureVersions.push(...structureResponse.versions);
      } catch (err) {
        logger.warn('Failed to load structure versions (may not be enabled):', err);
      }

      // Extract paragraph history from document
      const paragraphEntries: UnifiedHistoryEntry[] = [];
      if (document?.paragraphs) {
        document.paragraphs.forEach((paragraph: Paragraph) => {
          if (paragraph.history && paragraph.history.length > 0) {
            paragraph.history.forEach((history: VersionHistory) => {
              paragraphEntries.push({
                id: `para-${history.id}`,
                type: 'paragraph',
                timestamp: history.acceptedAt instanceof Date 
                  ? history.acceptedAt 
                  : new Date(history.acceptedAt),
                user: history.user || { id: history.userId, name: 'Unknown' },
                paragraphHistory: history,
                paragraph: paragraph,
              });
            });
          }
        });
      }

      // Create structure entries
      const structureEntries: UnifiedHistoryEntry[] = structureVersions.map((version) => ({
        id: `struct-${version.id}`,
        type: 'structure',
        timestamp: new Date(version.createdAt),
        user: version.createdBy,
        structureVersion: version,
      }));

      // Merge and sort by timestamp (most recent first)
      const allEntries = [...structureEntries, ...paragraphEntries].sort((a, b) => {
        return b.timestamp.getTime() - a.timestamp.getTime();
      });

      setEntries(allEntries);
    } catch (err) {
      logger.error('Failed to load unified history:', err);
      setError('Failed to load document history');
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

  if (loading) {
    return (
      <div className="text-center py-12">
        <Icon name="Clock" className="mx-auto h-8 w-8 animate-spin text-muted-foreground/70 mb-4" />
        <p className="text-muted-foreground">Loading document history...</p>
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

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <Icon name="FileText" className="mx-auto h-12 w-12 text-muted-foreground/70 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">
          No Document History Yet
        </h3>
        <p className="text-muted-foreground mb-4">
          This document hasn't had any changes yet.
        </p>
        <p className="text-sm text-muted-foreground">
          History will appear here when structure proposals are applied or paragraph changes are approved.
        </p>
      </div>
    );
  }

  // Count entries by type
  const structureCount = entries.filter(e => e.type === 'structure').length;
  const paragraphCount = entries.filter(e => e.type === 'paragraph').length;
  const organizationBorderColor = organization?.brandingColor ?? null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">Document History</h2>
        <p className="text-muted-foreground mb-2">
          Complete timeline of structure and content changes
        </p>
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <div className={cn("w-3 h-3 bg-blue-500", RADIUS.pill)}></div>
            <span>{structureCount} structure {structureCount === 1 ? 'change' : 'changes'}</span>
          </span>
          <span className="flex items-center gap-2">
            <div className={cn("w-3 h-3 bg-green-500", RADIUS.pill)}></div>
            <span>{paragraphCount} paragraph {paragraphCount === 1 ? 'change' : 'changes'}</span>
          </span>
        </div>
      </div>

      <div className="relative">
        {/* Timeline container */}
        <div className="space-y-0">
          {entries.map((entry, index) => (
            <TimelineEntry
              key={entry.id}
              entry={entry}
              isLast={index === entries.length - 1}
              onRestore={handleRestore}
              restoringVersion={restoringVersion}
              organizationBorderColor={organizationBorderColor}
            />
          ))}
        </div>
      </div>

      {structureCount > 0 && (
        <Alert className="max-w-2xl mx-auto">
          <Icon name="AlertTriangle" className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> Restoring to a previous structure version creates a backup of the current state.
            You can always restore back to the most recent version if needed.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
