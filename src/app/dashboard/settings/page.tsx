import { requireWorkspace } from "@/lib/auth";
import { WorkspaceSettingsForm } from "@/components/dashboard/workspace-settings-form";

export default async function SettingsPage() {
  const { workspace } = await requireWorkspace();

  return (
    <WorkspaceSettingsForm
      workspaceId={workspace.id}
      initialName={workspace.name}
      initialInstitution={workspace.institution_name || ""}
      initialWebsite={workspace.website || ""}
      initialDescription={workspace.brand_description || ""}
      initialBrandColors={workspace.brand_colors || ""}
    />
  );
}
