import LilyBetaSync from "@/components/workspace/LilyBetaSync";
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Project, Chapter, GlossaryTerm, PromptPreset } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import EditorPanel from "@/components/workspace/EditorPanel";
import EditorToolbar from "@/components/workspace/EditorToolbar";
import GlossarySidebar from "@/components/glossary/GlossarySidebar";
import GlossaryTermFindDialog from "@/components/glossary/GlossaryTermFindDialog";
import GlossaryTermForm from "@/components/glossary/GlossaryTermForm";
import DetectNamesDialog from "@/components/glossary/DetectNamesDialog";
import TranslationSettingsDialog, { GENRE_OPTIONS } from "@/components/workspace/TranslationSettingsDialog";
import { discoverGlossary } from "@/lib/glossaryDiscovery.js";
import BatchReplaceDialog from "@/components/workspace/BatchReplaceDialog";
import PronounSwitcherDialog from "@/components/workspace/PronounSwitcherDialog";
import ChapterManagerDialog from "@/components/workspace/ChapterManagerDialog";
import ImportChaptersDialog from "@/components/workspace/ImportChaptersDialog";
import BatchEditDialog from "@/components/workspace/BatchEditDialog";
import TranslationWorkflowDialog from "@/components/workspace/TranslationWorkflowDialog";
import BatchBetaAiDialog from "@/components/workspace/BatchBetaAiDialog";
import BatchTitleEditDialog from "@/components/workspace/BatchTitleEditDialog";
import ConfirmDialog from "@/components/workspace/ConfirmDialog";
import QualityCheckDialog from "@/components/workspace/QualityCheckDialog";
import StoryQaDialog from "@/components/workspace/StoryQaDialog";
import BetaCheckDialog from "@/components/workspace/BetaCheckDialog";
import BetaReaderDialog from "@/components/workspace/BetaReaderDialog";
import StoryBetaReaderDialog from "@/components/workspace/StoryBetaReaderDialog";
import TargetedFixDialog from "@/components/workspace/TargetedFixDialog";
import StoryBetaDialog from "@/components/workspace/StoryBetaDialog";
import BulkColumnMoveDialog from "@/components/workspace/BulkColumnMoveDialog";
import ChapterPicker from "@/components/workspace/ChapterPicker";
import WorkflowProgress from "@/components/workspace/WorkflowProgress";
import QtCleanupDialog from "@/components/workspace/QtCleanupDialog";
import {
  exportAsTxt,
  exportAsDoc,
  exportGlossaryJson,
  exportChaptersCsv,
  exportChaptersTxt,
  exportChaptersDocx,
  exportChaptersPdf,
} from "@/lib/exportUtils";
import { callLLM, hasCustomAI, getProvider, chunkText, estimateCostUsd, fileToBase64 } from "@/lib/llm";
import ImageTranslateDialog from "@/components/workspace/ImageTranslateDialog";
import ContextualPronounDialog from "@/components/glossary/ContextualPronounDialog";
import AISettingsDialog from "@/components/workspace/AISettingsDialog";
import { buildPronounMatrixPrompt } from "@/lib/pronounMatrix";
import { diffTextChanges } from "@/lib/textDiff";
import { countForeignChars } from "@/lib/highlight";
import { applyQualitySuggestion, runQualityCheck } from "@/lib/qualityCheck";
import { applyBetaSuggestion, betaCandidatePayload, runBetaCheck } from "@/lib/betaCheck";
import { translateHanViet, supportsSelfTranslate } from "@/lib/hanviet";
import { addHanVietVocabulary, loadHanVietVocabulary, mergeHanVietVocabulary, removeHanVietVocabulary, saveHanVietVocabulary } from "@/lib/hanvietVocabulary";
import { applyRuleEdit } from "@/lib/ruleEdit";
import { applyReplacements, stripPoliteA } from "@/lib/textReplace";
import { cleanToolPartMarkers } from "@/lib/qtCleanup";
import { fetchAllPages } from "@/lib/paginate";
import { copyRichText } from "@/lib/clipboardHtml";
import { isDraftMode } from "@/lib/draftMode";
import { countVietnameseWords, summarizeChapterWordCounts } from "@/lib/chapterEditStats";
import { scanPronounInventory } from "@/lib/pronounInventory";
import { discoverPronounRules } from "@/lib/pronounDiscovery";
import { buildStoryLearningPrompt, isChapterLearningEnabled, mergeStoryLearning, parseStoryLearningResult } from "@/lib/storyLearning";
import { buildTranslationBootstrapPrompt, dedupeTranslationBootstrap, parseTranslationBootstrapResult } from "@/lib/translationBootstrap";
import { Loader2, ArrowLeft, Home, Plus, LogOut, List as ListIcon, Copy, Trash2, Pencil, Check, X as XIcon, BookOpen, PanelRightOpen, ShieldCheck, PenTool, MoreHorizontal, Send, MessageSquareText, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

const COLUMN_DEFS = {
  raw: { shortLabel: "Bản gốc" },
  qt: { shortLabel: "QT thô" },
  edited: { shortLabel: "Bản edit" },
};

const COLUMN_INDEX = { raw: 0, qt: 1, edited: 2 };

// Bound on how many chapters/glossary terms get pulled into memory in one
// session — a safety cap, not a normal ceiling (fetchAllPages already stops
// early once there's nothing left to page through).
const CHAPTER_FETCH_CAP = 5000;
const GLOSSARY_FETCH_CAP = 5000;
// In-memory full-chapter cache cap (avoids unbounded memory growth for very
// long novels browsed chapter-by-chapter in one session).
const CHAPTER_CACHE_LIMIT = 50;
// AI calls get chunked past this many characters so a chapter never blows
// past the provider's output token cap and gets silently truncated.
const AI_CHUNK_CHARS = 3000;

const snapshotOf = (ch) =>
  JSON.stringify({
    raw_original: ch?.raw_original || "",
    qt_raw: ch?.qt_raw || "",
    edited: ch?.edited || "",
  });

const changedContentFields = (chapter, savedSnapshot) => {
  const current = {
    raw_original: chapter?.raw_original || "",
    qt_raw: chapter?.qt_raw || "",
    edited: chapter?.edited || "",
  };
  if (!savedSnapshot) return current;
  let saved;
  try {
    saved = JSON.parse(savedSnapshot);
  } catch {
    return current;
  }
  return Object.fromEntries(
    Object.entries(current).filter(([field, value]) => saved[field] !== value)
  );
};

const capCache = (cache) => {
  while (cache.size > CHAPTER_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
};

const quickHash = (value) => {
  const text = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const stableSerialize = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

export default function Workspace() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [project, setProject] = useState(null);
  const aiChapterLearningEnabled = isChapterLearningEnabled(project?.style_toggles);
  // Lightweight chapter list: {id, title, chapter_order} only — full chapter
  // content (raw_original/qt_raw/edited) is fetched on demand per chapter.
  const [chapterList, setChapterList] = useState([]);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [editedChapterIds, setEditedChapterIds] = useState(new Set());
  const [editedWordCounts, setEditedWordCounts] = useState({});
  const [refreshingProgress, setRefreshingProgress] = useState(false);
  const [markingQa, setMarkingQa] = useState(false);
  const [glossaryTerms, setGlossaryTerms] = useState([]);
  const [hanVietVocabulary, setHanVietVocabulary] = useState(() => loadHanVietVocabulary());
  const [loading, setLoading] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState(["raw", "qt", "edited"]);
  const [mobileActiveCol, setMobileActiveCol] = useState("edited");
  const [saving, setSaving] = useState(false);
  const [draftMode] = useState(isDraftMode());
  const [checkingPronouns, setCheckingPronouns] = useState(false);
  const [pronounCheckDiff, setPronounCheckDiff] = useState(null);
  const [pronounCheckPreview, setPronounCheckPreview] = useState(null);
  const [pronounInventory, setPronounInventory] = useState(null);
  const [scanningPronounInventory, setScanningPronounInventory] = useState(false);
  const [pronounBootstrap, setPronounBootstrap] = useState(null);
  const [runningPronounBootstrap, setRunningPronounBootstrap] = useState(false);
  const [selfTranslating, setSelfTranslating] = useState(false);
  const [showSidebar, setShowSidebar] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const [panel1Mode, setPanel1Mode] = useState("view");
  const [panel2Mode, setPanel2Mode] = useState("view");
  const [panel3Mode, setPanel3Mode] = useState("edit");

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [showGlossaryForm, setShowGlossaryForm] = useState(false);
  const [editingTerm, setEditingTerm] = useState(null);
  const [prefillTerm, setPrefillTerm] = useState("");
  const [showBatchReplace, setShowBatchReplace] = useState(false);
  const [batchReplaceRunning, setBatchReplaceRunning] = useState(false);
  const [batchReplaceUndo, setBatchReplaceUndo] = useState(null);
  const [findTermTarget, setFindTermTarget] = useState(null);
  const [findTermLoading, setFindTermLoading] = useState(false);
  const [findTermResults, setFindTermResults] = useState(null);
  const [showPronoun, setShowPronoun] = useState(false);
  const [clearTarget, setClearTarget] = useState(null); // { field, label } | null
  const [showContextualPronoun, setShowContextualPronoun] = useState(false);
  const [showQualityCheck, setShowQualityCheck] = useState(false);
  const [showStoryQa, setShowStoryQa] = useState(false);
  const [storyQaRunning, setStoryQaRunning] = useState(false);
  const [storyQaReport, setStoryQaReport] = useState(null);
  const [qualityIssues, setQualityIssues] = useState([]);
  const qualityScannedChapterRef = useRef(null);
  const [qualityUndo, setQualityUndo] = useState(null);
  const [showBetaCheck, setShowBetaCheck] = useState(false);
  const [showStoryBeta, setShowStoryBeta] = useState(false);
  const [betaIssues, setBetaIssues] = useState([]);
  const betaScannedChapterRef = useRef(null);
  const [betaUndo, setBetaUndo] = useState(null);
  // "Beta reader AI" — free-form reading of the whole current chapter (not
  // bound to code-detected candidates or a fixed rule table like the other
  // AI checks): the model reads like an actual editor and can flag anything,
  // optionally guided by what QA already flagged as a hint, not a filter.
  const [showBetaReader, setShowBetaReader] = useState(false);
  const [betaReaderRunning, setBetaReaderRunning] = useState(false);
  const [betaReaderProgress, setBetaReaderProgress] = useState({ done: 0, total: 0 });
  const [betaReaderNotes, setBetaReaderNotes] = useState(null);
  const [betaReaderChapterId, setBetaReaderChapterId] = useState(null);
  // Set when the notes currently loaded came from the targeted-fix scan
  // below rather than a free read — shown above the note list so the user
  // remembers which description these matches are answering.
  const [betaReaderContextNote, setBetaReaderContextNote] = useState(null);
  // Batch counterpart — same free-form reading, looped across "toàn truyện"
  // or "N chương tiếp theo" from the chapter currently open. Suggestions
  // only, same as the single-chapter version: nothing is written until the
  // user opens a chapter from the report and applies a note there.
  const [showStoryBetaReader, setShowStoryBetaReader] = useState(false);
  const [runningStoryBetaReader, setRunningStoryBetaReader] = useState(false);
  const [storyBetaReaderFinished, setStoryBetaReaderFinished] = useState(false);
  const [storyBetaReaderProgress, setStoryBetaReaderProgress] = useState({ done: 0, total: 0, found: 0, skipped: 0, failed: 0, currentTitle: "" });
  const [storyBetaReaderErrors, setStoryBetaReaderErrors] = useState([]);
  const [storyBetaReaderReport, setStoryBetaReaderReport] = useState(null);
  const storyBetaReaderStopRef = useRef(false);
  // "Sửa theo mô tả" — the user states one specific correction in plain
  // language (an example they just read); AI finds and fixes only the
  // matching instances across the chosen scope, unlike the free-form Beta
  // reader above which reads everything for anything worth flagging.
  const [showTargetedFix, setShowTargetedFix] = useState(false);
  const [runningTargetedFix, setRunningTargetedFix] = useState(false);
  const [targetedFixFinished, setTargetedFixFinished] = useState(false);
  const [targetedFixProgress, setTargetedFixProgress] = useState({ done: 0, total: 0, found: 0, skipped: 0, failed: 0, currentTitle: "" });
  const [targetedFixErrors, setTargetedFixErrors] = useState([]);
  const [targetedFixReport, setTargetedFixReport] = useState(null);
  const targetedFixStopRef = useRef(false);
  const [betaAiRunning, setBetaAiRunning] = useState(false);
  const [storyBetaRunning, setStoryBetaRunning] = useState(false);
  const [storyBetaReport, setStoryBetaReport] = useState(null);
  // Popover shown when tapping a highlighted "lỗi nghi vấn" span in the
  // Bản Edit column — { items, x, y } | null. items are the (possibly
  // stacked) QA/Beta issue objects covering that text range, each tagged
  // with __kind so we know which apply handler to call.
  const [issuePopover, setIssuePopover] = useState(null);
  const issuePopoverRef = useRef(null);
  const [markingBeta, setMarkingBeta] = useState(false);
  const [aiBetaFindings, setAiBetaFindings] = useState({});
  const [showBatchBetaAi, setShowBatchBetaAi] = useState(false);
  const [batchBetaAiRunning, setBatchBetaAiRunning] = useState(false);
  const [batchBetaAiFinished, setBatchBetaAiFinished] = useState(false);
  const [batchBetaAiProgress, setBatchBetaAiProgress] = useState({ done: 0, total: 0, found: 0, skipped: 0, failed: 0, currentTitle: "" });
  const [batchBetaAiErrors, setBatchBetaAiErrors] = useState([]);
  const batchBetaAiStopRef = useRef(false);
  const [runningStoryPronounAi, setRunningStoryPronounAi] = useState(false);
  const [storyPronounAiFinished, setStoryPronounAiFinished] = useState(false);
  const [storyPronounAiProgress, setStoryPronounAiProgress] = useState({ done: 0, total: 0, found: 0, skipped: 0, failed: 0, currentTitle: "" });
  const [storyPronounAiErrors, setStoryPronounAiErrors] = useState([]);
  const [storyPronounAiReport, setStoryPronounAiReport] = useState(null);
  const storyPronounAiStopRef = useRef(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showChapterManager, setShowChapterManager] = useState(false);
  // Mobile-only "⋯" overflow menu for the header actions that don't fit a
  // 375px-wide row (QA/Beta scan, chapter manager, create, export, LilyBeta
  // sync, logout) — desktop keeps showing them inline.
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const headerMenuRef = useRef(null);
  const [showColumnMove, setShowColumnMove] = useState(false);
  const [movingColumns, setMovingColumns] = useState(false);
  const [columnMoveUndo, setColumnMoveUndo] = useState(null);
  const [showQtCleanup, setShowQtCleanup] = useState(false);
  const [qtCleanupRunning, setQtCleanupRunning] = useState(false);
  const [qtCleanupUndo, setQtCleanupUndo] = useState(null);
  const [chapterDeleteUndo, setChapterDeleteUndo] = useState(null);
  const [showImportChapters, setShowImportChapters] = useState(false);
  const [exportingChapters, setExportingChapters] = useState(false);
  const [exportingEdited, setExportingEdited] = useState(false);
  const [exportingSelected, setExportingSelected] = useState(false);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [showTranslationWorkflow, setShowTranslationWorkflow] = useState(false);
  const [translationBootstrapRunning, setTranslationBootstrapRunning] = useState(false);
  const [translationBootstrapSaving, setTranslationBootstrapSaving] = useState(false);
  const [translationBootstrapResult, setTranslationBootstrapResult] = useState(null);
  const [batchQtRunning, setBatchQtRunning] = useState(false);
  const [batchQtFinished, setBatchQtFinished] = useState(false);
  const [batchQtProgress, setBatchQtProgress] = useState({ done: 0, total: 0, translated: 0, skipped: 0, failed: 0, currentTitle: "" });
  const [batchQtErrors, setBatchQtErrors] = useState([]);
  const batchQtStopRef = useRef(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchFinished, setBatchFinished] = useState(false);
  const [batchProgress, setBatchProgress] = useState({
    done: 0,
    total: 0,
    edited: 0,
    skipped: 0,
    failed: 0,
    currentChapterId: null,
    currentTitle: "",
  });
  const [batchErrors, setBatchErrors] = useState([]);
  const batchStopRef = useRef(false);
  const [showBatchTitleEdit, setShowBatchTitleEdit] = useState(false);
  const [batchTitleRunning, setBatchTitleRunning] = useState(false);
  const [batchTitleFinished, setBatchTitleFinished] = useState(false);
  const [batchTitleProgress, setBatchTitleProgress] = useState({
    done: 0,
    total: 0,
    edited: 0,
    failed: 0,
    currentTitle: "",
  });
  const [batchTitleErrors, setBatchTitleErrors] = useState([]);
  const batchTitleStopRef = useRef(false);
  const [showDetectNames, setShowDetectNames] = useState(false);
  const [detectingNames, setDetectingNames] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState(null);
  const [discoveryWarnings, setDiscoveryWarnings] = useState([]);
  const [savingDiscoveredTerms, setSavingDiscoveredTerms] = useState(false);
  const discoveryStopRef = useRef(false);
  const discoveryContextRef = useRef(null);
  useEffect(() => () => { discoveryStopRef.current = true; }, [projectId]);
  const [nameCandidates, setNameCandidates] = useState(null);
  const [showTranslationSettings, setShowTranslationSettings] = useState(false);
  const [presets, setPresets] = useState([]);
  const [activePreset, setActivePreset] = useState(null);
  const [showImageTranslate, setShowImageTranslate] = useState(false);
  const [imageTranslating, setImageTranslating] = useState(false);
  const [imageResult, setImageResult] = useState(null); // { raw, translated } | null
  const [geminiEditing, setGeminiEditing] = useState(false);
  const [pronounSelection, setPronounSelection] = useState({
    text: "",
    start: 0,
    end: 0,
  });

  // AI-edit overwrite confirm + session-only undo (not persisted to DB —
  // keeping this out of the database is deliberate: it's disposable UI
  // state, not data worth spending storage quota on).
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false);
  const [aiUndo, setAiUndo] = useState(null); // { chapterId, previous }
  const pendingAiRunRef = useRef(null);

  const panelRefs = [useRef(null), useRef(null), useRef(null)];
  const isSyncing = useRef(false);

  // Session-only caches — never persisted, just avoid refetching the same
  // chapter twice while the user browses back and forth.
  const chapterCacheRef = useRef(new Map());
  const lastSavedRef = useRef(new Map());

  useEffect(() => {
    loadProjectData();
    // eslint-disable-next-line
  }, [projectId]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) setShowHeaderMenu(false);
      if (issuePopoverRef.current && !issuePopoverRef.current.contains(e.target)) setIssuePopover(null);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIssuePopover(null);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Fast pass: which chapters have a non-empty "edited" column — id-only
  // select, needed immediately for nav/progress UI (no chapter bodies).
  const loadEditedChapterIds = async () => {
    const edited = await fetchAllPages(
      (limit, skip) => Chapter.filterNonEmpty(
        { project_id: projectId },
        "edited",
        "chapter_order",
        limit,
        skip,
        ["chapter_order"]
      ),
      { pageSize: 500, maxItems: CHAPTER_FETCH_CAP }
    );
    setEditedChapterIds(new Set(edited.map((chapter) => chapter.id)));
  };

  // Heavy pass: actual word counts per edited chapter — this downloads the
  // full "edited" text column, so it's only run on demand (chapter picker
  // opened, or explicit "refresh progress" click), never on initial load.
  const wordCountsLoadedRef = useRef(false);
  const loadEditedWordCounts = async () => {
    const edited = await fetchAllPages(
      (limit, skip) => Chapter.filterNonEmpty(
        { project_id: projectId },
        "edited",
        "chapter_order",
        limit,
        skip,
        ["chapter_order", "edited"]
      ),
      { pageSize: 500, maxItems: CHAPTER_FETCH_CAP }
    );
    setEditedWordCounts(Object.fromEntries(edited.map((chapter) => [chapter.id, countVietnameseWords(chapter.edited)])));
    wordCountsLoadedRef.current = true;
  };

  const ensureWordCountsLoaded = () => {
    if (wordCountsLoadedRef.current) return;
    wordCountsLoadedRef.current = true;
    loadEditedWordCounts().catch(() => { wordCountsLoadedRef.current = false; });
  };

  const loadEditedProgress = async (showToast = false) => {
    setRefreshingProgress(true);
    try {
      await Promise.all([loadEditedChapterIds(), loadEditedWordCounts()]);
      if (showToast) toast({ title: "Đã làm mới tiến độ" });
    } catch (error) {
      if (showToast) toast({ title: "Không tải được tiến độ", description: error.message, variant: "destructive" });
    } finally {
      setRefreshingProgress(false);
    }
  };

  const loadProjectData = async () => {
    setLoading(true);
    try {
      const proj = await Project.get(projectId);
      setProject(proj);
      const vc = Array.isArray(proj.visible_columns) && proj.visible_columns.length
        ? proj.visible_columns
        : ["raw", "qt", "edited"];
      setVisibleColumns(vc);
      setMobileActiveCol(vc.includes("edited") ? "edited" : vc[0]);

      chapterCacheRef.current.clear();
      lastSavedRef.current.clear();
      wordCountsLoadedRef.current = false;
      setEditedWordCounts({});

      // Chapter list (lightweight: id/title/chapter_order only, never the
      // potentially-huge chapter bodies), glossary and presets are mutually
      // independent — fetch them concurrently instead of one after another.
      const [lightChapters, terms, presetList] = await Promise.all([
        fetchAllPages(
          (limit, skip) =>
            Chapter.filter(
              { project_id: projectId },
              "chapter_order",
              limit,
              skip,
              ["title", "chapter_order", "updated_date"]
            ),
          { pageSize: 500, maxItems: CHAPTER_FETCH_CAP }
        ),
        // Glossary must be loaded in full (not just the first page) — it's
        // used both for on-screen highlighting and injected into every AI
        // prompt, so a silently-truncated glossary would break the "AI must
        // follow 100% of glossary terms" guarantee. Paginating internally
        // keeps this correct without adding UI complexity.
        fetchAllPages(
          (limit, skip) =>
            GlossaryTerm.filter(
              { project_id: projectId },
              "-created_date",
              limit,
              skip
            ),
          { pageSize: 1000, maxItems: GLOSSARY_FETCH_CAP }
        ),
        // Prompt presets: a small personal library shared across all projects.
        PromptPreset.list("-created_date", 200),
      ]);

      setChapterList(lightChapters);
      if (lightChapters.length === CHAPTER_FETCH_CAP) {
        toast({
          title: "Dự án có rất nhiều chương",
          description: `Chỉ hiển thị ${CHAPTER_FETCH_CAP} chương đầu tiên trong phiên này.`,
        });
      }

      setGlossaryTerms(terms);
      if (terms.length === GLOSSARY_FETCH_CAP) {
        toast({
          title: "Từ điển rất lớn",
          description: `Chỉ tải ${GLOSSARY_FETCH_CAP} thuật ngữ đầu tiên trong phiên này.`,
        });
      }

      setPresets(presetList);
      if (proj.active_preset_id) {
        const active = presetList.find((p) => p.id === proj.active_preset_id);
        setActivePreset(active || null);
      } else {
        setActivePreset(null);
      }

      // First chapter body and the (id-only) edited-chapter set are also
      // independent — fetch them together.
      const [first] = await Promise.all([
        lightChapters.length > 0 ? Chapter.get(lightChapters[0].id) : Promise.resolve(null),
        loadEditedChapterIds(),
      ]);
      if (first) {
        chapterCacheRef.current.set(first.id, first);
        lastSavedRef.current.set(first.id, snapshotOf(first));
        setCurrentChapter(first);
      } else {
        setCurrentChapter(null);
      }
    } catch (e) {
      toast({
        title: "Lỗi tải dự án",
        description: e.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  // Save a chapter only if its content actually differs from what was last
  // persisted — skips the network/DB write entirely for a no-op autosave
  // tick (e.g. switching away without editing). In draft mode this is a
  // no-op unless `force` is set (the explicit "Lưu" button) — the whole
  // point of draft mode is "don't write anything unless I ask you to".
  const flushSave = async (chapter, force = false) => {
    if (!chapter?.id) return;
    if (draftMode && !force) return;
    const previousSnapshot = lastSavedRef.current.get(chapter.id);
    const snap = snapshotOf(chapter);
    if (previousSnapshot === snap) return;
    const changes = changedContentFields(chapter, previousSnapshot);
    if (Object.keys(changes).length === 0) return;
    try {
      // The browser already owns the current text, so autosave sends only
      // changed columns and asks Supabase for no full-row response.
      await Chapter.update(chapter.id, changes, { returning: false });
      lastSavedRef.current.set(chapter.id, snap);
      chapterCacheRef.current.set(chapter.id, chapter);
      if (Object.prototype.hasOwnProperty.call(changes, "edited")) {
        setChapterList((list) => list.map((meta) =>
          meta.id === chapter.id ? { ...meta, updated_date: new Date().toISOString() } : meta
        ));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // A deliberately small bridge for the personal Chrome extension. It only
  // exposes chapter metadata, reads source text and writes the `edited`
  // column. Existing workspace controls and editor behavior stay untouched.
  useEffect(() => {
    const respond = (detail) =>
      window.dispatchEvent(new CustomEvent("ETQ_BATCH_RESPONSE", { detail }));

    const onBatchRequest = (event) => {
      const request = event.detail || {};
      if (!request.id) return;
      (async () => {
        if (request.action === "list") {
          return {
            projectId,
            chapters: chapterList.map((meta, index) => {
              return {
                id: meta.id,
                index: index + 1,
                title: meta.title || `Chương ${index + 1}`,
                chapterOrder: meta.chapter_order ?? index,
              };
            }),
          };
        }

        if (request.action === "createWattpadTransfer") {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) throw new Error("Bạn cần đăng nhập lại để tạo mã chuyển.");
          const response = await fetch("/api/wattpad-transfer", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ action: "create", package: request.package }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || "Không tạo được mã chuyển.");
          return result;
        }

        const meta = chapterList.find((chapter) => chapter.id === request.chapterId);
        if (!meta) throw new Error("Chương không thuộc dự án đang mở.");
        if (currentChapter?.id === meta.id) await flushSave(currentChapter, true);
        // "write" needs the full row — it gets cached/set as currentChapter,
        // and a partial row there would silently blank out raw_original/
        // qt_raw for the rest of the app. "readEdited" (what packaging for
        // Wattpad actually uses, chapter by chapter across the whole book)
        // only ever reads `chapter.edited`, so it doesn't need the other two
        // text columns — this was fetching all 3 per chapter for no reason.
        let chapter;
        if (currentChapter?.id === meta.id) {
          chapter = { ...currentChapter };
        } else if (request.action === "readEdited") {
          const rows = await Chapter.filter({ id: meta.id }, null, 1, 0, ["title", "project_id", "updated_date", "edited"]);
          chapter = rows[0];
          if (!chapter) throw new Error("Không tìm thấy chương.");
        } else {
          chapter = await Chapter.get(meta.id);
        }
        if (chapter.project_id !== projectId) throw new Error("Không có quyền truy cập chương này.");

        if (request.action === "read") {
          const text = String(chapter.qt_raw || chapter.raw_original || "").trim();
          if (!text) throw new Error("Chương không có Bản QT hoặc Bản gốc để gửi.");
          return {
            chapterId: chapter.id,
            title: chapter.title || meta.title,
            text,
            hasEdited: Boolean(String(chapter.edited || "").trim()),
          };
        }

        if (request.action === "readEdited") {
          const text = String(chapter.edited || "").trim();
          if (!text) throw new Error("Chương chưa có Bản Edit để xuất.");
          return {
            chapterId: chapter.id,
            title: chapter.title || meta.title,
            text,
            hasEdited: true,
            updatedAt: chapter.updated_date || meta.updated_date || "",
          };
        }

        if (request.action === "write") {
          const text = String(request.text || "").trim();
          if (!text) throw new Error("Gemini trả về nội dung rỗng.");
          if (chapter.edited?.trim() && request.overwrite !== true) {
            throw new Error("Bản edit đã có nội dung; extension chưa được phép ghi đè.");
          }
          const updated = { ...chapter, edited: text };
          await Chapter.update(chapter.id, { edited: text }, { returning: false });
          lastSavedRef.current.set(chapter.id, snapshotOf(updated));
          chapterCacheRef.current.set(chapter.id, updated);
          capCache(chapterCacheRef.current);
          if (currentChapter?.id === chapter.id) setCurrentChapter(updated);
          setEditedChapterIds((current) => new Set(current).add(chapter.id));
          setEditedWordCounts((current) => ({ ...current, [chapter.id]: countVietnameseWords(text) }));
          return { chapterId: chapter.id, title: updated.title, saved: true };
        }

        throw new Error("Thao tác hàng loạt không hợp lệ.");
      })()
        .then((result) => respond({ id: request.id, ok: true, ...result }))
        .catch((error) => respond({ id: request.id, ok: false, error: error.message || String(error) }));
    };

    window.addEventListener("ETQ_BATCH_REQUEST", onBatchRequest);
    return () => window.removeEventListener("ETQ_BATCH_REQUEST", onBatchRequest);
    // Rebind when active chapter/list changes so the bridge always sees the
    // same data as the workspace without introducing global mutable state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, chapterList, currentChapter]);

  // Auto-save chapter (debounced, deduped against last-saved snapshot)
  useEffect(() => {
    if (!currentChapter?.id || draftMode) return;
    const timer = setTimeout(async () => {
      const snap = snapshotOf(currentChapter);
      if (lastSavedRef.current.get(currentChapter.id) === snap) return;
      setSaving(true);
      await flushSave(currentChapter);
      setSaving(false);
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [
    currentChapter?.id,
    currentChapter?.raw_original,
    currentChapter?.qt_raw,
    currentChapter?.edited,
  ]);

  useEffect(() => {
    if (!currentChapter?.id) return;
    setEditedChapterIds((current) => {
      const next = new Set(current);
      if (currentChapter.edited?.trim()) next.add(currentChapter.id);
      else next.delete(currentChapter.id);
      return next;
    });
    setEditedWordCounts((current) => {
      const count = countVietnameseWords(currentChapter.edited);
      if (count) return current[currentChapter.id] === count ? current : { ...current, [currentChapter.id]: count };
      if (!(currentChapter.id in current)) return current;
      const next = { ...current };
      delete next[currentChapter.id];
      return next;
    });
  }, [currentChapter?.id, currentChapter?.edited]);

  const switchChapter = async (chapterId) => {
    if (!chapterId || chapterId === currentChapter?.id) return;
    if (currentChapter) await flushSave(currentChapter);
    let target = chapterCacheRef.current.get(chapterId);
    if (!target) {
      try {
        target = await Chapter.get(chapterId);
        lastSavedRef.current.set(chapterId, snapshotOf(target));
      } catch (e) {
        toast({ title: "Lỗi tải chương", description: e.message, variant: "destructive" });
        return;
      }
    }
    // Delete-then-set bumps this entry to most-recently-used position (Map
    // iteration order follows insertion order, not last-write order).
    chapterCacheRef.current.delete(chapterId);
    chapterCacheRef.current.set(chapterId, target);
    capCache(chapterCacheRef.current);
    setCurrentChapter(target);
  };

  const handleToggleColumn = (col) => {
    if (visibleColumns.includes(col) && visibleColumns.length === 1) {
      toast({
        title: "Phải giữ ít nhất 1 cột hiển thị",
        variant: "destructive",
      });
      return;
    }
    const next = visibleColumns.includes(col)
      ? visibleColumns.filter((c) => c !== col)
      : [...visibleColumns, col];
    setVisibleColumns(next);
    if (!next.includes(mobileActiveCol)) {
      setMobileActiveCol(next.includes("edited") ? "edited" : next[0]);
    }
    handleUpdateProject({ visible_columns: next }).catch(() => {});
  };

  // Sync scroll
  const handlePanelScroll = (scrolledIndex) => {
    if (isSyncing.current) return;
    isSyncing.current = true;

    const visibleIndices = visibleColumns.map((c) => COLUMN_INDEX[c]);
    const source = panelRefs[scrolledIndex].current;
    if (!source) {
      isSyncing.current = false;
      return;
    }

    const sourceMax = source.getScrollHeight() - source.getClientHeight();
    const ratio = sourceMax > 0 ? source.getScrollTop() / sourceMax : 0;

    visibleIndices.forEach((i) => {
      if (i !== scrolledIndex && panelRefs[i].current) {
        const target = panelRefs[i].current;
        const targetMax =
          target.getScrollHeight() - target.getClientHeight();
        target.setScrollTop(ratio * targetMax);
      }
    });

    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  };

  // Term click → insert translation into Col3
  const handleTermClick = (term) => {
    const panel = panelRefs[2].current;
    if (!panel || !currentChapter) return;
    const textarea = panel.getScrollElement();
    if (!textarea) return;

    const start =
      textarea.selectionStart ?? (currentChapter.edited || "").length;
    const end = textarea.selectionEnd ?? (currentChapter.edited || "").length;
    const text = currentChapter.edited || "";
    const insert = term.translation + " ";
    const newText = text.substring(0, start) + insert + text.substring(end);
    setCurrentChapter({ ...currentChapter, edited: newText });

    setTimeout(() => {
      textarea.focus();
      const pos = start + insert.length;
      textarea.selectionStart = textarea.selectionEnd = pos;
    }, 0);

    setMobileActiveCol("edited");
    toast({
      title: `Đã chèn: ${term.translation}`,
      description: `Từ "${term.source_term}"`,
    });
  };

  // Quick add to glossary from selection
  const handleQuickAddGlossary = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) {
      toast({
        title: "Hãy bôi đen từ cần thêm! ✏️",
        variant: "destructive",
      });
      return;
    }
    setPrefillTerm(text);
    setEditingTerm(null);
    setShowGlossaryForm(true);
  };

  // Save glossary term
  const handleSaveTerm = async (termData) => {
    try {
      if (editingTerm) {
        await GlossaryTerm.update(editingTerm.id, termData);
        setGlossaryTerms((prev) =>
          prev.map((t) =>
            t.id === editingTerm.id ? { ...t, ...termData } : t
          )
        );
      } else {
        const created = await GlossaryTerm.create({
          ...termData,
          project_id: projectId,
        });
        setGlossaryTerms((prev) => [created, ...prev]);
      }
      setShowGlossaryForm(false);
      setEditingTerm(null);
      setPrefillTerm("");
      toast({ title: editingTerm ? "Đã cập nhật! ✨" : "Đã thêm thuật ngữ! 🌸" });
    } catch (e) {
      toast({
        title: "Lỗi lưu",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteTerm = async (termId) => {
    try {
      await GlossaryTerm.delete(termId);
      setGlossaryTerms((prev) => prev.filter((t) => t.id !== termId));
      toast({ title: "Đã xóa thuật ngữ" });
    } catch (e) {
      toast({
        title: "Lỗi xóa",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleBulkDeleteTerms = async (termIds) => {
    if (!termIds.length) return;
    try {
      await Promise.all(termIds.map((id) => GlossaryTerm.delete(id)));
      const idSet = new Set(termIds);
      setGlossaryTerms((prev) => prev.filter((t) => !idSet.has(t.id)));
      toast({ title: `Đã xóa ${termIds.length} thuật ngữ` });
    } catch (e) {
      toast({
        title: "Lỗi xóa hàng loạt",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateProject = async (updates) => {
    try {
      const updated = await Project.update(projectId, updates);
      setProject(updated);
      return updated;
    } catch (e) {
      toast({
        title: "Lỗi cập nhật",
        description: e.message,
        variant: "destructive",
      });
      throw e;
    }
  };

  const handleSaveTitle = async () => {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === project.title) return;
    try {
      await handleUpdateProject({ title: trimmed });
      toast({ title: "Đã đổi tên bộ truyện" });
    } catch {
      // handleUpdateProject already surfaced a toast
    }
  };

  // Which preset this project uses (id only persisted on Project; presets
  // themselves are a shared library across all projects).
  const handleSelectPreset = async (presetId) => {
    try {
      await handleUpdateProject({ active_preset_id: presetId || "" });
      setActivePreset(presetId ? presets.find((p) => p.id === presetId) || null : null);
    } catch {
      // handleUpdateProject already surfaced a toast
    }
  };

  const handleSavePreset = async (data, presetId) => {
    try {
      let saved;
      if (presetId) {
        saved = await PromptPreset.update(presetId, data);
        setPresets((prev) => prev.map((p) => (p.id === presetId ? saved : p)));
      } else {
        saved = await PromptPreset.create(data);
        setPresets((prev) => [saved, ...prev]);
      }
      if (project?.active_preset_id === saved.id) setActivePreset(saved);
      toast({ title: "Đã lưu preset! 🎭" });
      return saved;
    } catch (e) {
      toast({ title: "Lỗi lưu preset", description: e.message, variant: "destructive" });
      return null;
    }
  };

  const handleDeletePreset = async (presetId) => {
    try {
      await PromptPreset.delete(presetId);
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
      if (project?.active_preset_id === presetId) {
        await handleUpdateProject({ active_preset_id: "" });
        setActivePreset(null);
      }
      toast({ title: "Đã xóa preset" });
    } catch (e) {
      toast({ title: "Lỗi xóa preset", description: e.message, variant: "destructive" });
    }
  };

  const handleUpdateStyleToggles = (toggles) => {
    handleUpdateProject({
      style_toggles: {
        ...toggles,
        ...(project?.style_toggles?.workflow_progress
          ? { workflow_progress: project.style_toggles.workflow_progress }
          : {}),
      },
    }).catch(() => {});
  };

  // Batch replace (word-boundary aware, optional). `fields` lets callers
  // that only ever READ (never write back via chapterUpsertRow, which needs
  // all 3 text columns present or it would wipe the ones left out) trim the
  // select — QA/Beta scans only read `edited`, so they don't need to also
  // download raw_original+qt_raw for every chapter.
  const loadAllProjectChapters = (fields) => fetchAllPages(
    (limit, skip) => Chapter.filter({ project_id: projectId }, "chapter_order", limit, skip, fields),
    { pageSize: 500, maxItems: CHAPTER_FETCH_CAP }
  );

  const handlePreviewBatchRules = async (rules, target, wholeWord) => {
    setBatchReplaceRunning(true);
    try {
      if (currentChapter) await flushSave(currentChapter, true);
      // Read-only — only ever reads chapter[target], never writes, so unlike
      // the "apply" path below it doesn't need the other 2 text columns.
      const chapters = await loadAllProjectChapters(["title", "chapter_order", target]);
      const matches = chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        chapter_order: chapter.chapter_order,
        count: applyReplacements(chapter[target] || "", rules, { wholeWord }).count,
      })).filter((chapter) => chapter.count > 0);
      return { chapters: matches, totalMatches: matches.reduce((sum, chapter) => sum + chapter.count, 0) };
    } catch (error) {
      toast({ title: "Không quét được toàn truyện", description: error.message, variant: "destructive" });
      return { chapters: [], totalMatches: 0 };
    } finally {
      setBatchReplaceRunning(false);
    }
  };

  // Read-only cross-chapter lookup for one glossary term, so a user can
  // check whether an old (pre-glossary) translation of it was ever right
  // without doing a find/replace first — a replace overwrites the very text
  // they wanted to compare against.
  const handleFindTerm = async (term) => {
    const find = String(term?.source_term || "").trim();
    if (!find) return;
    setFindTermTarget(term);
    setFindTermResults(null);
    setFindTermLoading(true);
    try {
      if (currentChapter) await flushSave(currentChapter, true);
      const chapters = await loadAllProjectChapters(["title", "chapter_order", "raw_original", "qt_raw", "edited"]);
      const counts = (text) => applyReplacements(text || "", [{ find, replace: find }], { wholeWord: false }).count;
      const matches = chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        chapter_order: chapter.chapter_order,
        raw_original: counts(chapter.raw_original),
        qt_raw: counts(chapter.qt_raw),
        edited: counts(chapter.edited),
      })).filter((chapter) => chapter.raw_original + chapter.qt_raw + chapter.edited > 0);
      setFindTermResults({
        chapters: matches,
        totalMatches: matches.reduce((sum, chapter) => sum + chapter.raw_original + chapter.qt_raw + chapter.edited, 0),
      });
    } catch (error) {
      toast({ title: "Không quét được toàn truyện", description: error.message, variant: "destructive" });
      setFindTermResults({ chapters: [], totalMatches: 0 });
    } finally {
      setFindTermLoading(false);
    }
  };

  const handleOpenChapterFromFind = async (chapterId) => {
    setFindTermTarget(null);
    await switchChapter(chapterId);
  };

  const handleApplyBatchRules = async (rules, target, wholeWord, scope = "chapter") => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    if (scope === "story") {
      setBatchReplaceRunning(true);
      let updated = [];
      try {
        await flushSave(currentChapter, true);
        const chapters = await loadAllProjectChapters();
        const candidates = chapters.map((chapter) => {
          const result = applyReplacements(chapter[target] || "", rules, { wholeWord });
          return { chapter, ...result };
        }).filter((item) => item.count > 0);
        if (!candidates.length) {
          toast({ title: "Không còn vị trí nào cần thay" });
          return;
        }
        setBatchReplaceUndo({ target, rows:candidates.map(({ chapter }) => chapterUpsertRow(chapter)) });
        const changedRows = candidates.map(({ chapter, text }) => chapterUpsertRow({ ...chapter, [target]:text }));
        for (let index = 0; index < changedRows.length; index += 200) {
          // eslint-disable-next-line no-await-in-loop
          updated = updated.concat(await Chapter.bulkUpsert(changedRows.slice(index, index + 200)));
        }
        updated.forEach((chapter) => {
          chapterCacheRef.current.set(chapter.id, chapter);
          lastSavedRef.current.set(chapter.id, snapshotOf(chapter));
        });
        capCache(chapterCacheRef.current);
        const active = updated.find((chapter) => chapter.id === currentChapter.id);
        if (active) setCurrentChapter(active);
        const total = candidates.reduce((sum, item) => sum + item.count, 0);
        toast({ title: `Đã sửa ${candidates.length} chương`, description: `${total} vị trí đã được thay thế. Có thể hoàn tác trong cửa sổ này.` });
      } catch (error) {
        toast({ title: updated.length ? `Đã sửa ${updated.length} chương rồi gặp lỗi` : "Không thể thay thế toàn truyện", description:error.message, variant:"destructive" });
      } finally {
        setBatchReplaceRunning(false);
      }
      return;
    }
    const { text, count } = applyReplacements(currentChapter[target] || "", rules, { wholeWord });
    setCurrentChapter({ ...currentChapter, [target]: text });
    toast({
      title: "Đã thay thế hàng loạt! 🔄",
      description: `${count} lần thay thế`,
    });
  };

  const handleUndoBatchRules = async () => {
    if (!batchReplaceUndo?.rows?.length) return;
    setBatchReplaceRunning(true);
    try {
      let restored = [];
      for (let index = 0; index < batchReplaceUndo.rows.length; index += 200) {
        // eslint-disable-next-line no-await-in-loop
        restored = restored.concat(await Chapter.bulkUpsert(batchReplaceUndo.rows.slice(index, index + 200)));
      }
      restored.forEach((chapter) => {
        chapterCacheRef.current.set(chapter.id, chapter);
        lastSavedRef.current.set(chapter.id, snapshotOf(chapter));
      });
      const active = restored.find((chapter) => chapter.id === currentChapter?.id);
      if (active) setCurrentChapter(active);
      setBatchReplaceUndo(null);
      toast({ title: `Đã hoàn tác ${restored.length} chương` });
    } catch (error) {
      toast({ title:"Không thể hoàn tác", description:error.message, variant:"destructive" });
    } finally {
      setBatchReplaceRunning(false);
    }
  };

  // Pronoun switch (word-boundary aware, optional)
  const handleApplyPronounRule = (rule, target, wholeWord) => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const pairRules = (rule.from_words || []).map((from, i) => ({
      find: from,
      replace: (rule.to_words || [])[i] || from,
    }));
    if (target === "edited" && pronounSelection.text) {
      const { text: replaced } = applyReplacements(pronounSelection.text, pairRules, { wholeWord });
      const full = currentChapter.edited || "";
      const newText =
        full.substring(0, pronounSelection.start) +
        replaced +
        full.substring(pronounSelection.end);
      setCurrentChapter({ ...currentChapter, edited: newText });
      setPronounSelection({ text: "", start: 0, end: 0 });
    } else {
      const { text } = applyReplacements(currentChapter[target] || "", pairRules, { wholeWord });
      setCurrentChapter({ ...currentChapter, [target]: text });
    }
    toast({ title: `Đã đổi xưng hô: ${rule.name} 👥` });
  };

  const qualityOptions = () => ({
    glossaryTerms,
    pronounRules: project?.contextual_pronoun_rules || [],
    narrativeRules: project?.style_toggles?.story_memory?.narrativeRules || [],
    qaSettings: project?.style_toggles?.qa_settings || {},
  });

  const handleSaveQaSettings = async (qaSettings) => {
    await handleUpdateProject({ style_toggles:{ ...(project?.style_toggles || {}), qa_settings:qaSettings } });
  };

  // Recomputes issues for just the chapters a fix/ignore action actually
  // touched and merges them back into the existing story-wide report —
  // avoids re-fetching + rescanning every chapter in the project (a
  // select('*') of every chapter's text) after every single QA click, which
  // was the single biggest Supabase egress driver in the app. `chapters`
  // here already have their fresh `edited` text in memory (from the
  // bulkUpsert response), so this costs zero network calls.
  const patchStoryQaReportForChapters = (chapters, qaSettings) => {
    setStoryQaReport((report) => {
      if (!report) return report;
      const options = { glossaryTerms, pronounRules: project?.contextual_pronoun_rules || [], narrativeRules: project?.style_toggles?.story_memory?.narrativeRules || [], qaSettings };
      const touched = new Map(chapters.map((c) => [c.id, c]));
      const groupMap = new Map();
      report.groups.forEach((g) => {
        const locations = (g.locations || []).filter((loc) => !touched.has(loc.chapterId));
        if (locations.length) groupMap.set(g.key, { ...g, locations, chapterIds: new Set(locations.map((l) => l.chapterId)) });
      });
      const chapterResults = report.chapters.filter((c) => !touched.has(c.id));
      touched.forEach((chapter) => {
        const rawIssues = String(chapter.edited || "").trim() ? runQualityCheck(chapter.edited, options) : [];
        const issues = qaSettings.hidePronounNarrative ? rawIssues.filter((i) => i.type !== "pronoun" && i.type !== "narrative") : rawIssues;
        issues.forEach((issue) => {
          const key = [issue.type, issue.label, issue.value, issue.replacement || "", issue.contextual ? "context" : "direct", issue.confidence || ""].join("\u0001");
          const group = groupMap.get(key) || { key, type: issue.type, label: issue.label, value: issue.value, replacement: issue.replacement || "", contextual: Boolean(issue.contextual), confidence: issue.confidence, severity: issue.severity, locations: [], chapterIds: new Set() };
          group.locations.push({ id: `${chapter.id}:${issue.start}:${issue.end}`, chapterId: chapter.id, chapterTitle: chapter.title, chapter_order: chapter.chapter_order, line: issue.line, context: issue.context, start: issue.start, end: issue.end, value: issue.value });
          group.chapterIds.add(chapter.id);
          groupMap.set(key, group);
        });
        const labels = [...new Set(issues.map((issue) => issue.label))];
        if (issues.length) chapterResults.push({ id: chapter.id, title: chapter.title, chapter_order: chapter.chapter_order, count: issues.length, summary: labels.slice(0, 3).join(" · ") });
      });
      const groups = [...groupMap.values()].map((g) => ({ ...g, count: g.locations.length, chapterCount: g.chapterIds.size, chapterIds: [...g.chapterIds] })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      chapterResults.sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0));
      const next = { ...report, chapters: chapterResults, groups, issueCount: chapterResults.reduce((sum, c) => sum + c.count, 0) };
      localStorage.setItem(`etq-story-qa:${projectId}`, JSON.stringify(next));
      return next;
    });
  };

  // Same idea for an ignore action: no chapter text changes, so just drop
  // the ignored group's locations from the report locally instead of
  // rescanning the whole story.
  const dropStoryQaGroupLocally = (group) => {
    setStoryQaReport((report) => {
      if (!report) return report;
      const removedByChapter = new Map();
      (group.locations || []).forEach((loc) => removedByChapter.set(loc.chapterId, (removedByChapter.get(loc.chapterId) || 0) + 1));
      const groups = report.groups.filter((g) => g.key !== group.key);
      const chapters = report.chapters
        .map((c) => (removedByChapter.has(c.id) ? { ...c, count: c.count - removedByChapter.get(c.id) } : c))
        .filter((c) => c.count > 0);
      const next = { ...report, groups, chapters, issueCount: groups.reduce((sum, g) => sum + g.count, 0) };
      localStorage.setItem(`etq-story-qa:${projectId}`, JSON.stringify(next));
      return next;
    });
  };

  const handleScanStoryQa = async (qaSettings) => {
    setStoryQaRunning(true);
    try {
      if (currentChapter) await flushSave(currentChapter, true);
      const chapters = await loadAllProjectChapters(["title", "chapter_order", "edited"]);
      const options = { glossaryTerms, pronounRules:project?.contextual_pronoun_rules || [], narrativeRules: project?.style_toggles?.story_memory?.narrativeRules || [], qaSettings };
      const issueGroups = new Map();
      const results = chapters.map((chapter) => {
        const rawIssues = String(chapter.edited || "").trim() ? runQualityCheck(chapter.edited, options) : [];
        const issues = qaSettings.hidePronounNarrative ? rawIssues.filter((i) => i.type !== "pronoun" && i.type !== "narrative") : rawIssues;
        issues.forEach((issue) => {
          const key = [issue.type, issue.label, issue.value, issue.replacement || "", issue.contextual ? "context" : "direct", issue.confidence || ""].join("\u0001");
          const group = issueGroups.get(key) || { key, type:issue.type, label:issue.label, value:issue.value, replacement:issue.replacement || "", contextual:Boolean(issue.contextual), confidence:issue.confidence, severity:issue.severity, count:0, chapterIds:new Set(), samples:[], locations:[] };
          group.count += 1; group.chapterIds.add(chapter.id);
          group.locations.push({ id:`${chapter.id}:${issue.start}:${issue.end}`, chapterId:chapter.id, chapterTitle:chapter.title, chapter_order:chapter.chapter_order, line:issue.line, context:issue.context, start:issue.start, end:issue.end, value:issue.value });
          if (group.samples.length < 6) group.samples.push({ chapterId:chapter.id, chapterTitle:chapter.title, chapter_order:chapter.chapter_order, line:issue.line, context:issue.context });
          issueGroups.set(key, group);
        });
        const groups = [...new Set(issues.map((issue) => issue.label))];
        return { id:chapter.id, title:chapter.title, chapter_order:chapter.chapter_order, count:issues.length, summary:groups.slice(0,3).join(" · ") };
      }).filter((chapter) => chapter.count > 0);
      const groups = [...issueGroups.values()].map((group) => ({ ...group, chapterCount:group.chapterIds.size, chapterIds:[...group.chapterIds] })).sort((a,b)=>b.count-a.count || a.label.localeCompare(b.label));
      const report = { scannedAt:new Date().toISOString(), chapters:results, groups, issueCount:results.reduce((sum,chapter)=>sum+chapter.count,0) };
      setStoryQaReport(report);
      localStorage.setItem(`etq-story-qa:${projectId}`, JSON.stringify(report));
      toast({ title:`Đã quét QA ${chapters.length} chương`, description:`Còn ${report.issueCount} lỗi/nghi vấn trong ${results.length} chương.` });
    } catch (error) {
      toast({ title:"Không quét được QA toàn truyện", description:error.message, variant:"destructive" });
    } finally { setStoryQaRunning(false); }
  };

  const handleStoryQaBulkReplace = async (group, replacement, qaSettings, selectedIds = [], remember = false) => {
    const next = String(replacement || "").trim();
    if (!next || !group?.value) return;
    const selected = new Set(selectedIds);
    const locations = (group.locations || []).filter((item) => !selected.size || selected.has(item.id));
    setBatchReplaceRunning(true);
    try {
      if (currentChapter) await flushSave(currentChapter, true);
      const ids = [...new Set(locations.map((item) => item.chapterId))];
      const chapters = await Chapter.getMany(ids);
      setBatchReplaceUndo({ target:"edited", rows:chapters.map(chapterUpsertRow) });
      const changedRows = chapters.map((chapter) => {
        const positions = locations.filter((item) => item.chapterId === chapter.id).sort((a,b)=>b.start-a.start);
        const edited = positions.reduce((text,item) => text.slice(item.start,item.end) === item.value ? text.slice(0,item.start)+next+text.slice(item.end) : text, chapter.edited || "");
        return chapterUpsertRow({ ...chapter, edited });
      });
      let updated=[];
      for(let index=0;index<changedRows.length;index+=200){updated=updated.concat(await Chapter.bulkUpsert(changedRows.slice(index,index+200)));}
      updated.forEach((chapter)=>{chapterCacheRef.current.set(chapter.id,chapter);lastSavedRef.current.set(chapter.id,snapshotOf(chapter));});
      const active=updated.find((chapter)=>chapter.id===currentChapter?.id);if(active)setCurrentChapter(active);
      let settingsAfterDecision = qaSettings;
      if (remember) {
        const forbiddenWords = [...(qaSettings.forbiddenWords || []).filter((item)=>String(typeof item==="string"?item:item.find).toLocaleLowerCase("vi")!==group.value.toLocaleLowerCase("vi")), { find:group.value, replace:next }];
        settingsAfterDecision = { ...qaSettings, forbiddenWords };
        await handleSaveQaSettings(settingsAfterDecision);
      }
      toast({title:`Đã thay ${locations.length} vị trí trong ${updated.length} chương`,description:remember?"Đã ghi nhớ thành quy tắc QA của truyện.":"Có thể hoàn tác trong Trung tâm QA."});
      patchStoryQaReportForChapters(updated, settingsAfterDecision);
    } catch(error){toast({title:"Không thể áp dụng các vị trí đã chọn",description:error.message,variant:"destructive"});}
    finally{setBatchReplaceRunning(false);}
  };

  const handleStoryQaIgnore = async (group, qaSettings, remember) => {
    if (!remember) return;
    const allowedWords=[...new Set([...(qaSettings.allowedWords||[]),group.value])];
    const next={...qaSettings,allowedWords};await handleSaveQaSettings(next);dropStoryQaGroupLocally(group);
  };

  const isSafeStoryQaGroup = (group) =>
    group.severity !== "review" &&
    !group.contextual &&
    String(group.replacement || "").trim() &&
    group.replacement !== group.value;

  // Pronoun groups are always severity "review" (excluded from
  // isSafeStoryQaGroup on purpose — that predicate is for issues nobody
  // needed to read context for). But scanContextualAddress already resolved
  // self/target role from sentence position *before* setting `replacement`,
  // so a pronoun group with a concrete replacement here has already passed
  // that context check — it just needs its own bulk action, not the "safe"
  // one, so it stays a deliberate, confirmable, separately-labeled step.
  // Restricted to confidence "cao": scanContextualAddress also resolves
  // speaker/listener from looser session inference (no explicit "với" tag,
  // or no tag at all) at lower confidence — those need a human glance per
  // location, not a blind bulk apply, so they're deliberately left out of
  // this button and only reachable through the per-group "Thay N/M vị trí".
  const isPronounFixableStoryQaGroup = (group) =>
    group.type === "pronoun" &&
    group.confidence === "cao" &&
    String(group.replacement || "").trim() &&
    group.replacement !== group.value;

  // Applies every group with an unambiguous replacement across the whole
  // story in one DB pass, instead of the group-by-group "Thay N/M vị trí"
  // flow — same position-verify-before-write safety as handleStoryQaBulkReplace.
  const handleStoryQaApplyAllSafe = async (qaSettings) => {
    const safeGroups = (storyQaReport?.groups || []).filter(isSafeStoryQaGroup);
    if (!safeGroups.length) {
      toast({ title: "Không có lỗi an toàn nào để sửa tự động" });
      return;
    }
    setBatchReplaceRunning(true);
    try {
      if (currentChapter) await flushSave(currentChapter, true);
      const byChapter = new Map();
      safeGroups.forEach((group) => {
        (group.locations || []).forEach((location) => {
          const list = byChapter.get(location.chapterId) || [];
          list.push({ start: location.start, end: location.end, value: location.value, replacement: group.replacement });
          byChapter.set(location.chapterId, list);
        });
      });
      const ids = [...byChapter.keys()];
      const chapters = await Chapter.getMany(ids);
      setBatchReplaceUndo({ target: "edited", rows: chapters.map(chapterUpsertRow) });
      const changedRows = chapters.map((chapter) => {
        const positions = (byChapter.get(chapter.id) || []).sort((a, b) => b.start - a.start);
        const edited = positions.reduce(
          (text, item) => (text.slice(item.start, item.end) === item.value ? text.slice(0, item.start) + item.replacement + text.slice(item.end) : text),
          chapter.edited || ""
        );
        return chapterUpsertRow({ ...chapter, edited });
      });
      let updated = [];
      for (let index = 0; index < changedRows.length; index += 200) {
        updated = updated.concat(await Chapter.bulkUpsert(changedRows.slice(index, index + 200)));
      }
      updated.forEach((chapter) => { chapterCacheRef.current.set(chapter.id, chapter); lastSavedRef.current.set(chapter.id, snapshotOf(chapter)); });
      const active = updated.find((chapter) => chapter.id === currentChapter?.id);
      if (active) setCurrentChapter(active);
      const totalOccurrences = safeGroups.reduce((sum, group) => sum + (group.locations?.length || 0), 0);
      toast({ title: `Đã sửa ${totalOccurrences} vị trí an toàn trong ${updated.length} chương`, description: "Có thể hoàn tác trong Trung tâm QA." });
      patchStoryQaReportForChapters(updated, qaSettings);
    } catch (error) {
      toast({ title: "Không thể sửa tất cả lỗi an toàn", description: error.message, variant: "destructive" });
    } finally {
      setBatchReplaceRunning(false);
    }
  };

  // Story-wide bulk fix for pronoun groups specifically — same mechanics as
  // handleStoryQaApplyAllSafe (position-verify-before-write, bulkUpsert,
  // undo snapshot, cache sync), just a different group filter. Kept as its
  // own action (not folded into "safe") since the caller is expected to
  // confirm explicitly before this runs — pronoun fixes rest on the Ma Trận
  // being correct, which "safe" fixes (glossary/CJK/name typos) don't.
  const handleStoryQaApplyAllPronoun = async (qaSettings) => {
    const pronounGroups = (storyQaReport?.groups || []).filter(isPronounFixableStoryQaGroup);
    if (!pronounGroups.length) {
      toast({ title: "Không có gợi ý xưng hô nào để sửa hàng loạt" });
      return;
    }
    setBatchReplaceRunning(true);
    try {
      if (currentChapter) await flushSave(currentChapter, true);
      const byChapter = new Map();
      pronounGroups.forEach((group) => {
        (group.locations || []).forEach((location) => {
          const list = byChapter.get(location.chapterId) || [];
          list.push({ start: location.start, end: location.end, value: location.value, replacement: group.replacement });
          byChapter.set(location.chapterId, list);
        });
      });
      const ids = [...byChapter.keys()];
      const chapters = await Chapter.getMany(ids);
      setBatchReplaceUndo({ target: "edited", rows: chapters.map(chapterUpsertRow) });
      const changedRows = chapters.map((chapter) => {
        const positions = (byChapter.get(chapter.id) || []).sort((a, b) => b.start - a.start);
        const edited = positions.reduce(
          (text, item) => (text.slice(item.start, item.end) === item.value ? text.slice(0, item.start) + item.replacement + text.slice(item.end) : text),
          chapter.edited || ""
        );
        return chapterUpsertRow({ ...chapter, edited });
      });
      let updated = [];
      for (let index = 0; index < changedRows.length; index += 200) {
        updated = updated.concat(await Chapter.bulkUpsert(changedRows.slice(index, index + 200)));
      }
      updated.forEach((chapter) => { chapterCacheRef.current.set(chapter.id, chapter); lastSavedRef.current.set(chapter.id, snapshotOf(chapter)); });
      const active = updated.find((chapter) => chapter.id === currentChapter?.id);
      if (active) setCurrentChapter(active);
      const totalOccurrences = pronounGroups.reduce((sum, group) => sum + (group.locations?.length || 0), 0);
      toast({ title: `Đã sửa ${totalOccurrences} vị trí xưng hô trong ${updated.length} chương`, description: "Có thể hoàn tác trong Trung tâm QA." });
      patchStoryQaReportForChapters(updated, qaSettings);
    } catch (error) {
      toast({ title: "Không thể sửa hàng loạt xưng hô", description: error.message, variant: "destructive" });
    } finally {
      setBatchReplaceRunning(false);
    }
  };

  // Story-wide counterpart of handleTranslateQualityIssue: a group here has
  // no contextTargetStart/End (those only exist on a single chapter's live
  // scan), so the target span is found by locating group.value inside the
  // first location's saved context instead of relying on a live textarea
  // selection.
  const handleTranslateStoryQaGroup = async (group) => {
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return "";
    }
    const location = group.locations?.[0];
    const context = location?.context || group.value;
    const idx = context.indexOf(group.value);
    const start = idx === -1 ? 0 : idx;
    const end = start + group.value.length;
    try {
      const markedContext = idx === -1 ? context : `${context.slice(0, start)}【${context.slice(start, end)}】${context.slice(end)}`;
      const prompt = `Câu tiếng Việt dưới đây còn sót chữ Hán/Anh. Phần cần dịch lại được đánh dấu bằng 【】.\n\nHãy dịch hoặc biên tập CHỈ phần trong 【】 thành một cụm tiếng Việt tự nhiên, đúng nghĩa trong toàn câu. Không dịch từng chữ theo nghĩa từ điển nếu làm câu vô nghĩa. Có thể dùng âm Hán–Việt khi đó là thành ngữ, tên gọi hoặc cách ghép tự nhiên. Phần ngoài 【】 chỉ là ngữ cảnh và phải được giữ nguyên.\n\nChỉ trả về nội dung thay thế cho phần trong 【】, không giải thích, không dấu ngoặc và không câu dẫn.\n\nPhần đã chọn: ${group.value}\nCâu có đánh dấu: ${markedContext}`;
      const result = await callLLM(prompt);
      return String(result || "").trim().replace(/^['\"“”]+|['\"“”]+$/g, "");
    } catch (error) {
      toast({ title: "Không dịch được từ", description: error.message, variant: "destructive" });
      return "";
    }
  };

  useEffect(() => {
    try { setStoryQaReport(JSON.parse(localStorage.getItem(`etq-story-qa:${projectId}`) || "null")); }
    catch { setStoryQaReport(null); }
  }, [projectId]);

  useEffect(() => {
    if (!storyQaReport || !currentChapter?.id || qualityScannedChapterRef.current !== currentChapter.id) return;
    const issues = qualityIssues;
    const summary = [...new Set(issues.map((issue) => issue.label))].slice(0,3).join(" · ");
    const old = storyQaReport.chapters.find((chapter) => chapter.id === currentChapter.id);
    if ((old?.count || 0) === issues.length && (old?.summary || "") === summary) return;
    const meta = chapterList.find((chapter) => chapter.id === currentChapter.id) || currentChapter;
    const chapters = storyQaReport.chapters.filter((chapter) => chapter.id !== currentChapter.id);
    if (issues.length) chapters.push({ id:currentChapter.id, title:meta.title, chapter_order:meta.chapter_order, count:issues.length, summary });
    chapters.sort((a,b)=>(a.chapter_order ?? 0)-(b.chapter_order ?? 0));
    const next = { ...storyQaReport, chapters, issueCount:chapters.reduce((sum,chapter)=>sum+chapter.count,0), groupsStale:true };
    setStoryQaReport(next);
    localStorage.setItem(`etq-story-qa:${projectId}`, JSON.stringify(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualityIssues, currentChapter?.id]);

  // Keep the QA badge live even when the dialog has never been opened. A
  // short debounce avoids rescanning on every keystroke while the user types.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const text = currentChapter?.edited || "";
      qualityScannedChapterRef.current = currentChapter?.id || null;
      setQualityIssues(text.trim() ? runQualityCheck(text, qualityOptions()) : []);
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter?.edited, glossaryTerms, project?.contextual_pronoun_rules]);

  const handleOpenQualityCheck = () => {
    const text = currentChapter?.edited || "";
    if (!text.trim()) {
      toast({ title: "Bản Edit đang trống", description: "Chưa có nội dung để kiểm tra QA." });
      return;
    }
    setQualityIssues(runQualityCheck(text, qualityOptions()));
    setShowQualityCheck(true);
  };

  const handleApplyQualitySuggestion = (issueList, replacement) => {
    if (!currentChapter) return;
    try {
      const previous = currentChapter.edited || "";
      const applicable = (Array.isArray(issueList) ? issueList : [issueList])
        .filter((issue) => previous.slice(issue.start, issue.end) === issue.value)
        .sort((a, b) => b.start - a.start);
      if (!applicable.length) throw new Error("Các vị trí đề xuất đã thay đổi. Hãy quét QA lại.");
      const next = applicable.reduce((text, issue) => applyQualitySuggestion(text, issue, String(replacement || "")), previous);
      setQualityUndo({ chapterId: currentChapter.id, previous });
      setCurrentChapter({ ...currentChapter, edited: next });
      setQualityIssues(runQualityCheck(next, qualityOptions()));
      toast({ title: `Đã áp dụng ${applicable.length} vị trí QA`, description: "Có thể hoàn tác ngay trong cửa sổ QA." });
    } catch (error) {
      toast({ title: "Không thể áp dụng", description: error.message, variant: "destructive" });
      setQualityIssues(runQualityCheck(currentChapter.edited || "", qualityOptions()));
    }
  };

  // "Safe" = a QA issue with a single, unambiguous replacement the scanner
  // already computed (glossary/CJK/name matches, or an English word with a
  // known suggestion) — never a contextual (Xưng hô) or "review"-severity
  // issue, since those explicitly require reading the surrounding sentence.
  const isSafeQualityIssue = (issue) =>
    issue.severity !== "review" &&
    !issue.contextual &&
    String(issue.replacement || "").trim() &&
    issue.replacement !== issue.value;

  const handleApplyAllSafeQuality = () => {
    if (!currentChapter) return;
    const previous = currentChapter.edited || "";
    const safeIssues = qualityIssues.filter(isSafeQualityIssue);
    if (!safeIssues.length) {
      toast({ title: "Không có lỗi an toàn nào để sửa tự động" });
      return;
    }
    try {
      const applicable = safeIssues
        .filter((issue) => previous.slice(issue.start, issue.end) === issue.value)
        .sort((a, b) => b.start - a.start);
      if (!applicable.length) throw new Error("Các vị trí đề xuất đã thay đổi. Hãy quét QA lại.");
      const next = applicable.reduce(
        (text, issue) => applyQualitySuggestion(text, issue, String(issue.replacement)),
        previous
      );
      setQualityUndo({ chapterId: currentChapter.id, previous });
      setCurrentChapter({ ...currentChapter, edited: next });
      const remaining = runQualityCheck(next, qualityOptions());
      setQualityIssues(remaining);
      toast({
        title: `Đã sửa ${applicable.length} lỗi an toàn`,
        description: remaining.length
          ? `Còn ${remaining.length} lỗi/nghi vấn cần xem ngữ cảnh trước khi sửa.`
          : "Chương không còn lỗi QA nào.",
      });
    } catch (error) {
      toast({ title: "Không thể sửa tự động", description: error.message, variant: "destructive" });
      setQualityIssues(runQualityCheck(currentChapter.edited || "", qualityOptions()));
    }
  };

  const handleTranslateQualityIssue = async (group, selection) => {
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return "";
    }
    try {
      const selectedText = selection?.text || group.value;
      const relativeStart = Number.isInteger(selection?.start)
        ? selection.start
        : group.contextTargetStart;
      const relativeEnd = Number.isInteger(selection?.end)
        ? selection.end
        : group.contextTargetEnd;
      const markedContext = `${group.context.slice(0, relativeStart)}【${group.context.slice(relativeStart, relativeEnd)}】${group.context.slice(relativeEnd)}`;
      const prompt = `Câu tiếng Việt dưới đây còn sót chữ Hán/Anh. Phần người dùng muốn dịch lại được đánh dấu bằng 【】.\n\nHãy dịch hoặc biên tập CHỈ phần trong 【】 thành một cụm tiếng Việt tự nhiên, đúng nghĩa trong toàn câu. Không dịch từng chữ theo nghĩa từ điển nếu làm câu vô nghĩa. Có thể dùng âm Hán–Việt khi đó là thành ngữ, tên gọi hoặc cách ghép tự nhiên. Phần ngoài 【】 chỉ là ngữ cảnh và phải được giữ nguyên.\n\nChỉ trả về nội dung thay thế cho phần trong 【】, không giải thích, không dấu ngoặc và không câu dẫn.\n\nPhần đã chọn: ${selectedText}\nCâu có đánh dấu: ${markedContext}`;
      const result = await callLLM(prompt);
      return String(result || "").trim().replace(/^['\"“”]+|['\"“”]+$/g, "");
    } catch (error) {
      toast({ title: "Không dịch được từ", description: error.message, variant: "destructive" });
      return "";
    }
  };

  const handleUndoQualitySuggestion = () => {
    if (!currentChapter || qualityUndo?.chapterId !== currentChapter.id) return;
    const previous = qualityUndo.previous;
    setCurrentChapter({ ...currentChapter, edited: previous });
    setQualityIssues(runQualityCheck(previous, qualityOptions()));
    setQualityUndo(null);
    toast({ title: "Đã hoàn tác thay đổi QA" });
  };

  const handleLocateQualityIssue = (issue) => {
    setShowQualityCheck(false);
    setMobileActiveCol("edited");
    setPanel3Mode("edit");
    window.setTimeout(() => {
      const textarea = document.querySelector("[data-etq-panel='final'] [data-etq-role='edit-content']");
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      textarea.focus();
      textarea.setSelectionRange(issue.start, issue.end);
      const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 32;
      textarea.scrollTop = Math.max(0, (issue.line - 3) * lineHeight);
    }, 80);
  };

  const betaSettings = () => project?.style_toggles?.beta_settings || { longSentence:180, longParagraph:900, rules:[], ignored:[] };
  const handleSaveBetaSettings = async (settings) => handleUpdateProject({ style_toggles:{ ...(project?.style_toggles || {}), beta_settings:settings } });

  // Findings from "AI xem câu khó" (manual, per-chapter) and the batch AI
  // Beta runner both persist here, keyed by chapter id, so they survive
  // switching chapters/closing the dialog instead of being lost the moment
  // betaIssues gets recomputed. A stored suggestion is only shown while its
  // exact flagged span still matches the live text (same position-verify
  // convention used everywhere else in this file) — no content-hash needed,
  // and it means an edit elsewhere in the chapter never wipes out unrelated
  // pending suggestions.
  const persistAiBetaSuggestions = (chapterId, additions) => {
    if (!additions.length) return;
    setAiBetaFindings((current) => {
      const existing = current[chapterId]?.suggestions || [];
      const suggestions = [
        ...existing.filter((item) => !additions.some((next) => next.start === item.start && next.end === item.end)),
        ...additions,
      ].sort((a, b) => a.start - b.start);
      const next = { ...current, [chapterId]: { checkedAt: new Date().toISOString(), suggestions } };
      localStorage.setItem(`etq-story-beta-ai:${projectId}`, JSON.stringify(next));
      return next;
    });
  };
  const removeAiBetaFindings = (chapterId, ids) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    setAiBetaFindings((current) => {
      const existing = current[chapterId]?.suggestions;
      if (!existing?.length) return current;
      const suggestions = existing.filter((item) => !idSet.has(item.id));
      const next = { ...current, [chapterId]: { ...current[chapterId], suggestions } };
      localStorage.setItem(`etq-story-beta-ai:${projectId}`, JSON.stringify(next));
      return next;
    });
  };
  const storedAiBetaIssues = (chapterId, text) => {
    const suggestions = aiBetaFindings[chapterId]?.suggestions || [];
    return suggestions.filter((item) => text.slice(item.start, item.end) === item.value);
  };
  useEffect(() => {
    try { setAiBetaFindings(JSON.parse(localStorage.getItem(`etq-story-beta-ai:${projectId}`) || "{}")); }
    catch { setAiBetaFindings({}); }
  }, [projectId]);

  const scanCurrentBeta = (text=currentChapter?.edited || "", settings=betaSettings()) => {
    const codeIssues = runBetaCheck(text,{settings});
    const aiIssues = currentChapter ? storedAiBetaIssues(currentChapter.id, text) : [];
    return aiIssues.length ? [...codeIssues, ...aiIssues].sort((a,b)=>a.start-b.start||a.end-b.end) : codeIssues;
  };
  const handleOpenBetaCheck = () => {
    if(!currentChapter?.edited?.trim()){toast({title:"Bản Edit đang trống",variant:"destructive"});return;}
    setBetaIssues(scanCurrentBeta());setShowBetaCheck(true);
  };
  const handleApplyBeta = async (items,replacement,remember=false) => {
    if(!currentChapter)return;
    try{
      const previous=currentChapter.edited||"";
      const applicable=[...(items||[])].filter(item=>previous.slice(item.start,item.end)===item.value).sort((a,b)=>b.start-a.start);
      if(!applicable.length)throw new Error("Vị trí Beta đã thay đổi. Hãy quét lại.");
      const next=applicable.reduce((text,item)=>applyBetaSuggestion(text,item,replacement),previous);
      setBetaUndo({chapterId:currentChapter.id,previous});setCurrentChapter({...currentChapter,edited:next});
      removeAiBetaFindings(currentChapter.id, applicable.filter(item=>item.type==="ai-beta").map(item=>item.id));
      let settings=betaSettings();
      if(remember){const find=items[0]?.value;const rules=[...(settings.rules||[]).filter(rule=>normalizeText(rule.find)!==normalizeText(find)),{find,replace:String(replacement||"")}];settings={...settings,rules};await handleSaveBetaSettings(settings);}
      setBetaIssues(scanCurrentBeta(next,settings));toast({title:`Đã áp dụng ${applicable.length} vị trí Beta`,description:remember?"Đã ghi nhớ thành quy tắc của truyện.":"Không thay đổi các câu khác."});
    }catch(error){toast({title:"Không thể áp dụng Beta",description:error.message,variant:"destructive"});}
  };
  const handleApplyAllSafeBeta = () => {
    if (!currentChapter) return;
    const previous = currentChapter.edited || "";
    const safeIssues = betaIssues.filter((item) => item.safe);
    if (!safeIssues.length) {
      toast({ title: "Không có lỗi Beta an toàn nào để sửa tự động" });
      return;
    }
    try {
      const applicable = safeIssues
        .filter((item) => previous.slice(item.start, item.end) === item.value)
        .sort((a, b) => b.start - a.start);
      if (!applicable.length) throw new Error("Vị trí Beta đã thay đổi. Hãy quét lại.");
      const next = applicable.reduce((text, item) => applyBetaSuggestion(text, item, item.replacement), previous);
      setBetaUndo({ chapterId: currentChapter.id, previous });
      setCurrentChapter({ ...currentChapter, edited: next });
      const remaining = scanCurrentBeta(next, betaSettings());
      setBetaIssues(remaining);
      toast({
        title: `Đã sửa ${applicable.length} lỗi Beta an toàn`,
        description: remaining.length ? `Còn ${remaining.length} nghi vấn cần xem lại thủ công.` : "Chương không còn nghi vấn Beta nào.",
      });
    } catch (error) {
      toast({ title: "Không thể sửa tự động", description: error.message, variant: "destructive" });
      setBetaIssues(scanCurrentBeta());
    }
  };
  const normalizeText=(value)=>String(value||"").trim().toLocaleLowerCase("vi");
  const handleIgnoreBeta = async (group,remember) => {
    setBetaIssues(current=>current.filter(item=>!group.items.some(target=>target.id===item.id)));
    if(currentChapter) removeAiBetaFindings(currentChapter.id, group.items.filter(item=>item.type==="ai-beta").map(item=>item.id));
    if(!remember)return;
    const settings=betaSettings();const ignored=[...new Set([...(settings.ignored||[]),group.value])];await handleSaveBetaSettings({...settings,ignored});
  };
  const handleLocateBeta = (item) => {setShowBetaCheck(false);setMobileActiveCol("edited");setPanel3Mode("edit");window.setTimeout(()=>{const textarea=document.querySelector("[data-etq-panel='final'] [data-etq-role='edit-content']");if(!(textarea instanceof HTMLTextAreaElement))return;textarea.focus();textarea.setSelectionRange(item.start,item.end);textarea.scrollTop=Math.max(0,(item.line-3)*32);},80);};

  // Tapping a highlighted "lỗi nghi vấn" span in the Bản Edit column — same
  // tap-to-fix affordance the glossary highlight already has, instead of a
  // hover-only browser tooltip. `items` are the (possibly stacked) issue
  // objects covering that text range, tagged with __kind by the qualityIssues
  // prop above so we know whether to call the QA or Beta apply handler.
  const handleIssueSpanClick = (items, event) => {
    const margin = 12;
    const x = Math.min(event.clientX, window.innerWidth - 320 - margin);
    const y = Math.min(event.clientY + 12, window.innerHeight - 220 - margin);
    setIssuePopover({ items, x: Math.max(margin, x), y: Math.max(margin, y) });
  };

  const handleApplyIssuePopoverItem = (item, replacement) => {
    if (item.__kind === "beta") handleApplyBeta([item], replacement);
    else handleApplyQualitySuggestion([item], replacement);
    setIssuePopover((current) => {
      if (!current) return current;
      const remaining = current.items.filter((i) => i.id !== item.id);
      return remaining.length ? { ...current, items: remaining } : null;
    });
  };
  const handleUndoBeta = () => {if(!currentChapter||betaUndo?.chapterId!==currentChapter.id)return;setCurrentChapter({...currentChapter,edited:betaUndo.previous});setBetaIssues(runBetaCheck(betaUndo.previous,{settings:betaSettings()}));setBetaUndo(null);};
  const handleAiBeta = async () => {
    if(!hasCustomAI()){toast({title:"Cần cấu hình AI trước",description:"Beta bằng code vẫn dùng được mà không cần AI.",variant:"destructive"});return;}
    const candidates=betaCandidatePayload(currentChapter?.edited||"",betaIssues,16);
    if(!candidates.length){toast({title:"Không có câu khó cần gửi AI"});return;}
    setBetaAiRunning(true);
    try{
      const compact=candidates.map(item=>`${item.id}|${item.context}`).join("\n");
      const prompt=`Bạn là beta reader tiếng Việt. Chỉ kiểm tra các câu dưới đây về văn phong Convert/QT, câu tối nghĩa, sai chủ-vị, lặp ý và trình bày. Không đổi tên riêng, xưng hô, tình tiết. Bỏ qua câu đã ổn. Trả DUY NHẤT JSON array, mỗi phần tử: {"id":"B1","issue":"lý do tối đa 12 từ","suggestion":"câu thay thế hoàn chỉnh"}. Không markdown.\n${compact}`;
      const raw=await callLLM(prompt);const parsed=JSON.parse(String(raw).replace(/^```(?:json)?\s*|\s*```$/g,""));
      const additions=(Array.isArray(parsed)?parsed:[]).flatMap(result=>{const source=candidates.find(item=>item.id===result.id);if(!source||!String(result.suggestion||"").trim()||String(result.suggestion).trim()===source.text.trim())return[];return[{id:`beta-ai-${source.start}-${Date.now()}`,type:"ai-beta",label:"AI nghi ngờ câu văn",value:source.text,replacement:String(result.suggestion).trim(),start:source.start,end:source.end,line:(currentChapter.edited||"").slice(0,source.start).split("\n").length,context:source.context,detail:String(result.issue||"Cần xem lại câu văn."),safe:false,aiCandidate:false}];});
      persistAiBetaSuggestions(currentChapter.id, additions);
      setBetaIssues(current=>[...current.filter(item=>item.type!=="ai-beta"),...additions].sort((a,b)=>a.start-b.start));toast({title:`AI đề xuất ${additions.length}/${candidates.length} câu`,description:"Chưa có câu nào được tự động sửa."});
    }catch(error){toast({title:"AI Beta không trả kết quả hợp lệ",description:error.message,variant:"destructive"});}
    finally{setBetaAiRunning(false);}
  };
  // Beta counterparts of patchStoryQaReportForChapters/dropStoryQaGroupLocally
  // - avoid a full select('*') rescan of every chapter after a single group
  // fix/ignore, patch the already-loaded report in memory instead using
  // chapter text already available (from the bulkUpsert response).
  const patchStoryBetaReportForChapters = (chapters, settings) => {
    setStoryBetaReport((report) => {
      if (!report) return report;
      const touched = new Map(chapters.map((c) => [c.id, c]));
      const groupMap = new Map();
      report.groups.forEach((g) => {
        const locations = (g.locations || []).filter((loc) => !touched.has(loc.chapterId));
        if (locations.length) groupMap.set(g.key, { ...g, locations, chapterIds: new Set(locations.map((l) => l.chapterId)) });
      });
      const chapterResults = report.chapters.filter((c) => !touched.has(c.id));
      touched.forEach((chapter) => {
        const issues = String(chapter.edited || "").trim() ? runBetaCheck(chapter.edited, { settings }) : [];
        if (issues.length) chapterResults.push({ id: chapter.id, title: chapter.title, chapter_order: chapter.chapter_order, count: issues.length });
        issues.forEach((item) => {
          const key = [item.type, item.label, item.value, item.replacement || ""].join("\u0001");
          const group = groupMap.get(key) || { key, type: item.type, label: item.label, value: item.value, replacement: item.replacement || "", safe: Boolean(item.safe), locations: [], chapterIds: new Set() };
          group.locations.push({ id: `${chapter.id}:${item.start}:${item.end}`, chapterId: chapter.id, chapterTitle: chapter.title, chapter_order: chapter.chapter_order, line: item.line, context: item.context, start: item.start, end: item.end, value: item.value });
          group.chapterIds.add(chapter.id);
          groupMap.set(key, group);
        });
      });
      const groups = [...groupMap.values()].map((g) => ({ ...g, count: g.locations.length, chapterCount: g.chapterIds.size, chapterIds: [...g.chapterIds] })).sort((a, b) => b.count - a.count);
      chapterResults.sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0));
      const next = { ...report, chapters: chapterResults, groups, issueCount: chapterResults.reduce((sum, c) => sum + c.count, 0) };
      localStorage.setItem(`etq-story-beta:${projectId}`, JSON.stringify(next));
      return next;
    });
  };
  const dropStoryBetaGroupLocally = (group) => {
    setStoryBetaReport((report) => {
      if (!report) return report;
      const removedByChapter = new Map();
      (group.locations || []).forEach((loc) => removedByChapter.set(loc.chapterId, (removedByChapter.get(loc.chapterId) || 0) + 1));
      const groups = report.groups.filter((g) => g.key !== group.key);
      const chapters = report.chapters
        .map((c) => (removedByChapter.has(c.id) ? { ...c, count: c.count - removedByChapter.get(c.id) } : c))
        .filter((c) => c.count > 0);
      const next = { ...report, groups, chapters, issueCount: groups.reduce((sum, g) => sum + g.count, 0) };
      localStorage.setItem(`etq-story-beta:${projectId}`, JSON.stringify(next));
      return next;
    });
  };
  const handleScanStoryBeta = async (settings) => {
    setStoryBetaRunning(true);try{if(currentChapter)await flushSave(currentChapter,true);const chapters=await loadAllProjectChapters(["title","chapter_order","edited"]);const map=new Map();const chapterResults=[];
      chapters.forEach(chapter=>{const issues=String(chapter.edited||"").trim()?runBetaCheck(chapter.edited,{settings}):[];if(issues.length)chapterResults.push({id:chapter.id,title:chapter.title,chapter_order:chapter.chapter_order,count:issues.length});issues.forEach(item=>{const key=[item.type,item.label,item.value,item.replacement||""].join("\u0001");const group=map.get(key)||{key,type:item.type,label:item.label,value:item.value,replacement:item.replacement||"",safe:Boolean(item.safe),count:0,chapterIds:new Set(),locations:[]};group.count++;group.chapterIds.add(chapter.id);group.locations.push({id:`${chapter.id}:${item.start}:${item.end}`,chapterId:chapter.id,chapterTitle:chapter.title,chapter_order:chapter.chapter_order,line:item.line,context:item.context,start:item.start,end:item.end,value:item.value});map.set(key,group);});});
      const groups=[...map.values()].map(group=>({...group,chapterCount:group.chapterIds.size,chapterIds:[...group.chapterIds]})).sort((a,b)=>b.count-a.count);const report={scannedAt:new Date().toISOString(),chapters:chapterResults,groups,issueCount:chapterResults.reduce((sum,ch)=>sum+ch.count,0)};setStoryBetaReport(report);localStorage.setItem(`etq-story-beta:${projectId}`,JSON.stringify(report));toast({title:`Đã quét Beta ${chapters.length} chương`,description:`Còn ${report.issueCount} nghi vấn trong ${chapterResults.length} chương.`});
    }catch(error){toast({title:"Không quét được Beta toàn truyện",description:error.message,variant:"destructive"});}finally{setStoryBetaRunning(false);}
  };
  const handleStoryBetaReplace = async (group,replacement,settings,selectedIds=[]) => {if(!group?.safe)return;const selected=new Set(selectedIds);const locations=group.locations.filter(loc=>!selected.size||selected.has(loc.id));setStoryBetaRunning(true);try{if(currentChapter)await flushSave(currentChapter,true);const ids=[...new Set(locations.map(loc=>loc.chapterId))];const chapters=await Chapter.getMany(ids);setBatchReplaceUndo({target:"edited",rows:chapters.map(chapterUpsertRow)});const rows=chapters.map(chapter=>{const positions=locations.filter(loc=>loc.chapterId===chapter.id).sort((a,b)=>b.start-a.start);const edited=positions.reduce((text,loc)=>text.slice(loc.start,loc.end)===loc.value?text.slice(0,loc.start)+String(replacement||"")+text.slice(loc.end):text,chapter.edited||"");return chapterUpsertRow({...chapter,edited});});let updated=[];for(let index=0;index<rows.length;index+=200)updated=updated.concat(await Chapter.bulkUpsert(rows.slice(index,index+200)));updated.forEach(ch=>{chapterCacheRef.current.set(ch.id,ch);lastSavedRef.current.set(ch.id,snapshotOf(ch));});const active=updated.find(ch=>ch.id===currentChapter?.id);if(active)setCurrentChapter(active);patchStoryBetaReportForChapters(updated,settings);}catch(error){toast({title:"Không thể sửa Beta toàn truyện",description:error.message,variant:"destructive"});}finally{setStoryBetaRunning(false);}};
  const handleStoryBetaIgnore = async (group,settings,remember) => {if(!remember)return;const next={...settings,ignored:[...new Set([...(settings.ignored||[]),group.value])]};await handleSaveBetaSettings(next);dropStoryBetaGroupLocally(group);};

  // Same "apply every group with a single confident replacement across the
  // whole story in one DB pass" pattern as handleStoryQaApplyAllSafe, but
  // for Beta groups: "safe" here is already computed by betaCheck.js
  // (spacing/punctuation/repeated-word/known-QT-pattern fixes only).
  const handleStoryBetaApplyAllSafe = async (settings) => {
    const safeGroups = (storyBetaReport?.groups || []).filter((group) => group.safe);
    if (!safeGroups.length) {
      toast({ title: "Không có lỗi Beta an toàn nào để sửa tự động" });
      return;
    }
    setStoryBetaRunning(true);
    try {
      if (currentChapter) await flushSave(currentChapter, true);
      const byChapter = new Map();
      safeGroups.forEach((group) => {
        (group.locations || []).forEach((location) => {
          const list = byChapter.get(location.chapterId) || [];
          list.push({ start: location.start, end: location.end, value: location.value, replacement: group.replacement });
          byChapter.set(location.chapterId, list);
        });
      });
      const ids = [...byChapter.keys()];
      const chapters = await Chapter.getMany(ids);
      setBatchReplaceUndo({ target: "edited", rows: chapters.map(chapterUpsertRow) });
      const rows = chapters.map((chapter) => {
        const positions = (byChapter.get(chapter.id) || []).sort((a, b) => b.start - a.start);
        const edited = positions.reduce(
          (text, item) => (text.slice(item.start, item.end) === item.value ? text.slice(0, item.start) + String(item.replacement || "") + text.slice(item.end) : text),
          chapter.edited || ""
        );
        return chapterUpsertRow({ ...chapter, edited });
      });
      let updated = [];
      for (let index = 0; index < rows.length; index += 200) {
        updated = updated.concat(await Chapter.bulkUpsert(rows.slice(index, index + 200)));
      }
      updated.forEach((chapter) => { chapterCacheRef.current.set(chapter.id, chapter); lastSavedRef.current.set(chapter.id, snapshotOf(chapter)); });
      const active = updated.find((chapter) => chapter.id === currentChapter?.id);
      if (active) setCurrentChapter(active);
      const totalOccurrences = safeGroups.reduce((sum, group) => sum + (group.locations?.length || 0), 0);
      toast({ title: `Đã sửa ${totalOccurrences} vị trí Beta an toàn trong ${updated.length} chương` });
      patchStoryBetaReportForChapters(updated, settings);
    } catch (error) {
      toast({ title: "Không thể sửa Beta toàn truyện", description: error.message, variant: "destructive" });
    } finally {
      setStoryBetaRunning(false);
    }
  };

  // Runs the exact same "AI xem câu khó" call as handleAiBeta, one chapter
  // at a time across the whole book, and just persists the results via
  // persistAiBetaSuggestions instead of showing them immediately — so the
  // user doesn't have to open every chapter and click the AI button
  // individually. Skips chapters with no Bản Edit or no code-flagged
  // candidate sentences (nothing to send the AI).
  const handleStartBatchBetaAi = async () => {
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return;
    }
    if (chapterList.length === 0) return;
    batchBetaAiStopRef.current = false;
    setBatchBetaAiErrors([]);
    setBatchBetaAiFinished(false);
    const settings = betaSettings();
    const ordered = [...chapterList].sort((a, b) => a.chapter_order - b.chapter_order);
    setBatchBetaAiProgress({ done: 0, total: ordered.length, found: 0, skipped: 0, failed: 0, currentTitle: "" });
    setBatchBetaAiRunning(true);

    for (let i = 0; i < ordered.length; i++) {
      if (batchBetaAiStopRef.current) break;
      const meta = ordered[i];
      setBatchBetaAiProgress((p) => ({ ...p, currentTitle: meta.title }));
      try {
        let chapter = chapterCacheRef.current.get(meta.id);
        if (!chapter) {
          chapter = await Chapter.get(meta.id);
          chapterCacheRef.current.set(meta.id, chapter);
          capCache(chapterCacheRef.current);
        }
        const text = chapter.edited || "";
        const codeIssues = text.trim() ? runBetaCheck(text, { settings }) : [];
        const candidates = betaCandidatePayload(text, codeIssues, 16);
        if (!candidates.length) {
          setBatchBetaAiProgress((p) => ({ ...p, done: p.done + 1, skipped: p.skipped + 1 }));
        } else {
          const compact = candidates.map((item) => `${item.id}|${item.context}`).join("\n");
          const prompt = `Bạn là beta reader tiếng Việt. Chỉ kiểm tra các câu dưới đây về văn phong Convert/QT, câu tối nghĩa, sai chủ-vị, lặp ý và trình bày. Không đổi tên riêng, xưng hô, tình tiết. Bỏ qua câu đã ổn. Trả DUY NHẤT JSON array, mỗi phần tử: {"id":"B1","issue":"lý do tối đa 12 từ","suggestion":"câu thay thế hoàn chỉnh"}. Không markdown.\n${compact}`;
          const raw = await callLLM(prompt);
          const parsed = JSON.parse(String(raw).replace(/^```(?:json)?\s*|\s*```$/g, ""));
          const additions = (Array.isArray(parsed) ? parsed : []).flatMap((result) => {
            const source = candidates.find((item) => item.id === result.id);
            if (!source || !String(result.suggestion || "").trim() || String(result.suggestion).trim() === source.text.trim()) return [];
            return [{
              id: `beta-ai-${source.start}-${meta.id}`, type: "ai-beta", label: "AI nghi ngờ câu văn",
              value: source.text, replacement: String(result.suggestion).trim(), start: source.start, end: source.end,
              line: text.slice(0, source.start).split("\n").length, context: source.context,
              detail: String(result.issue || "Cần xem lại câu văn."), safe: false, aiCandidate: false,
            }];
          });
          if (additions.length) {
            persistAiBetaSuggestions(meta.id, additions);
            setBatchBetaAiProgress((p) => ({ ...p, done: p.done + 1, found: p.found + 1 }));
          } else {
            setBatchBetaAiProgress((p) => ({ ...p, done: p.done + 1 }));
          }
        }
      } catch (e) {
        setBatchBetaAiErrors((prev) => [...prev, { title: meta.title, message: e.message }]);
        setBatchBetaAiProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
      }
      if (!batchBetaAiStopRef.current && i < ordered.length - 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }

    setBatchBetaAiRunning(false);
    setBatchBetaAiFinished(true);
    toast({ title: batchBetaAiStopRef.current ? "Đã dừng AI Beta hàng loạt ⏸️" : "Hoàn tất AI Beta hàng loạt! ✨" });
  };
  const handleStopBatchBetaAi = () => { batchBetaAiStopRef.current = true; };

  useEffect(()=>{try{setStoryPronounAiReport(JSON.parse(localStorage.getItem(`etq-story-pronoun-ai:${projectId}`)||"null"));}catch{setStoryPronounAiReport(null);}},[projectId]);

  useEffect(()=>{try{setStoryBetaReaderReport(JSON.parse(localStorage.getItem(`etq-story-beta-reader:${projectId}`)||"null"));}catch{setStoryBetaReaderReport(null);}},[projectId]);

  useEffect(()=>{try{setTargetedFixReport(JSON.parse(localStorage.getItem(`etq-targeted-fix:${projectId}`)||"null"));}catch{setTargetedFixReport(null);}},[projectId]);

  useEffect(()=>{try{setStoryBetaReport(JSON.parse(localStorage.getItem(`etq-story-beta:${projectId}`)||"null"));}catch{setStoryBetaReport(null);}},[projectId]);
  useEffect(()=>{if(!storyBetaReport||!currentChapter?.id||betaScannedChapterRef.current!==currentChapter.id)return;const issues=betaIssues;const meta=chapterList.find(ch=>ch.id===currentChapter.id)||currentChapter;const chapters=storyBetaReport.chapters.filter(ch=>ch.id!==currentChapter.id);if(issues.length)chapters.push({id:currentChapter.id,title:meta.title,chapter_order:meta.chapter_order,count:issues.length});chapters.sort((a,b)=>(a.chapter_order||0)-(b.chapter_order||0));const next={...storyBetaReport,chapters,issueCount:chapters.reduce((sum,ch)=>sum+ch.count,0),groupsStale:true};setStoryBetaReport(next);localStorage.setItem(`etq-story-beta:${projectId}`,JSON.stringify(next));// eslint-disable-next-line react-hooks/exhaustive-deps
  },[betaIssues,currentChapter?.id]);
  useEffect(()=>{const timer=window.setTimeout(()=>{betaScannedChapterRef.current=currentChapter?.id||null;setBetaIssues(scanCurrentBeta());},450);return()=>window.clearTimeout(timer);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[currentChapter?.edited,project?.style_toggles?.beta_settings]);

  const buildEditPrompt = (sourceText, context = {}) => {
    const activeGlossaryTerms = context.glossaryTerms || glossaryTerms;
    const activePronounRules = context.pronounRules || project?.contextual_pronoun_rules || [];
    const activeNarrativeRules = context.narrativeRules ||
      project?.style_toggles?.story_memory?.narrativeRules || [];
    const characterProfiles = project?.style_toggles?.story_memory?.characterProfiles || [];
    const glossaryText = activeGlossaryTerms
      .map((t) => `- "${t.source_term}" → "${t.translation}"${t.category === "Xưng hô" ? " (mặc định QT; điều chỉnh theo ma trận xưng hô và người nói/người nghe)" : " (giữ đúng bản Việt này kể cả khi đầu vào đã là QT)"}`)
      .join("\n");
    const batchRulesText = (project?.batch_rules || [])
      .filter((r) => r.find)
      .map((r) => `- Thay "${r.find}" bằng "${r.replace}"`)
      .join("\n");
    const pronounMatrixText = buildPronounMatrixPrompt(
      activePronounRules
    );
    const narrativePronounText = activeNarrativeRules
      .filter((rule) => rule.character?.trim() && rule.pronoun?.trim())
      .map((rule) => `- Khi lời dẫn nhắc đến "${rule.character.trim()}": bắt buộc dùng đại từ "${rule.pronoun.trim()}"${rule.note ? ` (${rule.note})` : ""}`)
      .join("\n");
    const characterProfileText = characterProfiles
      .filter((character) => character.name?.trim())
      .map((character) => `- ${character.name.trim()}: giới tính ${character.gender || "không rõ"}; thân phận ${character.identity || "chưa rõ"}${character.evidence ? ` (căn cứ: ${character.evidence})` : ""}`)
      .join("\n");

    const toggles = project?.style_toggles || {};
    const extraRules = [];
    if (toggles.protect_plot) {
      extraRules.push(
        "9. BẢO VỆ CỐT TRUYỆN: TUYỆT ĐỐI không tự ý thêm, bớt, bịa đặt chi tiết/tình tiết không có trong văn bản gốc."
      );
    }
    if (toggles.declunkify_qt) {
      extraRules.push(
        "10. Chủ động đảo ngữ, diễn đạt thoát ý hoàn toàn các cụm dịch sát nghĩa đen kiểu Convert — không dịch máy móc từng chữ."
      );
    }

    const genreEraLines = [];
    if (activePreset?.genres?.length) genreEraLines.push(`Thể loại: ${activePreset.genres.join(", ")}`);
    if (activePreset?.setting_era?.trim()) genreEraLines.push(`Bối cảnh/thời đại: ${activePreset.setting_era.trim()}`);
    const genreEraText = genreEraLines.join("\n");

    const characterNotesText = (activePreset?.character_notes || [])
      .filter((n) => n.character?.trim() && n.note?.trim())
      .map((n) => `- ${n.character.trim()}: ${n.note.trim()}`)
      .join("\n");

    const presetBlock =
      activePreset?.prompt_instructions || genreEraText || characterNotesText
        ? `\nVĂN PHONG / THỂ LOẠI RIÊNG CHO BỘ TRUYỆN NÀY (${activePreset?.name || ""}):
${genreEraText ? `${genreEraText}\n` : ""}${activePreset?.prompt_instructions || ""}
${
  characterNotesText
    ? `\nGHI CHÚ NHÂN VẬT ĐẶC BIỆT (quy tắc xưng hô/hành xử đổi theo tình huống — BẮT BUỘC áp dụng đúng khi văn cảnh phù hợp, không được bỏ qua):\n${characterNotesText}\n`
    : ""
}`
        : "";

    return `Bạn là trợ lý biên tập truyện dịch chuyên nghiệp, chuyên edit truyện Convert/QT. Hãy biên tập văn bản QT thô sau đây thành văn phong tiếng Việt mượt mà, tự nhiên, thoát ý, giữ đúng cảm xúc và ý nghĩa gốc.

QUY TẮC BẮT BUỘC:
1. Giữ đúng tên riêng và thuật ngữ đã duyệt trong Glossary, kể cả khi QT đã chuyển sang bản Việt. Riêng mục Xưng hô là mặc định QT: ưu tiên ma trận người nói/người nghe và quy tắc lời dẫn, không ép một đại từ cho mọi nhân vật. QT có thể đọc sai hoặc tách tên; không tự bịa thêm ý để làm câu có vẻ hợp lý.
2. Áp dụng các quy tắc thay thế nếu có.
3. Sửa câu cưỡng ép, ngữ pháp lủng củng, lặp từ. Diễn đạt lại cho mượt mà nhưng giữ nguyên ý.
4. Giữ nguyên các đoạn hội thoại trong ngoặc kép.
5. KHÔNG thêm giải thích, ghi chú, hay tiêu đề. Chỉ xuất văn bản đã biên tập.
6. ĐẶC BIỆT: Tự động nhận diện NGƯỜI NÓI và NGƯỜI NGHE trong từng câu hội thoại (dựa tên nhân vật, bối cảnh đoạn thoại, sở hữu cách câu nói, ngôi kể). Chọn đúng MA TRẬN XƯNG HÔ phù hợp với cặp người nói ↔ người nghe của đoạn. Nếu câu thoại không quy định đặc biệt cho người nghe cụ thể, dùng quy tắc MẶC ĐỊNH của nhân vật nói. Tuyệt đối không viết sai cách xưng hô của nhân vật.
7. Đây có thể là một đoạn trích trong chương dài hơn — chỉ biên tập đúng phần văn bản được đưa, không thêm mở đầu/kết luận ngoài ý.
8. BẮT BUỘC: Giữ nguyên chính xác số lần xuống dòng / số đoạn văn như văn bản đầu vào — mỗi dòng gốc tương ứng với đúng một dòng trong bản dịch, không gộp nhiều dòng thành một, không tách một dòng thành nhiều dòng. Nếu văn bản gốc có DÒNG TRỐNG (dòng rỗng) để ngăn cách giữa các đoạn, PHẢI giữ nguyên dòng trống đó ở đúng vị trí tương ứng trong bản dịch — không được xóa/gộp dòng trống lại, kể cả khi nó không chứa nội dung để dịch.
${extraRules.join("\n")}
${presetBlock}
GLOSSARY (KHÓA TÊN / THUẬT NGỮ; XƯNG HÔ THEO NGỮ CẢNH):
${glossaryText || "(trống)"}

QUY TẮC THAY THẾ:
${batchRulesText || "(không có)"}

MA TRẬN XƯNG HÔ THEO NGỮ CẢNH (AI tự nhận diện người nói ↔ người nghe, áp dụng chính xác đại từ):
${pronounMatrixText || "(không có quy tắc cụ thể — dùng ngữ cảm tự nhiên theo văn bản gốc)"}

NGÔI LỜI DẪN / ĐẠI TỪ NGÔI THỨ BA (BẮT BUỘC TUÂN THỦ, không áp dụng vào lời thoại):
${narrativePronounText || "(chưa có quy tắc riêng)"}

HỒ SƠ NHÂN VẬT ĐÃ DUYỆT (dùng để hiểu giới tính, thân phận và chọn xưng hô; không bịa thêm dữ kiện):
${characterProfileText || "(chưa có hồ sơ riêng)"}

${context.previousSummary ? `TÓM TẮT CHƯƠNG TRƯỚC (chỉ dùng để giữ mạch truyện, không được chép vào đầu ra):
${context.previousSummary}` : ""}

VĂN BẢN CẦN BIÊN TẬP:
${sourceText}

Hãy biên tập lại toàn bộ văn bản trên thành bản tiếng Việt hoàn chỉnh:`;
  };

  // Post-processing applied after every AI edit result, in code (not
  // dependent on the AI actually following the prompt): preset forbidden
  // words and the "strip trailing ạ" toggle.
  const applyHardRules = (text) => {
    let result = text;
    const forbidden = (activePreset?.forbidden_words || []).filter((r) => r.find);
    if (forbidden.length) {
      result = applyReplacements(result, forbidden, { wholeWord: true }).text;
    }
    if (project?.style_toggles?.strip_polite_a) {
      result = stripPoliteA(result);
    }
    return result;
  };

  // Rough line-count check — a heads-up, not a hard guarantee (LLMs don't
  // perfectly preserve line counts even when explicitly instructed).
  const checkLineAlignment = (sourceText, resultText) => {
    const srcLines = sourceText.split("\n").length;
    const outLines = resultText.split("\n").length;
    if (srcLines !== outLines) {
      toast({
        title: "⚠️ Số dòng bản Edit không khớp QT thô",
        description: `QT thô có ${srcLines} dòng, bản Edit có ${outLines} dòng — kiểm tra lại cấu trúc đoạn.`,
      });
    }
  };

  // Runs one call per chunk (sequentially, to stay within provider rate
  // limits) and stitches the results back together. Chapters usually fit in
  // a single chunk; this only kicks in for unusually long ones.
  const runChunkedEdit = async (sourceText, callFn, onProgress, context = {}) => {
    const chunks = chunkText(sourceText, AI_CHUNK_CHARS);
    if (chunks.length <= 1) {
      return await callFn(buildEditPrompt(sourceText, context));
    }
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      onProgress?.(i + 1, chunks.length);
      // eslint-disable-next-line no-await-in-loop
      results.push(await callFn(buildEditPrompt(chunks[i], context)));
    }
    return results.join("\n\n");
  };

  const learnSingleChapter = async (chapter, editedText) => {
    const existingRules = [...(project?.contextual_pronoun_rules || [])];
    const existingTerms = [...glossaryTerms];
    const memory = {
      candidates: [],
      summaries: [],
      narrativeRules: [],
      learnedRuleCount: 0,
      learnedTermCount: 0,
      learnedNarrativeCount: 0,
      ...(project?.style_toggles?.story_memory || {}),
    };
    const raw = await callLLM(buildStoryLearningPrompt({
      title: chapter.title,
      sourceText: chapter.raw_original || chapter.qt_raw || "",
      editedText,
      existingRules,
      existingTerms,
    }));
    const learned = parseStoryLearningResult(raw);
    const merged = mergeStoryLearning({
      existingRules,
      existingTerms,
      existingNarrativeRules: memory.narrativeRules || [],
      learned,
      chapter,
    });

    let nextTerms = existingTerms;
    if (merged.acceptedTerms.length) {
      const created = await GlossaryTerm.bulkCreate(
        merged.acceptedTerms.map((term) => ({
          project_id: projectId,
          source_term: term.source_term,
          translation: term.translation,
          category: term.category,
          notes: `AI tự học từ ${chapter.title} · độ tin cậy ${Math.round(term.confidence * 100)}% · ${term.evidence}`,
          custom_fields: {
            source: term.source,
            confidence: term.confidence,
            learned_from_chapter_id: chapter.id,
          },
        }))
      );
      nextTerms = [...existingTerms, ...created];
      setGlossaryTerms(nextTerms);
    }

    const nextMemory = {
      ...memory,
      candidates: [...(memory.candidates || []), ...merged.candidates].slice(-300),
      summaries: learned.summary
        ? [...(memory.summaries || []).filter((item) => item.chapter_id !== chapter.id), {
            chapter_id: chapter.id,
            chapter_title: chapter.title,
            summary: learned.summary,
            learned_at: new Date().toISOString(),
          }].slice(-30)
        : memory.summaries || [],
      learnedRuleCount: (memory.learnedRuleCount || 0) + merged.acceptedRules.length,
      learnedTermCount: (memory.learnedTermCount || 0) + merged.acceptedTerms.length,
      learnedNarrativeCount: (memory.learnedNarrativeCount || 0) + merged.acceptedNarrativeRules.length,
      narrativeRules: merged.narrativeRules,
      lastLearnedAt: new Date().toISOString(),
    };
    const updatedProject = await Project.update(projectId, {
      contextual_pronoun_rules: merged.rules,
      style_toggles: {
        ...(project?.style_toggles || {}),
        story_memory: nextMemory,
      },
    });
    setProject(updatedProject);
    return {
      ruleCount: merged.acceptedRules.length + merged.acceptedNarrativeRules.length,
      termCount: merged.acceptedTerms.length,
      candidateCount: merged.candidates.length,
    };
  };

  // Custom AI edit (Gemini / GPT / Claude, user's own key)
  const doCustomEdit = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const chapterId = currentChapter.id;
    const prevEdited = currentChapter.edited || "";
    // Same free rule pre-pass as Auto Edit — see comment there.
    const sourceText = applyRuleEdit(currentChapter.qt_raw || currentChapter.raw_original || "");
    if (!sourceText.trim()) {
      toast({ title: "Không có văn bản để edit!", variant: "destructive" });
      return;
    }
    const provider = getProvider();
    const est = estimateCostUsd(provider, sourceText);
    if (est) {
      toast({
        title: `Ước tính ~${(est.inputTokens + est.outputTokens).toLocaleString("vi")} token`,
        description:
          est.cost > 0.0005
            ? `Chi phí ước tính ~$${est.cost.toFixed(4)} (tham khảo, có thể lệch so với giá thực tế)`
            : "Chi phí không đáng kể / trong hạn mức miễn phí (ước tính)",
      });
    }
    setGeminiEditing(true);
    try {
      const editedText = await runChunkedEdit(
        sourceText,
        (prompt) => callLLM(prompt),
        (i, total) =>
          total > 1 && toast({ title: `Đang xử lý đoạn ${i}/${total}...` })
      );
      const finalText = applyHardRules(editedText);
      setCurrentChapter((prev) =>
        prev && prev.id === chapterId ? { ...prev, edited: finalText } : prev
      );
      setAiUndo({ chapterId, previous: prevEdited });
      checkLineAlignment(sourceText, finalText);
      if (aiChapterLearningEnabled) {
        try {
          const learned = await learnSingleChapter(currentChapter, finalText);
          toast({
            title: learned.ruleCount + learned.termCount
              ? `AI đã học thêm ${learned.ruleCount + learned.termCount} quy tắc/thuật ngữ 🧠`
              : "AI đã cập nhật bộ nhớ chương 🧠",
            description: learned.candidateCount
              ? `${learned.candidateCount} dữ kiện chưa đủ chắc chắn được giữ lại để đối chiếu.`
              : "Kiến thức sẽ được dùng cho các chương dịch tiếp theo.",
          });
        } catch (learningError) {
          toast({
            title: "Bản Edit đã tạo, nhưng bước tự học gặp lỗi",
            description: learningError.message,
            variant: "destructive",
          });
        }
      }
      const providerLabel =
        ({ gemini: "Gemini", openai: "GPT", claude: "Claude", stali:"STALI" }[provider] || "AI");
      toast({
        title: `${providerLabel} đã edit xong! ✨`,
        description: "Kiểm tra và chỉnh thêm nhé",
      });
    } catch (e) {
      toast({ title: "Lỗi AI", description: e.message, variant: "destructive" });
    }
    setGeminiEditing(false);
  };

  // Ask for confirmation before an AI call overwrites existing edited text.
  const runAiEdit = (runner) => {
    if (currentChapter?.edited?.trim()) {
      pendingAiRunRef.current = runner;
      setAiConfirmOpen(true);
    } else {
      runner();
    }
  };
  const handleGeminiEdit = () => runAiEdit(doCustomEdit);

  const handleUndoAiEdit = () => {
    if (!aiUndo || !currentChapter || aiUndo.chapterId !== currentChapter.id) return;
    setCurrentChapter((prev) => ({ ...prev, edited: aiUndo.previous }));
    setAiUndo(null);
    toast({ title: "Đã hoàn tác bản edit AI ↩️" });
  };

  // A blind find/replace ("Đổi đại từ xưng hô") can't express "chỉ khi X nói
  // với Y" — that needs context. Rather than trying to teach the general
  // edit prompt (buildEditPrompt) to never miss this among everything else
  // it's already juggling, this runs a second, narrow AI pass whose ONLY
  // job is comparing dialogue against the Ma Trận Xưng Hô and fixing
  // mismatches — a model tends to follow one focused instruction far more
  // reliably than the same instruction buried as #6 of 8+ in a long prompt.
  const buildPronounCheckPrompt = (text, matrixText) => `Bạn là biên tập viên kiểm tra tính nhất quán xưng hô trong truyện dịch. Nhiệm vụ DUY NHẤT của bạn: đọc đoạn văn tiếng Việt sau, đối chiếu với BẢNG QUY TẮC XƯNG HÔ bên dưới, và SỬA LẠI những chỗ đại từ xưng hô trong LỜI THOẠI TRỰC TIẾP (trong ngoặc kép) bị dùng sai so với quy tắc — dựa trên việc xác định đúng người đang nói và đang nói VỚI AI trong câu đó.

QUY TẮC BẮT BUỘC:
1. CHỈ sửa đại từ xưng hô (ta/ngươi/nàng/hắn/huynh/muội...) trong lời thoại trực tiếp, khi xác định RÕ RÀNG người nói và người nghe của câu đó khớp với một dòng trong bảng quy tắc.
2. Nếu không chắc chắn ai đang nói với ai trong một câu, GIỮ NGUYÊN — đừng đoán bừa, đừng tự bịa quy tắc không có trong bảng.
3. KHÔNG sửa bất kỳ điều gì khác (từ ngữ, câu chữ, tường thuật, xưng hô ở phần không phải lời thoại trực tiếp).
4. KHÔNG thêm/bớt dòng, không thêm giải thích/ghi chú/tiêu đề — chỉ xuất lại đúng văn bản đã sửa.

BẢNG QUY TẮC XƯNG HÔ:
${matrixText}

VĂN BẢN CẦN KIỂM TRA:
${text}

Xuất lại TOÀN BỘ văn bản trên, đã sửa đúng xưng hô:`;

  const handleCheckPronouns = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const matrixText = buildPronounMatrixPrompt(project?.contextual_pronoun_rules || []);
    if (!matrixText) {
      toast({ title: "Chưa có quy tắc nào trong Ma Trận Xưng Hô!", variant: "destructive" });
      return;
    }
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return;
    }
    const sourceText = currentChapter.edited || "";
    if (!sourceText.trim()) {
      toast({ title: "Bản Edit đang trống, chưa có gì để kiểm tra!", variant: "destructive" });
      return;
    }
    const chapterId = currentChapter.id;
    const prevEdited = sourceText;
    setCheckingPronouns(true);
    setPronounCheckDiff(null);
    setPronounCheckPreview(null);
    try {
      const callFn = (prompt) => callLLM(prompt);
      const chunks = chunkText(sourceText, AI_CHUNK_CHARS);
      let fixedText;
      if (chunks.length <= 1) {
        fixedText = await callFn(buildPronounCheckPrompt(sourceText, matrixText));
      } else {
        const results = [];
        for (let i = 0; i < chunks.length; i++) {
          toast({ title: `Đang kiểm tra đoạn ${i + 1}/${chunks.length}...` });
          // eslint-disable-next-line no-await-in-loop
          results.push(await callFn(buildPronounCheckPrompt(chunks[i], matrixText)));
        }
        fixedText = results.join("\n\n");
      }
      // Diff against the ORIGINAL text (not chunk-by-chunk) so line numbers
      // and context are relative to the whole chapter regardless of how many
      // chunks it took — this is exactly what answers "sửa ở đâu, mấy chỗ".
      const diff = diffTextChanges(prevEdited, fixedText);
      setPronounCheckDiff(diff);
      setPronounCheckPreview(diff.length ? { chapterId, original: prevEdited, proposed: fixedText } : null);
      toast({
        title: diff.length ? `AI đề xuất sửa ${diff.length} chỗ xưng hô` : "Không tìm thấy chỗ nào cần sửa",
        description: diff.length ? "Bản Edit chưa thay đổi. Hãy xem và bấm Áp dụng nếu đồng ý." : undefined,
      });
    } catch (e) {
      toast({ title: "Lỗi kiểm tra xưng hô", description: e.message, variant: "destructive" });
    }
    setCheckingPronouns(false);
  };

  const handleApplyPronounCheck = () => {
    if (!pronounCheckPreview || !currentChapter) return;
    if (currentChapter.id !== pronounCheckPreview.chapterId) {
      toast({ title: "Đề xuất thuộc chương khác", description: "Hãy quay lại đúng chương đã kiểm tra rồi áp dụng.", variant: "destructive" });
      return;
    }
    if ((currentChapter.edited || "") !== pronounCheckPreview.original) {
      toast({ title: "Bản Edit đã thay đổi", description: "Hãy chạy kiểm tra lại để tránh ghi đè nội dung bạn vừa sửa.", variant: "destructive" });
      return;
    }
    const previous = pronounCheckPreview.original;
    setCurrentChapter((chapter) => ({ ...chapter, edited: pronounCheckPreview.proposed }));
    setAiUndo({ chapterId: currentChapter.id, previous });
    setPronounCheckPreview(null);
    setPronounCheckDiff(null);
    toast({ title: "Đã áp dụng đề xuất xưng hô ✅", description: "Bạn vẫn có thể hoàn tác bằng nút Hoàn tác AI." });
  };

  const handleDiscardPronounCheck = () => {
    setPronounCheckPreview(null);
    setPronounCheckDiff(null);
    toast({ title: "Đã bỏ đề xuất", description: "Bản Edit không bị thay đổi." });
  };

  // Unlike buildPronounCheckPrompt (narrow: only fixes dialogue pronouns
  // against a strict rule table) or the AI Beta pass (narrow: only reviews
  // sentences code already flagged as "khó"), this asks the model to read
  // the whole chapter freely and comment like a real beta reader — anything
  // that would make it stumble, not just what fits a fixed category. QA
  // hits are passed as a hint to double-check, not a filter on what it's
  // allowed to notice — this is the whole point per the user's request.
  const buildBetaReaderPrompt = (text, matrixText, qaHints) => `Bạn là một beta reader/biên tập viên giàu kinh nghiệm, KHÔNG PHẢI một công cụ dò lỗi máy móc. Đọc kỹ đoạn văn tiếng Việt sau như một độc giả thật sự, rồi góp ý như khi biên tập cho tác giả — chỉ ra những chỗ khiến bạn khựng lại khi đọc: xưng hô giữa hai nhân vật nghe không hợp bối cảnh, lời thoại/tường thuật gượng gạo hoặc không tự nhiên, mâu thuẫn logic/tình tiết ngay trong đoạn, lặp từ/lặp ý. Bỏ qua lỗi chính tả/dấu câu vụn vặt trừ khi thật sự đáng chú ý.

${qaHints ? `GỢI Ý: một công cụ quét bằng luật đã nghi ngờ những chỗ sau — hãy tự đọc lại ngữ cảnh xem có thật sự sai không (công cụ đó không hiểu ngữ cảnh nên có thể sai), và tìm thêm chỗ tương tự nó có thể đã bỏ sót. Đây chỉ là gợi ý, không phải giới hạn — vẫn góp ý bất cứ chỗ nào khác bạn thấy đáng chú ý:\n${qaHints}\n\n` : ""}${matrixText ? `BẢNG QUY TẮC XƯNG HÔ (tham khảo để đối chiếu, không phải danh sách đầy đủ mọi nhân vật):\n${matrixText}\n\n` : ""}ĐOẠN VĂN CẦN ĐỌC:
${text}

Trả DUY NHẤT một JSON array (không markdown, không giải thích gì thêm ngoài JSON). Mỗi phần tử: {"quote": "trích nguyên văn cụm/câu có vấn đề, giữ đúng từng ký tự để định vị được trong đoạn trên", "comment": "nhận xét ngắn gọn của bạn, viết như đang góp ý cho tác giả, giải thích vì sao", "suggestion": "câu/cụm đề xuất thay thế nếu có — để chuỗi rỗng nếu chỉ là nhận xét, không cần sửa"}. Nếu đoạn văn ổn, không có gì đáng góp ý, trả về mảng rỗng [].`;

  // Case the user asked for directly: they read one specific mistake ("Hà
  // đại nương phải gọi là bà, không phải nàng") and want ONLY that fixed
  // everywhere it recurs — not a general read-through. The prompt makes
  // this a narrow find-and-fix pass instead of Beta reader's open one, but
  // the output shape matches it exactly (quote/comment/suggestion) so the
  // rest of the pipeline — locate, single-chapter review dialog, apply,
  // undo — is reused as-is.
  const buildTargetedFixPrompt = (text, description) => `Người dùng vừa nêu MỘT loại lỗi cụ thể cần tìm và sửa trong truyện — đây KHÔNG phải yêu cầu rà soát mọi lỗi, chỉ đúng loại lỗi này thôi:

"${description}"

Đọc đoạn văn tiếng Việt sau, tìm những chỗ mắc ĐÚNG loại lỗi vừa mô tả. Tự suy luận theo ngữ cảnh để xác định đúng chỗ nào thật sự khớp — ví dụ nếu mô tả nói về cách gọi một nhân vật cụ thể, chỉ tính những chỗ đang thật sự nói về đúng nhân vật đó, không phải nhân vật khác vô tình dùng từ giống vậy. Nếu đoạn văn này không có chỗ nào khớp, trả về mảng rỗng — đừng cố tìm bừa cho có.

ĐOẠN VĂN:
${text}

Trả DUY NHẤT một JSON array (không markdown, không giải thích gì thêm ngoài JSON). Mỗi phần tử: {"quote": "trích nguyên văn cụm/câu mắc lỗi, giữ đúng từng ký tự để định vị được trong đoạn trên", "comment": "vì sao chỗ này khớp với mô tả lỗi ở trên", "suggestion": "câu/cụm đã sửa đúng theo mô tả"}. Nếu không có chỗ nào khớp, trả về mảng rỗng [].`;

  // Shared by every "AI reads a chunk, replies with a JSON list of {quote,
  // comment, suggestion} notes" flow — the free-form Beta reader (single
  // chapter and whole-story) and the targeted "sửa theo mô tả" pass below.
  // Kept as one function so the locate-by-quote logic (and its safety
  // margin — only trust a quote as "located" when it's unambiguous in that
  // chunk) can't drift between call sites; only the prompt differs.
  const runNoteScanOnText = async (sourceText, buildPromptForChunk, idPrefix, onChunkDone) => {
    const chunks = chunkText(sourceText, AI_CHUNK_CHARS);
    let cursor = 0;
    const notes = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkStart = sourceText.indexOf(chunk, cursor);
      cursor = chunkStart + chunk.length;
      // eslint-disable-next-line no-await-in-loop
      const raw = await callLLM(buildPromptForChunk(chunk));
      let parsed;
      try {
        parsed = JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        parsed = [];
      }
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          const quote = String(item?.quote || "").trim();
          const comment = String(item?.comment || "").trim();
          if (!quote || !comment) return;
          const suggestion = String(item?.suggestion || "").trim();
          const localIdx = chunk.indexOf(quote);
          const occurrences = localIdx === -1 ? 0 : chunk.split(quote).length - 1;
          const located = occurrences === 1;
          notes.push({
            id: `${idPrefix}-${chunkStart}-${notes.length}`,
            quote, comment, suggestion, located,
            start: located ? chunkStart + localIdx : null,
            end: located ? chunkStart + localIdx + quote.length : null,
          });
        });
      }
      onChunkDone?.(i + 1, chunks.length);
    }
    return notes;
  };

  const handleRunBetaReader = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return;
    }
    const sourceText = currentChapter.edited || "";
    if (!sourceText.trim()) {
      toast({ title: "Bản Edit đang trống, chưa có gì để đọc!", variant: "destructive" });
      return;
    }
    const chapterId = currentChapter.id;
    const matrixText = buildPronounMatrixPrompt(project?.contextual_pronoun_rules || []);
    const qaHints = qualityIssues
      .slice(0, 25)
      .map((issue) => `- "${issue.value}": ${issue.context}`.slice(0, 220))
      .join("\n");
    setBetaReaderRunning(true);
    setBetaReaderNotes(null);
    setBetaReaderChapterId(chapterId);
    setBetaReaderContextNote(null);
    try {
      setBetaReaderProgress({ done: 0, total: chunkText(sourceText, AI_CHUNK_CHARS).length });
      const allNotes = await runNoteScanOnText(
        sourceText,
        (chunk) => buildBetaReaderPrompt(chunk, matrixText, qaHints),
        "beta-reader",
        (done, total) => setBetaReaderProgress({ done, total })
      );
      setBetaReaderNotes(allNotes);
      toast({
        title: allNotes.length ? `AI góp ý ${allNotes.length} chỗ` : "AI đọc xong, không có gì đáng góp ý",
        description: allNotes.length ? "Xem từng chỗ và tự quyết định, không có gì bị tự sửa." : undefined,
      });
    } catch (e) {
      toast({ title: "Lỗi khi đọc chương", description: e.message, variant: "destructive" });
      setBetaReaderChapterId(null);
    } finally {
      setBetaReaderRunning(false);
    }
  };

  // If the chapter currently open also has an entry in one of the batch
  // reports (whole-story Beta reader, or the targeted-fix scan below), keep
  // that entry's note list in sync so re-opening it later (or the "found"
  // count in the batch dialog) doesn't still show notes already
  // applied/dismissed here.
  const syncReportChapterNotes = (report, storageKey, chapterId, remainingNotes) => {
    if (!report?.chapters.some((c) => c.id === chapterId)) return report;
    const chapters = remainingNotes.length
      ? report.chapters.map((c) => (c.id === chapterId ? { ...c, notes: remainingNotes } : c))
      : report.chapters.filter((c) => c.id !== chapterId);
    const next = { ...report, chapters };
    localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  };

  const syncStoryBetaReaderNotes = (chapterId, remainingNotes) => {
    setStoryBetaReaderReport((report) => syncReportChapterNotes(report, `etq-story-beta-reader:${projectId}`, chapterId, remainingNotes));
    setTargetedFixReport((report) => syncReportChapterNotes(report, `etq-targeted-fix:${projectId}`, chapterId, remainingNotes));
  };

  const handleApplyBetaReaderNote = (note) => {
    if (!currentChapter || !note.suggestion.trim()) return;
    const edited = currentChapter.edited || "";
    const idx = edited.indexOf(note.quote);
    if (idx === -1) {
      toast({ title: "Không tìm thấy đoạn này trong Bản Edit hiện tại", description: "Bản Edit có thể đã đổi từ lúc đọc — hãy đọc lại.", variant: "destructive" });
      return;
    }
    const previous = edited;
    const next = edited.slice(0, idx) + note.suggestion + edited.slice(idx + note.quote.length);
    setCurrentChapter((chapter) => ({ ...chapter, edited: next }));
    setAiUndo({ chapterId: currentChapter.id, previous });
    const remaining = (betaReaderNotes || []).filter((n) => n.id !== note.id);
    setBetaReaderNotes(remaining);
    syncStoryBetaReaderNotes(currentChapter.id, remaining);
    toast({ title: "Đã áp dụng đề xuất ✅", description: "Có thể hoàn tác bằng nút Hoàn tác AI." });
  };

  const handleDismissBetaReaderNote = (noteId) => {
    const remaining = (betaReaderNotes || []).filter((n) => n.id !== noteId);
    setBetaReaderNotes(remaining);
    if (currentChapter) syncStoryBetaReaderNotes(currentChapter.id, remaining);
  };

  const handleStartStoryBetaReader = async (scope) => {
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return;
    }
    storyBetaReaderStopRef.current = false;
    setStoryBetaReaderErrors([]);
    setStoryBetaReaderFinished(false);
    if (currentChapter) await flushSave(currentChapter, true);
    let chapters;
    try {
      chapters = await fetchAllPages(
        (limit, skip) => Chapter.filterNonEmpty({ project_id: projectId }, "edited", "chapter_order", limit, skip, ["title", "chapter_order", "edited"]),
        { pageSize: 300, maxItems: CHAPTER_FETCH_CAP }
      );
    } catch (error) {
      toast({ title: "Không lấy được danh sách chương", description: error.message, variant: "destructive" });
      return;
    }
    let ordered = [...chapters].sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0));
    if (scope.type === "next") {
      const fromOrder = currentChapter?.chapter_order ?? -Infinity;
      ordered = ordered.filter((c) => (c.chapter_order ?? 0) >= fromOrder).slice(0, scope.count);
    }
    if (!ordered.length) {
      toast({ title: "Không có chương nào để quét", variant: "destructive" });
      return;
    }
    const matrixText = buildPronounMatrixPrompt(project?.contextual_pronoun_rules || []);
    const qaOptions = qualityOptions();
    setStoryBetaReaderProgress({ done: 0, total: ordered.length, found: 0, skipped: 0, failed: 0, currentTitle: "" });
    setRunningStoryBetaReader(true);
    let nextChapters = [];

    for (let i = 0; i < ordered.length; i++) {
      if (storyBetaReaderStopRef.current) break;
      const meta = ordered[i];
      setStoryBetaReaderProgress((p) => ({ ...p, currentTitle: meta.title }));
      try {
        let chapter = chapterCacheRef.current.get(meta.id);
        if (!chapter) {
          chapter = await Chapter.get(meta.id);
          chapterCacheRef.current.set(meta.id, chapter);
          capCache(chapterCacheRef.current);
        }
        const sourceText = chapter.edited || "";
        if (!sourceText.trim()) {
          setStoryBetaReaderProgress((p) => ({ ...p, done: p.done + 1, skipped: p.skipped + 1 }));
        } else {
          const qaHints = runQualityCheck(sourceText, qaOptions)
            .slice(0, 25)
            .map((issue) => `- "${issue.value}": ${issue.context}`.slice(0, 220))
            .join("\n");
          const notes = await runNoteScanOnText(
            sourceText,
            (chunk) => buildBetaReaderPrompt(chunk, matrixText, qaHints),
            `story-beta-reader-${meta.id}`
          );
          if (notes.length) {
            nextChapters = [...nextChapters.filter((c) => c.id !== meta.id), { id: meta.id, title: meta.title, chapter_order: meta.chapter_order, notes }];
            setStoryBetaReaderReport(() => {
              const next = { chapters: nextChapters, scannedAt: Date.now() };
              localStorage.setItem(`etq-story-beta-reader:${projectId}`, JSON.stringify(next));
              return next;
            });
            setStoryBetaReaderProgress((p) => ({ ...p, done: p.done + 1, found: p.found + 1 }));
          } else {
            setStoryBetaReaderProgress((p) => ({ ...p, done: p.done + 1 }));
          }
        }
      } catch (e) {
        setStoryBetaReaderErrors((prev) => [...prev, { title: meta.title, message: e.message }]);
        setStoryBetaReaderProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
      }
      if (!storyBetaReaderStopRef.current && i < ordered.length - 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }

    setRunningStoryBetaReader(false);
    setStoryBetaReaderFinished(true);
    toast({ title: storyBetaReaderStopRef.current ? "Đã dừng Beta reader hàng loạt ⏸️" : "Hoàn tất Beta reader hàng loạt! ✨" });
  };

  const handleStopStoryBetaReader = () => { storyBetaReaderStopRef.current = true; };

  const handleOpenStoryBetaReaderChapter = async (chapterId) => {
    const entry = storyBetaReaderReport?.chapters.find((c) => c.id === chapterId);
    if (!entry) return;
    await switchChapter(chapterId);
    setBetaReaderNotes(entry.notes);
    setBetaReaderChapterId(chapterId);
    setBetaReaderContextNote(null);
    setShowStoryBetaReader(false);
    setShowBetaReader(true);
  };

  const handleStartTargetedFix = async (description, scope) => {
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      toast({ title: "Hãy mô tả lỗi cần tìm trước", variant: "destructive" });
      return;
    }
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return;
    }
    targetedFixStopRef.current = false;
    setTargetedFixErrors([]);
    setTargetedFixFinished(false);
    if (currentChapter) await flushSave(currentChapter, true);

    let ordered;
    if (scope.type === "current") {
      if (!currentChapter) {
        toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
        return;
      }
      ordered = [currentChapter];
    } else {
      let chapters;
      try {
        chapters = await fetchAllPages(
          (limit, skip) => Chapter.filterNonEmpty({ project_id: projectId }, "edited", "chapter_order", limit, skip, ["title", "chapter_order", "edited"]),
          { pageSize: 300, maxItems: CHAPTER_FETCH_CAP }
        );
      } catch (error) {
        toast({ title: "Không lấy được danh sách chương", description: error.message, variant: "destructive" });
        return;
      }
      ordered = [...chapters].sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0));
      if (scope.type === "next") {
        const fromOrder = currentChapter?.chapter_order ?? -Infinity;
        ordered = ordered.filter((c) => (c.chapter_order ?? 0) >= fromOrder).slice(0, scope.count);
      }
    }
    if (!ordered.length) {
      toast({ title: "Không có chương nào để quét", variant: "destructive" });
      return;
    }

    setTargetedFixProgress({ done: 0, total: ordered.length, found: 0, skipped: 0, failed: 0, currentTitle: "" });
    setRunningTargetedFix(true);
    let nextChapters = [];

    for (let i = 0; i < ordered.length; i++) {
      if (targetedFixStopRef.current) break;
      const meta = ordered[i];
      setTargetedFixProgress((p) => ({ ...p, currentTitle: meta.title }));
      try {
        let chapter = chapterCacheRef.current.get(meta.id);
        if (!chapter) {
          chapter = await Chapter.get(meta.id);
          chapterCacheRef.current.set(meta.id, chapter);
          capCache(chapterCacheRef.current);
        }
        const sourceText = chapter.edited || "";
        if (!sourceText.trim()) {
          setTargetedFixProgress((p) => ({ ...p, done: p.done + 1, skipped: p.skipped + 1 }));
        } else {
          const notes = await runNoteScanOnText(
            sourceText,
            (chunk) => buildTargetedFixPrompt(chunk, trimmedDescription),
            `targeted-fix-${meta.id}`
          );
          if (notes.length) {
            nextChapters = [...nextChapters.filter((c) => c.id !== meta.id), { id: meta.id, title: meta.title, chapter_order: meta.chapter_order, notes }];
            setTargetedFixReport(() => {
              const next = { description: trimmedDescription, chapters: nextChapters, scannedAt: Date.now() };
              localStorage.setItem(`etq-targeted-fix:${projectId}`, JSON.stringify(next));
              return next;
            });
            setTargetedFixProgress((p) => ({ ...p, done: p.done + 1, found: p.found + 1 }));
          } else {
            setTargetedFixProgress((p) => ({ ...p, done: p.done + 1 }));
          }
        }
      } catch (e) {
        setTargetedFixErrors((prev) => [...prev, { title: meta.title, message: e.message }]);
        setTargetedFixProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
      }
      if (!targetedFixStopRef.current && i < ordered.length - 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }

    setRunningTargetedFix(false);
    setTargetedFixFinished(true);
    toast({ title: targetedFixStopRef.current ? "Đã dừng tìm & sửa ⏸️" : "Đã tìm xong! ✨" });
  };

  const handleStopTargetedFix = () => { targetedFixStopRef.current = true; };

  const handleOpenTargetedFixChapter = async (chapterId) => {
    const entry = targetedFixReport?.chapters.find((c) => c.id === chapterId);
    if (!entry) return;
    await switchChapter(chapterId);
    setBetaReaderNotes(entry.notes);
    setBetaReaderChapterId(chapterId);
    setBetaReaderContextNote(targetedFixReport?.description ? `Đang xem theo mô tả: "${targetedFixReport.description}"` : null);
    setShowTargetedFix(false);
    setShowBetaReader(true);
  };

  const handleScanPronounInventory = async () => {
    setScanningPronounInventory(true);
    try {
      const chapters = await fetchAllPages(
        (limit, skip) => Chapter.filterNonEmpty({ project_id: projectId }, "edited", "chapter_order", limit, skip, ["title", "chapter_order", "edited"]),
        { pageSize: 300, maxItems: CHAPTER_FETCH_CAP }
      );
      setPronounInventory(scanPronounInventory(chapters, project?.contextual_pronoun_rules || []));
    } catch (error) {
      toast({ title: "Không quét được xưng hô toàn truyện", description: error.message, variant: "destructive" });
    } finally {
      setScanningPronounInventory(false);
    }
  };

  const handleRunPronounBootstrap = async (chapterCount) => {
    setRunningPronounBootstrap(true);
    try {
      const chapters = await Chapter.filterNonEmpty(
        { project_id: projectId }, "edited", "chapter_order", chapterCount, 0, ["title", "chapter_order", "edited"]
      );
      const knownNames = [...new Set(
        (project?.contextual_pronoun_rules || []).flatMap((r) => [r.speaker, r.listener]).filter((n) => n && n !== "*")
      )];
      setPronounBootstrap(discoverPronounRules(chapters, { knownNames }));
    } catch (error) {
      toast({ title: "Không khởi tạo được Ma Trận", description: error.message, variant: "destructive" });
    } finally {
      setRunningPronounBootstrap(false);
    }
  };

  // Batch counterpart of handleCheckPronouns — same per-chunk AI call +
  // whole-chapter diff, just looped across every chapter with content and
  // NEVER writing `edited` during the scan (mirrors handleStartBatchBetaAi's
  // "suggestions only" safety: nothing is touched until the user opens a
  // chapter and explicitly applies, or confirms the bulk-apply shortcut).
  const handleStartStoryPronounAi = async () => {
    const matrixText = buildPronounMatrixPrompt(project?.contextual_pronoun_rules || []);
    if (!matrixText) {
      toast({ title: "Chưa có quy tắc nào trong Ma Trận Xưng Hô!", variant: "destructive" });
      return;
    }
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return;
    }
    storyPronounAiStopRef.current = false;
    setStoryPronounAiErrors([]);
    setStoryPronounAiFinished(false);
    if (currentChapter) await flushSave(currentChapter, true);
    let chapters;
    try {
      chapters = await fetchAllPages(
        (limit, skip) => Chapter.filterNonEmpty({ project_id: projectId }, "edited", "chapter_order", limit, skip, ["title", "chapter_order", "edited"]),
        { pageSize: 300, maxItems: CHAPTER_FETCH_CAP }
      );
    } catch (error) {
      toast({ title: "Không lấy được danh sách chương", description: error.message, variant: "destructive" });
      return;
    }
    const ordered = [...chapters].sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0));
    setStoryPronounAiProgress({ done: 0, total: ordered.length, found: 0, skipped: 0, failed: 0, currentTitle: "" });
    setRunningStoryPronounAi(true);
    let nextChapters = [];

    for (let i = 0; i < ordered.length; i++) {
      if (storyPronounAiStopRef.current) break;
      const meta = ordered[i];
      setStoryPronounAiProgress((p) => ({ ...p, currentTitle: meta.title }));
      const sourceText = meta.edited || "";
      if (!sourceText.trim()) {
        setStoryPronounAiProgress((p) => ({ ...p, done: p.done + 1, skipped: p.skipped + 1 }));
        continue;
      }
      try {
        const chunks = chunkText(sourceText, AI_CHUNK_CHARS);
        let fixedText;
        if (chunks.length <= 1) {
          fixedText = await callLLM(buildPronounCheckPrompt(sourceText, matrixText));
        } else {
          const results = [];
          for (let c = 0; c < chunks.length; c++) {
            setStoryPronounAiProgress((p) => ({ ...p, currentTitle: `${meta.title} (đoạn ${c + 1}/${chunks.length})` }));
            // eslint-disable-next-line no-await-in-loop
            results.push(await callLLM(buildPronounCheckPrompt(chunks[c], matrixText)));
          }
          fixedText = results.join("\n\n");
        }
        const diff = diffTextChanges(sourceText, fixedText);
        if (diff.length) {
          nextChapters = [
            ...nextChapters.filter((c) => c.id !== meta.id),
            { id: meta.id, title: meta.title, chapter_order: meta.chapter_order, diff, originalText: sourceText, proposedText: fixedText },
          ];
          const report = { chapters: nextChapters, scannedAt: new Date().toISOString() };
          setStoryPronounAiReport(report);
          localStorage.setItem(`etq-story-pronoun-ai:${projectId}`, JSON.stringify(report));
          setStoryPronounAiProgress((p) => ({ ...p, done: p.done + 1, found: p.found + 1 }));
        } else {
          setStoryPronounAiProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      } catch (error) {
        setStoryPronounAiErrors((prev) => [...prev, { title: meta.title, message: error.message }]);
        setStoryPronounAiProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
      }
      if (!storyPronounAiStopRef.current && i < ordered.length - 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }

    setRunningStoryPronounAi(false);
    setStoryPronounAiFinished(true);
    toast({ title: storyPronounAiStopRef.current ? "Đã dừng kiểm tra AI toàn truyện ⏸️" : "Hoàn tất kiểm tra AI toàn truyện! ✨" });
  };
  const handleStopStoryPronounAi = () => { storyPronounAiStopRef.current = true; };

  // Lands the user on the chapter with the diff/apply UI already built for
  // the single-chapter AI check (ContextualPronounDialog, pronounCheckDiff +
  // handleApplyPronounCheck) — no new review UI, just hydrating that state
  // from the stored batch result instead of requiring a fresh AI call.
  const handleOpenStoryPronounAiChapter = async (chapterId) => {
    const entry = storyPronounAiReport?.chapters.find((c) => c.id === chapterId);
    if (!entry) return;
    await switchChapter(chapterId);
    setPronounCheckDiff(entry.diff);
    setPronounCheckPreview({ chapterId: entry.id, original: entry.originalText, proposed: entry.proposedText });
  };

  // Optional shortcut once the user trusts the AI suggestions enough to skip
  // opening every chapter individually — same bulkUpsert + undo mechanics as
  // handleStoryQaApplyAllPronoun (Phần 2), just keyed by whole-chapter
  // proposedText instead of per-location patches.
  const handleApplyAllStoryPronounAi = async () => {
    const entries = storyPronounAiReport?.chapters || [];
    if (!entries.length) return;
    setBatchReplaceRunning(true);
    try {
      const ids = entries.map((e) => e.id);
      const chapters = await Chapter.getMany(ids);
      const byId = new Map(entries.map((e) => [e.id, e]));
      const eligible = chapters.filter((chapter) => (chapter.edited || "") === byId.get(chapter.id)?.originalText);
      if (!eligible.length) {
        toast({ title: "Không còn chương nào khớp để áp dụng", description: "Có thể các chương đã bị sửa khác từ lúc quét. Hãy quét lại.", variant: "destructive" });
        return;
      }
      setBatchReplaceUndo({ target: "edited", rows: eligible.map(chapterUpsertRow) });
      const changedRows = eligible.map((chapter) => chapterUpsertRow({ ...chapter, edited: byId.get(chapter.id).proposedText }));
      let updated = [];
      for (let index = 0; index < changedRows.length; index += 200) {
        updated = updated.concat(await Chapter.bulkUpsert(changedRows.slice(index, index + 200)));
      }
      updated.forEach((chapter) => { chapterCacheRef.current.set(chapter.id, chapter); lastSavedRef.current.set(chapter.id, snapshotOf(chapter)); });
      const active = updated.find((chapter) => chapter.id === currentChapter?.id);
      if (active) setCurrentChapter(active);
      const appliedIds = new Set(eligible.map((c) => c.id));
      const remaining = entries.filter((e) => !appliedIds.has(e.id));
      const report = { chapters: remaining, scannedAt: storyPronounAiReport?.scannedAt || new Date().toISOString() };
      setStoryPronounAiReport(report);
      localStorage.setItem(`etq-story-pronoun-ai:${projectId}`, JSON.stringify(report));
      toast({ title: `Đã áp dụng đề xuất AI cho ${updated.length} chương`, description: "Có thể hoàn tác trong Trung tâm QA." });
    } catch (error) {
      toast({ title: "Không thể áp dụng hàng loạt", description: error.message, variant: "destructive" });
    } finally {
      setBatchReplaceRunning(false);
    }
  };

  const handleOpenPronounOccurrence = async (item) => {
    await switchChapter(item.chapterId);
    setMobileActiveCol("edited");
    setPanel3Mode("edit");
    window.setTimeout(() => {
      const textarea = document.querySelector("[data-etq-panel='final'] [data-etq-role='edit-content']");
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      textarea.focus();
      textarea.setSelectionRange(item.start, item.end);
      textarea.scrollTop = Math.max(0, (item.line - 3) * 32);
    }, 100);
  };

  // Self-translate (built-in Hán-Việt dictionary engine — free, client-side,
  // zero AI/DB cost). Fills Cột 2 (QT thô) from Cột 1 (Văn bản gốc). The
  // dictionary data itself is fetched lazily on first use (dynamic import),
  // so this is async — everything after that is local computation.
  const handleSelfTranslate = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const sourceText = currentChapter.raw_original || "";
    if (!sourceText.trim() || !/[\p{Script=Han}]/u.test(sourceText)) {
      toast({ title: "Chưa có Văn bản gốc để dịch!", variant: "destructive" });
      return;
    }
    if (!supportsSelfTranslate(project?.source_language)) {
      toast({
        title: "Tự dịch tự thân hiện chỉ hỗ trợ nguồn tiếng Trung",
        description: "Với ngôn ngữ khác, hãy dùng Auto Edit / AI để dịch trực tiếp.",
        variant: "destructive",
      });
      return;
    }
    const chapterId = currentChapter.id;
    setSelfTranslating(true);
    try {
      const translationTerms = mergeHanVietVocabulary(glossaryTerms, hanVietVocabulary);
      const { text, coverage, unknownChars, diagnostics } = await translateHanViet(sourceText, translationTerms);
      setCurrentChapter((prev) =>
        prev && prev.id === chapterId ? { ...prev, qt_raw: text } : prev
      );
      const pct = Math.round(coverage * 100);
      toast({
        title: `📖 Đã tạo QT — ${pct}% ký tự có cách đọc`,
        description: `${diagnostics?.fallbackChars || 0} chữ đọc rời; ${diagnostics?.guessedNameChars || 0} chữ thuộc tên máy đoán; ${unknownChars.length} chữ chưa biết. Đây không phải tỷ lệ dịch đúng.`,
      });
    } catch (e) {
      toast({ title: "Lỗi tự dịch", description: e.message, variant: "destructive" });
    }
    setSelfTranslating(false);
  };

  // Rule-based edit (src/lib/ruleEdit.js — zero AI, zero network, patterns
  // derived from the user's own real QT-thô/Bản-Edit chapter pairs). Fills
  // Cột 3 (Bản Edit) from Cột 2 (QT thô), same as Auto Edit/Custom AI but
  // synchronous since there's no API call.
  const handleRuleEdit = () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    const chapterId = currentChapter.id;
    const prevEdited = currentChapter.edited || "";
    const sourceText = currentChapter.qt_raw || currentChapter.raw_original || "";
    if (!sourceText.trim()) {
      toast({ title: "Không có QT thô để edit!", variant: "destructive" });
      return;
    }
    const finalText = applyHardRules(applyRuleEdit(sourceText));
    setCurrentChapter((prev) =>
      prev && prev.id === chapterId ? { ...prev, edited: finalText } : prev
    );
    setAiUndo({ chapterId, previous: prevEdited });
    checkLineAlignment(sourceText, finalText);
    toast({ title: "✨ Đã edit bằng rule (không AI)!", description: "Kiểm tra và chỉnh sửa thêm nhé" });
  };

  const parseImageResult = (raw) => {
    const gocMatch = raw.match(/===GOC===([\s\S]*?)(?:===DICH===|$)/i);
    const dichMatch = raw.match(/===DICH===([\s\S]*)$/i);
    const parsedRaw = (gocMatch?.[1] || "").trim();
    const translated = (dichMatch?.[1] || "").trim();
    // Fallback if the model didn't follow the marker format.
    if (!parsedRaw && !translated) return { raw: "", translated: raw.trim() };
    return { raw: parsedRaw, translated };
  };

  // Dịch từ ảnh: OCR + translate in one custom-AI call.
  const handleSelectImageFile = async (file) => {
    if (!file) return;
    setImageResult(null);
    setImageTranslating(true);
    try {
      const image = await fileToBase64(file);
      const prompt = `Bạn là trợ lý OCR và dịch thuật. Đọc TOÀN BỘ chữ trong ảnh (có thể là tiếng Trung/Anh/Nhật/Hàn hoặc ngôn ngữ khác) và thực hiện:
1. Chép lại chính xác nguyên văn chữ trong ảnh, giữ đúng ngôn ngữ gốc, giữ đúng cấu trúc xuống dòng.
2. Dịch toàn bộ đoạn đó sang tiếng Việt, văn phong tự nhiên, thoát ý.

Trả về ĐÚNG định dạng sau, không thêm giải thích nào khác:
===GOC===
<nguyên văn chép từ ảnh>
===DICH===
<bản dịch tiếng Việt>`;
      const raw = await callLLM(prompt, image);
      setImageResult(parseImageResult(raw));
    } catch (e) {
      toast({ title: "Lỗi dịch ảnh", description: e.message, variant: "destructive" });
    }
    setImageTranslating(false);
  };

  const handleEditImageRaw = (newRaw) => {
    setImageResult((prev) => (prev ? { ...prev, raw: newRaw } : prev));
  };

  const handleApplyImageResult = () => {
    if (!currentChapter || !imageResult) return;
    setCurrentChapter({
      ...currentChapter,
      raw_original: imageResult.raw
        ? [currentChapter.raw_original, imageResult.raw].filter(Boolean).join("\n")
        : currentChapter.raw_original,
      qt_raw: imageResult.translated
        ? [currentChapter.qt_raw, imageResult.translated].filter(Boolean).join("\n")
        : currentChapter.qt_raw,
    });
    setShowImageTranslate(false);
    setImageResult(null);
    toast({ title: "Đã áp dụng kết quả dịch ảnh vào chương! 🖼️" });
  };

  // Detect missing names AND address/pronoun vocabulary chapter by chapter.
  // The full chapter is chunked so terms near the end are not silently missed.
  const handleDetectNames = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return;
    }
    if (detectingNames || savingDiscoveredTerms) { setShowDetectNames(true); return; }
    const sourceText = currentChapter.raw_original || "";
    if (!sourceText.trim() || !/[\p{Script=Han}]/u.test(sourceText)) {
      toast({ title: "Cần văn bản gốc tiếng Trung để tìm đúng chữ Hán cho Glossary.", variant: "destructive" });
      return;
    }
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return;
    }
    setShowDetectNames(true);
    setDetectingNames(true);
    setNameCandidates(null);
    setDiscoveryWarnings([]);
    setDiscoveryProgress({ done: 0, total: 0, label: "Máy quét ứng viên trong chương" });
    discoveryStopRef.current = false;
    discoveryContextRef.current = { projectId, chapterId: currentChapter.id, title: currentChapter.title };
    try {
      const preview = await translateHanViet(sourceText, glossaryTerms);
      const result = await discoverGlossary({ text: sourceText, knownTerms: glossaryTerms,
        fallbackSpans: preview.diagnostics?.fallbackSpans || [], callAI: callLLM,
        onProgress: setDiscoveryProgress, shouldStop: () => discoveryStopRef.current });
      setNameCandidates(result.candidates);
      setDiscoveryWarnings([...result.warnings,
        ...(result.stopped ? ["Đã dừng. Kết quả dưới đây mới được kiểm tra một phần."] : []),
        ...(result.unreviewed ? [`${result.unreviewed} gợi ý mạnh của máy chưa được AI xác nhận; nằm trong mục Cần xem lại.`] : []),
      ]);
    } catch (e) {
      toast({ title: "Lỗi phát hiện Glossary", description: e.message, variant: "destructive" });
      setShowDetectNames(false);
    }
    setDetectingNames(false);
  };

  const handleAddDetectedNames = async (selected) => {
    if (!selected.length || savingDiscoveredTerms) return;
    const scanContext = discoveryContextRef.current;
    if (!scanContext || scanContext.projectId !== projectId) {
      toast({ title: "Dự án đã thay đổi. Hãy quét lại Glossary.", variant: "destructive" });
      return;
    }
    setSavingDiscoveredTerms(true);
    try {
      const existing = new Set(glossaryTerms.map(t => t.source_term.trim()));
      const withProjectId = selected.filter(t => {
        if (!t.source_term.trim() || !t.translation.trim() || existing.has(t.source_term.trim())) return false;
        existing.add(t.source_term.trim());
        return true;
      }).map((t) => ({
        source_term: t.source_term,
        translation: t.translation,
        category: t.category,
        notes: "",
        custom_fields: { source: "hybrid_glossary_discovery", approved: true, chapter_id: scanContext.chapterId,
          confidence: t.confidence, evidence: t.evidence, contexts: t.contexts, occurrences: t.count,
          discovery_origin: t.origin, ...(t.category === "Xưng hô" ? { __qa_mode: "contextual" } : {}) },
        project_id: projectId,
      }));
      const created = withProjectId.length ? await GlossaryTerm.bulkCreate(withProjectId) : [];
      setGlossaryTerms((prev) => [...created, ...prev]);
      setShowDetectNames(false);
      toast({ title: `Đã thêm ${created.length} mục vào Glossary! 🌸`, description: "Bấm Tự dịch để tạo lại QT với các mục vừa duyệt, sau đó dùng AI Edit." });
    } catch (e) {
      toast({ title: "Lỗi thêm Glossary", description: e.message, variant: "destructive" });
    } finally {
      setSavingDiscoveredTerms(false);
    }
  };

  // AI reads the current chapter and proposes preset fields (genre/era/
  // character notes/style). Returns the suggestion object for the dialog to
  // merge into its own draft form — never writes to the project/preset
  // directly, so nothing is saved until the user reviews and hits Lưu.
  const handleSuggestPreset = async () => {
    if (!currentChapter) {
      toast({ title: "Hãy chọn chương trước!", variant: "destructive" });
      return null;
    }
    const sourceText = (currentChapter.raw_original || currentChapter.qt_raw || "").slice(0, 6000);
    if (!sourceText.trim()) {
      toast({ title: "Chương chưa có văn bản để phân tích!", variant: "destructive" });
      return null;
    }
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return null;
    }
    const prompt = `Bạn là biên tập viên truyện dịch giàu kinh nghiệm. Đọc đoạn văn bản sau (có thể là bản dịch thô QT/Convert, chưa mượt) và đề xuất cấu hình "preset văn phong" phù hợp nhất để AI dùng khi biên tập bộ truyện này.

Trả về DUY NHẤT một object JSON hợp lệ (không markdown, không giải thích thêm), đúng dạng:
{"genres": ["<chỉ chọn từ danh sách sau, đúng chính tả>"], "setting_era": "<mô tả ngắn bối cảnh/thời đại, ví dụ: Cổ đại Trung Hoa giả tưởng>", "character_notes": [{"character": "<tên nhân vật>", "note": "<mô tả quy tắc xưng hô/hành xử đặc biệt đổi theo tình huống — CHỈ liệt kê khi có căn cứ rõ trong văn bản, ví dụ nhân vật giả trai/giả gái, có thân phận kép, đổi cách xưng hô theo hoàn cảnh>"}], "prompt_instructions": "<2-4 câu mô tả văn phong/nguyên tắc dịch phù hợp thể loại và bối cảnh này>"}

Danh sách thể loại được chọn cho "genres": ${GENRE_OPTIONS.join(", ")}

Nếu không đủ căn cứ để đề xuất mục nào (đặc biệt character_notes — đừng bịa nếu văn bản không thể hiện rõ), để mảng rỗng [] hoặc chuỗi rỗng "" cho mục đó.

ĐOẠN VĂN BẢN:
${sourceText}`;

    try {
      const raw = await callLLM(prompt);
      let text = (raw || "").trim();
      text = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(text);
      return {
        genres: Array.isArray(parsed.genres) ? parsed.genres.filter((g) => GENRE_OPTIONS.includes(g)) : [],
        setting_era: typeof parsed.setting_era === "string" ? parsed.setting_era.trim() : "",
        character_notes: Array.isArray(parsed.character_notes)
          ? parsed.character_notes
              .filter((n) => n?.character?.trim() && n?.note?.trim())
              .map((n) => ({ character: n.character.trim(), note: n.note.trim() }))
          : [],
        prompt_instructions:
          typeof parsed.prompt_instructions === "string" ? parsed.prompt_instructions.trim() : "",
      };
    } catch (e) {
      toast({ title: "Lỗi gợi ý preset", description: e.message, variant: "destructive" });
      return null;
    }
  };

  // Clear a column's text (with confirm) — shared by all 3 columns.
  const handleClearColumn = () => {
    if (!clearTarget || !currentChapter) return;
    setCurrentChapter({ ...currentChapter, [clearTarget.field]: "" });
    toast({ title: `Đã xóa ${clearTarget.label} 🗑️` });
    setClearTarget(null);
  };

  const handleCopyColumn = async (text, label) => {
    if (!text) {
      toast({ title: "Chưa có nội dung để sao chép", variant: "destructive" });
      return;
    }
    try {
      await copyRichText(text);
      toast({ title: `Đã sao chép ${label}! 📋`, description: "Đã giữ khoảng cách đoạn văn khi dán sang nơi khác." });
    } catch (e) {
      toast({ title: "Lỗi sao chép", description: e.message, variant: "destructive" });
    }
  };

  // Copy + clear buttons shared by all 3 editor columns.
  const renderColumnActions = (field, label, value) => (
    <>
      <button
        onClick={() => handleCopyColumn(value, label)}
        className="p-1.5 rounded-lg bg-white/70 hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors border border-violet-100"
        title={`Sao chép toàn bộ ${label}`}
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
      {value ? (
        <button
          onClick={() => setClearTarget({ field, label })}
          className="p-1.5 rounded-lg bg-white/70 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors border border-violet-100"
          title={`Xóa toàn bộ ${label}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </>
  );

  // Always-visible restore tab shown in place of a hidden column — the
  // "Cột" dropdown in the toolbar also toggles this, but a tab right where
  // the panel used to be is impossible to miss.
  const renderRestoreTab = (col, _legacyIcon, label) => (
    <button
      data-legacy-icon={_legacyIcon}
      onClick={() => handleToggleColumn(col)}
      className="hidden md:flex flex-col items-center justify-center gap-2 w-10 shrink-0 rounded-xl bg-white border border-slate-200 text-slate-400 hover:border-violet-300 hover:text-violet-600 transition-colors py-4 shadow-sm"
      title={`Hiện lại cột ${label}`}
    >
      <PanelRightOpen className="h-4 w-4" />
      <span
        className="text-[10px] font-medium tracking-wide"
        style={{ writingMode: "vertical-rl" }}
      >
        {label}
      </span>
    </button>
  );

  // Import glossary terms (bulk create)
  const handleImportTerms = async (terms) => {
    try {
      const withProjectId = terms.map((t) => ({
        ...t,
        project_id: projectId,
      }));
      let created = [];
      for (let i = 0; i < withProjectId.length; i += 500) {
        const batch = withProjectId.slice(i, i + 500);
        // eslint-disable-next-line no-await-in-loop
        const result = await GlossaryTerm.bulkCreate(batch);
        created = created.concat(result);
      }
      setGlossaryTerms((prev) => [...created, ...prev]);
      toast({ title: `Đã nhập ${created.length} thuật ngữ! 📥` });
    } catch (e) {
      toast({
        title: "Lỗi nhập từ điển",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleCreateChapter = async () => {
    try {
      const maxOrder = chapterList.reduce(
        (m, c) => Math.max(m, c.chapter_order ?? 0),
        -1
      );
      const created = await Chapter.create({
        project_id: projectId,
        title: `Chương ${chapterList.length + 1}`,
        chapter_order: maxOrder + 1,
        raw_original: "",
        qt_raw: "",
        edited: "",
      });
      setChapterList((prev) => [
        ...prev,
        { id: created.id, title: created.title, chapter_order: created.chapter_order },
      ]);
      chapterCacheRef.current.set(created.id, created);
      lastSavedRef.current.set(created.id, snapshotOf(created));
      if (currentChapter) await flushSave(currentChapter);
      setCurrentChapter(created);
      toast({ title: "Đã tạo chương mới! 📖" });
    } catch (e) {
      toast({
        title: "Lỗi tạo chương",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleRenameChapter = async (chapterId, newTitle) => {
    try {
      await Chapter.update(chapterId, { title: newTitle });
      setChapterList((prev) =>
        prev.map((c) => (c.id === chapterId ? { ...c, title: newTitle } : c))
      );
      const cached = chapterCacheRef.current.get(chapterId);
      if (cached) chapterCacheRef.current.set(chapterId, { ...cached, title: newTitle });
      if (currentChapter?.id === chapterId) {
        setCurrentChapter((prev) => (prev ? { ...prev, title: newTitle } : prev));
      }
      toast({ title: "Đã đổi tên chương" });
    } catch (e) {
      toast({ title: "Lỗi đổi tên", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteChapter = async (chapterId) => {
    try {
      if (currentChapter?.id === chapterId) await flushSave(currentChapter, true);
      const backup = currentChapter?.id === chapterId
        ? { ...currentChapter }
        : await Chapter.get(chapterId);
      await Chapter.delete(chapterId);
      const remaining = chapterList.filter((c) => c.id !== chapterId);
      setChapterList(remaining);
      chapterCacheRef.current.delete(chapterId);
      lastSavedRef.current.delete(chapterId);
      if (currentChapter?.id === chapterId) {
        if (remaining.length > 0) {
          const nextId = remaining[0].id;
          let target = chapterCacheRef.current.get(nextId);
          if (!target) {
            target = await Chapter.get(nextId);
            chapterCacheRef.current.set(nextId, target);
            lastSavedRef.current.set(nextId, snapshotOf(target));
          }
          setCurrentChapter(target);
        } else {
          setCurrentChapter(null);
        }
      }
      setChapterDeleteUndo([backup]);
      toast({ title: "Đã xóa chương" });
    } catch (e) {
      toast({ title: "Lỗi xóa chương", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteSelectedChapters = async (chapterIds) => {
    const ids = [...new Set(chapterIds)].filter((id) => chapterList.some((ch) => ch.id === id));
    if (ids.length === 0) return;

    try {
      if (currentChapter && ids.includes(currentChapter.id)) {
        await flushSave(currentChapter, true);
      }
      const backups = await Chapter.getMany(ids);
      const currentIndex = currentChapter
        ? backups.findIndex((chapter) => chapter.id === currentChapter.id)
        : -1;
      if (currentIndex >= 0) backups[currentIndex] = { ...currentChapter };
      await Chapter.deleteMany(ids);
      const deletedIds = new Set(ids);
      const remaining = chapterList.filter((chapter) => !deletedIds.has(chapter.id));

      ids.forEach((id) => {
        chapterCacheRef.current.delete(id);
        lastSavedRef.current.delete(id);
      });
      setChapterList(remaining);

      if (currentChapter && deletedIds.has(currentChapter.id)) {
        if (remaining.length > 0) {
          const nextId = remaining[0].id;
          let target = chapterCacheRef.current.get(nextId);
          if (!target) {
            target = await Chapter.get(nextId);
            chapterCacheRef.current.set(nextId, target);
            lastSavedRef.current.set(nextId, snapshotOf(target));
          }
          setCurrentChapter(target);
        } else {
          setCurrentChapter(null);
        }
      }

      setChapterDeleteUndo(backups);
      toast({ title: `Đã xóa ${ids.length} chương` });
    } catch (e) {
      toast({
        title: "Lỗi xóa nhiều chương",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleUndoChapterDelete = async () => {
    if (!chapterDeleteUndo?.length) return;

    try {
      const rows = chapterDeleteUndo.map((chapter) => ({
        id: chapter.id,
        project_id: chapter.project_id,
        title: chapter.title,
        chapter_order: chapter.chapter_order,
        raw_original: chapter.raw_original || "",
        qt_raw: chapter.qt_raw || "",
        edited: chapter.edited || "",
      }));
      const restored = await Chapter.bulkCreate(rows);
      const restoredById = new Map(restored.map((chapter) => [chapter.id, chapter]));

      restored.forEach((chapter) => {
        chapterCacheRef.current.set(chapter.id, chapter);
        lastSavedRef.current.set(chapter.id, snapshotOf(chapter));
      });
      capCache(chapterCacheRef.current);
      setChapterList((previous) => {
        const previousIds = new Set(previous.map((chapter) => chapter.id));
        return [
          ...previous,
          ...rows
            .filter((chapter) => !previousIds.has(chapter.id))
            .map((chapter) => ({
              id: chapter.id,
              title: chapter.title,
              chapter_order: chapter.chapter_order,
            })),
        ].sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0));
      });

      if (!currentChapter && restored.length > 0) {
        setCurrentChapter(restoredById.get(rows[0].id) || restored[0]);
      }
      const restoredCount = restored.length;
      setChapterDeleteUndo(null);
      toast({ title: `Đã hoàn tác, khôi phục ${restoredCount} chương` });
    } catch (e) {
      toast({
        title: "Không thể hoàn tác xóa chương",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const scanQtPartMarkers = async () => {
    setQtCleanupRunning(true);
    try {
      if (currentChapter) await flushSave(currentChapter, true);
      const chapters = [];
      for (let offset = 0; offset < chapterList.length; offset += 200) {
        // eslint-disable-next-line no-await-in-loop
        const rows = await Chapter.getMany(chapterList.slice(offset, offset + 200).map((chapter) => chapter.id));
        rows.forEach((chapter) => {
          const cleaned = cleanToolPartMarkers(chapter.qt_raw);
          if (cleaned.changed) chapters.push({
            id:chapter.id,
            title:chapter.title,
            removed:cleaned.removed,
            before:chapter.qt_raw || "",
            after:cleaned.text,
            originalChapter:chapter,
          });
        });
      }
      chapters.sort((a,b) => (chapterList.findIndex((item)=>item.id===a.id) - chapterList.findIndex((item)=>item.id===b.id)));
      return { chapters, totalBlocks:chapters.reduce((sum,item)=>sum+item.removed,0) };
    } catch (error) {
      toast({ title:"Lỗi quét QT", description:error.message, variant:"destructive" });
      return { chapters:[], totalBlocks:0 };
    } finally { setQtCleanupRunning(false); }
  };

  const applyQtPartCleanup = async (scan) => {
    if (!scan?.chapters?.length) return null;
    setQtCleanupRunning(true);
    try {
      const rows = scan.chapters.map((item) => ({ ...item.originalChapter, qt_raw:item.after }));
      await Chapter.bulkUpsert(rows);
      setQtCleanupUndo(scan.chapters.map((item) => ({ ...item.originalChapter, qt_raw:item.before })));
      rows.forEach((row) => {
        const cached = chapterCacheRef.current.get(row.id);
        if (cached) {
          const updated = { ...cached, qt_raw:row.qt_raw };
          chapterCacheRef.current.set(row.id,updated);
          lastSavedRef.current.set(row.id,snapshotOf(updated));
        }
      });
      if (currentChapter && rows.some((row)=>row.id===currentChapter.id)) {
        const next = { ...currentChapter, qt_raw:rows.find((row)=>row.id===currentChapter.id).qt_raw };
        setCurrentChapter(next); lastSavedRef.current.set(next.id,snapshotOf(next));
      }
      toast({ title:`Đã xóa ${scan.totalBlocks} dấu chia Phần`, description:`Đã làm sạch ${rows.length} chương QT.` });
      return { changed:rows.length };
    } catch (error) { toast({title:"Không thể dọn QT",description:error.message,variant:"destructive"}); return null; }
    finally { setQtCleanupRunning(false); }
  };

  const undoQtPartCleanup = async () => {
    if (!qtCleanupUndo?.length) return;
    setQtCleanupRunning(true);
    try {
      await Chapter.bulkUpsert(qtCleanupUndo);
      qtCleanupUndo.forEach((row) => {
        const cached=chapterCacheRef.current.get(row.id);
        if(cached){const updated={...cached,qt_raw:row.qt_raw};chapterCacheRef.current.set(row.id,updated);lastSavedRef.current.set(row.id,snapshotOf(updated));}
      });
      if(currentChapter){const row=qtCleanupUndo.find((item)=>item.id===currentChapter.id);if(row){const next={...currentChapter,qt_raw:row.qt_raw};setCurrentChapter(next);lastSavedRef.current.set(next.id,snapshotOf(next));}}
      const count=qtCleanupUndo.length; setQtCleanupUndo(null); toast({title:`Đã hoàn tác ${count} chương QT`});
    } catch(error){toast({title:"Không thể hoàn tác",description:error.message,variant:"destructive"});}
    finally{setQtCleanupRunning(false);}
  };

  // Sparse reorder: only the moved chapter's order value changes (midpoint
  // between its new neighbours), so reordering costs exactly one write no
  // matter how many chapters the project has.
  const handleReorderChapter = async (fromIndex, toIndex) => {
    const list = [...chapterList];
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);

    const prevOrder = toIndex > 0 ? list[toIndex - 1].chapter_order : null;
    const nextOrder = toIndex < list.length - 1 ? list[toIndex + 1].chapter_order : null;
    let newOrder;
    if (prevOrder == null && nextOrder == null) newOrder = 0;
    else if (prevOrder == null) newOrder = nextOrder - 1;
    else if (nextOrder == null) newOrder = prevOrder + 1;
    else newOrder = (prevOrder + nextOrder) / 2;

    const updatedMoved = { ...moved, chapter_order: newOrder };
    list[toIndex] = updatedMoved;
    setChapterList(list);
    try {
      await Chapter.update(moved.id, { chapter_order: newOrder });
      const cached = chapterCacheRef.current.get(moved.id);
      if (cached) chapterCacheRef.current.set(moved.id, { ...cached, chapter_order: newOrder });
    } catch (e) {
      toast({ title: "Lỗi sắp xếp lại", description: e.message, variant: "destructive" });
      loadProjectData();
    }
  };

  // Bulk-import & auto-split pasted text into multiple new chapters.
  const handleImportChapters = async (parsedChapters, targetColumn) => {
    try {
      const baseOrder =
        chapterList.reduce((m, c) => Math.max(m, c.chapter_order ?? 0), -1) + 1;
      const toCreate = parsedChapters.map((c, i) => ({
        project_id: projectId,
        title: c.title || `Chương ${chapterList.length + i + 1}`,
        chapter_order: baseOrder + i,
        raw_original: targetColumn === "raw_original" ? c.content : "",
        qt_raw: targetColumn === "qt_raw" ? c.content : "",
        edited: targetColumn === "edited" ? c.content : "",
      }));
      let created = [];
      for (let i = 0; i < toCreate.length; i += 200) {
        const batch = toCreate.slice(i, i + 200);
        // eslint-disable-next-line no-await-in-loop
        const result = await Chapter.bulkCreate(batch);
        created = created.concat(result);
      }
      const lightweight = created.map((c) => ({
        id: c.id,
        title: c.title,
        chapter_order: c.chapter_order,
      }));
      setChapterList((prev) =>
        [...prev, ...lightweight].sort((a, b) => a.chapter_order - b.chapter_order)
      );
      created.forEach((c) => {
        chapterCacheRef.current.set(c.id, c);
        lastSavedRef.current.set(c.id, snapshotOf(c));
      });
      toast({ title: `Đã nhập ${created.length} chương! 📥` });
    } catch (e) {
      toast({ title: "Lỗi nhập chương", description: e.message, variant: "destructive" });
    }
  };

  const chapterUpsertRow = (chapter) => ({
    id: chapter.id,
    project_id: chapter.project_id,
    title: chapter.title,
    chapter_order: chapter.chapter_order,
    raw_original: chapter.raw_original || "",
    qt_raw: chapter.qt_raw || "",
    edited: chapter.edited || "",
  });

  const handleBulkColumnMove = async ({ source, target, operation }) => {
    if (!source || !target || source === target) return null;
    setMovingColumns(true);
    let backups = [];
    let updated = [];
    try {
      if (currentChapter) await flushSave(currentChapter, true);
      const chapters = await fetchAllPages(
        (limit, skip) => Chapter.filter({ project_id: projectId }, "chapter_order", limit, skip),
        { pageSize: 500, maxItems: CHAPTER_FETCH_CAP }
      );
      const emptySource = chapters.filter((chapter) => !String(chapter[source] || "").trim()).length;
      const targetOccupied = chapters.filter((chapter) => String(chapter[source] || "").trim() && String(chapter[target] || "").trim()).length;
      const candidates = chapters.filter((chapter) => String(chapter[source] || "").trim() && !String(chapter[target] || "").trim());
      if (!candidates.length) {
        toast({ title: "Không có chương nào cần chuyển", description: "Cột nguồn trống hoặc cột đích đã có dữ liệu." });
        return { changed: 0, emptySource, targetOccupied };
      }

      backups = candidates.map(chapterUpsertRow);
      const changedRows = candidates.map((chapter) => chapterUpsertRow({
        ...chapter,
        [target]: chapter[source],
        [source]: operation === "move" ? "" : chapter[source],
      }));
      for (let index = 0; index < changedRows.length; index += 200) {
        const batch = changedRows.slice(index, index + 200);
        // eslint-disable-next-line no-await-in-loop
        updated = updated.concat(await Chapter.bulkUpsert(batch));
      }
      updated.forEach((chapter) => {
        chapterCacheRef.current.set(chapter.id, chapter);
        lastSavedRef.current.set(chapter.id, snapshotOf(chapter));
      });
      capCache(chapterCacheRef.current);
      const active = updated.find((chapter) => chapter.id === currentChapter?.id);
      if (active) setCurrentChapter(active);
      setColumnMoveUndo(backups);
      toast({ title: `Đã ${operation === "move" ? "di chuyển" : "sao chép"} ${updated.length} chương`, description: targetOccupied ? `Đã bỏ qua ${targetOccupied} chương vì cột đích có dữ liệu.` : "Không ghi đè dữ liệu cũ." });
      return { changed: updated.length, emptySource, targetOccupied };
    } catch (error) {
      if (updated.length) {
        const updatedIds = new Set(updated.map((chapter) => chapter.id));
        setColumnMoveUndo(backups.filter((chapter) => updatedIds.has(chapter.id)));
        updated.forEach((chapter) => {
          chapterCacheRef.current.set(chapter.id, chapter);
          lastSavedRef.current.set(chapter.id, snapshotOf(chapter));
        });
        const active = updated.find((chapter) => chapter.id === currentChapter?.id);
        if (active) setCurrentChapter(active);
      }
      toast({
        title: updated.length ? `Đã chuyển ${updated.length} chương rồi gặp lỗi` : "Lỗi chuyển dữ liệu giữa các cột",
        description: updated.length ? `${error.message}. Bạn có thể dùng nút Hoàn tác cho phần đã chuyển.` : error.message,
        variant: "destructive",
      });
      return null;
    } finally {
      setMovingColumns(false);
    }
  };

  const handleUndoColumnMove = async () => {
    if (!columnMoveUndo?.length) return;
    setMovingColumns(true);
    try {
      let restored = [];
      for (let index = 0; index < columnMoveUndo.length; index += 200) {
        const batch = columnMoveUndo.slice(index, index + 200);
        // eslint-disable-next-line no-await-in-loop
        restored = restored.concat(await Chapter.bulkUpsert(batch));
      }
      restored.forEach((chapter) => {
        chapterCacheRef.current.set(chapter.id, chapter);
        lastSavedRef.current.set(chapter.id, snapshotOf(chapter));
      });
      capCache(chapterCacheRef.current);
      const active = restored.find((chapter) => chapter.id === currentChapter?.id);
      if (active) setCurrentChapter(active);
      const count = restored.length;
      setColumnMoveUndo(null);
      toast({ title: `Đã hoàn tác chuyển cột cho ${count} chương` });
    } catch (error) {
      toast({ title: "Không thể hoàn tác chuyển cột", description: error.message, variant: "destructive" });
    } finally {
      setMovingColumns(false);
    }
  };

  // Full-content export of every chapter in the project (Chương/Title/Nội
  // dung columns — round-trips with the "Tải file có cột" import mode).
  // This is the one place worth paying full-content egress for: the user
  // explicitly asked for a bulk export, so there's no way around reading
  // every chapter body at least once.
  // Shared by all 3 export scopes below — dispatches to the right
  // exportUtils serializer for the format the user picked from each export
  // button's dropdown menu.
  const runChaptersExport = async (format, chapters, filename) => {
    if (format === "txt") return exportChaptersTxt(chapters, filename);
    if (format === "docx") return exportChaptersDocx(chapters, filename);
    if (format === "pdf") return exportChaptersPdf(chapters, filename);
    return exportChaptersCsv(chapters, filename);
  };

  // chapterBody() (exportUtils.js) picks edited || qt_raw || raw_original per
  // chapter, so this can't just select `edited` — some chapters may not have
  // it yet. But most active projects DO have `edited` filled for most
  // chapters, so a lite first pass (title/chapter_order/edited only) plus a
  // second, full-column pass restricted to just the chapters actually
  // missing `edited` avoids downloading raw_original+qt_raw for chapters
  // that will never use them.
  const handleExportAllChapters = async (format = "csv") => {
    if (chapterList.length === 0) return;
    setExportingChapters(true);
    try {
      const lite = await fetchAllPages(
        (limit, skip) => Chapter.filter({ project_id: projectId }, "chapter_order", limit, skip, ["title", "chapter_order", "edited"]),
        { pageSize: 500, maxItems: CHAPTER_FETCH_CAP }
      );
      const missingEditedIds = lite.filter((c) => !String(c.edited || "").trim()).map((c) => c.id);
      const fallbackChapters = missingEditedIds.length ? await Chapter.getMany(missingEditedIds) : [];
      const fallbackById = new Map(fallbackChapters.map((c) => [c.id, c]));
      const full = lite.map((c) => fallbackById.get(c.id) || c);
      await runChaptersExport(format, full, project?.title || "Chuong");
      toast({ title: `Đã xuất ${full.length} chương! 📤` });
    } catch (e) {
      toast({ title: "Lỗi xuất file", description: e.message, variant: "destructive" });
    }
    setExportingChapters(false);
  };

  // Filtered down to only chapters that actually have Bản Edit content — for
  // when the user has only finished editing a handful of chapters out of a
  // much bigger import and wants just those, not the whole (mostly still
  // QT-thô) project. The server-side filter already guarantees every
  // returned row has non-empty `edited`, so unlike "Xuất tất cả" this never
  // needs the raw_original/qt_raw fallback — safe to select only `edited`.
  const handleExportEditedChapters = async (format = "csv") => {
    if (chapterList.length === 0) return;
    setExportingEdited(true);
    try {
      const full = await fetchAllPages(
        (limit, skip) => Chapter.filterNonEmpty(
          { project_id: projectId },
          "edited",
          "chapter_order",
          limit,
          skip,
          ["title", "chapter_order", "edited"]
        ),
        { pageSize: 500, maxItems: CHAPTER_FETCH_CAP }
      );
      const editedOnly = full.filter((c) => c.edited?.trim());
      if (editedOnly.length === 0) {
        toast({
          title: "Chưa có chương nào có Bản Edit",
          description: "Edit ít nhất 1 chương rồi thử lại.",
          variant: "destructive",
        });
        return;
      }
      await runChaptersExport(format, editedOnly, `${project?.title || "Chuong"}_DaEdit`);
      toast({ title: `Đã xuất ${editedOnly.length} chương đã Edit! 📤` });
    } catch (e) {
      toast({ title: "Lỗi xuất file", description: e.message, variant: "destructive" });
    }
    setExportingEdited(false);
  };

  // Export a hand-picked set of chapters only — unlike "Xuất tất cả"/"Xuất
  // chương đã Edit" (which both read every chapter's full content just to
  // filter it down), this fetches ONLY the chosen chapter ids, reusing the
  // in-memory cache for any already opened this session. Exists specifically
  // so re-exporting after editing a few more chapters doesn't re-download
  // the whole novel's content every time — the user reported that repeatedly
  // exporting "all edited" got heavy as more chapters piled up.
  const handleExportSelectedChapters = async (chapterIds, format = "csv") => {
    if (!chapterIds || chapterIds.length === 0) return;
    setExportingSelected(true);
    try {
      const picked = [];
      for (let i = 0; i < chapterIds.length; i++) {
        const id = chapterIds[i];
        let chapter = chapterCacheRef.current.get(id);
        if (!chapter) {
          // eslint-disable-next-line no-await-in-loop
          chapter = await Chapter.get(id);
          chapterCacheRef.current.set(id, chapter);
          capCache(chapterCacheRef.current);
        }
        picked.push(chapter);
      }
      picked.sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0));
      await runChaptersExport(format, picked, `${project?.title || "Chuong"}_ChonLoc`);
      toast({ title: `Đã xuất ${picked.length} chương đã chọn! 📤` });
    } catch (e) {
      toast({ title: "Lỗi xuất file", description: e.message, variant: "destructive" });
    }
    setExportingSelected(false);
  };

  const handleAnalyzeTranslationWorkflow = async (sampleSizeOrRange = 5) => {
    if (!hasCustomAI()) {
      toast({ title: "Cần cấu hình AI trước", description: "Bấm nút AI trên thanh công cụ để nhập API key.", variant: "destructive" });
      return;
    }
    if (!supportsSelfTranslate(project?.source_language)) {
      toast({ title: "Quy trình này hiện dành cho truyện nguồn tiếng Trung", variant: "destructive" });
      return;
    }
    const ordered = [...chapterList].sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0));
    if (!ordered.length) return;
    setTranslationBootstrapRunning(true);
    setTranslationBootstrapResult(null);
    try {
      // Either a contiguous chapter range (user-picked "từ chương X đến chương Y")
      // or samples spread evenly across the whole book — spreading catches later
      // cast/identity changes while keeping one reviewable AI call.
      const isRange = sampleSizeOrRange && typeof sampleSizeOrRange === "object";
      let sampleMeta;
      if (isRange) {
        const from = Math.max(1, Number(sampleSizeOrRange.from) || 1);
        const to = Math.min(ordered.length, Number(sampleSizeOrRange.to) || ordered.length);
        sampleMeta = ordered.slice(from - 1, to);
      } else {
        const count = Math.max(1, Math.min(Number(sampleSizeOrRange) || 5, ordered.length));
        const indices = count === 1
          ? [0]
          : Array.from({ length: count }, (_, index) => Math.round(index * (ordered.length - 1) / (count - 1)));
        sampleMeta = [...new Set(indices)].map((index) => ordered[index]);
      }
      const samples = await Promise.all(sampleMeta.map(async (meta) => {
        const cached = chapterCacheRef.current.get(meta.id);
        const chapter = cached || await Chapter.get(meta.id);
        if (!cached) {
          chapterCacheRef.current.set(meta.id, chapter);
          capCache(chapterCacheRef.current);
        }
        return chapter;
      }));
      const withSource = samples.filter((chapter) => chapter.raw_original?.trim());
      if (!withSource.length) throw new Error("Các chương mẫu chưa có Văn bản gốc tiếng Trung.");
      const raw = await callLLM(buildTranslationBootstrapPrompt(
        withSource,
        glossaryTerms,
        project?.contextual_pronoun_rules || []
      ));
      const parsed = parseTranslationBootstrapResult(raw);
      const result = dedupeTranslationBootstrap(parsed, glossaryTerms, project?.contextual_pronoun_rules || []);
      setTranslationBootstrapResult(result);
      toast({
        title: "AI đã lập bộ quy ước",
        description: `Tìm thấy ${result.glossaryTerms.length} mục Glossary, ${result.characters.length} nhân vật và ${result.pronounRules.length} quy tắc. Hãy duyệt trước khi lưu.`,
      });
    } catch (error) {
      toast({ title: "Không thể lập bộ quy ước", description: error.message, variant: "destructive" });
    } finally {
      setTranslationBootstrapRunning(false);
    }
  };

  const handleSaveTranslationBootstrap = async (approved) => {
    if (!approved) return;
    setTranslationBootstrapSaving(true);
    try {
      const existingTermsToUpdate = approved.glossaryTerms.filter((term) => term.existing_id);
      const newTerms = approved.glossaryTerms.filter((term) => !term.existing_id);
      const updatedTerms = await Promise.all(existingTermsToUpdate.map(async (term) => {
        const current = glossaryTerms.find((item) => item.id === term.existing_id);
        return await GlossaryTerm.update(term.existing_id, {
          source_term: term.source_term,
          translation: term.translation,
          category: term.category || current?.category || "Xưng hô",
          notes: current?.notes || "",
          custom_fields: { ...(current?.custom_fields || {}), source: "ai_translation_bootstrap", confidence: term.confidence, evidence: term.evidence, approved: true },
        });
      }));
      let createdTerms = [];
      if (newTerms.length) {
        createdTerms = await GlossaryTerm.bulkCreate(newTerms.map((term) => ({
          project_id: projectId,
          source_term: term.source_term,
          translation: term.translation,
          category: term.category,
          notes: `AI lập bộ dịch · độ tin cậy ${Math.round(term.confidence * 100)}%${term.evidence ? ` · ${term.evidence}` : ""}`,
          custom_fields: { source: "ai_translation_bootstrap", confidence: term.confidence, evidence: term.evidence, approved: true },
        })));
      }
      setGlossaryTerms((current) => {
        const updatedById = new Map(updatedTerms.map((term) => [term.id, term]));
        return [...createdTerms, ...current.map((term) => updatedById.get(term.id) || term)];
      });

      const existingRules = project?.contextual_pronoun_rules || [];
      const approvedRules = approved.pronounRules.map((rule) => ({
        speaker: rule.speaker, listener: rule.listener || "*", self_word: rule.self_word,
        target_word: rule.target_word, note: rule.note, source: "ai_translation_bootstrap",
        confidence: rule.confidence, evidence: rule.evidence, approved: true,
      }));
      const memory = { candidates: [], summaries: [], narrativeRules: [], ...(project?.style_toggles?.story_memory || {}) };
      const narrativeByName = new Map((memory.narrativeRules || []).map((rule) => [String(rule.character || "").toLocaleLowerCase("vi"), rule]));
      approved.characters.forEach((character) => {
        if (!character.narrative_pronoun || character.narrative_pronoun === "không rõ") return;
        narrativeByName.set(character.name.toLocaleLowerCase("vi"), {
          character: character.name,
          pronoun: character.narrative_pronoun,
          note: [character.gender !== "không rõ" ? `Giới tính: ${character.gender}` : "", character.identity].filter(Boolean).join("; "),
          evidence: character.evidence,
          confidence: character.confidence,
          source: "ai_translation_bootstrap",
          status: "confirmed",
        });
      });
      const profileByName = new Map((memory.characterProfiles || []).map((character) => [String(character.name || "").toLocaleLowerCase("vi"), character]));
      approved.characters.forEach((character) => profileByName.set(character.name.toLocaleLowerCase("vi"), { ...character, source: "ai_translation_bootstrap", approved: true }));
      const nextMemory = {
        ...memory,
        narrativeRules: [...narrativeByName.values()],
        characterProfiles: [...profileByName.values()],
        bootstrapCreatedAt: new Date().toISOString(),
      };
      const updatedProject = await Project.update(projectId, {
        contextual_pronoun_rules: [...existingRules, ...approvedRules],
        style_toggles: { ...(project?.style_toggles || {}), story_memory: nextMemory },
      });
      setProject(updatedProject);
      setTranslationBootstrapResult(null);
      toast({ title: "Đã lưu bộ quy ước", description: `${createdTerms.length} mục Glossary mới, cập nhật ${updatedTerms.length} mục có sẵn, thêm ${approvedRules.length} quy tắc và ${approved.characters.length} hồ sơ nhân vật.` });
    } catch (error) {
      toast({ title: "Lỗi lưu bộ quy ước", description: error.message, variant: "destructive" });
    } finally {
      setTranslationBootstrapSaving(false);
    }
  };

  const handleStartBatchQt = async ({ overwriteExisting = false, from, to } = {}) => {
    if (!supportsSelfTranslate(project?.source_language)) {
      toast({ title: "Tự dịch QT hàng loạt hiện chỉ hỗ trợ nguồn tiếng Trung", variant: "destructive" });
      return;
    }
    const fullOrder = [...chapterList].sort((a, b) => (a.chapter_order ?? 0) - (b.chapter_order ?? 0));
    const startIndex = from ? Math.max(0, from - 1) : 0;
    const endIndex = to ? Math.min(fullOrder.length, to) : fullOrder.length;
    const ordered = fullOrder.slice(startIndex, endIndex);
    batchQtStopRef.current = false;
    setBatchQtErrors([]);
    setBatchQtFinished(false);
    setBatchQtProgress({ done: 0, total: ordered.length, translated: 0, skipped: 0, failed: 0, currentTitle: "" });
    setBatchQtRunning(true);
    for (const meta of ordered) {
      if (batchQtStopRef.current) break;
      setBatchQtProgress((current) => ({ ...current, currentTitle: meta.title }));
      try {
        let chapter = chapterCacheRef.current.get(meta.id);
        if (!chapter) chapter = await Chapter.get(meta.id);
        if (!chapter.raw_original?.trim() || (!overwriteExisting && chapter.qt_raw?.trim())) {
          setBatchQtProgress((current) => ({ ...current, done: current.done + 1, skipped: current.skipped + 1 }));
          continue;
        }
        const translationTerms = mergeHanVietVocabulary(glossaryTerms, hanVietVocabulary);
        const result = await translateHanViet(chapter.raw_original, translationTerms);
        await Chapter.update(meta.id, { qt_raw: result.text }, { returning: false });
        const updated = { ...chapter, qt_raw: result.text };
        chapterCacheRef.current.set(meta.id, updated);
        capCache(chapterCacheRef.current);
        lastSavedRef.current.set(meta.id, snapshotOf(updated));
        if (currentChapter?.id === meta.id) setCurrentChapter(updated);
        setBatchQtProgress((current) => ({ ...current, done: current.done + 1, translated: current.translated + 1 }));
      } catch (error) {
        setBatchQtErrors((current) => [...current, { id: meta.id, title: meta.title, message: error.message }]);
        setBatchQtProgress((current) => ({ ...current, done: current.done + 1, failed: current.failed + 1 }));
      }
    }
    setBatchQtRunning(false);
    setBatchQtFinished(true);
    setBatchQtProgress((current) => ({ ...current, currentTitle: "" }));
    toast({ title: batchQtStopRef.current ? "Đã dừng tạo QT hàng loạt" : "Hoàn tất tạo QT hàng loạt" });
  };

  const handleStopBatchQt = () => {
    batchQtStopRef.current = true;
  };

  // Batch AI edit across every chapter in the project. Deliberately reuses
  // buildEditPrompt/applyRuleEdit/applyHardRules/runChunkedEdit verbatim (the
  // same functions the single-chapter "Edit AI" button calls) so glossary,
  // batch replace rules, contextual pronoun matrix and the active preset's
  // văn phong all apply identically here — no separate/simplified prompt.
  // Persists each chapter to the DB as soon as it's done (not batched at the
  // end) so a stopped/interrupted run never loses already-finished work, and
  // a chapter with existing Bản Edit content is skipped so re-running after
  // a stop or a rate-limit error only processes what's left.
  const handleStartBatchEdit = async (
    selectedIds = [],
    { overwriteExisting = false } = {}
  ) => {
    if (!hasCustomAI()) {
      toast({
        title: "Cần cấu hình AI trước",
        description: "Bấm nút AI trên thanh công cụ để nhập API key.",
        variant: "destructive",
      });
      return;
    }
    if (chapterList.length === 0 || selectedIds.length === 0) return;

    const learningEnabled = isChapterLearningEnabled(project?.style_toggles);

    batchStopRef.current = false;
    setBatchErrors([]);
    setBatchFinished(false);
    const selected = new Set(selectedIds);
    const ordered = [...chapterList]
      .filter((chapter) => selected.has(chapter.id))
      .sort((a, b) => a.chapter_order - b.chapter_order);
    setBatchProgress({
      done: 0,
      total: ordered.length,
      edited: 0,
      skipped: 0,
      failed: 0,
      currentChapterId: null,
      currentTitle: "",
    });
    setBatchRunning(true);
    let batchGlossaryTerms = [...glossaryTerms];
    let batchPronounRules = [...(project?.contextual_pronoun_rules || [])];
    let storyMemory = {
      candidates: [],
      summaries: [],
      narrativeRules: [],
      learnedRuleCount: 0,
      learnedTermCount: 0,
      learnedNarrativeCount: 0,
      ...(project?.style_toggles?.story_memory || {}),
    };
    let previousSummary = storyMemory.summaries?.at(-1)?.summary || "";

    const learnFromChapter = async (chapter, meta, editedText) => {
      setBatchProgress((p) => ({ ...p, currentTitle: `${meta.title} · đang học xưng hô` }));
      const learningRaw = await callLLM(buildStoryLearningPrompt({
        title: meta.title,
        sourceText: chapter.raw_original || chapter.qt_raw || "",
        editedText,
        existingRules: batchPronounRules,
        existingTerms: batchGlossaryTerms,
      }));
      const learned = parseStoryLearningResult(learningRaw);
      const merged = mergeStoryLearning({
        existingRules: batchPronounRules,
        existingTerms: batchGlossaryTerms,
        existingNarrativeRules: storyMemory.narrativeRules || [],
        learned,
        chapter: meta,
      });

      if (merged.acceptedTerms.length) {
        const createdTerms = await GlossaryTerm.bulkCreate(
          merged.acceptedTerms.map((term) => ({
            project_id: projectId,
            source_term: term.source_term,
            translation: term.translation,
            category: term.category,
            notes: `AI tự học từ ${meta.title} · độ tin cậy ${Math.round(term.confidence * 100)}% · ${term.evidence}`,
            custom_fields: {
              source: term.source,
              confidence: term.confidence,
              learned_from_chapter_id: meta.id,
            },
          }))
        );
        batchGlossaryTerms = [...batchGlossaryTerms, ...createdTerms];
        setGlossaryTerms(batchGlossaryTerms);
      }

      batchPronounRules = merged.rules;
      previousSummary = learned.summary || previousSummary;
      storyMemory = {
        ...storyMemory,
        candidates: [...(storyMemory.candidates || []), ...merged.candidates].slice(-300),
        summaries: learned.summary
          ? [...(storyMemory.summaries || []), {
              chapter_id: meta.id,
              chapter_title: meta.title,
              summary: learned.summary,
              learned_at: new Date().toISOString(),
            }].slice(-30)
          : storyMemory.summaries || [],
        learnedRuleCount: (storyMemory.learnedRuleCount || 0) + merged.acceptedRules.length,
        learnedTermCount: (storyMemory.learnedTermCount || 0) + merged.acceptedTerms.length,
        learnedNarrativeCount: (storyMemory.learnedNarrativeCount || 0) + merged.acceptedNarrativeRules.length,
        narrativeRules: merged.narrativeRules,
        lastLearnedAt: new Date().toISOString(),
      };

      const updatedProject = await Project.update(projectId, {
        contextual_pronoun_rules: batchPronounRules,
        style_toggles: {
          ...(project?.style_toggles || {}),
          story_memory: storyMemory,
        },
      });
      setProject(updatedProject);
    };

    for (let i = 0; i < ordered.length; i++) {
      if (batchStopRef.current) break;
      const meta = ordered[i];
      setBatchProgress((p) => ({ ...p, currentChapterId: meta.id, currentTitle: meta.title }));
      try {
        let chapter = chapterCacheRef.current.get(meta.id);
        if (!chapter) {
          chapter = await Chapter.get(meta.id);
          chapterCacheRef.current.set(meta.id, chapter);
          capCache(chapterCacheRef.current);
        }

        if (!overwriteExisting && chapter.edited?.trim()) {
          if (learningEnabled) {
            try {
              await learnFromChapter(chapter, meta, chapter.edited);
            } catch (learningError) {
              setBatchErrors((prev) => [...prev, {
                id: meta.id,
                title: `${meta.title} (tự học)`,
                message: learningError.message,
                kind: "learning",
              }]);
            }
          }
          setBatchProgress((p) => ({ ...p, done: p.done + 1, skipped: p.skipped + 1 }));
          continue;
        }
        const sourceText = applyRuleEdit(chapter.qt_raw || chapter.raw_original || "");
        if (!sourceText.trim()) {
          setBatchProgress((p) => ({ ...p, done: p.done + 1, skipped: p.skipped + 1 }));
          continue;
        }

        const editedText = await runChunkedEdit(
          sourceText,
          (prompt) => callLLM(prompt),
          (chunkI, chunkTotal) =>
            chunkTotal > 1 &&
            setBatchProgress((p) => ({
              ...p,
              currentTitle: `${meta.title} (đoạn ${chunkI}/${chunkTotal})`,
            })),
          {
            glossaryTerms: batchGlossaryTerms,
            pronounRules: batchPronounRules,
            narrativeRules: storyMemory.narrativeRules || [],
            previousSummary,
          }
        );
        const finalText = applyHardRules(editedText);

        await Chapter.update(meta.id, { edited: finalText }, { returning: false });
        setEditedChapterIds((current) => new Set(current).add(meta.id));
        setEditedWordCounts((current) => ({ ...current, [meta.id]: countVietnameseWords(finalText) }));
        const updatedChapter = { ...chapter, edited: finalText };
        chapterCacheRef.current.set(meta.id, updatedChapter);
        lastSavedRef.current.set(meta.id, snapshotOf(updatedChapter));
        if (currentChapter?.id === meta.id) {
          setCurrentChapter(updatedChapter);
        }

        if (learningEnabled) {
          try {
            await learnFromChapter(chapter, meta, finalText);
          } catch (learningError) {
            setBatchErrors((prev) => [...prev, {
              id: meta.id,
              title: `${meta.title} (tự học)`,
              message: learningError.message,
              kind: "learning",
            }]);
          }
        }
        setBatchProgress((p) => ({ ...p, done: p.done + 1, edited: p.edited + 1 }));
      } catch (e) {
        setBatchErrors((prev) => [...prev, { id: meta.id, title: meta.title, message: e.message }]);
        setBatchProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
      }
      // Small gap between chapters — 190 back-to-back calls can trip a
      // provider's per-minute rate limit even when each call individually
      // succeeds.
      if (!batchStopRef.current && i < ordered.length - 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }

    setBatchRunning(false);
    setBatchFinished(true);
    setBatchProgress((p) => ({ ...p, currentChapterId: null, currentTitle: "" }));
    toast({
      title: batchStopRef.current
        ? "Đã dừng edit hàng loạt ⏸️"
        : "Hoàn tất edit AI hàng loạt! ✨",
    });
  };

  const handleStopBatchEdit = () => {
    batchStopRef.current = true;
  };

  // Chapter TITLES are a single flat field (unlike raw/qt/edited content) —
  // they come straight from whatever heading the import auto-split matched,
  // so they're never translated/cleaned unless the user retypes them by
  // hand. This dials in AI translation for just the title text, scoped to
  // whichever chapters the user picked in BatchTitleEditDialog (not "all"
  // unconditionally — not every run should touch every chapter).
  //
  // Titles are short, so 1 AI request per chapter (the old behavior) wastes
  // almost the entire request on fixed overhead — most AI providers bill
  // per-request as well as per-token. Batching many titles into a single
  // prompt cuts the request count by ~TITLE_BATCH_SIZE× for the same work.
  //
  // Each line is tagged with its position in the chunk (a short integer)
  // rather than the full chapter uuid — a uuid is ~36 chars of pure
  // overhead the AI has to echo back on every single output line for
  // no benefit here, since the mapping only needs to survive one prompt/
  // response round-trip. This roughly halves the output tokens per line,
  // which is what actually caps how big TITLE_BATCH_SIZE can safely be —
  // callLLM's default response limit is 8192 tokens (see roleplay/
  // generator.js's comment on why it had to split scene-writer calls for
  // the exact same reason: a response that runs past that cap comes back
  // truncated mid-JSON). 80 lines stays comfortably inside that budget with
  // real margin for model verbosity; "gộp hết 1 lần" for a 300+ chapter
  // novel would not — regardless of tagging scheme, that many lines is more
  // JSON than fits in one response.
  const TITLE_BATCH_SIZE = 80;
  const buildBatchTitleEditPrompt = (titles) => {
    const glossaryText = glossaryTerms
      .map((t) => `- "${t.source_term}" → "${t.translation}"`)
      .join("\n");
    const compact = titles.map((title, index) => `${index}|${title}`).join("\n");
    return `Bạn là biên tập viên truyện dịch. Hãy dịch/làm sạch TÊN CHƯƠNG sang tiếng Việt tự nhiên, mượt mà cho TẤT CẢ các dòng dưới đây (mỗi dòng là 1 chương, định dạng "số thứ tự|tên gốc").

QUY TẮC:
1. Nếu tên chương có số thứ tự ở đầu (ví dụ "Chương 12", "Chapter 12", "第12章"), giữ nguyên định dạng "Chương <số>" ở đầu, chỉ dịch phần tiêu đề phía sau.
2. PHẢI tuân thủ Glossary nếu tên chương chứa tên riêng có trong đó.
3. Dịch ĐỦ tất cả các dòng, không bỏ sót dòng nào, không gộp nhiều dòng lại làm một.
4. Trả về DUY NHẤT JSON array, mỗi phần tử: {"i":<giữ nguyên số thứ tự ở đầu vào>,"title":"<tên chương đã dịch, không kèm giải thích hay ngoặc kép thừa>"}. Không markdown, không giải thích thêm.

GLOSSARY:
${glossaryText || "(trống)"}

DANH SÁCH (số thứ tự|tên gốc):
${compact}`;
  };

  const handleStartBatchTitleEdit = async (selectedIds) => {
    if (!hasCustomAI()) {
      toast({
        title: "Cần cấu hình AI trước",
        description: "Bấm nút AI trên thanh công cụ để nhập API key.",
        variant: "destructive",
      });
      return;
    }
    if (selectedIds.length === 0) return;

    batchTitleStopRef.current = false;
    setBatchTitleErrors([]);
    setBatchTitleFinished(false);
    const targets = chapterList
      .filter((c) => selectedIds.includes(c.id))
      .sort((a, b) => a.chapter_order - b.chapter_order);
    setBatchTitleProgress({ done: 0, total: targets.length, edited: 0, failed: 0, currentTitle: "" });
    setBatchTitleRunning(true);

    for (let start = 0; start < targets.length; start += TITLE_BATCH_SIZE) {
      if (batchTitleStopRef.current) break;
      const chunk = targets.slice(start, start + TITLE_BATCH_SIZE);
      setBatchTitleProgress((p) => ({
        ...p,
        currentTitle: chunk.length > 1 ? `${chunk[0].title} (+${chunk.length - 1} chương khác)` : chunk[0].title,
      }));
      let resultByIndex = new Map();
      let chunkErrorMessage = null;
      try {
        const raw = await callLLM(buildBatchTitleEditPrompt(chunk.map((c) => c.title || "")));
        const parsed = JSON.parse(String(raw).replace(/^```(?:json)?\s*|\s*```$/g, ""));
        resultByIndex = new Map(
          (Array.isArray(parsed) ? parsed : [])
            .map((item) => [Number(item.i), String(item.title || "").trim()])
            .filter(([index, title]) => Number.isInteger(index) && title)
        );
      } catch (e) {
        chunkErrorMessage = e.message;
      }

      // Every chapter in the chunk gets resolved here — whether the whole
      // request failed (chunkErrorMessage set, resultByIndex empty), a
      // particular index was missing from an otherwise-successful response,
      // or it translated fine — so `done` always advances exactly once per
      // chapter and `failed`/`edited` always sum back up to it.
      for (let i = 0; i < chunk.length; i++) {
        const meta = chunk[i];
        const newTitle = resultByIndex.get(i);
        if (!newTitle) {
          setBatchTitleErrors((prev) => [...prev, { title: meta.title, message: chunkErrorMessage || "AI không trả về tên cho chương này." }]);
          setBatchTitleProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          await Chapter.update(meta.id, { title: newTitle }, { returning: false });
          setChapterList((prev) => prev.map((c) => (c.id === meta.id ? { ...c, title: newTitle } : c)));
          const cached = chapterCacheRef.current.get(meta.id);
          if (cached) chapterCacheRef.current.set(meta.id, { ...cached, title: newTitle });
          if (currentChapter?.id === meta.id) {
            setCurrentChapter((prev) => (prev ? { ...prev, title: newTitle } : prev));
          }
          setBatchTitleProgress((p) => ({ ...p, done: p.done + 1, edited: p.edited + 1 }));
        } catch (e) {
          setBatchTitleErrors((prev) => [...prev, { title: meta.title, message: e.message }]);
          setBatchTitleProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
        }
      }

      // Spacing is now per CHUNK instead of per chapter — still stays clear
      // of the provider's per-minute rate limit, but with far fewer waits
      // since each chunk covers up to TITLE_BATCH_SIZE chapters in 1 request.
      if (!batchTitleStopRef.current && start + TITLE_BATCH_SIZE < targets.length) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }

    setBatchTitleRunning(false);
    setBatchTitleFinished(true);
    toast({
      title: batchTitleStopRef.current
        ? "Đã dừng dịch tên hàng loạt ⏸️"
        : "Hoàn tất dịch tên chương! ✨",
    });
  };

  const handleStopBatchTitleEdit = () => {
    batchTitleStopRef.current = true;
  };

  const handleManualSave = async () => {
    if (!currentChapter) return;
    setSaving(true);
    await flushSave(currentChapter, true);
    setSaving(false);
    toast({ title: "Đã lưu chương này ✅" });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // Shared by both the desktop and mobile-menu LilyBetaSync trigger — saves
  // the current chapter's pending edits before a sync run starts.
  const handleBeforeLilyBetaSync = async () => {
    if (!currentChapter?.id) return;
    const changes = changedContentFields(currentChapter, lastSavedRef.current.get(currentChapter.id));
    if (Object.keys(changes).length) {
      await Chapter.update(currentChapter.id, changes, { returning: false });
      lastSavedRef.current.set(currentChapter.id, snapshotOf(currentChapter));
      chapterCacheRef.current.set(currentChapter.id, currentChapter);
    }
  };

  const handleOpenPronoun = () => {
    const panel3 = panelRefs[2].current;
    const textarea = panel3?.getScrollElement();
    if (
      textarea &&
      textarea.selectionStart !== undefined &&
      textarea.selectionStart !== textarea.selectionEnd
    ) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = currentChapter?.edited || "";
      setPronounSelection({
        text: text.substring(start, end),
        start,
        end,
      });
    } else {
      setPronounSelection({ text: "", start: 0, end: 0 });
    }
    setShowPronoun(true);
  };

  const handleExport = (type) => {
    const filename = `${project.title} - ${currentChapter?.title || ""}`;
    if (type === "txt") {
      exportAsTxt(currentChapter?.edited || "", filename);
    } else if (type === "doc") {
      exportAsDoc(currentChapter?.edited || "", filename);
    } else if (type === "json") {
      exportGlossaryJson(glossaryTerms, project, `${project.title} - Glossary`);
    }
    toast({ title: "Đã xuất file! 📄" });
  };

  const activeMobile = visibleColumns.includes(mobileActiveCol)
    ? mobileActiveCol
    : visibleColumns[0] || "edited";

  const qualityRulesHash = useMemo(() => quickHash(stableSerialize({
    glossary: glossaryTerms
      .map((term) => [term.id, term.source_term, term.translation, term.category, term.custom_fields])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    pronouns: project?.contextual_pronoun_rules || [],
    qaSettings: project?.style_toggles?.qa_settings || {},
  })), [glossaryTerms, project?.contextual_pronoun_rules, project?.style_toggles?.qa_settings]);
  const qaRecords = project?.style_toggles?.workflow_progress?.qa || {};
  const betaRulesHash = useMemo(()=>quickHash(stableSerialize(project?.style_toggles?.beta_settings||{})),[project?.style_toggles?.beta_settings]);
  const betaRecords = project?.style_toggles?.workflow_progress?.beta || {};
  const qaStatusOf = (meta) => {
    const record = qaRecords[meta.id];
    if (!record) return "pending";
    // QA progress records that the user has already read/reviewed a chapter.
    // Adding a glossary/pronoun/QA rule must not erase that work or send the
    // "QA tiếp" cursor back to chapter 1. New rules still take effect in the
    // live chapter scanner and Story QA; only an actual content edit makes a
    // reviewed chapter stale and requires confirmation again.
    if (currentChapter?.id === meta.id) {
      return record.contentHash === quickHash(currentChapter.edited || "") ? "done" : "stale";
    }
    const updatedAt = Date.parse(meta.updated_date || 0);
    if (!updatedAt) return "done";
    if (record.chapterUpdatedAt) {
      return updatedAt > Date.parse(record.chapterUpdatedAt) + 1000 ? "stale" : "done";
    }
    // Backward compatibility for records made before the server-version fix:
    // tolerate clock skew between the user's device and Supabase.
    return updatedAt > Date.parse(record.checkedAt || 0) + 5 * 60 * 1000 ? "stale" : "done";
  };
  const betaStatusOf=(meta)=>{const record=betaRecords[meta.id];if(!record)return"pending";if(record.rulesHash!==betaRulesHash)return"stale";if(currentChapter?.id===meta.id)return record.contentHash===quickHash(currentChapter.edited||"")?"done":"stale";const updated=Date.parse(meta.updated_date||0);return updated&&record.chapterUpdatedAt&&updated>Date.parse(record.chapterUpdatedAt)+1000?"stale":"done";};
  const qaCount = chapterList.filter((chapter) => qaStatusOf(chapter) === "done").length;
  const editedCount = chapterList.filter((chapter) => editedChapterIds.has(chapter.id)).length;
  const editedWordSummary = useMemo(() => summarizeChapterWordCounts(editedWordCounts), [editedWordCounts]);
  const qaIssueIds = useMemo(() => new Set((storyQaReport?.chapters || []).map(item => item.id)), [storyQaReport]);
  const betaIssueIds = useMemo(() => new Set((storyBetaReport?.chapters || []).map(item => item.id)), [storyBetaReport]);
  const qaNeedsRecheck = chapterList.filter((chapter) => qaRecords[chapter.id] && qaStatusOf(chapter) === "stale").length;
  const betaCount=chapterList.filter(ch=>betaStatusOf(ch)==="done").length;
  const betaNeedsRecheck=chapterList.filter(ch=>betaRecords[ch.id]&&betaStatusOf(ch)==="stale").length;
  // Optimistic count — a chapter's stored AI Beta suggestions are re-verified
  // against its live text (position match) only once that chapter is
  // actually opened; this badge just reflects what the last batch run found.
  const aiBetaPendingCount = Object.values(aiBetaFindings).filter((record) => record?.suggestions?.length).length;
  const contiguousThrough = (predicate) => {
    let last = null;
    for (const chapter of chapterList) {
      if (!predicate(chapter)) break;
      last = chapter;
    }
    return last?.title || "";
  };
  const editedThrough = contiguousThrough((chapter) => editedChapterIds.has(chapter.id));
  const qaThrough = contiguousThrough((chapter) => qaStatusOf(chapter) === "done");
  const betaThrough=contiguousThrough(ch=>betaStatusOf(ch)==="done");
  const currentMeta = chapterList.find((chapter) => chapter.id === currentChapter?.id);
  const currentQaStatus = currentMeta ? qaStatusOf(currentMeta) : "pending";
  const currentBetaStatus=currentMeta?betaStatusOf(currentMeta):"pending";

  const handleMarkQaDone = async () => {
    if (!currentChapter?.id || !currentChapter.edited?.trim()) {
      toast({ title: "Bản Edit đang trống", description: "Chỉ có thể đánh dấu QA sau khi chương đã có Bản Edit.", variant: "destructive" });
      return;
    }
    const chapterAtClick = { ...currentChapter };
    setMarkingQa(true);
    try {
      await flushSave(chapterAtClick, true);
      const savedChapter = await Chapter.get(chapterAtClick.id);
      if ((savedChapter.edited || "") !== (chapterAtClick.edited || "")) {
        throw new Error("Bản Edit chưa lưu xong. Hãy đợi trạng thái Đã lưu rồi thử lại.");
      }
      const nextQa = {
        ...qaRecords,
        [chapterAtClick.id]: {
          checkedAt: new Date().toISOString(),
          chapterUpdatedAt: savedChapter.updated_date,
          contentHash: quickHash(savedChapter.edited),
          rulesHash: qualityRulesHash,
          issueCount: qualityGroupCount,
        },
      };
      await handleUpdateProject({
        style_toggles: {
          ...(project?.style_toggles || {}),
          workflow_progress: {
            ...(project?.style_toggles?.workflow_progress || {}),
            qa: nextQa,
          },
        },
      });
      setChapterList((list) => list.map((meta) =>
        meta.id === savedChapter.id ? { ...meta, updated_date: savedChapter.updated_date } : meta
      ));
      toast({
        title: "Đã lưu tiến độ QA",
        description: qualityGroupCount ? `Chương còn ${qualityGroupCount} nhóm nghi vấn bạn đã xem và chấp nhận.` : "Chương không còn lỗi QA nghi vấn.",
      });
    } catch (error) {
      toast({ title: "Chưa lưu được tiến độ QA", description: error.message, variant: "destructive" });
    } finally {
      setMarkingQa(false);
    }
  };
  const handleMarkBetaDone=async()=>{if(!currentChapter?.id||!currentChapter.edited?.trim()){toast({title:"Bản Edit đang trống",variant:"destructive"});return;}const chapter={...currentChapter};setMarkingBeta(true);try{await flushSave(chapter,true);const saved=await Chapter.get(chapter.id);if((saved.edited||"")!==(chapter.edited||""))throw new Error("Bản Edit chưa lưu xong.");const next={...betaRecords,[saved.id]:{checkedAt:new Date().toISOString(),chapterUpdatedAt:saved.updated_date,contentHash:quickHash(saved.edited),rulesHash:betaRulesHash,issueCount:betaIssues.length}};await handleUpdateProject({style_toggles:{...(project?.style_toggles||{}),workflow_progress:{...(project?.style_toggles?.workflow_progress||{}),beta:next}}});setChapterList(list=>list.map(meta=>meta.id===saved.id?{...meta,updated_date:saved.updated_date}:meta));toast({title:"Đã lưu tiến độ Beta",description:betaIssues.length?`Bạn đã xem và chấp nhận ${betaIssues.length} nghi vấn còn lại.`:"Chương đã sạch theo bộ Beta."});}catch(error){toast({title:"Chưa lưu được tiến độ Beta",description:error.message,variant:"destructive"});}finally{setMarkingBeta(false);}};

  const goToNextEdit = () => {
    const target = chapterList.find((chapter) => !editedChapterIds.has(chapter.id));
    if (target) switchChapter(target.id);
    else toast({ title: "Đã Edit đủ tất cả chương 🎉" });
  };

  const goToNextQa = () => {
    const target = chapterList.find((chapter) => editedChapterIds.has(chapter.id) && qaStatusOf(chapter) !== "done");
    if (target) switchChapter(target.id);
    else toast({ title: "Không còn chương đã Edit nào cần QA 🎉" });
  };
  const goToNextBeta=()=>{const target=chapterList.find(ch=>editedChapterIds.has(ch.id)&&betaStatusOf(ch)!=="done");if(target)switchChapter(target.id);else toast({title:"Không còn chương cần Beta 🎉"});};

  const foreignCharCount = countForeignChars(currentChapter?.edited);
  const qualityGroupCount = new Set(
    qualityIssues.map((issue) => `${issue.type}:${issue.value.toLocaleLowerCase("vi")}`)
  ).size;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-50">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-50">
        <div className="text-center">
          <p className="text-slate-500 mb-4">Không tìm thấy dự án</p>
          <Link to="/stories" className="text-violet-600 hover:underline">
            ← Về danh sách truyện
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-100/80 flex flex-col">
      {/* Header + toolbar stay put — the page itself never scrolls (h-screen
          overflow-hidden below), only the columns and sidebar do, each via
          their own internal overflow-y-auto (see EditorPanel/GlossarySidebar).
          Previously this wrapper was min-h-screen, which let the whole
          layout grow taller than the viewport and pushed the scrollbar up
          to the document instead, so both problems showed up together: the
          header/toolbar scrolled out of view, and columns never got tall
          enough to need their own scrollbar. */}
      <header className="shrink-0 z-30 bg-slate-950 text-white border-b border-white/10 shadow-xl">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            to="/stories"
            className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="Về danh sách truyện"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Link
            to="/"
            className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="Về trang chủ"
          >
            <Home className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-violet-300"><BookOpen className="h-4 w-4" /></span>
            <div className="min-w-0">
              {editingTitle ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                    onBlur={handleSaveTitle}
                    className="text-sm font-bold text-slate-800 leading-tight px-1.5 py-0.5 rounded-lg border border-violet-300 bg-white focus:outline-none w-40 sm:w-56"
                  />
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleSaveTitle}
                    className="p-1 rounded-md hover:bg-violet-50 text-violet-600 shrink-0"
                    title="Lưu"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setEditingTitle(false)}
                    className="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 shrink-0"
                    title="Hủy"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <h1
                  onClick={() => {
                    setTitleDraft(project.title || "");
                    setEditingTitle(true);
                  }}
                  className="text-sm font-bold text-white leading-tight cursor-pointer hover:text-violet-300 transition-colors flex items-center gap-1 group"
                  title="Bấm để đổi tên bộ truyện"
                >
                  <span>{project.title}</span>
                  <Pencil className="w-3 h-3 text-slate-300 group-hover:text-violet-400 shrink-0" />
                </h1>
              )}
              <p className="text-xs text-white/40">
                {glossaryTerms.length} thuật ngữ · {chapterList.length} chương
              </p>
            </div>
          </div>

          <div className="flex-1" />

          {/* Chapter selector */}
          <ChapterPicker chapters={chapterList} currentChapterId={currentChapter?.id} onSelect={switchChapter} wordCounts={editedWordCounts} averageWords={editedWordSummary.average} editedSampleSize={editedWordSummary.sampleSize} editedChapterIds={editedChapterIds} qaIssueIds={qaIssueIds} betaIssueIds={betaIssueIds} onOpen={ensureWordCountsLoaded} />

          {/* Mobile-only overflow menu — everything below this doesn't fit a
              375px header row, so on phones it collapses behind one "⋯"
              button instead of overflowing off-screen. Desktop (md+) keeps
              every action visible inline as before. */}
          <div ref={headerMenuRef} className="relative shrink-0 md:hidden">
            <button
              onClick={() => setShowHeaderMenu((v) => !v)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-violet-300 transition-colors"
              title="Thêm thao tác"
              aria-haspopup="menu"
              aria-expanded={showHeaderMenu}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showHeaderMenu && (
              <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-violet-100 bg-white p-1.5 text-slate-700 shadow-2xl">
                <button onClick={() => { setShowStoryQa(true); setShowHeaderMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-600" /> QA toàn truyện{storyQaReport?.chapters.length ? ` · ${storyQaReport.chapters.length}` : ""}
                </button>
                <button onClick={() => { setShowStoryBeta(true); setShowHeaderMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50">
                  <PenTool className="h-3.5 w-3.5 shrink-0 text-fuchsia-600" /> Beta toàn truyện{storyBetaReport?.chapters.length ? ` · ${storyBetaReport.chapters.length}` : ""}
                </button>
                <button onClick={() => { setShowChapterManager(true); setShowHeaderMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50">
                  <ListIcon className="h-3.5 w-3.5 shrink-0 text-violet-600" /> Quản lý chương
                </button>
                <button onClick={() => { setShowBatchEdit(true); setShowHeaderMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-50">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" /> Edit AI hàng loạt
                </button>
                <button onClick={() => { setShowTranslationWorkflow(true); setShowHeaderMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-cyan-700 transition-colors hover:bg-cyan-50">
                  <BookOpen className="h-3.5 w-3.5 shrink-0" /> Chuẩn bị & dịch toàn truyện
                </button>
                <button onClick={() => { handleCreateChapter(); setShowHeaderMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50">
                  <Plus className="h-3.5 w-3.5 shrink-0 text-violet-600" /> Tạo chương mới
                </button>
                {draftMode && (
                  <button onClick={() => { handleManualSave(); setShowHeaderMenu(false); }} disabled={saving} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50">
                    <Check className="h-3.5 w-3.5 shrink-0" /> {saving ? "Đang lưu..." : "Chế độ nháp · Lưu chương này"}
                  </button>
                )}
                <div className="my-1 h-px bg-slate-100" />
                <button onClick={() => { handleExport("txt"); setShowHeaderMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50">Xuất bản Edit — TXT</button>
                <button onClick={() => { handleExport("doc"); setShowHeaderMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50">Xuất bản Edit — DOCX</button>
                <button onClick={() => { handleExport("json"); setShowHeaderMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50">Xuất bản Edit — JSON</button>
                <div className="my-1 h-px bg-slate-100" />
                <LilyBetaSync
                  key={`${projectId}-mobile`}
                  projectId={projectId}
                  currentChapterId={currentChapter?.id}
                  beforeSync={handleBeforeLilyBetaSync}
                  triggerIcon={<Send className="h-3.5 w-3.5 shrink-0 text-violet-600" />}
                  triggerClassName="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-50"
                />
                <div className="my-1 h-px bg-slate-100" />
                <button onClick={() => { setShowHeaderMenu(false); handleLogout(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-red-600 transition-colors hover:bg-red-50">
                  <LogOut className="h-3.5 w-3.5 shrink-0" /> Đăng xuất
                </button>
              </div>
            )}
          </div>

          <button onClick={() => setShowStoryQa(true)} className={`hidden md:flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors ${storyQaReport?.chapters.length ? "bg-amber-100 text-amber-800" : "bg-white/10 text-violet-200 hover:bg-white/15"}`} title="Cấu hình và quét QA toàn truyện">
            <ShieldCheck className="h-4 w-4"/><span className="hidden lg:inline">QA toàn truyện{storyQaReport?.chapters.length ? ` · ${storyQaReport.chapters.length}` : ""}</span>
          </button>
          <button onClick={()=>setShowStoryBeta(true)} className={`hidden md:flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors ${storyBetaReport?.chapters.length?"bg-fuchsia-100 text-fuchsia-800":"bg-white/10 text-fuchsia-200 hover:bg-white/15"}`} title="Quét Beta câu văn toàn truyện"><PenTool className="h-4 w-4"/><span className="hidden lg:inline">Beta toàn truyện{storyBetaReport?.chapters.length?` · ${storyBetaReport.chapters.length}`:""}</span></button>
          <button
            onClick={() => setShowTranslationWorkflow(true)}
            className="hidden md:flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-bold text-white shadow-lg transition-colors hover:bg-cyan-500"
            title="AI lập bộ quy ước → máy tạo QT → AI Edit hàng loạt"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden xl:inline">Dịch toàn truyện</span>
          </button>
          <button
            onClick={() => setShowBatchEdit(true)}
            className="hidden md:flex items-center gap-1.5 rounded-xl bg-violet-500 px-3 py-2 text-xs font-bold text-white shadow-lg transition-colors hover:bg-violet-400"
            title="Mở xưởng Edit AI hàng loạt"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden lg:inline">Edit hàng loạt</span>
          </button>
          <button
            onClick={() => setShowChapterManager(true)}
            className="hidden md:inline-flex p-2 rounded-xl bg-white/10 hover:bg-white/15 text-violet-300 transition-colors"
            title="Quản lý chương"
          >
            <ListIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handleCreateChapter}
            className="hidden md:inline-flex p-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-white transition-colors shadow-lg"
            title="Tạo chương mới"
          >
            <Plus className="w-4 h-4" />
          </button>

          {draftMode ? (
            <button
              onClick={handleManualSave}
              disabled={saving}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 font-medium transition-colors hidden md:flex items-center gap-1"
              title="Chế độ nháp: không tự lưu, bấm để lưu chương này ngay"
            >
              {saving ? "Đang lưu..." : "Chế độ nháp · Lưu"}
            </button>
          ) : (
            <span className="text-xs text-slate-400 hidden md:block">
              {saving ? "Đang lưu..." : "Đã lưu"}
            </span>
          )}

          <div className="flex items-center gap-1 hidden md:flex">
            <button
              onClick={() => handleExport("txt")}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/70 hover:bg-white border border-violet-100 text-slate-600 transition-colors"
            >
              TXT
            </button>
            <button
              onClick={() => handleExport("doc")}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/70 hover:bg-white border border-violet-100 text-slate-600 transition-colors"
            >
              DOCX
            </button>
            <button
              onClick={() => handleExport("json")}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/70 hover:bg-white border border-violet-100 text-slate-600 transition-colors"
            >
              JSON
            </button>
          </div>

          <LilyBetaSync
            key={projectId}
            projectId={projectId}
            currentChapterId={currentChapter?.id}
            beforeSync={handleBeforeLilyBetaSync}
            triggerClassName="hidden md:inline-flex px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold"
          />
          <button
            onClick={handleLogout}
            className="hidden md:inline-flex p-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-600 transition-colors"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <EditorToolbar
        visibleColumns={visibleColumns}
        onToggleColumn={handleToggleColumn}
        onQuickAddGlossary={handleQuickAddGlossary}
        onBatchReplace={() => setShowBatchReplace(true)}
        onPronounSwitcher={handleOpenPronoun}
        onCustomEdit={handleGeminiEdit}
        customAIEditing={geminiEditing}
        hasCustomAI={hasCustomAI()}
        customAIProvider={getProvider()}
        onOpenSettings={() => navigate("/settings")}
        onOpenAISettings={() => setShowAISettings(true)}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
        onSelfTranslate={handleSelfTranslate}
        selfTranslating={selfTranslating}
        selfTranslateSupported={supportsSelfTranslate(project?.source_language)}
        onRuleEdit={handleRuleEdit}
        onOpenTranslationSettings={() => setShowTranslationSettings(true)}
        activePresetName={activePreset?.name}
        onOpenImageTranslate={() => setShowImageTranslate(true)}
        onOpenColumnMove={() => setShowColumnMove(true)}
        onOpenQtCleanup={() => setShowQtCleanup(true)}
      />

      <WorkflowProgress
        total={chapterList.length}
        editedCount={editedCount}
        qaCount={qaCount}
        betaCount={betaCount}
        qaNeedsRecheck={qaNeedsRecheck}
        betaNeedsRecheck={betaNeedsRecheck}
        editedThrough={editedThrough}
        qaThrough={qaThrough}
        betaThrough={betaThrough}
        currentQaStatus={currentQaStatus}
        currentBetaStatus={currentBetaStatus}
        markingQa={markingQa}
        markingBeta={markingBeta}
        onMarkQa={handleMarkQaDone}
        onMarkBeta={handleMarkBetaDone}
        onNextEdit={goToNextEdit}
        onNextQa={goToNextQa}
        onNextBeta={goToNextBeta}
        onRefresh={() => loadEditedProgress(true)}
        refreshing={refreshingProgress}
      />

      {/* Main content */}
      <div className="flex flex-1 min-h-0 relative">
        {showSidebar && (
          <>
            <div
              className="md:hidden fixed inset-0 bg-black/30 z-30"
              onClick={() => setShowSidebar(false)}
            />
            <GlossarySidebar
              terms={glossaryTerms}
              project={project}
              onAddTerm={() => {
                setEditingTerm(null);
                setPrefillTerm("");
                setShowGlossaryForm(true);
              }}
              onEditTerm={(term) => {
                setEditingTerm(term);
                setPrefillTerm("");
                setShowGlossaryForm(true);
              }}
              onDeleteTerm={handleDeleteTerm}
              onBulkDeleteTerms={handleBulkDeleteTerms}
              onImportTerms={handleImportTerms}
              onOpenContextualPronoun={() => setShowContextualPronoun(true)}
              onDetectNames={handleDetectNames}
              onFindTerm={handleFindTerm}
              hanVietVocabulary={hanVietVocabulary}
              onAddToHanVietVocabulary={(selectedTerms) => {
                try {
                  const result = addHanVietVocabulary(hanVietVocabulary, selectedTerms, projectId);
                  const saved = saveHanVietVocabulary(result.terms);
                  setHanVietVocabulary(saved);
                  toast({
                    title: `Đã cập nhật từ vựng Tự dịch: ${result.added} mới${result.updated ? `, ${result.updated} thay đổi` : ""}`,
                    description: result.ignored
                      ? `${result.ignored} mục bị bỏ qua vì từ nguồn không phải chữ Hán thuần.`
                      : "Các cách dịch này sẽ được ưu tiên cho mọi truyện trên trình duyệt này.",
                  });
                } catch (error) {
                  toast({ title: "Không lưu được từ vựng Tự dịch", description: error.message, variant: "destructive" });
                }
              }}
              onRemoveFromHanVietVocabulary={(selectedTerms) => {
                try {
                  const next = removeHanVietVocabulary(hanVietVocabulary, selectedTerms.map((term) => term.source_term));
                  const saved = saveHanVietVocabulary(next);
                  setHanVietVocabulary(saved);
                  toast({ title: `Đã gỡ ${hanVietVocabulary.length - saved.length} từ khỏi Tự dịch` });
                } catch (error) {
                  toast({ title: "Không gỡ được từ vựng Tự dịch", description: error.message, variant: "destructive" });
                }
              }}
            />
          </>
        )}
        <div className="flex-1 flex flex-col gap-3 p-3 min-w-0 min-h-0 md:p-4">
          {currentChapter ? (
            <>
              {visibleColumns.length > 1 && (
                <div className="md:hidden flex gap-1.5 shrink-0">
                  {visibleColumns.map((col) => {
                    const def = COLUMN_DEFS[col];
                    return (
                      <button
                        key={col}
                        onClick={() => setMobileActiveCol(col)}
                        className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                          activeMobile === col
                            ? "bg-violet-600 text-white"
                            : "bg-white/70 text-slate-500 border border-violet-100"
                        }`}
                      >
                        {def.shortLabel}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-1 gap-3 min-h-0 min-w-0">
                {!visibleColumns.includes("raw") && renderRestoreTab("raw", "📖", "Gốc")}
                {visibleColumns.includes("raw") && (
                  <div
                    className={
                      activeMobile === "raw"
                        ? "flex-1 flex flex-col min-w-0"
                        : "hidden md:flex md:flex-1 md:flex-col md:min-w-0"
                    }
                  >
                    <EditorPanel
                      ref={panelRefs[0]}
                      title="Văn bản gốc"
                      emoji="📖"
                      variant="source"
                      value={currentChapter.raw_original}
                      onChange={(v) =>
                        setCurrentChapter({ ...currentChapter, raw_original: v })
                      }
                      mode={panel1Mode}
                      onToggleMode={() =>
                        setPanel1Mode(panel1Mode === "view" ? "edit" : "view")
                      }
                      terms={glossaryTerms}
                      onTermClick={handleTermClick}
                      onScroll={() => handlePanelScroll(0)}
                      placeholder="Dán văn bản gốc (Trung/Anh) vào đây..."
                      extra={renderColumnActions("raw_original", "Văn bản gốc", currentChapter.raw_original)}
                      onHide={() => handleToggleColumn("raw")}
                    />
                  </div>
                )}
                {!visibleColumns.includes("qt") && renderRestoreTab("qt", "✏️", "QT")}
                {visibleColumns.includes("qt") && (
                  <div
                    className={
                      activeMobile === "qt"
                        ? "flex-1 flex flex-col min-w-0"
                        : "hidden md:flex md:flex-1 md:flex-col md:min-w-0"
                    }
                  >
                    <EditorPanel
                      ref={panelRefs[1]}
                      title="QT thô"
                      emoji="✏️"
                      variant="draft"
                      value={currentChapter.qt_raw}
                      onChange={(v) =>
                        setCurrentChapter({ ...currentChapter, qt_raw: v })
                      }
                      mode={panel2Mode}
                      onToggleMode={() =>
                        setPanel2Mode(panel2Mode === "view" ? "edit" : "view")
                      }
                      terms={glossaryTerms}
                      onTermClick={handleTermClick}
                      onScroll={() => handlePanelScroll(1)}
                      placeholder="Dán văn bản QT/Convert thô vào đây, hoặc bấm 'Tự dịch' ở trên..."
                      extra={renderColumnActions("qt_raw", "QT thô", currentChapter.qt_raw)}
                      onHide={() => handleToggleColumn("qt")}
                    />
                  </div>
                )}
                {!visibleColumns.includes("edited") && renderRestoreTab("edited", "✨", "Edit")}
                {visibleColumns.includes("edited") && (
                  <div
                    className={
                      activeMobile === "edited"
                        ? "flex-1 flex flex-col min-w-0"
                        : "hidden md:flex md:flex-1 md:flex-col md:min-w-0"
                    }
                  >
                    <EditorPanel
                      ref={panelRefs[2]}
                      title="Bản Edit"
                      emoji="✨"
                      variant="final"
                      searchable
                      value={currentChapter.edited}
                      onChange={(v) =>
                        setCurrentChapter({ ...currentChapter, edited: v })
                      }
                      mode={panel3Mode}
                      onToggleMode={() =>
                        setPanel3Mode(panel3Mode === "view" ? "edit" : "view")
                      }
                      flagForeignChars
                      qualityIssues={[
                        ...qualityIssues.map((issue) => ({ ...issue, __kind: "quality" })),
                        ...betaIssues.map((issue) => ({ ...issue, __kind: "beta" })),
                      ]}
                      onIssueClick={handleIssueSpanClick}
                      onScroll={() => handlePanelScroll(2)}
                      placeholder="Bản edit hoàn chỉnh sẽ hiện ở đây..."
                      onHide={() => handleToggleColumn("edited")}
                      extra={
                        <>
                          <button
                            onClick={handleOpenQualityCheck}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors border ${qualityGroupCount > 0 ? "bg-red-50 hover:bg-red-100 text-red-700 border-red-200" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-100"}`}
                            title={qualityGroupCount > 0 ? `Phát hiện ${qualityGroupCount} nhóm lỗi nghi vấn — bấm để xem` : "QA đang tự động theo dõi Bản Edit — bấm để quét lại/xem chi tiết"}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {qualityGroupCount > 0 ? `QA · ${qualityGroupCount} nhóm lỗi` : "QA · Không thấy lỗi"}
                          </button>
                          <button onClick={handleOpenBetaCheck} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${betaIssues.length?"border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700":"border-emerald-100 bg-emerald-50 text-emerald-700"}`} title="Beta văn phong, câu và trình bày"><PenTool className="h-3.5 w-3.5"/>{betaIssues.length?`Beta · ${betaIssues.length} nghi vấn`:"Beta · Sạch"}</button>
                          <button
                            onClick={() => setShowBetaReader(true)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${betaReaderChapterId===currentChapter.id&&betaReaderNotes?.length?"border-indigo-200 bg-indigo-50 text-indigo-700":"border-violet-100 bg-violet-50/60 text-violet-600"}`}
                            title="AI đọc toàn chương và góp ý tự do như biên tập viên thật, không chỉ đối chiếu luật"
                          >
                            <MessageSquareText className="h-3.5 w-3.5"/>
                            {betaReaderChapterId===currentChapter.id&&betaReaderNotes?.length?`Beta reader AI · ${betaReaderNotes.length}`:"Beta reader AI"}
                          </button>
                          {foreignCharCount > 0 && (
                            <button
                              onClick={() => setPanel3Mode("view")}
                              className="text-xs px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors border border-red-100"
                              title="Chuyển sang chế độ Xem để thấy vị trí ký tự còn sót"
                            >
                              ⚠️ {foreignCharCount} ký tự Hán sót
                            </button>
                          )}
                          {aiUndo && aiUndo.chapterId === currentChapter.id && (
                            <button
                              onClick={handleUndoAiEdit}
                              className="text-xs px-2 py-1 rounded-lg bg-white/70 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 transition-colors border border-violet-100"
                              title="Hoàn tác bản edit AI vừa chạy (chỉ trong phiên này)"
                            >
                              ↩️ Hoàn tác AI
                            </button>
                          )}
                          {renderColumnActions("edited", "Bản Edit", currentChapter.edited)}
                        </>
                      }
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <button
                onClick={handleCreateChapter}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                ➕ Tạo chương đầu tiên
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <GlossaryTermForm
        open={showGlossaryForm}
        onOpenChange={setShowGlossaryForm}
        project={project}
        onUpdateProject={handleUpdateProject}
        editingTerm={editingTerm}
        prefillTerm={prefillTerm}
        onSave={handleSaveTerm}
      />
      <BatchReplaceDialog
        open={showBatchReplace}
        onOpenChange={setShowBatchReplace}
        project={project}
        onUpdateProject={handleUpdateProject}
        onApply={handleApplyBatchRules}
        onPreview={handlePreviewBatchRules}
        onUndo={handleUndoBatchRules}
        canUndo={Boolean(batchReplaceUndo?.rows?.length)}
        busy={batchReplaceRunning}
      />
      <GlossaryTermFindDialog
        open={Boolean(findTermTarget)}
        onOpenChange={(v) => !v && setFindTermTarget(null)}
        term={findTermTarget}
        loading={findTermLoading}
        results={findTermResults}
        onOpenChapter={handleOpenChapterFromFind}
      />
      <PronounSwitcherDialog
        open={showPronoun}
        onOpenChange={setShowPronoun}
        project={project}
        onUpdateProject={handleUpdateProject}
        onApply={handleApplyPronounRule}
        selectedText={pronounSelection.text}
      />
      <ConfirmDialog
        open={!!clearTarget}
        onOpenChange={(v) => !v && setClearTarget(null)}
        title={`Xóa toàn bộ ${clearTarget?.label || ""}?`}
        description="Toàn bộ nội dung cột này của chương hiện tại sẽ bị xóa sạch. Bạn không thể hoàn tác hành động này."
        confirmLabel="Xóa tất cả"
        onConfirm={handleClearColumn}
      />
      <ContextualPronounDialog
        open={showContextualPronoun}
        onOpenChange={setShowContextualPronoun}
        project={project}
        onUpdateProject={handleUpdateProject}
        onCheckPronouns={handleCheckPronouns}
        checkingPronouns={checkingPronouns}
        pronounCheckDiff={pronounCheckDiff}
        hasPronounCheckPreview={Boolean(pronounCheckPreview)}
        onApplyPronounCheck={handleApplyPronounCheck}
        onDiscardPronounCheck={handleDiscardPronounCheck}
        pronounInventory={pronounInventory}
        scanningPronounInventory={scanningPronounInventory}
        onScanPronounInventory={handleScanPronounInventory}
        onOpenPronounOccurrence={handleOpenPronounOccurrence}
        pronounBootstrap={pronounBootstrap}
        runningPronounBootstrap={runningPronounBootstrap}
        onRunPronounBootstrap={handleRunPronounBootstrap}
        storyPronounAiReport={storyPronounAiReport}
        runningStoryPronounAi={runningStoryPronounAi}
        storyPronounAiFinished={storyPronounAiFinished}
        storyPronounAiProgress={storyPronounAiProgress}
        storyPronounAiErrors={storyPronounAiErrors}
        onStartStoryPronounAi={handleStartStoryPronounAi}
        onStopStoryPronounAi={handleStopStoryPronounAi}
        onOpenStoryPronounAiChapter={handleOpenStoryPronounAiChapter}
        onApplyAllStoryPronounAi={handleApplyAllStoryPronounAi}
        applyingStoryPronounAiAll={batchReplaceRunning}
      />
      {issuePopover && (
        <div
          ref={issuePopoverRef}
          role="dialog"
          aria-label="Cách sửa lỗi nghi vấn"
          className="fixed z-[90] w-80 max-w-[calc(100vw-24px)] rounded-2xl border border-violet-100 bg-white p-3 shadow-2xl"
          style={{ left: issuePopover.x, top: issuePopover.y }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
              {issuePopover.items.length > 1 ? `${issuePopover.items.length} lỗi nghi vấn` : "Lỗi nghi vấn"}
            </p>
            <button onClick={() => setIssuePopover(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 max-h-72 space-y-2.5 overflow-y-auto cute-scrollbar pr-0.5">
            {issuePopover.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                <div className="flex items-center gap-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${item.__kind === "beta" ? "bg-fuchsia-100 text-fuchsia-700" : "bg-amber-100 text-amber-700"}`}>
                    {item.__kind === "beta" ? "Beta" : "QA"}
                  </span>
                  <p className="text-xs font-semibold text-slate-800">{item.label}</p>
                </div>
                {item.detail && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.detail}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {item.replacement && item.replacement !== item.value ? (
                    <button onClick={() => handleApplyIssuePopoverItem(item, item.replacement)} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-violet-700">
                      <Check className="h-3 w-3" /> Áp dụng: “{item.replacement}”
                    </button>
                  ) : item.suggestions?.length ? (
                    item.suggestions.map((suggestion) => (
                      <button key={suggestion} onClick={() => handleApplyIssuePopoverItem(item, suggestion)} className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-[11px] text-violet-700 hover:bg-violet-50">
                        {suggestion}
                      </button>
                    ))
                  ) : (
                    <button
                      onClick={() => {
                        setIssuePopover(null);
                        if (item.__kind === "beta") setShowBetaCheck(true);
                        else setShowQualityCheck(true);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50"
                    >
                      Cần xem kỹ hơn — mở {item.__kind === "beta" ? "Beta" : "QA"} toàn diện
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <QualityCheckDialog
        open={showQualityCheck}
        onOpenChange={setShowQualityCheck}
        issues={qualityIssues}
        onApply={handleApplyQualitySuggestion}
        onLocate={handleLocateQualityIssue}
        onTranslate={handleTranslateQualityIssue}
        onUndo={handleUndoQualitySuggestion}
        canUndo={qualityUndo?.chapterId === currentChapter?.id}
        onApplyAllSafe={handleApplyAllSafeQuality}
      />
      <BetaCheckDialog open={showBetaCheck} onOpenChange={setShowBetaCheck} issues={betaIssues} onApply={handleApplyBeta} onLocate={handleLocateBeta} onIgnore={handleIgnoreBeta} onAiCheck={handleAiBeta} aiRunning={betaAiRunning} onUndo={handleUndoBeta} canUndo={betaUndo?.chapterId===currentChapter?.id} onApplyAllSafe={handleApplyAllSafeBeta}/>
      <BetaReaderDialog
        open={showBetaReader}
        onOpenChange={setShowBetaReader}
        running={betaReaderRunning}
        progress={betaReaderProgress}
        notes={betaReaderChapterId === currentChapter?.id ? betaReaderNotes : null}
        onScan={handleRunBetaReader}
        onApply={handleApplyBetaReaderNote}
        onDismiss={handleDismissBetaReaderNote}
        canUndo={aiUndo?.chapterId === currentChapter?.id}
        onUndo={handleUndoAiEdit}
        onOpenStoryScan={() => { setShowBetaReader(false); setShowStoryBetaReader(true); }}
        onOpenTargetedFix={() => { setShowBetaReader(false); setShowTargetedFix(true); }}
        contextNote={betaReaderChapterId === currentChapter?.id ? betaReaderContextNote : null}
      />
      <StoryBetaReaderDialog
        open={showStoryBetaReader}
        onOpenChange={setShowStoryBetaReader}
        report={storyBetaReaderReport}
        running={runningStoryBetaReader}
        finished={storyBetaReaderFinished}
        progress={storyBetaReaderProgress}
        errors={storyBetaReaderErrors}
        onStart={handleStartStoryBetaReader}
        onStop={handleStopStoryBetaReader}
        onOpenChapter={handleOpenStoryBetaReaderChapter}
      />
      <TargetedFixDialog
        open={showTargetedFix}
        onOpenChange={setShowTargetedFix}
        report={targetedFixReport}
        running={runningTargetedFix}
        finished={targetedFixFinished}
        progress={targetedFixProgress}
        errors={targetedFixErrors}
        onStart={handleStartTargetedFix}
        onStop={handleStopTargetedFix}
        onOpenChapter={handleOpenTargetedFixChapter}
      />
      <AISettingsDialog open={showAISettings} onOpenChange={setShowAISettings} />
      <ChapterManagerDialog
        open={showChapterManager}
        onOpenChange={setShowChapterManager}
        chapters={chapterList}
        currentChapterId={currentChapter?.id}
        onSelect={(id) => {
          switchChapter(id);
          setShowChapterManager(false);
        }}
        onRename={handleRenameChapter}
        onDelete={handleDeleteChapter}
        onDeleteSelected={handleDeleteSelectedChapters}
        onUndoDelete={handleUndoChapterDelete}
        deleteUndoCount={chapterDeleteUndo?.length || 0}
        onReorder={handleReorderChapter}
        onOpenImport={() => setShowImportChapters(true)}
        onExportAll={handleExportAllChapters}
        exporting={exportingChapters}
        onExportEdited={handleExportEditedChapters}
        exportingEdited={exportingEdited}
        onExportSelected={handleExportSelectedChapters}
        exportingSelected={exportingSelected}
        onBatchEdit={() => setShowBatchEdit(true)}
        onBatchTitleEdit={() => setShowBatchTitleEdit(true)}
        qaIssuesByChapter={Object.fromEntries((storyQaReport?.chapters || []).map((chapter) => [chapter.id, chapter.count]))}
        betaIssuesByChapter={Object.fromEntries((storyBetaReport?.chapters || []).map(chapter=>[chapter.id,chapter.count]))}
      />
      <StoryQaDialog
        open={showStoryQa}
        onOpenChange={setShowStoryQa}
        settings={project?.style_toggles?.qa_settings || { era:"neutral", context:"", genres:[], forbiddenWords:[] }}
        report={storyQaReport}
        running={storyQaRunning}
        onSaveSettings={handleSaveQaSettings}
        onScan={handleScanStoryQa}
        onBulkReplace={handleStoryQaBulkReplace}
        onIgnoreGroup={handleStoryQaIgnore}
        onUndoBulkReplace={handleUndoBatchRules}
        canUndoBulkReplace={Boolean(batchReplaceUndo?.rows?.length)}
        qaWorkflow={{ pending:chapterList.filter(ch=>editedChapterIds.has(ch.id)&&qaStatusOf(ch)!=="done"), stale:chapterList.filter(ch=>qaStatusOf(ch)==="stale") }}
        onOpenChapter={(id) => { switchChapter(id); setShowStoryQa(false); }}
        onApplyAllSafe={handleStoryQaApplyAllSafe}
        onApplyAllPronoun={handleStoryQaApplyAllPronoun}
        onTranslate={handleTranslateStoryQaGroup}
      />
      <StoryBetaDialog open={showStoryBeta} onOpenChange={setShowStoryBeta} settings={betaSettings()} report={storyBetaReport} running={storyBetaRunning} onSaveSettings={handleSaveBetaSettings} onScan={handleScanStoryBeta} onBulkReplace={handleStoryBetaReplace} onIgnore={handleStoryBetaIgnore} pending={chapterList.filter(ch=>editedChapterIds.has(ch.id)&&betaStatusOf(ch)!=="done")} onOpenChapter={(id)=>{switchChapter(id);setShowStoryBeta(false);}} onApplyAllSafe={handleStoryBetaApplyAllSafe} onStartAiBatch={()=>setShowBatchBetaAi(true)} aiBatchPendingCount={aiBetaPendingCount}/>
      <BulkColumnMoveDialog
        open={showColumnMove}
        onOpenChange={setShowColumnMove}
        totalChapters={chapterList.length}
        onRun={handleBulkColumnMove}
        running={movingColumns}
        undoCount={columnMoveUndo?.length || 0}
        onUndo={handleUndoColumnMove}
      />
      <QtCleanupDialog
        open={showQtCleanup}
        onOpenChange={setShowQtCleanup}
        totalChapters={chapterList.length}
        onScan={scanQtPartMarkers}
        onApply={applyQtPartCleanup}
        onUndo={undoQtPartCleanup}
        undoCount={qtCleanupUndo?.length || 0}
        running={qtCleanupRunning}
      />
      <ImportChaptersDialog
        open={showImportChapters}
        onOpenChange={setShowImportChapters}
        onImport={handleImportChapters}
      />
      <BatchEditDialog
        open={showBatchEdit}
        onOpenChange={setShowBatchEdit}
        chapters={chapterList}
        editedChapterIds={editedChapterIds}
        storyMemory={project?.style_toggles?.story_memory || {}}
        learningEnabled={aiChapterLearningEnabled}
        running={batchRunning}
        finished={batchFinished}
        progress={batchProgress}
        errors={batchErrors}
        onStart={handleStartBatchEdit}
        onStop={handleStopBatchEdit}
      />
      <TranslationWorkflowDialog
        open={showTranslationWorkflow}
        onOpenChange={setShowTranslationWorkflow}
        totalChapters={chapterList.length}
        analysisRunning={translationBootstrapRunning}
        analysisResult={translationBootstrapResult}
        onAnalyze={handleAnalyzeTranslationWorkflow}
        onDiscoverGlossary={() => { setShowTranslationWorkflow(false); handleDetectNames(); }}
        savingRules={translationBootstrapSaving}
        onSaveRules={handleSaveTranslationBootstrap}
        qtRunning={batchQtRunning}
        qtFinished={batchQtFinished}
        qtProgress={batchQtProgress}
        qtErrors={batchQtErrors}
        onStartQt={handleStartBatchQt}
        onStopQt={handleStopBatchQt}
        onOpenBatchEdit={() => { setShowTranslationWorkflow(false); setShowBatchEdit(true); }}
      />
      <BatchBetaAiDialog
        open={showBatchBetaAi}
        onOpenChange={setShowBatchBetaAi}
        totalChapters={chapterList.length}
        running={batchBetaAiRunning}
        finished={batchBetaAiFinished}
        progress={batchBetaAiProgress}
        errors={batchBetaAiErrors}
        onStart={handleStartBatchBetaAi}
        onStop={handleStopBatchBetaAi}
      />
      <BatchTitleEditDialog
        open={showBatchTitleEdit}
        onOpenChange={setShowBatchTitleEdit}
        chapters={chapterList}
        running={batchTitleRunning}
        finished={batchTitleFinished}
        progress={batchTitleProgress}
        errors={batchTitleErrors}
        onStart={handleStartBatchTitleEdit}
        onStop={handleStopBatchTitleEdit}
      />
      <DetectNamesDialog
        open={showDetectNames}
        onOpenChange={(open) => { if (savingDiscoveredTerms) return; if (!open) discoveryStopRef.current = true; setShowDetectNames(open); }}
        detecting={detectingNames}
        candidates={nameCandidates}
        progress={discoveryProgress}
        warnings={discoveryWarnings}
        saving={savingDiscoveredTerms}
        chapterTitle={discoveryContextRef.current?.title}
        onStop={() => { discoveryStopRef.current = true; }}
        onConfirm={handleAddDetectedNames}
      />
      <TranslationSettingsDialog
        open={showTranslationSettings}
        onOpenChange={setShowTranslationSettings}
        presets={presets}
        activePresetId={project?.active_preset_id}
        styleToggles={project?.style_toggles}
        onSelectPreset={handleSelectPreset}
        onSavePreset={handleSavePreset}
        onDeletePreset={handleDeletePreset}
        onUpdateStyleToggles={handleUpdateStyleToggles}
        onSuggestPreset={handleSuggestPreset}
      />
      <ImageTranslateDialog
        open={showImageTranslate}
        onOpenChange={setShowImageTranslate}
        hasCustomAI={hasCustomAI()}
        onOpenSettings={() => setShowAISettings(true)}
        translating={imageTranslating}
        result={imageResult}
        onSelectFile={handleSelectImageFile}
        onEditRaw={handleEditImageRaw}
        onApply={handleApplyImageResult}
      />
      <ConfirmDialog
        open={aiConfirmOpen}
        onOpenChange={setAiConfirmOpen}
        title="Ghi đè bản Edit hiện tại?"
        description="AI sẽ thay thế toàn bộ nội dung cột Bản Edit của chương này. Bạn có thể bấm 'Hoàn tác AI' ngay sau đó nếu không ưng ý, nhưng chỉ trong phiên làm việc này (không lưu lâu dài)."
        confirmLabel="Vẫn chạy AI"
        destructive={false}
        onConfirm={() => {
          setAiConfirmOpen(false);
          pendingAiRunRef.current?.();
        }}
      />
    </div>
  );
}
