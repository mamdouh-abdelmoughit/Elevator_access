'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setToken, setUser } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPw,   setShowPw]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await apiFetch('/users/login', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Identifiants incorrects.'); return; }
      setToken(data.token);
      setUser(data.user);
      router.replace('/dashboard');
    } catch {
      setError('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-navy px-8 py-10 text-center">
          <div className="text-5xl mb-3">🏢</div>
          <h1 className="text-2xl font-bold text-white">BioSwitch</h1>
          <p className="text-blue-200 text-sm mt-1">Tableau de bord administrateur</p>
        </div>
        <form onSubmit={handleSubmit} className="px-8 py-8 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Numéro de téléphone</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="0661418895" required
              className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Mot de passe</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                required className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm pr-16 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-medium">
                {showPw ? 'Masquer' : 'Afficher'}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-navy text-white py-3 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50">
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
