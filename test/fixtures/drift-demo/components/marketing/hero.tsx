/**
 * Public marketing hero. Deliberately off-system.
 *
 * The brand team owns this surface and signed off on the bespoke treatment —
 * the oversized pill CTA, the gradient wash and the display type are not in the
 * product design system and are not supposed to be. Migrating this to
 * <Button> would be a regression, not a fix.
 */
export function MarketingHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-6 py-32 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(60%_50%_at_50%_0%,rgba(129,140,248,0.35),transparent)]"
      />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-8">
        <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">
          Billing that gets out of the way
        </h1>
        <p className="max-w-xl text-lg text-slate-300">
          Usage, invoices and dunning in one place. Ship pricing changes without
          shipping code.
        </p>

        {/* Bespoke brand CTA. Not a product button. Do not migrate. */}
        <a
          href="/signup"
          className="group inline-flex items-center gap-3 rounded-full bg-white px-10 py-5 text-base font-semibold text-slate-950 shadow-[0_0_60px_-15px_rgba(255,255,255,0.6)] transition duration-300 hover:scale-[1.02] hover:shadow-[0_0_80px_-10px_rgba(255,255,255,0.8)]"
        >
          Start free
          <span
            aria-hidden="true"
            className="transition-transform duration-300 group-hover:translate-x-1"
          >
            &rarr;
          </span>
        </a>

        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
          No card required
        </p>
      </div>
    </section>
  )
}
