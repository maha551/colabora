import { useState, useEffect } from 'react';

export type PerformanceTier = 'high' | 'medium' | 'low';

interface DeviceCapabilities {
  hardwareConcurrency: number;
  deviceMemory: number | null;
  connectionType: string | null;
  isMobile: boolean;
}

/**
 * Hook to detect device performance capabilities and return appropriate tier
 * 
 * Performance tiers:
 * - 'high': 8+ cores, 8GB+ RAM, desktop - can handle full animations
 * - 'medium': 4-7 cores, 4-7GB RAM, or good mobile - reduced animations
 * - 'low': <4 cores, <4GB RAM, or slow connection - minimal/static animations
 */
export function useDevicePerformance(): PerformanceTier {
  const [tier, setTier] = useState<PerformanceTier>(() => {
    // Initial calculation (SSR-safe)
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 'medium'; // Default to medium for SSR
    }

    return calculatePerformanceTier({
      hardwareConcurrency: navigator.hardwareConcurrency || 2,
      deviceMemory: (navigator as any).deviceMemory || null,
      connectionType: (navigator as any).connection?.effectiveType || null,
      isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    });
  });

  useEffect(() => {
    // Recalculate on mount to ensure accurate detection
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    const capabilities: DeviceCapabilities = {
      hardwareConcurrency: navigator.hardwareConcurrency || 2,
      deviceMemory: (navigator as any).deviceMemory || null,
      connectionType: (navigator as any).connection?.effectiveType || null,
      isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    };

    const newTier = calculatePerformanceTier(capabilities);
    setTier(newTier);

    // Listen for connection changes (e.g., WiFi to cellular)
    const connection = (navigator as any).connection;
    if (connection) {
      const handleConnectionChange = () => {
        const updatedCapabilities = {
          ...capabilities,
          connectionType: connection.effectiveType || null,
        };
        setTier(calculatePerformanceTier(updatedCapabilities));
      };

      if (connection.addEventListener) {
        connection.addEventListener('change', handleConnectionChange);
        return () => connection.removeEventListener('change', handleConnectionChange);
      } else if (connection.addListener) {
        // Fallback for older browsers
        connection.addListener(handleConnectionChange);
        return () => connection.removeListener(handleConnectionChange);
      }
    }
  }, []);

  return tier;
}

/**
 * Calculate performance tier based on device capabilities
 */
function calculatePerformanceTier(capabilities: DeviceCapabilities): PerformanceTier {
  const { hardwareConcurrency, deviceMemory, connectionType, isMobile } = capabilities;

  // Mobile devices generally get lower tier unless they're high-end
  if (isMobile) {
    // High-end mobile: 6+ cores and 6GB+ RAM
    if (hardwareConcurrency >= 6 && deviceMemory !== null && deviceMemory >= 6) {
      return 'medium';
    }
    // Low-end mobile: <4 cores or <4GB RAM
    if (hardwareConcurrency < 4 || (deviceMemory !== null && deviceMemory < 4)) {
      return 'low';
    }
    // Mid-range mobile
    return 'medium';
  }

  // Desktop/laptop devices
  // High tier: 6+ cores (more lenient) and good connection
  // If deviceMemory is null (not available), assume it's sufficient for high tier if cores >= 6
  if (
    hardwareConcurrency >= 6 &&
    (deviceMemory === null || deviceMemory >= 6) &&
    connectionType !== 'slow-2g' &&
    connectionType !== '2g'
  ) {
    return 'high';
  }

  // Low tier: <4 cores or <4GB RAM, or very slow connection
  if (
    hardwareConcurrency < 4 ||
    (deviceMemory !== null && deviceMemory < 4) ||
    connectionType === 'slow-2g' ||
    connectionType === '2g'
  ) {
    return 'low';
  }

  // Default to medium for everything else (4-5 cores, or unknown memory)
  return 'medium';
}

/**
 * Get recommended layer count based on performance tier
 * Aggressively optimized: Further reduced for maximum scroll performance
 */
export function getRecommendedLayerCount(tier: PerformanceTier): number {
  switch (tier) {
    case 'high':
      return 2; // Aggressively optimized: 2 layers (Layer 1, 2) - was 4
    case 'medium':
      return 1; // Aggressively optimized: 1 layer (Layer 1 only) - was 2
    case 'low':
      return 1; // Aggressively optimized: 1 layer (Layer 1 only) - unchanged
  }
}

/**
 * Get recommended animation speed based on performance tier
 * Aggressively optimized: More conservative defaults for better scroll performance
 */
export function getRecommendedSpeed(tier: PerformanceTier): 'normal' | 'slow' | 'static' {
  switch (tier) {
    case 'high':
      return 'slow'; // Changed from 'normal' to 'slow' for better performance
    case 'medium':
      return 'static'; // Changed from 'slow' to 'static' for maximum performance
    case 'low':
      return 'static';
  }
}
