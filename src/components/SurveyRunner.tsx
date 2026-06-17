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
  Redo2,
  Trash2,
  Undo2,
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
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: {
  segment: Segment;
  onExit: () => void;
  onUpdateSegment: (s: Segment) => void;
  onOpenCanvas?: () => void;
  initialStep?: number;
  initialEditing?: boolean;
  initialAnswers?: Record<string, AnswerValue>;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
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
  // when true, the editor targets the welcome copy rather than a question
  const [editingWelcome, setEditingWelcome] = useState(false);
  // show the welcome intro first on a fresh run; skip it when jumping to a
  // question or opening straight into the editor
  const [started, setStarted] = useState(initialEditing || initialStep > 0);

  const clampedStep = Math.min(step, Math.max(total - 1, 0));
  const done = !editing && step >= total && total > 0;
  const showWelcome = !started && !editing && total > 0 && !done;
  const question = done ? null : segment.questions[clampedStep] ?? null;
  const current = question ? answers[question.id] : null;

  // Branching means a respondent rarely sees every question, so the total is a
  // ceiling, not a promise. Track how many they've actually reached for an
  // honest, monotonic progress bar + count.
  const hasBranches = useMemo(
    () =>
      segment.questions.some(
        (q) => q.branches && Object.keys(q.branches).length > 0
      ),
    [segment.questions]
  );
  // questions answered before the current one (history is the visited stack)
  const askedSoFar = history.length;
  const questionNumber = askedSoFar + 1;
  const progressPct = done
    ? 100
    : showWelcome
    ? 0
    : total
    ? Math.min(100, (askedSoFar / total) * 100)
    : 0;

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

  const setWelcome = (patch: Partial<NonNullable<Segment["welcome"]>>) =>
    onUpdateSegment({
      ...segment,
      welcome: {
        title: segment.welcome?.title ?? "",
        body: segment.welcome?.body ?? "",
        ...patch,
      },
    });

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
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onExit}
              aria-label="Back to all surveys"
              className="shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">All surveys</span>
            </Button>
            <Logo
              className="hidden h-4 text-ink sm:block"
              onClick={onExit}
              title="Back to home"
            />
            {/* mobile: surface the survey name where the logo would be */}
            {!showWelcome && (
              <span className="truncate text-sm font-semibold text-ink sm:hidden">
                {segment.name}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2.5 text-xs font-medium text-muted-foreground">
            {sample && (
              <span className="hidden rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink sm:inline">
                Sample data
              </span>
            )}
            {!showWelcome && <span className="hidden sm:inline">{segment.name}</span>}
            {!done && !showWelcome && total > 0 && (
              <span className="shrink-0 whitespace-nowrap rounded-full bg-ink/[0.06] px-2.5 py-1 tabular-nums">
                {hasBranches
                  ? `Q${questionNumber}`
                  : `${Math.min(questionNumber, total)} / ${total}`}
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
            {editing && (onUndo || onRedo) && (
              <div className="flex items-center overflow-hidden rounded-lg border border-ink/15">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  aria-label="Undo"
                  title="Undo (⌘Z)"
                  className="flex h-8 w-8 items-center justify-center text-ink/70 transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-30"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <span className="h-5 w-px bg-ink/10" />
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  aria-label="Redo"
                  title="Redo (⌘⇧Z)"
                  className="flex h-8 w-8 items-center justify-center text-ink/70 transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-30"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </div>
            )}
            <Button
              variant={editing ? "lime" : "outline"}
              size="sm"
              onClick={() => {
                setEditing((e) => {
                  const next = !e;
                  // entering edit from the welcome screen → edit the welcome copy
                  setEditingWelcome(next && showWelcome);
                  return next;
                });
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
        <Progress value={progressPct} label="Survey progress" />
      </header>

      {/* Body */}
      <main className="relative mx-auto flex w-full max-w-3xl flex-1 items-center px-4 sm:px-8">
        <AnimatePresence mode="wait" custom={dir}>
          {showWelcome ? (
            <WelcomeScreen
              key="welcome"
              segment={segment}
              onStart={() => {
                setDir(1);
                setStarted(true);
              }}
            />
          ) : done ? (
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
          ) : editing && editingWelcome ? (
            <motion.div
              key="edit-welcome"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="w-full py-12"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-bold text-ink/40">
                  Welcome screen
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDir(1);
                    setEditingWelcome(false);
                    setStep(0);
                  }}
                >
                  Edit questions{" "}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <WelcomeEditor
                welcome={segment.welcome}
                questionCount={total}
                onChange={setWelcome}
              />
            </motion.div>
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
                    <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Add question</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={duplicateCurrent}>
                    <Copy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Duplicate</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={deleteQuestion}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Delete</span>
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
                <span className="mt-1 flex items-center gap-1 text-xs sm:text-sm font-bold text-ink/40">
                  {clampedStep + 1}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h2 className="display text-xl sm:text-[1.7rem] font-extrabold leading-[1.1] text-ink">
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
                    {nextStep >= total
                      ? "Finish"
                      : question!.type === "multi"
                      ? "Continue"
                      : "OK"}
                    <Check className="h-4 w-4" />
                  </Button>
                  <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
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
      {!done && !showWelcome && total > 0 && (
        <footer className="sticky bottom-0 z-20 bg-gradient-to-t from-canvas via-canvas to-transparent px-4 pb-5 pt-4 sm:px-8">
          {editing ? (
            <div className="mx-auto flex max-w-3xl items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {editingWelcome
                  ? "Editing the welcome screen — use the arrows for questions."
                  : "Use the arrows to move between the welcome screen and questions."}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    // step back: question 1 → welcome screen
                    if (editingWelcome) return;
                    if (clampedStep === 0) {
                      setDir(-1);
                      setEditingWelcome(true);
                    } else {
                      go(clampedStep - 1);
                    }
                  }}
                  disabled={editingWelcome}
                  aria-label="Previous"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    // step forward: welcome screen → question 1
                    if (editingWelcome) {
                      setDir(1);
                      setEditingWelcome(false);
                      setStep(0);
                    } else {
                      go(clampedStep + 1);
                    }
                  }}
                  disabled={!editingWelcome && clampedStep >= total - 1}
                  aria-label="Next"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 sm:flex-none"
                onClick={() => back()}
                disabled={clampedStep === 0 && history.length === 0}
                aria-label="Previous"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                variant={isAnswered ? "lime" : "outline"}
                size="lg"
                className="flex-[2] sm:flex-1"
                onClick={() => advance()}
                disabled={!isAnswered}
                aria-label="Next"
              >
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
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

function WelcomeScreen({
  segment,
  onStart,
}: {
  segment: Segment;
  onStart: () => void;
}) {
  const w = segment.welcome;
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="w-full py-16"
    >
      <h1 className="display-tight max-w-2xl text-3xl font-black text-ink sm:text-5xl">
        {w?.title ?? "Got a minute?"}
      </h1>
      {w?.body && (
        <p className="mt-5 max-w-xl text-lg text-muted-foreground sm:text-xl">
          {w.body}
        </p>
      )}
      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Button variant="lime" size="lg" onClick={onStart}>
          Start <ArrowRight className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          {segment.questions.some(
            (q) => q.branches && Object.keys(q.branches).length > 0
          )
            ? `Up to ${segment.questions.length} questions`
            : `${segment.questions.length} questions`}{" "}
          · under a minute
        </span>
      </div>
    </motion.div>
  );
}

function WelcomeEditor({
  welcome,
  questionCount,
  onChange,
}: {
  welcome?: { title: string; body: string };
  questionCount: number;
  onChange: (patch: Partial<{ title: string; body: string }>) => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-lime-dark bg-ink/[0.03] p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-lime">
          Editing
        </span>
        <span className="text-xs text-muted-foreground">
          The intro shown before the first question.
        </span>
      </div>

      <div className="mb-4">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink/45">
          Headline
        </p>
        <textarea
          value={welcome?.title ?? ""}
          onChange={(e) => onChange({ title: e.target.value })}
          rows={2}
          placeholder="e.g. Got a minute?"
          aria-label="Welcome headline"
          className="w-full resize-none rounded-lg border border-ink/20 bg-white px-3 py-2.5 text-lg font-bold text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
        />
      </div>

      <div className="mb-4">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink/45">
          Message
        </p>
        <textarea
          value={welcome?.body ?? ""}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={4}
          placeholder="A line or two of context…"
          aria-label="Welcome message"
          className="w-full resize-none rounded-lg border border-ink/20 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
        />
      </div>

      {/* live preview */}
      <div className="rounded-xl border border-ink/10 bg-canvas p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink/35">
          Preview
        </p>
        <h1 className="display-tight mt-2 max-w-2xl text-2xl font-black text-ink sm:text-3xl">
          {welcome?.title || "Got a minute?"}
        </h1>
        {welcome?.body && (
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            {welcome.body}
          </p>
        )}
        <div className="mt-5 flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-lime px-5 py-2 text-sm font-semibold text-ink">
            Start <ArrowRight className="h-4 w-4" />
          </span>
          <span className="text-xs text-muted-foreground">
            {questionCount} questions · under a minute
          </span>
        </div>
      </div>
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
  // no-device segments get a first-order offer; everyone else a free pod pack
  const reward =
    segment.reward === "discount"
      ? {
          title: "Your starter offer is waiting.",
          body: "We’ve added a first-order discount to your account — head to nosaint.co to claim it.",
          cta: "Claim my offer",
        }
      : {
          title: "Your FREE pod pack is waiting.",
          body: "We’ve dropped a free pod pack into your Rewards page — head to nosaint.co to claim it.",
          cta: "Go to my Rewards",
        };
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full py-16 text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
        className="relative mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-lime"
      >
        {/* expanding ring burst */}
        <motion.span
          initial={{ scale: 1, opacity: 0.55 }}
          animate={{ scale: 2.1, opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: "easeOut" }}
          className="absolute inset-0 rounded-full bg-lime"
        />
        <Check className="relative h-8 w-8 text-ink" strokeWidth={3} />
      </motion.div>
      <h2 className="display-tight mx-auto max-w-xl text-4xl font-black text-ink sm:text-5xl">
        That’s everything.
      </h2>
      <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
        Thank you — your answers help us make NO SAINT better.
      </p>

      {/* Reward */}
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.35, type: "spring", stiffness: 200, damping: 20 }}
        className="mx-auto mt-9 max-w-md overflow-hidden rounded-2xl border-2 border-ink bg-lime p-6 text-left"
      >
        <div className="flex items-start gap-3.5">
          <motion.div
            initial={{ rotate: -12, scale: 0.7 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ delay: 0.55, type: "spring", stiffness: 320, damping: 11 }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink"
          >
            <Gift className="h-5 w-5 text-lime" />
          </motion.div>
          <div>
            <p className="display text-xl font-extrabold text-ink">
              {reward.title}
            </p>
            <p className="mt-1.5 text-sm font-medium text-ink/75">{reward.body}</p>
            <a
              href="https://nosaint.co/account/rewards"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-6 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
            >
              {reward.cta} <ArrowRight className="h-4 w-4" />
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
