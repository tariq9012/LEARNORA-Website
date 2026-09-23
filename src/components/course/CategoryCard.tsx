import { Link } from "@tanstack/react-router";
import {
  Code2,
  Terminal,
  LineChart,
  PenTool,
  Briefcase,
  Megaphone,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import type { CategoryDTO } from "@/server/dto/category";

const icons: Record<string, LucideIcon> = {
  Code2,
  Terminal,
  LineChart,
  PenTool,
  Briefcase,
  Megaphone,
  ShieldCheck,
  Smartphone,
};

export function CategoryCard({ category }: { category: CategoryDTO }) {
  const Icon = icons[category.icon] ?? Code2;
  return (
    <Link
      to="/courses"
      search={{ category: category.slug }}
      className="group rounded-xl bg-panel p-5 ring-1 ring-line transition-all duration-200 hover:-translate-y-0.5 hover:ring-brand/40"
    >
      <Icon size={22} className="text-brand-soft" aria-hidden="true" />
      <p className="mt-4 font-medium">{category.name}</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        {category.courseCount} courses
      </p>
      <p className="mt-1 text-xs text-muted-foreground/80">{category.blurb}</p>
    </Link>
  );
}
