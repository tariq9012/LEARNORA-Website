import { useState } from "react";
import { ChevronDown, PlayCircle, Lock } from "lucide-react";
import { Badge, Card } from "@/components/ui/kit";
import type { CurriculumSectionDTO } from "@/server/dto/course";

export function CourseCurriculum({ sections }: { sections: CurriculumSectionDTO[] }) {
  const [open, setOpen] = useState<string[]>([sections[0]?.id ?? ""]);
  const toggle = (id: string) =>
    setOpen((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const totalLessons = sections.reduce((n, s) => n + s.lessons.length, 0);

  return (
    <div>
      <p className="mb-3 font-mono text-[11px] text-muted-foreground">
        {sections.length} sections · {totalLessons} lessons
      </p>
      <Card className="divide-y divide-line overflow-hidden">
        {sections.map((s) => {
          const expanded = open.includes(s.id);
          return (
            <div key={s.id}>
              <button
                onClick={() => toggle(s.id)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-panel-2/60"
              >
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-brand-soft transition-transform ${expanded ? "" : "-rotate-90"}`}
                />
                <span className="flex-1 font-medium">{s.title}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {s.lessons.length} lessons
                </span>
              </button>
              {expanded && (
                <ul className="border-t border-line bg-ink/30">
                  {s.lessons.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 px-5 py-3 text-sm sm:pl-12">
                      {l.preview ? (
                        <PlayCircle size={15} className="shrink-0 text-brand-soft" />
                      ) : (
                        <Lock size={15} className="shrink-0 text-muted-foreground/60" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{l.title}</span>
                      {l.preview && <Badge tone="soft">Preview</Badge>}
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {l.duration}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
