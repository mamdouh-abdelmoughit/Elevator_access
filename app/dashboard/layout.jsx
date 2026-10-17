'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getToken, getUser, clearToken, clearUser } from '@/lib/api';

const NAV = [
  { href: '/dashboard',          icon: '🗺️',  label: 'Carte & Ascenseurs' },
  { href: '/dashboard/requests', icon: '📬',  label: 'Demandes syndics'   },
  { href: '/dashboard/users',    icon: '👥',  label: 'Utilisateurs'       },
];

export default function DashboardLayout({ children }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    setUser(getUser());
  }, [router]);

  const logout = () => {
    clearToken();
    clearUser();
    router.replace('/login');
  };

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-navy flex flex-col shrink-0">
        <div className="px-6 py-6 border-b border-blue-900">
          <div className="text-white font-bold text-lg">🏢 BioSwitch</div>
          <div className="text-blue-300 text-xs mt-0.5">Administration</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ href, icon, label }) => {
            const active = href === '/dashboard'
              ? pathname === '/dashboard' || pathname.startsWith('/dashboard/elevators')
              : pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition
                  ${active ? 'bg-blue-700 text-white' : 'text-blue-200 hover:bg-blue-900 hover:text-white'}`}>
                <span>{icon}</span>{label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-blue-900">
          <div className="text-blue-200 text-xs mb-0.5 truncate">{user.name}</div>
          <div className="text-blue-400 text-xs mb-3 truncate">{user.phone}</div>
          <button onClick={logout}
            className="w-full text-xs text-blue-300 hover:text-white border border-blue-700 hover:border-blue-400 rounded-lg py-1.5 transition">
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden flex flex-col bg-slate-100">
        {children}
      </main>
    </div>
  );
}
