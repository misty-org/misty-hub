import type { Section, Category } from "./data";

export default function Sidebar({
  sections,
  categories,
  activeId,
  onSelect,
  open,
  onClose,
}: {
  sections: Section[];
  categories: Category[];
  activeId: string;
  onSelect: (id: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const inner = (
    <nav className="flex flex-col gap-6 py-4 px-2">
      {categories.map((cat) => (
        <div key={cat.key}>
          <span className="mb-2 block px-3 text-[13px] font-bold text-white">
            {cat.label}
          </span>
          <div className="flex flex-col gap-0.5">
            {cat.ids.map((id) => {
              const sec = sections.find((s) => s.id === id)!;
              const active = activeId === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    onSelect(id);
                    onClose();
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[15.5px] font-medium transition-colors cursor-pointer ${
                    active
                      ? "bg-primary/10 text-white"
                      : "text-white/82 hover:bg-elevated hover:text-white"
                  }`}
                >
                  {sec.label}
                  {"badge" in sec && sec.badge && (
                    <span className="ml-auto rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                      {sec.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <aside className="hidden h-full overflow-y-auto border-r border-border-subtle lg:block">
        {inner}
      </aside>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <aside className="fixed top-0 left-0 bottom-0 z-50 w-[280px] bg-surface border-r border-border overflow-y-auto">
            {inner}
          </aside>
        </>
      )}
    </>
  );
}
