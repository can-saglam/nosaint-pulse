import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileUp,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Plus,
  Redo2,
  Search,
  Trash2,
  Undo2,
  Workflow,
  X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { type Segment, type SurveyStatus } from "@/data/surveys";
import {
  downloadJSON,
  exportSegment,
  statusMeta,
  validateSurvey,
} from "@/lib/survey-utils";
import { cn } from "@/lib/utils";

const STATUSES: SurveyStatus[] = ["draft", "ready", "live"];

/** Wraps substrings matching `query` in a <mark> tag for search highlighting. */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  // Use a fresh regex (without `g` flag) to avoid lastIndex issues
  const testRegex = new RegExp(`^${escaped}$`, "i");
  return parts.map((part, i) =>
    testRegex.test(part) ? (
      <mark key={i} className="bg-lime/30 rounded-sm">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function SkeletonCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl bg-ink/5 h-[180px]"
        />
      ))}
    </div>
  );
}

export function Landing({
  segments,
  onPick,
  onPreviewSample,
  onOpenCanvas,
  onCreate,
  onDelete,
  onRename,
  onDuplicate,
  onSetStatus,
  onImport,
  onExportAll,
  onReset,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  cloudStatus,
}: {
  segments: Segment[];
  onPick: (s: Segment) => void;
  onPreviewSample: (s: Segment) => void;
  onOpenCanvas: (s: Segment) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (s: Segment, name: string) => void;
  onDuplicate: (id: string) => void;
  onSetStatus: (s: Segment, status: SurveyStatus) => void;
  onImport: (json: string) => { kind: "single" | "backup"; count: number };
  onExportAll: () => void;
  onReset: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  cloudStatus: "off" | "connecting" | "synced" | "error";
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SurveyStatus | "all">("all");
  const [importing, setImporting] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(segments.length > 0);

  useEffect(() => {
    if (segments.length > 0) setHasLoadedOnce(true);
  }, [segments.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return segments.filter((s) => {
      if (filter !== "all" && (s.status ?? "live") !== filter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.definition.toLowerCase().includes(q) ||
        s.goal.toLowerCase().includes(q)
      );
    });
  }, [segments, query, filter]);

  return (
    <div className="min-h-screen bg-canvas">
      {/* App bar */}
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3 sm:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <Logo className="h-4 shrink-0 text-ink" />
            <span className="h-4 w-px bg-ink/15" />
            <span className="text-base font-extrabold tracking-tight text-ink">
              Pulse
            </span>
            <span className="hidden rounded bg-ink/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45 sm:inline">
              Survey tool
            </span>
            <CloudChip status={cloudStatus} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="mr-1 hidden items-center rounded-lg border border-ink/15 sm:flex">
              <IconBtn label="Undo (⌘Z)" disabled={!canUndo} onClick={onUndo}>
                <Undo2 className="h-4 w-4" />
              </IconBtn>
              <span className="h-5 w-px bg-ink/10" />
              <IconBtn label="Redo (⌘⇧Z)" disabled={!canRedo} onClick={onRedo}>
                <Redo2 className="h-4 w-4" />
              </IconBtn>
            </div>
            <button
              onClick={onExportAll}
              title="Download a backup of all surveys"
              aria-label="Back up"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink/20 px-3 py-2 text-sm font-semibold text-ink/75 transition-colors hover:border-ink hover:text-ink sm:px-3.5"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Back up</span>
            </button>
            <button
              onClick={() => setImporting(true)}
              title="Import a survey or restore a backup"
              aria-label="Import"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink/20 px-3 py-2 text-sm font-semibold text-ink/75 transition-colors hover:border-ink hover:text-ink sm:px-3.5"
            >
              <FileUp className="h-4 w-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button
              onClick={onCreate}
              aria-label="New survey"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90 sm:px-4"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New survey</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toolbar: title, search, filter */}
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-7 sm:px-10">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-bold text-ink">
            Surveys{" "}
            <span className="font-medium text-ink/35">{segments.length}</span>
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink/35" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search surveys…"
                aria-label="Search surveys"
                className="h-9 w-full rounded-full border border-ink/15 bg-white pl-8 pr-3 text-sm text-ink placeholder:text-ink/35 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 sm:w-56"
              />
            </div>
            <div className="flex shrink-0 items-center rounded-full border border-ink/15 p-0.5">
              {(["all", ...STATUSES] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold capitalize transition-colors",
                    filter === f
                      ? "bg-ink text-white"
                      : "text-ink/50 hover:text-ink"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!hasLoadedOnce && segments.length === 0 ? (
          <SkeletonCards />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink/15 py-20 text-center text-sm text-ink/45">
            No surveys match.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s, i) => (
              <SegmentCard
                key={s.id}
                segment={s}
                delay={i * 0.03}
                query={query}
                onPick={onPick}
                onPreviewSample={onPreviewSample}
                onOpenCanvas={onOpenCanvas}
                onDelete={onDelete}
                onRename={onRename}
                onDuplicate={onDuplicate}
                onSetStatus={onSetStatus}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-ink/10 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-6 text-xs text-ink/40 sm:flex-row sm:items-center sm:px-10">
          <Logo className="h-3 text-ink/50" />
          <div className="flex flex-wrap items-center gap-4">
            <span>Changes are saved in this browser</span>
            {confirmReset ? (
              <span className="flex items-center gap-2">
                <span className="font-semibold text-ink/70">
                  Reset all surveys to defaults?
                </span>
                <button
                  onClick={() => {
                    onReset();
                    setConfirmReset(false);
                  }}
                  className="font-semibold text-red-600 hover:text-red-700"
                >
                  Reset
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="font-semibold text-ink/50 hover:text-ink"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="font-semibold text-ink/50 underline-offset-2 hover:text-ink hover:underline"
              >
                Reset to defaults
              </button>
            )}
          </div>
        </div>
      </footer>

      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onImport={onImport}
        />
      )}
    </div>
  );
}

function CloudChip({
  status,
}: {
  status: "off" | "connecting" | "synced" | "error";
}) {
  const meta = {
    off: { dot: "bg-ink/30", label: "Local only", title: "Saved in this browser. Add a Firebase config to sync." },
    connecting: { dot: "bg-amber-400 animate-pulse", label: "Connecting…", title: "Connecting to the cloud…" },
    synced: { dot: "bg-lime-dark", label: "Synced", title: "Live-synced to the cloud across devices." },
    error: { dot: "bg-red-500", label: "Offline", title: "Cloud unreachable — changes are saved locally and will resync." },
  }[status];
  return (
    <span
      title={meta.title}
      className="hidden items-center gap-1.5 rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11px] font-semibold text-ink/55 sm:inline-flex"
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center text-ink/70 transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function StatusChip({
  status,
  onCycle,
}: {
  status: SurveyStatus;
  onCycle: (e: React.MouseEvent) => void;
}) {
  const meta = statusMeta[status];
  return (
    <button
      onClick={onCycle}
      title="Click to change status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide transition-transform hover:scale-105",
        meta.chip
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </button>
  );
}

function SegmentCard({
  segment,
  delay,
  query,
  onPick,
  onPreviewSample,
  onOpenCanvas,
  onDelete,
  onRename,
  onDuplicate,
  onSetStatus,
}: {
  segment: Segment;
  delay: number;
  query: string;
  onPick: (s: Segment) => void;
  onPreviewSample: (s: Segment) => void;
  onOpenCanvas: (s: Segment) => void;
  onDelete: (id: string) => void;
  onRename: (s: Segment, name: string) => void;
  onDuplicate: (id: string) => void;
  onSetStatus: (s: Segment, status: SurveyStatus) => void;
}) {
  const accentBar = segment.accent === "lime" ? "bg-lime" : "bg-ink";
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(segment.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const menuOpen = menuRect !== null;
  const status = segment.status ?? "live";

  const issues = useMemo(() => validateSurvey(segment), [segment]);
  const errors = issues.filter((i) => i.level === "error").length;

  const commitName = () => {
    const name = draft.trim();
    if (name && name !== segment.name) onRename(segment, name);
    else setDraft(segment.name);
    setRenaming(false);
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const cycleStatus = (e: React.MouseEvent) => {
    stop(e);
    const idx = STATUSES.indexOf(status);
    onSetStatus(segment, STATUSES[(idx + 1) % STATUSES.length]);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      onClick={() => !renaming && !confirmDelete && !menuOpen && onPick(segment)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !renaming && !confirmDelete) {
          e.preventDefault();
          onPick(segment);
        }
      }}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-ink/10 bg-muted p-6 text-left transition-all duration-200 hover:-translate-y-1 hover:border-ink/25 hover:bg-white hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]"
    >
      <span
        className={cn(
          "absolute left-0 top-0 h-1.5 w-full origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100",
          accentBar
        )}
      />
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-black text-white">
            {segment.index}
          </span>
          <StatusChip status={status} onCycle={cycleStatus} />
        </div>
        <div className="relative flex items-center gap-1">
          <button
            onClick={(e) => {
              stop(e);
              setDraft(segment.name);
              setRenaming(true);
            }}
            className="rounded-md p-1.5 text-ink/35 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all hover:bg-ink/[0.06] hover:text-ink focus:opacity-100"
            aria-label="Rename survey"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              stop(e);
              setMenuRect(
                menuOpen
                  ? null
                  : (e.currentTarget as HTMLElement).getBoundingClientRect()
              );
            }}
            className={cn(
              "rounded-md p-1.5 text-ink/35 transition-all hover:bg-ink/[0.06] hover:text-ink",
              menuOpen ? "bg-ink/[0.06] text-ink opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            )}
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuRect && (
            <CardMenu
              segment={segment}
              status={status}
              anchor={menuRect}
              onClose={() => setMenuRect(null)}
              onPreviewSample={() => onPreviewSample(segment)}
              onDuplicate={() => onDuplicate(segment.id)}
              onSetStatus={(st) => onSetStatus(segment, st)}
              onDelete={() => setConfirmDelete(true)}
            />
          )}
        </div>
      </div>

      {renaming ? (
        <input
          autoFocus
          value={draft}
          onClick={stop}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            stop(e);
            if (e.key === "Enter") commitName();
            if (e.key === "Escape") {
              setDraft(segment.name);
              setRenaming(false);
            }
          }}
          aria-label="Rename survey"
          className="display w-full rounded-lg border-2 border-ink bg-white px-2 py-1 text-2xl font-extrabold text-ink outline-none"
        />
      ) : (
        <h3 className="display text-2xl font-extrabold text-ink">
          {highlightMatch(segment.name, query)}
        </h3>
      )}
      <p className="mt-1.5 text-sm font-medium text-ink/55">{highlightMatch(segment.blurb, query)}</p>

      <div className="mt-5 flex-1 space-y-2.5 text-xs">
        <Row label="Who" value={segment.definition} query={query} />
        <Row label="We want to learn" value={segment.goal} query={query} />
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-ink/[0.07] pt-4">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink/40">
          {segment.questions.length} questions
          {errors > 0 && (
            <span
              title={`${errors} issue${errors > 1 ? "s" : ""} to fix`}
              className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600"
            >
              <AlertTriangle className="h-3 w-3" /> {errors}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => {
              stop(e);
              onOpenCanvas(segment);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-3 py-1.5 text-xs font-semibold text-ink/70 transition-colors hover:border-ink hover:text-ink"
          >
            <Workflow className="h-3.5 w-3.5" /> Flow
          </button>
          <button
            onClick={(e) => {
              stop(e);
              onPick(segment);
            }}
            className="inline-flex items-center rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-ink/90"
          >
            Preview →
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div
          onClick={stop}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-2xl bg-white/95 p-6 text-center backdrop-blur-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <Trash2 className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="display text-lg font-extrabold text-ink">
              Delete "{segment.name}"?
            </p>
            <p className="mt-1 text-sm text-ink/55">You can undo this.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                stop(e);
                onDelete(segment.id);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              <Check className="h-4 w-4" /> Delete
            </button>
            <button
              onClick={(e) => {
                stop(e);
                setConfirmDelete(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function CardMenu({
  segment,
  status,
  anchor,
  onClose,
  onPreviewSample,
  onDuplicate,
  onSetStatus,
  onDelete,
}: {
  segment: Segment;
  status: SurveyStatus;
  anchor: DOMRect;
  onClose: () => void;
  onPreviewSample: () => void;
  onDuplicate: () => void;
  onSetStatus: (s: SurveyStatus) => void;
  onDelete: () => void;
}) {
  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm text-ink/80 transition-colors hover:bg-ink/[0.06] hover:text-ink";
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const MENU_W = Math.min(224, window.innerWidth - 16);
  const MENU_H = 360; // approx; used to decide flip
  const maxLeft = window.innerWidth - MENU_W - 8;
  const left = Math.max(8, Math.min(anchor.right - MENU_W, maxLeft));
  const flipUp = anchor.bottom + MENU_H > window.innerHeight - 8;
  const top = flipUp ? undefined : anchor.bottom + 6;
  const bottom = flipUp ? window.innerHeight - anchor.top + 6 : undefined;

  return createPortal(
    <>
      {/* click-away */}
      <div
        className="fixed inset-0 z-[60]"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ left, top, bottom, width: MENU_W }}
        className="fixed z-[61] max-h-[80vh] overflow-auto rounded-xl border border-ink/10 bg-white p-1.5 shadow-[0_16px_44px_-16px_rgba(0,0,0,0.4)]"
      >
        <button className={item} onClick={act(onPreviewSample)}>
          <PlayCircle className="h-4 w-4 text-ink/50" /> Preview with sample data
        </button>
        <button className={item} onClick={act(onDuplicate)}>
          <Copy className="h-4 w-4 text-ink/50" /> Duplicate
        </button>
        <button
          className={item}
          onClick={act(() => {
            navigator.clipboard?.writeText(exportSegment(segment));
          })}
        >
          <Copy className="h-4 w-4 text-ink/50" /> Copy as JSON
        </button>
        <button
          className={item}
          onClick={act(() => {
            const slug = segment.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            downloadJSON(`${slug || "survey"}.json`, exportSegment(segment));
          })}
        >
          <Download className="h-4 w-4 text-ink/50" /> Download JSON
        </button>

        <div className="my-1 h-px bg-ink/[0.07]" />
        <p className="px-2.5 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-ink/35">
          Status
        </p>
        {STATUSES.map((st) => (
          <button key={st} className={item} onClick={act(() => onSetStatus(st))}>
            <span className={cn("h-2 w-2 rounded-full", statusMeta[st].dot)} />
            <span className="capitalize">{statusMeta[st].label}</span>
            {status === st && <Check className="ml-auto h-3.5 w-3.5 text-ink/50" />}
          </button>
        ))}

        <div className="my-1 h-px bg-ink/[0.07]" />
        <button
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
          onClick={act(onDelete)}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      </div>
    </>,
    document.body
  );
}

function ImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (json: string) => { kind: "single" | "backup"; count: number };
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // peek at the pasted JSON to tailor the button + warning
  const preview = useMemo(() => {
    if (!text.trim()) return null;
    try {
      const raw = JSON.parse(text);
      if (raw && (Array.isArray(raw.surveys) || Array.isArray(raw)))
        return {
          kind: "backup" as const,
          count: (raw.surveys ?? raw).length as number,
        };
      if (raw && Array.isArray(raw.questions)) return { kind: "single" as const, count: 1 };
    } catch {
      /* still typing */
    }
    return null;
  }, [text]);

  const submit = () => {
    try {
      onImport(text);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import that JSON.");
    }
  };

  const handleFile = useCallback((file: File) => {
    file.text().then((t) => {
      setText(t);
      setError(null);
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "w-full max-w-lg rounded-2xl border bg-white p-6 shadow-2xl transition-colors",
          dragging
            ? "border-2 border-dashed border-ink/40 bg-ink/[0.03]"
            : "border border-ink/10"
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Import / restore</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Paste or load a <code>.json</code> file. A single survey is{" "}
          <b>added</b>; a full <b>backup</b> (from "Back up") <b>replaces</b> all
          surveys — undoable with ⌘Z.
        </p>
        {dragging ? (
          <div className="flex h-44 w-full items-center justify-center rounded-xl border-2 border-dashed border-ink/30 bg-ink/[0.03]">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink/50">
              <FileUp className="h-5 w-5" /> Drop JSON file here
            </p>
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder='{ "name": "…", "questions": [ … ] }'
            className="h-32 sm:h-44 w-full resize-none rounded-xl border border-ink/15 bg-white p-3 font-mono text-xs text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
          />
        )}
        {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
        {preview?.kind === "backup" && !error && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Backup with {preview.count}{" "}
            surveys — this replaces everything currently here.
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            handleFile(f);
          }}
        />
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-3.5 py-2 text-sm font-semibold text-ink/75 hover:border-ink hover:text-ink"
          >
            <FileUp className="h-4 w-4" /> Load file
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!text.trim()}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40",
                preview?.kind === "backup"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-ink hover:bg-ink/90"
              )}
            >
              {preview?.kind === "backup" ? "Restore (replace all)" : "Import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, query }: { label: string; value: string; query: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="sm:w-[5.5rem] sm:shrink-0 font-semibold uppercase tracking-wide text-ink/35">
        {label}
      </span>
      <span className="line-clamp-2 text-ink/70">{highlightMatch(value, query)}</span>
    </div>
  );
}
