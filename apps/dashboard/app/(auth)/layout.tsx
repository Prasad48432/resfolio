"use client";

import Link from "next/link";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@resfolio/ui";
import { useState, useEffect } from "react";
import Autoplay from "embla-carousel-autoplay";
import ResfolioLogo from "@/components/brand/resfolio-logo";
import ResfolioMark from "@/components/brand/resfolio-mark";
import { ArrowRight, Database, FileText, Globe, PenSquare } from "lucide-react";

const testimonials = [
  {
    content:
      "Resfolio replaced my resume, portfolio, and personal website with a single profile. Updating my experience once instantly updates everything.",
    author: "Alex Chen",
    handle: "@alexchen",
    link: "#",
  },
  {
    content:
      "The resume builder feels premium, but the biggest win is never having to keep multiple versions in sync anymore.",
    author: "Priya Sharma",
    handle: "@priyasharma",
    link: "#",
  },
  {
    content:
      "Publishing my portfolio took less than five minutes. I connected my custom domain and had a beautiful personal site without touching any code.",
    author: "Marcus Wilson",
    handle: "@marcuswilson",
    link: "#",
  },
  {
    content:
      "The blog editor is one of the nicest writing experiences I've used. Every article automatically becomes part of my portfolio.",
    author: "Sarah Kim",
    handle: "@sarahkim",
    link: "#",
  },
];

const features = [
  {
    icon: Database,
    label: "One Profile",
    description: "Update once, power everything",
  },
  {
    icon: FileText,
    label: "Resume Builder",
    description: "Professional resumes in minutes",
  },
  {
    icon: Globe,
    label: "Portfolio Website",
    description: "Beautiful portfolios with custom domains",
  },
  {
    icon: PenSquare,
    label: "Built-in Blogging",
    description: "Write articles that integrate with your profile",
  },
];

/** Auth screens: minimal chrome (docs/architecture/08-dashboard-ux.md). */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);
  return (
    <div className="flex min-h-svh w-full bg-background">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] flex-col relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 pixel-grid-bg opacity-30" />
        <div className="absolute inset-0 bg-linear-to-br from-background via-surface to-surface/30" />

        {/* Content */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-12 xl:px-20">
          <div className="w-full">
            {/* Logo */}
            <div className="inline-flex items-center gap-2 mb-12 group">
              <ResfolioMark size={35} />
              <ResfolioLogo size={110} className="translate-y-1.25" />
            </div>

            {/* Tagline */}
            <div className="mb-12">
              <p className="text-2xl xl:text-3xl font-light tracking-tight leading-snug text-foreground/90">
                Build your profile.
                <br />
                Publish everywhere.
              </p>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-sm">
                Maintain a single source of truth that powers your resume,
                portfolio, personal website, and blog—all from one place.
              </p>
            </div>

            {/* Feature Pills */}
            <div className="grid grid-cols-2 gap-2.5 mb-12">
              {features.map((f) => (
                <div
                  key={f.label}
                  className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-background/60"
                >
                  <f.icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-foreground leading-tight">
                      {f.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {f.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Testimonial Carousel */}
            <div className="relative">
              <Carousel
                className="w-full"
                opts={{ loop: true }}
                setApi={setApi}
                plugins={[
                  Autoplay({
                    delay: 6000,
                    stopOnInteraction: true,
                    stopOnMouseEnter: true,
                  }),
                ]}
              >
                <CarouselContent>
                  {testimonials.map((testimonial, index) => (
                    <CarouselItem key={index}>
                      <Link
                        href={testimonial.link}
                        target="_blank"
                        className="block group/testimonial"
                      >
                        <div className="p-5 rounded-xl border border-border/50 bg-background/70 hover:bg-background hover:border-border transition-all duration-300">
                          <blockquote className="text-sm leading-relaxed text-muted-foreground group-hover/testimonial:text-foreground/80 transition-colors mb-4 line-clamp-3">
                            &ldquo;{testimonial.content}&rdquo;
                          </blockquote>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {testimonial.author}
                            </span>
                            <span className="text-xs text-muted-foreground font-pixel">
                              {testimonial.handle}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>

              {/* Indicators */}
              <div className="flex items-center gap-2 mt-5">
                {testimonials.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => api?.scrollTo(index)}
                    className={`h-1 rounded-full transition-all duration-500 ${
                      index === current
                        ? "w-8 bg-foreground"
                        : "w-2 bg-foreground/15 hover:bg-foreground/30"
                    }`}
                    aria-label={`Go to testimonial ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Stats */}
        <div className="relative px-12 xl:px-20 pb-10">
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            {[
              { title: "One", label: "Profile" },
              { title: "Unlimited", label: "Resumes" },
              { title: "Beautiful", label: "Portfolios" },
            ].map((item, i) => (
              <div key={item.label} className="flex items-center gap-1.5">
                {i > 0 && <span className="w-px h-3 bg-border/50 mr-1.5" />}
                <span className="font-pixel">{item.title}</span>
                <ArrowRight size={10} />
                <span className="">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 lg:w-[55%] xl:w-[50%] flex flex-col bg-background lg:border-l lg:border-border/50">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between h-16 border-b border-border/50 px-6">
          <div className="flex items-center gap-1.5">
            <ResfolioMark size={26.25} />
            <ResfolioLogo size={82.5} className="translate-y-0.75" />
          </div>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="font-pixel">Resume</span>
            <span className="w-px h-3 bg-border/50" />
            <span className="font-pixel">Portfolio</span>
            <span className="w-px h-3 bg-border/50" />
            <span className="font-pixel">Blog</span>
          </div>
        </header>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          {children}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-center gap-6 h-12 text-xs text-muted-foreground px-6">
          <span>Build your professional presence</span>
          <span className="w-px h-3 bg-border/30" />
          <Link
            href="/about"
            className="hover:text-foreground transition-colors"
          >
            About
          </Link>
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            Terms
          </Link>
        </footer>
      </div>
    </div>
  );
}
