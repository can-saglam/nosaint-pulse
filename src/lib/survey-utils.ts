import {
  BRANCH_END,
  flavours,
  type Question,
  type QuestionType,
  type Segment,
} from "@/data/surveys";

export const newId = (p = "q") =>
  `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const makeQuestion = (): Question => ({
  id: newId(),
  type: "single",
  title: "Untitled question",
  options: ["Option 1", "Option 2"],
});

const cloneQuestion = (q: Question): Question => ({
  ...q,
  options: q.options ? [...q.options] : undefined,
  branches: q.branches ? { ...q.branches } : undefined,
});

/** Deep clone of a segment (keeps ids — used for seeding / undo snapshots). */
export const cloneSegment = (s: Segment): Segment => ({
  ...s,
  welcome: s.welcome ? { ...s.welcome } : undefined,
  questions: s.questions.map(cloneQuestion),
});

export const cloneSegments = (list: Segment[]): Segment[] => list.map(cloneSegment);

/** A fresh copy of a survey with new ids (branch targets remapped). */
export const duplicateSegment = (s: Segment, index: number): Segment => {
  const idMap = new Map<string, string>();
  s.questions.forEach((q) => idMap.set(q.id, newId()));
  const questions = s.questions.map((q) => {
    let branches = q.branches;
    if (branches) {
      const nb: Record<string, string> = {};
      for (const [opt, t] of Object.entries(branches))
        nb[opt] = t === BRANCH_END ? BRANCH_END : idMap.get(t) ?? t;
      branches = nb;
    }
    return { ...cloneQuestion(q), id: idMap.get(q.id)!, branches };
  });
  return {
    ...s,
    id: newId("seg"),
    index,
    name: `${s.name} (copy)`,
    status: "draft",
    welcome: s.welcome ? { ...s.welcome } : undefined,
    questions,
  };
};

/** A copy of one question with a new id, nudged on the canvas. */
export const duplicateQuestion = (q: Question): Question => ({
  ...cloneQuestion(q),
  id: newId(),
  branches: undefined, // a duplicate shouldn't inherit skip-logic targets
  x: q.x != null ? q.x + 40 : undefined,
  y: q.y != null ? q.y + 40 : undefined,
});

// ---------------------------------------------------------------------------
// Question templates (the "question bank")
// ---------------------------------------------------------------------------
export const questionTemplates: {
  key: string;
  label: string;
  make: () => Question;
}[] = [
  { key: "blank", label: "Blank", make: makeQuestion },
  {
    key: "nps",
    label: "NPS (0–10)",
    make: () => ({
      id: newId(),
      type: "nps",
      title: "How likely are you to recommend NO SAINT to a friend?",
      minLabel: "Not at all likely",
      maxLabel: "Extremely likely",
    }),
  },
  {
    key: "rating",
    label: "Star rating",
    make: () => ({
      id: newId(),
      type: "rating",
      title: "How would you rate your experience overall?",
    }),
  },
  {
    key: "scale",
    label: "Scale (1–10)",
    make: () => ({
      id: newId(),
      type: "scale",
      title: "How likely are you to…?",
      minLabel: "Not likely",
      maxLabel: "Very likely",
    }),
  },
  {
    key: "flavours",
    label: "Flavour picker",
    make: () => ({
      id: newId(),
      type: "multi",
      title: "Which flavours are your favourites?",
      subtitle: "Pick all that apply.",
      options: [...flavours],
    }),
  },
  {
    key: "yesno",
    label: "Yes / No",
    make: () => ({
      id: newId(),
      type: "single",
      title: "Untitled yes / no question",
      options: ["Yes", "No"],
    }),
  },
  {
    key: "text",
    label: "Free text",
    make: () => ({
      id: newId(),
      type: "text",
      title: "Anything you’d like to add?",
      placeholder: "Type your answer…",
      optional: true,
    }),
  },
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export type Issue = {
  questionId?: string;
  index?: number;
  level: "warn" | "error";
  message: string;
};

export const validateSurvey = (s: Segment): Issue[] => {
  const issues: Issue[] = [];
  const n = s.questions.length;
  if (n === 0) issues.push({ level: "warn", message: "Survey has no questions yet." });

  s.questions.forEach((q, i) => {
    const label = `Q${i + 1}`;
    if (!q.title.trim() || q.title.trim() === "Untitled question")
      issues.push({ questionId: q.id, index: i, level: "warn", message: `${label} needs a title.` });

    if (q.type === "single" || q.type === "multi") {
      const opts = (q.options ?? []).map((o) => o.trim());
      if (opts.length < 2)
        issues.push({ questionId: q.id, index: i, level: "error", message: `${label} needs at least 2 options.` });
      if (opts.some((o) => !o))
        issues.push({ questionId: q.id, index: i, level: "warn", message: `${label} has a blank option.` });
      const dupe = opts.find((o, idx) => o && opts.indexOf(o) !== idx);
      if (dupe)
        issues.push({ questionId: q.id, index: i, level: "warn", message: `${label} has a duplicate option “${dupe}”.` });
    }

    if (q.type === "single" && q.branches) {
      for (const [opt, t] of Object.entries(q.branches)) {
        if (t === BRANCH_END) continue;
        const ti = s.questions.findIndex((x) => x.id === t);
        if (ti === -1)
          issues.push({ questionId: q.id, index: i, level: "error", message: `${label} “${opt}” skips to a deleted question.` });
        else if (ti <= i)
          issues.push({ questionId: q.id, index: i, level: "warn", message: `${label} “${opt}” may loop (skips to ${ti < i ? `earlier Q${ti + 1}` : "itself"}).` });
      }
    }
  });

  // reachability (BFS from start over default + branch edges)
  if (n > 0) {
    const reachable = new Set<number>([0]);
    const queue = [0];
    while (queue.length) {
      const i = queue.shift()!;
      const q = s.questions[i];
      const opts = q.options ?? [];
      const allBranch = q.type === "single" && opts.length > 0 && opts.every((o) => q.branches?.[o]);
      const nexts = new Set<number>();
      if (!allBranch && i + 1 < n) nexts.add(i + 1);
      if (q.type === "single" && q.branches)
        for (const t of Object.values(q.branches)) {
          if (t === BRANCH_END) continue;
          const ti = s.questions.findIndex((x) => x.id === t);
          if (ti >= 0) nexts.add(ti);
        }
      nexts.forEach((j) => {
        if (!reachable.has(j)) {
          reachable.add(j);
          queue.push(j);
        }
      });
    }
    s.questions.forEach((q, i) => {
      if (!reachable.has(i))
        issues.push({ questionId: q.id, index: i, level: "warn", message: `Q${i + 1} may be unreachable.` });
    });
  }

  return issues;
};

// ---------------------------------------------------------------------------
// Response simulation
// ---------------------------------------------------------------------------
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export type SimResult = {
  questionId: string;
  index: number;
  type: QuestionType;
  title: string;
  total: number;
  counts?: Record<string, number>;
  histogram?: Record<number, number>;
  avg?: number;
};

export const simulateResponses = (s: Segment, n: number): SimResult[] => {
  const res: Record<string, SimResult> = {};
  s.questions.forEach((q, i) => {
    res[q.id] = {
      questionId: q.id,
      index: i,
      type: q.type,
      title: q.title,
      total: 0,
      counts: q.type === "single" || q.type === "multi" ? {} : undefined,
      histogram: q.type === "scale" || q.type === "nps" || q.type === "rating" ? {} : undefined,
    };
  });

  for (let r = 0; r < n; r++) {
    let i = 0;
    let guard = 0;
    while (i >= 0 && i < s.questions.length && guard++ < s.questions.length * 4) {
      const q = s.questions[i];
      const r0 = res[q.id];
      r0.total++;
      let next = i + 1;
      if (q.type === "single") {
        const opt = pick(q.options ?? ["?"]);
        r0.counts![opt] = (r0.counts![opt] ?? 0) + 1;
        const t = q.branches?.[opt];
        if (t === BRANCH_END) next = s.questions.length;
        else if (t) {
          const ti = s.questions.findIndex((x) => x.id === t);
          if (ti >= 0) next = ti;
        }
      } else if (q.type === "multi") {
        const opts = q.options ?? [];
        const chosen = opts.filter(() => Math.random() < 0.4);
        (chosen.length ? chosen : [pick(opts.length ? opts : ["—"])]).forEach((o) => {
          r0.counts![o] = (r0.counts![o] ?? 0) + 1;
        });
      } else if (q.type === "rating") {
        const v = 1 + Math.floor(Math.random() * 5);
        r0.histogram![v] = (r0.histogram![v] ?? 0) + 1;
        r0.avg = ((r0.avg ?? 0) * (r0.total - 1) + v) / r0.total;
      } else if (q.type === "scale" || q.type === "nps") {
        const lo = q.type === "nps" ? 0 : 1;
        const v = lo + Math.floor(Math.random() * (11 - lo));
        r0.histogram![v] = (r0.histogram![v] ?? 0) + 1;
        r0.avg = ((r0.avg ?? 0) * (r0.total - 1) + v) / r0.total;
      }
      i = next;
    }
  }
  return s.questions.map((q) => res[q.id]);
};

/** One plausible answer set, for previewing with sample data. */
export const sampleAnswers = (
  s: Segment
): Record<string, string | string[] | number> => {
  const a: Record<string, string | string[] | number> = {};
  s.questions.forEach((q) => {
    if (q.type === "single") {
      const opts = (q.options ?? []).filter((o) => !/^other/i.test(o));
      a[q.id] = pick(opts.length ? opts : q.options ?? ["Yes"]);
    } else if (q.type === "multi") {
      const opts = (q.options ?? []).filter((o) => !/^other/i.test(o));
      const ch = opts.filter(() => Math.random() < 0.4);
      a[q.id] = ch.length ? ch : [pick(opts.length ? opts : ["Yes"])];
    } else if (q.type === "rating") a[q.id] = 1 + Math.floor(Math.random() * 5);
    else if (q.type === "scale") a[q.id] = 1 + Math.floor(Math.random() * 10);
    else if (q.type === "nps") a[q.id] = Math.floor(Math.random() * 11);
    else if (q.type === "text") a[q.id] = "Sample response for preview.";
  });
  return a;
};

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------
export const exportSegment = (s: Segment): string => {
  // drop canvas-only coords from the export
  const clean = {
    name: s.name,
    definition: s.definition,
    goal: s.goal,
    blurb: s.blurb,
    accent: s.accent,
    status: s.status ?? "draft",
    reward: s.reward ?? "pods",
    welcome: s.welcome,
    questions: s.questions.map(({ x, y, ...q }) => q),
  };
  return JSON.stringify(clean, null, 2);
};

const VALID_TYPES: QuestionType[] = ["single", "multi", "text", "rating", "scale", "nps"];

export const parseSegment = (json: string, index: number): Segment => {
  const raw = JSON.parse(json);
  if (!raw || !Array.isArray(raw.questions))
    throw new Error("That doesn’t look like a survey export (missing questions).");
  const questions: Question[] = raw.questions.map((q: any) => ({
    id: newId(),
    type: VALID_TYPES.includes(q.type) ? q.type : "single",
    title: String(q.title ?? "Untitled question"),
    subtitle: q.subtitle ? String(q.subtitle) : undefined,
    options: Array.isArray(q.options) ? q.options.map(String) : undefined,
    placeholder: q.placeholder ? String(q.placeholder) : undefined,
    optional: !!q.optional,
    minLabel: q.minLabel ? String(q.minLabel) : undefined,
    maxLabel: q.maxLabel ? String(q.maxLabel) : undefined,
    // branches reference old ids — dropped on import for safety
  }));
  return {
    id: newId("seg"),
    index,
    name: raw.name ? String(raw.name) : "Imported survey",
    definition: raw.definition ? String(raw.definition) : "Imported",
    goal: raw.goal ? String(raw.goal) : "",
    blurb: raw.blurb ? String(raw.blurb) : "Imported survey.",
    accent: raw.accent === "lime" ? "lime" : "ink",
    status: "draft",
    reward: raw.reward === "discount" ? "discount" : "pods",
    welcome: normalizeWelcome(raw.welcome),
    questions,
  };
};

const normalizeWelcome = (w: any): Segment["welcome"] =>
  w && (w.title || w.body)
    ? { title: String(w.title ?? ""), body: String(w.body ?? "") }
    : undefined;

// ---- full backup (all surveys) + smart import ----
export const exportAll = (surveys: Segment[]): string =>
  JSON.stringify(
    { app: "pulse", version: 1, exportedAt: new Date().toISOString(), surveys },
    null,
    2
  );

const normalizeQuestion = (q: any): Question => ({
  id: typeof q?.id === "string" ? q.id : newId(),
  type: VALID_TYPES.includes(q?.type) ? q.type : "single",
  title: String(q?.title ?? "Untitled question"),
  subtitle: q?.subtitle ? String(q.subtitle) : undefined,
  options: Array.isArray(q?.options) ? q.options.map(String) : undefined,
  placeholder: q?.placeholder ? String(q.placeholder) : undefined,
  optional: !!q?.optional,
  minLabel: q?.minLabel ? String(q.minLabel) : undefined,
  maxLabel: q?.maxLabel ? String(q.maxLabel) : undefined,
  branches:
    q?.branches && typeof q.branches === "object" ? { ...q.branches } : undefined,
  x: typeof q?.x === "number" ? q.x : undefined,
  y: typeof q?.y === "number" ? q.y : undefined,
});

const normalizeSegment = (s: any, index: number): Segment => ({
  id: typeof s?.id === "string" ? s.id : newId("seg"),
  index: typeof s?.index === "number" ? s.index : index,
  name: String(s?.name ?? "Untitled survey"),
  definition: String(s?.definition ?? ""),
  goal: String(s?.goal ?? ""),
  blurb: String(s?.blurb ?? ""),
  accent: s?.accent === "lime" ? "lime" : "ink",
  status: ["draft", "ready", "live"].includes(s?.status) ? s.status : "draft",
  reward: s?.reward === "discount" ? "discount" : "pods",
  welcome: normalizeWelcome(s?.welcome),
  questions: Array.isArray(s?.questions) ? s.questions.map(normalizeQuestion) : [],
});

export type ParsedImport =
  | { kind: "backup"; surveys: Segment[] }
  | { kind: "single"; segment: Segment };

/** Auto-detect a single-survey export vs. a full Pulse backup. */
export const parseImport = (json: string, indexBase: number): ParsedImport => {
  const raw = JSON.parse(json);
  if (raw && Array.isArray(raw.surveys)) {
    const surveys = raw.surveys.map((s: any, i: number) =>
      normalizeSegment(s, i + 1)
    );
    if (!surveys.length) throw new Error("Backup contains no surveys.");
    return { kind: "backup", surveys };
  }
  if (Array.isArray(raw)) {
    if (!raw.length) throw new Error("Backup contains no surveys.");
    return { kind: "backup", surveys: raw.map((s, i) => normalizeSegment(s, i + 1)) };
  }
  if (raw && Array.isArray(raw.questions)) {
    return { kind: "single", segment: parseSegment(json, indexBase) };
  }
  throw new Error("Unrecognised JSON — expected a survey or a Pulse backup.");
};

export const downloadJSON = (filename: string, text: string) => {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const statusMeta: Record<
  NonNullable<Segment["status"]>,
  { label: string; dot: string; chip: string }
> = {
  draft: { label: "Draft", dot: "bg-ink/40", chip: "bg-ink/[0.06] text-ink/55" },
  ready: { label: "Ready", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-700" },
  live: { label: "Live", dot: "bg-lime-dark", chip: "bg-lime/40 text-ink" },
};
