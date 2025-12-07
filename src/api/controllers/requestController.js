import prisma from '../../db/prismaClient.js';

// 1. SYNDIC: Create a new request
export async function createRequest(req, res) {
    try {
        const { elevatorId, type, residentName, notes } = req.body;
        const syndicId = req.user.id; // From JWT Token

        const newRequest = await prisma.request.create({
            data: {
                syndicId: parseInt(syndicId),
                elevatorId: parseInt(elevatorId),
                type,          // "BLOCK", "ACTIVATE"
                residentName,  // "Apt 4"
                notes
            }
        });
        res.status(201).json(newRequest);
    } catch (error) {
        res.status(500).json({ error: "Failed to submit request" });
    }
}

// 2. ADMIN: Get all pending requests
export async function getPendingRequests(req, res) {
    try {
        const requests = await prisma.request.findMany({
            where: { status: 'PENDING' },
            include: { 
                syndic: { select: { name: true, phone: true } },
                elevator: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch requests" });
    }
}

// 3. SYNDIC: Get my requests (history)
export async function getMyRequests(req, res) {
    try {
        const requests = await prisma.request.findMany({
            where: { syndicId: req.user.id },
            include: { elevator: { select: { name: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch history" });
    }
}

// 4. ADMIN: Update Request Status (Mark as Done/Rejected)
export async function updateRequestStatus(req, res) {
    try {
        const requestId = parseInt(req.params.id);
        const { status } = req.body; // "COMPLETED", "REJECTED"

        const updated = await prisma.request.update({
            where: { id: requestId },
            data: { status }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: "Failed to update status" });
    }
}