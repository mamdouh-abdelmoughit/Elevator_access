'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { statusTailwind, statusLabel, STATUS_META } from '@/lib/elevatorStatus';

const ElevatorMap = dynamic(() => import('./_components/ElevatorMap'), { ssr: false });
const OFFLINE_MS  = 60 * 1000;

function isTechOnline(tech) {
  if (!tech.locationUpdatedAt) return false;
  return tech.isOnline && (Date.now() - new Date(tech.locationUpdatedAt).getTime()) < OFFLINE_MS;
}

function notifyOffline(name) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification('⚠️ Technicien hors ligne', { body: `${name} a perdu la connexion.`, icon: '/favicon.ico' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification('⚠️ Technicien hors ligne', { body: `${name} a perdu la connexion.` });
    });
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [elevators,    setElevators]    = useState([]);
  const [technicians,  setTechnicians]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [view,         setView]         = useState('map');
  const prevOnlineRef = useRef({});

  const fetchData = useCallback(async () => {
    try {
      const [elevRes, userRes] = await Promise.all([
        apiFetch('/elevators'),
        apiFetch('/users'),
      ]);
      if (elevRes.ok) setElevators(await elevRes.json());
      if (userRes.ok) {
        const users = await userRes.json();
        const techs = users.filter(u => u.role === 'EMPLOYEE' && u.latitude && u.longitude);
        // detect transitions online → offline
        techs.forEach(t => {
          const wasOnline = prevOnlineRef.current[t.id];
          const nowOnline = isTechOnline(t);
          if (wasOnline && !nowOnline) notifyOffline(t.name);
          prevOnlineRef.current[t.id] = nowOnline;
        });
        setTechnicians(techs);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-700">
            {elevators.length} ascenseur{elevators.length !== 1 ? 's' : ''}
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-sm text-green-600 font-medium">
            ● {technicians.length} technicien{technicians.length !== 1 ? 's' : ''} en ligne
          </span>
          <span className="text-xs text-slate-400 hidden sm:inline">Actualisation auto. 5s</span>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-medium">
            <button onClick={() => setView('map')}
              className={`px-3 py-1.5 rounded-md transition ${view === 'map' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              🗺️ Carte
            </button>
            <button onClick={() => setView('list')}
              className={`px-3 py-1.5 rounded-md transition ${view === 'list' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              📋 Liste
            </button>
          </div>
          <button onClick={() => router.push('/dashboard/elevators/add')}
            className="bg-navy text-white text-sm px-4 py-2 rounded-lg hover:opacity-90 transition">
            + Ajouter un ascenseur
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">Chargement…</div>
      ) : view === 'map' ? (
        <div className="flex-1 relative">
          <ElevatorMap elevators={elevators} technicians={technicians} />
          {/* Legend */}
          <div className="absolute bottom-5 left-5 z-[1000] bg-white rounded-xl shadow-lg px-4 py-3 text-sm space-y-1.5 pointer-events-none">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Légende</p>
            {Object.entries(STATUS_META).map(([key, { color, label }]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: color }}></span>
                <span className="text-slate-600">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t border-slate-100 pt-1 mt-1">
              <span className="inline-block w-3 h-3 rounded-full shrink-0 bg-blue-600"></span>
              <span className="text-slate-600">Technicien sur terrain</span>
            </div>
          </div>
        </div>
      ) : (
        /* List view */
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {elevators.map(elev => (
              <button key={elev.id}
                onClick={() => router.push(`/dashboard/elevators/${elev.id}`)}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-left hover:shadow-md hover:border-blue-300 transition group">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-2xl">🛗</div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusTailwind(elev.currentStatus)}`}>
                    {statusLabel(elev.currentStatus)}
                  </span>
                </div>
                <div className="font-semibold text-slate-800 group-hover:text-blue-700 truncate">{elev.name}</div>
                <div className="text-xs text-slate-500 truncate mt-0.5">{elev.location}</div>
                {elev.lastHeartbeat && (
                  <div className="text-xs text-slate-400 mt-3">
                    {new Date(elev.lastHeartbeat).toLocaleTimeString('fr-FR')}
                  </div>
                )}
              </button>
            ))}
            {elevators.length === 0 && (
              <p className="col-span-4 text-center py-20 text-slate-400">Aucun ascenseur enregistré.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
