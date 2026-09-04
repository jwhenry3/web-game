import { HoverTooltip } from "./HoverTooltip";
import { statusColor, statusLabel, statusTooltip } from "./statusDisplay";
import type { StatusSnapshot } from "../types";

export function StatusIcons({
  statuses,
  className = "",
}: {
  statuses?: StatusSnapshot[];
  className?: string;
}) {
  if (!statuses?.length) return null;
  return (
    <div className={`status-icons ${className}`.trim()}>
      {statuses.map((s, i) => (
        <HoverTooltip key={`${s.kind}-${i}`} content={statusTooltip(s)}>
          <span className="status-icon" style={{ borderColor: statusColor(s.kind), color: statusColor(s.kind) }}>
            {statusLabel(s.kind)}
          </span>
        </HoverTooltip>
      ))}
    </div>
  );
}
