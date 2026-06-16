import { useCallback, useEffect, useRef, useState } from "react";
import { Landing } from "@/components/Landing";
import { SurveyRunner } from "@/components/SurveyRunner";
import { FlowCanvas } from "@/components/FlowCanvas";
import { Toaster, toast } from "@/components/ui/toast";
import { segments as seed, type Segment } from "@/data/surveys";
import {
  cloneSegments,
  downloadJSON,
  duplicateSegment,
  exportAll,
  makeQuestion,
  newId,
  parseImport,
  sampleAnswers,
} from "@/lib/survey-utils";
import {
  isCloud,
  pushCloud,
  subscribeCloud,
  type CloudStatus,
} from "@/lib/cloud";

// bump when the seed data shape changes so stale saves don't mask new defaults
const STORAGE_KEY = "nosaint-surveys-v3";

// seed clone with a default "live" status for the shipping questionnaires
const seeded = (): Segment[] =>
  cloneSegments(seed).map((s) => ({ ...s, status: s.status ?? "live" }));

// Backfill seed-only metadata (welcome copy, reward type) onto known seed
// surveys if a sync ever drops it — keeps these self-healing against any
// stale client that might overwrite the shared cloud doc.
const seedById = new Map(seed.map((s) => [s.id, s]));
const hydrate = (list: Segment[]): Segment[] =>
  list.map((s) => {
    const seedSeg = seedById.get(s.id);
    if (!seedSeg) return s;
    const patch: Partial<Segment> = {};
    if (!s.welcome && seedSeg.welcome) patch.welcome = { ...seedSeg.welcome };
    if (!s.reward && seedSeg.reward) patch.reward = seedSeg.reward;

    // Merge missing seed questions and branch updates so new questions
    // added to seed data automatically appear in existing saved surveys.
    const existingIds = new Set(s.questions.map((q) => q.id));
    const seedQs = seedSeg.questions;
    let questions = [...s.questions];
    let qChanged = false;

    for (let i = 0; i < seedQs.length; i++) {
      const sq = seedQs[i];
      if (!existingIds.has(sq.id)) {
        // insert after the preceding seed question (or at the start)
        const prev = i > 0 ? seedQs[i - 1] : null;
        const idx = prev ? questions.findIndex((q) => q.id === prev.id) : -1;
        questions.splice(idx + 1, 0, { ...sq });
        existingIds.add(sq.id);
        qChanged = true;
      }
      // copy seed branch rules onto stored questions that are missing them
      const existing = questions.find((q) => q.id === sq.id);
      if (existing && sq.branches && !existing.branches) {
        existing.branches = { ...sq.branches };
        qChanged = true;
      }
    }
    if (qChanged) patch.questions = questions;

    return Object.keys(patch).length ? { ...s, ...patch } : s;
  });

const loadSurveys = (): Segment[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return hydrate(parsed as Segment[]);
    }
  } catch {
    /* ignore corrupt storage */
  }
  return seeded();
};

export default function App() {
  const [surveys, setSurveys] = useState<Segment[]>(loadSurveys);
  const [past, setPast] = useState<Segment[][]>([]);
  const [future, setFuture] = useState<Segment[][]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<"run" | "canvas">("run");
  const [runnerInit, setRunnerInit] = useState<{
    step: number;
    editing: boolean;
    answers?: Record<string, string | string[] | number>;
  }>({ step: 0, editing: false });
  const lastPush = useRef(0);

  // ----- cloud sync (Firestore) -----
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(
    isCloud ? "connecting" : "off"
  );
  const surveysRef = useRef(surveys);
  surveysRef.current = surveys;
  const lastSyncedRef = useRef<string>(""); // JSON last written-to / read-from cloud
  const pushTimer = useRef<number | undefined>(undefined);
  // Don't push to the cloud until we've seen the authoritative state once.
  // Otherwise a tab that boots with stale localStorage would clobber the cloud
  // before the first snapshot lands (the bug that kept wiping the welcome copy).
  const syncedOnce = useRef(false);

  // live subscription: adopt remote changes; seed the cloud only if it's empty
  useEffect(() => {
    if (!isCloud) return;
    const unsub = subscribeCloud(
      (remote) => {
        if (remote == null) {
          // no document yet — seed it from whatever we have locally
          const json = JSON.stringify(surveysRef.current);
          lastSyncedRef.current = json;
          syncedOnce.current = true;
          pushCloud(surveysRef.current).catch(() => {});
          return;
        }
        const json = JSON.stringify(remote);
        syncedOnce.current = true;
        if (json === lastSyncedRef.current) return; // our own echo / unchanged
        lastSyncedRef.current = json;
        // backfill seed-only meta if a stale client wiped it; the diff then
        // re-pushes the healed copy back to the cloud
        setSurveys(hydrate(remote));
      },
      (status) => {
        // once the cloud has answered (good or bad) it's safe to push edits
        if (status === "synced" || status === "error") syncedOnce.current = true;
        setCloudStatus(status);
      }
    );
    return unsub;
  }, []);

  // persist on every change: localStorage (offline cache) + cloud (debounced)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(surveys));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
    if (!isCloud) return;
    if (!syncedOnce.current) return; // wait for the first cloud snapshot before pushing
    const json = JSON.stringify(surveys);
    if (json === lastSyncedRef.current) return; // nothing new (or just applied remote)
    window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      pushCloud(surveys)
        .then(() => {
          lastSyncedRef.current = json;
        })
        .catch(() => {
          setCloudStatus("error");
          toast("Sync failed — changes saved locally", "error");
        });
    }, 700);
  }, [surveys]);

  // history-aware mutation: snapshot current state, coalescing rapid edits
  const commit = useCallback(
    (next: Segment[]) => {
      setSurveys((curr) => {
        const now = Date.now();
        setPast((p) =>
          now - lastPush.current < 500 && p.length ? p : [...p, curr].slice(-60)
        );
        lastPush.current = now;
        return next;
      });
      setFuture([]);
    },
    []
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setSurveys((curr) => {
        setFuture((f) => [curr, ...f].slice(0, 60));
        return prev;
      });
      lastPush.current = 0;
      toast("Undone");
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const nextState = f[0];
      setSurveys((curr) => {
        setPast((p) => [...p, curr].slice(-60));
        return nextState;
      });
      lastPush.current = 0;
      toast("Redone");
      return f.slice(1);
    });
  }, []);

  // ⌘/Ctrl+Z undo · ⌘/Ctrl+Shift+Z (or Ctrl+Y) redo — but let inputs keep native undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const active = surveys.find((s) => s.id === activeId) ?? null;

  const updateSegment = (next: Segment) =>
    commit(surveys.map((s) => (s.id === next.id ? next : s)));

  const openRun = (
    id: string,
    opts?: {
      step?: number;
      editing?: boolean;
      answers?: Record<string, string | string[] | number>;
    }
  ) => {
    setRunnerInit({
      step: opts?.step ?? 0,
      editing: opts?.editing ?? false,
      answers: opts?.answers,
    });
    setActiveId(id);
    setView("run");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openCanvas = (id: string) => {
    setActiveId(id);
    setView("canvas");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const exit = () => {
    setActiveId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteSurvey = (id: string) => {
    commit(surveys.filter((s) => s.id !== id));
    if (activeId === id) {
      setActiveId(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const createSurvey = () => {
    const seg: Segment = {
      id: newId("seg"),
      index: surveys.length + 1,
      name: "Untitled survey",
      definition: "New segment",
      goal: "Describe what you want to learn",
      blurb: "New survey flow.",
      accent: surveys.length % 2 === 0 ? "lime" : "ink",
      status: "draft",
      questions: [makeQuestion()],
    };
    commit([...surveys, seg]);
    openCanvas(seg.id);
  };

  const duplicateSurvey = (id: string) => {
    const src = surveys.find((s) => s.id === id);
    if (!src) return;
    commit([...surveys, duplicateSegment(src, surveys.length + 1)]);
  };

  // smart import: a single survey appends; a full backup replaces everything
  const importJson = (json: string): { kind: "single" | "backup"; count: number } => {
    const parsed = parseImport(json, surveys.length + 1);
    if (parsed.kind === "backup") {
      commit(parsed.surveys);
      return { kind: "backup", count: parsed.surveys.length };
    }
    commit([...surveys, parsed.segment]);
    return { kind: "single", count: 1 };
  };

  const exportAllSurveys = () =>
    downloadJSON("pulse-backup.json", exportAll(surveys));

  const resetAll = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSurveys(seeded());
    setPast([]);
    setFuture([]);
    setActiveId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (active && view === "canvas") {
    return (
      <>
      <Toaster />
      <FlowCanvas
        key={active.id}
        segment={active}
        onUpdateSegment={updateSegment}
        onBack={exit}
        onDelete={() => deleteSurvey(active.id)}
        onOpenRunner={(step, editing, answers) =>
          openRun(active.id, { step, editing, answers })
        }
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
      />
      </>
    );
  }

  if (active) {
    return (
      <>
      <Toaster />
      <SurveyRunner
        key={active.id}
        segment={active}
        initialStep={runnerInit.step}
        initialEditing={runnerInit.editing}
        initialAnswers={runnerInit.answers}
        onUpdateSegment={updateSegment}
        onExit={exit}
        onOpenCanvas={() => openCanvas(active.id)}
      />
      </>
    );
  }

  return (
    <>
    <Toaster />
    <Landing
      segments={surveys}
      onPick={(s) => openRun(s.id)}
      onPreviewSample={(s) =>
        openRun(s.id, { answers: sampleAnswers(s) })
      }
      onOpenCanvas={(s) => openCanvas(s.id)}
      onCreate={createSurvey}
      onDelete={deleteSurvey}
      onRename={(s, name) => updateSegment({ ...s, name })}
      onDuplicate={duplicateSurvey}
      onSetStatus={(s, status) => updateSegment({ ...s, status })}
      onImport={importJson}
      onExportAll={exportAllSurveys}
      onReset={resetAll}
      canUndo={past.length > 0}
      canRedo={future.length > 0}
      onUndo={undo}
      onRedo={redo}
      cloudStatus={cloudStatus}
    />
    </>
  );
}
