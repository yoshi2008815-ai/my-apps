// ===== 観光マップ風（パンフレット調）詳細地図モード =====
// 各島の観光協会が配布する「イラスト観光マップ」に近い水準を目指したデフォルメ地図。
// 海岸線は geo.js（OpenStreetMap ODbL）、スポットは v2 の島データ（is.spots）を使う。
// 道路・集落・航路・山地は data.js の検証済みスポット座標と主要地形から作成した
// 簡略ポリライン（デフォルメ用。正確な道路形状ではない）。
// app.js のグローバル（$, STATE, visibleSpots, liveList, catStyle, spotForm,
// islandById, esc, toast, CATS）を利用する。
'use strict';
window.Kanko = (() => {

const MODE_KEY = 'island-camp/dmapmode';
let mode = false;
try { mode = localStorage.getItem(MODE_KEY) === 'kanko'; } catch(e){}
let curId = null;          // 表示中の島
let VIEW = null;           // ズーム状態 {id, z, cx, cy}
let PROJ = null;           // 現在の投影（タップ位置→緯度経度の逆変換に使う）
let pickCb = null;         // スポット位置指定のコールバック

/* ---------- 観光協会の公式マップリンク（2026-07調査・全URL実在確認済み） ---------- */
// パンフ自体の転載は著作権があるため、リポジトリには置かない。
// pdf: 公式サーバー上のマップPDFへの直リンク（ビューアで都度読み込む＝再配布しない）
// frame:false = X-Frame-Options で iframe 埋め込み不可 → 新しいタブで開く
// pdfOrg: PDFの発行元が org と異なる場合のみ指定
const KANKO_LINKS = {
  'izu-oshima':   { org:'大島観光協会',       url:'https://oshima-navi.com/pamphlet/index.html',
                    pdf:'https://oshima-navi.com/pdf/pamphlet/izuoshima_guidemap01.pdf', pdfName:'伊豆大島ガイドマップ', frame:false },
  'toshima':      { org:'利島村',             url:'https://www.gotokyo.org/book/list/5156/',
                    pdf:'https://www.soumu.metro.tokyo.lg.jp/documents/d/soumu/3242_toshimazukan-28outside-29',
                    pdfName:'としまずかん（全島ウォーキングマップ）', pdfOrg:'東京都大島支庁', frame:false },
  'niijima':      { org:'新島村観光案内所',   url:'https://niijima-info.jp/map/',
                    pdf:'https://niijima-info.jp/cms24/wp-content/uploads/2026/06/niijimaA3MAP.pdf', pdfName:'新島&本村マップ' },
  'shikinejima':  { org:'式根島観光協会',     url:'https://shikinejima.tokyo/learn/pamphlet/',
                    pdf:'https://shikinejima.tokyo/cms/wp-content/uploads/2026/05/A3map2026.pdf', pdfName:'式根島MAP' },
  'kozushima':    { org:'神津島観光協会',     url:'https://kozushima.com/map/',
                    pdf:'https://kozushima.com/map/images/asobimap.pdf', pdfName:'神津島あそびマップ' },
  'miyakejima':   { org:'三宅島観光協会',     url:'https://www.miyakejima.gr.jp/map/',
                    pdf:'https://www.soumu.metro.tokyo.lg.jp/documents/d/soumu/3440_kankousasshi0603',
                    pdfName:'観光冊子「三宅島」', pdfOrg:'東京都三宅支庁', frame:false },
  'mikurajima':   { org:'御蔵島観光協会',     url:'https://mikura-isle.com/info-2/' },
  'hachijojima':  { org:'八丈島観光協会',     url:'https://www.hachijo.gr.jp/catalogs/',
                    pdf:'https://www.hachijo.gr.jp/39rhf0e/wp-content/uploads/2018/07/guidemap2411.pdf', pdfName:'八丈島観光マップ' },
  'aogashima':    { org:'青ヶ島村',           url:'https://www.vill.aogashima.tokyo.jp/tourism/map.html',
                    pdf:'https://www.vill.aogashima.tokyo.jp/tourism/aogashima_map.pdf', pdfName:'青ヶ島MAP', frame:false },
  'sado':         { org:'佐渡観光交流機構',   url:'https://www.visitsado.com/pamphlet/',
                    pdf:'https://www.visitsado.com/media/files/pdf/%E4%BD%90%E6%B8%A1%E8%A6%B3%E5%85%89Map-2026.pdf', pdfName:'佐渡観光マップ' },
  'yakushima':    { org:'屋久島観光協会',     url:'https://yakukan.jp/safe-travel/brochure-download.html',
                    pdf:'https://yakukan.jp/wp-content/uploads/2026/03/kankoannaizu-202600324.pdf', pdfName:'屋久島観光案内図' },
  'tanegashima':  { org:'種子島観光協会',     url:'https://tanekan.jp/allmap/',
                    pdf:'https://www.pref.kagoshima.jp/ap01/chiiki/kumage/chiiki/documents/59066_20230920174114-1.pdf',
                    pdfName:'たねやく観光ガイドマップ', pdfOrg:'鹿児島県' },
  'amami-oshima': { org:'あまみ大島観光物産連盟', url:'https://www.amami-tourism.org/pamphlet/',
                    pdf:'https://www.amami-tourism.org/wp-content/uploads/2025/10/3513bcfbf51dd5a93d876439f6e7af4c.pdf', pdfName:'奄美大島観光ガイドマップ' },
  'kikaijima':    { org:'喜界島観光物産協会', url:'https://www.town.kikai.lg.jp/densan/kanko-iju/panfuretto/index.html',
                    pdf:'https://www.town.kikai.lg.jp/densan/kanko-iju/panfuretto/documents/ziogaidoomote.pdf',
                    pdfName:'喜界島ジオガイド', pdfOrg:'喜界町' },
  'tokunoshima':  { org:'徳之島観光連盟',     url:'https://www.tokunoshima-town.org/omotenashikanko/kanko/pamphlet/index.html',
                    pdf:'https://www.tokunoshima-town.org/omotenashikanko/kanko/pamphlet/documents/tokunoshimapf.pdf',
                    pdfName:'徳之島町観光パンフレット', pdfOrg:'徳之島町' },
  'okinoerabu':   { org:'おきのえらぶ島観光協会', url:'https://okinoerabujima.info/pamphlet/tourism',
                    pdf:'https://okinoerabujima.info/downloads/media/3936', pdfName:'おきのえらぶ島の旅マップ', frame:false },
  'yoron':        { org:'ヨロン島観光協会',   url:'https://www.yorontou.info/safe-travel/brochure-download.html',
                    pdf:'https://www.yorontou.info/wp-content/uploads/2025/06/202506guidemap.pdf', pdfName:'ヨロン島ガイドマップ' },
  'okinawa-hontou':{ org:'おきなわ物語',      url:'https://okimeguri.com/guidemap' },
  'kumejima':     { org:'久米島町観光協会',   url:'https://www.kanko-kumejima.com/tourist-brochures/' },
  'miyako':       { org:'宮古島観光協会',     url:'https://miyako-guide.net/profile/magazine/',
                    pdf:'https://miyako-guide.net/wp-content/themes/cerulean-custom/assets/pdf/2024_miyako_citymap_jp.pdf', pdfName:'宮古島 全島観光マップ' },
  'ishigaki':     { org:'石垣市観光交流協会', url:'https://yaeyama.or.jp/our-information/document-request/',
                    pdf:'https://yaeyama.or.jp/wp-content/uploads/2023/08/4506ebc09bbe4a5fa7ec727b8cda171e-1.pdf', pdfName:'おーりとーり石垣島へ（観光マップ）' },
  'iriomote':     { org:'竹富町観光協会',     url:'https://painusima.com/goods/',
                    pdf:'https://painusima.com/wp-content/themes/taketomi_wp_v1/file/painusima_pamphlet_jp_B5_202509.pdf', pdfName:'竹富町観光パンフレット' },
  'yonaguni':     { org:'与那国町観光協会',   url:'https://welcome-yonaguni.jp/news/3185/',
                    pdf:'https://welcome-yonaguni.jp/wp-content/uploads/2023/09/yonaguni_guide_map.pdf', pdfName:'よなぐに観光ガイド' },
  'hateruma':     { org:'竹富町観光協会',     url:'https://painusima.com/goods/',
                    pdf:'https://painusima.com/wp-content/themes/taketomi_wp_v1/file/painusima_pamphlet_jp_B5_202509.pdf', pdfName:'竹富町観光パンフレット' },
};

/* ---------- 山・港のランドマーク（座標は検証済み） ---------- */
const POI = {
  'izu-oshima':   { peak:{name:'三原山', ele:758,  lat:34.724, lng:139.394, smoke:true}, port:{name:'元町港',   lat:34.750, lng:139.356} },
  'toshima':      { peak:{name:'宮塚山', ele:508,  lat:34.5196, lng:139.2792}, port:{name:'利島港', lat:34.529, lng:139.279} },
  'niijima':      { peak:{name:'宮塚山', ele:432,  lat:34.3969, lng:139.2703}, port:{name:'新島港', lat:34.372, lng:139.252} },
  'shikinejima':  { peak:{name:'神引山', ele:99,   lat:34.3261, lng:139.2029}, port:{name:'野伏港', lat:34.3352, lng:139.2137} },
  'kozushima':    { peak:{name:'天上山', ele:572,  lat:34.219, lng:139.156}, port:{name:'神津島港', lat:34.203, lng:139.134} },
  'miyakejima':   { peak:{name:'雄山',   ele:775,  lat:34.085, lng:139.5253}, port:{name:'三池港',  lat:34.100, lng:139.5555} },
  'mikurajima':   { peak:{name:'御山',   ele:851,  lat:33.874, lng:139.603}, port:{name:'御蔵島港', lat:33.9005, lng:139.5925} },
  'hachijojima':  { peak:{name:'八丈富士', ele:854, lat:33.136, lng:139.762}, port:{name:'底土港',  lat:33.113, lng:139.802} },
  'aogashima':    { peak:{name:'大凸部', ele:423,  lat:32.4583, lng:139.7592}, port:{name:'三宝港', lat:32.448, lng:139.755} },
  'sado':         { peak:{name:'金北山', ele:1172, lat:38.122, lng:138.343}, port:{name:'両津港',   lat:38.079, lng:138.437} },
  'yakushima':    { peak:{name:'宮之浦岳', ele:1936, lat:30.336, lng:130.504}, port:{name:'宮之浦港', lat:30.432, lng:130.573} },
  'tanegashima':  { port:{name:'西之表港', lat:30.7281, lng:130.9926} },
  'amami-oshima': { peak:{name:'湯湾岳', ele:694,  lat:28.294, lng:129.325}, port:{name:'名瀬港',   lat:28.3841, lng:129.497} },
  'kikaijima':    { peak:{name:'百之台', ele:203,  lat:28.298, lng:129.966}, port:{name:'湾港',     lat:28.318, lng:129.932} },
  'tokunoshima':  { peak:{name:'井之川岳', ele:645, lat:27.755, lng:128.963}, port:{name:'亀徳港',  lat:27.734, lng:129.024} },
  'okinoerabu':   { peak:{name:'大山',   ele:240,  lat:27.359, lng:128.587}, port:{name:'和泊港',   lat:27.393, lng:128.657} },
  'yoron':        { port:{name:'与論港', lat:27.034, lng:128.4035} },
  'okinawa-hontou':{ peak:{name:'与那覇岳', ele:503, lat:26.7172, lng:128.2186}, port:{name:'那覇港', lat:26.216, lng:127.672} },
  'kumejima':     { peak:{name:'宇江城岳', ele:310, lat:26.3765, lng:126.7693}, port:{name:'兼城港', lat:26.342, lng:126.739} },
  'miyako':       { port:{name:'平良港', lat:24.810, lng:125.282} },
  'ishigaki':     { peak:{name:'於茂登岳', ele:526, lat:24.422, lng:124.190}, port:{name:'石垣港',  lat:24.3372, lng:124.156} },
  'iriomote':     { peak:{name:'古見岳', ele:469,  lat:24.3583, lng:123.890}, port:{name:'大原港',  lat:24.284, lng:123.876} },
  'yonaguni':     { peak:{name:'宇良部岳', ele:231, lat:24.4528, lng:123.0056}, port:{name:'久部良港', lat:24.451, lng:122.943} },
  'hateruma':     { port:{name:'波照間港', lat:24.068, lng:123.771} },
};

/* ================================================================
 * パンフレット用の手描き素材データ（2026-07 作成）
 * ROADS: 主要道路の簡略ポリライン（main=幹線, sub=支線/山道）
 * TOWNS: 集落ラベル / FERRIES: 定期航路の矢印 / HILLS: 山地の塗り
 * ================================================================ */
const ROADS = {
  'izu-oshima': {
    main: [ // 大島一周道路
      [[34.7519,139.3525],[34.7827,139.3607],[34.7906,139.3906],[34.7805,139.4197],
       [34.7617,139.4359],[34.7462,139.4445],[34.7064,139.4451],[34.6868,139.4397],
       [34.6812,139.4300],[34.6950,139.3828],[34.7032,139.3719],[34.7519,139.3525]]
    ],
    sub: [ // 御神火スカイライン（三原山登山道路）
      [[34.7520,139.3560],[34.7420,139.3720],[34.7350,139.3860],[34.7245,139.3944]]
    ]
  },
  'niijima': {
    main: [ // 都道211（若郷〜本村〜間々下）
      [[34.4133,139.2871],[34.4050,139.2760],[34.3930,139.2525],[34.3810,139.2546],
       [34.3720,139.2515],[34.3673,139.2444],[34.3597,139.2446]]
    ],
    sub: [ // 羽伏浦への道
      [[34.3780,139.2570],[34.3800,139.2650],[34.3797,139.2717]]
    ]
  },
  'kozushima': {
    main: [ // 村道・都道（空港〜前浜〜赤崎〜多幸湾）
      [[34.1894,139.1340],[34.1989,139.1243],[34.2093,139.1285],[34.2176,139.1339],
       [34.2396,139.1379],[34.2455,139.1460],[34.2250,139.1580],[34.2028,139.1555]]
    ],
    sub: [ // 天上山方面
      [[34.2080,139.1355],[34.2140,139.1470],[34.2196,139.1532]]
    ]
  },
  'hachijojima': {
    main: [ // 八丈一周道路
      [[33.1229,139.8168],[33.1138,139.8362],[33.0928,139.8492],[33.0792,139.8511],
       [33.0783,139.8425],[33.0597,139.8157],[33.0656,139.7941],[33.0758,139.7903],
       [33.0849,139.7839],[33.0996,139.7716],[33.1061,139.7542],[33.1250,139.7480],
       [33.1450,139.7500],[33.1530,139.7690],[33.1400,139.7950],[33.1229,139.8168]]
    ],
    sub: [ // 大賀郷〜空港〜三根の横断道
      [[33.0996,139.7716],[33.1149,139.7846],[33.1229,139.8168]],
      [[33.1200,139.7750],[33.1308,139.7675]] // ふれあい牧場
    ]
  },
  'yakushima': {
    main: [ // 県道77/78 島一周
      [[30.4324,130.5724],[30.4232,130.5808],[30.3856,130.6592],[30.3173,130.6589],
       [30.2507,130.5906],[30.2405,130.5486],[30.2310,130.4839],[30.2342,130.4777],
       [30.2712,130.4158],[30.2996,130.4135],[30.3578,130.3979],[30.3922,130.3797],
       [30.4076,130.4349],[30.4324,130.5724]]
    ],
    sub: [ // 安房〜ヤクスギランド〜紀元杉
      [[30.3173,130.6589],[30.3100,130.6200],[30.3048,130.5754],[30.3027,130.5455]],
      // 宮之浦〜白谷雲水峡
      [[30.4324,130.5724],[30.4050,130.5750],[30.3800,130.5742]]
    ]
  },
  'amami-oshima': {
    main: [ // 国道58（笠利〜名瀬〜古仁屋）
      [[28.4309,129.7103],[28.4034,129.6483],[28.4147,129.6009],[28.3897,129.4950],
       [28.3400,129.4400],[28.2593,129.4090],[28.1900,129.3600],[28.1460,129.3100],
       [28.1255,129.3626]]
    ],
    sub: [ // 空港〜あやまる岬
      [[28.4309,129.7103],[28.4734,129.7174]],
      // 名瀬〜大和村〜宇検〜西古見（西回り）
      [[28.3897,129.4950],[28.3300,129.4000],[28.3171,129.3349],[28.2600,129.2600],[28.2424,129.1754]]
    ]
  },
  'ishigaki': {
    main: [ // 県道79 西回り（市街〜川平〜平久保崎）
      [[24.3376,124.1555],[24.3657,124.1133],[24.3713,124.1142],[24.4100,124.0900],
       [24.4525,124.0786],[24.4528,124.1438],[24.4542,124.1888],[24.4686,124.2525],
       [24.4905,124.2789],[24.6089,124.3150]],
      // 国道390 東回り（市街〜白保〜空港〜玉取崎）
      [[24.3376,124.1555],[24.3544,124.2456],[24.3956,124.2450],[24.4686,124.2525]]
    ],
    sub: [ // バンナ公園・於茂登トンネル方面
      [[24.3400,124.1580],[24.3775,124.1596],[24.4150,124.1750]]
    ]
  },
  'iriomote': {
    main: [ // 県道215（白浜〜上原〜大原〜南風見田）
      [[24.3587,123.7454],[24.4031,123.7787],[24.4236,123.7745],[24.4365,123.7772],
       [24.4180,123.7998],[24.4050,123.8074],[24.3945,123.8641],[24.3250,123.9050],
       [24.3428,123.9336],[24.2728,123.8849],[24.2736,123.8329]]
    ],
    sub: []
  },
  'sado': {
    main: [ // 佐渡一周線
      [[38.0817,138.4381],[38.1300,138.4700],[38.2000,138.5000],[38.2700,138.5100],
       [38.3297,138.4874],[38.3210,138.4616],[38.2700,138.4000],[38.1976,138.3269],
       [38.1400,138.2900],[38.0937,138.2505],[38.0300,138.2450],[38.0013,138.3155],
       [37.9450,138.3100],[37.8483,138.2712],[37.8163,138.2822],[37.8850,138.4200],
       [37.9204,138.4997],[38.0000,138.4900],[38.0817,138.4381]]
    ],
    sub: [ // 国道350（両津〜金井〜佐和田）
      [[38.0817,138.4381],[38.0600,138.3800],[38.0013,138.3155]],
      // 小木〜宿根木
      [[37.8163,138.2822],[37.8067,138.2432]],
      // ドンデン高原
      [[38.0900,138.4100],[38.1383,138.3904]]
    ]
  },
};

const TOWNS = {
  'izu-oshima':   [ {name:'元町', lat:34.760, lng:139.366}, {name:'岡田', lat:34.785, lng:139.382}, {name:'波浮', lat:34.690, lng:139.430} ],
  'niijima':      [ {name:'本村', lat:34.377, lng:139.258}, {name:'若郷', lat:34.405, lng:139.283} ],
  'kozushima':    [ {name:'神津島村', lat:34.213, lng:139.141} ],
  'hachijojima':  [ {name:'三根', lat:33.112, lng:139.796}, {name:'大賀郷', lat:33.097, lng:139.783},
                    {name:'樫立', lat:33.071, lng:139.799}, {name:'中之郷', lat:33.069, lng:139.805}, {name:'末吉', lat:33.086, lng:139.843} ],
  'yakushima':    [ {name:'宮之浦', lat:30.428, lng:130.578}, {name:'安房', lat:30.315, lng:130.655},
                    {name:'尾之間', lat:30.243, lng:130.552}, {name:'永田', lat:30.410, lng:130.440}, {name:'栗生', lat:30.273, lng:130.420} ],
  'amami-oshima': [ {name:'名瀬', lat:28.386, lng:129.500}, {name:'古仁屋', lat:28.148, lng:129.315},
                    {name:'龍郷', lat:28.415, lng:129.600}, {name:'笠利', lat:28.455, lng:129.695} ],
  'ishigaki':     [ {name:'石垣市街', lat:24.345, lng:124.160}, {name:'川平', lat:24.458, lng:124.145},
                    {name:'白保', lat:24.352, lng:124.250}, {name:'平久保', lat:24.595, lng:124.310} ],
  'iriomote':     [ {name:'上原', lat:24.423, lng:123.803}, {name:'大原', lat:24.278, lng:123.888},
                    {name:'白浜', lat:24.362, lng:123.748}, {name:'船浮', lat:24.342, lng:123.720} ],
  'sado':         [ {name:'両津', lat:38.086, lng:138.440}, {name:'相川', lat:38.030, lng:138.248},
                    {name:'佐和田', lat:38.004, lng:138.320}, {name:'小木', lat:37.820, lng:138.286} ],
};

// ang: 画面上の角度（0=右, 90=下, -90=上）/ len: 地図単位
const FERRIES = {
  'izu-oshima':   [ {lat:34.7519, lng:139.3525, ang:-140, len:15, label:'竹芝・熱海へ'} ],
  'niijima':      [ {lat:34.3673, lng:139.2444, ang:-135, len:13, label:'竹芝へ'} ],
  'kozushima':    [ {lat:34.2093, lng:139.1285, ang:-150, len:13, label:'竹芝へ'} ],
  'hachijojima':  [ {lat:33.1229, lng:139.8168, ang:-85,  len:13, label:'竹芝へ'} ],
  'yakushima':    [ {lat:30.4324, lng:130.5724, ang:-15,  len:14, label:'鹿児島へ'} ],
  'amami-oshima': [ {lat:28.3897, lng:129.4950, ang:-95,  len:13, label:'鹿児島・沖縄へ'} ],
  'ishigaki':     [ {lat:24.3376, lng:124.1555, ang:172,  len:11, label:'竹富・西表へ'} ],
  'iriomote':     [ {lat:24.2728, lng:123.8849, ang:-15,  len:12, label:'石垣へ'},
                    {lat:24.4180, lng:123.7998, ang:-50,  len:10, label:'石垣へ'} ],
  'sado':         [ {lat:38.0817, lng:138.4381, ang:20,   len:14, label:'新潟へ'},
                    {lat:37.8163, lng:138.2822, ang:158,  len:9,  label:'直江津へ'} ],
};

// 山地の塗り（rx/ry は km, rot は度）
const HILLS = {
  'izu-oshima':   [ {lat:34.725, lng:139.395, rx:2.9, ry:2.5, rot:0} ],
  'niijima':      [ {lat:34.398, lng:139.269, rx:1.5, ry:1.9, rot:10}, {lat:34.352, lng:139.246, rx:1.2, ry:1.7, rot:-15} ],
  'kozushima':    [ {lat:34.219, lng:139.150, rx:1.8, ry:1.6, rot:0}, {lat:34.196, lng:139.137, rx:1.4, ry:1.8, rot:15} ],
  'hachijojima':  [ {lat:33.137, lng:139.763, rx:2.5, ry:2.2, rot:0}, {lat:33.083, lng:139.812, rx:2.7, ry:2.3, rot:-40} ],
  'yakushima':    [ {lat:30.330, lng:130.500, rx:8.5, ry:7.5, rot:0} ],
  'amami-oshima': [ {lat:28.420, lng:129.620, rx:6.0, ry:3.2, rot:-40}, {lat:28.310, lng:129.410, rx:7.0, ry:4.0, rot:-40},
                    {lat:28.160, lng:129.300, rx:5.0, ry:3.0, rot:-35} ],
  'ishigaki':     [ {lat:24.430, lng:124.185, rx:4.0, ry:2.8, rot:-10}, {lat:24.550, lng:124.295, rx:4.5, ry:1.5, rot:-55} ],
  'iriomote':     [ {lat:24.350, lng:123.830, rx:7.5, ry:5.8, rot:-5} ],
  'sado':         [ {lat:38.150, lng:138.330, rx:13, ry:4.5, rot:-38}, {lat:37.880, lng:138.360, rx:10, ry:3.5, rot:-40} ],
};

/* ---------- 実データ（kanko-geo.js: OSM由来の道路・集落。ODbL） ---------- */
// 道路は実データ優先（手描きROADSはフォールバック）。
// 集落は手作業で検証済みのTOWNSを優先し、未整備の島だけOSMの place を使う。
function kgeoRoads(id){ const K = window.KGEO || {}; return (K.roads && K.roads[id]) || null; }
function townsFor(id){
  if (TOWNS[id]) return TOWNS[id];
  const K = window.KGEO || {};
  return (K.towns && K.towns[id]) || [];
}

/* ---------- 海岸線リング（geo.js: 高解像度detail → islands → refs） ---------- */
const REF_ALIAS = { 'okinawa-hontou':'okinawa' };
function ringFor(id){
  const G = window.GEO || {};
  if (id === 'miyakejima' && G.miyakeDetail && G.miyakeDetail.length) return G.miyakeDetail;
  if (G.isleDetail && G.isleDetail[id]) return G.isleDetail[id];
  if (G.islands && G.islands[id]) return G.islands[id];
  const rk = REF_ALIAS[id] || id;
  if (G.refs && G.refs[rk]){
    return G.refs[rk].reduce((a,b)=> a.length>=b.length ? a : b);
  }
  return null;
}
function available(is){ return !!ringFor(is.id); }

/* ---------- 投影（lat/lng → 0-100 / 逆変換つき） ---------- */
function makeProj(ring){
  let mnLa=Infinity, mxLa=-Infinity, mnLn=Infinity, mxLn=-Infinity;
  for (const [la,ln] of ring){
    if(la<mnLa)mnLa=la; if(la>mxLa)mxLa=la; if(ln<mnLn)mnLn=ln; if(ln>mxLn)mxLn=ln;
  }
  const latMid=(mnLa+mxLa)/2, kx=Math.cos(latMid*Math.PI/180);
  const w=(mxLn-mnLn)*kx, h=(mxLa-mnLa), pad=13, span=Math.max(w,h)||0.01;
  const sc=(100-2*pad)/span;
  const offx=pad+((100-2*pad)-w*sc)/2, offy=pad+((100-2*pad)-h*sc)/2;
  const f=(la,ln)=>({ x:+(offx+(ln-mnLn)*kx*sc).toFixed(2), y:+(offy+(mxLa-la)*sc).toFixed(2) });
  f.inv=(x,y)=>({ lat:+(mxLa-(y-offy)/sc).toFixed(5), lng:+(mnLn+(x-offx)/(kx*sc)).toFixed(5) });
  f.inBounds=(la,ln)=>{ const q=f(la,ln); return q.x>1 && q.x<99 && q.y>1 && q.y<99; };
  f.kmu = 111.32/sc; // 1地図単位あたりのkm
  return f;
}

/* ---------- ズーム状態 ---------- */
function resetViewFor(id){
  if (!VIEW || VIEW.id !== id) VIEW = { id, z:1, cx:50, cy:50 };
}
function viewBoxStr(){
  const w = 100/VIEW.z;
  const x = Math.min(100-w, Math.max(0, VIEW.cx - w/2));
  const y = Math.min(100-w, Math.max(0, VIEW.cy - w/2));
  VIEW.cx = x + w/2; VIEW.cy = y + w/2;
  return `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${w.toFixed(2)}`;
}

/* ---------- 汎用：ハッシュ乱数・スムージング・オフセット ---------- */
function hash32(str){
  let h = 2166136261;
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Catmull-Rom → 3次ベジェのなめらかパス
function smoothPathD(p, closed){
  const n = p.length;
  if (n < 2) return '';
  const pt = i => p[closed ? (i+n)%n : Math.max(0, Math.min(n-1, i))];
  let d = `M ${p[0].x.toFixed(2)} ${p[0].y.toFixed(2)}`;
  const last = closed ? n : n-1;
  for (let i=0;i<last;i++){
    const p0=pt(i-1), p1=pt(i), p2=pt(i+1), p3=pt(i+2);
    const c1x=p1.x+(p2.x-p0.x)/6, c1y=p1.y+(p2.y-p0.y)/6;
    const c2x=p2.x-(p3.x-p1.x)/6, c2y=p2.y-(p3.y-p1.y)/6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  if (closed) d += ' Z';
  return d;
}
function movAvg(pts, w){
  const n = pts.length, out = new Array(n);
  for (let i=0;i<n;i++){
    let sx=0, sy=0;
    for (let k=-w;k<=w;k++){ const p=pts[(i+k+n)%n]; sx+=p.x; sy+=p.y; }
    out[i] = { x:sx/(2*w+1), y:sy/(2*w+1) };
  }
  return out;
}
// 閉リングの外側オフセット（沖合の等深線風の線に使う）
function offsetRing(pts, d){
  const n = pts.length;
  const step = Math.max(1, Math.floor(n/120));
  const base = [];
  for (let i=0;i<n;i+=step) base.push(pts[i]);
  const m = base.length;
  let cx=0, cy=0;
  for (const p of base){ cx+=p.x; cy+=p.y; }
  cx/=m; cy/=m;
  const off = sign => base.map((p,i) => {
    const a = base[(i-1+m)%m], b = base[(i+1)%m];
    let nx = b.y-a.y, ny = -(b.x-a.x);
    const l = Math.hypot(nx,ny) || 1;
    return { x: p.x + sign*d*nx/l, y: p.y + sign*d*ny/l };
  });
  // 重心から遠ざかる向きを「外側」と判定
  const t1 = off(1)[0], t2 = off(-1)[0], p0 = base[0];
  const sign = (Math.hypot(t1.x-cx,t1.y-cy) > Math.hypot(p0.x-cx,p0.y-cy)) ? 1 : -1;
  return movAvg(off(sign), 3);
}

/* ---------- ラベル配置（重なり回避） ---------- */
function makeLayout(){
  const boxes = [];
  const hit = (a,b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  return {
    block(x1,y1,x2,y2){ boxes.push({x1,y1,x2,y2}); },
    place(cands, force){
      for (const c of cands){
        if (!boxes.some(b => hit(b,c))){ boxes.push(c); return c; }
      }
      if (force && cands.length){
        // どうしても重なる場合は、重なりが最少の候補を選ぶ
        let best = cands[0], bn = Infinity;
        for (const c of cands){
          const n = boxes.reduce((a,b) => a + (hit(b,c) ? 1 : 0), 0);
          if (n < bn){ bn = n; best = c; }
        }
        boxes.push(best);
        return best;
      }
      return null;
    },
  };
}
function labelCands(q, w, h, iv){
  const mk = (tx,ty,anchor) => {
    const x1 = anchor==='middle' ? tx-w/2 : anchor==='start' ? tx : tx-w;
    return { tx, ty, anchor, x1, y1:ty-h*0.8, x2:x1+w, y2:ty+h*0.25 };
  };
  return [
    mk(q.x, q.y-4.2*iv, 'middle'),
    mk(q.x, q.y+5.8*iv, 'middle'),
    mk(q.x+3.9*iv, q.y+0.95*iv, 'start'),
    mk(q.x-3.9*iv, q.y+0.95*iv, 'end'),
  ];
}

/* ---------- SVG生成（パンフレット調） ---------- */
const SPOT_ORDER = ['港・交通','キャンプ場','山・自然','ビーチ','温泉','観光','食事・店'];
function halo(iv, k){ return `paint-order="stroke" stroke="#fff" stroke-width="${(k||1.1)*iv}"`; }

function mapSVG(is){
  const ring = ringFor(is.id);
  if (!ring) return '';
  const proj = makeProj(ring);
  PROJ = proj;
  const pts = ring.map(([la,ln]) => proj(la,ln));
  const ptsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
  const iv = 1/VIEW.z, z = VIEW.z;
  const vb = viewBoxStr();
  const [vx, vy] = vb.split(' ').map(Number);
  const poi = POI[is.id] || {};
  const kmu = proj.kmu;
  const rand = mulberry(hash32(is.id));
  const inView = q => q.x > vx-4 && q.x < vx+100*iv+4 && q.y > vy-4 && q.y < vy+100*iv+4;
  const scr = (sx,sy) => ({ x: vx + sx*iv, y: vy + sy*iv }); // 画面固定座標→地図座標
  const layout = makeLayout();

  /* --- 海：等深線・波・生きもの --- */
  const contours = [ [2.4,'#a2d6e8',0.55], [5.2,'#aedcec',0.35] ].map(([d,col,op]) => {
    const o = offsetRing(pts, d);
    return `<path d="${smoothPathD(o, true)}" fill="none" stroke="${col}" stroke-width="0.5" opacity="${op}"/>`;
  }).join('');
  const wave = (x,y,s) => `<path d="M ${x} ${y} q ${1.6*s} ${-1.3*s} ${3.2*s} 0 q ${1.6*s} ${1.3*s} ${3.2*s} 0" fill="none" stroke="#79b8cf" stroke-width="${0.5*s}" stroke-linecap="round" opacity=".65"/>`;
  const waves = [ [8,12,1],[86,9,1],[5,55,.8],[91,62,.9],[12,90,1],[78,93,.9],[46,4,.8],[30,95,.7] ].map(a => wave(...a)).join('');
  const critters = (() => {
    const glyphs = ['🐬','🐢','⛵','🐳'];
    const posEnum = [[6,7],[94,11],[5,90],[95,86]];
    let out = '';
    for (let i=0;i<posEnum.length;i++){
      if (rand() < 0.45) continue;
      const g = glyphs[Math.floor(rand()*glyphs.length)];
      out += `<text x="${posEnum[i][0]}" y="${posEnum[i][1]}" font-size="3.4" opacity=".9" pointer-events="none">${g}</text>`;
    }
    return out;
  })();

  /* --- 山地の塗り（島でクリップ） --- */
  let hills = HILLS[is.id];
  if (!hills && poi.peak && poi.peak.ele > 200){
    const spanKm = 74*kmu;
    hills = [ {lat:poi.peak.lat, lng:poi.peak.lng, rx:spanKm*0.20, ry:spanKm*0.16, rot:0} ];
  }
  let hillsSVG = '';
  if (hills){
    for (const hcfg of hills){
      const c = proj(hcfg.lat, hcfg.lng);
      const rux = hcfg.rx/kmu, ruy = hcfg.ry/kmu;
      const th = (hcfg.rot||0)*Math.PI/180;
      const ph = rand()*6.28;
      const bl = [];
      for (let i=0;i<26;i++){
        const t = i/26*2*Math.PI;
        let r = (rux*ruy)/Math.sqrt((ruy*Math.cos(t))**2 + (rux*Math.sin(t))**2 || 1e-6);
        r *= 1 + 0.13*Math.sin(3*t+ph) + 0.10*(rand()-0.5);
        const ex = r*Math.cos(t), ey = r*Math.sin(t);
        bl.push({ x: c.x + ex*Math.cos(th) - ey*Math.sin(th)*(ruy/rux||1),
                  y: c.y + ex*Math.sin(th) + ey*Math.cos(th) });
      }
      hillsSVG += `<path d="${smoothPathD(bl,true)}" fill="url(#kHill)" opacity=".8"/>`;
      // 森の点描
      for (let i=0;i<7;i++){
        const t = rand()*2*Math.PI, rr = Math.sqrt(rand())*0.72;
        const ex = rux*rr*Math.cos(t), ey = ruy*rr*Math.sin(t);
        const tx = c.x + ex*Math.cos(th) - ey*Math.sin(th);
        const ty = c.y + ex*Math.sin(th) + ey*Math.cos(th);
        const s = 0.9 + rand()*0.5;
        hillsSVG += `<path d="M ${tx-s} ${ty+s*0.8} L ${tx} ${ty-s} L ${tx+s} ${ty+s*0.8} Z" fill="#5e8f4c" opacity=".45"/>`;
      }
    }
  }

  /* --- 道路（島でクリップ）: OSM実データ優先・手描きはフォールバック --- */
  const rd = kgeoRoads(is.id) || ROADS[is.id];
  let roadsSVG = '';
  if (rd){
    const path = wp => smoothPathD(wp.map(([la,ln]) => proj(la,ln)), false);
    for (const wp of (rd.sub||[])){
      roadsSVG += `<path d="${path(wp)}" fill="none" stroke="#a5814f" stroke-width="${0.75*iv}" stroke-dasharray="${1.7*iv} ${1.1*iv}" stroke-linecap="round" opacity=".85"/>`;
    }
    for (const wp of (rd.main||[])){
      const d = path(wp);
      roadsSVG += `<path d="${d}" fill="none" stroke="#a97b48" stroke-width="${1.7*iv}" stroke-linejoin="round" stroke-linecap="round"/>`;
      roadsSVG += `<path d="${d}" fill="none" stroke="#fffdf2" stroke-width="${1.0*iv}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
  }

  /* --- スポット位置の計算（密集は引き出し線つきで分散＝パンフの手法） --- */
  const spotsAll = visibleSpots(is).filter(s => isFinite(s.lat) && isFinite(s.lng));
  let spots = spotsAll
    .map(s => { const q = proj(s.lat, s.lng); return { s, q, x:q.x, y:q.y }; })
    .filter(o => o.q.x > 1 && o.q.x < 99 && o.q.y > 1 && o.q.y < 99)
    .sort((a,b) => SPOT_ORDER.indexOf(a.s.cat) - SPOT_ORDER.indexOf(b.s.cat));
  // 密集地（集落）は「まとめマーカー」に集約。タップでその場所へズームする。
  const clusters = [];
  if (z < 2.2){
    const TH = 2.7*iv;
    const n = spots.length, gid = new Array(n).fill(-1);
    for (let i=0;i<n;i++){
      if (gid[i] !== -1) continue;
      const stack = [i], members = [i];
      gid[i] = i;
      while (stack.length){
        const a = stack.pop();
        for (let b=0;b<n;b++){
          if (gid[b] !== -1) continue;
          if (Math.hypot(spots[a].q.x-spots[b].q.x, spots[a].q.y-spots[b].q.y) < TH){
            gid[b] = i; stack.push(b); members.push(b);
          }
        }
      }
      if (members.length >= 3){
        let cx=0, cy=0;
        for (const m of members){ cx += spots[m].q.x; cy += spots[m].q.y; }
        clusters.push({ x:cx/members.length, y:cy/members.length, count:members.length, set:new Set(members) });
      }
    }
    if (clusters.length){
      const dead = new Set();
      for (const c of clusters) for (const m of c.set) dead.add(m);
      spots = spots.filter((_,i) => !dead.has(i));
    }
  }
  {
    const min = 3.4*iv;
    for (let it=0; it<24; it++){
      let moved = false;
      for (let i=0;i<spots.length;i++) for (let j=i+1;j<spots.length;j++){
        const a = spots[i], b = spots[j];
        let dx = b.x-a.x, dy = b.y-a.y;
        let d = Math.hypot(dx,dy);
        if (d >= min) continue;
        if (d < 1e-4){ const t = (i*7+j)*0.7; dx = Math.cos(t); dy = Math.sin(t); d = 1; }
        const push = (min-d)/2/d;
        a.x -= dx*push; a.y -= dy*push;
        b.x += dx*push; b.y += dy*push;
        moved = true;
      }
      // まとめマーカーの円・集落バッジ位置からも押し出す（相手は動かさない）
      const anchors = clusters.map(c => ({x:c.x, y:c.y, r:7.6*iv}))
        .concat(townsFor(is.id).map(t => { const q = proj(t.lat,t.lng); return {x:q.x, y:q.y, r:5.5*iv}; }));
      for (const o of spots) for (const c of anchors){
        const dx = o.x-c.x, dy = o.y-c.y;
        const d = Math.hypot(dx,dy);
        if (d >= c.r) continue;
        const k = d < 1e-4 ? 1 : (c.r-d)/d;
        o.x += (d < 1e-4 ? c.r : dx*k); o.y += (d < 1e-4 ? 0 : dy*k);
        moved = true;
      }
      if (!moved) break;
    }
  }

  /* --- 画面固定UIの領域を先に確保（ラベルがUIの下に潜らないように） --- */
  const title = `${is.name} 観光マップ`;
  const titleW = title.length*3.9 + 9;
  const titleX = (100 - titleW)/2;
  { const a = scr(titleX-1, 0.5), b = scr(titleX+titleW+1, 11); layout.block(a.x, a.y, b.x, b.y); }
  { const a = scr(1.5, 94.5), b = scr(34, 99.5); layout.block(a.x, a.y, b.x, b.y); }
  { const a = scr(88,86.5), b = scr(99,99); layout.block(a.x, a.y, b.x, b.y); }
  { const a = scr(38,91.6), b = scr(76,98.6); layout.block(a.x, a.y, b.x, b.y); }
  const LG = { w:31.5, colW:15.3, rows: Math.ceil((CATS.length+2)/2) };
  LG.h = LG.rows*3.1 + 3.4;
  LG.show = z <= 1.4;
  if (LG.show){
    // 右下・右上のうちスポットや集落と重ならない側に凡例を置く
    const cands = [ {x0:100-LG.w-1.5, y0:100-LG.h-13.5}, {x0:100-LG.w-1.5, y0:17} ];
    const score = c => {
      const a = scr(c.x0-2, c.y0-2), b = scr(c.x0+LG.w+2, c.y0+LG.h+2);
      let n = 0;
      for (const o of spots) if (o.x>a.x && o.x<b.x && o.y>a.y && o.y<b.y) n += 2;
      for (const t of townsFor(is.id)){ const q = proj(t.lat,t.lng); if (q.x>a.x && q.x<b.x && q.y>a.y && q.y<b.y) n += 3; }
      return n;
    };
    LG.pos = score(cands[0]) <= score(cands[1]) ? cands[0] : cands[1];
    const a = scr(LG.pos.x0-1, LG.pos.y0-1), b = scr(LG.pos.x0+LG.w+1, LG.pos.y0+LG.h+1);
    layout.block(a.x, a.y, b.x, b.y);
  }
  // マーカー本体の位置も確保
  for (const o of spots) layout.block(o.x-2.9*iv, o.y-2.9*iv, o.x+2.9*iv, o.y+2.9*iv);
  for (const c of clusters) layout.block(c.x-4.6*iv, c.y-4.6*iv, c.x+4.6*iv, c.y+4.6*iv);

  /* --- 航路 --- */
  let ferriesSVG = '';
  let ferries = FERRIES[is.id];
  if (!ferries && poi.port) ferries = [ {lat:poi.port.lat, lng:poi.port.lng, ang:-90, len:11, label:''} ];
  if (ferries){
    for (const f of ferries){
      const p0 = proj(f.lat, f.lng);
      const a = f.ang*Math.PI/180;
      // 港の混雑を避けて少し沖から線を始める
      const q = { x: p0.x + 3.2*Math.cos(a), y: p0.y + 3.2*Math.sin(a) };
      const ex = q.x + f.len*Math.cos(a), ey = q.y + f.len*Math.sin(a);
      const mx = (q.x+ex)/2 - Math.sin(a)*2.2, my = (q.y+ey)/2 + Math.cos(a)*2.2;
      ferriesSVG += `<path d="M ${q.x.toFixed(1)} ${q.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}"
        fill="none" stroke="#1f7fa8" stroke-width="${0.55*iv}" stroke-dasharray="${1.8*iv} ${1.3*iv}" opacity=".9"/>`;
      const st = 0.72;
      const sx = (1-st)*(1-st)*q.x + 2*(1-st)*st*mx + st*st*ex;
      const sy = (1-st)*(1-st)*q.y + 2*(1-st)*st*my + st*st*ey;
      ferriesSVG += `<text x="${sx.toFixed(1)}" y="${(sy+1.2*iv).toFixed(1)}" text-anchor="middle" font-size="${3.7*iv}" pointer-events="none">⛴</text>`;
      if (f.label){
        const anchor = Math.cos(a) > 0.3 ? 'start' : Math.cos(a) < -0.3 ? 'end' : 'middle';
        const ty = ey + (Math.sin(a) < -0.3 ? -1.2*iv : 3.0*iv);
        ferriesSVG += `<text x="${ex.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}" font-size="${2.6*iv}" font-weight="800"
          fill="#155f80" ${halo(iv)} pointer-events="none">${esc(f.label)}</text>`;
        const w = f.label.length*2.6*iv;
        const bx1 = anchor==='middle' ? ex-w/2 : anchor==='start' ? ex : ex-w;
        layout.block(bx1, ty-2.4*iv, bx1+w, ty+0.6*iv);
      }
    }
  }

  /* --- 集落ラベル（マーカー等と重なる場合は少しずらして配置） --- */
  let townsSVG = '';
  for (const t of townsFor(is.id)){
    const q = proj(t.lat, t.lng);
    if (!inView(q)) continue;
    const w = t.name.length*2.9*iv + 3.4*iv, h = 4.2*iv;
    const mk = (dx,dy) => ({ tx:q.x+dx, ty:q.y+dy, x1:q.x+dx-w/2, y1:q.y+dy-h/2, x2:q.x+dx+w/2, y2:q.y+dy+h/2 });
    const R = w/2 + 4*iv;
    const c = layout.place([
      mk(0,0), mk(0,-5*iv), mk(0,5.5*iv), mk(R,0), mk(-R,0),
      mk(R,-4.5*iv), mk(-R,-4.5*iv), mk(R,5*iv), mk(-R,5*iv), mk(0,-9.5*iv), mk(0,10*iv)
    ], true);
    townsSVG += `<g pointer-events="none" transform="translate(${c.tx.toFixed(2)},${c.ty.toFixed(2)})">
      <rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="${1.6*iv}" fill="#fffef8" opacity=".93" stroke="#dda05e" stroke-width="${0.35*iv}"/>
      <text y="${1.05*iv}" text-anchor="middle" font-size="${2.9*iv}" font-weight="900" fill="#6b4326">${esc(t.name)}</text>
    </g>`;
  }

  /* --- 山マーカー --- */
  let peakM = '';
  if (poi.peak && proj.inBounds(poi.peak.lat, poi.peak.lng)){
    const q = proj(poi.peak.lat, poi.peak.lng);
    const s = 1.0; // 地形サイズ（地図単位・ズームで拡大）
    const cap = poi.peak.ele >= 1000
      ? `<path d="M ${-1.1*s} ${-2.6*s} L ${-0.45*s} ${-1.3*s} L ${0.1*s} ${-0.8*s} L ${0.6*s} ${-1.55*s} L ${1.3*s} ${-2.2*s} L ${0.8*s} ${-2.6*s} Z" fill="#fff" opacity=".95"/>`
      : `<path d="M ${-1.1*s} ${-2.6*s} L ${-0.5*s} ${-1.35*s} L ${0.1*s} ${-0.8*s} L ${-0.35*s} ${-2.0*s} Z" fill="#d9ead0" opacity=".8"/>`;
    const smoke = poi.peak.smoke
      ? `<circle cx="${0.7*s}" cy="${-3.5*s}" r="${0.55*s}" fill="#fff" opacity=".85"/>
         <circle cx="${1.5*s}" cy="${-4.4*s}" r="${0.75*s}" fill="#fff" opacity=".7"/>`
      : '';
    layout.block(q.x-3.4*s, q.y-3*s, q.x+3.4*s, q.y+2.2*s);
    // 同じ山がスポット登録済みならラベルはスポット側に任せる（山のイラストだけ描く）
    const pdup = spots.some(o => Math.hypot(o.q.x-q.x, o.q.y-q.y) < 3.2);
    let plabel = '';
    if (!pdup){
      const ptxt = `${poi.peak.name} ${poi.peak.ele}m`;
      const pw = (poi.peak.name.length + 6)*2.6*iv, ph = 3.4*iv;
      const mk = (dx,dy,anchor) => {
        const tx = q.x+dx, ty = q.y+dy;
        const x1 = anchor==='middle' ? tx-pw/2 : tx;
        return { tx, ty, anchor, x1, y1:ty-ph*0.8, x2:x1+pw, y2:ty+ph*0.25 };
      };
      const lc = layout.place([
        mk(0,5.8*iv,'middle'), mk(0,-4.6*iv,'middle'), mk(4.2*iv,1.0*iv,'start'), mk(-4.2*iv,1.0*iv,'end'),
        mk(0,9.4*iv,'middle'), mk(0,-8.2*iv,'middle')
      ], true);
      plabel = `<text x="${lc.tx.toFixed(2)}" y="${lc.ty.toFixed(2)}" text-anchor="${lc.anchor}" font-size="${3.1*iv}" font-weight="900" fill="#3f4d28" ${halo(iv)}>${esc(ptxt)}</text>`;
    }
    peakM = `<g pointer-events="none">
      <g transform="translate(${q.x},${q.y})">
        <path d="M ${-3.4*s} ${2.1*s} L ${-1.1*s} ${-2.6*s} L ${0.1*s} ${-0.8*s} L ${1.3*s} ${-2.2*s} L ${3.4*s} ${2.1*s} Z"
          fill="#7ba25c" stroke="#4f7340" stroke-width="${0.3*s}" stroke-linejoin="round"/>
        ${cap}${smoke}
      </g>
      ${plabel}
    </g>`;
  }

  /* --- 港（POIの港がスポットとして登録済みなら二重描画しない） --- */
  let portM = '';
  if (poi.port && proj.inBounds(poi.port.lat, poi.port.lng)){
    const pq = proj(poi.port.lat, poi.port.lng);
    const dup = spotsAll.some(s => (s.name||'').includes(poi.port.name))
             || spots.some(o => Math.hypot(o.q.x-pq.x, o.q.y-pq.y) < 2)
             || clusters.some(c => Math.hypot(c.x-pq.x, c.y-pq.y) < 5);
    if (!dup){
      portM = `<g pointer-events="none" transform="translate(${pq.x},${pq.y})">
        <circle r="${2.7*iv}" fill="#fff" stroke="#4a6fa5" stroke-width="${0.7*iv}"/>
        <text y="${0.95*iv}" text-anchor="middle" font-size="${2.6*iv}">⚓</text>
        <text y="${-3.6*iv}" text-anchor="middle" font-size="${2.7*iv}" font-weight="800" fill="#174a5c" ${halo(iv)}>${esc(poi.port.name)}</text>
      </g>`;
      layout.block(pq.x-2.9*iv, pq.y-2.9*iv, pq.x+2.9*iv, pq.y+2.9*iv);
    }
  }

  /* --- まとめマーカー（タップでズーム） --- */
  const clustersM = clusters.map(c => `
    <g class="kclu" data-cx="${c.x.toFixed(2)}" data-cy="${c.y.toFixed(2)}" transform="translate(${c.x.toFixed(2)},${c.y.toFixed(2)})">
      <circle r="${4.1*iv}" fill="#fff" stroke="#e8823c" stroke-width="${0.9*iv}" opacity=".97"/>
      <circle r="${4.9*iv}" fill="none" stroke="#e8823c" stroke-width="${0.35*iv}" stroke-dasharray="${1.1*iv} ${0.8*iv}" opacity=".85"/>
      <text y="${-0.3*iv}" text-anchor="middle" font-size="${3.0*iv}" font-weight="900" fill="#b95c1f">${c.count}</text>
      <text y="${2.6*iv}" text-anchor="middle" font-size="${1.7*iv}" font-weight="800" fill="#b95c1f">スポット</text>
    </g>`).join('');

  /* --- スポット（重なり回避つきラベル・移動分は引き出し線） --- */
  const spotsM = spots.map(o => {
    const { s } = o;
    if (!inView(o)) return '';
    const st = catStyle(s.cat);
    const isCamp = s.cat === 'キャンプ場';
    const isAir = /空港|飛行場/.test(s.name||'');
    const r = (isCamp ? 3.3 : 2.8)*iv;
    const ico = isAir ? '✈' : st.ico;
    const fs = 2.6*iv;
    const w = (s.name||'').length*fs*1.04, h = 3.1*iv;
    const c = layout.place(labelCands(o, w, h, iv), z >= 2);
    const label = c ? `<text x="${c.tx.toFixed(2)}" y="${c.ty.toFixed(2)}" text-anchor="${c.anchor}" font-size="${fs}" font-weight="800"
        fill="#1c4753" ${halo(iv)} pointer-events="none">${esc(s.name)}</text>` : '';
    const moved = Math.hypot(o.x-o.q.x, o.y-o.q.y) > 1.2*iv;
    const leader = moved ? `<path d="M ${o.q.x} ${o.q.y} L ${o.x.toFixed(2)} ${o.y.toFixed(2)}" stroke="#7d8f99" stroke-width="${0.3*iv}" opacity=".65"/>
      <circle cx="${o.q.x}" cy="${o.q.y}" r="${0.55*iv}" fill="${st.color}" opacity=".85"/>` : '';
    return `<g class="kspot" data-sid="${esc(s.id)}">
      ${leader}
      <g transform="translate(${o.x.toFixed(2)},${o.y.toFixed(2)})">
        <circle r="${r}" fill="#fff" stroke="${st.color}" stroke-width="${(isCamp?1.0:0.7)*iv}" opacity=".97"/>
        ${isCamp ? `<circle r="${r+0.75*iv}" fill="none" stroke="${st.color}" stroke-width="${0.35*iv}" opacity=".8"/>` : ''}
        <text y="${0.95*iv}" text-anchor="middle" font-size="${(isCamp?2.9:2.5)*iv}">${ico}</text>
      </g>${label}
    </g>`;
  }).join('');

  /* --- 画面固定UI（タイトル・方位・凡例・縮尺） --- */
  const ui = (() => {
    let out = `<g pointer-events="none" transform="translate(${vx} ${vy}) scale(${iv})" font-family="inherit">`;
    // タイトルリボン（パンフ風に上部中央。狭い画面ではCSSで非表示＝パネル見出しが代わり）
    out += `<g class="ktitle" transform="translate(${titleX},1.2)">
      <rect x="0.6" y="0.9" width="${titleW}" height="8.8" rx="4.4" fill="rgba(60,40,10,.18)"/>
      <rect x="0" y="0" width="${titleW}" height="8.8" rx="4.4" fill="#ff9f43"/>
      <rect x="0.8" y="0.8" width="${titleW-1.6}" height="7.2" rx="3.6" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="0.5" stroke-dasharray="1.7 1.2"/>
      <text x="${titleW/2}" y="6.2" text-anchor="middle" font-size="4" font-weight="900" fill="#fff">${esc(title)}</text>
    </g>`;
    // 地域・県名（左下）＋出典表記（海岸線・道路・集落はOSM由来）
    out += `<text x="2.2" y="98.2" font-size="2.3" font-weight="700" fill="#33667a" paint-order="stroke" stroke="#fff" stroke-width="0.9">${esc(is.region||'')}・${esc(is.pref||'')}</text>`;
    out += `<text x="2.2" y="95.6" font-size="1.6" font-weight="600" fill="#5f8ea0" paint-order="stroke" stroke="#fff" stroke-width="0.7">地図データ © OpenStreetMap contributors</text>`;
    // 方位記号（右上は「観光マップ／協会／拡大」ボタンと重なるため右下に置く）
    out += `<g transform="translate(93.5,92.5)">
      <circle r="4.6" fill="rgba(255,255,255,.92)" stroke="#7fb3c4" stroke-width="0.45"/>
      <path d="M 0 -3.3 L 1.15 1.7 L 0 0.8 L -1.15 1.7 Z" fill="#d84f43"/>
      <text y="-5.6" text-anchor="middle" font-size="3.4" font-weight="900" fill="#3b6c7e" paint-order="stroke" stroke="#fff" stroke-width="0.9">N</text>
    </g>`;
    // 縮尺（現在のズームに追従）
    const kmPer = iv*kmu; // 画面1単位あたりkm
    const nices = [0.5,1,2,3,5,10,20,30,50,100];
    let nice = nices[0];
    for (const n of nices){ if (n/kmPer <= 24) nice = n; }
    const L = nice/kmPer;
    const sx0 = 68 - L;
    out += `<g transform="translate(${sx0},95.6)">
      <rect x="-1.6" y="-3.6" width="${L+9}" height="6" rx="1.4" fill="rgba(255,255,255,.85)"/>
      <path d="M 0 0 L 0 -1.2 M 0 0 L ${L} 0 M ${L} 0 L ${L} -1.2" fill="none" stroke="#39606f" stroke-width="0.55"/>
      <text x="${L+1.2}" y="0.7" font-size="2.4" font-weight="800" fill="#39606f">${nice}km</text>
    </g>`;
    // 凡例（全体表示のときだけ・スポットの少ない側の隅に表示）
    if (LG.show){
      const entries = CATS.map(c => ({ ico:catStyle(c).ico, color:catStyle(c).color, label:c }));
      const rowH = 3.1;
      out += `<g transform="translate(${LG.pos.x0},${LG.pos.y0})">
        <rect width="${LG.w}" height="${LG.h}" rx="2" fill="rgba(255,255,255,.9)" stroke="#cfe0d0" stroke-width="0.35"/>`;
      entries.forEach((e,i) => {
        const col = i % 2, row = Math.floor(i/2);
        const ex = 1.6 + col*LG.colW, ey = 3.6 + row*rowH;
        out += `<circle cx="${ex+0.9}" cy="${ey-0.75}" r="0.95" fill="${e.color}"/>
          <text x="${ex+2.4}" y="${ey}" font-size="2.05" font-weight="700" fill="#37525e">${e.ico}${esc(e.label)}</text>`;
      });
      const ly = 3.6 + Math.ceil(entries.length/2)*rowH;
      out += `<path d="M 1.6 ${ly-0.8} h 5.4" stroke="#a97b48" stroke-width="1.3"/><path d="M 1.6 ${ly-0.8} h 5.4" stroke="#fffdf2" stroke-width="0.7"/>
        <text x="7.8" y="${ly}" font-size="2.05" font-weight="700" fill="#37525e">主要道路</text>
        <path d="M ${1.6+LG.colW} ${ly-0.8} h 5" stroke="#1f7fa8" stroke-width="0.5" stroke-dasharray="1.3 1"/>
        <text x="${7.4+LG.colW}" y="${ly}" font-size="2.05" font-weight="700" fill="#37525e">航路</text>`;
      out += `</g>`;
    }
    out += `</g>`;
    return out;
  })();

  return `<svg id="kmapSvg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet"
    font-family="'Hiragino Maru Gothic ProN','BIZ UDGothic','Rounded Mplus 1c',-apple-system,sans-serif">
    <defs>
      <linearGradient id="kSea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#c9ecf7"/><stop offset="100%" stop-color="#93d2e7"/>
      </linearGradient>
      <linearGradient id="kLand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e0f0b0"/><stop offset="100%" stop-color="#c8e494"/>
      </linearGradient>
      <radialGradient id="kHill" cx="46%" cy="42%" r="62%">
        <stop offset="0%" stop-color="#b3d489"/><stop offset="72%" stop-color="#94c273"/><stop offset="100%" stop-color="#84b567"/>
      </radialGradient>
      <clipPath id="kIsle"><polygon points="${ptsStr}"/></clipPath>
    </defs>
    <rect x="-60" y="-60" width="220" height="220" fill="url(#kSea)"/>
    ${contours}${waves}${critters}
    <polygon points="${ptsStr}" fill="none" stroke="#ffffff" stroke-width="4.6" stroke-linejoin="round" opacity="0.85"/>
    <polygon points="${ptsStr}" fill="none" stroke="#f2d98d" stroke-width="2.1" stroke-linejoin="round"/>
    <polygon points="${ptsStr}" fill="url(#kLand)" stroke="#7fae62" stroke-width="0.45" stroke-linejoin="round"/>
    <g clip-path="url(#kIsle)">${hillsSVG}${roadsSVG}</g>
    ${ferriesSVG}${townsSVG}${peakM}${portM}${clustersM}${spotsM}${ui}
  </svg>`;
}

/* ---------- 描画・モード切替 ---------- */
function render(is){
  const km = $('#kmap');
  if (!km) return;
  resetViewFor(is.id);
  curId = is.id;
  km.innerHTML = mapSVG(is) + `
    <div class="kmap-tools">
      <button data-kz="in" title="拡大">＋</button>
      <button data-kz="out" title="縮小">－</button>
      <button data-kz="reset" title="全体">⤢</button>
    </div>
    <div class="kmap-pop hidden" id="kpop"></div>`;
  wire(is);
}
function rerender(is){
  const km = $('#kmap');
  const old = km && km.querySelector('svg');
  if (old) old.outerHTML = mapSVG(is);
}
function apply(is){
  const wrap = $('#dmapwrap');
  if (!wrap) return;
  const ok = available(is);
  $('#kankoBtn').classList.toggle('hidden', !ok);
  if (!ok && mode){ mode = false; }
  wrap.classList.toggle('kanko', mode);
  $('#kmap').classList.toggle('hidden', !mode);
  $('#kankoBtn').classList.toggle('on', mode);
  if (mode) render(is);
}
function updateLink(is){
  const a = $('#kankoLink');
  if (!a) return;
  const k = KANKO_LINKS[is.id];
  a.classList.toggle('hidden', !k);
  if (!k) return;
  a.href = k.pdf || k.url;
  a.title = k.pdf
    ? `${k.pdfOrg || k.org}「${k.pdfName}」を開く（公式サーバーから直接表示）`
    : `${k.org}の公式マップ（パンフレット）ページを開く`;
}

/* ---------- 公式マップPDFビューア ---------- */
// PDFは発行元の公式サーバーから都度読み込む（このサイトでは再配布しない）。
// iframe不可（X-Frame-Options）の発行元と狭い画面では既定動作＝新しいタブで開く。
function canEmbed(k){
  return !!(k && k.pdf) && k.frame !== false && window.innerWidth >= 700;
}
function openPdfModal(is, k){
  const m = $('#kpdfModal');
  if (!m) return false;
  $('#kpdfTitle').textContent = `${is.name}：${k.pdfName}`;
  $('#kpdfOrg').textContent = k.pdfOrg || k.org;
  $('#kpdfOpen').href = k.pdf;
  $('#kpdfPage').href = k.url;
  $('#kpdfFrame').src = k.pdf;
  m.classList.remove('hidden');
  return true;
}
function closePdfModal(){
  const m = $('#kpdfModal');
  if (!m || m.classList.contains('hidden')) return;
  m.classList.add('hidden');
  $('#kpdfFrame').src = 'about:blank';
}

/* ---------- 操作（ズーム・パン・タップ） ---------- */
function wire(is){
  const km = $('#kmap');
  const zoomTo = z => { VIEW.z = Math.min(6, Math.max(1, z)); rerender(islandById(curId) || is); };
  km.querySelectorAll('[data-kz]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    if (b.dataset.kz === 'in')  zoomTo(VIEW.z * 1.5);
    if (b.dataset.kz === 'out') zoomTo(VIEW.z / 1.5);
    if (b.dataset.kz === 'reset'){ VIEW.cx = 50; VIEW.cy = 50; zoomTo(1); }
  }));
  let dragged = false;
  km.addEventListener('click', ev => {
    if (ev.target.closest('.kmap-tools') || ev.target.closest('.kmap-pop')) return;
    if (dragged){ dragged = false; return; }
    const cur = islandById(curId) || is;
    const cluEl = ev.target.closest('.kclu');
    if (cluEl && !pickCb){
      VIEW.cx = +cluEl.dataset.cx; VIEW.cy = +cluEl.dataset.cy;
      zoomTo(Math.max(VIEW.z*1.8, 2.4));
      return;
    }
    const spotEl = ev.target.closest('.kspot');
    if (spotEl && !pickCb){ showPop(cur, spotEl.dataset.sid); return; }
    const svgEl = km.querySelector('svg');
    if (!svgEl || !ev.target.closest('svg')) return;
    hidePop();
    // SVG座標 → 緯度経度
    const rect = svgEl.getBoundingClientRect();
    const vbv = svgEl.viewBox.baseVal;
    // preserveAspectRatio meet の余白を補正
    const sc = Math.min(rect.width / vbv.width, rect.height / vbv.height);
    const ox = (rect.width  - vbv.width  * sc) / 2;
    const oy = (rect.height - vbv.height * sc) / 2;
    const x = vbv.x + (ev.clientX - rect.left - ox) / sc;
    const y = vbv.y + (ev.clientY - rect.top  - oy) / sc;
    if (pickCb && PROJ){
      const cb = pickCb; pickCb = null;
      $('#dmapwrap').classList.remove('picking');
      cb(PROJ.inv(x, y));
    }
  });
  // ホイールズーム
  km.addEventListener('wheel', ev => {
    ev.preventDefault();
    zoomTo(VIEW.z * (ev.deltaY < 0 ? 1.2 : 0.83));
  }, {passive:false});
  // ドラッグ移動（ズーム中）＋ピンチ
  let pan = null, pinchD = null;
  const pt = ev => ev.touches ? {x:ev.touches[0].clientX, y:ev.touches[0].clientY} : {x:ev.clientX, y:ev.clientY};
  const dist = ev => Math.hypot(ev.touches[0].clientX-ev.touches[1].clientX, ev.touches[0].clientY-ev.touches[1].clientY);
  const start = ev => {
    if (ev.touches && ev.touches.length === 2){ pinchD = dist(ev); pan = null; return; }
    if (VIEW.z <= 1) return;
    pan = {...pt(ev), cx:VIEW.cx, cy:VIEW.cy};
  };
  const move = ev => {
    if (ev.touches && ev.touches.length === 2 && pinchD){
      const d = dist(ev); zoomTo(VIEW.z * d/pinchD); pinchD = d; return;
    }
    if (!pan) return;
    const p = pt(ev);
    const svgEl = km.querySelector('svg');
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const w = 100/VIEW.z;
    const dx = (p.x-pan.x)/rect.width*w, dy = (p.y-pan.y)/rect.height*w;
    if (Math.abs(p.x-pan.x) + Math.abs(p.y-pan.y) > 5) dragged = true;
    VIEW.cx = pan.cx - dx; VIEW.cy = pan.cy - dy;
    rerender(islandById(curId) || is);
  };
  const end = () => { pan = null; pinchD = null; };
  km.addEventListener('mousedown', start);
  km.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  km.addEventListener('touchstart', start, {passive:true});
  km.addEventListener('touchmove', move, {passive:true});
  km.addEventListener('touchend', end);
}

/* ---------- スポットのポップアップ ---------- */
function hidePop(){ $('#kpop')?.classList.add('hidden'); }
function showPop(is, sid){
  const s = liveList(is.spots).find(x => x.id === sid);
  if (!s) return;
  const el = $('#kpop');
  const st = catStyle(s.cat);
  el.innerHTML = `
    <div class="kp-r1"><span class="kp-ic" style="background:${st.color}">${st.ico}</span>
      <span class="kp-nm">${esc(s.name)}<span class="kp-cat">${esc(s.cat)}</span></span>
      <button class="kp-x">✕</button></div>
    ${s.note ? `<div class="kp-note">${esc(s.note)}</div>` : ''}
    <div class="kp-r2">
      ${/^https?:\/\/\S+$/i.test(s.url||'') ? `<a class="btn accent" target="_blank" rel="noopener" href="${esc(s.url)}">🔗 Web</a>` : ''}
      <button class="btn" data-kedit>✏️ 編集</button>
    </div>`;
  el.classList.remove('hidden');
  el.querySelector('.kp-x').onclick = hidePop;
  el.querySelector('[data-kedit]').onclick = () => { hidePop(); spotForm(is, s); };
}

/* ---------- 公開API ---------- */
return {
  active: () => mode,
  onOpen(is){ pickCb = null; hidePop(); updateLink(is); apply(is); },
  refresh(is){ if (mode && is.id === curId) render(is); },
  toggle(){
    const is = islandById(STATE.activeId);
    if (!is) return;
    mode = !mode;
    try { localStorage.setItem(MODE_KEY, mode ? 'kanko' : 'gsi'); } catch(e){}
    apply(is);
    if (!mode && typeof dmap !== 'undefined' && dmap) setTimeout(() => dmap.invalidateSize(), 60);
  },
  pick(cb){
    pickCb = cb;
    $('#dmapwrap').classList.add('picking');
  },
  // 公式マップPDFビューア（ボタン配線用の内部API）
  _links: id => KANKO_LINKS[id],
  _canEmbed: canEmbed,
  _openPdf: openPdfModal,
  _closePdf: closePdfModal,
};

})();

/* ---------- ボタン配線 ---------- */
document.querySelector('#kankoBtn')?.addEventListener('click', () => window.Kanko.toggle());
document.querySelector('#kankoLink')?.addEventListener('click', ev => {
  const is = window.islandById && islandById(STATE.activeId);
  const k = is && window.Kanko._links(is.id);
  if (!k || !window.Kanko._canEmbed(k)) return; // 既定動作＝新しいタブで開く
  if (window.Kanko._openPdf(is, k)) ev.preventDefault();
});
document.querySelector('#kpdfClose')?.addEventListener('click', () => window.Kanko._closePdf());
document.querySelector('#kpdfModal')?.addEventListener('click', ev => {
  if (ev.target.id === 'kpdfModal') window.Kanko._closePdf();
});
window.addEventListener('keydown', ev => { if (ev.key === 'Escape') window.Kanko._closePdf(); });
