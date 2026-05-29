import { eventIcon } from "./icons";
import { useSetupStore } from "../store/useSetupStore";

const defaultLogHeight = 260;

export function LoggerPanel({
  source,
  emptyLabel = "quiet for now",
  className = "",
  fill = false,
}: {
  source: "installer" | "launcher" | "all";
  emptyLabel?: string;
  className?: string;
  fill?: boolean;
}) {
  const { events } = useSetupStore();
  const filteredEvents =
    source === "all" ? events : events.filter((event) => event.source === source);

  return (
    <footer
      className={`flex w-full shrink-0 flex-col overflow-hidden rounded-lg border border-[#1e1e21] bg-[#050607] text-xs text-[#949ba4] shadow-2xl shadow-black/40 ${className}`}
      style={fill ? undefined : { height: defaultLogHeight }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3">
          {filteredEvents.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[#71717a]">
              {emptyLabel}
            </div>
          ) : (
            <ul className="grid gap-2">
              {filteredEvents.map((event, index) => (
                <li
                  className={
                    event.level === "error"
                      ? "flex gap-2 text-red-300"
                      : event.level === "warn"
                        ? "flex gap-2 text-amber-300"
                        : "flex gap-2 text-[#dbdee1]"
                  }
                  key={`${event.level}-${index}`}
                >
                  {eventIcon(event.level)}
                  <span className="min-w-0 break-words">[{event.level}] {event.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  );
}
