import prisma from '../../db/prismaClient.js';

export async function createElevator(req, res) {
    try {
        const { name, location } = req.body;
        const newElevator = await prisma.elevator.create({ data: { name, location } });
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

        // 2. Find all users who are employees and have a recent location
        const employees = await prisma.user.findMany({
            where: {
                isEmployee: true,
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