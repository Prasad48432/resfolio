import { redirect } from "next/navigation";

/**
 * No dashboard-widget home in V1 — the app opens into the profile editor
 * because that *is* the product (docs/architecture/08-dashboard-ux.md).
 */
export default function Home() {
  redirect("/profile");
}
