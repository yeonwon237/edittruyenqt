import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clapperboard, Hammer } from "lucide-react";

// Placeholder — the actual "audio -> video" pipeline is deliberately not
// built yet (per user request: land the 4-feature navigation shell first,
// build this function in a later round).
export default function CreateVideo() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-violet-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-xl hover:bg-violet-50 text-slate-500 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shrink-0 shadow-md">
            <Clapperboard className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate">
              Tạo Video
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">
              Biến audio truyện thành video
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-4">
          <Hammer className="w-10 h-10 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-700 mb-1">Đang được phát triển</h2>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Tính năng tạo video từ audio truyện sẽ có ở đây. Quay lại sau nhé!
        </p>
      </main>
    </div>
  );
}
