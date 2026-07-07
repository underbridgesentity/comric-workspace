import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { unreadAlertCount } from "@/lib/alert-engine";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const theme = cookieStore.get("comric-theme")?.value === "light" ? "light" : "dark";
  const unread = await unreadAlertCount(session.user.id).catch(() => 0);

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-canvas">
        <Sidebar user={{ name: session.user.name, role: session.user.role }} />
        <div className="pl-60">
          <Topbar
            user={{ name: session.user.name, role: session.user.role }}
            initialTheme={theme}
            initialUnread={unread}
          />
          <main className="mx-auto max-w-[1400px] p-6">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
