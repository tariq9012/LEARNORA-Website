export function LegalBody({ sections }: { sections: { title: string; body: string }[] }) {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-14">
      <div className="space-y-10">
        {sections.map((s, i) => (
          <section key={s.title}>
            <p className="font-mono text-[11px] tracking-[0.2em] text-brand-soft">
              {String(i + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-3 font-display text-2xl tracking-tight">{s.title}</h2>
            <p className="mt-3 leading-relaxed text-pretty text-muted-foreground">{s.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
