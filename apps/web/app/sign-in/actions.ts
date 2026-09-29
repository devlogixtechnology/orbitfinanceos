"use server";

import { createdSessionSchema, signInRequestSchema } from "@orbitos/canonical-model";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const apiBaseUrl = process.env.ORBITOS_API_BASE_URL ?? "http://127.0.0.1:3000";

export async function signIn(formData: FormData): Promise<never> {
  const credentials = signInRequestSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!credentials.success) {
    redirect("/sign-in?error=invalid");
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/v1/auth/sessions`, {
      body: JSON.stringify(credentials.data),
      cache: "no-store",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch {
    redirect("/sign-in?error=unavailable");
  }

  if (!response.ok) {
    redirect(`/sign-in?error=${response.status === 401 ? "invalid" : "unavailable"}`);
  }

  const created = createdSessionSchema.safeParse(await response.json());
  if (!created.success) {
    redirect("/sign-in?error=unavailable");
  }

  (await cookies()).set("orbitos_session", created.data.token, {
    expires: new Date(created.data.expiresAt),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure:
      process.env.ORBITOS_SECURE_COOKIES !== "false" &&
      process.env.NODE_ENV === "production",
  });
  redirect("/app/overview");
}
