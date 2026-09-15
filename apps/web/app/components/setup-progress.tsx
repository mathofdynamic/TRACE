const steps = ['Your workspace', 'Connect GitHub', 'Choose repository', 'Ready'] as const;

export function SetupProgress({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <nav className="setup-progress" aria-label="TRACE setup progress">
      <ol>
        {steps.map((label, index) => {
          const number = (index + 1) as 1 | 2 | 3 | 4;
          const state = number < current ? 'complete' : number === current ? 'current' : 'upcoming';
          return (
            <li
              key={label}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span aria-hidden="true">{state === 'complete' ? '✓' : number}</span>
              <strong>{label}</strong>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
