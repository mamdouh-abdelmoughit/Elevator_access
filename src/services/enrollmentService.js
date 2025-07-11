// src/services/enrollmentService.js

// This is a simple in-memory state store. For a larger production system,
// you might use a proper cache like Redis.
const enrollmentState = {};

// Stores the user ID for an elevator that is now in enrollment mode
const set = (elevatorId, userId) => {
    console.log(`ENROLLMENT: Setting state for Elevator ${elevatorId} to enroll for User ${userId}`);
    enrollmentState[elevatorId] = { userId, timestamp: Date.now() };
};

// Retrieves and clears the state for an elevator
const get = (elevatorId) => {
    const state = enrollmentState[elevatorId];
    if (state) {
        console.log(`ENROLLMENT: Getting state for Elevator ${elevatorId}. User is ${state.userId}`);
        delete enrollmentState[elevatorId]; // State is single-use, delete after getting
    }
    return state;
};

export { set, get };