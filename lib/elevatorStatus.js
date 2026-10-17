// Maps ESP32 MQTT status strings to a display category.
// The ESP32 sends composite strings like "CMD_MONTEE + CMD_GV + ML1"
// or "SEC_GENERALE + FAULT_GENERAL", separated by " + ".

const ALARM_TOKENS   = ['SEC_GENERALE', 'SEC_PORTE', 'FAULT_GENERAL', 'OBSTACLE'];
const MOTION_TOKENS  = ['CMD_MONTEE', 'CMD_DESCENTE', 'CMD_GV', 'CMD_PV',
                        'ML1', 'ML2', 'IMP_ARRET', 'IMP_PV',
                        'LIMIT_HAUT', 'LIMIT_BAS', 'PORTE_PHYSIQUE_OPEN', 'INSPECTION'];

export function getStatusCategory(raw) {
  if (raw === 'OFFLINE') return 'offline';
  if (!raw || raw === 'IDLE') return 'idle';
  const tokens = raw.toUpperCase().split(/[\s+]+/).map(t => t.trim());
  if (tokens.some(t => ALARM_TOKENS.some(a => t.includes(a)))) return 'alarm';
  if (tokens.some(t => MOTION_TOKENS.some(m => t.includes(m)))) return 'moving';
  return 'idle'; // unknown state → treat as idle (not alarming)
}

export const STATUS_META = {
  idle:   { color: '#10B981', label: 'Actif / IDLE',          tailwind: 'bg-green-100 text-green-700' },
  moving: { color: '#F59E0B', label: 'En mouvement',           tailwind: 'bg-amber-100 text-amber-700'  },
  alarm:  { color: '#EF4444', label: 'Panne / Alarme',         tailwind: 'bg-red-100 text-red-700'      },
  offline:{ color: '#94A3B8', label: 'Hors ligne',             tailwind: 'bg-slate-100 text-slate-600'  },
};

export function statusColor(raw) {
  return STATUS_META[getStatusCategory(raw)].color;
}

export function statusTailwind(raw) {
  return STATUS_META[getStatusCategory(raw)].tailwind;
}

export function statusLabel(raw) {
  if (!raw || raw === 'IDLE') return 'IDLE';
  return raw;
}
