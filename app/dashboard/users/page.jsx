'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

const ROLE_BADGE  = { ADMIN: 'bg-purple-100 text-purple-700', MANAGER: 'bg-blue-100 text-blue-700', EMPLOYEE: 'bg-slate-100 text-slate-600' };
const ROLE_LABEL  = { ADMIN: 'Admin', MANAGER: 'Syndic', EMPLOYEE: 'Technicien' };
const EMPTY_FORM  = { name: '', phone: '', password: '' };
const OFFLINE_MS  = 60 * 1000;

function techOnline(u) {
  if (!u.locationUpdatedAt) return false;
  return u.isOnline && (Date.now() - new Date(u.locationUpdatedAt).getTime()) < OFFLINE_MS;
}

function EditModal({ user, onClose, onSaved, showToast }) {
  const [name,     setName]     = useState(user.name);
  const [phone,    setPhone]    = useState(user.phone);
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [saving,   setSaving]   = useState(false);

  const save = async () => {
    const body = {};
    if (name.trim() !== user.name)   body.name  = name.trim();
    if (phone.trim() !== user.phone) body.phone = phone.trim();
    if (password.length > 0)         body.password = password;
    if (!Object.keys(body).length)   { onClose(); return; }
    setSaving(true);
    const res = await apiFetch(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    const data = await res.json();
    setSaving(false);
    if (res.ok) { showToast(`${data.name} mis à jour.`); onSaved(); }
    else showToast(data.error || 'Erreur.', 'error');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="font-bold text-slate-800 text-lg mb-4">Modifier {user.name}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nom</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Téléphone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} type="tel"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nouveau mot de passe (laisser vide pour ne pas changer)</label>
            <div className="relative">
              <input value={password} onChange={e => setPassword(e.target.value)}
                type={showPw ? 'text' : 'password'} placeholder="••••••••"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700">
                {showPw ? 'Masquer' : 'Afficher'}
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 border border-slate-300 rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50 transition">
            Annuler
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 bg-navy text-white rounded-lg py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [showPw,     setShowPw]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast,      setToast]      = useState(null);
  const [editing,    setEditing]    = useState(null);
  const [deleting,   setDeleting]   = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchUsers = useCallback(async () => {
    const res = await apiFetch('/users');
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) || u.phone.includes(search)
  );

  const counts = {
    total:    users.length,
    admin:    users.filter(u => u.role === 'ADMIN').length,
    manager:  users.filter(u => u.role === 'MANAGER').length,
    employee: users.filter(u => u.role === 'EMPLOYEE').length,
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) { showToast('Mot de passe : min. 8 caractères.', 'error'); return; }
    setSubmitting(true);
    const res  = await apiFetch('/users/employees', { method: 'POST', body: JSON.stringify(form) });
    const data = await res.json();
    setSubmitting(false);
    if (res.ok) { showToast(`Compte créé pour ${data.name}.`); setForm(EMPTY_FORM); setShowForm(false); fetchUsers(); }
    else showToast(data.error || 'Erreur.', 'error');
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const res = await apiFetch(`/users/${deleting.id}`, { method: 'DELETE' });
    if (res.ok) { showToast(`${deleting.name} supprimé.`); fetchUsers(); }
    else { const d = await res.json(); showToast(d.error || 'Erreur.', 'error'); }
    setDeleting(null);
  };

  const downloadLog = async (user) => {
    const res = await apiFetch(`/users/${user.id}/location-log/download`);
    if (!res.ok) { showToast('Impossible de télécharger le log.', 'error'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${user.name.replace(/\s/g, '_')}_log.zip`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 h-full overflow-y-auto">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
          ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {editing && (
        <EditModal user={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchUsers(); }} showToast={showToast} />
      )}

      {deleting && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-bold text-slate-800 text-lg mb-2">Supprimer {deleting.name} ?</h2>
            <p className="text-sm text-slate-500 mb-5">Cette action est irréversible. Toutes les données associées seront supprimées.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)}
                className="flex-1 border border-slate-300 rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50 transition">
                Annuler
              </button>
              <button onClick={confirmDelete}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 transition">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Utilisateurs</h1>
          <p className="text-slate-500 text-sm mt-0.5">{counts.total} comptes enregistrés</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchUsers} className="text-sm text-blue-600 hover:underline">Actualiser</button>
          <button onClick={() => { setShowForm(v => !v); setForm(EMPTY_FORM); }}
            className="bg-navy text-white text-sm px-4 py-2 rounded-lg hover:opacity-90 transition">
            {showForm ? '✕ Annuler' : '+ Créer un technicien'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-slate-800 mb-1">Nouveau compte technicien</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nom complet</label>
              <input type="text" required placeholder="Ex : Karim Benali" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Téléphone</label>
              <input type="tel" required placeholder="0661234567" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Mot de passe temporaire</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} required placeholder="Min. 8 caractères" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-medium">
                  {showPw ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button type="submit" disabled={submitting}
                className="bg-navy text-white text-sm px-6 py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-50">
                {submitting ? 'Création…' : 'Créer le compte'}
              </button>
            </div>
          </form>
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4">
            Communiquez ces identifiants directement au technicien.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Admins',      count: counts.admin,    color: 'border-purple-200 bg-purple-50' },
          { label: 'Syndics',     count: counts.manager,  color: 'border-blue-200 bg-blue-50'    },
          { label: 'Techniciens', count: counts.employee, color: 'border-slate-200 bg-slate-50'  },
        ].map(({ label, count, color }) => (
          <div key={label} className={`rounded-xl border ${color} px-5 py-4`}>
            <div className="text-2xl font-bold text-slate-800">{count}</div>
            <div className="text-sm text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <input type="text" placeholder="Rechercher par nom ou téléphone…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {loading ? <div className="text-slate-400 text-sm">Chargement…</div> : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs text-slate-500 uppercase tracking-wide text-left">
                <th className="px-5 py-3">Nom</th>
                <th className="px-5 py-3">Téléphone</th>
                <th className="px-5 py-3">Rôle</th>
                <th className="px-5 py-3">Statut</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold
                        ${u.role === 'EMPLOYEE' ? (techOnline(u) ? 'bg-green-500' : 'bg-slate-400') : 'bg-navy'}`}>
                        {u.name[0].toUpperCase()}
                      </div>
                      {u.name}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-500 font-mono text-xs">{u.phone}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[u.role] || ''}`}>
                      {ROLE_LABEL[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {u.role === 'EMPLOYEE' ? (
                      <span className={`font-semibold ${techOnline(u) ? 'text-green-600' : 'text-slate-400'}`}>
                        {techOnline(u) ? '● En ligne' : '● Hors ligne'}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => setEditing(u)}
                        className="text-xs bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 px-3 py-1 rounded-md transition font-medium">
                        ✏️ Modifier
                      </button>
                      {u.role === 'EMPLOYEE' && (
                        <button onClick={() => downloadLog(u)}
                          className="text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 px-3 py-1 rounded-md transition font-medium">
                          📥 Log GPS
                        </button>
                      )}
                      {u.role !== 'ADMIN' && (
                        <button onClick={() => setDeleting(u)}
                          className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1 rounded-md transition font-medium">
                          🗑️ Supprimer
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">Aucun résultat.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
