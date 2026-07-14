import { ComingSoon } from "@/components/coming-soon";

export default function ProfilePage() {
  return (
    <ComingSoon
      title="Your profile — the source of truth"
      phase={3}
      description="One structured profile powers every output: resumes, portfolio pages, and your public site. The editor lands next."
      bullets={[
        "Section-based editing with drag reordering and autosave",
        "Draft and publish — experiment freely, ship deliberately",
        "Everything you write here flows into every template",
      ]}
    />
  );
}
