import React from "react";
import { BookOpenCheck, Check, Sparkles, WandSparkles } from "lucide-react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="auth-shell min-h-screen bg-background">
      <aside className="auth-showcase" aria-label="Giới thiệu ứng dụng">
        <div className="auth-showcase__glow auth-showcase__glow--one" />
        <div className="auth-showcase__glow auth-showcase__glow--two" />
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div className="inline-flex items-center gap-3 text-white">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-lg backdrop-blur">
              <BookOpenCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold tracking-wide">TRỢ LÝ BIÊN TẬP</p>
              <p className="text-xs text-white/60">Không gian sáng tạo truyện</p>
            </div>
          </div>

          <div className="max-w-xl py-12">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Biên tập thông minh, trải nghiệm liền mạch
            </span>
            <h2 className="text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl">
              Từ bản QT thô đến một câu chuyện trọn vẹn.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/65">
              Quản lý chương, tinh chỉnh bản dịch và sáng tạo audio, video, phụ đề trong cùng một không gian tập trung.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-white/80 sm:grid-cols-2">
              {["Biên tập tập trung", "Công cụ AI linh hoạt", "Quản lý bộ truyện", "Xuất bản đa định dạng"].map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15">
                    <Check className="h-3 w-3" />
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/45">
            <WandSparkles className="h-3.5 w-3.5" /> Thiết kế để bạn tập trung vào câu chữ
          </div>
        </div>
      </aside>

      <main className="auth-form-area">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 lg:mb-10">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 lg:hidden">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mb-2 hidden text-xs font-bold uppercase tracking-[0.18em] text-primary lg:block">Chào mừng bạn</p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="auth-card">
            {children}
          </div>
          {footer && (
            <p className="mt-7 text-center text-sm text-muted-foreground">{footer}</p>
          )}
        </div>
      </main>
    </div>
  );
}
