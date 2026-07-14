import Nav from "@/components/layout/nav";
import Footer from "@/components/layout/footer";
import Hero from "@/components/landing/hero";
import LogosStrip from "@/components/landing/logos-strip";
import HowItWorks from "@/components/landing/how-it-works";
import Integrations from "@/components/landing/integrations";
import Features from "@/components/landing/features";
import Preview from "@/components/landing/preview";
import Pricing from "@/components/landing/pricing";
import FAQ from "@/components/landing/faq";
import WaitlistCta from "@/components/landing/waitlist-cta";
import { TEST_IDS } from "@/lib/testids";

export default function Home() {
  return (
    <>
      <Nav />
      <main
        id="main"
        data-testid={TEST_IDS.landingPage}
        className="relative overflow-hidden"
      >
        <Hero />
        <LogosStrip />
        <HowItWorks />
        <Integrations />
        <Features />
        <Preview />
        <Pricing />
        <FAQ />
        <WaitlistCta />
      </main>
      <Footer />
    </>
  );
}
