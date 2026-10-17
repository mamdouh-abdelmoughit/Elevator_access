// src/middleware/deviceAuth.js
// Protects the endpoints the ESP32 calls without a user JWT (/elevators/identify,
// /permissions/elevator/:id). Opt-in: only enforced once DEVICE_API_KEY is set
// in the environment, so devices running older firmware keep working until
// every board has been reflashed with the key (include/secrets.h).
const DEVICE_API_KEY = process.env.DEVICE_API_KEY || '';

export default function deviceAuth(req, res, next) {
  if (!DEVICE_API_KEY) return next();
  if (req.headers['x-device-key'] === DEVICE_API_KEY) return next();
  return res.status(401).json({ error: 'Invalid device key' });
}
