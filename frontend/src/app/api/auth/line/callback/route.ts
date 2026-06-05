import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// LINEログインのコールバック。code→token→profile を取得し、登録済みクッキーを立てて /board へ。
// bot_prompt=aggressive により、ここに来る前に友だち追加が行われる(friendship_status_changed=true)。
export async function GET(req: NextRequest) {
  const origin = process.env.LINE_REDIRECT_ORIGIN || req.nextUrl.origin;
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  const cookieState = req.cookies.get("ky_oauth_state")?.value;

  const fail = (why: string) => NextResponse.redirect(`${origin}/?login=error&why=${why}`);
  if (!code || !state || !cookieState || state !== cookieState) return fail("state");

  const cid = process.env.LINE_LOGIN_CHANNEL_ID;
  const sec = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!cid || !sec) return fail("config");

  const redirect = `${origin}/api/auth/line/callback`;
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code", code,
      redirect_uri: redirect, client_id: cid, client_secret: sec,
    });
    const tok = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    }).then((r) => r.json());
    if (!tok.access_token) return fail("token");

    const prof = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    }).then((r) => r.json());
    const uid = prof.userId || "";

    const res = NextResponse.redirect(`${origin}/board?login=1`);
    // SPAが検知する読み取り可能フラグ + サーバー用のuid(httpOnly)
    res.cookies.set("ky_auth", "1", { secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 180, path: "/" });
    if (uid) res.cookies.set("ky_uid", uid, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 180, path: "/" });
    res.cookies.delete("ky_oauth_state");
    return res;
  } catch {
    return fail("exception");
  }
}
