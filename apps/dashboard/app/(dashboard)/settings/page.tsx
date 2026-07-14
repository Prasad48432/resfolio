import { redirect } from "next/navigation";

/** Settings sections arrive with their phases (billing: 7, sources: 6). */
export default function SettingsPage() {
  redirect("/settings/account");
}
