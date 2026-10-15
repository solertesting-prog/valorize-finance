'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { LocationDto } from '@valorize/shared';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';

const pin = (selected: boolean) =>
  L.divIcon({
    className: '',
    html: `<div class="vf-pin" style="${selected ? 'transform:scale(1.35)' : ''}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);
  return null;
}

export default function LocationMapInner({
  locations,
  selectedId,
  onSelect,
  me,
}: {
  locations: LocationDto[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  me?: { lat: number; lng: number } | null;
}) {
  const points: [number, number][] = locations.map((l) => [l.latitude, l.longitude]);
  if (me) points.push([me.lat, me.lng]);
  const center: [number, number] = points[0] ?? [41.3874, 2.1686];

  return (
    <div className="map" role="region" aria-label="Mapa de ubicaciones">
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Fit points={points} />
        {me ? <CircleMarker center={[me.lat, me.lng]} radius={7} pathOptions={{ color: '#6cb6ff', fillOpacity: 0.9 }} /> : null}
        {locations.map((l) => (
          <Marker
            key={l.id}
            position={[l.latitude, l.longitude]}
            icon={pin(l.id === selectedId)}
            eventHandlers={{ click: () => onSelect?.(l.id) }}
            keyboard
            title={l.name}
          >
            <Tooltip direction="top" offset={[0, -10]}>
              {l.name}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
