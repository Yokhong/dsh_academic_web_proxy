// Optional, read-only smoke probe of the currently running Desktop bridge.
// It never prints endpoint tokens, page URLs, input values or cookies.
import { DesktopBridge } from '../src/desktop-bridge.js';
const bridge = new DesktopBridge({ profileUrl: process.env.DSH_WEB_URL, requireProfile: true });
try {
  const available = await bridge.discover();
  const guests = available ? await bridge.list() : [];
  console.log(JSON.stringify({ bridgeAvailable: available, profileScopedGuests: guests.length, profileUrlPresent: Boolean(process.env.DSH_WEB_URL) }));
} finally { await bridge.close(); }
