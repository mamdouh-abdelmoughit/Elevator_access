// Copy this file to include/secrets.h (git-ignored) and fill in the site values.
#pragma once

#define WIFI_SSID      "your-ssid"
#define WIFI_PASSWORD  "your-password"

// MQTT broker credentials (leave empty for an anonymous broker).
#define MQTT_USER      ""
#define MQTT_PASS      ""

// Must match the backend's DEVICE_API_KEY env var once it is set there.
// Leave empty while the backend does not enforce it.
#define DEVICE_API_KEY ""
