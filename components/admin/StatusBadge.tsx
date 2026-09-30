import { Badge } from "@/components/ui/badge";
import { isStatus, STATUS_LABEL_FA, STATUS_TONE } from "@/lib/status";

/** Farsi status badge. Unknown values (e.g. a typo typed into the sheet) show as-is. */
export function StatusBadge({ status }: { status: string }) {
  if (!isStatus(status)) return <Badge tone="neutral">{status || "—"}</Badge>;
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL_FA[status]}</Badge>;
}
