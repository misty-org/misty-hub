import { useRef, useState, type PointerEvent } from "react";
import { eventIcon } from "./icons";
import { useSetupStore } from "../store/useSetupStore";

const minLogHeight = 132;
const defaultLogHeight = 150;
const maxLogHeight = 360;

export function LoggerPanel() {
  const events = useSetupStore((state) => state.events);
  const [logHeight, setLogHeight] = useState(defaultLogHeight);
  const dragStartRef = useRef<{ y: number; height: number } | null>(null);

  function startLogDrag(event: PointerEvent<HTMLButtonElement>) {
    dragStartRef.current = { y: event.clientY, height: logHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragLog(event: PointerEvent<HTMLButtonElement>) {
    if (!dragStartRef.current) {
      return;
    }

    const delta = dragStartRef.current.y - event.clientY;
    setLogHeight(Math.min(maxLogHeight, Math.max(minLogHeight, dragStartRef.current.height + delta)));
  }

  function endLogDrag() {
    dragStartRef.current = null;
  }

  return (
    <footer
      className="mt-3 flex w-full shrink-0 flex-col overflow-hidden rounded-lg border border-[#1e1e21] bg-[#050607] text-xs text-[#949ba4] shadow-2xl shadow-black/40"
      style={{ height: logHeight }}
    >
      <button
        aria-label="Resize logger"
        className="flex h-7 shrink-0 touch-none items-center justify-center border-b border-[#1e1e21] text-[#71717a] transition hover:text-[#d4d4d8]"
        onPointerCancel={endLogDrag}
        onPointerDown={startLogDrag}
        onPointerMove={dragLog}
        onPointerUp={endLogDrag}
        type="button"
      >
        <span className="h-0.5 w-8 rounded-full bg-current" />
      </button>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3">
          {events.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[#71717a]">
              quiet for now
            </div>
          ) : (
            <ul className="grid gap-2">
              {events.map((event, index) => (
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
