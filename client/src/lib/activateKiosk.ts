import { api } from "./api";
import { getHardwareDeviceId, setBoundDeviceId, setDeviceToken, setKioskKey } from "./apiConfig";
import { syncBoothConfigFromServer } from "./boothConfigStore";
import { sendKioskHeartbeatNow } from "./kioskHeartbeat";

/**
 * Turns THIS computer into the booth that owns `key`. Needs a signed-in tenant admin (the admin token on api requests); the server
 * checks the key belongs to that account and binds this PC (hardware id + a secret kept in the OS keystore).
 * Shared by the first-run pairing screen and the Admin's "Aktifkan komputer ini" card.
 */
export async function activateThisComputer(key: string): Promise<void> {
  const hardwareId = getHardwareDeviceId();
  const result = (await api.activateKiosk({ key: key.trim(), deviceId: hardwareId }))!;
  // From here on this computer is the booth: remember who we are (id + secret) before the first kiosk request goes out.
  setBoundDeviceId(hardwareId);
  await setDeviceToken(result.deviceToken);
  setKioskKey(key);
  await syncBoothConfigFromServer().catch(() => undefined); // offline right after activating is fine: it syncs later
  void sendKioskHeartbeatNow();
}
