import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// LINEログイン開始。bot_prompt=aggressive で「友だち追加」をログインと同時に促す。
export async function GET(req: NextRequest) {
  const cid = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!cid) return NextResponse.json({ error: "no-config" }, { status: 500 });

  const origin = process.env.LINE_REDIRECT_ORIGIN || req.nextUrl.origin;
  const redirect = `${origin}/api/auth/line/callback`;
  const state = crypto.randomUUID();

  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cid);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "profile openid");
  url.searchParams.set("bot_prompt", "aggressive"); // 友だち追加を強く促す

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("ky_oauth_state", state, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/",
  });
  return res;
}
