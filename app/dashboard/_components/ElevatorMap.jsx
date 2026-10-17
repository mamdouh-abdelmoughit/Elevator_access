'use client';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRouter } from 'next/navigation';
import { statusColor, statusLabel } from '@/lib/elevatorStatus';

const OFFLINE_MS = 60 * 1000;

function techOnline(tech) {
  if (!tech.locationUpdatedAt) return false;
  return tech.isOnline && (Date.now() - new Date(tech.locationUpdatedAt).getTime()) < OFFLINE_MS;
}

function makeDotIcon(color) {
  return L.divIcon({
    html: `<div style="
      background:${color};width:18px;height:18px;border-radius:50%;
      border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);
    "></div>`,
    className: '',
    iconSize:   [18, 18],
    iconAnchor: [9, 9],
    popupAnchor:[0, -13],
  });
}

function makeInitialIcon(initial, color) {
  return L.divIcon({
    html: `<div style="
      background:${color};width:34px;height:34px;border-radius:50%;
      border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
      color:white;font-weight:800;font-size:14px;font-family:sans-serif;
    ">${initial}</div>`,
    className: '',
    iconSize:   [34, 34],
    iconAnchor: [17, 17],
    popupAnchor:[0, -21],
  });
}

function FitBounds({ items }) {
  const map    = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    const valid = items.filter(e => e.latitude && e.longitude);
    if (valid.length === 0) return;
    map.fitBounds(valid.map(e => [e.latitude, e.longitude]), { padding: [60, 60], maxZoom: 14 });
    fitted.current = true;
  }, [items, map]);
  return null;
}

export default function ElevatorMap({ elevators = [], technicians = [] }) {
  const router = useRouter();
  const all    = [...elevators, ...technicians].filter(e => e.latitude && e.longitude);

  return (
    <MapContainer center={[31.7917, -7.0926]} zoom={6}
      style={{ height: '100%', width: '100%' }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {all.length > 0 && <FitBounds items={all} />}

      {elevators.filter(e => e.latitude && e.longitude).map(elev => (
        <Marker key={`elev-${elev.id}`}
          position={[elev.latitude, elev.longitude]}
          icon={makeDotIcon(statusColor(elev.currentStatus))}>
          <Popup>
            <div style={{ minWidth: 170 }}>
              <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🏢 {elev.name}</p>
              <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{elev.location}</p>
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: statusColor(elev.currentStatus) }}>
                {statusLabel(elev.currentStatus)}
              </p>
              <button onClick={() => router.push(`/dashboard/elevators/${elev.id}`)}
                style={{ background: '#1B3A6B', color: 'white', border: 'none', borderRadius: 6,
                  padding: '6px 12px', cursor: 'pointer', width: '100%', fontWeight: 600, fontSize: 13 }}>
                Gérer →
              </button>
            </div>
          </Popup>
        </Marker>
      ))}

      {technicians.filter(t => t.latitude && t.longitude).map(tech => {
        const online = techOnline(tech);
        const color  = online ? '#22c55e' : '#94a3b8';
        return (
          <Marker key={`tech-${tech.id}`}
            position={[tech.latitude, tech.longitude]}
            icon={makeInitialIcon((tech.name || '?')[0].toUpperCase(), color)}>
            <Popup>
              <div style={{ minWidth: 150 }}>
                <p style={{ fontWeight: 700, marginBottom: 2 }}>👷 {tech.name}</p>
                <p style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{tech.phone}</p>
                <p style={{ fontSize: 12, fontWeight: 600, color }}>
                  {online ? '● En ligne' : '● Hors ligne'}
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
