import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ApplicationShell } from "../../components/application-shell";
import { loadAuthorizedSession } from "../../lib/session";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await loadAuthorizedSession();
  if (session === null) {
    redirect("/sign-in");
  }

  const themeCookie = (await cookies()).get("orbitos_theme")?.value;
  const initialTheme =
    themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";

  return (
    <ApplicationShell initialTheme={initialTheme} session={session}>
      {children}
    </ApplicationShell>
  );
}
