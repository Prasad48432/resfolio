import FaqAccordion, { type Faq } from "@/components/landing/faq-accordion";
import { TEST_IDS } from "@/lib/testids";

const faqs: Faq[] = [
  {
    q: "How does the single source of truth actually work?",
    a: "You maintain one profile — role, projects, bio, skills. Your portfolio site, your resume PDF, and your JSON API are not copies of it; they are generated from it, on demand. So there is only ever one version of your career to keep accurate, and it is the one you edit.",
  },
  {
    q: "Can I use my own domain?",
    a: "Yes. Every paid plan supports custom domains with automatic HTTPS. Point your DNS once, we handle certificates, redirects, and SEO metadata forever.",
  },
  {
    q: "How does importing from GitHub, Dev.to or Stack Overflow work?",
    a: "No OAuth, no passwords, nothing stored. Every source reads public data, so you give us a username or a feed URL and we fetch your work. We show you what we found, you pick what to keep, and nothing reaches your profile until you click Import. Imported items are then ordinary profile content — edit them, reorder them, delete them.",
  },
  {
    q: "Do I own my content and can I export it?",
    a: "Always. Every profile has a public JSON endpoint (/api/me) and a one-click export as JSON, Markdown or PDF. Delete your account and everything is wiped.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes — Solo is free forever. You get a resfolio.me/handle URL, 2 import sources, one theme, and PDF resume export. Perfect for students, early-career folks and side-projects.",
  },
  {
    q: "When does it launch?",
    a: "We're onboarding builders in waves through Q1. Sign up to reserve your handle and lock in Pro at $8/mo for life.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: f.a,
    },
  })),
};

export default function FAQ() {
  return (
    <section
      id="faq"
      data-testid={TEST_IDS.faqSection}
      className="cv-auto relative border-t border-border py-24 md:py-32"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-4">
          <span className="label-eyebrow">FAQ</span>
          <h2 className="mt-4 font-display text-4xl leading-[1.02] text-foreground md:text-5xl">
            Questions, answered.
          </h2>
          <p className="mt-5 max-w-sm text-[15px] text-muted">
            Still curious? Email{" "}
            <a
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              href="mailto:hi@resfolio.me"
            >
              hi@resfolio.me
            </a>{" "}
            — a human replies.
          </p>
        </div>

        <div className="lg:col-span-8">
          <FaqAccordion faqs={faqs} />
        </div>
      </div>
    </section>
  );
}
