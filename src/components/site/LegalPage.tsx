export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: { heading: string; body: string[] }[] }) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-3 text-sm text-muted">Cập nhật lần cuối: {updated}</p>
      <div className="mt-10 space-y-9">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-display text-2xl font-bold">{s.heading}</h2>
            <div className="mt-3 space-y-3 leading-relaxed text-muted">{s.body.map((p) => <p key={p}>{p}</p>)}</div>
          </section>
        ))}
      </div>
    </article>
  );
}
