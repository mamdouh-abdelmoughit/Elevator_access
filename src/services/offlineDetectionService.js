import prisma from '../db/prismaClient.js';
import { notifyDevice } from './accessRules.js';
import { createLog } from './logService.js';

const OFFLINE_THRESHOLD_MS = 60 * 1000; // 1 minute (30s interval + 2-3 retries)
const CLEANUP_INTERVAL_MS  = 60 * 60 * 1000; // run cleanup every hour
const RETENTION_MS         = 48 * 60 * 60 * 1000; // 48 hours (technician GPS trail)
const LOG_RETENTION_MS     = (parseInt(process.env.LOG_RETENTION_DAYS) || 365) * 24 * 60 * 60 * 1000;

async function sendExpoPush(tokens, title, body) {
  if (!tokens.length) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map(to => ({ to, title, body, sound: 'default', priority: 'high' }))),
    });
  } catch (e) {
    console.error('Push notification error:', e.message);
  }
}

export async function checkOfflineTechnicians() {
  try {
    const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS);

    // Find technicians who were online but haven't updated since cutoff
    const wentOffline = await prisma.user.findMany({
      where: { role: 'EMPLOYEE', isOnline: true, locationUpdatedAt: { lt: cutoff } },
      select: { id: true, name: true },
    });

    if (wentOffline.length > 0) {
      // Mark them offline
      await prisma.user.updateMany({
        where: { id: { in: wentOffline.map(u => u.id) } },
        data: { isOnline: false },
      });

      // Get all admin push tokens
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', expoPushToken: { not: null } },
        select: { expoPushToken: true },
      });
      const tokens = admins.map(a => a.expoPushToken).filter(Boolean);

      for (const tech of wentOffline) {
        console.log(`Technician offline: ${tech.name}`);
        await sendExpoPush(tokens, '⚠️ Technicien hors ligne', `${tech.name} a perdu la connexion.`);
      }
    }

    // Also mark back online any technician who has a recent update but isOnline=false
    await prisma.user.updateMany({
      where: { role: 'EMPLOYEE', isOnline: false, locationUpdatedAt: { gte: cutoff } },
      data: { isOnline: true },
    });
  } catch (e) {
    console.error('Offline detection error:', e.message);
  }
}

export async function cleanupOldLogs() {
  try {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    const { count } = await prisma.locationLog.deleteMany({ where: { timestamp: { lt: cutoff } } });
    if (count > 0) console.log(`Cleaned up ${count} old location logs.`);
  } catch (e) {
    console.error('Log cleanup error:', e.message);
  }
}

// Badges with a validUntil in the past are blocked, and their elevators told
// to resync. (The device endpoint already filters expired cards; this makes
// the state visible in the apps and logs it.)
export async function expireCards() {
  try {
    const expired = await prisma.permission.findMany({
      where: { isActive: true, card: { validUntil: { lte: new Date() } } },
      select: { id: true, elevatorId: true, card: { select: { id: true, code: true, label: true } } },
    });
    if (expired.length === 0) return;

    await prisma.permission.updateMany({
      where: { id: { in: expired.map(p => p.id) } },
      data: { isActive: false },
    });
    const seen = new Set();
    for (const p of expired) {
      const key = `${p.elevatorId}:${p.card.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await createLog('AUDIT', {
        action: 'RESIDENT_EXPIRED', actorName: 'Système',
        cardId: p.card.id, cardCode: p.card.code, residentName: p.card.label,
      }, p.elevatorId);
    }
    for (const elevatorId of new Set(expired.map(p => p.elevatorId))) notifyDevice(elevatorId);
    console.log(`Expired ${seen.size} badge(s).`);
  } catch (e) {
    console.error('Card expiry error:', e.message);
  }
}

export async function cleanupOldElevatorLogs() {
  try {
    const cutoff = new Date(Date.now() - LOG_RETENTION_MS);
    const { count } = await prisma.log.deleteMany({ where: { timestamp: { lt: cutoff } } });
    if (count > 0) console.log(`Cleaned up ${count} elevator logs older than retention.`);
  } catch (e) {
    console.error('Elevator log cleanup error:', e.message);
  }
}

export function startBackgroundJobs() {
  // Run immediately on startup
  cleanupOldLogs();
  checkOfflineTechnicians();

  // Then on intervals
  setInterval(checkOfflineTechnicians, 30 * 1000);
  setInterval(cleanupOldLogs, CLEANUP_INTERVAL_MS);

  expireCards();
  setInterval(expireCards, 60 * 1000);
  setInterval(cleanupOldElevatorLogs, CLEANUP_INTERVAL_MS);
}
