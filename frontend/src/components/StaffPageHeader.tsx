export function StaffPageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-10 border-b border-black/10 pb-8">
      <p className="text-[10px] uppercase tracking-[0.28em] text-black/45">{eyebrow}</p>
      <h1 className="mt-3 font-display text-5xl uppercase leading-none tracking-tight lg:text-6xl">{title}</h1>
      {description && <p className="mt-4 max-w-2xl text-sm leading-7 text-black/55">{description}</p>}
    </header>
  );
}
