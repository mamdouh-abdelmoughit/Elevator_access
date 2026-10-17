// Floor helpers. computeFloors mirrors the backend's
// src/services/accessRules.js so the forms can preview access live.
export const RDC = 0;
export const MAX_FLOOR_COUNT = 16;

export const ACCESS_TYPES = {
  RESIDENT: {
    label: 'Résident',
    icon: 'home-outline',
    tone: 'accent',
    description: "Accès au RDC, à son étage et au dernier étage (si l'accès terrasse est activé).",
  },
  STAFF: {
    label: 'Personnel',
    icon: 'briefcase-outline',
    tone: 'purple',
    description: 'Gardien, femme de ménage, technicien… Accès à tous les étages.',
  },
  CUSTOM: {
    label: 'Personnalisé',
    icon: 'options-outline',
    tone: 'warning',
    description: 'Choisissez précisément les étages autorisés. Le RDC est toujours inclus.',
  },
};

export function computeFloors(building, profile) {
  const top = building.floorCount ?? 0;
  const floors = new Set([RDC]);
  const inRange = f => Number.isInteger(f) && f >= 0 && f <= top;
  if (profile.accessType === 'STAFF') {
    for (let f = 0; f <= top; f++) floors.add(f);
  } else if (profile.accessType === 'CUSTOM') {
    (profile.customFloors || []).filter(inRange).forEach(f => floors.add(f));
  } else {
    if (inRange(profile.homeFloor)) floors.add(profile.homeFloor);
    if (building.roofAccess && top > 0) floors.add(top);
  }
  return [...floors].sort((a, b) => a - b);
}

// Short label for a panel button / chip.
export const floorShort = f => (f === RDC ? 'RDC' : String(f));

// "Rez-de-chaussée", "1er étage", "2e étage"…
export function floorLong(f) {
  if (f === RDC) return 'Rez-de-chaussée';
  return f === 1 ? '1er étage' : `${f}e étage`;
}

export function floorsSummary(floors) {
  return (floors || []).map(floorShort).join(' · ') || '—';
}
