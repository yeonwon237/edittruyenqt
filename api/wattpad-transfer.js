import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const MAX_BYTES = 4 * 1024 * 1024;
const TTL_HOURS = 24;
const allowedOrigins = new Set(["https://edittruyenqt.vercel.app", "https://www.wattpad.com"]);
const cleanCode = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashCode = (code) => crypto.createHash("sha256").update(cleanCode(code)).digest("hex");
const makeCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(10);
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
};

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Máy chủ chưa cấu hình SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth:{ persistSession:false, autoRefreshToken:false } });
}

async function requireUser(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const token = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !anonKey || !token) throw new Error("Bạn cần đăng nhập EditTruyenQT để tạo mã.");
  const auth = createClient(url, anonKey, { auth:{ persistSession:false, autoRefreshToken:false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) throw new Error("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại EditTruyenQT.");
  return data.user;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error:"Chỉ hỗ trợ POST." });
  try {
    const action = req.body?.action;
    if (action === "create") {
      const user = await requireUser(req);
      const payload = req.body?.package;
      if (payload?.schema !== "edittruyenqt-wattpad-package" || payload?.version !== 1 || !Array.isArray(payload.parts) || !payload.parts.length) throw new Error("Gói Wattpad không hợp lệ.");
      const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
      if (bytes > MAX_BYTES) throw new Error("Gói lớn hơn 4 MB; hãy dùng phương thức tải file.");
      const code = makeCode();
      const expiresAt = new Date(Date.now() + TTL_HOURS * 3600_000).toISOString();
      const { error } = await serviceClient().from("wattpad_transfers").insert({ code_hash:hashCode(code), user_id:user.id, payload, expires_at:expiresAt });
      if (error) throw error;
      return res.status(200).json({ code, expiresAt });
    }
    if (action === "redeem") {
      const code = cleanCode(req.body?.code);
      if (code.length !== 10) throw new Error("Mã chuyển không hợp lệ.");
      const { data, error } = await serviceClient().from("wattpad_transfers").delete().eq("code_hash", hashCode(code)).is("claimed_at", null).gt("expires_at", new Date().toISOString()).select("payload").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Mã không tồn tại, đã dùng hoặc đã hết hạn.");
      return res.status(200).json({ package:data.payload });
    }
    throw new Error("Thao tác không hợp lệ.");
  } catch (error) {
    return res.status(400).json({ error:error.message || "Không xử lý được mã chuyển." });
  }
}
