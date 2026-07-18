import { FaGithub, FaXTwitter } from "react-icons/fa6";
import ResfolioLogo from "@/components/brand/resfolio-logo";
import { TEST_IDS } from "@/lib/testids";

const productLinks = [
  { label: "How it works", href: "#how" },
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const companyLinks = [
  { label: "Contact", href: "mailto:hi@resfolio.me" },
  { label: "Privacy", href: "#" },
  { label: "Terms", href: "#" },
  { label: "Changelog", href: "#" },
];

export default function Footer() {
  return (
    <footer
      data-testid={TEST_IDS.siteFooter}
      className="relative border-t border-border bg-surface/50 py-14"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <ResfolioLogo size={32} className="text-foreground" />
            <p className="mt-4 max-w-sm text-[14px] text-muted">
              A career OS for people who make things. One profile you own —
              resume, portfolio and API generated from it.
            </p>
          </div>

          <nav aria-label="Product">
            <p className="label-eyebrow">Product</p>
            <ul className="mt-4 space-y-2 text-[14px] text-muted">
              {productLinks.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="transition hover:text-foreground">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Company">
            <p className="label-eyebrow">Company</p>
            <ul className="mt-4 space-y-2 text-[14px] text-muted">
              {companyLinks.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="transition hover:text-foreground">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col justify-between gap-4 border-t border-border pt-6 md:flex-row md:items-center">
          <p className="font-mono text-[12px] text-muted">
            © {new Date().getFullYear()} resfolio — built by humans, for humans.
          </p>
          <div className="flex items-center gap-4 text-muted">
            <a
              href="#"
              aria-label="GitHub"
              className="transition hover:text-foreground"
            >
              <FaGithub size={16} />
            </a>
            <a
              href="#"
              aria-label="Twitter/X"
              className="transition hover:text-foreground"
            >
              <FaXTwitter size={16} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
