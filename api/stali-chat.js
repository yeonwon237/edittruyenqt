const ALLOWED_ORIGINS=new Set([
  "https://edittruyenqt.vercel.app",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5175",
  "http://localhost:5175",
]);

export default async function handler(req,res){
  const origin=req.headers.origin;
  if(origin&&ALLOWED_ORIGINS.has(origin))res.setHeader("Access-Control-Allow-Origin",origin);
  res.setHeader("Vary","Origin");res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");res.setHeader("Access-Control-Allow-Headers","Authorization,Content-Type");res.setHeader("Cache-Control","no-store");
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST")return res.status(405).json({error:{message:"Chỉ hỗ trợ POST."}});
  try{
    const authorization=String(req.headers.authorization||"");
    if(!authorization.startsWith("Bearer "))return res.status(401).json({error:{message:"Thiếu API Key STALI."}});
    if(req.body?.action==="models"){
      const upstream=await fetch("https://api.stali.vn/v1/models",{headers:{Authorization:authorization}});
      const text=await upstream.text();res.status(upstream.status);res.setHeader("Content-Type",upstream.headers.get("content-type")||"application/json");return res.send(text);
    }
    const endpoint=new URL("https://api.stali.vn/v1/chat/completions");
    const payload=req.body?.payload;
    if(!payload?.model||!Array.isArray(payload.messages))return res.status(400).json({error:{message:"Yêu cầu STALI không hợp lệ."}});
    const upstream=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",Authorization:authorization},body:JSON.stringify(payload)});
    const text=await upstream.text();res.status(upstream.status);res.setHeader("Content-Type",upstream.headers.get("content-type")||"application/json");return res.send(text);
  }catch(error){return res.status(400).json({error:{message:error.message||"Không gọi được STALI."}});}
}
