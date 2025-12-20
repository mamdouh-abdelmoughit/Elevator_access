import prisma from '../../db/prismaClient.js';
import { publish } from '../../services/mqttService.js';


export async function createElevator(req, res) {
    try {
        // 1. Extract latitude and longitude from the body
        const { name, location, latitude, longitude, macAddress} = req.body;

        // 2. Validate
        if (!name || !location) {
            return res.status(400).json({ error: "Name and Location description are required." });
        }

        // 3. Save to Database
        const newElevator = await prisma.elevator.create({ 
            data: { 
                name, 
                location, 
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                macAddress: macAddress
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
export async function sendCommand(req, res) {
    try {
        const elevatorId = parseInt(req.params.id);
        const { commandType } = req.body; // e.g. "OPEN_DOOR", "SHUTDOWN"

        if (!commandType) return res.status(400).json({ error: "Command required" });

        // MQTT Topic: elevators/1/commands
        const topic = `elevators/${elevatorId}/commands`;
        
        // Payload expected by ESP32
        const message = JSON.stringify({
            command: "REMOTE_CONTROL",
            action: commandType
        });

        publish(topic, message);
        console.log(`Command ${commandType} sent to Elevator ${elevatorId}`);

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
        res.json({ id: elevator.id, name: elevator.name });

    } catch (error) {
        console.error("Identify error:", error);
        res.status(500).json({ error: "Server error" });
    }
}
// Assign a Manager (Syndic) to an Elevator
export async function assignManager(req, res) {
    try {
        const elevatorId = parseInt(req.params.id);
        const { userId } = req.body; // The ID of the Syndic (User)

        const updated = await prisma.elevator.update({
            where: { id: elevatorId },
            data: { managerId: parseInt(userId) }
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
        res.json(elevators);
    } catch (error) {
        console.error("Error fetching my elevators:", error);
        res.status(500).json({ error: 'Could not fetch elevators.' });
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