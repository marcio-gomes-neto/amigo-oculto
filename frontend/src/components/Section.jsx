export function Section({ step, title, subtitle, badge, optional, children }) {
  return (
    <section className="card" aria-labelledby={`step-${step}`}>
      <header className="card-header">
        <span className="step">{step}</span>
        <div className="card-heading">
          <h2 id={`step-${step}`}>
            {title}
            {optional && <span className="optional">opcional</span>}
          </h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {badge !== undefined && <span className="badge">{badge}</span>}
      </header>
      {children}
    </section>
  );
}
