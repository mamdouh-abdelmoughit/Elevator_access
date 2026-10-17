// src/services/accessRules.js
// Single source of truth for "which floors can this card reach".
//
// Cabin-reader elevators: one reader in the cabin, one relay per car-call
// button (RDC = floor 0 .. floorCount). A valid swipe unlocks only the
// buttons listed in the card's Permission rows (relay = floor number).
// Those rows are never edited by hand — they are always regenerated from the
// card's profile (accessType / homeFloor / customFloors) and the building
// settings (floorCount / roofAccess) by syncCardPermissions().
import prisma from '../db/prismaClient.js';
import { publish } from './mqttService.js';
import { createLog } from './logService.js';

export const RDC = 0;
// The cabin master drives 17 floor relays on direct GPIO (RDC + 16 floors).
// See esp32/docs/CABIN_RELAY_WIRING.md before raising this.
export const MAX_FLOOR_COUNT = 16;
export const ACCESS_TYPES = ['RESIDENT', 'STAFF', 'CUSTOM'];
export const ONLINE_THRESHOLD_MS = 90 * 1000; // firmware heartbeats every 30 s

// RESIDENT: RDC + home floor + top floor (roof) when the building shares it.
// STAFF:    every floor.
// CUSTOM:   the floors picked by the Syndic, RDC always included.
export function computeFloors(elevator, profile) {
  const top = elevator.floorCount ?? 0;
  const floors = new Set([RDC]);
  const inRange = f => Number.isInteger(f) && f >= 0 && f <= top;

  if (profile.accessType === 'STAFF') {
    for (let f = 0; f <= top; f++) floors.add(f);
  } else if (profile.accessType === 'CUSTOM') {
    (profile.customFloors || []).filter(inRange).forEach(f => floors.add(f));
  } else {
    if (inRange(profile.homeFloor)) floors.add(profile.homeFloor);
    if (elevator.roofAccess && top > 0) floors.add(top);
  }
  return [...floors].sort((a, b) => a - b);
}

export function isExpired(card, now = new Date()) {
  return !!card.validUntil && new Date(card.validUntil) <= now;
}

export function isOnline(elevator, now = Date.now()) {
  if (elevator.currentStatus === 'OFFLINE') return false; // device's MQTT last-will
  return !!elevator.lastHeartbeat && now - new Date(elevator.lastHeartbeat).getTime() < ONLINE_THRESHOLD_MS;
}

// Replace a card's Permission rows on one elevator with the computed floors.
// `db` may be the prisma client or a transaction client.
export async function syncCardPermissions(db, card, elevator, isActive) {
  const floors = computeFloors(elevator, card);
  await db.permission.deleteMany({ where: { cardId: card.id, elevatorId: elevator.id } });
  await db.permission.createMany({
    data: floors.map(relay => ({ cardId: card.id, elevatorId: elevator.id, relay, isActive })),
  });
  return floors;
}

// Recompute every card of a building (after floorCount / roofAccess changed).
// Cards created before resident profiles existed (no homeFloor) keep the
// floors they already had, converted to a CUSTOM profile.
export async function resyncElevator(db, elevator) {
  const cards = await db.card.findMany({
    where: { permissions: { some: { elevatorId: elevator.id } } },
    include: { permissions: { where: { elevatorId: elevator.id } } },
  });
  for (const card of cards) {
    const isActive = card.permissions.every(p => p.isActive);
    let profile = card;
    if (card.accessType === 'RESIDENT' && card.homeFloor == null) {
      profile = await db.card.update({
        where: { id: card.id },
        data: { accessType: 'CUSTOM', customFloors: card.permissions.map(p => p.relay) },
      });
    }
    await syncCardPermissions(db, profile, elevator, isActive);
  }
  return cards.length;
}

export function notifyDevice(elevatorId, command = 'UPDATE_PERMISSIONS') {
  publish(`elevators/${elevatorId}/commands`, JSON.stringify({ command }));
}

// Who did what — shown in the Syndic's activity log.
export async function audit(req, elevatorId, action, details = {}) {
  let actorName = null;
  try {
    const actor = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
    actorName = actor?.name || null;
  } catch { /* best effort */ }
  await createLog('AUDIT', { action, actorId: req.user.id, actorRole: req.user.role, actorName, ...details }, elevatorId);
}

// ADMIN, or the Syndic assigned to this elevator. Returns the elevator, or
// null after having sent the error response.
export async function loadManagedElevator(req, res) {
  const elevatorId = parseInt(req.params.id);
  if (isNaN(elevatorId)) { res.status(400).json({ error: 'Identifiant ascenseur invalide.' }); return null; }
  const elevator = await prisma.elevator.findUnique({ where: { id: elevatorId } });
  if (!elevator) { res.status(404).json({ error: 'Ascenseur introuvable.' }); return null; }
  if (req.user.role !== 'ADMIN' && elevator.managerId !== req.user.id) {
    res.status(403).json({ error: 'Vous ne gérez pas cet ascenseur.' }); return null;
  }
  return elevator;
}

// Shape returned to the apps for one resident (= one card on one elevator).
export function serializeResident(card, elevatorId, lastSeen = null) {
  const perms = (card.permissions || []).filter(p => p.elevatorId === elevatorId);
  return {
    cardId:       card.id,
    code:         card.code,
    name:         card.label || card.user?.name || null,
    apartment:    card.apartment,
    phone:        card.residentPhone,
    homeFloor:    card.homeFloor,
    accessType:   card.accessType,
    customFloors: card.customFloors || [],
    floors:       perms.map(p => p.relay).sort((a, b) => a - b),
    isActive:     perms.length > 0 && perms.every(p => p.isActive),
    expired:      isExpired(card),
    validUntil:   card.validUntil,
    notes:        card.notes,
    createdAt:    card.createdAt,
    updatedAt:    card.updatedAt,
    lastSeen,
  };
}
