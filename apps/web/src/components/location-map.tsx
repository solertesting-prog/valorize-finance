'use client';

import type { LocationDto } from '@valorize/shared';
import dynamic from 'next/dynamic';

/** Mapa de ubicaciones (Leaflet + OpenStreetMap). Solo cliente: Leaflet usa window. */
const Inner = dynamic(() => import('./location-map-inner'), {
  ssr: false,
  loading: () => <div className="map" aria-hidden />,
});

export function LocationMap(props: {
  locations: LocationDto[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  me?: { lat: number; lng: number } | null;
}) {
  return <Inner {...props} />;
}
