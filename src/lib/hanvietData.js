// Seed dictionaries for the built-in ("tự thân") Chinese → Vietnamese draft
// translator. Bundled as a static JS module so it ships once with the app
// build (no DB storage, no per-use network/egress cost).
//
// HANVIET_WORDS: pronouns, grammar particles, connectors and "false friend"
// compounds — cases where the correct Vietnamese word is a *meaning*
// translation, not the Sino-Vietnamese *sound* reading of the characters.
// Checked first, longest match wins. A value of "" means "drop this token"
// (e.g. 的/了 grammatical particles that have no standalone Vietnamese word).
//
// HANVIET_CHARS: single-character Hán-Việt sound readings, used as the
// fallback for any character not covered by HANVIET_WORDS or the project
// glossary. This is how classic "QT" (Quick Translate) conversion works —
// most Sino-Vietnamese vocabulary is literally the Hán-Việt reading of each
// Chinese character read in sequence.
//
// This is a starter/seed set focused on high-frequency function words and
// common xianxia/wuxia web-novel vocabulary — it is NOT exhaustive. Coverage
// grows over time by extending these tables and, per project, via the
// existing Glossary (which always takes priority over both tables below).

export const HANVIET_WORDS = {
  // Pronouns & determiners
  "我": "ta",
  "我们": "chúng ta",
  "你": "ngươi",
  "你们": "các ngươi",
  "您": "ngài",
  "他": "hắn",
  "他们": "bọn hắn",
  "她": "nàng",
  "她们": "bọn nàng",
  "它": "nó",
  "它们": "chúng nó",
  "谁": "ai",
  "自己": "chính mình",
  "大家": "mọi người",
  "别人": "người khác",
  "这": "này",
  "这个": "cái này",
  "这些": "những cái này",
  "这里": "nơi này",
  "这样": "như vậy",
  "那": "kia",
  "那个": "cái kia",
  "那些": "những cái kia",
  "那里": "nơi kia",
  "那样": "như thế",
  "什么": "cái gì",
  "什么样": "kiểu gì",
  "怎么": "thế nào",
  "怎么样": "như thế nào",
  "怎样": "như thế nào",
  "为什么": "vì sao",
  "哪": "đâu",
  "哪里": "nơi đâu",
  "哪个": "cái nào",
  "多少": "bao nhiêu",
  "几": "mấy",

  // Copula / existence / negation
  "是": "là",
  "不是": "không phải",
  "有": "có",
  "没有": "không có",
  "没": "không",
  "不": "không",
  "别": "đừng",
  "不要": "đừng",
  "不能": "không thể",
  "不会": "sẽ không",
  "不用": "không cần",

  // Adverbs / connectors
  "也": "cũng",
  "都": "đều",
  "很": "rất",
  "非常": "vô cùng",
  "十分": "vô cùng",
  "太": "quá",
  "更": "càng",
  "最": "nhất",
  "还": "vẫn",
  "还是": "vẫn là",
  "又": "lại",
  "再": "lại",
  "就": "liền",
  "才": "mới",
  "只": "chỉ",
  "只是": "chỉ là",
  "只有": "chỉ có",
  "一直": "luôn luôn",
  "一定": "nhất định",
  "一起": "cùng nhau",
  "一样": "giống nhau",
  "突然": "đột nhiên",
  "忽然": "đột nhiên",
  "立刻": "lập tức",
  "马上": "lập tức",
  "终于": "cuối cùng",
  "渐渐": "dần dần",
  "慢慢": "từ từ",
  "已经": "đã",
  "正在": "đang",
  "在": "đang",
  "和": "và",
  "跟": "cùng với",
  "与": "cùng",
  "或者": "hoặc là",
  "但是": "nhưng",
  "可是": "nhưng mà",
  "不过": "nhưng",
  "如果": "nếu như",
  "要是": "nếu như",
  "虽然": "tuy rằng",
  "因为": "bởi vì",
  "所以": "cho nên",
  "然后": "sau đó",
  "然而": "tuy nhiên",
  "而且": "hơn nữa",
  "于是": "thế là",
  "可以": "có thể",
  "能": "có thể",
  "会": "sẽ",
  "要": "muốn",
  "想": "nghĩ",
  "需要": "cần",
  "必须": "nhất định phải",
  "应该": "nên",

  // Common verbs (function-like, high frequency)
  "说": "nói",
  "说道": "nói",
  "问": "hỏi",
  "问道": "hỏi",
  "回答": "trả lời",
  "知道": "biết",
  "认识": "quen biết",
  "明白": "hiểu rõ",
  "以为": "tưởng rằng",
  "觉得": "cảm thấy",
  "希望": "hy vọng",
  "决定": "quyết định",
  "开始": "bắt đầu",
  "继续": "tiếp tục",
  "停止": "dừng lại",
  "结束": "kết thúc",

  // Time words
  "现在": "hiện tại",
  "以前": "trước đây",
  "以后": "sau này",
  "刚才": "vừa rồi",
  "刚刚": "vừa mới",
  "今天": "hôm nay",
  "昨天": "hôm qua",
  "明天": "ngày mai",
  "晚上": "buổi tối",
  "早上": "buổi sáng",
  "中午": "buổi trưa",

  // "False friend" compounds — character-by-character reading would mislead
  "东西": "đồ vật",
  "小心": "cẩn thận",
  "可怜": "đáng thương",
  "可惜": "đáng tiếc",
  "其实": "kỳ thực",
  "其中": "trong đó",
  "没关系": "không sao",
  "对不起": "xin lỗi",
  "谢谢": "cảm ơn",
  "不客气": "không có gì",
  "天才": "thiên tài",
  "漂亮": "xinh đẹp",
  "厉害": "lợi hại",
  "麻烦": "phiền phức",
  "意思": "ý tứ",
  "样子": "dáng vẻ",
  "时候": "lúc",
  "地方": "nơi",
  "点头": "gật đầu",
  "摇头": "lắc đầu",
  "喝酒": "uống rượu",
  "瞧见": "nhìn thấy",
  "看见": "nhìn thấy",
  "外面": "bên ngoài",
  "里面": "bên trong",
  "无奈": "đành phải",
  "温暖": "ấm áp",
  "凑近": "lại gần",
  "一些": "một ít",
  "有些": "có chút",
  "耍无赖": "giở trò lưu manh",

  // Corrections to specific wrong/misleading entries found in the bundled
  // crowd dataset (overrides the base VietPhrase entry, which loses ties).
  "学霸": "học bá",
  "桃花运": "vận đào hoa",
  "桃花不少": "vận đào hoa không ít",

  // Thành ngữ / cụm cố định 4+ ký tự thường gặp trong tiên hiệp, ngôn tình,
  // đô thị... — bộ từ điển gốc chỉ có khóa dài 2-3 ký tự nên các cụm này
  // trước giờ luôn bị đọc từng chữ một cách vô nghĩa. Bản dịch nghĩa dưới
  // đây ưu tiên nghĩa bóng/thành ngữ tương đương thay vì dịch sát chữ.
  "波谲云诡": "biến ảo khôn lường",
  "一见钟情": "vừa gặp đã yêu",
  "天翻地覆": "trời long đất lở",
  "无可奈何": "đành bó tay",
  "不由自主": "không tự chủ được",
  "心花怒放": "mừng như mở cờ trong bụng",
  "恍然大悟": "chợt bừng tỉnh hiểu ra",
  "大吃一惊": "giật mình kinh hãi",
  "目瞪口呆": "trợn mắt há hốc mồm",
  "哭笑不得": "dở khóc dở cười",
  "面面相觑": "nhìn nhau ngơ ngác",
  "不知所措": "luống cuống không biết làm sao",
  "一言不发": "không nói một lời",
  "心不在焉": "tâm trí để đâu đâu",
  "全神贯注": "dồn hết tâm trí",
  "全力以赴": "dốc hết toàn lực",
  "千钧一发": "nghìn cân treo sợi tóc",
  "一模一样": "giống hệt nhau",
  "无地自容": "xấu hổ không biết chui vào đâu",
  "不寒而栗": "rùng mình ớn lạnh",
  "心惊肉跳": "giật mình thon thót",
  "眼疾手快": "nhanh mắt nhanh tay",
  "手忙脚乱": "tay chân rối bời",
  "若无其事": "thản nhiên như không có chuyện gì",
  "理所当然": "lẽ dĩ nhiên",
  "莫名其妙": "chẳng hiểu vì sao",
  "不假思索": "không cần suy nghĩ",
  "突如其来": "đột nhiên ập đến",
  "措手不及": "trở tay không kịp",
  "深不可测": "thâm sâu khó lường",
  "遥不可及": "xa vời khó với tới",
  "迫不及待": "nóng lòng không đợi được",
  "情不自禁": "không kìm được lòng mình",
  "忍无可忍": "nhẫn không nổi nữa",
  "无边无际": "mênh mông vô tận",
  "顶天立地": "đội trời đạp đất",
  "生死攸关": "quan hệ đến sinh tử",
  "势不可挡": "thế không thể cản",
  "惊天动地": "kinh thiên động địa",
  "力挽狂澜": "xoay chuyển cục diện",
  "一诺千金": "một lời hứa đáng nghìn vàng",
  "天壤之别": "khác một trời một vực",
  "与众不同": "khác hẳn mọi người",
  "出乎意料": "ngoài dự đoán",
  "一如既往": "vẫn như trước nay",
  "无独有偶": "không chỉ một mà còn có",
  "恩将仇报": "lấy oán trả ơn",
  "咬牙切齿": "nghiến răng nghiến lợi",
  "泪流满面": "nước mắt đầm đìa",
  "怒火中烧": "lửa giận bốc lên",

  // Cụm dẫn chuyện / đệm câu kiểu văn bản QT hay gặp, trước giờ bị dịch
  // từng chữ (却=lại, 说=nói -> "却说" bị tách rời thay vì đọc như một cụm
  // dẫn chuyện).
  "且看": "hãy xem",
  "且说": "hãy nói về",
  "却说": "lại nói",
  "却道": "lại nói",
  "却见": "lại thấy",
  "话说": "nói về",
  "只见": "chỉ thấy",
  "不由得": "không khỏi",
  "忍不住": "không nhịn được",
  "谁知": "nào ngờ",
  "不料": "không ngờ",

  // Common sentence-final / colloquial particles
  "吧": "đi",
  "个": "",
  "把": "",
  "些": "",

  // Grammatical particles with no standalone Vietnamese word — drop them
  "的": "",
  "了": "",
  "着": "",
  "吗": "",
  "呢": "",
  "啦": "",
};

export const HANVIET_CHARS = {
  // Numbers. "一" defaults to "một" (its overwhelmingly common use as a
  // cardinal/indefinite-article "a/one" before a noun in narrative prose)
  // rather than "nhất" (its formal/ordinal reading, e.g. "đệ nhất") — add a
  // glossary override per-project if a text needs the ordinal reading instead.
  "一": "một", "二": "nhị", "三": "tam", "四": "tứ", "五": "ngũ",
  "六": "lục", "七": "thất", "八": "bát", "九": "cửu", "十": "thập",
  "百": "bách", "千": "thiên", "万": "vạn", "亿": "ức", "零": "linh", "两": "lưỡng",

  // Family
  "父": "phụ", "母": "mẫu", "兄": "huynh", "弟": "đệ", "姐": "tỷ",
  "妹": "muội", "子": "tử", "女": "nữ", "儿": "nhi", "孙": "tôn",
  "夫": "phu", "妻": "thê", "爷": "gia", "奶": "nãi", "叔": "thúc",
  "伯": "bá", "姑": "cô", "姨": "di", "舅": "cữu",

  // Body
  "头": "đầu", "手": "thủ", "脚": "cước", "眼": "nhãn", "耳": "nhĩ",
  "鼻": "tị", "口": "khẩu", "心": "tâm", "血": "huyết", "骨": "cốt",
  "肉": "nhục", "皮": "bì", "发": "phát",

  // Nature
  "天": "thiên", "地": "địa", "日": "nhật", "月": "nguyệt", "星": "tinh",
  "风": "phong", "雨": "vũ", "雪": "tuyết", "云": "vân", "山": "sơn",
  "水": "thủy", "火": "hỏa", "土": "thổ", "木": "mộc", "石": "thạch",
  "花": "hoa", "草": "thảo", "树": "thụ", "叶": "diệp", "林": "lâm",

  // Time
  "年": "niên", "时": "thời", "分": "phân", "秒": "miểu", "早": "tảo",
  "晚": "vãn", "今": "kim", "明": "minh", "昨": "tạc", "古": "cổ",

  // Verbs
  "看": "khán", "听": "thính", "走": "tẩu", "跑": "bào", "坐": "tọa",
  "站": "trạm", "躺": "thảng", "笑": "tiếu", "哭": "khốc", "打": "đả",
  "杀": "sát", "死": "tử", "生": "sinh", "活": "hoạt", "来": "lai",
  "去": "khứ", "进": "tiến", "出": "xuất", "上": "thượng", "下": "hạ",
  "开": "khai", "关": "quan", "拿": "nã", "放": "phóng", "给": "cấp",
  "取": "thủ", "问": "vấn", "答": "đáp", "想": "tưởng", "知": "tri",
  "道": "đạo", "白": "bạch", "记": "ký", "忘": "vong", "喜": "hỷ",
  "欢": "hoan", "爱": "ái", "恨": "hận", "怕": "phạ", "惊": "kinh",
  "讶": "nhạ", "修": "tu", "炼": "luyện", "到": "đáo", "动": "động",

  // Adjectives
  "大": "đại", "小": "tiểu", "多": "đa", "少": "thiểu", "高": "cao",
  "低": "đê", "长": "trường", "短": "đoản", "快": "khoái", "慢": "mạn",
  "好": "hảo", "坏": "hoại", "美": "mỹ", "丑": "xú", "强": "cường",
  "弱": "nhược", "新": "tân", "旧": "cựu", "老": "lão", "轻": "khinh",
  "冷": "lãnh", "热": "nhiệt", "远": "viễn", "近": "cận", "深": "thâm",
  "浅": "thiển", "暗": "ám", "重": "trọng",

  // Xianxia / wuxia genre vocabulary
  "武": "võ", "功": "công", "内": "nội", "力": "lực", "真": "chân",
  "气": "khí", "灵": "linh", "仙": "tiên", "妖": "yêu", "魔": "ma",
  "鬼": "quỷ", "神": "thần", "佛": "phật", "法": "pháp", "术": "thuật",
  "剑": "kiếm", "刀": "đao", "枪": "thương", "棍": "côn", "拳": "quyền",
  "掌": "chưởng", "指": "chỉ", "爪": "trảo", "境": "cảnh", "界": "giới",
  "者": "giả", "徒": "đồ", "师": "sư", "门": "môn", "派": "phái",
  "帮": "bang", "族": "tộc", "家": "gia", "宫": "cung", "主": "chủ",
  "城": "thành", "王": "vương", "朝": "triều", "皇": "hoàng", "帝": "đế",
  "后": "hậu", "将": "tướng", "军": "quân", "士": "sĩ", "兵": "binh",
  "战": "chiến", "勇": "dũng", "英": "anh", "雄": "hùng", "敌": "địch",
  "朋": "bằng", "友": "hữu", "江": "giang", "湖": "hồ", "恩": "ân",
  "怨": "oán", "情": "tình", "仇": "cừu", "复": "phục", "报": "báo",
  "宝": "bảo", "物": "vật", "丹": "đan", "药": "dược", "妙": "diệu",
  "洞": "động", "府": "phủ", "秘": "bí", "禁": "cấm", "遗": "di",
  "迹": "tích", "传": "truyền", "器": "khí", "圣": "thánh", "尊": "tôn",
  "说": "thuyết",

  // Grammar / structure words and common narrative vocabulary that turned
  // up missing when testing against a real chapter excerpt.
  "第": "đệ", "章": "chương", "中": "trung", "全": "toàn", "完": "hoàn",
  "之": "chi", "其": "kỳ", "处": "xử", "起": "khởi", "外": "ngoại",
  "面": "diện", "见": "kiến", "音": "âm", "量": "lượng", "赐": "tứ",
  "良": "lương", "缘": "duyên", "幸": "hạnh", "福": "phúc", "护": "hộ",
  "暖": "noãn", "衣": "y", "领": "lĩnh", "体": "thể", "容": "dung",
  "易": "dị", "凉": "lương", "酒": "tửu", "毯": "thảm", "背": "bối",
  "椅": "ỷ", "仰": "ngưỡng", "提": "đề", "畅": "sướng", "靠": "kháo",
  "点": "điểm",
  // A few characters read more usefully by meaning than by formal Hán-Việt
  // sound here (the formal reading exists but is obscure/rarely used and
  // would confuse more than help in a draft translation).
  "瞧": "nhìn", "拉": "kéo", "喝": "uống", "倒": "lại", "盖": "đắp",
  "阿": "A", "乖": "ngoan", "疼": "đau", "搂": "ôm",

  // More gaps found from a second real-chapter test pass — very common
  // characters (人, 回, 感, 极...) that should have been here from the start.
  "顺": "thuận", "话": "thoại", "无": "vô", "赖": "lại", "算": "toán",
  "身": "thân", "软": "nhuyễn", "奈": "nại", "却": "khước", "往": "vãng",
  "某": "mỗ", "人": "nhân", "怀": "hoài", "伸": "thân", "回": "hồi",
  "抱": "bão", "住": "trụ", "腰": "yêu", "温": "ôn", "依": "y",
  "极": "cực", "侧": "trắc", "感": "cảm", "叹": "thán", "里": "lý",

  // Common Chinese surnames — Hán-Việt character-by-character reading is
  // the traditional convention for rendering Chinese names in Vietnamese,
  // so these help even without a per-project Glossary entry. For a name
  // that recurs often, still add it to the Glossary for a locked, exact
  // rendering across the whole project.
  "丁": "đinh", "羽": "vũ", "莲": "liên", "陈": "trần", "李": "lý",
  "张": "trương", "刘": "lưu", "杨": "dương", "赵": "triệu", "周": "chu",
  "吴": "ngô", "徐": "từ", "马": "mã", "朱": "chu", "胡": "hồ",
  "郑": "trịnh", "谢": "tạ", "何": "hà", "苏": "tô", "韩": "hàn",
};

// Chinese punctuation → Latin/Vietnamese punctuation.
export const PUNCT_MAP = {
  "，": ", ",
  "。": ". ",
  "！": "! ",
  "？": "? ",
  "；": "; ",
  "：": ": ",
  "、": ", ",
  "“": "\"",
  "”": "\"",
  "‘": "'",
  "’": "'",
  "（": "(",
  "）": ")",
  "《": "«",
  "》": "»",
  "—": "-",
  "…": "...",
  "「": "\"",
  "」": "\"",
};
