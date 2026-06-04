import { redirect } from "next/navigation";

// 旧 /about は廃止。LP内の説明・免責に統合したのでトップへ。
export default function AboutPage() {
  redirect("/");
}
