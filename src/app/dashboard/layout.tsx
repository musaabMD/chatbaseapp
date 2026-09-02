import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { Sidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  if (!session?.user) redirect("/login");
  if (!session.workspace) redirect("/onboarding");

  return (
    <div className="flex min-h-screen">
      <Sidebar workspaceName={session.workspace.name} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
