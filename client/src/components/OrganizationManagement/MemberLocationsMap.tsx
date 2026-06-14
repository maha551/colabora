import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type { CityAggregate } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { Icon } from '../ui/Icon';
import { SPACING, COLORS, RADIUS } from '../../lib/designSystem';
import 'leaflet/dist/leaflet.css';
import './MemberLocationsMap.css';

// Fix default marker icon with Vite (paths otherwise break)
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerIconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { cn } from '../ui/utils';
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl,
});

const CARTO_ATTRIBUTION = '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const CARTO_TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
} as const;

function createMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'member-location-marker',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function FitBounds({ cities }: { cities: CityAggregate[] }) {
  const map = useMap();
  const bounds = useMemo(() => {
    if (cities.length === 0) return null;
    const b = L.latLngBounds(
      cities.map((c) => [c.latitude, c.longitude] as [number, number])
    );
    return b;
  }, [cities]);
  React.useEffect(() => {
    if (bounds && cities.length > 0) {
      map.fitBounds(bounds as LatLngBoundsExpression, { padding: [24, 24], maxZoom: 12 });
    }
  }, [map, bounds, cities.length]);
  return null;
}

interface MemberLocationsMapProps {
  cities: CityAggregate[];
  loading?: boolean;
}

export function MemberLocationsMap({ cities, loading = false }: MemberLocationsMapProps) {
  const { t } = useTranslation('organization');
  const { resolvedTheme } = useTheme();
  const markerIcon = useMemo(() => createMarkerIcon(), []);

  const defaultCenter: [number, number] = [20, 0];
  const defaultZoom = 2;
  const tileUrl = CARTO_TILE_URLS[resolvedTheme];

  if (loading) {
    return (
      <div
        className={cn(RADIUS.panel, "border border-border bg-muted/30", SPACING.card.padding)}
        style={{ minHeight: 320 }}
      >
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <span className={cn("inline-block h-5 w-5 animate-spin border-2 border-current border-t-transparent", RADIUS.pill)} />
          <span>{t('loading')}...</span>
        </div>
      </div>
    );
  }

  if (cities.length === 0) {
    return (
      <div
        className={cn(RADIUS.panel, "border border-border bg-muted/30", SPACING.card.padding)}
        style={{ minHeight: 280 }}
      >
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <Icon name="MapPin" className="h-12 w-12 text-muted-foreground/70" />
          <p className={COLORS.text.secondary}>{t('noLocationsSharedYet')}</p>
          <p className="text-sm text-muted-foreground/80">{t('membersCanAddCityAbove')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("member-locations-map border border-border overflow-hidden", RADIUS.panel)} style={{ height: 360 }}>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          key={resolvedTheme}
          url={tileUrl}
          subdomains="abcd"
          attribution={CARTO_ATTRIBUTION}
        />
        {cities.map((c, i) => (
          <Marker key={`${c.city}-${c.countryCode}-${i}`} position={[c.latitude, c.longitude]} icon={markerIcon}>
            <Popup>
              <span className="font-medium">
                {c.region ? `${c.city}, ${c.region}` : c.city} ({c.count})
              </span>
            </Popup>
          </Marker>
        ))}
        <FitBounds cities={cities} />
      </MapContainer>
    </div>
  );
}
