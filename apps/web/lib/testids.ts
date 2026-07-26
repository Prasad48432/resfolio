/**
 * Central registry of `data-testid` values for the landing page.
 * Keys are camelCase, values are kebab-case `<feature>-<element>`.
 */
export const TEST_IDS = {
  landingPage: "landing-page",
  siteNav: "site-nav",
  navLogo: "nav-logo",
  navLinks: "nav-links",
  navCtaGetStarted: "nav-cta-get-started",
  navMobileToggle: "nav-mobile-toggle",
  navMobilePanel: "nav-mobile-panel",
  heroSection: "hero-section",
  heroEyebrow: "hero-eyebrow",
  heroHeading: "hero-heading",
  heroSubhead: "hero-subhead",
  heroVisual: "hero-visual",
  heroSignalGraph: "hero-signal-graph",
  heroMicrocopy: "hero-microcopy",
  heroCta: "hero-cta",
  logosStrip: "logos-strip",
  howItWorks: "how-it-works",
  integrationsSection: "integrations-section",
  featuresSection: "features-section",
  previewSection: "preview-section",
  portfolioBrowserMock: "portfolio-browser-mock",
  pricingSection: "pricing-section",
  faqSection: "faq-section",
  ctaSection: "cta-section",
  ctaGetStarted: "cta-get-started",
  siteFooter: "site-footer",
} as const;
