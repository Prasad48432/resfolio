"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export type Faq = { q: string; a: string };

export default function FaqAccordion({ faqs }: { faqs: Faq[] }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {faqs.map((f, i) => (
        <AccordionItem
          key={f.q}
          value={`item-${i}`}
          data-testid={`faq-item-${i}`}
        >
          <AccordionTrigger className="py-6 font-display text-xl text-foreground md:text-2xl">
            {f.q}
          </AccordionTrigger>
          <AccordionContent className="pb-6 text-[15px] leading-relaxed text-muted">
            {f.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
