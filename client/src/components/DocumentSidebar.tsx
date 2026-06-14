import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Document, Organization } from '../types';
import { Icon } from './ui/Icon';
import { useScreenSize } from '../contexts/ScreenSizeContext';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from './ui/drawer';
import { Button } from './ui/button';
import { DocumentTree } from './document-tree/DocumentTree';
import { DocumentTreeSearch } from './document-tree/DocumentTreeSearch';
import { shouldUseLightText } from '../utils/colorUtils';
import { DEFAULT_ORGANIZATION_COLOR } from '../lib/constants';
import { HEADER_HEIGHT_PX } from '../lib/designSystem';
import { PRIMARY_NAV_RAIL_WIDTH_PX } from '../lib/navItems';
import { useChromeTopInset } from '../hooks/useChromeTopInset';
import { useTerritoryContext } from '../hooks/useTerritoryContext';
import { useTranslation } from 'react-i18next';

interface DocumentSidebarProps {
  organization: Organization | null;
  documents: Document[];
  currentDocument: Document | null;
  onSelectDocument: (document: Document) => void;
  isOpen?: boolean;
  onClose?: () => void;
  onWidthChange?: (width: number) => void;
}

/**
 * Calculate hover color based on background color
 * For light backgrounds: darkens slightly (mixes with black)
 * For dark backgrounds: lightens slightly (mixes with white)
 */
function calculateHoverColor(backgroundColor: string, opacity: number = 0.1): string {
  if (!backgroundColor || !backgroundColor.startsWith('#')) {
    return backgroundColor;
  }

  const isLight = !shouldUseLightText(backgroundColor);
  
  // Remove # and convert to RGB
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  let newR, newG, newB;

  if (isLight) {
    // Light background: darken by mixing with black
    newR = Math.round(r * (1 - opacity));
    newG = Math.round(g * (1 - opacity));
    newB = Math.round(b * (1 - opacity));
  } else {
    // Dark background: lighten by mixing with white
    newR = Math.round(r + (255 - r) * opacity);
    newG = Math.round(g + (255 - g) * opacity);
    newB = Math.round(b + (255 - b) * opacity);
  }

  // Clamp values to valid range
  newR = Math.max(0, Math.min(255, newR));
  newG = Math.max(0, Math.min(255, newG));
  newB = Math.max(0, Math.min(255, newB));

  // Convert back to hex
  return `#${[newR, newG, newB].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('')}`;
}

/**
 * Calculate sidebar color that ensures opposite text contrast to header
 * while maintaining visual relationship with organization color
 */
function calculateSidebarColor(orgColor: string): string {
  // If no org color, use default
  if (!orgColor || !orgColor.startsWith('#')) {
    return '#ffffff'; // Default white
  }

  const headerUsesLightText = shouldUseLightText(orgColor);
  
  // Remove # and convert to RGB
  const hex = orgColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  let newR, newG, newB;

  if (headerUsesLightText) {
    // Header is dark, so sidebar should be light (for dark text)
    // Lighten the color by moving towards white
    // Use 30% of original + 70% white
    newR = Math.round(r * 0.3 + 255 * 0.7);
    newG = Math.round(g * 0.3 + 255 * 0.7);
    newB = Math.round(b * 0.3 + 255 * 0.7);
  } else {
    // Header is light, so sidebar should be dark (for light text)
    // Darken the color by reducing RGB values
    // Use 45% of original (making it darker)
    newR = Math.round(r * 0.45);
    newG = Math.round(g * 0.45);
    newB = Math.round(b * 0.45);
  }

  // Ensure minimum contrast - if still too similar, adjust further
  const newLuminance = (0.299 * newR + 0.587 * newG + 0.114 * newB) / 255;
  
  // Fine-tune if needed
  if (headerUsesLightText && newLuminance < 0.55) {
    // Still too dark, lighten more
    const factor = 0.55 / newLuminance;
    newR = Math.min(255, Math.round(newR * factor));
    newG = Math.min(255, Math.round(newG * factor));
    newB = Math.min(255, Math.round(newB * factor));
  } else if (!headerUsesLightText && newLuminance > 0.45) {
    // Still too light, darken more
    const factor = 0.45 / newLuminance;
    newR = Math.round(newR * factor);
    newG = Math.round(newG * factor);
    newB = Math.round(newB * factor);
  }

  // Convert back to hex
  return `#${[newR, newG, newB].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('')}`;
}

export function DocumentSidebar({
  organization,
  documents,
  currentDocument,
  onSelectDocument,
  isOpen = false,
  onClose,
  onWidthChange,
}: DocumentSidebarProps) {
  const { t } = useTranslation('documents');
  const { isMobile, isTablet } = useScreenSize();
  const chromeTopInset = useChromeTopInset();
  const sidebarLeft = PRIMARY_NAV_RAIL_WIDTH_PX;

  // Pinned state with localStorage persistence
  const [isPinned, setIsPinned] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('document-sidebar-pinned');
    return stored === 'true';
  });
  
  // Collapse state - starts collapsed by default, opens on hover unless pinned
  const [isCollapsed, setIsCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('document-sidebar-pinned');
    return stored !== 'true'; // Collapsed if not pinned
  });
  
  // Swipe gesture state
  const [swipeStart, setSwipeStart] = useState<{ x: number; y: number } | null>(null);
  const collapsedBarRef = React.useRef<HTMLDivElement>(null);
  const sidebarRef = React.useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  // Search/filter state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Save pinned state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('document-sidebar-pinned', String(isPinned));
    }
  }, [isPinned]);
  
  // Update collapsed state when pinned state changes
  useEffect(() => {
    if (isPinned) {
      setIsCollapsed(false); // Always expanded when pinned
    } else {
      setIsCollapsed(true); // Collapsed when unpinned
    }
  }, [isPinned]);
  
  // Toggle pinned state
  const handleTogglePin = useCallback(() => {
    setIsPinned(prev => !prev);
  }, []);

  // Swipe gesture handlers for collapsed bar
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isCollapsed && e.touches[0].clientX < 20) {
      setSwipeStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  }, [isCollapsed]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (swipeStart && e.touches[0].clientX - swipeStart.x > 50) {
      // Swipe right detected - expand sidebar
      setIsCollapsed(false);
      setSwipeStart(null);
    } else if (swipeStart && Math.abs(e.touches[0].clientY - swipeStart.y) > 30) {
      // Vertical movement too large - cancel swipe
      setSwipeStart(null);
    }
  }, [swipeStart]);

  const handleTouchEnd = useCallback(() => {
    setSwipeStart(null);
  }, []);

  // Hover handler for collapsed bar - expand on hover (only if not pinned)
  const handleCollapsedBarMouseEnter = useCallback(() => {
    if (isPinned) return; // Don't expand if pinned
    // Clear any pending collapse timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // Expand on hover
    setIsCollapsed(false);
  }, [isPinned]);

  // Hover handler for expanded sidebar - collapse on mouse leave (only if not pinned)
  const handleSidebarMouseEnter = useCallback(() => {
    if (isPinned) return; // Don't manage hover if pinned
    // Clear any pending collapse timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // Keep open while hovering
    setIsCollapsed(false);
  }, [isPinned]);

  const handleSidebarMouseLeave = useCallback(() => {
    if (isPinned) return; // Don't collapse if pinned
    // Set timeout to collapse when mouse leaves
    hoverTimeoutRef.current = setTimeout(() => {
      setIsCollapsed(true);
    }, 300); // Small delay to prevent accidental collapses
  }, [isPinned]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);
  
  // Keyboard shortcut for pin toggle (Cmd/Ctrl+B)
  useEffect(() => {
    if (isMobile) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        handleTogglePin();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, handleTogglePin]);
  
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Auto-expand all nodes by default when documents change
  useEffect(() => {
    if (documents.length > 0 && expandedNodes.size === 0) {
      const allIds = new Set<string>();
      documents.forEach(doc => allIds.add(doc.id));
      setExpandedNodes(allIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents.length]);

  // Use centralized territory context hook
  const { inOrgTerritory, organization: contextOrganization } = useTerritoryContext();
  // Use organization from props if provided, otherwise from context
  const activeOrganization = organization ?? contextOrganization;
  
  // Determine sidebar styling based on organization branding
  // Only apply branding when in organization territory
  const useBranding = !!activeOrganization && inOrgTerritory;
  const headerBackgroundColor = useBranding 
    ? (activeOrganization.brandingColor || DEFAULT_ORGANIZATION_COLOR)
    : '#ffffff';
  const backgroundColor = useBranding 
    ? calculateSidebarColor(headerBackgroundColor)
    : '#ffffff';
  const textColor = shouldUseLightText(backgroundColor) 
    ? '#ffffff' 
    : '#111827';
  
  // Calculate hover color based on background
  const hoverColor = calculateHoverColor(backgroundColor, 0.1);

  // Note: Tree building is now handled by DocumentTree component

  // Toggle expand/collapse
  const toggleExpanded = useCallback((documentId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return newSet;
    });
  }, []);

  // Expand-only: ensure all ancestors of the given document are expanded (so it's visible). Does not collapse anything, so user collapse is preserved.
  const ensureAncestorsExpanded = useCallback((documentId: string) => {
    const path: string[] = [];
    let currentId: string | undefined = documentId;
    while (currentId) {
      const doc = documents.find(d => d.id === currentId);
      if (!doc) break;
      path.unshift(doc.id);
      currentId = doc.parentId;
    }
    const ancestorIds = path.slice(0, -1);
    if (ancestorIds.length === 0) return;
    setExpandedNodes(prev => {
      const next = new Set(prev);
      let changed = false;
      ancestorIds.forEach(id => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [documents]);

  // Note: Using shared DocumentTree component instead of inline DocumentTreeNode

  // Determine sidebar width based on screen size and collapse state
  const expandedWidth = isTablet ? 240 : 280;
  const collapsedWidth = 56;
  const sidebarWidth = isCollapsed ? collapsedWidth : expandedWidth;

  // Notify parent of width changes (only on desktop/tablet, not mobile)
  useEffect(() => {
    if (onWidthChange && !isMobile) {
      onWidthChange(sidebarWidth);
    } else if (onWidthChange && isMobile) {
      onWidthChange(0); // Mobile uses drawer, no width impact
    }
  }, [sidebarWidth, isMobile, onWidthChange]);

  // Don't render on mobile - parent should handle this, but defensive check
  if (isMobile) {
    return null;
  }

  // Create sidebar content
  const sidebarContent = (
    <div 
      className="h-full flex flex-col w-full"
      style={{
        backgroundColor,
        color: textColor,
        height: '100%',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div 
        className="px-5 py-4 border-b flex-shrink-0 flex items-center justify-between gap-3" 
        style={{ 
          borderColor: useBranding ? 'rgba(0,0,0,0.1)' : '#e5e7eb',
          minHeight: `${HEADER_HEIGHT_PX}px`,
        }}
      >
        {!isCollapsed && (
          <>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sm truncate">
                  {organization?.name || t('sidebarTitle')}
                </h2>
                <p className="text-xs opacity-70 truncate">
                  {t('dashboard.documentCount', { count: documents.length })}
                </p>
              </div>
            </div>
          </>
        )}
        {isCollapsed && (
          <div className="flex items-center justify-center w-full">
            <Icon name="FileText" className="h-5 w-5" />
          </div>
        )}
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            style={{ 
              color: textColor,
              backgroundColor: isPinned ? hoverColor : 'transparent'
            }}
            onClick={handleTogglePin}
            aria-label={isPinned ? t('sidebarUnpin') : t('sidebarPin')}
            title={isPinned ? t('sidebarUnpinTitle') : t('sidebarPinTitle')}
          >
            {isPinned ? (
              <Icon name="Pin" className="h-4 w-4" />
            ) : (
              <Icon name="PinOff" className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Search bar - only when expanded and not mobile */}
      {!isMobile && !isCollapsed && (
        <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: useBranding ? 'rgba(0,0,0,0.1)' : '#e5e7eb' }}>
          <DocumentTreeSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('sidebarSearchPlaceholder')}
          />
        </div>
      )}

      {/* Document tree */}
      <div className="flex-1 overflow-y-auto py-3 pl-2 min-h-0 w-full overflow-x-hidden">
        {!isMobile && !isCollapsed && currentDocument && (
          <div className="px-4 mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Scroll to current document - handled by DocumentTree
                const element = document.querySelector(`[data-document-id="${currentDocument.id}"]`);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              className="w-full justify-start text-xs h-7"
              style={{ color: textColor }}
            >
              <Icon name="Navigation" className="h-3 w-3 mr-1" />
              {t('sidebarJumpToCurrent')}
            </Button>
          </div>
        )}
        {!isCollapsed && (
          <DocumentTree
            documents={documents}
            currentDocumentId={currentDocument?.id}
            onSelectDocument={onSelectDocument}
            expandedNodes={expandedNodes}
            onToggleExpand={toggleExpanded}
            onEnsureAncestorsExpanded={ensureAncestorsExpanded}
            searchQuery={searchQuery}
            showStatus={true}
            showMetadata={false}
            compact={true}
          />
        )}
      </div>
    </div>
  );
  
  // Desktop/Tablet: render sidebar in a portal so it's outside the scroll container and
  // positions correctly relative to the viewport (no overlap with header, no bottom clipping)
  if (!isMobile) {
    const sidebarMarkup = isCollapsed ? (
      <div
        ref={collapsedBarRef}
        className="fixed z-30 cursor-pointer transition-all duration-200"
        style={{
          left: `${sidebarLeft}px`,
          top: `${chromeTopInset}px`,
          bottom: 0,
          width: '6px',
          backgroundColor: backgroundColor,
          borderRight: `1px solid ${useBranding ? 'rgba(0,0,0,0.1)' : '#d1d5db'}`,
          touchAction: 'pan-y',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={(e) => {
          e.currentTarget.style.width = '8px';
          e.currentTarget.style.backgroundColor = calculateHoverColor(backgroundColor, 0.15);
          handleCollapsedBarMouseEnter();
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.width = '6px';
          e.currentTarget.style.backgroundColor = backgroundColor;
        }}
        aria-label={t('sidebarExpand')}
        title={isPinned ? t('sidebarPinnedTitle') : t('sidebarExpandTitle')}
      />
    ) : (
      <aside
        ref={sidebarRef}
        className="fixed border-r transition-all duration-300 ease-in-out z-30"
        style={{
          left: `${sidebarLeft}px`,
          top: `${chromeTopInset}px`,
          bottom: 0,
          backgroundColor,
          borderColor: useBranding ? 'rgba(0,0,0,0.1)' : '#e5e7eb',
          width: `${sidebarWidth}px`,
          overflow: 'hidden',
          boxShadow: '1px 0 3px rgba(0,0,0,0.05)',
        }}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        aria-label={t('sidebarAria')}
      >
        {sidebarContent}
      </aside>
    );
    return typeof document !== 'undefined'
      ? createPortal(sidebarMarkup, document.body)
      : sidebarMarkup;
  }
  
  // Mobile: Drawer with swipe gesture
  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose?.()} direction="left">
      <DrawerContent 
        className="h-full"
        style={{
          backgroundColor,
          color: textColor,
          width: `${expandedWidth}px`,
          maxWidth: `${expandedWidth}px`,
        }}
      >
        <DrawerHeader className="sr-only">
          <DrawerTitle>{t('sidebarDrawerTitle')}</DrawerTitle>
        </DrawerHeader>
        {sidebarContent}
      </DrawerContent>
    </Drawer>
  );
}
