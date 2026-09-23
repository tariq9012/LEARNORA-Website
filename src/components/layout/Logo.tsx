import { Link } from "@tanstack/react-router";

export function Logo({ withTag = true }: { withTag?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-md bg-brand/15 font-display text-[15px] font-semibold text-brand ring-1 ring-brand/30">
        L
      </span>
      <span className="font-display text-[19px] tracking-tight">Learnora</span>
      {withTag && (
        <span className="ml-1 hidden border-l border-line pl-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground sm:inline">
          Academy
        </span>
      )}
    </Link>
  );
}
