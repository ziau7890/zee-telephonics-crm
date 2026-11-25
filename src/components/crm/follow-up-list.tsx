import Link from "next/link";
import { Check, RotateCcw, X } from "lucide-react";
import { Badge, StatusBadge } from "@/components/crm/ui";
import { formatDateTime } from "@/lib/format";
import { FOLLOW_UP_KIND_LABELS, followUpState, type FollowUpKind, type FollowUpStatus } from "@/lib/crm/leads";
import { setFollowUpStatusAction } from "@/app/crm/(app)/follow-ups/actions";

export interface FollowUpRow {
  id: string;
  title: string;
  kind: FollowUpKind;
  due_at: string;
  status: FollowUpStatus;
  notes: string | null;
  completed_at: string | null;
  assignee: { full_name: string; email: string } | null;
  lead?: { id: string; full_name: string; company: string | null } | null;
  contact?: { id: string; full_name: string; company: string | null } | null;
}

function StatusButton({ id, status, label, icon: Icon }: { id: string; status: FollowUpStatus; label: string; icon: typeof Check }) {
  return (
    <form action={setFollowUpStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-semibold hover:border-accent hover:text-accent-text">
        <Icon className="size-3.5" aria-hidden /> {label}
      </button>
    </form>
  );
}

/** A list of follow-ups with done / cancel / reopen buttons. */
export function FollowUpList({ rows, timeZone, canEdit, showParent = false, empty }: { rows: FollowUpRow[]; timeZone: string; canEdit: boolean; showParent?: boolean; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  const now = new Date();
  return (
    <ul className="divide-y divide-border/70">
      {rows.map((f) => {
        const state = followUpState(f.due_at, f.status, now, timeZone);
        const parent = f.lead ? { href: `/crm/leads/${f.lead.id}`, ...f.lead } : f.contact ? { href: `/crm/contacts/${f.contact.id}`, ...f.contact } : null;
        return (
          <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1 basis-56 space-y-1">
              <p className={state === "done" || state === "cancelled" ? "font-medium text-muted line-through" : "font-medium"}>{f.title}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <Badge tone="navy">{FOLLOW_UP_KIND_LABELS[f.kind]}</Badge>
                <span>{formatDateTime(f.due_at, timeZone, { dateStyle: "medium", timeStyle: "short" })}</span>
                <span>· {f.assignee ? f.assignee.full_name || f.assignee.email : "Unassigned"}</span>
                {showParent && parent ? (
                  <span>
                    ·{" "}
                    <Link href={parent.href} className="font-medium text-accent-text hover:underline">
                      {parent.full_name}
                    </Link>
                    {parent.company ? ` (${parent.company})` : ""}
                  </span>
                ) : null}
              </p>
              {f.notes ? <p className="text-sm whitespace-pre-line text-muted">{f.notes}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={state} />
              {canEdit && f.status === "open" ? (
                <>
                  <StatusButton id={f.id} status="done" label="Done" icon={Check} />
                  <StatusButton id={f.id} status="cancelled" label="Cancel" icon={X} />
                </>
              ) : null}
              {canEdit && f.status !== "open" ? <StatusButton id={f.id} status="open" label="Reopen" icon={RotateCcw} /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export const FOLLOW_UP_SELECT =
  "id, title, kind, due_at, status, notes, completed_at, assignee:profiles!follow_ups_assigned_to_fkey(full_name, email), lead:leads(id, full_name, company), contact:contacts(id, full_name, company)";
