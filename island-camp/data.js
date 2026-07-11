// ===== 島キャンプ思い出マップ : 初期データ（シード） =====
// ここを編集すれば初期表示の島・内容を増やせます。
// アプリ上で追加・編集した内容は端末のローカルに保存され、こちらより優先されます。
// 写真は端末内(IndexedDB)に保存されるため、ここには書きません。

window.SEED_ISLANDS = [
  // ---- 伊豆七島（東京都） ----
  {
    id: "izu-oshima", name: "大島", region: "伊豆諸島", pref: "東京都",
    lat: 34.75, lng: 139.36,
    firstVisit: "2013", visits: 2, years: [2013, 2025], fav: true,
    summary: "三原山と椿。伊豆諸島の玄関口。ジェット船で最短。",
    photos: [],
    shops: [
      { name: "べっこう寿司の店", type: "食事", note: "島唐辛子醤油の漬け（べっこう）が名物" }
    ],
    knowledge: [
      "竹芝からジェット船で約1時間45分、夜行大型船もある",
      "三原山は1986年の噴火の溶岩流がそのまま残る"
    ],
    tips: [
      "レンタルバイクがあると島内移動が圧倒的に楽",
      "椿シーズンは1〜3月、椿まつりで賑わう"
    ],
    logs: [
      { date: "2013", text: "利島・式根島とあわせて訪問。2025年に再訪。" }
    ]
  },
  {
    id: "niijima", name: "新島", region: "伊豆諸島", pref: "東京都",
    lat: 34.37, lng: 139.27,
    firstVisit: "2006", visits: 2, years: [2006, 2008], fav: true,
    summary: "白い砂浜とコーガ石。サーフィンと無料の天然温泉。",
    photos: [],
    shops: [],
    knowledge: [
      "コーガ石（抗火石）は世界でも新島とイタリアでしか採れない",
      "羽伏浦海岸は東洋一とも言われる白砂のビーチ"
    ],
    tips: [
      "湯の浜露天温泉は24時間無料・水着着用",
      "夏は本村のキャンプ場が便利、買い出しは本村で済ませる"
    ],
    logs: []
  },
  {
    id: "kozushima", name: "神津島", region: "伊豆諸島", pref: "東京都",
    lat: 34.20, lng: 139.13,
    firstVisit: "2005", visits: 2, years: [2005, 2024], fav: false,
    summary: "天上山と天の川。星空保護区に認定された島。",
    photos: [],
    shops: [],
    knowledge: [
      "2020年に日本初の「星空保護区」に認定",
      "天上山(572m)は数時間で登れて山頂は別世界"
    ],
    tips: [
      "多幸湾の三浦キャンプ場は海が目の前",
      "水が豊富な島。湧き水『多幸湧水』はそのまま飲める"
    ],
    logs: []
  },
  {
    id: "miyakejima", name: "三宅島", region: "伊豆諸島", pref: "東京都",
    special: "miyake",
    lat: 34.08, lng: 139.53,
    firstVisit: "2010", visits: 1, years: [2010], fav: true,
    summary: "雄山がそびえる火山の島。2010年に訪問、2026年に再訪・キャンプ予定。スクロールで横顔（火山プロファイル）が見えます。",
    photos: [],
    shops: [],
    knowledge: [
      "雄山（おやま・775m）は活火山。2000年噴火で全島避難、2005年に避難指示解除",
      "島を一周する都道212号は周囲約30km、車・原付で1〜2時間",
      "野鳥の宝庫。アカコッコ（国の天然記念物）など固有種が見られる"
    ],
    tips: [
      "竹芝桟橋から東海汽船の大型船で約6.5時間（夜行）。調布からの飛行機もある",
      "港は風向きで三池/錆ヶ浜（伊ヶ谷）/阿古を使い分け。出航前に着岸港を要確認",
      "火山ガスに注意。雄山周辺は規制エリアあり、最新情報を確認"
    ],
    logs: [
      { date: "2010", text: "はじめて三宅島へ。雄山の火山島の迫力。" }
    ],
    miyakeVisited: [],
    miyakePlaces: []
  },
  {
    id: "hachijojima", name: "八丈島", region: "伊豆諸島", pref: "東京都",
    lat: 33.11, lng: 139.79,
    firstVisit: "2007", visits: 3, years: [2007, 2009, 2015], fav: true,
    summary: "ひょうたん型の常春の島。八丈富士と地熱・温泉。",
    photos: [],
    shops: [
      { name: "藍ヶ江の漁港食堂", type: "食事", note: "島寿司と明日葉の天ぷら" }
    ],
    knowledge: [
      "羽田から飛行機で約55分、伊豆諸島で最も南の有人定期便",
      "八丈富士(854m)のお鉢巡りは1周約1時間"
    ],
    tips: [
      "底土野営場は港に近く飛行機・船どちらでもアクセス良好",
      "ふれあいの湯など温泉が点在、レンタカー推奨"
    ],
    logs: []
  },

  // ---- 鹿児島の島 ----
  {
    id: "yakushima", name: "屋久島", region: "鹿児島の島", pref: "鹿児島県",
    lat: 30.34, lng: 130.51,
    firstVisit: "2019", visits: 1, years: [2019], fav: true,
    summary: "縄文杉と苔の森。月のうち35日雨が降ると言われる。",
    photos: [],
    shops: [],
    knowledge: [
      "世界自然遺産。標高2000m近い山が海から立ち上がる",
      "白谷雲水峡は『もののけ姫』の森のモデルとされる"
    ],
    tips: [
      "縄文杉は往復20km・10時間級、早朝出発が必須",
      "雨具は上下セパレートの本格的なものを。樹皮の苔は雨で輝く"
    ],
    logs: []
  },
  {
    id: "amami-oshima", name: "奄美大島", region: "鹿児島の島", pref: "鹿児島県",
    lat: 28.37, lng: 129.49,
    firstVisit: "2016", visits: 1, years: [2016], fav: false,
    summary: "マングローブと金作原の原生林。鶏飯と黒糖焼酎。",
    photos: [],
    shops: [
      { name: "鶏飯の老舗", type: "食事", note: "ご飯に具をのせ鶏スープをかける郷土料理" }
    ],
    knowledge: [
      "2021年に世界自然遺産に登録",
      "アマミノクロウサギなど固有種の宝庫"
    ],
    tips: [
      "住用川のマングローブはカヌーで漕ぎ進める",
      "ハブに注意。藪や夜間の移動は気をつける"
    ],
    logs: []
  },

  // ---- 沖縄の島 ----
  {
    id: "ishigaki", name: "石垣島", region: "沖縄の島", pref: "沖縄県",
    lat: 24.40, lng: 124.16,
    firstVisit: "2011", visits: 1, years: [2011], fav: true,
    summary: "八重山の拠点。川平湾のグラスボートと満点の星。",
    photos: [],
    shops: [],
    knowledge: [
      "八重山諸島(竹富・西表・小浜・波照間)へのフェリー拠点",
      "南十字星が見える数少ない日本の島"
    ],
    tips: [
      "離島ターミナルから各島へ。日帰りも組み合わせやすい",
      "米原ビーチはシュノーケルの定番、リーフカレントに注意"
    ],
    logs: []
  },
  {
    id: "iriomote", name: "西表島", region: "沖縄の島", pref: "沖縄県",
    lat: 24.35, lng: 123.80,
    firstVisit: "", visits: 0, years: [], fav: false,
    summary: "島の9割が亜熱帯ジャングル。イリオモテヤマネコの島。",
    photos: [],
    shops: [],
    knowledge: [
      "面積の約90%が亜熱帯の原生林",
      "ピナイサーラの滝は沖縄県最大の落差"
    ],
    tips: [
      "カヌー＋トレッキングのツアーで滝上まで行ける",
      "夜は灯りが少なく星が濃い。懐中電灯必携"
    ],
    logs: []
  },

  // ---- 新潟の島 ----
  {
    id: "sado", name: "佐渡島", region: "新潟の島", pref: "新潟県",
    lat: 38.05, lng: 138.40,
    firstVisit: "2014", visits: 1, years: [2014], fav: false,
    summary: "たらい舟と金山。離島とは思えない大きさと歴史。",
    photos: [],
    shops: [],
    knowledge: [
      "離島では沖縄本島に次ぐ面積",
      "佐渡金山は江戸幕府の財政を支えた"
    ],
    tips: [
      "新潟港からカーフェリーで約2.5時間、車を載せると自由度が高い",
      "宿根木の集落と矢島・経島のたらい舟は外せない"
    ],
    logs: []
  },

  // ===== Index登録（地図ピンのみ。詳細は順次拡充） =====
  // ---- 伊豆諸島（東京都）----
  {
    id: "toshima", name: "利島", region: "伊豆諸島", pref: "東京都",
    lat: 34.52, lng: 139.28,
    firstVisit: "2013", visits: 1, years: [2013], fav: false,
    summary: "椿に覆われた小さな円錐の島。2013年訪問。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  },
  {
    id: "shikinejima", name: "式根島", region: "伊豆諸島", pref: "東京都",
    lat: 34.32, lng: 139.21,
    firstVisit: "2004", visits: 3, years: [2004, 2008, 2013], fav: true,
    summary: "新島の隣。入り組んだ海岸線と無料の海中温泉。すべてはここから始まった。",
    photos: [], shops: [], knowledge: [], tips: [],
    logs: [
      { date: "2004", text: "初めての島キャンプ。すべてここから始まった。" }
    ]
  },
  {
    id: "mikurajima", name: "御蔵島", region: "伊豆諸島", pref: "東京都",
    lat: 33.88, lng: 139.60,
    firstVisit: "2012", visits: 1, years: [2012], fav: false,
    summary: "三宅島の南。イルカと原生林の険しい島。2012年訪問。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  },
  // ---- 鹿児島の島 ----
  {
    id: "kikaijima", name: "喜界島", region: "鹿児島の島", pref: "鹿児島県",
    lat: 28.32, lng: 129.94,
    firstVisit: "2017", visits: 1, years: [2017], fav: false,
    summary: "隆起サンゴ礁の平らな島。サトウキビと白ゴマ。2017年訪問。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  },
  {
    id: "tokunoshima", name: "徳之島", region: "鹿児島の島", pref: "鹿児島県",
    lat: 27.80, lng: 128.93,
    firstVisit: "2018", visits: 1, years: [2018], fav: false,
    summary: "闘牛とトライアスロンの島。世界自然遺産。2018年訪問。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  },

  // ===== 主要島ロスター（未訪問。各諸島を正確に網羅。薄く表示） =====
  // ---- 伊豆諸島（東京都）----
  {
    id: "aogashima", name: "青ヶ島", region: "伊豆諸島", pref: "東京都",
    lat: 32.457, lng: 139.766, firstVisit: "", visits: 0, fav: false,
    summary: "二重カルデラの絶海の孤島。日本一人口の少ない村。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  },
  // ---- 鹿児島の島 ----
  {
    id: "tanegashima", name: "種子島", region: "鹿児島の島", pref: "鹿児島県",
    lat: 30.60, lng: 130.95, firstVisit: "", visits: 0, fav: false,
    summary: "鉄砲伝来とロケット発射場。南北に長い平らな島。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  },
  {
    id: "okinoerabu", name: "沖永良部島", region: "鹿児島の島", pref: "鹿児島県",
    lat: 27.37, lng: 128.57, firstVisit: "", visits: 0, fav: false,
    summary: "隆起サンゴ礁の花の島。鍾乳洞とケイビング。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  },
  {
    id: "yoron", name: "与論島", region: "鹿児島の島", pref: "鹿児島県",
    lat: 27.04, lng: 128.42, firstVisit: "", visits: 0, fav: false,
    summary: "百合ヶ浜の白砂。鹿児島最南端、沖縄のすぐ北。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  },
  // ---- 沖縄の島 ----
  {
    id: "okinawa-hontou", name: "沖縄本島", region: "沖縄の島", pref: "沖縄県",
    lat: 26.50, lng: 127.95, firstVisit: "", visits: 0, fav: false,
    summary: "沖縄の中心。首里城と美ら海。離島めぐりの拠点。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  },
  {
    id: "miyako", name: "宮古島", region: "沖縄の島", pref: "沖縄県",
    lat: 24.79, lng: 125.30, firstVisit: "", visits: 0, fav: false,
    summary: "宮古ブルーの海と前浜ビーチ。橋でつながる離島群。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  },
  {
    id: "kumejima", name: "久米島", region: "沖縄の島", pref: "沖縄県",
    lat: 26.35, lng: 126.80, firstVisit: "", visits: 0, fav: false,
    summary: "はての浜の砂州と久米島紬。琉球一の美しさと讃えられた島。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  },
  {
    id: "yonaguni", name: "与那国島", region: "沖縄の島", pref: "沖縄県",
    lat: 24.46, lng: 123.00, firstVisit: "", visits: 0, fav: false,
    summary: "日本最西端。海底遺跡とDr.コトー診療所のロケ地。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  },
  {
    id: "hateruma", name: "波照間島", region: "沖縄の島", pref: "沖縄県",
    lat: 24.06, lng: 123.78, firstVisit: "", visits: 0, fav: false,
    summary: "日本最南端の有人島。南十字星とニシ浜の青。",
    photos: [], shops: [], knowledge: [], tips: [], logs: []
  }
];
