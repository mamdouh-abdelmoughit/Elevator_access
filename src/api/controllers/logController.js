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
// Returns a ZIP with today's (or given date's) STATE_CHANGE logs as CSV, then deletes them.
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
    const logs = await prisma.log.findMany({
      where: { elevatorId, eventType: 'STATE_CHANGE', timestamp: { gte: start, lte: end } },
      orderBy: { timestamp: 'asc' },
    });

    if (logs.length === 0) {
      return res.status(404).json({ error: 'No state logs found for this date.' });
    }

    // Build CSV content
    const lines = ['Timestamp,Status,Raw'];
    for (const log of logs) {
      const ts      = log.timestamp.toISOString();
      const status  = (log.details?.status  || '').replace(/"/g, '""');
      const raw     = JSON.stringify(log.details?.raw || {}).replace(/"/g, '""');
      lines.push(`"${ts}","${status}","${raw}"`);
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

    // Delete logs only after the full response has been sent
    const logIds = logs.map(l => l.id);
    res.on('finish', async () => {
      try {
        await prisma.log.deleteMany({ where: { id: { in: logIds } } });
      } catch (e) {
        console.error('Failed to delete logs after export:', e.message);
      }
    });
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
    })));
  } catch (error) {
    console.error('Error fetching access logs:', error);
    res.status(500).json({ error: 'Could not fetch access logs.' });
  }
}
