import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  GripVertical,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BRANCH_END,
  flavours,
  type Question,
  type QuestionType,
} from "@/data/surveys";

const TYPES: { value: QuestionType; label: string }[] = [
  { value: "single", label: "Single select" },
  { value: "multi", label: "Multi select" },
  { value: "text", label: "Free text" },
  { value: "rating", label: "Star rating" },
  { value: "scale", label: "Scale 1–10" },
  { value: "nps", label: "NPS 0–10" },
];

const hasOptions = (t: QuestionType) => t === "single" || t === "multi";
const hasLabels = (t: QuestionType) => t === "scale" || t === "nps";

export function QuestionEditor({
  question,
  onChange,
  questions = [],
}: {
  question: Question;
  onChange: (next: Question) => void;
  /** full question list, for per-option skip-logic targets */
  questions?: Question[];
}) {
  const patch = (p: Partial<Question>) => onChange({ ...question, ...p });

  const setOption = (i: number, val: string) => {
    const options = [...(question.options ?? [])];
    const old = options[i];
    options[i] = val;
    // keep any branch routing attached to the renamed option
    let branches = question.branches;
    if (branches && old in branches && old !== val) {
      branches = { ...branches };
      branches[val] = branches[old];
      delete branches[old];
    }
    patch({ options, branches });
  };
  const addOption = () => {
    const options = [...(question.options ?? [])];
    options.push(`Option ${options.length + 1}`);
    patch({ options });
  };
  const removeOption = (i: number) => {
    const old = (question.options ?? [])[i];
    const options = (question.options ?? []).filter((_, idx) => idx !== i);
    let branches = question.branches;
    if (branches && old in branches) {
      branches = { ...branches };
      delete branches[old];
    }
    patch({ options, branches });
  };
  const addOther = () => {
    const options = [...(question.options ?? []), "Other"];
    patch({ options });
  };
  const moveOption = (i: number, direction: "up" | "down") => {
    const options = [...(question.options ?? [])];
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= options.length) return;
    [options[i], options[j]] = [options[j], options[i]];
    patch({ options });
  };
  const useFlavours = () => {
    const hadOther = (question.options ?? []).some((o) => /^other/i.test(o.trim()));
    patch({ options: [...flavours, ...(hadOther ? ["Other"] : [])] });
  };

  const setBranch = (opt: string, target: string) => {
    const branches = { ...(question.branches ?? {}) };
    if (!target) delete branches[opt];
    else branches[opt] = target;
    patch({ branches });
  };

  const targets = questions.filter((q) => q.id !== question.id);
  const currentIndex = questions.findIndex((q) => q.id === question.id);
  // a branch that points to this/earlier question can loop forever in preview
  const loops = (opt: string) => {
    const t = question.branches?.[opt];
    if (!t || t === BRANCH_END) return false;
    const ti = questions.findIndex((q) => q.id === t);
    return ti !== -1 && ti <= currentIndex;
  };

  const changeType = (type: QuestionType) => {
    const next: Question = { ...question, type };
    if (hasOptions(type) && (!question.options || question.options.length === 0)) {
      next.options = ["Option 1", "Option 2"];
    }
    onChange(next);
  };

  const hasOther = (question.options ?? []).some((o) => /^other/i.test(o.trim()));

  return (
    <div className="rounded-2xl border-2 border-dashed border-lime-dark bg-lime/[0.06] p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-lime">
          Editing
        </span>
        <span className="text-xs text-muted-foreground">
          Changes apply to this preview session.
        </span>
      </div>

      {/* Type picker */}
      <Field label="Question type">
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => changeType(t.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                question.type === t.value
                  ? "border-ink bg-ink text-white"
                  : "border-ink/20 bg-white text-ink/70 hover:border-ink/50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Field>

      {/* Title */}
      <Field label="Question">
        <textarea
          value={question.title}
          onChange={(e) => patch({ title: e.target.value })}
          rows={2}
          aria-label="Question title"
          className="w-full resize-none rounded-lg border border-ink/20 bg-white px-3 py-2.5 text-lg font-bold text-ink focus:border-ink focus:outline-none"
        />
      </Field>

      {/* Subtitle */}
      <Field label="Helper text (optional)">
        <input
          value={question.subtitle ?? ""}
          onChange={(e) => patch({ subtitle: e.target.value || undefined })}
          placeholder="Add a sub-line…"
          aria-label="Question subtitle"
          className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
        />
      </Field>

      {/* Options */}
      {hasOptions(question.type) && (
        <Field label="Answer options">
          <div className="flex flex-col gap-2">
            {(question.options ?? []).map((opt, i) => {
              const other = /^other/i.test(opt.trim());
              return (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 shrink-0 text-ink/25" />
                    <div className="flex shrink-0 flex-col">
                      <button
                        onClick={() => moveOption(i, "up")}
                        disabled={i === 0}
                        className="shrink-0 rounded-md p-0.5 text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-30"
                        aria-label="Move option up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveOption(i, "down")}
                        disabled={i === (question.options ?? []).length - 1}
                        className="shrink-0 rounded-md p-0.5 text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-30"
                        aria-label="Move option down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input
                      value={opt}
                      onChange={(e) => setOption(i, e.target.value)}
                      aria-label="Option text"
                      className={cn(
                        "flex-1 rounded-lg border bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none",
                        other ? "border-lime-dark" : "border-ink/20"
                      )}
                    />
                    {other && (
                      <span className="shrink-0 rounded bg-lime px-2 py-1 text-[10px] font-bold uppercase text-ink">
                        → text field
                      </span>
                    )}
                    <button
                      onClick={() => removeOption(i)}
                      disabled={(question.options ?? []).length <= 1}
                      className="shrink-0 rounded-md p-1.5 text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-30"
                      aria-label="Remove option"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {question.type === "single" && (
                    <div className="flex flex-col gap-1 pl-6">
                      <div className="flex items-center gap-2">
                        <CornerDownRight className="h-3.5 w-3.5 text-ink/30" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/35">
                          Skip to
                        </span>
                        <select
                          value={question.branches?.[opt] ?? ""}
                          onChange={(e) => setBranch(opt, e.target.value)}
                          className={cn(
                            "rounded-md border bg-white px-2 py-1 text-xs text-ink focus:border-ink focus:outline-none",
                            loops(opt)
                              ? "border-amber-400 font-semibold"
                              : question.branches?.[opt]
                              ? "border-ink/50 font-semibold"
                              : "border-ink/15 text-ink/55"
                          )}
                        >
                          <option value="">Next question (default)</option>
                          {targets.map((t) => {
                            const n = questions.findIndex((q) => q.id === t.id) + 1;
                            return (
                              <option key={t.id} value={t.id}>
                                Q{n}: {t.title.slice(0, 32)}
                              </option>
                            );
                          })}
                          <option value={BRANCH_END}>End survey →</option>
                        </select>
                      </div>
                      {loops(opt) && (
                        <p className="flex items-center gap-1.5 pl-6 text-[11px] font-medium text-amber-600">
                          <AlertTriangle className="h-3 w-3" /> Points to this or an
                          earlier question — may loop in preview.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={addOption}>
              <Plus className="h-3.5 w-3.5" /> Add option
            </Button>
            <Button variant="outline" size="sm" onClick={useFlavours}>
              <Sparkles className="h-3.5 w-3.5" /> Insert NO SAINT flavours
            </Button>
            {!hasOther && (
              <Button variant="outline" size="sm" onClick={addOther}>
                <Plus className="h-3.5 w-3.5" /> Add “Other” (with text field)
              </Button>
            )}
          </div>
        </Field>
      )}

      {/* Scale labels */}
      {hasLabels(question.type) && (
        <Field label="Scale end labels">
          <div className="flex gap-2">
            <input
              value={question.minLabel ?? ""}
              onChange={(e) => patch({ minLabel: e.target.value || undefined })}
              placeholder="Low end (e.g. Not likely)"
              aria-label="Scale low-end label"
              className="flex-1 rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
            />
            <input
              value={question.maxLabel ?? ""}
              onChange={(e) => patch({ maxLabel: e.target.value || undefined })}
              placeholder="High end (e.g. Very likely)"
              aria-label="Scale high-end label"
              className="flex-1 rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
            />
          </div>
        </Field>
      )}

      {/* Optional toggle */}
      <label className="mt-1 flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
        <button
          type="button"
          role="switch"
          aria-checked={!!question.optional}
          onClick={() => patch({ optional: !question.optional })}
          className={cn(
            "relative h-6 w-10 rounded-full transition-colors",
            question.optional ? "bg-ink" : "bg-ink/20"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
              question.optional ? "left-[1.125rem]" : "left-0.5"
            )}
          />
        </button>
        Optional question (can be skipped)
      </label>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink/45">
        {label}
      </p>
      {children}
    </div>
  );
}
