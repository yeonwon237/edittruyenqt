const QT_PATTERNS = [
  ["đối với", "với"], ["đối hắn", "với hắn"], ["đối nàng", "với nàng"],
  ["tiến hành", ""], ["có thể nói", ""], ["không thể không", "buộc phải"],
  ["không khỏi", "bất giác"], ["một phen", ""], ["cư nhiên", "vậy mà"],
  ["quả thực", "quả thật"], ["đem", ""], ["hướng về", "về phía"],
  ["ở dưới tình huống", "trong tình huống"], ["làm cho", "khiến"],
  ["đối phương", "người kia"], ["sau đó mới", "rồi mới"],
];

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalize = (value) => String(value || "").normalize("NFC").trim().toLocaleLowerCase("vi");

function lineContext(text, start, end) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const breakAt = text.indexOf("\n", end);
  const lineEnd = breakAt < 0 ? text.length : breakAt;
  return { context:text.slice(lineStart,lineEnd).trim(), line:text.slice(0,start).split("\n").length };
}

function issue(text, data) {
  return { id:`beta-${data.type}-${data.start}-${data.end}`, severity:"review", ...lineContext(text,data.start,data.end), ...data };
}

function sentenceRanges(text) {
  const ranges=[];
  const regex=/[^\n.!?…]+(?:[.!?…]+|(?=\n|$))/gu;
  for(const match of text.matchAll(regex)) {
    const raw=match[0], lead=raw.length-raw.trimStart().length;
    const value=raw.trim();
    if(value) ranges.push({start:match.index+lead,end:match.index+lead+value.length,value});
  }
  return ranges;
}

function scanRules(text, settings) {
  const learned=(settings?.rules||[]).map(rule=>[rule.find,rule.replace||""]);
  const ignored=new Set((settings?.ignored||[]).map(normalize));
  const seen=new Set();
  return [...QT_PATTERNS,...learned].flatMap(([find,replacement])=>{
    find=String(find||"").trim();
    if(!find||ignored.has(normalize(find))||seen.has(normalize(find)))return[];
    seen.add(normalize(find));
    const regex=new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(find)}(?![\\p{L}\\p{N}])`,"giu");
    return [...text.matchAll(regex)].map(match=>issue(text,{type:"qt",label:"Cụm mang dấu hiệu QT",value:match[0],replacement,start:match.index,end:match.index+match[0].length,safe:Boolean(replacement),detail:"Chỉ là cảnh báo văn phong; hãy duyệt theo ngữ cảnh."}));
  });
}

function scanRepeatedWords(text) {
  const regex=/(?<!\p{L})([\p{L}]{2,})([ \t,;:–—-]{1,4})\1(?!\p{L})/giu;
  return [...text.matchAll(regex)].map(match=>{
    const first=match[1];
    return issue(text,{type:"repeat",label:"Lặp từ sát nhau",value:match[0],replacement:first,start:match.index,end:match.index+match[0].length,safe:true,detail:`Từ “${first}” xuất hiện hai lần liên tiếp.`});
  });
}

function scanPunctuation(text) {
  const issues=[];
  for(const match of text.matchAll(/[!?.,;:]{2,}/gu)) {
    if(/^\.{3}$/.test(match[0]))continue;
    issues.push(issue(text,{type:"punctuation",label:"Dấu câu bất thường",value:match[0],replacement:match[0][0],start:match.index,end:match.index+match[0].length,safe:true,detail:"Nhiều dấu câu liền nhau có thể do lỗi trình bày."}));
  }
  for(const match of text.matchAll(/[ \t]+(?=[,.;:!?])/gu)) issues.push(issue(text,{type:"spacing",label:"Khoảng trắng trước dấu câu",value:match[0],replacement:"",start:match.index,end:match.index+match[0].length,safe:true,detail:"Có thể sửa an toàn."}));
  for(const match of text.matchAll(/[ \t]{2,}/gu)) issues.push(issue(text,{type:"spacing",label:"Thừa khoảng trắng",value:match[0],replacement:" ",start:match.index,end:match.index+match[0].length,safe:true,detail:"Có thể sửa an toàn."}));
  return issues;
}

// A short list of "classifier" nouns (dáng vẻ/thần sắc/ngữ khí/...) that
// natural Vietnamese almost always places AFTER the adjective describing
// them ("bộ dạng hung dữ", not "hung dữ bộ dạng"). QT/machine conversion
// frequently leaves the Chinese order (adjective-的-noun) untouched, which
// reads as exactly backwards. This only fires per-sentence as an AI
// candidate — never a "safe" auto-fix — because the same shape can also be
// a perfectly normal verb+object ("nhìn bộ dạng...", "của hắn"), so
// QT_ORDER_STOPWORDS below exists specifically to bail out of those.
const QT_ORDER_CLASSIFIER_NOUNS = [
  "bộ dạng", "dáng vẻ", "dáng bộ", "thần sắc", "thần tình", "thần thái",
  "ngữ khí", "giọng điệu", "ánh mắt", "vẻ mặt", "mô dạng", "khẩu khí",
  "biểu tình", "tư thế", "thái độ",
];
const QT_ORDER_STOPWORDS = new Set([
  "nhìn", "thấy", "xem", "ngắm", "liếc", "quan sát", "để ý", "chú ý",
  "phát hiện", "nhận ra", "của", "là", "có", "một", "này", "đó", "kia",
  "cái", "con", "người", "và", "với", "cứ", "đang", "đã", "sẽ", "rất",
  "khá", "hơi", "quá", "tỏ", "tỏ ra", "lộ", "lộ ra", "giữ", "mang", "toát",
]);
const QT_ORDER_REGEX = new RegExp(
  `(?<![\\p{L}])([\\p{L}]{2,}(?:\\s+[\\p{L}]{2,}){0,1})\\s+(${QT_ORDER_CLASSIFIER_NOUNS.map(escapeRegex).join("|")})(?![\\p{L}])`,
  "giu"
);
function hasQtWordOrder(sentence) {
  for (const match of sentence.matchAll(QT_ORDER_REGEX)) {
    const lead = match[1].split(/\s+/).pop().toLocaleLowerCase("vi");
    if (!QT_ORDER_STOPWORDS.has(lead)) return true;
  }
  return false;
}

function scanStructure(text, settings) {
  const issues=[];
  const longLimit=Math.max(100,Number(settings?.longSentence)||180);
  sentenceRanges(text).forEach(sentence=>{
    if(sentence.value.length>longLimit)issues.push(issue(text,{type:"long-sentence",label:"Câu quá dài, khó theo dõi",value:sentence.value,replacement:"",start:sentence.start,end:sentence.end,safe:false,aiCandidate:true,detail:`Câu dài ${sentence.value.length} ký tự; nên xem lại nhịp và chủ ngữ.`}));
    const commas=(sentence.value.match(/,/g)||[]).length;
    if(commas>=5&&sentence.value.length>90)issues.push(issue(text,{type:"heavy-sentence",label:"Câu nhiều vế",value:sentence.value,replacement:"",start:sentence.start,end:sentence.end,safe:false,aiCandidate:true,detail:`Câu có ${commas} dấu phẩy; có thể mang cấu trúc Convert hoặc thiếu điểm ngắt.`}));
    if(hasQtWordOrder(sentence.value))issues.push(issue(text,{type:"qt-order",label:"Câu nghi cấu trúc dịch QT (thứ tự từ)",value:sentence.value,replacement:"",start:sentence.start,end:sentence.end,safe:false,aiCandidate:true,detail:`Tính từ đứng ngay trước danh từ như "bộ dạng/dáng vẻ/thần sắc"... thường là dấu hiệu dịch máy; câu tự nhiên hay đảo thứ tự (VD: "bộ dạng hung dữ" thay vì "hung dữ bộ dạng").`}));
  });
  let offset=0;
  text.split("\n").forEach(line=>{
    const value=line.trim();
    if(value.length>Math.max(500,Number(settings?.longParagraph)||900)) {
      const start=offset+line.indexOf(value);
      issues.push(issue(text,{type:"paragraph",label:"Đoạn quá dài",value,replacement:"",start,end:start+value.length,safe:false,aiCandidate:true,detail:"Nên kiểm tra xuống đoạn và tách lời thoại."}));
    }
    offset+=line.length+1;
  });
  const open=(text.match(/[“]/g)||[]).length, close=(text.match(/[”]/g)||[]).length;
  if(open!==close) {
    const pos=Math.max(0,text.lastIndexOf(open>close?"“":"”"));
    issues.push(issue(text,{
      type:"quotes", label:"Ngoặc kép không cân", value:text[pos]||"“",
      replacement:"", start:pos, end:pos+1, safe:false,
      detail:`Có ${open} ngoặc mở và ${close} ngoặc đóng.`
    }));
  }
  return issues;
}

export function runBetaCheck(text,{settings={}}={}) {
  const source=String(text||"");
  const all=[...scanRules(source,settings),...scanRepeatedWords(source),...scanPunctuation(source),...scanStructure(source,settings)];
  const occupied=new Set();
  return all.filter(item=>{const key=`${item.start}:${item.end}`;if(occupied.has(key))return false;occupied.add(key);return true;}).sort((a,b)=>a.start-b.start||a.end-b.end);
}

export function applyBetaSuggestion(text,item,replacement) {
  const source=String(text||"");
  if(source.slice(item.start,item.end)!==item.value)throw new Error("Vị trí Beta đã thay đổi. Hãy quét lại.");
  return source.slice(0,item.start)+String(replacement||"")+source.slice(item.end);
}

export function betaCandidatePayload(text,issues,max=16) {
  const source=String(text||"");
  const candidates=[];
  const keys=new Set();
  (issues||[]).filter(item=>item.aiCandidate||!item.safe).forEach(item=>{
    if(candidates.length>=max)return;
    const before=Math.max(0,source.lastIndexOf("\n",Math.max(0,item.start-1))+1);
    const afterBreak=source.indexOf("\n",item.end);
    const after=afterBreak<0?source.length:afterBreak;
    const fullContext=source.slice(before,after).trim();
    const relative=Math.max(0,item.start-before);
    const context=fullContext.length<=520?fullContext:fullContext.slice(Math.max(0,relative-240),Math.max(0,relative-240)+520);
    const key=normalize(context);
    if(!context||keys.has(key))return;keys.add(key);
    candidates.push({id:`B${candidates.length+1}`,start:item.start,end:item.end,text:item.value,context});
  });
  return candidates;
}
