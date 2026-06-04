import { createClient } from "@supabase/supabase-js";

// サーバー専用クライアント。service_role キーはクライアントへ渡らない
// (Server Component / Route Handler 内でのみ import すること)。
// ビルド時に env が無くても createClient が throw しないようプレースホルダを使う
// (実行時は Vercel/ローカルの env が入る)。
const url = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder";

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
