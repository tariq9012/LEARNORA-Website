import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, MessageSquare, Building2, CheckCircle2 } from "lucide-react";
import { SiteLayout, PageHeader } from "@/components/layout/SiteLayout";
import { Button, Card, FormField, Input, Select, Textarea } from "@/components/ui/kit";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Learnora" },
      { name: "description", content: "Reach the Learnora support, instructor and partnerships teams." },
      { property: "og:title", content: "Contact Learnora" },
      { property: "og:description", content: "Support, instructor and partnership enquiries." },
    ],
  }),
  component: ContactPage,
});

const channels = [
  { icon: MessageSquare, title: "Student support", body: "Enrolments, refunds, certificates and account issues.", detail: "Replies within one working day" },
  { icon: Mail, title: "Instructor team", body: "Course proposals, production help and payouts.", detail: "Replies within two working days" },
  { icon: Building2, title: "Teams and partnerships", body: "Company accounts, licensing and co-branded programmes.", detail: "Replies within three working days" },
];

function ContactPage() {
  const [sent, setSent] = useState(false);

  return (
    <SiteLayout>
      <PageHeader
        eyebrow="Contact"
        title="Talk to the team"
        description="Pick the channel that matches your question — it reaches the right people faster than a general enquiry."
      />

      <section className="mx-auto grid max-w-[1240px] gap-8 px-6 py-14 lg:grid-cols-[1fr_380px]">
        <Card className="p-6 sm:p-8">
          {sent ? (
            <div className="py-10 text-center">
              <CheckCircle2 size={28} className="mx-auto text-good" />
              <h2 className="mt-4 font-display text-2xl tracking-tight">Message received</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Thanks — we have your enquiry and will reply to the address you gave. No message is actually sent in
                this preview build.
              </p>
              <Button variant="outline" className="mt-6" onClick={() => setSent(false)}>
                Send another
              </Button>
            </div>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
            >
              <h2 className="font-display text-2xl tracking-tight">Send a message</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Your name" htmlFor="c-name">
                  <Input id="c-name" required placeholder="Alex Mercer" />
                </FormField>
                <FormField label="Email address" htmlFor="c-email">
                  <Input id="c-email" type="email" required placeholder="you@example.com" />
                </FormField>
              </div>
              <FormField label="Topic" htmlFor="c-topic">
                <Select id="c-topic">
                  <option>Student support</option>
                  <option>Instructor enquiry</option>
                  <option>Teams and partnerships</option>
                  <option>Something else</option>
                </Select>
              </FormField>
              <FormField label="Message" htmlFor="c-body" hint="Include your course name if the question is course-specific.">
                <Textarea id="c-body" required placeholder="How can we help?" />
              </FormField>
              <Button type="submit" size="lg">
                Send message
              </Button>
            </form>
          )}
        </Card>

        <div className="space-y-4">
          {channels.map(({ icon: Icon, title, body, detail }) => (
            <Card key={title} className="p-5">
              <Icon size={18} className="text-brand-soft" />
              <h3 className="mt-3 font-medium">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{detail}</p>
            </Card>
          ))}
        </div>
      </section>
    </SiteLayout>
  );
}
