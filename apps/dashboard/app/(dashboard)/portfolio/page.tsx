import { ComingSoon } from "@/components/coming-soon";

export default function PortfolioPage() {
  return (
    <ComingSoon
      title="Portfolio"
      phase={5}
      description="A public portfolio site generated from the same profile — pick a template, theme it, publish to resfolio.me/p/you."
      bullets={[
        "Template gallery with live draft preview",
        "Theme tokens — your site, your palette",
        "Publish updates with one deliberate action",
      ]}
    />
  );
}
