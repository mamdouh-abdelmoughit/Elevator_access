'use client';
import { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pinIcon = L.divIcon({
  html: `<div style="background:#EF4444;width:22px;height:22px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function ClickHandler({ onPlace }) {
  useMapEvents({ click: (e) => onPlace(e.latlng) });
  return null;
}

export default function AddElevatorMap({ coord, onPlace }) {
  return (
    <MapContainer center={[31.7917, -7.0926]} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPlace={onPlace} />
      {coord && <Marker position={coord} icon={pinIcon} />}
    </MapContainer>
  );
}
