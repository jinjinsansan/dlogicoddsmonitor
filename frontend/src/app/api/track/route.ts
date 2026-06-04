import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// 購読の保存/削除のみ(書き込み)。読み取り経路は静的JSONのまま。
export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "no-config" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const { action, raceId, subscription } = body || {};
  const endpoint = subscription?.endpoint;
  if (!raceId || !endpoint) return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400 });

  const sb = createClient(url, key);
  try {
    if (action === "untrack") {
      await sb.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("race_id", raceId);
    } else {
      const keys = subscription.keys || {};
      await sb.from("push_subscriptions").upsert(
        { endpoint, p256dh: keys.p256dh, auth: keys.auth, race_id: raceId },
        { onConflict: "endpoint,race_id" }
      );
    }
  } catch {
    return NextResponse.json({ ok: false, error: "db" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
