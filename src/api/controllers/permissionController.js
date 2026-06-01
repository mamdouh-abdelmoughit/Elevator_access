import prisma from '../../db/prismaClient.js';
import { publish } from '../../services/mqttService.js'; 

export async function createPermission(req, res) {
    try {
        const { cardId, elevatorId, relay } = req.body;
        const newPermission = await prisma.permission.create({
            data: { cardId, elevatorId, relay }
        });
        const topic = `elevators/${elevatorId}/commands`;
        publish(topic, JSON.stringify({ command: "UPDATE_PERMISSIONS" }));

        res.status(201).json(newPermission);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not create permission.' });
    }
}

export async function deletePermission(req, res) {
    try {
        const permissionId = parseInt(req.params.id);
        
        // Get elevator ID before deleting to know where to send command
        const perm = await prisma.permission.findUnique({ where: { id: permissionId } });
        if (!perm) return res.status(404).json({error: "Permission not found"});

        await prisma.permission.delete({ where: { id: permissionId } });

        // COMMAND THE ESP32 TO UPDATE
        const topic = `elevators/${perm.elevatorId}/commands`;
        publish(topic, JSON.stringify({ command: "UPDATE_PERMISSIONS" }));
        
        res.json({ message: "Permission revoked" });
    } catch (error) {
        res.status(500).json({ error: "Could not delete permission" });
    }
}

// 1. ADMIN VIEW (All Permissions)
export async function getAllPermissionsForAdmin(req, res) {
    try {
        const elevatorId = parseInt(req.params.id);
        const permissions = await prisma.permission.findMany({
            where: { elevatorId: elevatorId },
            include: { card: { select: { code: true, label: true } } }
        });
        res.json(permissions);
    } catch (error) {
        res.status(500).json({ error: 'Fetch failed.' });
    }
}

// 2. DEVICE VIEW (Active Only)
export async function getPermissionsForDevice(req, res) {
    try {
        const elevatorId = parseInt(req.params.id);
        const permissions = await prisma.permission.findMany({
            where: { elevatorId: elevatorId, isActive: true }, // <--- Filter
            include: { card: { select: { code: true } } }
        });
        res.json(permissions);
    } catch (error) {
        res.status(500).json({ error: 'Fetch failed.' });
    }
}

// 3. SYNDIC VIEW (Resident Names Only)
export async function getResidentsForSyndic(req, res) {
    try {
        const elevatorId = parseInt(req.params.id);
        
        // CHANGED: Removed "isActive: true" so we get EVERYONE
        const allResidents = await prisma.permission.findMany({
            where: {
                elevatorId: elevatorId
            },
            select: {
                id: true,
                cardId: true,
                isActive: true,
                card: { select: { id: true, label: true } }
            }
        });

        res.json(allResidents);
    } catch (error) {
        console.error("Syndic Fetch Error:", error);
        res.status(500).json({ error: 'Could not fetch residents.' });
    }
}

// 4. BLOCK / UNBLOCK ACTION
export async function togglePermissionStatus(req, res) {
    try {
        const permissionId = parseInt(req.params.id);
        const { isActive } = req.body; // true or false

        const updated = await prisma.permission.update({
            where: { id: permissionId },
            data: { isActive: isActive }
        });

        // Update ESP32 immediately
        const topic = `elevators/${updated.elevatorId}/commands`;
        publish(topic, JSON.stringify({ command: "UPDATE_PERMISSIONS" }));

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Update failed" });
    }
}