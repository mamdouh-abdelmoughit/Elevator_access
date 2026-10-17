import prisma from '../../db/prismaClient.js';
import { publish } from '../../services/mqttService.js';
import { MAX_FLOOR_COUNT, audit, loadManagedElevator, isExpired, isOnline } from '../../services/accessRules.js';

// Remote commands understood by the cabin master firmware.
const RELAY_COMMANDS = [
    'OPEN_DOOR_ON', 'OPEN_DOOR_OFF', 'CLOSE_DOOR_ON', 'CLOSE_DOOR_OFF',
    'SHUTDOWN_ON', 'SHUTDOWN_OFF', 'REVISION_MODE_ON', 'REVISION_MODE_OFF',
    'REV_MONTEE_ON', 'REV_MONTEE_OFF', 'REV_DESCENTE_ON', 'REV_DESCENTE_OFF',
];
const FREE_ACCESS_COMMANDS = ['FREE_ACCESS_ON', 'FREE_ACCESS_OFF'];


export async function createElevator(req, res) {
    try {
        // 1. Extract latitude and longitude from the body
        const { name, location, latitude, longitude, macAddress, floorCount} = req.body;

        // 2. Validate
        if (!name || !location) {
            return res.status(400).json({ error: "Name and Location description are required." });
        }
        if (floorCount && (parseInt(floorCount) < 1 || parseInt(floorCount) > MAX_FLOOR_COUNT)) {
            return res.status(400).json({ error: `floorCount must be between 1 and ${MAX_FLOOR_COUNT}.` });
        }

        // 3. Save to Database
        const newElevator = await prisma.elevator.create({
            data: {
                name,
                location,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                macAddress: macAddress,
                floorCount: floorCount ? parseInt(floorCount) : null
            }
        });
        
        console.log(`New Elevator Created: ${name} at [${latitude}, ${longitude}]`);
        res.status(201).json(newElevator);
    } catch (error) {
        console.error("Error creating elevator:", error); 
        res.status(500).json({ error: 'Could not create elevator.' });
    }
}
export const getNearbyEmployees = async (req, res) => {
    try {
        const elevatorId = parseInt(req.params.id);

        // 1. Find the elevator and its location
        const elevator = await prisma.elevator.findUnique({
            where: { id: elevatorId },
        });

        if (!elevator || elevator.latitude === null || elevator.longitude === null) {
            return res.status(404).json({ error: 'Elevator not found or has no location data.' });
        }

        const employees = await prisma.user.findMany({
            where: {
                role: 'EMPLOYEE', // <-- THE IMPORTANT CHANGE
                latitude: { not: null },
                longitude: { not: null },
            },
        });
        // 3. Calculate the distance for each employee
        const employeesWithDistance = employees.map(emp => {
            const distance = calculateDistance(
                elevator.latitude, elevator.longitude,
                emp.latitude, emp.longitude
            );
            return { ...emp, distance_km: distance };
        });

        // 4. Sort employees by distance (nearest first)
        employeesWithDistance.sort((a, b) => a.distance_km - b.distance_km);

        res.json(employeesWithDistance);

    } catch (error) {
        console.error("Error finding nearby employees:", error);
        res.status(500).json({ error: 'Could not find nearby employees.' });
    }
};

export const getElevatorById = async (req, res) => {
    const elevatorId = parseInt(req.params.id);
    try {
        const elevator = await prisma.elevator.findUnique({ where: { id: elevatorId } });
        if (!elevator) return res.status(404).json({ error: 'Elevator not found.' });
        res.json(elevator);
    } catch (error) {
        res.status(500).json({ error: 'Could not fetch elevator.' });
    }
};
// Get ALL elevators (for the map)
export async function getAllElevators(req, res) {
    try {
        const elevators = await prisma.elevator.findMany({
            where: {
                latitude: { not: null },
                longitude: { not: null }
            }
        });
        res.json(elevators);
    } catch (error) {
        console.error("Error fetching elevators:", error);
        res.status(500).json({ error: 'Could not fetch elevators.' });
    }
}
// ADMIN / EMPLOYEE (technicians): every command, any elevator.
// MANAGER (Syndic): only "accès libre" on their own elevators.
export async function sendCommand(req, res) {
    try {
        const elevatorId = parseInt(req.params.id);
        const { commandType } = req.body; // e.g. "OPEN_DOOR_ON", "FREE_ACCESS_ON"

        if (!commandType) return res.status(400).json({ error: "Command required" });
        const isFreeAccess = FREE_ACCESS_COMMANDS.includes(commandType);
        if (!isFreeAccess && !RELAY_COMMANDS.includes(commandType)) {
            return res.status(400).json({ error: "Unknown command" });
        }

        const elevator = await prisma.elevator.findUnique({ where: { id: elevatorId } });
        if (!elevator) return res.status(404).json({ error: "Elevator not found." });
        const role = req.user.role;
        const allowed = role === 'ADMIN' || role === 'EMPLOYEE'
            || (role === 'MANAGER' && isFreeAccess && elevator.managerId === req.user.id);
        if (!allowed) return res.status(403).json({ error: "Not authorized to send this command." });

        if (isFreeAccess) {
            // Persisted so the firmware restores it after a reboot (via /identify).
            await prisma.elevator.update({
                where: { id: elevatorId },
                data: { freeAccess: commandType === 'FREE_ACCESS_ON' },
            });
        }

        publish(`elevators/${elevatorId}/commands`, JSON.stringify({
            command: "REMOTE_CONTROL",
            action: commandType
        }));
        console.log(`Command ${commandType} sent to Elevator ${elevatorId}`);
        await audit(req, elevatorId, 'COMMAND_SENT', { command: commandType });

        res.json({ message: "Command sent successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to send command" });
    }
}
// Get Elevator Config by MAC Address
// Get Elevator Config by MAC Address
export async function identifyElevator(req, res) {
    try {
        // --- DEBUG LOGS (Spy on the incoming request) ---
        console.log("🔍 REQUEST RECEIVED!");
        console.log("👉 Method:", req.method); // Is it GET or POST?
        console.log("👉 Query Params:", req.query); // checking ?mac=...
        console.log("👉 Body Params:", req.body);   // checking JSON body
        // ------------------------------------------------

        // Check BOTH spots (just in case ESP32 sends it differently)
        const mac = req.query.mac || req.body.mac; 

        console.log(`🔍 Searching Database for MAC: '${mac}'`);

        if (!mac) {
            console.log("❌ Error: No MAC provided in request.");
            return res.status(400).json({ error: "MAC address required" });
        }

        const elevator = await prisma.elevator.findUnique({
            where: { macAddress: mac }
        });

        if (!elevator) {
            console.log("❌ Error: MAC not found in database.");
            return res.status(404).json({ error: "Elevator not registered" });
        }

        console.log("✅ SUCCESS! Found Elevator:", elevator.name);
        res.json({
            id: elevator.id,
            name: elevator.name,
            floorCount: elevator.floorCount,
            unlockSeconds: elevator.unlockSeconds,
            freeAccess: elevator.freeAccess,
        });

    } catch (error) {
        console.error("Identify error:", error);
        res.status(500).json({ error: "Server error" });
    }
}
// Assign a Manager (Syndic) to an Elevator — ADMIN only
export async function assignManager(req, res) {
    if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    try {
        const elevatorId = parseInt(req.params.id);
        const { userId } = req.body;

        if (isNaN(elevatorId) || !userId) {
            return res.status(400).json({ error: 'elevatorId and userId are required.' });
        }

        const updated = await prisma.elevator.update({
            where: { id: elevatorId },
            data: { managerId: parseInt(userId) },
        });
        res.json({ message: "Manager assigned successfully", elevator: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to assign manager" });
    }
}
// Get elevators managed by the current user (Syndic)
export async function getMyElevators(req, res) {
    try {
        const syndicId = req.user.id; // Extracted from JWT Token

        const elevators = await prisma.elevator.findMany({
            where: { 
                managerId: parseInt(syndicId) 
            }
        });
        
        console.log(`Found ${elevators.length} elevators for Manager ${syndicId}`);
        res.json(elevators.map(({ macAddress, ...e }) => ({ ...e, online: isOnline(e) })));
    } catch (error) {
        console.error("Error fetching my elevators:", error);
        res.status(500).json({ error: 'Could not fetch elevators.' });
    }
}
export async function getElevatorWhitelist(req, res) {
    const { id } = req.params;
    try {
        const allowedCards = await prisma.card.findMany({
            where: {
                permissions: {
                    some: {
                        elevatorId: parseInt(id) 
                        // ❌ REMOVED: isActive: true (Now we fetch blocked cards too!)
                    }
                }
            },
            include: {
                // 1. Fetch User Details
                user: { 
                    select: {
                        name: true,
                        phone: true,
                        role: true
                    }
                },
                // 2. ✅ IMPORTANT: Fetch the permission status so we know if it's Blocked
                permissions: {
                    where: { elevatorId: parseInt(id) },
                    select: { isActive: true, relay: true }
                }
            }
        });
        res.json(allowedCards);
    } catch (error) {
        console.error("Error fetching whitelist:", error);
        res.status(500).json({ error: "Failed to fetch whitelist" });
    }
}

// --- ADD THIS AT THE BOTTOM OF elevatorController.js ---

export async function toggleCardAccess(req, res) {
    const elevatorId = parseInt(req.params.id);
    const { cardId, action } = req.body;

    if (isNaN(elevatorId)) {
        return res.status(400).json({ error: "Invalid elevator ID." });
    }
    if (!cardId || !action) {
        return res.status(400).json({ error: "cardId and action are required." });
    }
    if (action !== 'BLOCK' && action !== 'UNBLOCK') {
        return res.status(400).json({ error: "action must be BLOCK or UNBLOCK." });
    }

    try {
        // Only the elevator's own manager or an ADMIN may change access
        const elevator = await loadManagedElevator(req, res);
        if (!elevator) return;

        const isActive = action === "UNBLOCK";
        const card = await prisma.card.findUnique({ where: { id: parseInt(cardId) } });
        if (!card) return res.status(404).json({ error: "Card or permission not found." });
        if (isActive && isExpired(card)) {
            return res.status(409).json({ error: "Ce badge a expiré : modifiez sa date de validité pour le réactiver.", code: 'EXPIRED' });
        }

        const updateResult = await prisma.permission.updateMany({
            where: { elevatorId, cardId: card.id },
            data:  { isActive },
        });

        if (updateResult.count === 0) {
            return res.status(404).json({ error: "Card or permission not found." });
        }

        publish(`elevators/${elevatorId}/commands`, JSON.stringify({ command: "UPDATE_PERMISSIONS" }));
        await audit(req, elevatorId, isActive ? 'RESIDENT_UNBLOCKED' : 'RESIDENT_BLOCKED', {
            cardId: card.id, cardCode: card.code, residentName: card.label,
        });

        res.json({ message: `Card ${action}ED successfully` });
    } catch (error) {
        console.error("Error toggling access:", error);
        res.status(500).json({ error: "Failed to toggle access" });
    }
}
// --- HELPER FUNCTION (Haversine formula to calculate distance) ---
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        0.5 - Math.cos(dLat) / 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        (1 - Math.cos(dLon)) / 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}