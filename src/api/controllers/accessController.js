// src/api/controllers/accessController.js
import prisma from '../../db/prismaClient.js';
import { publish } from '../../services/mqttService.js';
import { get as getEnrollmentState } from '../../services/enrollmentService.js';
import { createLog } from '../../services/logService.js';
import { isExpired, notifyDevice } from '../../services/accessRules.js';

// --- FUNCTION 1: Handles regular card swipes ---
// Cabin firmware publishes the decision it already took locally:
//   { card_code, status: "GRANTED"|"DENIED", floors: [0,2,5], reason?, free_access? }
// We enrich it with the resident's identity and store it as the access log.
// If the device's cached whitelist disagrees with the database (e.g. a block
// that hasn't reached it yet), we log that and push a resync.
// Older firmware sends only { card_code }: then the backend decides, as before.
export const handleAccessEvent = async (elevatorId, payload) => {
  const cardCodeString = payload.card_code.toString();
  console.log(`Processing access event for Card [${cardCodeString}] at Elevator [${elevatorId}]`);

  try {
    const card = await prisma.card.findUnique({
      where: { code: cardCodeString },
      include: { permissions: { where: { elevatorId } } },
    });
    const perms = card?.permissions || [];
    const expired = !!card && isExpired(card);
    const dbAllows = perms.length > 0 && perms.every(p => p.isActive) && !expired;
    const dbFloors = perms.map(p => p.relay).sort((a, b) => a - b);

    let dbReason = null;
    if (!card) dbReason = 'UNKNOWN_CARD';
    else if (perms.length === 0) dbReason = 'NO_PERMISSION';
    else if (expired) dbReason = 'EXPIRED';
    else if (!dbAllows) dbReason = 'BLOCKED';

    const fromDevice = payload.status === 'GRANTED' || payload.status === 'DENIED';
    const status = fromDevice ? payload.status : (dbAllows ? 'GRANTED' : 'DENIED');
    const floors = fromDevice ? (Array.isArray(payload.floors) ? payload.floors : []) : dbFloors;
    const outOfSync = fromDevice && !payload.free_access && (status === 'GRANTED') !== dbAllows;
    // Swipes buffered by the device while MQTT was down carry their age.
    const agoMs = Number(payload.ago_ms) || 0;
    const delayed = agoMs > 5000;

    await createLog("ACCESS_ATTEMPT", {
      cardCode: cardCodeString,
      status,
      reason: status === 'DENIED' ? (dbReason || 'DEVICE_OUT_OF_SYNC') : null,
      floors,
      freeAccess: !!payload.free_access,
      cardId: card?.id ?? null,
      residentName: card?.label ?? null,
      apartment: card?.apartment ?? null,
      homeFloor: card?.homeFloor ?? null,
      outOfSync,
      delayed,
      source: fromDevice ? 'device' : 'backend',
    }, elevatorId, delayed ? new Date(Date.now() - agoMs) : null);

    if (outOfSync) {
      console.warn(`Elevator ${elevatorId} whitelist out of sync for card ${cardCodeString} — pushing UPDATE_PERMISSIONS`);
      notifyDevice(elevatorId);
    }
  } catch (error) {
    console.error("Error processing access event:", error);
    createLog("ACCESS_FAILURE", {
      cardCode: cardCodeString,
      error: error.message || 'unknown'
    }, elevatorId);
  }
};

// --- FUNCTION 2: Handles enrollment events ---
export const handleEnrollmentEvent = async (elevatorId, newCardCode) => {
  const newCardCodeString = newCardCode.toString();
  const state = getEnrollmentState(elevatorId);
  if (!state) {
    console.log(`ENROLLMENT: Ignoring event. Elevator ${elevatorId} was not in enrollment mode.`);
    return;
  }
  const { userId } = state;

  try {
    await prisma.card.create({ data: { code: newCardCodeString, userId: userId } });
    console.log(`SUCCESS: Card ${newCardCodeString} created and assigned to User ${userId}.`);
    createLog("ENROLLMENT_SUCCESS", {
      cardCode: newCardCodeString,
      assignedToUserId: userId,
      enrolledAtElevatorId: elevatorId
    });
    const topic = 'elevators/all/commands';
    const message = JSON.stringify({ command: "UPDATE_PERMISSIONS" });
    publish(topic, message);
  } catch (error) {
    console.error("ENROLLMENT FAILED:", error);
    createLog("ENROLLMENT_FAILURE", {
      cardCode: newCardCodeString,
      attemptedForUserId: userId,
      error: error.message
    });
  }
};
