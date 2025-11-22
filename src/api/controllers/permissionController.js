import prisma from '../../db/prismaClient.js';

export async function createPermission(req, res) {
    try {
        const { cardId, elevatorId, relay } = req.body;
        const newPermission = await prisma.permission.create({
            data: { cardId, elevatorId, relay }
        });
        res.status(201).json(newPermission);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not create permission. Is it a duplicate?' });
    }
}

export async function getPermissionsForElevator(req, res) {
    try {
        const elevatorId = parseInt(req.params.id);
        const permissionsForElevator = await prisma.permission.findMany({
            where: { elevatorId: elevatorId },
            include: { card: { select: { code: true } } }
        });
        res.json(permissionsForElevator);
    } catch (error) {
        res.status(500).json({ error: 'Could not fetch permissions.' });
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