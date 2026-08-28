import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { chapterIdsForMode, selectChapterRange } from './lilybetaSelection';
import { supabase } from '@/api/supabaseClient';

export default function LilyBetaSync({ projectId, currentChapterId, beforeSync }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failures, setFailures] = useState([]);
  const [error, setError] = useState('');
  const [betaBookId, setBetaBookId] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [chapters, setChapters] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [range, setRange] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 100;
  const selectedSet = new Set(selectedIds);
  const [counts, setCounts] = useState({ created: 0, updated: 0, unchanged: 0 });
  const abortRef = useRef(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; abortRef.current?.abort(); }; }, []);

  async function request(body) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Vui lòng đăng nhập lại Editor.');
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch('/api/lilybeta-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ projectId, ...body }), signal: controller.signal });
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('API đồng bộ chưa sẵn sàng. Vui lòng kiểm tra cấu hình triển khai.');
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || 'Không gửi được LilyBeta'), { status: response.status });
      return data;
    } finally { clearTimeout(timer); }
  }
  async function loadChapters() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const plan = await request({ action: 'plan' });
      if (!mountedRef.current) return;
      setChapters(plan.chapters); setPage(0); setBetaBookId(plan.betaBookId);
      setSelectedIds(ids => ids.filter(id => plan.chapters.some(ch => ch.id === id)));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); busyRef.current = false; }
  }
  function applyRange() {
    try { setSelectedIds(selectChapterRange(chapters, range)); setError(''); }
    catch (err) { setError(err.message); }
  }
  async function run(mode, retryBatches) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(''); setFailures([]); setConflicts([]); setCounts({ created: 0, updated: 0, unchanged: 0 }); setProgress({ done: 0, total: 0 });
    const failed = [];
    try {
      // Dedicated save action propagates errors; existing autosave/export behavior is untouched.
      await beforeSync();
      if (!mountedRef.current) return;
      let batches = retryBatches;
      if (!batches) {
        const plan = await request({ action: 'plan' });
        const ids = chapterIdsForMode(plan.chapters, mode, currentChapterId, selectedIds);
        if (chapters !== null) { setChapters(plan.chapters); setPage(0); }
        batches = [];
        for (let i = 0; i < ids.length; i += 25) batches.push(ids.slice(i, i + 25));
        setBetaBookId(plan.betaBookId);
      }
      setProgress({ done: 0, total: batches.reduce((n, batch) => n + batch.length, 0) });
      const queue = [...batches];
      while (queue.length && mountedRef.current) {
        const chapterIds = queue.shift();
        try {
          const result = await request({ action: 'batch', chapterIds });
          setBetaBookId(result.betaBookId);
          setCounts(prev => ({ created: prev.created + result.results.filter(ch => ch.status === 'CREATED').length, updated: prev.updated + result.results.filter(ch => ch.status === 'UPDATED').length, unchanged: prev.unchanged + result.results.filter(ch => ch.status === 'ALREADY_SYNCED').length }));
          setChapters(prev => prev && prev.map(ch => {
            const accepted = result.results.find(r => r.editorChapterId === ch.id);
            if (!accepted) return ch;
            const ok = ['CREATED', 'UPDATED', 'ALREADY_SYNCED'].includes(accepted.status);
            return { ...ch, synced: !!accepted.betaChapterId, changed: !ok, syncStatus: ok ? 'SYNCED' : accepted.status };
          }));
          const blocked = result.results.filter(ch => !['CREATED', 'UPDATED', 'ALREADY_SYNCED'].includes(ch.status));
          setConflicts(prev => [...prev, ...blocked]);
          setProgress(prev => ({ ...prev, done: prev.done + chapterIds.length }));
        } catch (err) {
          if ((err.status === 413 || err.status === 400) && chapterIds.length > 1) {
            const middle = Math.ceil(chapterIds.length / 2);
            queue.unshift(chapterIds.slice(0, middle), chapterIds.slice(middle));
          } else {
            failed.push(chapterIds);
            setError(err.name === 'AbortError' ? 'Quá thời gian chờ; có thể thử lại batch lỗi.' : err.message);
            // Stop on authentication/configuration/outage instead of issuing hundreds of failed requests.
            if (![400, 404, 409, 413].includes(err.status)) { failed.push(...queue); break; }
          }
        }
      }
    } catch (err) { setError(err.message); }
    finally { setFailures(failed); setBusy(false); busyRef.current = false; }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold">{busy ? `Đang gửi ${progress.done}/${progress.total}` : 'Gửi sang LilyBeta'}</button>
    {open && createPortal(<div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="lilybeta-sync-title">
      <div className="bg-white rounded-2xl p-5 w-full max-w-2xl max-h-[90dvh] overflow-y-auto space-y-4 text-slate-800 shadow-xl">
        <h2 id="lilybeta-sync-title" className="font-bold text-lg">Gửi bản edit sang LilyBeta</h2>
        <p className="text-sm">Nút gửi sẽ lưu chương hiện tại trước khi đồng bộ. Chỉ gửi cột Bản edit; chương đã có công việc Beta sẽ không bị ghi đè. Xuất file vẫn dùng như trước.</p>
        <p className="text-xs text-slate-600">Gửi lại cùng chương không tạo bản trùng: chương không đổi được bỏ qua, chương có thay đổi được cập nhật nếu an toàn. “Chưa gửi” chỉ gửi các chương chưa có trên LilyBeta.</p>
        <div className="flex flex-wrap gap-2 text-sm">
          <button disabled={busy || !currentChapterId} onClick={() => run('current')} className="border rounded-lg p-2 disabled:opacity-40">Gửi chương hiện tại</button>
          <button disabled={busy} onClick={() => run('changed')} className="border rounded-lg p-2 disabled:opacity-40">Gửi các chương đã thay đổi</button>
          <button disabled={busy} onClick={() => run('new')} className="border rounded-lg p-2 disabled:opacity-40">Gửi chương chưa gửi</button>
          <button disabled={busy} onClick={loadChapters} className="border rounded-lg p-2 disabled:opacity-40">{chapters === null ? 'Chọn chương để gửi' : 'Tải lại danh sách'}</button>
          <button disabled={busy} onClick={() => run('all')} className="border rounded-lg p-2 disabled:opacity-40">Gửi toàn bộ</button>
        </div>
        {chapters !== null && <section aria-label="Chọn chương gửi LilyBeta" className="space-y-2 border rounded-xl p-3">
          <p className="text-xs text-slate-600">Số thứ tự theo danh sách Editor hiện tại, không phải số chương trên LilyBeta.</p>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Số chương muốn gửi" placeholder="Ví dụ: 1-20, 25, 30-35" value={range} onChange={e => setRange(e.target.value)} disabled={busy} className="min-w-0 flex-1 border rounded-lg p-2 text-base" />
            <button disabled={busy || !chapters.length} onClick={applyRange} className="border rounded-lg p-2 text-sm">Chọn theo khoảng</button>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <button disabled={busy} onClick={() => setSelectedIds(chapters.filter(ch => !ch.synced).map(ch => ch.id))} className="border rounded-lg p-2">Chọn chương chưa gửi</button>
            <button disabled={busy} onClick={() => setSelectedIds([])} className="border rounded-lg p-2">Bỏ chọn hết</button>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {!chapters.length && <p className="text-sm">Truyện chưa có chương.</p>}
            {chapters.slice(page * pageSize, (page + 1) * pageSize).map((ch, index) => <label key={ch.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 text-sm">
              <input type="checkbox" disabled={busy} checked={selectedSet.has(ch.id)} onChange={e => setSelectedIds(ids => e.target.checked ? [...ids, ch.id] : ids.filter(id => id !== ch.id))} className="mt-1" />
              <span className="min-w-0 break-words"><span>{page * pageSize + index + 1}. {ch.title}</span><span className="block text-xs text-slate-500">{!ch.synced ? 'Chưa gửi' : ['SOURCE_CONFLICT', 'SOURCE_VERSION_CONFLICT', 'STALE_SOURCE'].includes(ch.syncStatus) ? 'Có xung đột — giữ nguyên bản Beta' : ch.changed ? 'Đã gửi · có thay đổi' : 'Đã gửi · không đổi'}</span></span>
            </label>)}
          </div>
          {chapters.length > pageSize && <div className="flex items-center gap-3 text-sm">
            <button disabled={busy || page === 0} onClick={() => setPage(p => p - 1)} className="border rounded-lg p-2 disabled:opacity-40">Trang trước</button>
            <span>{page + 1} / {Math.ceil(chapters.length / pageSize)}</span>
            <button disabled={busy || (page + 1) * pageSize >= chapters.length} onClick={() => setPage(p => p + 1)} className="border rounded-lg p-2 disabled:opacity-40">Trang sau</button>
          </div>}
          <button disabled={busy || !selectedIds.length} onClick={() => run('selected')} className="bg-violet-600 text-white rounded-lg p-2 disabled:opacity-40 text-sm">Gửi {selectedIds.length} chương đã chọn</button>
        </section>}
        <p className="text-sm">Tạo mới: {counts.created} · Cập nhật: {counts.updated} · Không đổi: {counts.unchanged}</p>
        <p role="status" className="text-sm">{busy ? 'Đang gửi' : 'Đã xử lý'}: {progress.done} / {progress.total} chương</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {!!failures.length && <button disabled={busy} onClick={() => run('retry', failures)} className="border rounded-lg p-2 text-sm">Thử lại {failures.length} batch lỗi</button>}
        {!!conflicts.length && <div className="text-sm text-amber-800 max-h-40 overflow-auto"><p>{conflicts.length} chương chưa đồng bộ; nội dung Beta được giữ nguyên:</p>{conflicts.map(c => <p key={c.editorChapterId}>Chương Beta {c.betaChapterIndex}: {c.status} — {c.reason}</p>)}</div>}
        {betaBookId && <p className="text-xs break-all">Mã truyện LilyBeta: {betaBookId}</p>}
        <button onClick={() => setOpen(false)} className="border rounded-lg px-4 py-2 text-sm">Đóng</button>
      </div>
    </div>, document.body)}
  </>;
}
