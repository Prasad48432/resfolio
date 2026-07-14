import { ComingSoon } from "@/components/coming-soon";

export default function ResumesPage() {
  return (
    <ComingSoon
      title="Resumes"
      phase={4}
      description="Resume documents rendered from your profile — what you preview is pixel-for-pixel what the PDF exports."
      bullets={[
        "Pick a template, choose sections, set A4 or Letter",
        "Live paginated preview while you edit",
        "ATS-safe PDF export with clickable links",
      ]}
    />
  );
}
