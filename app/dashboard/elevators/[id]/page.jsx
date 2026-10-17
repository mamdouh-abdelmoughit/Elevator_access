'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, downloadBlob, getUser } from '@/lib/api';
import { statusColor, statusTailwind, statusLabel } from '@/lib/elevatorStatus';

const COMMANDS = [
  { label: '— Commandes standard —', value: '', disabled: true },
  { label: 'Ouvrir Porte (ON)',       value: 'OPEN_DOOR_ON' },
  { label: 'Ouvrir Porte (OFF)',      value: 'OPEN_DOOR_OFF' },
  { label: 'Fermer Porte (ON)',       value: 'CLOSE_DOOR_ON' },
  { label: 'Fermer Porte (OFF)',      value: 'CLOSE_DOOR_OFF' },
  { label: 'Arrêt urgence (ON)',      value: 'SHUTDOWN_ON' },
  { label: 'Arrêt urgence (OFF)',     value: 'SHUTDOWN_OFF' },
  { label: '— Accès cabine —',        value: '', disabled: true },
  { label: 'Accès libre (ON)',        value: 'FREE_ACCESS_ON' },
  { label: 'Accès libre (OFF)',       value: 'FREE_ACCESS_OFF' },
  { label: '— Mode révision —',       value: '', disabled: true },
  { label: 'Activer révision (ON)',   value: 'REVISION_MODE_ON' },
  { label: 'Désactiver révision',     value: 'REVISION_MODE_OFF' },
  { label: 'Monter (ON)',             value: 'REV_MONTEE_ON' },
  { label: 'Monter (OFF)',            value: 'REV_MONTEE_OFF' },
  { label: 'Descendre (ON)',          value: 'REV_DESCENTE_ON' },
  { label: 'Descendre (OFF)',         value: 'REV_DESCENTE_OFF' },
];

export default function ElevatorDetailPage() {
  const { id }   = useParams();
  const router   = useRouter();
  const user     = getUser();

  const [elevator,  setElevator]  = useState(null);
  const [whitelist, setWhitelist] = useState([]);
  const [managers,  setManagers]  = useState([]);
  const [command,   setCommand]   = useState('OPEN_DOOR_ON');
  const [sending,   setSending]   = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [assigning,   setAssigning]   = useState(false);
  const [selectedMgr, setSelectedMgr] = useState('');
  const [toast,       setToast]       = useState(null);

  const [residentName, setResidentName] = useState('');
  const [residentCard, setResidentCard] = useState('');
  const [residentFloor, setResidentFloor] = useState('');
  const [addingResident, setAddingResident] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Poll elevator status every 2s
  const fetchElevator = useCallback(async () => {
    const res = await apiFetch(`/elevators/${id}`);
    if (res.ok) setElevator(await res.json());
  }, [id]);

  const fetchWhitelist = useCallback(async () => {
    const res = await apiFetch(`/elevators/${id}/whitelist`);
    if (res.ok) setWhitelist(await res.json());
  }, [id]);

  const fetchManagers = useCallback(async () => {
    const res = await apiFetch('/users/managers');
    if (res.ok) setManagers(await res.json());
  }, []);

  useEffect(() => {
    fetchElevator();
    fetchWhitelist();
    if (user?.role === 'ADMIN') fetchManagers();
    const iv = setInterval(fetchElevator, 2000);
    return () => clearInterval(iv);
  }, [fetchElevator, fetchWhitelist, fetchManagers, user?.role]);

  const sendCommand = async () => {
    if (!command) return;
    setSending(true);
    const res = await apiFetch(`/elevators/${id}/command`, {
      method: 'POST',
      body: JSON.stringify({ commandType: command }),
    });
    setSending(false);
    showToast(res.ok ? 'Commande envoyée.' : 'Échec d\'envoi.', res.ok ? 'success' : 'error');
  };

  const toggleAccess = async (cardId, isActive) => {
    const action = isActive ? 'BLOCK' : 'UNBLOCK';
    if (!confirm(`Confirmer : ${action} cette carte ?`)) return;
    const res = await apiFetch(`/elevators/${id}/access-control`, {
      method: 'POST',
      body: JSON.stringify({ cardId, action }),
    });
    if (res.ok) { showToast(`Carte ${action === 'BLOCK' ? 'bloquée' : 'débloquée'}.`); fetchWhitelist(); }
    else showToast('Erreur lors de la modification.', 'error');
  };

  const downloadLogs = async () => {
    setDownloading(true);
    const today = new Date().toISOString().slice(0, 10);
    try {
      await downloadBlob(`/logs/elevator/${id}/export?date=${today}&type=all`, `elevator-${id}-${today}.zip`);
      showToast('Logs téléchargés.');
    } catch (e) {
      showToast(e.message === 'no_logs' ? 'Aucun log pour aujourd\'hui.' : 'Erreur téléchargement.', 'error');
    }
    setDownloading(false);
  };

  const canManageResidents = user?.role === 'ADMIN' || (elevator?.managerId && elevator.managerId === user?.id);

  const addResident = async () => {
    if (!residentName.trim() || !residentCard.trim() || residentFloor === '') return;
    setAddingResident(true);
    const res = await apiFetch(`/elevators/${id}/residents`, {
      method: 'POST',
      body: JSON.stringify({
        residentName: residentName.trim(),
        cardCode: residentCard.trim(),
        floor: parseInt(residentFloor, 10),
      }),
    });
    const data = await res.json();
    setAddingResident(false);
    if (res.ok) {
      const accessLabel = (data.floors || []).map(f => (f === 0 ? 'RDC' : `étage ${f}`)).join(', ');
      showToast(`${residentName} ajouté(e) — accès : ${accessLabel}.`);
      setResidentName(''); setResidentCard(''); setResidentFloor('');
      fetchWhitelist();
    } else {
      showToast(data.error || 'Erreur lors de l\'ajout.', 'error');
    }
  };

  const assignManager = async () => {
    if (!selectedMgr) return;
    setAssigning(true);
    const res = await apiFetch(`/elevators/${id}/assign-manager`, {
      method: 'POST',
      body: JSON.stringify({ userId: parseInt(selectedMgr) }),
    });
    setAssigning(false);
    if (res.ok) { showToast('Syndic assigné.'); fetchElevator(); }
    else showToast('Erreur assignation.', 'error');
  };


  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
          ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Back */}
      <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-800 mb-5 flex items-center gap-1">
        ← Retour
      </button>

      <h1 className="text-2xl font-bold text-slate-800 mb-6">{elevator?.name || `Ascenseur #${id}`}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Status ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-700 mb-4">État en temps réel</h2>
          <div className={`inline-block border px-4 py-2 rounded-xl text-lg font-bold ${statusTailwind(elevator?.currentStatus)}`}
               style={{ borderColor: statusColor(elevator?.currentStatus) }}>
            {statusLabel(elevator?.currentStatus)}
          </div>
          {elevator?.lastHeartbeat && (
            <p className="text-xs text-slate-400 mt-2">
              Dernière MAJ : {new Date(elevator.lastHeartbeat).toLocaleString('fr-FR')}
            </p>
          )}
          <p className="text-xs text-slate-400">{elevator?.location}</p>

          {/* Download logs */}
          <button
            onClick={downloadLogs}
            disabled={downloading}
            className="mt-4 w-full bg-slate-700 hover:bg-slate-800 text-white text-sm py-2 rounded-lg transition disabled:opacity-50"
          >
            {downloading ? 'Téléchargement…' : '📥 Télécharger logs du jour (ZIP)'}
          </button>
        </div>

        {/* ── Commands ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-700 mb-4">Panneau de contrôle</h2>
          <select
            value={command}
            onChange={e => setCommand(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {COMMANDS.map((c, i) => (
              <option key={i} value={c.value} disabled={c.disabled}>{c.label}</option>
            ))}
          </select>
          <button
            onClick={sendCommand}
            disabled={sending || !command}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white text-sm py-2 rounded-lg transition disabled:opacity-50"
          >
            {sending ? 'Envoi…' : 'Envoyer la commande'}
          </button>

          {/* Assign manager — admin only */}
          {user?.role === 'ADMIN' && managers.length > 0 && (
            <div className="mt-5 pt-5 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-600 mb-2">Assigner un syndic</p>
              <div className="flex gap-2">
                <select
                  value={selectedMgr}
                  onChange={e => setSelectedMgr(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choisir…</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.phone})</option>
                  ))}
                </select>
                <button
                  onClick={assignManager}
                  disabled={assigning || !selectedMgr}
                  className="bg-navy text-white text-sm px-4 rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {assigning ? '…' : 'Assigner'}
                </button>
              </div>
              {elevator?.managerId && (
                <p className="text-xs text-slate-400 mt-1">
                  Syndic actuel : {managers.find(m => m.id === elevator.managerId)?.name || `#${elevator.managerId}`}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Add resident (cabin-reader elevators only) ── */}
      {canManageResidents && elevator?.floorCount && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm mt-6 p-6">
          <h2 className="font-semibold text-slate-700 mb-1">Ajouter un résident</h2>
          <p className="text-xs text-slate-400 mb-4">
            Le RDC{elevator.roofAccess ? ` et le dernier étage (${elevator.floorCount})` : ''} sont accordés automatiquement en plus de l'étage choisi.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nom du résident</label>
              <input value={residentName} onChange={e => setResidentName(e.target.value)}
                placeholder="ex. Ahmed - Apt 12"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Code carte</label>
              <input value={residentCard} onChange={e => setResidentCard(e.target.value)}
                placeholder="Code badge"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Étage habité</label>
              <select value={residentFloor} onChange={e => setResidentFloor(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Choisir…</option>
                <option value="0">RDC</option>
                {Array.from({ length: elevator.floorCount }, (_, i) => i + 1).map(f => (
                  <option key={f} value={f}>Étage {f}</option>
                ))}
              </select>
            </div>
            <button onClick={addResident} disabled={addingResident || !residentName.trim() || !residentCard.trim() || residentFloor === ''}
              className="bg-navy text-white text-sm px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50">
              {addingResident ? 'Ajout…' : '+ Ajouter'}
            </button>
          </div>
        </div>
      )}

      {/* ── Whitelist ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mt-6 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-700">Cartes autorisées ({whitelist.length})</h2>
          <button onClick={fetchWhitelist} className="text-xs text-blue-600 hover:underline">Actualiser</button>
        </div>

        {whitelist.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucune carte enregistrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="pb-2 pr-4">Titulaire</th>
                  <th className="pb-2 pr-4">Code carte</th>
                  {elevator?.floorCount && <th className="pb-2 pr-4">Étages</th>}
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {whitelist.map(card => {
                  const isActive = card.permissions?.[0]?.isActive ?? true;
                  const floors = [...(card.permissions || [])].sort((a, b) => a.relay - b.relay)
                    .map(p => (p.relay === 0 ? 'RDC' : `Étage ${p.relay}`))
                    .join(', ');
                  return (
                    <tr key={card.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 pr-4 font-medium">{card.user?.name || card.label || '—'}</td>
                      <td className="py-2.5 pr-4 font-mono text-slate-500 text-xs">{card.code}</td>
                      {elevator?.floorCount && <td className="py-2.5 pr-4 text-slate-500 text-xs">{floors || '—'}</td>}
                      <td className="py-2.5 pr-4">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                          ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {isActive ? 'Actif' : 'Bloqué'}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <button
                          onClick={() => toggleAccess(card.id, isActive)}
                          className={`text-xs px-3 py-1 rounded-lg font-medium transition
                            ${isActive
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-green-50 text-green-600 hover:bg-green-100'
                            }`}
                        >
                          {isActive ? 'Bloquer' : 'Débloquer'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
