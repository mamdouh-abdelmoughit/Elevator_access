// Human-readable elevator status. The cabin master publishes the active
// controller signals joined with " + " (e.g. "CMD_MONTEE + CMD_GV"), "IDLE",
// "OFFLINE" (MQTT last-will) or "STATUS_BOARD_MISSING".
const SIGNALS = {
  SEC_GENERALE:        { label: 'Sécurité générale déclenchée', kind: 'alarm' },
  SEC_PORTE_OPEN:      { label: 'Sécurité porte ouverte',       kind: 'alarm' },
  FAULT_GENERAL:       { label: 'Défaut général',               kind: 'alarm' },
  OBSTACLE:            { label: 'Obstacle détecté (cellule)',   kind: 'alarm' },
  LIMIT_HAUT:          { label: 'Fin de course haute',          kind: 'info' },
  LIMIT_BAS:           { label: 'Fin de course basse',          kind: 'info' },
  INSPECTION:          { label: 'Mode inspection (maintenance)', kind: 'maintenance' },
  CMD_MONTEE:          { label: 'En montée',                    kind: 'moving' },
  CMD_DESCENTE:        { label: 'En descente',                  kind: 'moving' },
  CMD_GV:              { label: 'Grande vitesse',               kind: 'moving' },
  CMD_PV:              { label: 'Petite vitesse',               kind: 'moving' },
  ML1:                 { label: 'ML1',                          kind: 'info' },
  ML2:                 { label: 'ML2',                          kind: 'info' },
  IMP_ARRET:           { label: "Impulsion d'arrêt",            kind: 'info' },
  IMP_PV:              { label: 'Impulsion petite vitesse',     kind: 'info' },
  PORTE_PHYSIQUE_OPEN: { label: 'Porte ouverte',                kind: 'info' },
};

export const STATUS_META = {
  idle:        { tone: 'success', icon: 'checkmark-circle', title: 'Disponible' },
  moving:      { tone: 'accent',  icon: 'swap-vertical',    title: 'En mouvement' },
  maintenance: { tone: 'warning', icon: 'construct',        title: 'En maintenance' },
  alarm:       { tone: 'danger',  icon: 'warning',          title: 'Alarme' },
  offline:     { tone: 'grey',    icon: 'cloud-offline',    title: 'Hors ligne' },
  sensors:     { tone: 'warning', icon: 'hardware-chip-outline', title: 'Capteurs non connectés' },
};

export function parseStatus(raw, online = true) {
  if (!online || raw === 'OFFLINE') return { kind: 'offline', lines: [] };
  if (raw === 'STATUS_BOARD_MISSING') return { kind: 'sensors', lines: ["La carte d'entrées d'état ne répond pas."] };
  if (!raw || raw === 'IDLE') return { kind: 'idle', lines: [] };

  const tokens = raw.split('+').map(t => t.trim()).filter(Boolean);
  const known = tokens.map(t => SIGNALS[t] || { label: t, kind: 'info' });
  const kinds = known.map(k => k.kind);
  const kind = kinds.includes('alarm') ? 'alarm'
    : kinds.includes('maintenance') ? 'maintenance'
    : kinds.includes('moving') ? 'moving'
    : 'idle';
  return { kind, lines: known.map(k => k.label) };
}
