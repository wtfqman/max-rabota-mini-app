interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="space-y-2">
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-green">{eyebrow}</p> : null}
      <h1 className="text-3xl font-bold leading-tight text-text-primary">{title}</h1>
      {description ? <p className="text-base leading-6 text-text-secondary">{description}</p> : null}
    </header>
  );
}
