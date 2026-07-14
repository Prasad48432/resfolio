import { ComingSoon } from "@/components/coming-soon";

export default function DomainsPage() {
  return (
    <ComingSoon
      title="Domains"
      phase={5}
      description="Claim your slug now, upgrade to a subdomain, then bring your own domain."
      bullets={[
        "resfolio.me/p/username at launch",
        "username.resfolio.site subdomains next",
        "Custom domains via CNAME on the paid tier",
      ]}
    />
  );
}
