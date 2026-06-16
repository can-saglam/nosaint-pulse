import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CornerDownRight,
  Gift,
  GripHorizontal,
  Maximize2,
  Minus,
  Pencil,
  Play,
  PlayCircle,
  Plus,
  Redo2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BRANCH_END,
  type Question,
  type QuestionType,
  type Segment,
  type SurveyStatus,
} from "@/data/surveys";
import {
  duplicateQuestion,
  questionTemplates,
  sampleAnswers,
  simulateResponses,
  statusMeta,
  validateSurvey,
  type Issue,
  type SimResult,
} from "@/lib/survey-utils";
import { cn } from "@/lib/utils";

const STATUSES: SurveyStatus[] = ["draft", "ready", "live"];

const NODE_W = 268;
const NODE_H = 192;
const GAP_X = 92;
const MID_Y = 60;
const BRANCH_DY = NODE_H + 52;
const BRANCH_W = 224;
const SVG_OFF = 1400; // SVG canvas padding so negative-dragged nodes' edges aren't clipped

const TYPE_LABEL: Record<QuestionType, string> = {
  single: "Single select",
  multi: "Multi select",
  text: "Free text",
  rating: "Star rating",
  scale: "Scale 1–10",
  nps: "NPS 0–10",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const isOther = (o: string) => /^other/i.test(o.trim());

type Pt = { x: number; y: number };

export function FlowCanvas({
  segment,
  onUpdateSegment,
  onBack,
  onDelete,
  onOpenRunner,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  segment: Segment;
  onUpdateSegment: (s: Segment) => void;
  onBack: () => void;
  onDelete: () => void;
  onOpenRunner: (
    step: number,
    editing: boolean,
    answers?: Record<string, string | string[] | number>
  ) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const questions = segment.questions;
  const [tx, setTx] = useState(48);
  const [ty, setTy] = useState(200);
  const [scale, setScale] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const [panel, setPanel] = useState<null | "checks" | "simulate" | "welcome">(
    null
  );
  const [addOpen, setAddOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(
    null
  );

  const issues = useMemo(() => validateSurvey(segment), [segment]);
  const errorCount = issues.filter((i) => i.level === "error").length;
  const wrapRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null
  );
  const drag = useRef<{
    id: string;
    index: number;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    lx: number;
    ly: number;
    moved: boolean;
  } | null>(null);

  // ---- positions ----
  const autoX = (i: number) => (i + 1) * (NODE_W + GAP_X);
  const posOf = (q: Question, i: number): Pt => {
    if (live && live.id === q.id) return { x: live.x, y: live.y };
    if (q.x != null && q.y != null) return { x: q.x, y: q.y };
    return { x: autoX(i), y: MID_Y };
  };
  const qPos = questions.map(posOf);
  const startPos: Pt = { x: 0, y: MID_Y };
  const maxQX = qPos.length ? Math.max(...qPos.map((p) => p.x)) : 0;
  const endPos: Pt = {
    x: Math.max((questions.length + 1) * (NODE_W + GAP_X), maxQX + NODE_W + GAP_X),
    y: MID_Y,
  };

  const idIndex = new Map(questions.map((q, i) => [q.id, i]));
  const ptOfTarget = (target: string): Pt =>
    target === BRANCH_END ? endPos : qPos[idIndex.get(target) ?? 0] ?? endPos;

  // world bounds
  const allPts = [startPos, endPos, ...qPos];
  const minX = Math.min(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxX = Math.max(...allPts.map((p) => p.x)) + NODE_W;
  const maxY = Math.max(...allPts.map((p) => p.y)) + NODE_H + BRANCH_DY;
  const worldW = maxX - Math.min(0, minX) + 200;
  const worldH = maxY - Math.min(0, minY) + 200;

  // Escape closes any open panel / dropdown
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPanel(null);
      setShowDetails(false);
      setAddOpen(false);
      setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- wheel zoom (native, non-passive) ----
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // ctrl/⌘ + wheel (pinch) zooms harder; trackpad/mouse wheel a touch faster
      const intensity = e.ctrlKey || e.metaKey ? 0.012 : 0.004;
      const next = clamp(scale * (1 - e.deltaY * intensity), 0.3, 2.4);
      const k = next / scale;
      setTx(cx - (cx - tx) * k);
      setTy(cy - (cy - ty) * k);
      setScale(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scale, tx, ty]);

  // ---- keyboard zoom shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(1.4);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomBy(1 / 1.4);
      } else if (e.key === "0" || e.key === "f" || e.key === "F") {
        e.preventDefault();
        fitView();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, tx, ty]);

  // ---- auto-fit the flow into view when a survey is opened ----
  useEffect(() => {
    // next frame, so the wrapper has its measured size
    const raf = requestAnimationFrame(fitView);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment.id]);

  // ---- background pan ----
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    pan.current = { x: e.clientX, y: e.clientY, tx, ty };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pan.current) return;
    setTx(pan.current.tx + (e.clientX - pan.current.x));
    setTy(pan.current.ty + (e.clientY - pan.current.y));
  };
  const onPointerUp = () => {
    pan.current = null;
  };

  // ---- node drag ----
  const onNodeDown = (e: React.PointerEvent, q: Question, i: number) => {
    e.stopPropagation();
    const p = posOf(q, i);
    drag.current = {
      id: q.id,
      index: i,
      sx: e.clientX,
      sy: e.clientY,
      ox: p.x,
      oy: p.y,
      lx: p.x,
      ly: p.y,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onNodeMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
    if (d.moved) {
      d.lx = d.ox + dx;
      d.ly = d.oy + dy;
      setLive({ id: d.id, x: d.lx, y: d.ly });
    }
  };
  const onNodeUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      // drag-to-reorder: the dropped node takes the sequence slot matching its
      // horizontal position among the others; it keeps its dropped coordinates.
      const draggedCx = d.lx + NODE_W / 2;
      let newIndex = 0;
      questions.forEach((q, i) => {
        if (q.id === d.id) return;
        if (posOf(q, i).x + NODE_W / 2 < draggedCx) newIndex++;
      });
      const without = questions.filter((q) => q.id !== d.id);
      const moved = { ...questions[d.index], x: d.lx, y: d.ly };
      without.splice(newIndex, 0, moved);
      onUpdateSegment({ ...segment, questions: without });
    } else {
      onOpenRunner(d.index, true);
    }
    setLive(null);
  };

  // ---- zoom controls ----
  const zoomBy = (factor: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    const next = clamp(scale * factor, 0.3, 2.4);
    const k = next / scale;
    setTx(cx - (cx - tx) * k);
    setTy(cy - (cy - ty) * k);
    setScale(next);
  };
  // frame the whole flow within the viewport
  const fitView = () => {
    const el = wrapRef.current;
    if (!el) return;
    const pad = 72;
    const xs = [startPos.x, endPos.x, ...qPos.map((p) => p.x)];
    const ys = [startPos.y, endPos.y, ...qPos.map((p) => p.y)];
    const bMinX = Math.min(...xs);
    const bMinY = Math.min(...ys);
    const bMaxX = Math.max(...xs) + NODE_W;
    const anyBranch = questions.some(
      (q) =>
        (q.type === "single" || q.type === "multi") &&
        (q.options ?? []).some(isOther)
    );
    const bMaxY = Math.max(...ys) + NODE_H + (anyBranch ? BRANCH_DY - NODE_H + 104 : 0);
    const bw = Math.max(1, bMaxX - bMinX);
    const bh = Math.max(1, bMaxY - bMinY);
    const s = clamp(
      Math.min((el.clientWidth - pad * 2) / bw, (el.clientHeight - pad * 2) / bh),
      0.35,
      1.1
    );
    setScale(s);
    setTx((el.clientWidth - bw * s) / 2 - bMinX * s);
    setTy((el.clientHeight - bh * s) / 2 - bMinY * s);
  };
  const resetView = fitView;

  // ---- mutators ----
  const makeQuestion = questionTemplates[0].make;
  const addTemplate = (make: () => Question) =>
    onUpdateSegment({ ...segment, questions: [...questions, make()] });
  // inject a new question at a given index (0 = before the first)
  const insertAt = (index: number, make: () => Question = makeQuestion) => {
    const qs = [...questions];
    qs.splice(index, 0, make());
    onUpdateSegment({ ...segment, questions: qs });
  };
  const duplicateAt = (index: number) => {
    const qs = [...questions];
    qs.splice(index + 1, 0, duplicateQuestion(questions[index]));
    onUpdateSegment({ ...segment, questions: qs });
  };
  const deleteAt = (index: number) => {
    const removedId = questions[index]?.id;
    const qs = questions
      .filter((_, i) => i !== index)
      // drop any skip-logic that pointed at the deleted question
      .map((q) => {
        if (!q.branches || !removedId) return q;
        const entries = Object.entries(q.branches).filter(
          ([, target]) => target !== removedId
        );
        return { ...q, branches: entries.length ? Object.fromEntries(entries) : undefined };
      });
    onUpdateSegment({ ...segment, questions: qs });
  };
  // reorder: swap a question with its neighbour (position travels with the node)
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= questions.length) return;
    const qs = [...questions];
    [qs[index], qs[j]] = [qs[j], qs[index]];
    onUpdateSegment({ ...segment, questions: qs });
  };
  const patchSeg = (p: Partial<Segment>) =>
    onUpdateSegment({ ...segment, ...p });

  // midpoints of the sequential edges, for the "+" insert affordances
  const insertPoints: { x: number; y: number; index: number }[] = [];
  {
    const firstTarget = questions.length ? qPos[0] : endPos;
    insertPoints.push({
      x: (startPos.x + NODE_W + firstTarget.x) / 2,
      y: (startPos.y + firstTarget.y) / 2 + NODE_H / 2,
      index: 0,
    });
    for (let i = 0; i < questions.length; i++) {
      const a = qPos[i];
      const b = i < questions.length - 1 ? qPos[i + 1] : endPos;
      insertPoints.push({
        x: (a.x + NODE_W + b.x) / 2,
        y: (a.y + b.y) / 2 + NODE_H / 2,
        index: i + 1,
      });
    }
  }

  // ---- connector path helpers (curved) ----
  const edge = (a: Pt, b: Pt, fromSide: "right" | "bottom") => {
    if (fromSide === "right") {
      const ax = a.x + NODE_W;
      const ay = a.y + NODE_H / 2;
      const bx = b.x;
      const by = b.y + NODE_H / 2;
      const mx = ax + (bx - ax) / 2;
      return `M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`;
    }
    // bottom -> top (routing branch)
    const ax = a.x + NODE_W / 2;
    const ay = a.y + NODE_H;
    const bx = b.x + NODE_W / 2;
    const by = b.y;
    const my = ay + (by - ay) / 2;
    return `M ${ax} ${ay} C ${ax} ${my}, ${bx} ${my}, ${bx} ${by}`;
  };

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* Toolbar */}
      <header className="z-20 flex items-center justify-between gap-3 border-b border-ink/10 bg-canvas px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">All surveys</span>
          </Button>
          <div className="flex min-w-0 flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink/40">
              Flow · birds-eye
            </span>
            <div className="group flex min-w-0 items-center gap-1.5">
              <input
                value={segment.name}
                onChange={(e) => patchSeg({ name: e.target.value })}
                aria-label="Survey name"
                spellCheck={false}
                className="min-w-0 max-w-[42vw] truncate rounded border-b border-dashed border-ink/25 bg-transparent text-base font-bold text-ink outline-none transition-colors hover:border-ink focus:border-solid focus:border-ink"
              />
              <Pencil className="h-3 w-3 shrink-0 text-ink/30 group-hover:text-ink/60" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="mr-0.5 flex items-center rounded-lg border border-ink/15">
            <button
              title="Undo (⌘Z)"
              disabled={!canUndo}
              onClick={onUndo}
              className="flex h-8 w-8 items-center justify-center text-ink/70 hover:bg-ink/[0.06] hover:text-ink disabled:opacity-30"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <span className="h-5 w-px bg-ink/10" />
            <button
              title="Redo (⌘⇧Z)"
              disabled={!canRedo}
              onClick={onRedo}
              className="flex h-8 w-8 items-center justify-center text-ink/70 hover:bg-ink/[0.06] hover:text-ink disabled:opacity-30"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

          {/* Checks */}
          <Button
            variant={panel === "checks" ? "lime" : "outline"}
            size="sm"
            onClick={() => {
              setShowDetails(false);
              setPanel(panel === "checks" ? null : "checks");
            }}
          >
            {errorCount > 0 ? (
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              Checks
              {issues.length > 0 && (
                <span className="ml-1 tabular-nums">{issues.length}</span>
              )}
            </span>
          </Button>

          <Button
            variant={panel === "simulate" ? "lime" : "outline"}
            size="sm"
            onClick={() => {
              setShowDetails(false);
              setPanel(panel === "simulate" ? null : "simulate");
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Simulate</span>
          </Button>

          <Button
            variant={showDetails ? "lime" : "outline"}
            size="sm"
            onClick={() => {
              setPanel(null);
              setShowDetails((v) => !v);
            }}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Details</span>
          </Button>

          {/* Add question (with templates) */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddOpen((o) => !o)}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
            {addOpen && (
              <Menu onClose={() => setAddOpen(false)}>
                <p className="px-2.5 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-ink/35">
                  Add from template
                </p>
                {questionTemplates.map((t) => (
                  <MenuItem
                    key={t.key}
                    onClick={() => {
                      addTemplate(t.make);
                      setAddOpen(false);
                    }}
                  >
                    {t.label}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </div>

          {/* Preview (with sample data) */}
          <div className="relative flex items-center">
            <button
              onClick={() => onOpenRunner(0, false)}
              className="inline-flex h-9 items-center gap-2 rounded-l-full bg-lime pl-4 pr-3 text-sm font-semibold text-ink transition-colors hover:bg-lime-dark"
            >
              <Play className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Preview</span>
            </button>
            <button
              onClick={() => setPreviewOpen((o) => !o)}
              aria-label="Preview options"
              className="inline-flex h-9 items-center rounded-r-full border-l border-ink/15 bg-lime pl-2 pr-3 text-ink transition-colors hover:bg-lime-dark"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {previewOpen && (
              <Menu onClose={() => setPreviewOpen(false)} align="right">
                <MenuItem
                  onClick={() => {
                    onOpenRunner(0, false);
                    setPreviewOpen(false);
                  }}
                >
                  <Play className="h-3.5 w-3.5 text-ink/50" /> Empty
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    onOpenRunner(0, false, sampleAnswers(segment));
                    setPreviewOpen(false);
                  }}
                >
                  <PlayCircle className="h-3.5 w-3.5 text-ink/50" /> With sample data
                </MenuItem>
              </Menu>
            )}
          </div>
        </div>
      </header>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={wrapRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(34,34,34,0.10) 1px, transparent 1px)",
            backgroundSize: `${24 * scale}px ${24 * scale}px`,
            backgroundPosition: `${tx}px ${ty}px`,
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              width: worldW,
              height: worldH,
            }}
          >
            {/* connectors */}
            <svg
              className="pointer-events-none absolute"
              style={{ left: -SVG_OFF, top: -SVG_OFF }}
              width={worldW + SVG_OFF * 2}
              height={worldH + SVG_OFF * 2}
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="#222222" />
                </marker>
              </defs>
              <g transform={`translate(${SVG_OFF}, ${SVG_OFF})`}>
                {/* start -> first (or end) */}
                <path
                  d={edge(startPos, questions.length ? qPos[0] : endPos, "right")}
                  stroke="#222222"
                  strokeWidth={2}
                  fill="none"
                  markerEnd="url(#arrow)"
                />
                {questions.map((q, i) => {
                  const here = qPos[i];
                  const next = i < questions.length - 1 ? qPos[i + 1] : endPos;
                  const hasOther =
                    (q.type === "single" || q.type === "multi") &&
                    (q.options ?? []).some(isOther);
                  return (
                    <g key={`edge-${q.id}`}>
                      <path
                        d={edge(here, next, "right")}
                        stroke="#222222"
                        strokeWidth={2}
                        fill="none"
                        markerEnd="url(#arrow)"
                      />
                      {/* per-option routing edges */}
                      {q.type === "single" &&
                        Object.entries(q.branches ?? {}).map(([opt, target]) => {
                          const tp = ptOfTarget(target);
                          return (
                            <path
                              key={`b-${q.id}-${opt}`}
                              d={edge(here, tp, "bottom")}
                              stroke="#222222"
                              strokeOpacity={0.4}
                              strokeWidth={1.75}
                              strokeDasharray="6 5"
                              fill="none"
                              markerEnd="url(#arrow)"
                            />
                          );
                        })}
                      {/* Other -> free text conditional */}
                      {hasOther && (
                        <path
                          d={`M ${here.x + NODE_W / 2} ${here.y + NODE_H} C ${
                            here.x + NODE_W / 2
                          } ${here.y + NODE_H + 30}, ${here.x + NODE_W / 2} ${
                            here.y + BRANCH_DY - 30
                          }, ${here.x + NODE_W / 2} ${here.y + BRANCH_DY}`}
                          stroke="#C2D300"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          fill="none"
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* routing labels */}
            {questions.map((q, i) =>
              q.type === "single"
                ? Object.entries(q.branches ?? {}).map(([opt, target]) => {
                    const a = qPos[i];
                    const b = ptOfTarget(target);
                    const lx = (a.x + NODE_W / 2 + b.x + NODE_W / 2) / 2 - 60;
                    const ly = (a.y + NODE_H + b.y) / 2 - 10;
                    return (
                      <div
                        key={`lbl-${q.id}-${opt}`}
                        className="pointer-events-none absolute max-w-[120px] truncate rounded-full border border-ink/15 bg-white px-2 py-0.5 text-[10px] font-semibold text-ink/70 shadow-sm"
                        style={{ left: lx, top: ly }}
                      >
                        {target === BRANCH_END ? "End" : "if"} “{opt}”
                      </div>
                    );
                  })
                : null
            )}

            {/* Start node — click to edit the welcome copy */}
            <Bookend
              kind="start"
              pos={startPos}
              label="Welcome"
              sub={segment.welcome?.title ?? segment.name}
              onClick={() => {
                setShowDetails(false);
                setPanel("welcome");
              }}
            />

            {/* Question nodes + Other branch */}
            {questions.map((q, i) => {
              const p = qPos[i];
              const hasOther =
                (q.type === "single" || q.type === "multi") &&
                (q.options ?? []).some(isOther);
              return (
                <div key={q.id}>
                  <QuestionNode
                    q={q}
                    index={i}
                    pos={p}
                    dragging={live?.id === q.id}
                    canLeft={i > 0}
                    canRight={i < questions.length - 1}
                    onMove={(dir) => move(i, dir)}
                    onDuplicate={() => duplicateAt(i)}
                    onDelete={() => deleteAt(i)}
                    onPointerDown={(e) => onNodeDown(e, q, i)}
                    onPointerMove={onNodeMove}
                    onPointerUp={onNodeUp}
                  />
                  {hasOther && (
                    <BranchNode
                      x={p.x + (NODE_W - BRANCH_W) / 2}
                      y={p.y + BRANCH_DY}
                    />
                  )}
                </div>
              );
            })}

            {/* End node */}
            <Bookend
              kind="end"
              pos={endPos}
              label="Complete"
              sub="Free pod pack reward"
              onClick={() => onOpenRunner(Math.max(0, questions.length - 1), false)}
            />

            {/* Insert-between affordances on each sequential edge */}
            {insertPoints.map((ip) => (
              <button
                key={`ins-${ip.index}`}
                data-node
                title="Insert a question here"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  insertAt(ip.index);
                }}
                style={{ left: ip.x - 14, top: ip.y - 14 }}
                className="absolute flex h-7 w-7 items-center justify-center rounded-full border border-ink/15 bg-white text-ink/50 shadow-[0_2px_6px_rgba(0,0,0,0.12)] ring-2 ring-canvas transition-all duration-150 hover:scale-[1.18] hover:border-ink hover:bg-lime hover:text-ink hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            ))}
          </div>
        </div>

        {/* Details / meta panel */}
        {showDetails && (
          <DetailsPanel
            segment={segment}
            onChange={patchSeg}
            onClose={() => setShowDetails(false)}
            onDelete={onDelete}
          />
        )}

        {panel === "welcome" && (
          <WelcomePanel
            segment={segment}
            onChange={patchSeg}
            onClose={() => setPanel(null)}
            onPreview={() => {
              setPanel(null);
              onOpenRunner(0, false);
            }}
          />
        )}

        {panel === "checks" && (
          <ChecksPanel
            issues={issues}
            onClose={() => setPanel(null)}
            onGoto={(i) => onOpenRunner(i, true)}
          />
        )}

        {panel === "simulate" && (
          <SimulatePanel segment={segment} onClose={() => setPanel(null)} />
        )}

        {/* Zoom controls */}
        <div className="absolute bottom-5 right-5 flex flex-col items-center gap-1 rounded-xl border border-ink/10 bg-canvas/90 p-1.5 shadow-sm backdrop-blur">
          <button
            onClick={() => zoomBy(1.4)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-ink/[0.06]"
            aria-label="Zoom in"
            title="Zoom in ( + )"
          >
            <Plus className="h-4 w-4" />
          </button>
          <span className="select-none text-[10px] font-semibold tabular-nums text-ink/45">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => zoomBy(1 / 1.4)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-ink/[0.06]"
            aria-label="Zoom out"
            title="Zoom out ( - )"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="my-0.5 h-px w-5 bg-ink/10" />
          <button
            onClick={resetView}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-ink/[0.06]"
            aria-label="Fit to view"
            title="Fit to view ( F )"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        {/* Hint */}
        <div className="pointer-events-none absolute bottom-5 left-5 hidden text-xs text-ink/40 sm:block">
          Click to edit · ◀ ▶ reorder · + insert between · drag to reposition ·
          scroll or <kbd className="font-sans">+</kbd>/<kbd className="font-sans">−</kbd>/<kbd className="font-sans">F</kbd> to zoom
        </div>
      </div>
    </div>
  );
}

function Bookend({
  kind,
  pos,
  label,
  sub,
  onClick,
}: {
  kind: "start" | "end";
  pos: Pt;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      data-node
      onClick={onClick}
      style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
      className="absolute flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-ink bg-ink p-5 text-center text-white transition-transform hover:-translate-y-0.5"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lime text-ink">
        {kind === "start" ? (
          <Play className="h-5 w-5" />
        ) : (
          <Gift className="h-5 w-5" />
        )}
      </span>
      <div>
        <p className="text-lg font-extrabold">{label}</p>
        <p className="mt-0.5 text-xs text-white/60">{sub}</p>
      </div>
    </button>
  );
}

function QuestionNode({
  q,
  index,
  pos,
  dragging,
  canLeft,
  canRight,
  onMove,
  onDuplicate,
  onDelete,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  q: Question;
  index: number;
  pos: Pt;
  dragging: boolean;
  canLeft: boolean;
  canRight: boolean;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();
  return (
    <div
      data-node
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title={q.title}
      style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
      className={cn(
        "group absolute flex cursor-grab touch-none select-none flex-col gap-2 overflow-hidden rounded-2xl border-2 bg-white p-4 text-left transition-shadow active:cursor-grabbing",
        dragging
          ? "border-ink shadow-[0_18px_44px_-12px_rgba(0,0,0,0.35)]"
          : "border-ink/15 hover:border-ink hover:shadow-[0_12px_30px_-12px_rgba(0,0,0,0.25)]"
      )}
    >
      {/* drag affordance */}
      <GripHorizontal
        className={cn(
          "absolute left-1/2 top-1 h-4 w-4 -translate-x-1/2 text-ink/25 transition-opacity",
          dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      />
      <div className="flex shrink-0 items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink/45">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-white">
            {index + 1}
          </span>
          {TYPE_LABEL[q.type]}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onPointerDown={stop}
            onClick={(e) => {
              stop(e);
              onMove(-1);
            }}
            disabled={!canLeft}
            title="Move earlier"
            aria-label="Move earlier"
            className="rounded p-0.5 text-ink/40 opacity-0 transition-all hover:bg-ink/[0.06] hover:text-ink disabled:opacity-0 group-hover:opacity-100 group-hover:disabled:opacity-20"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onPointerDown={stop}
            onClick={(e) => {
              stop(e);
              onMove(1);
            }}
            disabled={!canRight}
            title="Move later"
            aria-label="Move later"
            className="rounded p-0.5 text-ink/40 opacity-0 transition-all hover:bg-ink/[0.06] hover:text-ink disabled:opacity-0 group-hover:opacity-100 group-hover:disabled:opacity-20"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            onPointerDown={stop}
            onClick={(e) => {
              stop(e);
              onDuplicate();
            }}
            title="Duplicate question"
            aria-label="Duplicate question"
            className="rounded p-0.5 text-ink/40 opacity-0 transition-all hover:bg-ink/[0.06] hover:text-ink group-hover:opacity-100"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onPointerDown={stop}
            onClick={(e) => {
              stop(e);
              onDelete();
            }}
            title="Delete question"
            aria-label="Delete question"
            className="rounded p-0.5 text-ink/40 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <Pencil className="ml-0.5 h-3.5 w-3.5 text-ink/25 transition-colors group-hover:text-ink" />
        </div>
      </div>
      <p className="line-clamp-2 shrink-0 text-sm font-bold leading-snug text-ink">
        {q.title}
        {q.optional && (
          <span className="ml-1 font-medium text-ink/40">(optional)</span>
        )}
      </p>
      <div className="min-h-0 flex-1 overflow-hidden">
        <NodeBody q={q} />
      </div>
    </div>
  );
}

function NodeBody({ q }: { q: Question }) {
  if (q.type === "text") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-ink/25 px-2.5 py-2 text-xs text-ink/45">
        <Type className="h-3.5 w-3.5" /> Open text response
      </div>
    );
  }
  if (q.type === "rating") {
    return (
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star
            key={i}
            className="h-4 w-4 fill-lime stroke-ink"
            strokeWidth={1.5}
          />
        ))}
      </div>
    );
  }
  if (q.type === "scale" || q.type === "nps") {
    const from = q.type === "nps" ? 0 : 1;
    return (
      <div className="flex items-center gap-1">
        {[from, from + 1, "…", 9, 10].map((n, i) => (
          <span
            key={i}
            className="flex h-5 min-w-5 items-center justify-center rounded border border-ink/15 px-1 text-[10px] font-semibold text-ink/60"
          >
            {n}
          </span>
        ))}
      </div>
    );
  }
  const opts = q.options ?? [];
  const shown = opts.slice(0, 2);
  return (
    <div className="flex flex-col gap-1">
      {shown.map((o, i) => (
        <span
          key={i}
          className={cn(
            "flex items-center justify-between gap-1 truncate rounded-md px-2 py-1 text-[11px] font-medium",
            isOther(o) ? "bg-lime/30 text-ink" : "bg-ink/[0.05] text-ink/70"
          )}
        >
          <span className="truncate">{o}</span>
          {q.branches?.[o] && (
            <CornerDownRight className="h-3 w-3 shrink-0 text-ink/40" />
          )}
        </span>
      ))}
      {opts.length > shown.length && (
        <span className="px-2 text-[11px] font-medium text-ink/40">
          +{opts.length - shown.length} more
        </span>
      )}
    </div>
  );
}

function BranchNode({ x, y }: { x: number; y: number }) {
  return (
    <div
      data-node
      style={{ left: x, top: y, width: BRANCH_W }}
      className="absolute rounded-xl border-2 border-dashed border-lime-dark bg-lime/[0.12] p-3"
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink/55">
        <CornerDownRight className="h-3.5 w-3.5" /> Conditional
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Type className="h-3.5 w-3.5" /> “Other” → free text
      </p>
      <p className="mt-0.5 text-xs text-ink/50">
        Shown only if respondent picks Other.
      </p>
    </div>
  );
}

function WelcomePanel({
  segment,
  onChange,
  onClose,
  onPreview,
}: {
  segment: Segment;
  onChange: (p: Partial<Segment>) => void;
  onClose: () => void;
  onPreview: () => void;
}) {
  const set = (patch: Partial<NonNullable<Segment["welcome"]>>) =>
    onChange({
      welcome: {
        title: segment.welcome?.title ?? "",
        body: segment.welcome?.body ?? "",
        ...patch,
      },
    });
  return (
    <div className="absolute right-4 top-4 z-30 w-[340px] max-w-[calc(100%-2rem)] rounded-2xl border border-ink/10 bg-white p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <Play className="h-4 w-4" /> Welcome screen
        </p>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        The contextual intro shown before the first question.
      </p>

      <MetaField label="Headline">
        <input
          value={segment.welcome?.title ?? ""}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="e.g. How was your first NO SAINT?"
          className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm font-semibold text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
        />
      </MetaField>
      <MetaField label="Message">
        <textarea
          value={segment.welcome?.body ?? ""}
          onChange={(e) => set({ body: e.target.value })}
          rows={4}
          placeholder="A line or two of context…"
          className="w-full resize-none rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
        />
      </MetaField>

      {/* live preview */}
      <div className="mt-1 rounded-xl border border-ink/10 bg-canvas p-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-lime">
          <span className="h-1 w-1 rounded-full bg-lime" />
          {segment.name}
        </span>
        <p className="display mt-2 text-xl font-black leading-tight text-ink">
          {segment.welcome?.title || "Got a minute?"}
        </p>
        {segment.welcome?.body && (
          <p className="mt-1.5 text-xs text-ink/60">{segment.welcome.body}</p>
        )}
      </div>

      <button
        onClick={onPreview}
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-lime text-sm font-semibold text-ink transition-colors hover:bg-lime-dark"
      >
        <Play className="h-4 w-4" /> Preview the survey
      </button>
    </div>
  );
}

function DetailsPanel({
  segment,
  onChange,
  onClose,
  onDelete,
}: {
  segment: Segment;
  onChange: (p: Partial<Segment>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="absolute right-4 top-4 z-30 w-[330px] max-w-[calc(100%-2rem)] rounded-2xl border border-ink/10 bg-white p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)]">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Survey details</p>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <MetaField label="Status">
        <div className="flex gap-2">
          {STATUSES.map((st) => {
            const active = (segment.status ?? "live") === st;
            return (
              <button
                key={st}
                onClick={() => onChange({ status: st })}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-2 text-xs font-semibold capitalize transition-colors",
                  active ? "border-ink" : "border-ink/15 text-ink/55 hover:border-ink/40"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", statusMeta[st].dot)} />
                {statusMeta[st].label}
              </button>
            );
          })}
        </div>
      </MetaField>
      <MetaField label="Name">
        <input
          value={segment.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm font-semibold text-ink focus:border-ink focus:outline-none"
        />
      </MetaField>
      <MetaField label="One-line hook">
        <input
          value={segment.blurb}
          onChange={(e) => onChange({ blurb: e.target.value })}
          className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
        />
      </MetaField>
      <MetaField label="Welcome title">
        <input
          value={segment.welcome?.title ?? ""}
          onChange={(e) =>
            onChange({
              welcome: {
                title: e.target.value,
                body: segment.welcome?.body ?? "",
              },
            })
          }
          placeholder="Intro headline shown before Q1"
          className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
        />
      </MetaField>
      <MetaField label="Welcome message">
        <textarea
          value={segment.welcome?.body ?? ""}
          onChange={(e) =>
            onChange({
              welcome: {
                title: segment.welcome?.title ?? "",
                body: e.target.value,
              },
            })
          }
          rows={3}
          placeholder="A line or two of context…"
          className="w-full resize-none rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
        />
      </MetaField>
      <MetaField label="Who (definition)">
        <input
          value={segment.definition}
          onChange={(e) => onChange({ definition: e.target.value })}
          className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
        />
      </MetaField>
      <MetaField label="We want to learn (goal)">
        <textarea
          value={segment.goal}
          onChange={(e) => onChange({ goal: e.target.value })}
          rows={2}
          className="w-full resize-none rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
        />
      </MetaField>
      <MetaField label="Accent">
        <div className="flex gap-2">
          {(["lime", "ink"] as const).map((a) => (
            <button
              key={a}
              onClick={() => onChange({ accent: a })}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-semibold capitalize transition-colors",
                segment.accent === a
                  ? "border-ink"
                  : "border-ink/15 text-ink/55 hover:border-ink/40"
              )}
            >
              <span
                className={cn(
                  "h-3.5 w-3.5 rounded-full",
                  a === "lime" ? "bg-lime" : "bg-ink"
                )}
              />
              {a === "lime" ? "NS-green" : "NS-black"}
            </button>
          ))}
        </div>
      </MetaField>

      {/* Danger zone */}
      <div className="mt-5 border-t border-ink/10 pt-4">
        {confirming ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-semibold text-red-700">
              Delete “{segment.name}”? This can’t be undone.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={onDelete}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete survey
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-full border border-ink/20 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 transition-colors hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete this survey
          </button>
        )}
      </div>
    </div>
  );
}

function MetaField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink/45">
        {label}
      </p>
      {children}
    </div>
  );
}

// ---- toolbar dropdown ----
function Menu({
  children,
  onClose,
  align = "left",
}: {
  children: React.ReactNode;
  onClose: () => void;
  align?: "left" | "right";
}) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className={cn(
          "absolute top-10 z-40 w-52 rounded-xl border border-ink/10 bg-white p-1.5 shadow-[0_16px_44px_-16px_rgba(0,0,0,0.4)]",
          align === "right" ? "right-0" : "left-0"
        )}
      >
        {children}
      </div>
    </>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-ink/80 transition-colors hover:bg-ink/[0.06] hover:text-ink"
    >
      {children}
    </button>
  );
}

function ChecksPanel({
  issues,
  onClose,
  onGoto,
}: {
  issues: Issue[];
  onClose: () => void;
  onGoto: (index: number) => void;
}) {
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");
  return (
    <div className="absolute right-4 top-4 z-30 w-[340px] max-w-[calc(100%-2rem)] rounded-2xl border border-ink/10 bg-white p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <ShieldCheck className="h-4 w-4" /> Logic checks
        </p>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {issues.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-lime/30 px-3 py-3 text-sm font-medium text-ink">
          <Check className="h-4 w-4" /> No issues found. Looks good to ship.
        </div>
      ) : (
        <div className="max-h-[60vh] space-y-1.5 overflow-auto pr-1">
          <p className="text-xs text-muted-foreground">
            {errors.length} error{errors.length !== 1 ? "s" : ""} ·{" "}
            {warns.length} warning{warns.length !== 1 ? "s" : ""}
          </p>
          {[...errors, ...warns].map((it, i) => (
            <button
              key={i}
              onClick={() => it.index != null && onGoto(it.index)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                it.level === "error"
                  ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">{it.message}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SimulatePanel({
  segment,
  onClose,
}: {
  segment: Segment;
  onClose: () => void;
}) {
  const [n, setN] = useState(100);
  const [results, setResults] = useState<SimResult[] | null>(null);
  const run = () => setResults(simulateResponses(segment, n));

  return (
    <div className="absolute right-4 top-4 z-30 flex max-h-[calc(100vh-7rem)] w-[360px] max-w-[calc(100%-2rem)] flex-col rounded-2xl border border-ink/10 bg-white p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <Sparkles className="h-4 w-4" /> Simulate responses
        </p>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Generates random respondents through the flow (respecting skip-logic) to
        sanity-check distributions.
      </p>
      <div className="mb-3 flex items-center gap-2">
        {[50, 100, 500].map((v) => (
          <button
            key={v}
            onClick={() => setN(v)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              n === v ? "border-ink bg-ink text-white" : "border-ink/15 text-ink/60 hover:border-ink/40"
            )}
          >
            {v}
          </button>
        ))}
        <button
          onClick={run}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-lime px-3.5 py-1.5 text-xs font-bold text-ink hover:bg-lime-dark"
        >
          <Sparkles className="h-3.5 w-3.5" /> Run
        </button>
      </div>
      {results && (
        <div className="-mr-1 space-y-4 overflow-auto pr-1">
          {results.map((r) => (
            <SimRow key={r.questionId} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function SimRow({ r }: { r: SimResult }) {
  return (
    <div>
      <p className="mb-1.5 line-clamp-1 text-xs font-bold text-ink">
        Q{r.index + 1}. {r.title}
      </p>
      {r.counts ? (
        <Bars
          data={Object.entries(r.counts).sort((a, b) => b[1] - a[1])}
          total={Math.max(1, ...Object.values(r.counts))}
        />
      ) : r.histogram ? (
        <>
          {r.avg != null && (
            <p className="mb-1 text-[11px] font-semibold text-ink/50">
              avg {r.avg.toFixed(1)}
            </p>
          )}
          <Bars
            data={Object.entries(r.histogram).sort(
              (a, b) => Number(a[0]) - Number(b[0])
            )}
            total={Math.max(1, ...Object.values(r.histogram))}
          />
        </>
      ) : (
        <p className="text-[11px] text-ink/40">Free text · {r.total} responses</p>
      )}
    </div>
  );
}

function Bars({ data, total }: { data: [string, number][]; total: number }) {
  return (
    <div className="space-y-1">
      {data.map(([label, val]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-[11px] text-ink/60" title={label}>
            {label}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-ink/[0.06]">
            <div
              className="h-full rounded bg-lime"
              style={{ width: `${(val / total) * 100}%` }}
            />
          </div>
          <span className="w-7 shrink-0 text-right text-[11px] font-semibold tabular-nums text-ink/70">
            {val}
          </span>
        </div>
      ))}
    </div>
  );
}
