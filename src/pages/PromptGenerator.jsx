import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Copy, Plus, Wand2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "etq-prompt-generator-v1";

const SOURCE_LANGS = ["Trung", "Hàn", "Nhật", "Anh", "Khác"];

const MODES = [
  { id: "translate", label: "Prompt Dịch" },
  { id: "edit", label: "Prompt Edit" },
];

// Same list as StoryQaDialog.jsx's CONTEXT_SUGGESTIONS, kept in sync manually
// since it's small and each dialog already inlines its own copy.
const CONTEXT_SUGGESTIONS = [
  { label: "Cổ đại Trung Hoa", era: "ancient" }, { label: "Cổ đại Việt Nam", era: "ancient" },
  { label: "Cổ trang giả tưởng", era: "ancient" }, { label: "Trung cổ phương Tây", era: "ancient" },
  { label: "Dân quốc", era: "neutral" }, { label: "Cận đại", era: "neutral" },
  { label: "Hiện đại", era: "modern" }, { label: "Đô thị hiện đại", era: "modern" },
  { label: "Tận thế", era: "neutral" }, { label: "Tương lai / khoa học viễn tưởng", era: "neutral" },
  { label: "Thế giới giả tưởng", era: "neutral" }, { label: "Không xác định", era: "neutral" },
];

// Superset of StoryQaDialog.jsx's GENRE_SUGGESTIONS — this page has room for
// a longer list since it's a full page, not a dialog panel.
const GENRE_SUGGESTIONS = [
  "Kiếm hiệp", "Võ hiệp", "Tiên hiệp", "Tu tiên", "Huyền huyễn", "Cung đấu",
  "Trạch đấu", "Quyền mưu", "Ngôn tình", "Bách hợp", "Đam mỹ", "Xuyên không",
  "Xuyên thư", "Xuyên nhanh", "Vô hạn lưu", "Trọng sinh", "Song trọng sinh",
  "Hệ thống", "Dưỡng thành", "Điền văn", "Điền viên", "Đô thị", "Dị năng",
  "Linh dị", "Kinh dị", "Trinh thám", "Khoa huyễn", "Tận thế", "Dị giới",
  "Hài hước", "Sảng văn", "Ngược", "Sủng", "Gia đấu", "Chức trường",
  "Giới giải trí", "Học đường", "Niên hạ", "Nữ cường", "Nam cường", "Lịch sử", "Quân sự",
];

const ERA_NOTES = {
  ancient: "Đây là bối cảnh cổ đại/cổ trang: dùng xưng hô và từ ngữ phù hợp thời cổ (ta/ngươi/huynh/muội/tỷ/đệ/thiếp/trẫm/ái khanh...). TUYỆT ĐỐI không dùng từ ngữ hiện đại (anh/em kiểu hiện đại, ok, cảm ơn/xin chào kiểu Tây hoá...).",
  modern: "Đây là bối cảnh hiện đại: dùng xưng hô và từ ngữ đời thường hiện đại (anh/em/tôi/bạn/cậu...), tránh dùng từ Hán Việt cổ trang không cần thiết.",
  neutral: "Bối cảnh trung tính hoặc chưa rõ triều đại — chọn xưng hô phù hợp theo quan hệ nhân vật trong từng câu, ưu tiên tự nhiên, nhất quán xuyên suốt.",
};

// "Đặc thù thể loại" — canonical translation/editing guidance per sub-genre
// that carries its own specialized vocabulary. Kept separate from
// GENRE_SUGGESTIONS because some of these (ABO) aren't a "genre" in the
// QA/Beta sense and some genres above don't need special terminology
// handling. Shared between both prompt modes since it's the same novel.
const SPECIALTY_HINTS = [
  { id: "abo", label: "ABO (Alpha/Beta/Omega)", hint: "Đây là thể loại ABO (Alpha/Beta/Omega): giữ nguyên các danh xưng Alpha/Beta/Omega, không dịch nghĩa. Dịch/biên tập chính xác và nhất quán các khái niệm đặc trưng: pheromone → thông tin tố, heat → kỳ động dục/kỳ phát tình (Omega), rut → kỳ phát dục (Alpha), mating/bond/mark → đánh dấu/dấu ấn, nest → tổ, suppressant → thuốc ức chế." },
  { id: "system", label: "Hệ thống (game/status)", hint: "Đây là thể loại có Hệ Thống: giữ nguyên định dạng bảng thông báo/hộp thoại hệ thống (dùng dấu ngoặc vuông [...] để tách phần hệ thống khỏi phần tường thuật). Dùng nhất quán: nhiệm vụ (quest), điểm kinh nghiệm (EXP), cấp độ (level), thuộc tính (stats), vật phẩm (item), kỹ năng (skill)." },
  { id: "cultivation", label: "Tu tiên / Tiên hiệp", hint: "Đây là thể loại tu tiên/tiên hiệp: dùng đúng hệ thống cảnh giới tu luyện quen thuộc với độc giả Việt (Luyện khí → Trúc cơ → Kim đan → Nguyên anh → Hóa thần → Luyện hư → Hợp thể → Đại thừa → Độ kiếp...), không tự sáng tạo cảnh giới mới, giữ Hán Việt cho tên công pháp/pháp bảo/linh khí." },
  { id: "fantasy", label: "Dị giới / Fantasy phương Tây", hint: "Đây là thể loại dị giới/fantasy phương Tây: dùng thuật ngữ pháp thuật/chức danh quen thuộc (Pháp sư, Kiếm sĩ, Học viện, Công tước/Bá tước, Ma pháp, Nguyên tố...); tên riêng nhân vật/địa danh giữ nguyên dạng phiên âm hoặc Việt hóa nhẹ, miễn nhất quán xuyên suốt." },
  { id: "palace", label: "Cung đấu / Cung đình", hint: "Đây là thể loại cung đấu/cung đình cổ trang: dùng đúng hệ thống danh phận hậu cung và xưng hô hoàng tộc (Hoàng thượng, Hoàng hậu, Quý phi, Thái hậu, ái phi, thần thiếp, ai gia, trẫm...), phân biệt rõ theo thứ bậc." },
  { id: "detective", label: "Trinh thám / Huyền nghi", hint: "Đây là thể loại trinh thám/điều tra: giữ đúng thuật ngữ pháp y/điều tra (hiện trường, vật chứng, nhân chứng, thẩm vấn...), văn phong súc tích, không thêm suy đoán ngoài lời văn gốc." },
  { id: "scifi", label: "Khoa huyễn / Sci-fi", hint: "Đây là thể loại khoa học viễn tưởng: giữ nguyên các thuật ngữ công nghệ/khoa học (AI, người máy, du hành vũ trụ, gen...), có thể giữ nguyên tên riêng công nghệ bằng tiếng Anh nếu bản gốc cũng vậy." },
  { id: "superpower", label: "Đô thị dị năng / Siêu năng lực", hint: "Đây là thể loại đô thị có dị năng/siêu năng lực: dùng nhất quán một tên gọi cho mỗi năng lực đặc biệt xuyên suốt truyện, không đổi cách gọi giữa các chương." },
];

const TRANSLATE_FORMAT_OPTIONS = [
  { id: "keepParagraphs", label: "Giữ nguyên số đoạn và cách xuống dòng như bản gốc", text: "Giữ nguyên số đoạn và cách xuống dòng như bản gốc, không gộp/tách đoạn.", defaultOn: true },
  { id: "noCommentary", label: "Không thêm lời dẫn/ghi chú/giải thích của AI", text: "Không thêm lời dẫn, ghi chú, giải thích hay bình luận nào ở đầu/cuối — chỉ trả về đúng phần bản dịch.", defaultOn: true },
  { id: "noSkip", label: "Dịch đầy đủ, không tóm tắt, không bỏ câu", text: "Dịch đầy đủ 100% nội dung, không tóm tắt, không bỏ sót câu nào.", defaultOn: true },
  { id: "consistentNames", label: "Chuyển ngữ tên riêng/địa danh nhất quán", text: "Dùng nhất quán một cách chuyển ngữ cho mỗi tên riêng/địa danh trong suốt đoạn văn.", defaultOn: true },
  { id: "naturalVietnamese", label: "Văn phong tự nhiên, không dịch máy móc", text: "Văn phong tiếng Việt tự nhiên, mượt mà như tiểu thuyết mạng, không dịch kiểu word-by-word máy móc.", defaultOn: true },
  { id: "keepMarks", label: "Giữ nguyên ký hiệu/emoji đặc biệt (nếu có)", text: "Giữ nguyên các ký hiệu/emoji/dấu câu đặc biệt xuất hiện trong bản gốc (nếu có).", defaultOn: false },
];

// Edit prompt targets a different starting point (an already QT-translated,
// word-for-word rough draft) so its requirements are about polishing prose
// without touching plot, not about translation fidelity.
const EDIT_FORMAT_OPTIONS = [
  { id: "keepPlot", label: "Không thêm/bớt hoặc thay đổi tình tiết, chỉ biên tập câu chữ", text: "Không thêm, bớt hoặc thay đổi tình tiết/nội dung — chỉ biên tập lại câu chữ, văn phong.", defaultOn: true },
  { id: "fixQtOrder", label: "Sửa trật tự từ kiểu dịch máy (QT) thành câu văn tự nhiên", text: "Sửa các câu bị đảo trật tự từ kiểu dịch máy (QT) thành câu văn tiếng Việt tự nhiên, đúng ngữ pháp.", defaultOn: true },
  { id: "consistentAddress", label: "Xưng hô/đại từ nhân xưng nhất quán, đúng vai vế", text: "Xưng hô/đại từ nhân xưng phải nhất quán và đúng vai vế giữa các nhân vật xuyên suốt đoạn văn, phù hợp bối cảnh.", defaultOn: true },
  { id: "noRepeatEdit", label: "Loại bỏ từ/cụm từ lặp lại sát nhau", text: "Loại bỏ tình trạng lặp từ, lặp cụm từ hoặc lặp cấu trúc câu liên tiếp nhau.", defaultOn: true },
  { id: "keepNames", label: "Giữ nguyên tên riêng/địa danh/thuật ngữ đã xuất hiện", text: "Giữ nguyên cách gọi tên riêng, địa danh, thuật ngữ đã xuất hiện trong đoạn văn — không tự đổi cách gọi.", defaultOn: true },
  { id: "noCommentaryEdit", label: "Không thêm lời dẫn/ghi chú của AI", text: "Không thêm lời dẫn, ghi chú, giải thích hay bình luận nào ở đầu/cuối — chỉ trả về đúng phần đã biên tập.", defaultOn: true },
  { id: "keepParagraphsEdit", label: "Giữ nguyên số đoạn và cách xuống dòng như bản gốc", text: "Giữ nguyên số đoạn và cách xuống dòng như bản gốc, không gộp/tách đoạn.", defaultOn: true },
  { id: "naturalStyleEdit", label: "Văn phong mượt mà như tiểu thuyết đã xuất bản", text: "Văn phong tiếng Việt mượt mà, tự nhiên như tiểu thuyết đã xuất bản, không còn dấu vết dịch máy.", defaultOn: true },
];

const ERA_OPTIONS = [
  { value: "ancient", label: "Cổ đại" },
  { value: "modern", label: "Hiện đại" },
  { value: "neutral", label: "Trung tính" },
];

const defaultState = () => ({
  mode: "translate",
  sourceLang: "Trung",
  genres: [],
  customGenreOptions: [],
  era: "neutral",
  context: "",
  customContextOptions: [],
  specialties: [],
  translateFormat: Object.fromEntries(TRANSLATE_FORMAT_OPTIONS.map((o) => [o.id, o.defaultOn])),
  editFormat: Object.fromEntries(EDIT_FORMAT_OPTIONS.map((o) => [o.id, o.defaultOn])),
  notes: "",
});

function sharedCriteriaLines(state) {
  const lines = [];
  lines.push(`THỂ LOẠI: ${state.genres.length ? state.genres.join(", ") : "chưa xác định"}`);
  lines.push(`BỐI CẢNH: ${state.context || "chưa xác định"}`);
  lines.push(ERA_NOTES[state.era] || ERA_NOTES.neutral);
  const specialtyLines = SPECIALTY_HINTS.filter((s) => state.specialties.includes(s.id));
  if (specialtyLines.length) {
    lines.push("");
    lines.push("ĐẶC THÙ THỂ LOẠI:");
    specialtyLines.forEach((s) => lines.push(`- ${s.hint}`));
  }
  return lines;
}

function buildTranslatePrompt(state) {
  const lines = [];
  lines.push(`Bạn là một dịch giả tiểu thuyết mạng chuyên nghiệp, dịch từ tiếng ${state.sourceLang} sang tiếng Việt.`);
  lines.push("");
  lines.push(...sharedCriteriaLines(state));

  const formatLines = TRANSLATE_FORMAT_OPTIONS.filter((o) => state.translateFormat[o.id]);
  if (formatLines.length) {
    lines.push("");
    lines.push("YÊU CẦU KHI DỊCH:");
    formatLines.forEach((o) => lines.push(`- ${o.text}`));
  }

  if (state.notes.trim()) {
    lines.push("");
    lines.push(`GHI CHÚ THÊM: ${state.notes.trim()}`);
  }

  lines.push("");
  lines.push("Hãy dịch đoạn văn bản dưới đây sang tiếng Việt theo đúng các yêu cầu trên. Chỉ trả về bản dịch, không thêm gì khác:");
  lines.push("");
  lines.push('"""');
  lines.push("[DÁN NGUYÊN VĂN CHƯƠNG CẦN DỊCH VÀO ĐÂY]");
  lines.push('"""');
  return lines.join("\n");
}

function buildEditPrompt(state) {
  const lines = [];
  lines.push(`Bạn là một biên tập viên tiểu thuyết mạng chuyên nghiệp. Đoạn văn bản dưới đây là bản dịch thô qua công cụ QT (dịch máy theo từng chữ, từ tiếng ${state.sourceLang} sang tiếng Việt) — nhiệm vụ của bạn là biên tập lại thành văn xuôi tiếng Việt tự nhiên, mượt mà, giữ nguyên 100% nội dung và tình tiết gốc.`);
  lines.push("");
  lines.push(...sharedCriteriaLines(state));

  lines.push("");
  lines.push("CÁC LỖI QT THƯỜNG GẶP CẦN SỬA:");
  lines.push('- Trật tự từ bị đảo lộn kiểu dịch máy (VD: "người kia hung dữ bộ dạng" → diễn đạt lại tự nhiên như "bộ dạng của người kia trông thật hung dữ")');
  lines.push("- Từ Hán Việt dịch cứng nhắc, tối nghĩa trong tiếng Việt — thay bằng cách diễn đạt tự nhiên hơn nếu không làm mất sắc thái");
  lines.push("- Xưng hô/đại từ nhân xưng sai vai vế hoặc không nhất quán giữa các câu");
  lines.push("- Câu quá dài, thiếu dấu câu, hoặc ngắt câu sai chỗ");

  const formatLines = EDIT_FORMAT_OPTIONS.filter((o) => state.editFormat[o.id]);
  if (formatLines.length) {
    lines.push("");
    lines.push("YÊU CẦU KHI BIÊN TẬP:");
    formatLines.forEach((o) => lines.push(`- ${o.text}`));
  }

  if (state.notes.trim()) {
    lines.push("");
    lines.push(`GHI CHÚ THÊM: ${state.notes.trim()}`);
  }

  lines.push("");
  lines.push("Hãy biên tập đoạn văn bản QT dưới đây theo đúng các yêu cầu trên. Chỉ trả về bản đã biên tập, không thêm gì khác:");
  lines.push("");
  lines.push('"""');
  lines.push("[DÁN NGUYÊN VĂN BẢN QT CẦN BIÊN TẬP VÀO ĐÂY]");
  lines.push('"""');
  return lines.join("\n");
}

export default function PromptGenerator() {
  const { toast } = useToast();
  const [state, setState] = useState(defaultState);
  const [customGenre, setCustomGenre] = useState("");
  const [customContextLabel, setCustomContextLabel] = useState("");
  const [customContextEra, setCustomContextEra] = useState("neutral");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved) {
        const base = defaultState();
        // Migrate the old single `format` key (pre-Edit-prompt versions of
        // this page) into translateFormat so returning users don't lose
        // their saved checkboxes.
        const legacyFormat = saved.format;
        setState({
          ...base,
          ...saved,
          translateFormat: { ...base.translateFormat, ...(legacyFormat || {}), ...(saved.translateFormat || {}) },
          editFormat: { ...base.editFormat, ...(saved.editFormat || {}) },
        });
      }
    } catch { /* ignore corrupt local cache */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const allGenreOptions = [...GENRE_SUGGESTIONS, ...state.customGenreOptions.filter((g) => !GENRE_SUGGESTIONS.includes(g))];
  const allContextOptions = [...CONTEXT_SUGGESTIONS, ...state.customContextOptions.filter((c) => !CONTEXT_SUGGESTIONS.some((b) => b.label === c.label))];

  const toggleGenre = (genre) => setState((s) => ({
    ...s,
    genres: s.genres.includes(genre) ? s.genres.filter((g) => g !== genre) : [...s.genres, genre],
  }));
  const addCustomGenre = () => {
    const value = customGenre.trim();
    if (!value) return;
    setState((s) => ({
      ...s,
      customGenreOptions: s.customGenreOptions.includes(value) ? s.customGenreOptions : [...s.customGenreOptions, value],
      genres: s.genres.includes(value) ? s.genres : [...s.genres, value],
    }));
    setCustomGenre("");
  };
  const removeCustomGenre = (genre) => setState((s) => ({
    ...s,
    customGenreOptions: s.customGenreOptions.filter((g) => g !== genre),
    genres: s.genres.filter((g) => g !== genre),
  }));
  const addCustomContext = () => {
    const label = customContextLabel.trim();
    if (!label) return;
    setState((s) => ({
      ...s,
      customContextOptions: s.customContextOptions.some((c) => c.label === label) ? s.customContextOptions : [...s.customContextOptions, { label, era: customContextEra }],
      context: label,
      era: customContextEra,
    }));
    setCustomContextLabel("");
  };
  const removeCustomContext = (label) => setState((s) => ({
    ...s,
    customContextOptions: s.customContextOptions.filter((c) => c.label !== label),
    context: s.context === label ? "" : s.context,
  }));
  const toggleSpecialty = (id) => setState((s) => ({
    ...s,
    specialties: s.specialties.includes(id) ? s.specialties.filter((x) => x !== id) : [...s.specialties, id],
  }));

  const formatKey = state.mode === "edit" ? "editFormat" : "translateFormat";
  const formatOptions = state.mode === "edit" ? EDIT_FORMAT_OPTIONS : TRANSLATE_FORMAT_OPTIONS;
  const toggleFormat = (id) => setState((s) => ({ ...s, [formatKey]: { ...s[formatKey], [id]: !s[formatKey][id] } }));

  const prompt = useMemo(
    () => (state.mode === "edit" ? buildEditPrompt(state) : buildTranslatePrompt(state)),
    [state]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast({
        title: "Đã sao chép prompt ✅",
        description: state.mode === "edit"
          ? "Dán vào Gemini (hoặc AI khác) kèm bản QT cần biên tập."
          : "Dán vào Gemini (hoặc AI khác) và thêm nội dung chương cần dịch.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Không sao chép được", description: "Trình duyệt chặn quyền clipboard, hãy bôi đen và copy thủ công.", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="sticky top-0 z-30 border-b border-violet-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <Link to="/" className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-violet-50"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800"><Wand2 className="h-4.5 w-4.5 text-violet-600" /> Tạo Prompt Dịch &amp; Edit</h1>
            <p className="text-xs text-slate-400">Chọn tiêu chí bên dưới để có ngay prompt dịch hoặc prompt biên tập chuẩn, đem qua Gemini/ChatGPT dùng — không cần tạo dự án trước.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-5 px-4 py-8 lg:grid-cols-[1fr,1fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-white bg-white/90 p-5 shadow-sm">
            <label className="text-xs font-semibold text-slate-600">Ngôn ngữ nguồn</label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SOURCE_LANGS.map((lang) => (
                <button key={lang} onClick={() => setState((s) => ({ ...s, sourceLang: lang }))} className={`rounded-full border px-3 py-1.5 text-xs ${state.sourceLang === lang ? "border-violet-500 bg-violet-100 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:border-violet-200"}`}>{lang}</button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white bg-white/90 p-5 shadow-sm">
            <label className="text-xs font-semibold text-slate-600">Thể loại (chọn nhiều)</label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allGenreOptions.map((genre) => {
                const isCustom = !GENRE_SUGGESTIONS.includes(genre);
                return (
                  <span key={genre} className={`inline-flex items-center rounded-full border text-[11px] ${state.genres.includes(genre) ? "border-violet-500 bg-violet-100 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:border-violet-200"}`}>
                    <button onClick={() => toggleGenre(genre)} className="py-1 pl-2.5 pr-1">{state.genres.includes(genre) ? "✓ " : ""}{genre}</button>
                    {isCustom && <button onClick={() => removeCustomGenre(genre)} title="Xóa khỏi danh sách" className="px-1.5 py-1 text-slate-400 hover:text-red-500">×</button>}
                  </span>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={customGenre} onChange={(e) => setCustomGenre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomGenre())} placeholder="Nhập thể loại còn thiếu rồi bấm +..." className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs" />
              <Button variant="outline" size="sm" onClick={addCustomGenre}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          </div>

          <div className="rounded-3xl border border-white bg-white/90 p-5 shadow-sm">
            <label className="text-xs font-semibold text-slate-600">Bối cảnh / thời đại</label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allContextOptions.map((item) => {
                const isCustom = !CONTEXT_SUGGESTIONS.some((b) => b.label === item.label);
                return (
                  <span key={item.label} className={`inline-flex items-center rounded-full border text-[11px] ${state.context === item.label ? "border-violet-500 bg-violet-100 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:border-violet-200"}`}>
                    <button onClick={() => setState((s) => ({ ...s, context: item.label, era: item.era }))} className="py-1 pl-2.5 pr-1">{item.label}</button>
                    {isCustom && <button onClick={() => removeCustomContext(item.label)} title="Xóa khỏi danh sách" className="px-1.5 py-1 text-slate-400 hover:text-red-500">×</button>}
                  </span>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={customContextLabel} onChange={(e) => setCustomContextLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomContext())} placeholder="Nhập bối cảnh còn thiếu..." className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs" />
              <select value={customContextEra} onChange={(e) => setCustomContextEra(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                {ERA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Button variant="outline" size="sm" onClick={addCustomContext}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          </div>

          <div className="rounded-3xl border border-white bg-white/90 p-5 shadow-sm">
            <label className="text-xs font-semibold text-slate-600">Đặc thù thể loại (thêm hướng dẫn thuật ngữ chuyên biệt)</label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SPECIALTY_HINTS.map((s) => (
                <button key={s.id} onClick={() => toggleSpecialty(s.id)} className={`rounded-full border px-2.5 py-1 text-[11px] ${state.specialties.includes(s.id) ? "border-fuchsia-500 bg-fuchsia-100 text-fuchsia-700" : "border-slate-200 bg-white text-slate-500 hover:border-fuchsia-200"}`}>{state.specialties.includes(s.id) ? "✓ " : ""}{s.label}</button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white bg-white/90 p-5 shadow-sm">
            <label className="text-xs font-semibold text-slate-600">Yêu cầu định dạng đầu ra ({state.mode === "edit" ? "Edit" : "Dịch"})</label>
            <div className="mt-2 space-y-1.5">
              {formatOptions.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={Boolean(state[formatKey][o.id])} onChange={() => toggleFormat(o.id)} className="accent-violet-600" />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white bg-white/90 p-5 shadow-sm">
            <label className="text-xs font-semibold text-slate-600">Ghi chú thêm (không bắt buộc)</label>
            <textarea value={state.notes} onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))} placeholder="VD: tên nhân vật chính là Lâm Y, giữ nguyên không dịch nghĩa; truyện có yếu tố NP..." rows={3} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
          </div>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-violet-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 px-5 py-3">
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setState((s) => ({ ...s, mode: m.id }))}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${state.mode === m.id ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={handleCopy} className="bg-violet-600 hover:bg-violet-700">
                {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copied ? "Đã sao chép" : "Sao chép"}
              </Button>
            </div>
            <textarea readOnly value={prompt} className="h-[70vh] w-full resize-none rounded-b-3xl border-0 bg-transparent p-5 text-xs leading-6 text-slate-700 focus:outline-none" />
          </div>
        </div>
      </main>
    </div>
  );
}
