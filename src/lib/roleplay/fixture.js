const scenes = Array.from({ length: 8 }, (_, index) => {
  const number = index + 1;
  const next = number < 8 ? `scene_${String(number + 1).padStart(2, "0")}` : null;
  const beats = [
    ["Tiếng chuông khai tiệc", "Bạn tỉnh lại trong thân phận một cung nữ đang bưng rượu vào đại điện."],
    ["Chén rượu thứ ba", "Một nha hoàn lạ mặt lén đổi vị trí hai chén rượu rồi biến mất sau rèm."],
    ["Ánh mắt của thị vệ", "Thị vệ trưởng chặn đường. Ánh mắt hắn dừng lại trên khay rượu trong tay bạn."],
    ["Mảnh giấy cháy dở", "Trong bếp, bạn tìm thấy một mảnh giấy có nét chữ của người trong phủ."],
    ["Lời cảnh báo", "Nữ chính đã vào điện. Bạn chỉ còn một cơ hội tiếp cận nàng trước khi nâng chén."],
    ["Hung thủ đổi kế hoạch", "Kẻ đứng sau nhận ra chén rượu đã bị động vào và ra hiệu cho đồng bọn."],
    ["Giữa đại điện", "Mọi ánh mắt đổ dồn về phía bạn khi một chiếc trâm độc rơi xuống nền đá."],
    ["Trước bình minh", "Sự thật chỉ còn cách một lời chứng. Bạn phải quyết định đánh cược vào ai."],
  ][index];
  return {
    id: `scene_${String(number).padStart(2, "0")}`, title: beats[0], text: beats[1],
    systemMessage: number === 1 ? "[TING!] Hệ Thống Sinh Tồn đã kích hoạt." : `Độ lệch cốt truyện đang được ghi nhận · Cảnh ${number}/8`,
    choices: [
      { id: `choice_${number}_a`, text: number === 8 ? "Đưa toàn bộ vật chứng cho thị vệ trưởng" : "Hành động thận trọng và thu thập thêm chứng cứ", effects: [{ op: "add_stat", key: "suspicion", value: -5 }, { op: "add_relationship", key: "guard", value: 8 }, ...(number === 8 ? [{ op: "set_flag", key: "truth_revealed" }] : [])], next },
      { id: `choice_${number}_b`, text: number === 8 ? "Tự mình vạch mặt hung thủ giữa đại điện" : "Can thiệp trực tiếp trước khi quá muộn", effects: [{ op: "add_stat", key: "suspicion", value: 12 }, { op: "add_stat", key: "plotDeviation", value: 10 }, ...(number === 8 ? [{ op: "set_flag", key: "heroic_gamble" }] : [])], next },
      { id: `choice_${number}_c`, text: number === 8 ? "Giữ im lặng để bảo toàn thân phận" : "Giả vờ không biết và quan sát phản ứng", effects: [{ op: "add_stat", key: "survival", value: -8 }, ...(number === 8 ? [{ op: "set_flag", key: "stayed_silent" }] : [])], next },
    ],
  };
});

export const SAMPLE_ROLEPLAY_PACK = {
  schemaVersion: 1, id: "sample-banquet", projectId: "preview", title: "Đêm Yến Định Mệnh",
  source: { chapterIds: [], chapterRangeLabel: "Kịch bản mẫu", analysisId: null },
  player: { role: "Nha hoàn vô danh của nữ phụ", canonicalCharacterId: null, isOriginalCharacter: true, loreRule: "Chỉ biết những gì tận mắt chứng kiến trong đêm yến." },
  system: { name: "Hệ Thống Sinh Tồn", personality: "Lạnh lùng, thực dụng, chỉ ưu tiên xác suất sống sót của ký chủ.", reliability: 78, activationText: "[TING!] Hệ Thống Sinh Tồn đã kích hoạt.", mainMission: "Ngăn nữ chính trúng độc và sống sót đến bình minh.", failureText: "Bị phát hiện là đồng phạm hoặc tử vong.", deviationMessages: [{ threshold: 30, message: "Cảnh báo: cốt truyện đã bắt đầu lệch khỏi nguyên tác." }, { threshold: 70, message: "...Ký chủ, dữ liệu nguyên tác đã mất hiệu lực. Tự cầu nhiều phúc." }] },
  stateSchema: {
    stats: { survival: { initial: 100, min: 0, max: 100 }, suspicion: { initial: 15, min: 0, max: 100 }, plotDeviation: { initial: 0, min: 0, max: 100 } },
    relationships: { guard: { initial: 0, min: -100, max: 100 } },
    flags: ["truth_revealed", "heroic_gamble", "stayed_silent"], items: [],
  },
  missions: {
    main: { id: "mission_main", type: "main", title: "Chén rượu định mệnh", description: "Ngăn nữ chính trúng độc và đưa chân tướng ra ánh sáng.", completeWhen: { op: "flag_present", key: "truth_revealed" }, failWhen: { op: "stat_lte", key: "survival", value: 0 }, rewardText: "Bạn đã sửa được tử cục trong đêm yến." },
    side: [{ id: "mission_guard", type: "side", title: "Một đồng minh đáng tin", description: "Khiến thị vệ trưởng tin tưởng bạn (thiện cảm ≥ 32).", completeWhen: { op: "relationship_gte", key: "guard", value: 32 }, rewardText: "Thị vệ trưởng sẵn sàng làm chứng cho bạn." }],
    hidden: [{ id: "mission_hidden", type: "hidden", title: "Người ngoài nguyên tác", description: "Phá kế hoạch bằng một con đường mà nguyên tác chưa từng ghi lại.", unlockWhen: { all: [{ op: "stat_gte", key: "plotDeviation", value: 30 }, { op: "stat_lt", key: "suspicion", value: 80 }] }, completeWhen: { op: "flag_present", key: "heroic_gamble" }, rewardText: "Bạn đã mở khóa một kết cục đặc biệt." }],
  },
  startSceneId: "scene_01", scenes,
  endings: [
    { id: "ending_he", type: "HE", priority: 100, title: "Bình minh không máu", text: "Vật chứng khép kín mọi ngả đường. Nữ chính sống sót và bạn được trả lại tự do.", when: { all: [{ op: "flag_present", key: "truth_revealed" }, { op: "relationship_gte", key: "guard", value: 20 }] } },
    { id: "ending_special", type: "SPECIAL", priority: 90, title: "Phá cục", text: "Canh bạc liều lĩnh khiến nguyên tác rẽ sang một con đường chưa ai từng biết.", when: { all: [{ op: "flag_present", key: "heroic_gamble" }, { op: "stat_lt", key: "suspicion", value: 90 }] } },
    { id: "ending_ne", type: "NE", priority: 50, title: "Người ngoài cuộc sống sót", text: "Bạn sống qua đêm, nhưng chân tướng vẫn chìm trong bóng tối.", when: { all: [{ op: "flag_present", key: "stayed_silent" }, { op: "stat_gt", key: "survival", value: 0 }] } },
    { id: "ending_be", type: "BE", priority: 1, title: "Kẻ thế mạng", text: "Không ai tin lời một nha hoàn không có chỗ dựa. Bạn trở thành lời giải tiện lợi nhất.", when: { any: [{ op: "stat_gte", key: "suspicion", value: 0 }] } },
  ],
  meta: { generatorVersion: "fixture-v1", promptVersions: {}, provider: "", model: "" },
};
