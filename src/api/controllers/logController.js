import prisma from '../../db/prismaClient.js';
import archiver from 'archiver';

export const getLogs = async (req, res) => {
  try {
    const logs = await prisma.log.findMany({
      take: 50,
      orderBy: { timestamp: 'desc' },
    });
    res.json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: 'Could not fetch logs.' });
  }
};

// GET /logs/elevator/:id/export?date=YYYY-MM-DD
// Returns a ZIP with the given date's logs as CSV.
// ?type=state|access|all (default state), ?purge=true deletes them after download.
export async function exportStateLogs(req, res) {
  const elevatorId = parseInt(req.params.id);
  if (isNaN(elevatorId)) return res.status(400).json({ error: 'Invalid elevator ID.' });

  // Only ADMIN or the elevator's own manager may export
  if (req.user.role !== 'ADMIN') {
    const elevator = await prisma.elevator.findUnique({
      where: { id: elevatorId },
      select: { managerId: true },
    });
    if (!elevator || elevator.managerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized for this elevator.' });
    }
  }

  const dateParam = req.query.date || new Date().toISOString().slice(0, 10);
  const start = new Date(dateParam + 'T00:00:00.000Z');
  const end   = new Date(dateParam + 'T23:59:59.999Z');

  try {
    // ?type=state (default, backwards compatible) | access | all
    const type = req.query.type || 'state';
    const eventTypes = type === 'access' ? ['ACCESS_ATTEMPT']
      : type === 'all' ? ['STATE_CHANGE', 'ACCESS_ATTEMPT', 'AUDIT']
      : ['STATE_CHANGE'];

    const logs = await prisma.log.findMany({
      where: { elevatorId, eventType: { in: eventTypes }, timestamp: { gte: start, lte: end } },
      orderBy: { timestamp: 'asc' },
    });

    if (logs.length === 0) {
      return res.status(404).json({ error: 'No logs found for this date.' });
    }

    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['Timestamp,Type,Status,Resident,Card,Floors,Details'];
    for (const log of logs) {
      const d = log.details || {};
      lines.push([
        q(log.timestamp.toISOString()),
        q(log.eventType),
        q(d.status || d.action || ''),
        q(d.residentName || d.actorName || ''),
        q(d.cardCode || ''),
        q(Array.isArray(d.floors) ? d.floors.map(f => (f === 0 ? 'RDC' : f)).join(' ') : ''),
        q(JSON.stringify(d.raw || d.reason || d.changed || '')),
      ].join(','));
    }
    const csv = lines.join('\n');

    const filename = `elevator-${elevatorId}-${dateParam}`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => { throw err; });
    archive.pipe(res);
    archive.append(csv, { name: `${filename}.csv` });
    archive.finalize();

    // Logs are kept (the retention job prunes old ones, see
    // offlineDetectionService). ?purge=true restores "download then delete".
    if (req.query.purge === 'true') {
      const logIds = logs.map(l => l.id);
      res.on('finish', async () => {
        try {
          await prisma.log.deleteMany({ where: { id: { in: logIds } } });
        } catch (e) {
          console.error('Failed to delete logs after export:', e.message);
        }
      });
    }
  } catch (error) {
    console.error('Error exporting state logs:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Could not export logs.' });
  }
}

// GET /logs/elevator/:id/access?date=YYYY-MM-DD
// Returns today's card-swipe logs for the syndic to cache locally on their phone.
export async function getAccessLogs(req, res) {
  const elevatorId = parseInt(req.params.id);
  if (isNaN(elevatorId)) return res.status(400).json({ error: 'Invalid elevator ID.' });

  if (req.user.role !== 'ADMIN') {
    const elevator = await prisma.elevator.findUnique({
      where: { id: elevatorId },
      select: { managerId: true },
    });
    if (!elevator || elevator.managerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized for this elevator.' });
    }
  }

  const dateParam = req.query.date || new Date().toISOString().slice(0, 10);
  const start = new Date(dateParam + 'T00:00:00.000Z');
  const end   = new Date(dateParam + 'T23:59:59.999Z');

  try {
    const logs = await prisma.log.findMany({
      where: { elevatorId, eventType: 'ACCESS_ATTEMPT', timestamp: { gte: start, lte: end } },
      orderBy: { timestamp: 'asc' },
    });

    res.json(logs.map(l => ({
      id:        l.id,
      timestamp: l.timestamp,
      cardCode:  l.details?.cardCode,
      status:    l.details?.status,
      reason:    l.details?.reason || null,
      residentName: l.details?.residentName || null,
      floors:    l.details?.floors || [],
    })));
  } catch (error) {
    console.error('Error fetching access logs:', error);
    res.status(500).json({ error: 'Could not fetch access logs.' });
  }
}

// GET /logs/elevator/:id/activity
//   ?types=ACCESS,STATE,AUDIT   (default: all three)
//   &status=GRANTED|DENIED      (access events only)
//   &from=ISO&to=ISO            (optional time window)
//   &cursor=<log id>&limit=40   (newest first; pass nextCursor to get the next page)
const TYPE_MAP = { ACCESS: 'ACCESS_ATTEMPT', STATE: 'STATE_CHANGE', AUDIT: 'AUDIT' };

export async function getActivity(req, res) {
  const elevatorId = parseInt(req.params.id);
  if (isNaN(elevatorId)) return res.status(400).json({ error: 'Invalid elevator ID.' });

  if (req.user.role !== 'ADMIN') {
    const elevator = await prisma.elevator.findUnique({ where: { id: elevatorId }, select: { managerId: true } });
    if (!elevator || elevator.managerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized for this elevator.' });
    }
  }

  const types = (req.query.types || 'ACCESS,STATE,AUDIT')
    .split(',').map(t => TYPE_MAP[t.trim().toUpperCase()]).filter(Boolean);
  if (types.length === 0) return res.status(400).json({ error: 'Invalid types.' });

  const limit = Math.min(Math.max(parseInt(req.query.limit) || 40, 1), 100);
  const where = { elevatorId, eventType: { in: types } };
  if (req.query.from || req.query.to) {
    where.timestamp = {};
    if (req.query.from) where.timestamp.gte = new Date(req.query.from);
    if (req.query.to) where.timestamp.lte = new Date(req.query.to);
  }
  if (req.query.status === 'GRANTED' || req.query.status === 'DENIED') {
    where.details = { path: ['status'], equals: req.query.status };
  }
  const cursor = parseInt(req.query.cursor);

  try {
    const items = await prisma.log.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(isNaN(cursor) ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    res.json({
      items: page.map(l => ({ id: l.id, timestamp: l.timestamp, eventType: l.eventType, details: l.details })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Could not fetch activity.' });
  }
}
