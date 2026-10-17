'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

const STATUS_BADGE = {
  PENDING:   'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  REJECTED:  'bg-red-100 text-red-700',
};

export default function RequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchRequests = useCallback(async () => {
    const res = await apiFetch('/requests/pending');
    if (res.ok) setRequests(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const updateStatus = async (id, status) => {
    const res = await apiFetch(`/requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      showToast(`Demande marquée : ${status === 'COMPLETED' ? 'Complétée' : 'Rejetée'}.`);
      fetchRequests();
    } else {
      showToast('Erreur lors de la mise à jour.', 'error');
    }
  };

  return (
    <div className="p-8">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
          ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Demandes des syndics</h1>
          <p className="text-slate-500 text-sm mt-0.5">Nouvelles cartes à valider</p>
        </div>
        <button onClick={fetchRequests} className="text-sm text-blue-600 hover:underline">Actualiser</button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Chargement…</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20 text-slate-400">Aucune demande en attente.</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs text-slate-500 uppercase tracking-wide text-left">
                <th className="px-5 py-3">Syndic</th>
                <th className="px-5 py-3">Ascenseur</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Résident</th>
                <th className="px-5 py-3">Notes</th>
                <th className="px-5 py-3">Statut</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium">{r.syndic?.name || '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{r.elevator?.name || '—'}</td>
                  <td className="px-5 py-3">
                    <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {r.type}
                    </span>
                  </td>
                  <td className="px-5 py-3">{r.residentName}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs max-w-xs truncate">{r.notes || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] || ''}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-5 py-3">
                    {r.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateStatus(r.id, 'COMPLETED')}
                          className="bg-green-50 text-green-700 hover:bg-green-100 text-xs px-3 py-1 rounded-lg font-medium transition"
                        >
                          Valider
                        </button>
                        <button
                          onClick={() => updateStatus(r.id, 'REJECTED')}
                          className="bg-red-50 text-red-600 hover:bg-red-100 text-xs px-3 py-1 rounded-lg font-medium transition"
                        >
                          Rejeter
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
