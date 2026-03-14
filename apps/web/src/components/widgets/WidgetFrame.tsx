import type { ReactNode } from 'react';

export function WidgetFrame(props: {
  title: string;
  eyebrow?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="matrix-panel min-h-[unset]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {props.eyebrow ? (
            <p className="mb-2 text-[0.72rem] uppercase tracking-[0.22em] text-matrix-muted">
              {props.eyebrow}
            </p>
          ) : null}
          <h2 className="matrix-panel-title mb-0">{props.title}</h2>
        </div>
        {props.aside}
      </div>
      {props.children}
    </section>
  );
}

export function WidgetRow(props: {
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-matrix-border/20 py-2 text-[0.8rem] uppercase tracking-[0.08em] last:border-b-0">
      <span className="text-matrix-muted">{props.label}</span>
      <span className={props.tone ?? 'text-matrix-text'}>{props.value}</span>
    </div>
  );
}

export function WidgetBadge(props: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span
      className={`rounded-full border px-2 py-1 text-[0.68rem] uppercase tracking-[0.18em] ${props.tone ?? 'border-matrix-border/50 text-matrix-accent'}`}
    >
      {props.children}
    </span>
  );
}
