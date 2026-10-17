// Date helpers (French).
const pad = n => String(n).padStart(2, '0');
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export const time = d => { const x = new Date(d); return `${pad(x.getHours())}:${pad(x.getMinutes())}`; };

const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const daysBetween = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86400000);

export function dateShort(d) {
  const x = new Date(d);
  const sameYear = x.getFullYear() === new Date().getFullYear();
  return `${x.getDate()} ${MONTHS[x.getMonth()]}${sameYear ? '' : ' ' + x.getFullYear()}`;
}

export function dateTime(d) {
  return `${dateShort(d)} à ${time(d)}`;
}

// "à l'instant", "il y a 5 min", "il y a 3 h", "hier à 14:05", "12 oct. à 09:30"
export function timeAgo(d) {
  if (!d) return 'jamais';
  const x = new Date(d);
  const s = Math.floor((Date.now() - x.getTime()) / 1000);
  if (s < 45) return "à l'instant";
  if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
  const days = daysBetween(new Date(), x);
  if (days === 0) return `il y a ${Math.round(s / 3600)} h`;
  if (days === 1) return `hier à ${time(x)}`;
  return dateTime(x);
}

// Section header for a day: "Aujourd'hui", "Hier", "Lundi 6 oct."
export function dayLabel(d) {
  const x = new Date(d);
  const days = daysBetween(new Date(), x);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  const name = DAYS[x.getDay()];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${dateShort(x)}`;
}

export const dayKey = d => startOfDay(d).toISOString();

// Local "today" bounds as ISO strings, for the backend's from/to params.
export function todayRange() {
  const from = startOfDay(new Date());
  const to = new Date(from.getTime() + 86400000 - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(23, 59, 0, 0);
  return d;
}
