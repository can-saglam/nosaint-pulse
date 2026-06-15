import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import type { Question } from "@/data/surveys";

export type AnswerValue = string | string[] | number | null;

const LETTERS = "ABCDEFGHIJKLMNOP".split("");

/** An option counts as an "Other" option if it starts with "other". */
export const isOtherOption = (opt: string) => /^other/i.test(opt.trim());

export function QuestionInput({
  question,
  value,
  onChange,
  onAdvance,
  otherValue,
  onOtherChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
  /** call to advance after a definitive single selection */
  onAdvance: () => void;
  otherValue?: string;
  onOtherChange?: (v: string) => void;
}) {
  switch (question.type) {
    case "single":
    case "multi":
      return (
        <ChoiceInput
          question={question}
          value={value}
          onChange={onChange}
          onAdvance={onAdvance}
          otherValue={otherValue ?? ""}
          onOtherChange={onOtherChange ?? (() => {})}
        />
      );
    case "text":
      return (
        <Textarea
          autoFocus
          value={(value as string) ?? ""}
          placeholder={question.placeholder ?? "Type your answer…"}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onAdvance();
            }
          }}
        />
      );
    case "scale":
      return (
        <NumberScale
          from={1}
          to={10}
          value={value as number | null}
          minLabel={question.minLabel}
          maxLabel={question.maxLabel}
          onChange={(n) => {
            onChange(n);
            window.setTimeout(onAdvance, 250);
          }}
        />
      );
    case "nps":
      return (
        <NumberScale
          from={0}
          to={10}
          value={value as number | null}
          minLabel={question.minLabel}
          maxLabel={question.maxLabel}
          onChange={(n) => {
            onChange(n);
            window.setTimeout(onAdvance, 250);
          }}
        />
      );
    case "rating":
      return (
        <StarRating
          value={value as number | null}
          onChange={(n) => {
            onChange(n);
            window.setTimeout(onAdvance, 250);
          }}
        />
      );
    default:
      return null;
  }
}

function ChoiceInput({
  question,
  value,
  onChange,
  onAdvance,
  otherValue,
  onOtherChange,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
  onAdvance: () => void;
  otherValue: string;
  onOtherChange: (v: string) => void;
}) {
  const multi = question.type === "multi";
  const selected: string[] = multi
    ? ((value as string[]) ?? [])
    : value
    ? [value as string]
    : [];

  const otherSelected = selected.some(isOtherOption);

  const toggle = (opt: string) => {
    if (multi) {
      const next = selected.includes(opt)
        ? selected.filter((o) => o !== opt)
        : [...selected, opt];
      onChange(next);
    } else {
      onChange(opt);
      // Don't rush past "Other" — give space to type the detail.
      if (!isOtherOption(opt)) window.setTimeout(onAdvance, 280);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {question.options!.map((opt, i) => {
        const isSel = selected.includes(opt);
        return (
          <button
            key={`${opt}-${i}`}
            onClick={() => toggle(opt)}
            className={cn(
              "group flex items-center gap-3.5 rounded-xl border-2 px-4 py-3.5 text-left transition-all duration-150 active:scale-[0.99]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
              isSel
                ? "border-ink bg-ink text-white"
                : "border-ink/15 bg-muted hover:border-ink/50 hover:bg-white"
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold transition-colors",
                isSel
                  ? "border-lime bg-lime text-ink"
                  : "border-ink/25 text-ink/50 group-hover:border-ink/50"
              )}
            >
              {LETTERS[i]}
            </span>
            <span className="text-base font-medium sm:text-lg">{opt}</span>
          </button>
        );
      })}

      {otherSelected && (
        <input
          autoFocus
          value={otherValue}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="Please specify…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!multi) onAdvance();
            }
          }}
          className="mt-1 w-full rounded-xl border-2 border-lime bg-lime/10 px-4 py-3.5 text-base font-medium text-ink placeholder:text-ink/35 transition-all focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime/30 sm:text-lg"
        />
      )}

      {multi && (
        <p className="mt-1 text-sm text-muted-foreground">
          Choose all that apply, then continue.
        </p>
      )}
    </div>
  );
}

function NumberScale({
  from,
  to,
  value,
  minLabel,
  maxLabel,
  onChange,
}: {
  from: number;
  to: number;
  value: number | null;
  minLabel?: string;
  maxLabel?: string;
  onChange: (n: number) => void;
}) {
  const nums = [];
  for (let n = from; n <= to; n++) nums.push(n);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] gap-2">
        {nums.map((n) => {
          const isSel = value === n;
          return (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={cn(
                "flex h-12 items-center justify-center rounded-lg border-2 text-base font-bold transition-all active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
                isSel
                  ? "border-ink bg-ink text-lime"
                  : "border-ink/15 bg-muted text-ink hover:border-ink/60"
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{minLabel ?? from}</span>
        <span>{maxLabel ?? to}</span>
      </div>
    </div>
  );
}

function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = (value ?? 0) >= n;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            className="rounded-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 active:scale-90"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
          >
            <Star
              className={cn(
                "h-12 w-12 transition-colors",
                active
                  ? "fill-lime stroke-ink"
                  : "fill-transparent stroke-ink/25"
              )}
              strokeWidth={1.5}
            />
          </button>
        );
      })}
    </div>
  );
}
