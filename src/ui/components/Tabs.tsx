export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 rounded-2xl bg-neutral-100 p-1 dark:bg-neutral-900"
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={`min-h-12 flex-1 rounded-xl text-lg font-semibold ${
              selected
                ? 'bg-white text-neutral-950 shadow dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-700 dark:text-neutral-300'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
