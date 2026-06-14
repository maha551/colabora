import React, { useEffect, useRef, useState, useMemo } from 'react';
import './AnimatedBackground.css';
import { useDevicePerformance, getRecommendedLayerCount, getRecommendedSpeed, type PerformanceTier } from '../hooks/useDevicePerformance';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { cn } from './ui/utils';

interface AnimatedBackgroundProps {
  /** Only start animation when element is in viewport */
  lazy?: boolean;
  /** Custom className for the container */
  className?: string;
  /** Animation speed: 'normal' (default), 'slow' (3x slower), or 'static' (no animation). If not provided, auto-detects based on device performance */
  speed?: 'normal' | 'slow' | 'static';
  /** Enable subtle heartbeat animation (default: true) */
  heartbeat?: boolean;
  /** Organization branding color for heartbeat layer */
  brandingColor?: string;
  /** Performance tier override. If not provided, auto-detects based on device capabilities */
  performanceTier?: PerformanceTier;
  /** Cap gradient layers (e.g. login uses 1 for faster first paint) */
  maxLayers?: number;
  /** Heartbeat intensity preset */
  heartbeatPreset?: 'relaxed' | 'medium' | 'strong';
  /** Pulse opacity only (no scale) — avoids harsh gradient edges near UI */
  heartbeatOpacityOnly?: boolean;
}

export function AnimatedBackground({
  lazy = false,
  className,
  speed,
  heartbeat = true,
  brandingColor,
  performanceTier: providedTier,
  maxLayers,
  heartbeatPreset = 'medium',
  heartbeatOpacityOnly = false,
}: AnimatedBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(!lazy);
  const detectedTier = useDevicePerformance();
  const performanceTier = providedTier || detectedTier;
  const reducedMotion = usePrefersReducedMotion();
  
  // Auto-detect speed if not provided
  const effectiveSpeed = useMemo(() => {
    if (speed !== undefined) return speed;
    
    // Check for prefers-reduced-motion first
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return 'static';
    }
    
    return getRecommendedSpeed(performanceTier);
  }, [speed, performanceTier]);
  
  const layerCount = useMemo(() => {
    const tierLayers = getRecommendedLayerCount(performanceTier);
    return maxLayers !== undefined ? Math.min(tierLayers, maxLayers) : tierLayers;
  }, [performanceTier, maxLayers]);
  const showHeartbeat =
    heartbeat && !reducedMotion && performanceTier === 'high';

  useEffect(() => {
    if (!lazy) {
      setIsVisible(true);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // For fixed position elements, use a simpler check - just wait a tiny bit for layout
    // Fixed elements are always "visible" but we want to ensure they're rendered
    const timeoutId = setTimeout(() => {
      setIsVisible(true);
    }, 100);

    // Also use IntersectionObserver as a fallback
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      {
        // For fixed elements, use a very permissive threshold
        rootMargin: '0px',
        threshold: 0,
      }
    );

    observer.observe(container);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [lazy]);

  const speedClass = effectiveSpeed === 'slow' ? 'animated-background--slow' : effectiveSpeed === 'static' ? 'animated-background--static' : '';
  const performanceClass = `animated-background--${performanceTier}-performance`;

  // Conditionally render layers based on performance tier
  // Optimized: Smart layer selection prioritizing most visually impactful layers
  const renderLayers = () => {
    const layers = [];
    
    // Always render layer 1 (Dark Amethyst - purple base) - most impactful
    if (layerCount >= 1) {
      layers.push(<div key="layer-1" className="gradient-layer layer-1" />);
    }
    
    // Layer 2 (Grape Soda) - high visual impact, purple/pink gradient
    if (layerCount >= 2) {
      layers.push(<div key="layer-2" className="gradient-layer layer-2" />);
    }
    
    // Layer 3 (Orchid Mist) - only for high tier
    if (layerCount >= 3) {
      layers.push(<div key="layer-3" className="gradient-layer layer-3" />);
    }
    
    // Layer 4 (Pink Carnation) and Layer 5 (Sweet Salmon) - only for high tier
    // Note: With optimized layer counts, these won't render (max is 4 layers for high tier)
    // Keeping code for potential future use or manual override
    if (layerCount >= 4) {
      layers.push(<div key="layer-4" className="gradient-layer layer-4" />);
    }
    if (layerCount >= 5) {
      layers.push(<div key="layer-5" className="gradient-layer layer-5" />);
    }
    
    // Heartbeat layer: high tier with 2+ layers, motion allowed
    if (showHeartbeat) {
      const heartbeatClass = cn(
        'gradient-layer layer-heartbeat',
        `heartbeat--${heartbeatPreset}`,
        heartbeatOpacityOnly && 'heartbeat--opacity-only'
      );
      if (brandingColor) {
        layers.push(
          <div
            key="heartbeat"
            className={heartbeatClass}
            style={{
              background: `radial-gradient(circle at 50% 50%, ${brandingColor} 0%, transparent 70%)`,
            }}
          />
        );
      } else {
        layers.push(<div key="heartbeat" className={heartbeatClass} />);
      }
    }
    
    return layers;
  };

  return (
    <div 
      ref={containerRef}
      className={`animated-background ${className || ''} ${speedClass} ${performanceClass} ${!isVisible ? 'animated-background--paused' : ''}`}
    >
      {renderLayers()}
    </div>
  );
}

