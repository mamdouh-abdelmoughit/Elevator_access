// src/api/controllers/residentController.js
// Building configuration + resident (card) management for cabin-reader
// elevators. Every route here is ADMIN or the elevator's own Syndic.
import prisma from '../../db/prismaClient.js';
import {
  RDC, MAX_FLOOR_COUNT, ACCESS_TYPES,
  syncCardPermissions, resyncElevator, notifyDevice, audit,
  loadManagedElevator, serializeResident, isOnline, isExpired,
} from '../../services/accessRules.js';

const PHONE_RE = /^\+?[0-9 ]{7,20}$/;
const CARD_CODE_RE = /^[0-9]{1,10}$/;

const configured = (elevator, res) => {
  if (elevator.floorCount == null) {
    res.status(409).json({ error: "L'immeuble n'est pas encore configuré (nombre d'étages).", code: 'NOT_CONFIGURED' });
    return false;
  }
  return true;
};

// Validates the resident fields present in `body`. On create every required
// field must be there; on update only the provided ones are checked.
// Returns { data } or { error }.
function parseProfile(body, elevator, { creating }) {
  const data = {};
  const top = elevator.floorCount;

  if (creating || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 100) return { error: 'Le nom doit contenir entre 2 et 100 caractères.' };
    data.label = name;
  }
  if (creating || body.cardCode !== undefined) {
    const code = String(body.cardCode ?? '').trim();
    if (!CARD_CODE_RE.test(code)) return { error: 'Le code badge doit être un nombre (1 à 10 chiffres).' };
    data.code = String(parseInt(code, 10)); // normalise leading zeros, the reader never sends them
  }
  if (body.apartment !== undefined) {
    const apt = body.apartment == null ? '' : String(body.apartment).trim();
    if (apt.length > 30) return { error: "L'appartement ne doit pas dépasser 30 caractères." };
    data.apartment = apt || null;
  }
  if (body.phone !== undefined) {
    const phone = body.phone == null ? '' : String(body.phone).trim();
    if (phone && !PHONE_RE.test(phone)) return { error: 'Numéro de téléphone invalide.' };
    data.residentPhone = phone || null;
  }
  if (body.notes !== undefined) {
    const notes = body.notes == null ? '' : String(body.notes).trim();
    if (notes.length > 500) return { error: 'Les remarques ne doivent pas dépasser 500 caractères.' };
    data.notes = notes || null;
  }
  if (body.validUntil !== undefined) {
    if (body.validUntil === null || body.validUntil === '') {
      data.validUntil = null;
    } else {
      const d = new Date(body.validUntil);
      if (isNaN(d.getTime())) return { error: "Date d'expiration invalide." };
      if (d <= new Date()) return { error: "La date d'expiration doit être dans le futur." };
      data.validUntil = d;
    }
  }
  if (creating || body.accessType !== undefined) {
    const type = body.accessType || 'RESIDENT';
    if (!ACCESS_TYPES.includes(type)) return { error: "Type d'accès invalide." };
    data.accessType = type;
  }
  if (body.homeFloor !== undefined) {
    if (body.homeFloor === null) data.homeFloor = null;
    else {
      const f = parseInt(body.homeFloor, 10);
      if (isNaN(f) || f < 0 || f > top) return { error: `L'étage doit être compris entre RDC et ${top}.` };
      data.homeFloor = f;
    }
  }
  if (body.customFloors !== undefined) {
    if (!Array.isArray(body.customFloors)) return { error: 'Liste des étages invalide.' };
    const floors = [...new Set(body.customFloors.map(f => parseInt(f, 10)))];
    if (floors.some(f => isNaN(f) || f < 0 || f > top)) return { error: `Les étages doivent être compris entre RDC et ${top}.` };
    data.customFloors = floors.sort((a, b) => a - b);
  }
  return { data };
}

// The profile after applying `data` must be complete for its access type.
function checkProfileComplete(profile) {
  if (profile.accessType === 'RESIDENT' && profile.homeFloor == null) {
    return "Indiquez l'étage où habite le résident.";
  }
  if (profile.accessType === 'CUSTOM' && !(profile.customFloors || []).some(f => f !== RDC)) {
    return 'Choisissez au moins un étage en plus du RDC.';
  }
  return null;
}

async function lastSeenByCode(elevatorId) {
  const rows = await prisma.$queryRaw`
    SELECT details->>'cardCode' AS code, MAX("timestamp") AS last
    FROM "Log"
    WHERE "elevatorId" = ${elevatorId}
      AND "eventType" = 'ACCESS_ATTEMPT'
      AND details->>'status' = 'GRANTED'
    GROUP BY 1`;
  return new Map(rows.map(r => [r.code, r.last]));
}

const residentInclude = elevatorId => ({
  permissions: { where: { elevatorId } },
  user: { select: { name: true } },
});

// ── GET /elevators/:id/overview ──────────────────────────────────────────────
// ?from=ISO&to=ISO bound "today" in the caller's timezone (defaults: last 24 h).
export async function getOverview(req, res) {
  const elevator = await loadManagedElevator(req, res);
  if (!elevator) return;

  const to   = req.query.to   ? new Date(req.query.to)   : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 24 * 3600 * 1000);

  const [cards, todayLogs, recent] = await Promise.all([
    prisma.card.findMany({
      where: { permissions: { some: { elevatorId: elevator.id } } },
      include: { permissions: { where: { elevatorId: elevator.id } } },
    }),
    prisma.log.findMany({
      where: { elevatorId: elevator.id, eventType: 'ACCESS_ATTEMPT', timestamp: { gte: from, lte: to } },
      select: { details: true },
    }),
    prisma.log.findMany({
      where: { elevatorId: elevator.id, eventType: { in: ['ACCESS_ATTEMPT', 'AUDIT'] } },
      orderBy: { timestamp: 'desc' },
      take: 8,
    }),
  ]);

  const residents = cards.map(c => serializeResident(c, elevator.id));
  const { macAddress, ...publicElevator } = elevator;
  res.json({
    elevator: { ...publicElevator, online: isOnline(elevator) },
    stats: {
      residents: residents.length,
      active:    residents.filter(r => r.isActive && !r.expired).length,
      blocked:   residents.filter(r => !r.isActive).length,
      expired:   residents.filter(r => r.expired).length,
      swipes:    todayLogs.length,
      denied:    todayLogs.filter(l => l.details?.status === 'DENIED').length,
    },
    recent,
  });
}

// ── PATCH /elevators/:id/settings ────────────────────────────────────────────
// body: { floorCount?, roofAccess?, unlockSeconds? }
export async function updateSettings(req, res) {
  const elevator = await loadManagedElevator(req, res);
  if (!elevator) return;

  const data = {};
  if (req.body.floorCount !== undefined) {
    const n = parseInt(req.body.floorCount, 10);
    if (isNaN(n) || n < 1 || n > MAX_FLOOR_COUNT) {
      return res.status(400).json({ error: `Le nombre d'étages doit être compris entre 1 et ${MAX_FLOOR_COUNT}.` });
    }
    data.floorCount = n;
  }
  if (req.body.roofAccess !== undefined) data.roofAccess = !!req.body.roofAccess;
  if (req.body.unlockSeconds !== undefined) {
    const s = parseInt(req.body.unlockSeconds, 10);
    if (isNaN(s) || s < 3 || s > 60) return res.status(400).json({ error: 'La durée de déverrouillage doit être entre 3 et 60 secondes.' });
    data.unlockSeconds = s;
  }
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Rien à modifier.' });

  // Lowering the floor count must not silently strand residents above it.
  if (data.floorCount != null && elevator.floorCount != null && data.floorCount < elevator.floorCount) {
    const stranded = await prisma.card.findMany({
      where: {
        permissions: { some: { elevatorId: elevator.id } },
        OR: [{ homeFloor: { gt: data.floorCount } }, { customFloors: { hasSome: range(data.floorCount + 1, elevator.floorCount) } }],
      },
      select: { label: true },
    });
    if (stranded.length > 0) {
      return res.status(409).json({
        error: `${stranded.length} résident(s) ont accès à un étage au-dessus de ${data.floorCount}. Modifiez-les d'abord.`,
        residents: stranded.map(c => c.label),
      });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const el = await tx.elevator.update({ where: { id: elevator.id }, data });
    if (data.floorCount !== undefined || data.roofAccess !== undefined) await resyncElevator(tx, el);
    return el;
  }, { timeout: 20000 });

  notifyDevice(elevator.id, 'UPDATE_CONFIG');
  await audit(req, elevator.id, elevator.floorCount == null ? 'BUILDING_CONFIGURED' : 'SETTINGS_UPDATED', {
    before: { floorCount: elevator.floorCount, roofAccess: elevator.roofAccess, unlockSeconds: elevator.unlockSeconds },
    after:  { floorCount: updated.floorCount, roofAccess: updated.roofAccess, unlockSeconds: updated.unlockSeconds },
  });

  const { macAddress, ...publicElevator } = updated;
  res.json({ ...publicElevator, online: isOnline(updated) });
}

function range(from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

// ── GET /elevators/:id/residents ─────────────────────────────────────────────
export async function listResidents(req, res) {
  const elevator = await loadManagedElevator(req, res);
  if (!elevator) return;

  const [cards, lastSeen] = await Promise.all([
    prisma.card.findMany({
      where: { permissions: { some: { elevatorId: elevator.id } } },
      include: residentInclude(elevator.id),
    }),
    lastSeenByCode(elevator.id),
  ]);

  const residents = cards
    .map(c => serializeResident(c, elevator.id, lastSeen.get(c.code) || null))
    .sort((a, b) => (a.homeFloor ?? 99) - (b.homeFloor ?? 99) || (a.name || '').localeCompare(b.name || ''));
  res.json(residents);
}

// ── GET /elevators/:id/residents/:cardId ─────────────────────────────────────
// Resident + their last 30 swipes on this elevator.
export async function getResident(req, res) {
  const elevator = await loadManagedElevator(req, res);
  if (!elevator) return;
  const cardId = parseInt(req.params.cardId, 10);

  const card = await prisma.card.findFirst({
    where: { id: cardId, permissions: { some: { elevatorId: elevator.id } } },
    include: residentInclude(elevator.id),
  });
  if (!card) return res.status(404).json({ error: 'Résident introuvable.' });

  const history = await prisma.log.findMany({
    where: {
      elevatorId: elevator.id,
      eventType: 'ACCESS_ATTEMPT',
      details: { path: ['cardCode'], equals: card.code },
    },
    orderBy: { timestamp: 'desc' },
    take: 30,
  });
  const lastGranted = history.find(l => l.details?.status === 'GRANTED');
  res.json({
    ...serializeResident(card, elevator.id, lastGranted?.timestamp || null),
    history: history.map(l => ({ id: l.id, timestamp: l.timestamp, ...l.details })),
  });
}

// ── POST /elevators/:id/residents ────────────────────────────────────────────
// body: { name, cardCode, apartment?, phone?, accessType?, homeFloor?,
//         customFloors?, validUntil?, notes? }
// Legacy body { residentName, cardCode, floor } (web dashboard) still accepted.
export async function createResident(req, res) {
  const elevator = await loadManagedElevator(req, res);
  if (!elevator || !configured(elevator, res)) return;

  const body = { ...req.body };
  if (body.name === undefined && body.residentName !== undefined) body.name = body.residentName;
  if (body.homeFloor === undefined && body.floor !== undefined) body.homeFloor = body.floor;

  const { data, error } = parseProfile(body, elevator, { creating: true });
  if (error) return res.status(400).json({ error });
  const incomplete = checkProfileComplete(data);
  if (incomplete) return res.status(400).json({ error: incomplete });

  const existing = await prisma.card.findUnique({
    where: { code: data.code },
    include: { permissions: { include: { elevator: { select: { name: true } } } } },
  });
  if (existing && existing.permissions.length > 0) {
    const where = existing.permissions[0].elevator?.name;
    const sameBuilding = existing.permissions.some(p => p.elevatorId === elevator.id);
    return res.status(409).json({
      error: sameBuilding
        ? `Ce badge est déjà attribué à ${existing.label || 'un résident'} dans cet immeuble.`
        : `Ce badge est déjà utilisé dans un autre immeuble${where ? ` (${where})` : ''}.`,
      code: 'CARD_IN_USE',
    });
  }

  const { card, floors } = await prisma.$transaction(async (tx) => {
    // A card row with no permissions (left over from an old flow) is reused.
    const card = existing
      ? await tx.card.update({ where: { id: existing.id }, data })
      : await tx.card.create({ data });
    const floors = await syncCardPermissions(tx, card, elevator, true);
    return { card, floors };
  });

  notifyDevice(elevator.id);
  await audit(req, elevator.id, 'RESIDENT_CREATED', {
    cardId: card.id, cardCode: card.code, residentName: card.label, floors,
  });

  const fresh = await prisma.card.findUnique({ where: { id: card.id }, include: residentInclude(elevator.id) });
  res.status(201).json({ ...serializeResident(fresh, elevator.id), floorsGranted: floors });
}

// ── PATCH /elevators/:id/residents/:cardId ───────────────────────────────────
// Any subset of the create fields. Changing cardCode = replacing a lost badge.
export async function updateResident(req, res) {
  const elevator = await loadManagedElevator(req, res);
  if (!elevator || !configured(elevator, res)) return;
  const cardId = parseInt(req.params.cardId, 10);

  const card = await prisma.card.findFirst({
    where: { id: cardId, permissions: { some: { elevatorId: elevator.id } } },
    include: { permissions: { where: { elevatorId: elevator.id } } },
  });
  if (!card) return res.status(404).json({ error: 'Résident introuvable.' });

  const { data, error } = parseProfile(req.body, elevator, { creating: false });
  if (error) return res.status(400).json({ error });
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Rien à modifier.' });

  const merged = { ...card, ...data };
  const incomplete = checkProfileComplete(merged);
  if (incomplete) return res.status(400).json({ error: incomplete });

  if (data.code && data.code !== card.code) {
    const clash = await prisma.card.findUnique({ where: { code: data.code } });
    if (clash) return res.status(409).json({ error: 'Ce code badge est déjà utilisé.', code: 'CARD_IN_USE' });
  }

  // An expired card that gets a new date (or becomes permanent) is
  // reactivated; a card blocked by hand stays blocked.
  const wasActive = card.permissions.every(p => p.isActive);
  const reactivate = !wasActive && isExpired(card) && data.validUntil !== undefined;
  const isActive = wasActive || reactivate;

  const { updated, floors } = await prisma.$transaction(async (tx) => {
    const updated = await tx.card.update({ where: { id: card.id }, data });
    const floors = await syncCardPermissions(tx, updated, elevator, isActive);
    return { updated, floors };
  });

  notifyDevice(elevator.id);
  const changed = Object.keys(data).map(k => ({ label: 'name', code: 'cardCode', residentPhone: 'phone' }[k] || k));
  await audit(req, elevator.id, data.code && data.code !== card.code ? 'CARD_REPLACED' : 'RESIDENT_UPDATED', {
    cardId: card.id, cardCode: updated.code, previousCardCode: data.code ? card.code : undefined,
    residentName: updated.label, changed, floors,
  });

  const fresh = await prisma.card.findUnique({ where: { id: card.id }, include: residentInclude(elevator.id) });
  res.json(serializeResident(fresh, elevator.id));
}

// ── DELETE /elevators/:id/residents/:cardId ──────────────────────────────────
export async function deleteResident(req, res) {
  const elevator = await loadManagedElevator(req, res);
  if (!elevator) return;
  const cardId = parseInt(req.params.cardId, 10);

  const card = await prisma.card.findFirst({
    where: { id: cardId, permissions: { some: { elevatorId: elevator.id } } },
    include: { permissions: true },
  });
  if (!card) return res.status(404).json({ error: 'Résident introuvable.' });

  await prisma.$transaction(async (tx) => {
    await tx.permission.deleteMany({ where: { cardId: card.id, elevatorId: elevator.id } });
    const usedElsewhere = card.permissions.some(p => p.elevatorId !== elevator.id);
    if (!usedElsewhere && card.userId == null) await tx.card.delete({ where: { id: card.id } });
  });

  notifyDevice(elevator.id);
  await audit(req, elevator.id, 'RESIDENT_DELETED', { cardId: card.id, cardCode: card.code, residentName: card.label });
  res.json({ ok: true });
}

// ── POST /elevators/:id/card-capture ─────────────────────────────────────────
// Starts a "present the new badge on the cabin reader" window. The app then
// polls GET /swipes?since=<returned since>. Stateless on purpose: it just reads
// the access log, so it works across Cloud Run instances.
export async function startCardCapture(req, res) {
  const elevator = await loadManagedElevator(req, res);
  if (!elevator) return;
  res.json({ since: new Date().toISOString(), ttlSeconds: 90, online: isOnline(elevator) });
}

// ── GET /elevators/:id/swipes?since=ISO ──────────────────────────────────────
export async function getRecentSwipes(req, res) {
  const elevator = await loadManagedElevator(req, res);
  if (!elevator) return;
  const since = new Date(req.query.since || Date.now() - 5 * 60 * 1000);
  if (isNaN(since.getTime())) return res.status(400).json({ error: 'Paramètre since invalide.' });

  const logs = await prisma.log.findMany({
    where: { elevatorId: elevator.id, eventType: 'ACCESS_ATTEMPT', timestamp: { gt: since } },
    orderBy: { timestamp: 'desc' },
    take: 10,
  });
  const codes = [...new Set(logs.map(l => l.details?.cardCode).filter(Boolean))];
  const cards = await prisma.card.findMany({
    where: { code: { in: codes } },
    include: { permissions: { select: { elevatorId: true }, take: 1 } },
  });
  const byCode = new Map(cards.map(c => [c.code, c]));

  res.json(logs.map(l => {
    const card = byCode.get(l.details?.cardCode);
    const assigned = card && card.permissions.length > 0;
    return {
      id: l.id,
      timestamp: l.timestamp,
      cardCode: l.details?.cardCode,
      known: !!assigned,
      residentName: assigned ? card.label : null,
      sameBuilding: assigned ? card.permissions[0].elevatorId === elevator.id : false,
      cardId: assigned && card.permissions[0].elevatorId === elevator.id ? card.id : null,
    };
  }));
}
