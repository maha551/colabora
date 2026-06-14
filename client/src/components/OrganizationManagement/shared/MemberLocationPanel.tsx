import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Icon } from '../../ui/Icon';
import { Input } from '../../ui/input';
import { Checkbox } from '../../ui/checkbox';
import { Organization, User, MemberLocation, CityAggregate } from '../../../types';
import { organizationsApi, geocodeApi, ApiError, RateLimitError } from '../../../lib/api';
import { MemberLocationsMap } from '../MemberLocationsMap';
import { toast } from 'sonner';
import { logger } from '../../../lib/logger';
import { RADIUS } from '../../../lib/designSystem';
import { cn } from '../../ui/utils';

interface MemberLocationPanelProps {
  organization: Organization;
  currentUser: User;
}

export function MemberLocationPanel({ organization, currentUser: _currentUser }: MemberLocationPanelProps) {
  const { t } = useTranslation('organization');

  const [myLocation, setMyLocation] = useState<MemberLocation | null>(null);
  const [memberLocations, setMemberLocations] = useState<CityAggregate[]>([]);
  const [memberLocationsLoading, setMemberLocationsLoading] = useState(false);
  const [myLocationLoading, setMyLocationLoading] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [citySearchResults, setCitySearchResults] = useState<Array<{ city: string; region: string | null; countryCode: string; latitude: number; longitude: number; displayName: string }>>([]);
  const [selectedCity, setSelectedCity] = useState<{ city: string; region: string | null; countryCode: string; latitude: number; longitude: number } | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [useCurrentLocationLoading, setUseCurrentLocationLoading] = useState(false);
  const [showOnMap, setShowOnMap] = useState(true);
  const [citySearchLoading, setCitySearchLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMyLocationLoading(true);
      setMemberLocationsLoading(true);
      try {
        const [myRes, aggRes] = await Promise.all([
          organizationsApi.getMyLocation(organization.id),
          organizationsApi.getMemberLocations(organization.id),
        ]);
        if (!cancelled) {
          setMyLocation(myRes.location ?? null);
          setMemberLocations(aggRes.cities ?? []);
          if (myRes.location) {
            setShowOnMap(myRes.location.showOnMap);
            setSelectedCity({
              city: myRes.location.city,
              region: myRes.location.region,
              countryCode: myRes.location.countryCode,
              latitude: myRes.location.latitude,
              longitude: myRes.location.longitude,
            });
          }
        }
      } catch {
        if (!cancelled) {
          setMyLocation(null);
          setMemberLocations([]);
        }
      } finally {
        if (!cancelled) {
          setMyLocationLoading(false);
          setMemberLocationsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [organization.id]);

  useEffect(() => {
    if (!citySearchQuery.trim() || citySearchQuery.length < 2) {
      setCitySearchResults([]);
      setCitySearchLoading(false);
      return;
    }
    setCitySearchLoading(true);
    const timeoutId = setTimeout(async () => {
      try {
        const { results } = await geocodeApi.search(citySearchQuery, 10);
        setCitySearchResults(results ?? []);
      } catch (err) {
        setCitySearchResults([]);
        logger.error('City search failed', { error: err instanceof Error ? err.message : err });
        toast.error(t('citySearchFailed'));
      } finally {
        setCitySearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [citySearchQuery, t]);

  const handleSaveManualLocation = async () => {
    if (!selectedCity) {
      toast.error(t('setCityManual'));
      return;
    }
    const cc = (selectedCity.countryCode || '').trim().toLowerCase();
    if (!selectedCity.city?.trim() || cc.length !== 2) {
      toast.error(t('setCityManual'));
      return;
    }
    setSavingLocation(true);
    try {
      const res = await organizationsApi.setMyLocation(organization.id, {
        city: selectedCity.city.trim(),
        region: selectedCity.region ?? undefined,
        countryCode: cc,
        latitude: selectedCity.latitude,
        longitude: selectedCity.longitude,
        source: 'manual',
        showOnMap,
      });
      setMyLocation(res.location);
      toast.success(t('locationUpdated'));
      const aggRes = await organizationsApi.getMemberLocations(organization.id);
      setMemberLocations(aggRes.cities ?? []);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : t('failedToVote');
      toast.error(msg);
    } finally {
      setSavingLocation(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setUseCurrentLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await organizationsApi.setMyLocation(organization.id, {
            useCurrentLocation: true,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            showOnMap,
          });
          setMyLocation(res.location);
          setSelectedCity(res.location ? { city: res.location.city, region: res.location.region, countryCode: res.location.countryCode, latitude: res.location.latitude, longitude: res.location.longitude } : null);
          toast.success(t('locationUpdated'));
          const aggRes = await organizationsApi.getMemberLocations(organization.id);
          setMemberLocations(aggRes.cities ?? []);
        } catch (err: unknown) {
          if (err instanceof RateLimitError || (err instanceof ApiError && err.status === 429)) {
            toast.error(t('locationUpdateOncePerDay'));
          } else {
            toast.error(err instanceof Error ? err.message : 'Failed to update location');
          }
        } finally {
          setUseCurrentLocationLoading(false);
        }
      },
      () => {
        toast.error('Could not get your location. Try setting your city manually.');
        setUseCurrentLocationLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleToggleShowOnMap = async () => {
    const next = !showOnMap;
    setShowOnMap(next);
    if (!myLocation) return;
    const cc = (myLocation.countryCode || '').trim().toLowerCase();
    if (cc.length !== 2) {
      toast.error(t('setCityManual'));
      setShowOnMap(myLocation.showOnMap);
      return;
    }
    setSavingLocation(true);
    try {
      const res = await organizationsApi.setMyLocation(organization.id, {
        city: myLocation.city,
        region: myLocation.region ?? undefined,
        countryCode: cc,
        latitude: myLocation.latitude,
        longitude: myLocation.longitude,
        source: 'manual',
        showOnMap: next,
      });
      setMyLocation(res.location);
      const aggRes = await organizationsApi.getMemberLocations(organization.id);
      setMemberLocations(aggRes.cities ?? []);
    } catch {
      setShowOnMap(myLocation.showOnMap);
      toast.error('Failed to update visibility');
    } finally {
      setSavingLocation(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon name="MapPin" className="h-5 w-5" />
          {t('memberLocations')}
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">{t('memberLocationsDescription')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2">
          {myLocationLoading ? (
            <p className="text-xs text-muted-foreground">{t('loading')}...</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[140px] max-w-xs">
                  <Input
                    id="city-search-map"
                    type="text"
                    placeholder={t('searchCityPlaceholder')}
                    value={citySearchQuery}
                    onChange={(e) => setCitySearchQuery(e.target.value)}
                    className="h-8 text-sm"
                  />
                  {citySearchLoading && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <span className={cn("inline-block h-3 w-3 animate-spin border-2 border-current border-t-transparent", RADIUS.pill)} />
                    </span>
                  )}
                </div>
                <Button variant="secondary" size="sm" className="h-8 text-xs shrink-0" onClick={handleUseCurrentLocation} disabled={useCurrentLocationLoading}>
                  {useCurrentLocationLoading ? '...' : t('useCurrentLocation')}
                </Button>
                <Button size="sm" className="h-8 text-xs shrink-0" onClick={handleSaveManualLocation} disabled={!selectedCity || savingLocation}>
                  {savingLocation ? '...' : t('saveLocation')}
                </Button>
              </div>
              {citySearchResults.length > 0 && (
                <ul className={cn("border border-border divide-y divide-border max-h-32 overflow-auto bg-card text-sm", RADIUS.control)}>
                  {citySearchResults.map((r, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 hover:bg-muted"
                        onClick={() => {
                          setSelectedCity({ city: r.city, region: r.region, countryCode: r.countryCode, latitude: r.latitude, longitude: r.longitude });
                          setCitySearchQuery(r.displayName);
                          setCitySearchResults([]);
                        }}
                      >
                        {r.displayName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!citySearchLoading && citySearchQuery.trim().length >= 2 && citySearchResults.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('noCitiesFound')}</p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {selectedCity && (
                  <span className="text-xs text-muted-foreground">
                    {selectedCity.region ? `${selectedCity.city}, ${selectedCity.region}` : selectedCity.city} ({selectedCity.countryCode.toUpperCase()})
                  </span>
                )}
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox id="show-on-map" checked={!showOnMap} onCheckedChange={() => handleToggleShowOnMap()} className="size-4" />
                  <span className="text-xs text-muted-foreground">{t('hideFromMap')}</span>
                </label>
              </div>
            </>
          )}
        </div>
        <MemberLocationsMap cities={memberLocations} loading={memberLocationsLoading} />
      </CardContent>
    </Card>
  );
}
