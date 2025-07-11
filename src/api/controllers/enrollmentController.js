// src/api/controllers/enrollmentController.js

import { publish as publishMqtt } from '../../services/mqttService.js';
import { set as setEnrollmentState } from '../../services/enrollmentService.js';

export const startEnrollment = (req, res) => {
    const { elevatorId, userId } = req.body;
    if (!elevatorId || !userId) {
        return res.status(400).json({ error: 'elevatorId and userId are required.' });
    }

    setEnrollmentState(elevatorId, userId);

    const topic = `elevators/${elevatorId}/commands`;
    const message = JSON.stringify({ command: "ENTER_ENROLLMENT_MODE", timeout: 60000 });
    
    publishMqtt(topic, message); 
    
    console.log(`API: Enrollment initiated for Elevator ${elevatorId}, User ${userId}.`);
    res.status(200).json({ message: `Enrollment mode initiated for elevator ${elevatorId}. Please present card.` });
};