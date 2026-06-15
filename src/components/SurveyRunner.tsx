import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  CornerDownLeft,
  Gift,
  Pencil,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Logo } from "@/components/Logo";
import { QuestionInput, type AnswerValue } from "@/components/QuestionInput";
import { QuestionEditor } from "@/components/QuestionEditor";
import type { Question, Segment } from "@/data/surveys";
import { duplicateQuestion, makeQuestion as newQuestion } from "@/lib/survey-utils";
import { cn } from "@/lib/utils";

export function SurveyRunner({
  segment,
  onExit,
  onUpdateSegment,
  onOpenCanvas,
  initialStep = 0,
  initialEditing = false,
  initialAnswers,
}: {
  segment: Segment;
  onExit: () => void;
  onUpdateSegment: (s: Segment) => void;
  onOpenCanvas?: () => void;
  initialStep?: number;
  initialEditing?: boolean;
  initialAnswers?: Record<string, AnswerValue>;
}) {
  const total = segment.questions.length;
  const sample = !!initialAnswers;
  const [step, setStep] = useState(initialStep); // 0..total-1 questions, total = done
  const [dir, setDir] = useState<1 | -1>(1);
  const [history, setHistory] = useState<number[]>([]); // visited steps (branch-aware back)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(
    initialAnswers ?? {}
  );
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(initialEditing);

  const clampedStep = Math.min(step, Math.max(total - 1, 0));
  const done = !editing && step >= total && total > 0;
  const question = done ? null : segment.questions[clampedStep] ?? null;
  const current = question ? answers[question.id] : null;

  const isAnswered = useMemo(() => {
    if (!question) return false;
    const v = answers[question.id];
    if (question.optional) return true;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "number") return true;
    return typeof v === "string" && v.trim().length > 0;
  }, [answers, question]);

  // Resolve the next step from a question, honouring per-option skip logic.
  const resolveNext = (fromStep: number, value: AnswerValue): number => {
    const q = segment.questions[fromStep];
    if (q && (q.type === "single") && typeof value === "string" && q.branches) {
      const target = q.branches[value];
      if (target === "END") return total;
      if (target) {
        const idx = segment.questions.findIndex((x) => x.id === target);
        if (idx >= 0) return idx;
      }
    }
    return fromStep + 1;
  };

  // step the current answer would route to (for button label + advance)
  const nextStep = useMemo(
    () => (question ? resolveNext(clampedStep, current ?? null) : clampedStep + 1),
    [question, clampedStep, current, segment.questions, total]
  );

  const go = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(Math.max(0, Math.min(total, next)));
  };

  // always-current answers, so deferred auto-advance reads the latest selection
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const answeredValue = (q: Question | null, val: AnswerValue) => {
    if (!q) return false;
    if (q.optional) return true;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "number") return true;
    return typeof val === "string" && val.trim().length > 0;
  };

  const advance = () => {
    if (editing || !question) return;
    const val = answersRef.current[question.id] ?? null;
    // read freshness from the ref — a deferred call must not trust a stale closure
    if (!answeredValue(question, val)) return;
    setHistory((h) => [...h, clampedStep]);
    go(resolveNext(clampedStep, val));
  };

  const back = () => {
    setHistory((h) => {
      if (h.length === 0) {
        go(clampedStep - 1);
        return h;
      }
      const nh = [...h];
      const prev = nh.pop()!;
      go(prev);
      return nh;
    });
  };

  const setAnswer = (v: AnswerValue) =>
    question && setAnswers((a) => ({ ...a, [question.id]: v }));

  // ----- survey authoring mutators -----
  const writeQuestions = (questions: Question[]) =>
    onUpdateSegment({ ...segment, questions });

  const updateQuestion = (next: Question) =>
    writeQuestions(
      segment.questions.map((q) => (q.id === next.id ? next : q))
    );

  const addQuestion = () => {
    const q = newQuestion();
    const at = total === 0 ? 0 : clampedStep + 1;
    const questions = [...segment.questions];
    questions.splice(at, 0, q);
    writeQuestions(questions);
    setDir(1);
    setStep(at);
  };

  const deleteQuestion = () => {
    if (!question) return;
    const idx = clampedStep;
    const questions = segment.questions.filter((_, i) => i !== idx);
    writeQuestions(questions);
    setStep(Math.max(0, Math.min(idx, questions.length - 1)));
  };

  const duplicateCurrent = () => {
    if (!question) return;
    const at = clampedStep + 1;
    const questions = [...segment.questions];
    questions.splice(at, 0, duplicateQuestion(question));
    writeQuestions(questions);
    setDir(1);
    setStep(at);
  };

  // keyboard: Enter to advance (disabled while editing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "Enter") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, isAnswered, question, editing]);

  return (
    <div className="relative flex min-h-screen flex-col bg-canvas">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-canvas/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onExit}
              aria-label="Back to all surveys"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">All surveys</span>
            </Button>
            <Logo className="h-4 text-ink" onClick={onExit} />
          </div>
          <div className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground">
            {sample && (
              <span className="hidden rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink sm:inline">
                Sample data
              </span>
            )}
            <span className="hidden sm:inline">{segment.name}</span>
            {!done && total > 0 && (
              <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 tabular-nums">
                {Math.min(clampedStep + 1, total)} / {total}
              </span>
            )}
            {onOpenCanvas && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenCanvas}
                aria-label="Flow view"
              >
                <Workflow className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Flow</span>
              </Button>
            )}
            <Button
              variant={editing ? "lime" : "outline"}
              size="sm"
              onClick={() => {
                setEditing((e) => !e);
                if (done) setStep(0);
              }}
            >
              {editing ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Done
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </>
              )}
            </Button>
          </div>
        </div>
        <Progress value={done ? 100 : total ? (clampedStep / total) * 100 : 0} />
      </header>

      {/* Body */}
      <main className="relative mx-auto flex w-full max-w-3xl flex-1 items-center px-5 sm:px-8">
        <AnimatePresence mode="wait" custom={dir}>
          {done ? (
            <DoneScreen
              key="done"
              segment={segment}
              onExit={onExit}
              onRestart={() => {
                setAnswers({});
                setOtherAnswers({});
                go(0);
              }}
            />
          ) : total === 0 ? (
            <EmptyState key="empty" onAdd={addQuestion} />
          ) : editing ? (
            <motion.div
              key={`edit-${question!.id}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="w-full py-12"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-bold text-ink/40">
                  Question {clampedStep + 1} of {total}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={addQuestion}>
                    <Plus className="h-3.5 w-3.5" /> Add question
                  </Button>
                  <Button variant="outline" size="sm" onClick={duplicateCurrent}>
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={deleteQuestion}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
              <QuestionEditor
                question={question!}
                onChange={updateQuestion}
                questions={segment.questions}
              />
            </motion.div>
          ) : (
            <motion.div
              key={question!.id}
              custom={dir}
              initial={{ opacity: 0, y: dir * 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: dir * -28 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="w-full py-16"
            >
              <div className="mb-7 flex items-start gap-3">
                <span className="mt-1 flex items-center gap-1 text-sm font-bold text-ink/40">
                  {clampedStep + 1}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h2 className="display text-[1.7rem] font-extrabold leading-[1.1] text-ink sm:text-4xl">
                    {question!.title}
                    {question!.optional && (
                      <span className="ml-2 align-middle text-base font-medium text-muted-foreground">
                        (optional)
                      </span>
                    )}
                  </h2>
                  {question!.subtitle && (
                    <p className="mt-2.5 text-base text-muted-foreground sm:text-lg">
                      {question!.subtitle}
                    </p>
                  )}
                </div>
              </div>

              <div className="pl-0 sm:pl-8">
                <QuestionInput
                  question={question!}
                  value={current ?? null}
                  onChange={setAnswer}
                  onAdvance={advance}
                  otherValue={otherAnswers[question!.id] ?? ""}
                  onOtherChange={(v) =>
                    setOtherAnswers((o) => ({ ...o, [question!.id]: v }))
                  }
                />

                <div className="mt-8 flex items-center gap-3">
                  <Button
                    variant="lime"
                    size="lg"
                    onClick={advance}
                    disabled={!isAnswered}
                  >
                    {nextStep >= total ? "Finish" : "OK"}
                    <Check className="h-4 w-4" />
                  </Button>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    press
                    {question!.type === "text" ? (
                      <Kbd>⌘ Enter</Kbd>
                    ) : (
                      <Kbd>Enter</Kbd>
                    )}
                    <CornerDownLeft className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer nav */}
      {(!done && total > 0) && (
        <footer className="sticky bottom-0 z-20 flex items-center justify-between gap-1.5 bg-gradient-to-t from-canvas via-canvas to-transparent px-5 py-4 sm:px-8">
          {editing ? (
            <span className="text-xs text-muted-foreground">
              Use the arrows to move between questions while editing.
            </span>
          ) : (
            <span />
          )}
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={() => (editing ? go(clampedStep - 1) : back())}
              disabled={editing ? clampedStep === 0 : clampedStep === 0 && history.length === 0}
              aria-label="Previous"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => (editing ? go(clampedStep + 1) : advance())}
              disabled={editing ? clampedStep >= total - 1 : !isAnswered}
              aria-label="Next"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-ink/20 bg-white px-1.5 py-0.5 font-sans text-[10px] font-semibold text-ink/70">
      {children}
    </kbd>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="w-full py-24 text-center">
      <h2 className="display text-3xl font-black text-ink">No questions yet</h2>
      <p className="mt-3 text-muted-foreground">
        This survey is empty. Add your first question to get started.
      </p>
      <Button variant="lime" size="lg" className="mt-7" onClick={onAdd}>
        <Plus className="h-4 w-4" /> Add a question
      </Button>
    </div>
  );
}

function DoneScreen({
  segment,
  onExit,
  onRestart,
}: {
  segment: Segment;
  onExit: () => void;
  onRestart: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full py-16 text-center"
    >
      <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-lime">
        <Check className="h-8 w-8 text-ink" strokeWidth={3} />
      </div>
      <h2 className="display-tight mx-auto max-w-xl text-4xl font-black text-ink sm:text-5xl">
        That’s everything.
      </h2>
      <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
        Thank you — your answers help us make NO SAINT better.
      </p>

      {/* Reward */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        className="mx-auto mt-9 max-w-md overflow-hidden rounded-2xl border-2 border-ink bg-lime p-6 text-left"
      >
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink">
            <Gift className="h-5 w-5 text-lime" />
          </div>
          <div>
            <p className="display text-xl font-extrabold text-ink">
              Your FREE pod pack is waiting.
            </p>
            <p className="mt-1.5 text-sm font-medium text-ink/75">
              We’ve dropped a free pod pack into your Rewards page — head to
              nosaint.co to claim it.
            </p>
            <a
              href="https://nosaint.co/account/rewards"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-6 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
            >
              Go to my Rewards <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </motion.div>

      <div className="mt-8 flex items-center justify-center gap-3">
        <Button variant="outline" size="lg" onClick={onExit}>
          Back to all surveys
        </Button>
        <Button variant="ghost" size="lg" onClick={onRestart}>
          Retake
        </Button>
      </div>
      <p className="mt-8 text-xs uppercase tracking-widest text-ink/30">
        {segment.name} · {segment.questions.length} questions
      </p>
    </motion.div>
  );
}
