// GET /app/version — returns the latest APK build info.
// Update the env vars below in Cloud Run each time you ship a native build.
// JS-only changes (OTA via EAS Update) do NOT require bumping these.
export function getAppVersion(req, res) {
  const versionCode = parseInt(process.env.APP_LATEST_VERSION_CODE || '1', 10);
  const versionName = process.env.APP_LATEST_VERSION_NAME || '1.0.0';
  const apkUrl      = process.env.APP_APK_URL || '';
  const mandatory   = process.env.APP_UPDATE_MANDATORY === 'true';

  res.json({ versionCode, versionName, apkUrl, mandatory });
}
