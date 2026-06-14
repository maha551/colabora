/**
 * Icon Component
 *
 * Renders icons from the organization's chosen set (Lucide, Tabler, or Heroicons).
 * Size via className (e.g. h-4 w-4), a semantic size token ('xs'|'sm'|'md'|'lg'|'xl'|'2xl'),
 * or a raw pixel number. className sizes remain fully supported.
 * Lucide is resolved synchronously; Tabler and Heroicons load asynchronously with a brief fallback.
 */

import React, { useState, useEffect } from 'react';
import { LUCIDE_ICONS } from '../../lib/lucideIcons';
import { getIcon } from '../../lib/iconLoader';
import { useOrganizationDesign } from '../../contexts/OrganizationDesignContext';
import { ICON_SIZE_CLASS, type IconSize } from '../../lib/designSystem';
import { cn } from './utils';

/**
 * Returns true for both plain function components and forwardRef/memo objects.
 * Lucide icons (v0.4+) are forwardRef objects (typeof === 'object'), not functions.
 */
function isReactComponent(v: unknown): v is React.ComponentType {
  if (v == null) return false;
  if (typeof v === 'function') return true;
  if (typeof v === 'object' && typeof (v as { render?: unknown }).render === 'function') return true;
  return false;
}

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  /** Icon name (PascalCase; Lucide names, mapped to Tabler/Heroicons when set is not Lucide) */
  name: string;
  /**
   * Size token ('xs'|'sm'|'md'|'lg'|'xl'|'2xl') or raw pixel number.
   * Token form prepends the matching Tailwind h-N w-N class to className.
   * Number form sets inline width/height in px.
   * Plain className sizing still works as before — this is additive.
   *   xs=12px  sm=16px  md=20px  lg=24px  xl=32px  2xl=48px
   */
  size?: IconSize | number;
  className?: string;
  /**
   * When true, always use the Lucide icon regardless of the organization's chosen icon set.
   *
   * Use ONLY when:
   * 1. The icon is part of system/functional UI that must be stable before any org context
   *    is loaded (e.g. login screen, connection status, theme toggle, vote buttons).
   * 2. The icon must never flicker during the async Tabler/Heroicons load (e.g. interactive
   *    controls rendered inside org territory that must be immediately visible).
   *
   * Do NOT use forceDefault to avoid adding an icon to lucideIcons.ts — add it to the registry
   * instead. Do NOT use it in personal-view components (activity, profile, documents, etc.)
   * where effectiveIconSet is already always 'lucide'.
   */
  forceDefault?: boolean;
}

/** Check if className includes a Tailwind text-color utility so we don't override callers. */
function hasTextColorClass(className?: string): boolean {
  if (!className || typeof className !== 'string') return false;
  return /\btext-[\w-./]+/.test(className);
}

/** Resolve the size prop into either a Tailwind class string or a raw pixel number. */
function resolveSize(size?: IconSize | number): { sizeClass?: string; sizePx?: number } {
  if (size == null) return {};
  if (typeof size === 'number') return { sizePx: size };
  return { sizeClass: ICON_SIZE_CLASS[size] };
}

type IconComp = React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties } & Record<string, unknown>>;

type ResolvedIconComp = React.ComponentType<{ className?: string; style?: React.CSSProperties } & Record<string, unknown>>;

function renderFallback(
  className?: string,
  size?: IconSize | number,
  props?: React.SVGProps<SVGSVGElement>,
  label?: string
): React.ReactElement {
  const { sizeClass, sizePx } = resolveSize(size);
  const effectiveClassName = cn(sizeClass, className, 'text-muted-foreground');
  const style = sizePx != null ? { width: sizePx, height: sizePx, color: 'var(--muted-foreground)' } : { color: 'var(--muted-foreground)' };
  const Fallback = LUCIDE_ICONS['HelpCircle'] as IconComp | undefined;
  if (isReactComponent(Fallback)) {
    const FallbackComp = Fallback as IconComp;
    return (
      <FallbackComp
        {...(props ?? {})}
        size={sizePx}
        className={effectiveClassName}
        style={style}
        aria-label={label}
      />
    );
  }
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
    console.warn('[Icon] Lucide registry missing HelpCircle; using inline fallback.');
  }
  const px = sizePx ?? 20;
  const { style: propsStyle, ...restProps } = props ?? {};
  return (
    <svg
      className={cn(sizeClass, className, 'text-muted-foreground')}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ color: 'var(--muted-foreground)', width: px, height: px, flexShrink: 0, ...(propsStyle as React.CSSProperties) }}
      {...restProps}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function Icon({ name, size, className, forceDefault = false, ...props }: IconProps) {
  const { effectiveIconSet } = useOrganizationDesign();
  const iconSet = forceDefault ? 'lucide' : (effectiveIconSet ?? 'lucide');
  const resolvedName = name && typeof name === 'string' ? name : '';

  const { sizeClass, sizePx } = resolveSize(size);

  const [resolvedAsyncIcon, setResolvedAsyncIcon] = useState<ResolvedIconComp | null>(null);

  useEffect(() => {
    if (!resolvedName) {
      setResolvedAsyncIcon(null);
      return;
    }
    if (iconSet === 'lucide') {
      // Only use async fallback when sync registry missed; clear when switching to Lucide
      const fromRegistry = LUCIDE_ICONS[resolvedName];
      if (isReactComponent(fromRegistry)) {
        setResolvedAsyncIcon(null);
        return;
      }
      // Sync registry miss: resolve via loader so Lucide still works (e.g. in org view)
      let cancelled = false;
      getIcon(resolvedName, 'lucide').then((Comp) => {
        if (!cancelled && Comp) {
          setResolvedAsyncIcon(Comp as ResolvedIconComp);
        } else if (!cancelled) {
          setResolvedAsyncIcon(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    getIcon(resolvedName, iconSet).then((Comp) => {
      if (!cancelled && Comp) {
        setResolvedAsyncIcon(Comp as ResolvedIconComp);
      } else if (!cancelled) {
        setResolvedAsyncIcon(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedName, iconSet]);

  if (!resolvedName) {
    return renderFallback(className, size, props);
  }

  // Lucide path: sync from registry, or async fallback when registry miss (e.g. org view)
  if (iconSet === 'lucide') {
    const IconComponent = LUCIDE_ICONS[resolvedName] as IconComp | undefined;
    if (isReactComponent(IconComponent)) {
      const Comp = IconComponent as IconComp;
      const hasColor = hasTextColorClass(className);
      const effectiveClassName = cn(sizeClass, hasColor ? className : cn(className, 'text-foreground'));
      const baseStyle = sizePx != null ? { width: sizePx, height: sizePx, ...props.style } : props.style;
      const style =
        hasColor || baseStyle?.color
          ? baseStyle
          : { ...baseStyle, color: 'var(--foreground)' };
      return (
        <Comp
          {...props}
          size={sizePx}
          className={effectiveClassName}
          style={style}
        />
      );
    }
    if (resolvedAsyncIcon) {
      const hasColor = hasTextColorClass(className);
      const effectiveClassName = cn(sizeClass, hasColor ? className : cn(className, 'text-foreground'));
      const baseStyle = sizePx != null ? { width: sizePx, height: sizePx, ...props.style } : props.style;
      const style =
        hasColor || baseStyle?.color
          ? baseStyle
          : { ...baseStyle, color: 'var(--foreground)' };
      const ResolvedIcon = resolvedAsyncIcon;
      return (
        <ResolvedIcon
          {...props}
          className={effectiveClassName}
          style={style}
        />
      );
    }
    if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
      console.warn(`[Icon] Unknown icon name "${resolvedName}". Add it to client/src/lib/lucideIcons.ts or fix the name.`);
    }
    return renderFallback(className, size, props, props['aria-label'] ?? `Unknown icon: ${resolvedName}`);
  }

  // Tabler/Heroicons path: render resolved component or fallback while loading
  const hasColor = hasTextColorClass(className);
  const effectiveClassName = cn(sizeClass, hasColor ? className : cn(className, 'text-foreground'));
  const baseStyle = sizePx != null ? { width: sizePx, height: sizePx, ...props.style } : props.style;
  const style =
    hasColor || baseStyle?.color
      ? baseStyle
      : { ...baseStyle, color: 'var(--foreground)' };

  if (resolvedAsyncIcon) {
    const ResolvedIcon = resolvedAsyncIcon;
    return (
      <ResolvedIcon
        {...props}
        className={effectiveClassName}
        style={style}
      />
    );
  }
  return renderFallback(className, size, props);
}
