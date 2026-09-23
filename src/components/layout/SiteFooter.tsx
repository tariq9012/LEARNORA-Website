import { Link } from "@tanstack/react-router";
import { Github, Linkedin, Twitter, Youtube } from "lucide-react";
import { Logo } from "@/components/layout/Logo";

const groups = [
  {
    title: "Platform",
    links: [
      { to: "/courses", label: "Courses" },
      { to: "/categories", label: "Categories" },
      { to: "/become-instructor", label: "Become an instructor" },
    ],
  },
  {
    title: "Company",
    links: [
      { to: "/about", label: "About Learnora" },
      { to: "/help", label: "Help center" },
      { to: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/privacy", label: "Privacy policy" },
      { to: "/terms", label: "Terms" },
      { to: "/help", label: "Accessibility" },
    ],
  },
] as const;

const socials = [
  { icon: Twitter, label: "Learnora on X" },
  { icon: Linkedin, label: "Learnora on LinkedIn" },
  { icon: Github, label: "Learnora on GitHub" },
  { icon: Youtube, label: "Learnora on YouTube" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1240px] gap-8 px-6 py-14 md:grid-cols-5">
        <div className="md:col-span-2">
          <Logo withTag={false} />
          <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
            A premium learning platform for people who take their craft seriously.
          </p>
          <div className="mt-5 flex items-center gap-2">
            {socials.map(({ icon: Icon, label }) => (
              <a
                key={label}
                href="#"
                aria-label={label}
                className="grid size-9 place-items-center rounded-md text-muted-foreground ring-1 ring-line transition-colors hover:text-brand-soft hover:ring-brand/40"
              >
                <Icon size={16} />
              </a>
            ))}
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.title}>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{g.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              {g.links.map((l) => (
                <li key={l.label}>
                  <Link to={l.to} className="transition-colors hover:text-cream">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-muted-foreground">
          <span>© 2026 Learnora</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Crafted for the curious</span>
        </div>
      </div>
    </footer>
  );
}
