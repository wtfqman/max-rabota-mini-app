interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="space-y-1.5">
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-green">{eyebrow}</p> : null}
      <h1 className="text-2xl font-bold leading-tight text-text-primary">{title}</h1>
      {description ? <p className="text-sm leading-5 text-text-secondary">{description}</p> : null}
    </header>
  );
}
