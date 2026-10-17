'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

const AddElevatorMap = dynamic(() => import('../../_components/AddElevatorMap'), { ssr: false });

export default function AddElevatorPage() {
  const router = useRouter();
  const [coord,    setCoord]    = useState(null);
  const [name,     setName]     = useState('');
  const [location, setLocation] = useState('');
  const [mac,      setMac]      = useState('');
  const [floorCount, setFloorCount] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSave = async () => {
    if (!name.trim() || !location.trim() || !coord) {
      setError('Placez un marqueur sur la carte et remplissez tous les champs.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch('/elevators', {
        method: 'POST',
        body: JSON.stringify({
          name:      name.trim(),
          location:  location.trim(),
          latitude:  coord.lat,
          longitude: coord.lng,
          macAddress: mac.trim() || undefined,
          floorCount: floorCount.trim() || undefined,
        }),
      });
      if (res.ok) {
        router.replace('/dashboard');
      } else {
        const d = await res.json();
        setError(d.error || 'Erreur lors de la création.');
      }
    } catch {
      setError('Erreur réseau.');
    }
    setLoading(false);
  };

  return (
    <div className="flex h-full">
      {/* Form panel */}
      <div className="w-96 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-100">
          <button onClick={() => router.back()} className="text-sm text-slate-400 hover:text-slate-700 mb-3 flex items-center gap-1">
            ← Retour
          </button>
          <h1 className="text-xl font-bold text-slate-800">Installer un ascenseur</h1>
          <p className="text-sm text-slate-500 mt-1">Cliquez sur la carte pour placer l'ascenseur, puis remplissez les détails.</p>
        </div>

        <div className="px-6 py-5 space-y-4 flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          {/* Coordinates display */}
          <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm">
            <p className="text-slate-500 text-xs font-medium mb-0.5">Coordonnées GPS</p>
            {coord
              ? <p className="font-mono text-slate-700">{coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}</p>
              : <p className="text-amber-600 text-xs">👆 Cliquez sur la carte pour placer le marqueur</p>
            }
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Désignation de l'ascenseur *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="ex. Ascenseur #105 - Bloc B"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Adresse / Description *</label>
            <textarea value={location} onChange={e => setLocation(e.target.value)}
              rows={3} placeholder="ex. Rue 12, Maarif, Imm. 4, 2ème étage"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Adresse MAC du dispositif</label>
            <input value={mac} onChange={e => setMac(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Nombre d'étages (lecteur unique en cabine)</label>
            <input type="number" min="1" value={floorCount} onChange={e => setFloorCount(e.target.value)}
              placeholder="ex. 17 — laisser vide si non applicable"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-slate-400 mt-1">Détermine les étages sélectionnables lors de l'ajout d'un résident. Laisser vide pour les ascenseurs à lecteurs par étage.</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100">
          <button onClick={handleSave} disabled={loading || !coord}
            className="w-full bg-navy text-white py-3 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50">
            {loading ? 'Enregistrement…' : '✔ Confirmer l\'installation'}
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <AddElevatorMap coord={coord} onPlace={setCoord} />
        {!coord && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm
            border border-slate-200 rounded-full px-5 py-2 text-sm text-slate-600 shadow pointer-events-none">
            👆 Cliquez sur la carte pour placer l'ascenseur
          </div>
        )}
      </div>
    </div>
  );
}
