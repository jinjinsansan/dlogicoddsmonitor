// Web Push 購読(クライアント)。レース単位で追跡をON/OFFする。
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BPfu1Tjc3I7POevWEucDx6a_Pt3yZ2YeokPPM4X90gAFEZR3T0m4FvT_amkhSOI81UJBGRGCRn1nTWf7BpuG928";

const LS_KEY = "ky_tracked_races";

export function pushSupported(): boolean {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
}

// 通知ボタン押下時の非対応メッセージ(iOSは個別案内)
export function unsupportedMessage(): string {
  if (isIOS()) {
    return "iPhoneで通知を受け取るには、Safariでこのサイトを開き、共有ボタン→「ホーム画面に追加」してください。追加したアイコンから開くと通知が使えます（Chrome等では通知できません）。";
  }
  return "このブラウザは通知に対応していません。最新のChrome/Edge/Safari等でお試しください。";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function getTrackedSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); } catch { return new Set(); }
}
function saveTrackedSet(s: Set<string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...s])); } catch { /* noop */ }
}
export function isTracked(raceId: string): boolean {
  return getTrackedSet().has(raceId);
}

async function getSubscription(): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    });
  }
  return sub;
}

/** レース追跡ON。通知許可→購読→サーバ登録。成功でtrue。 */
export async function trackRace(raceId: string): Promise<boolean> {
  if (!pushSupported()) throw new Error("unsupported");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("denied");
  const sub = await getSubscription();
  const r = await fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "track", raceId, subscription: sub }),
  });
  if (!r.ok) throw new Error("server");
  const s = getTrackedSet(); s.add(raceId); saveTrackedSet(s);
  return true;
}

/** レース追跡OFF。 */
export async function untrackRace(raceId: string): Promise<void> {
  let sub: PushSubscription | null = null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    sub = reg ? await reg.pushManager.getSubscription() : null;
  } catch { /* noop */ }
  try {
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "untrack", raceId, subscription: sub }),
    });
  } catch { /* noop */ }
  const s = getTrackedSet(); s.delete(raceId); saveTrackedSet(s);
}
