"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const apiBaseUrl = process.env.ORBITOS_API_BASE_URL ?? "http://127.0.0.1:3000";

export async function signOut(): Promise<never> {
  const cookieStore = await cookies();
  const token = cookieStore.get("orbitos_session")?.value;
  if (token !== undefined && token.length > 0) {
    await fetch(`${apiBaseUrl}/v1/auth/session`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
      method: "DELETE",
    }).catch(() => undefined);
  }
  cookieStore.delete("orbitos_session");
  redirect("/sign-in");
}
