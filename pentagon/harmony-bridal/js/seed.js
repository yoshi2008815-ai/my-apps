// ハーモニーブライダル - Seed Data
// デモ会員: demo@example.com / demo1234
// 管理者:   admin@harmony.jp / admin1234

const SEED_DATA = {
  settings: {
    serviceName: 'ハーモニーブライダル',
    serviceNameEn: 'Harmony Bridal',
    tagline: 'あなたの「運命の人」との出会いをサポート',
    supportPhone: '0120-123-456',
    contactEmail: 'info@harmony-bridal.jp',
    monthlyFee: 32000,
    admissionFee: 330000,
    basicIntroCount: 2
  },

  admins: [
    { id: 'A001', email: 'admin@harmony.jp', password: 'admin1234', name: 'システム管理者', role: 'superadmin' },
    { id: 'A002', email: 'manager@harmony.jp', password: 'manager1234', name: '佐々木 健一', role: 'manager' }
  ],

  advisors: [
    { id: 'ADV001', name: '山田 花子', branch: '東京本店', tel: '03-1234-5678', email: 'yamada@harmony-bridal.jp' },
    { id: 'ADV002', name: '鈴木 太郎', branch: '渋谷支店', tel: '03-2345-6789', email: 'suzuki@harmony-bridal.jp' },
    { id: 'ADV003', name: '佐藤 和子', branch: '新宿支店', tel: '03-3456-7890', email: 'sato@harmony-bridal.jp' }
  ],

  members: [
    {
      id: 'M001', email: 'demo@example.com', password: 'demo1234',
      name: '田中 美咲', nameKana: 'タナカ ミサキ', gender: 'female',
      birthdate: '1997-03-15', prefecture: '東京都', city: '渋谷区',
      occupation: 'IT系会社員', income: '400〜500万円', height: 162,
      education: '大学卒', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: 'たまに飲む', religion: '特になし',
      hobbies: ['旅行', '料理', '映画鑑賞'],
      selfIntroduction: '明るく活発な性格です。休日は料理や旅行を楽しんでいます。温かい家庭を築きたいと思っています。将来は子供と一緒に過ごせる素敵な家庭を作りたいです。',
      desiredAge: '28〜38歳', desiredPrefecture: '首都圏希望',
      desiredOccupation: '特にこだわらない', desiredIncome: '500万円以上',
      desiredHeight: '168cm以上', desiredSmoke: '吸わない方',
      status: 'active', joinDate: '2025-06-01', planType: 'standard',
      advisorId: 'ADV001', branch: '東京本店',
      membershipEndDate: '2027-05-31', introductionFrequency: 2,
      nextDeductionAmount: 32000, nextDeductionDate: '2026-07-01',
      suspended: false, suspendStartDate: null, suspendEndDate: null,
      notificationEmail: 'demo@example.com',
      emailSettings: { news: true, matching: true, event: true, system: true },
      verified: true, photoCount: 2, color: '#C45C82'
    },
    {
      id: 'M002', email: 'suzuki.a@example.com', password: 'pass1234',
      name: '鈴木 彩香', nameKana: 'スズキ アヤカ', gender: 'female',
      birthdate: '1999-07-22', prefecture: '神奈川県', city: '横浜市',
      occupation: '看護師', income: '350〜400万円', height: 158,
      education: '大学卒', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: '飲まない', religion: '特になし',
      hobbies: ['読書', 'ヨガ', 'カフェ巡り'],
      selfIntroduction: '看護師として働いています。休日はヨガや読書を楽しんでいます。',
      status: 'active', joinDate: '2025-08-15', planType: 'standard',
      advisorId: 'ADV002', branch: '渋谷支店', verified: true, photoCount: 1, color: '#E8667A'
    },
    {
      id: 'M003', email: 'yamada.m@example.com', password: 'pass1234',
      name: '山田 真由', nameKana: 'ヤマダ マユ', gender: 'female',
      birthdate: '1996-04-10', prefecture: '東京都', city: '世田谷区',
      occupation: '事務職', income: '300〜350万円', height: 160,
      education: '短大卒', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: 'たまに飲む', religion: '特になし',
      hobbies: ['ガーデニング', 'お菓子作り', '映画'],
      selfIntroduction: '穏やかな性格です。将来は優しい家庭を作りたいです。',
      status: 'active', joinDate: '2025-07-20', planType: 'standard',
      advisorId: 'ADV001', branch: '東京本店', verified: true, photoCount: 2, color: '#B87C9E'
    },
    {
      id: 'M004', email: 'ito.y@example.com', password: 'pass1234',
      name: '伊藤 由梨', nameKana: 'イトウ ユリ', gender: 'female',
      birthdate: '1998-09-15', prefecture: '千葉県', city: '千葉市',
      occupation: '教師', income: '400〜500万円', height: 165,
      education: '大学卒', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: '飲まない', religion: '特になし',
      hobbies: ['スポーツ観戦', '旅行', '音楽'],
      selfIntroduction: '小学校で教えています。子供が好きで、にぎやかな家庭にあこがれています。',
      status: 'active', joinDate: '2025-09-01', planType: 'standard',
      advisorId: 'ADV003', branch: '新宿支店', verified: true, photoCount: 1, color: '#D4709A'
    },
    {
      id: 'M005', email: 'watanabe.s@example.com', password: 'pass1234',
      name: '渡辺 沙織', nameKana: 'ワタナベ サオリ', gender: 'female',
      birthdate: '1995-01-28', prefecture: '埼玉県', city: 'さいたま市',
      occupation: '会社員（管理職）', income: '600〜700万円', height: 159,
      education: '大学卒', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: 'たまに飲む', religion: '特になし',
      hobbies: ['ゴルフ', 'ワイン', '料理'],
      selfIntroduction: 'キャリアウーマンですが、家庭も大切にしたいと思っています。',
      status: 'active', joinDate: '2025-05-10', planType: 'premium',
      advisorId: 'ADV001', branch: '東京本店', verified: true, photoCount: 3, color: '#C06B9C'
    },
    {
      id: 'M006', email: 'nakamura.e@example.com', password: 'pass1234',
      name: '中村 恵美', nameKana: 'ナカムラ エミ', gender: 'female',
      birthdate: '2000-11-05', prefecture: '東京都', city: '目黒区',
      occupation: 'デザイナー', income: '350〜400万円', height: 163,
      education: '専門学校卒', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: 'たまに飲む', religion: '特になし',
      hobbies: ['アート', 'カフェ', 'ファッション'],
      selfIntroduction: 'グラフィックデザイナーとして働いています。センスの合う方との出会いを大切にしたいです。',
      status: 'active', joinDate: '2025-10-15', planType: 'standard',
      advisorId: 'ADV002', branch: '渋谷支店', verified: false, photoCount: 1, color: '#E07CAC'
    },
    {
      id: 'M007', email: 'kobayashi.m@example.com', password: 'pass1234',
      name: '小林 桃子', nameKana: 'コバヤシ モモコ', gender: 'female',
      birthdate: '1994-03-19', prefecture: '神奈川県', city: '川崎市',
      occupation: '薬剤師', income: '500〜600万円', height: 157,
      education: '大学卒', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: '飲まない', religion: '特になし',
      hobbies: ['料理', '読書', '散歩'],
      selfIntroduction: '薬剤師として地域医療に携わっています。落ち着いた家庭を築きたいです。',
      status: 'active', joinDate: '2025-04-01', planType: 'standard',
      advisorId: 'ADV002', branch: '渋谷支店', verified: true, photoCount: 2, color: '#CC7AB0'
    },
    {
      id: 'M008', email: 'kato.r@example.com', password: 'pass1234',
      name: '加藤 梨花', nameKana: 'カトウ リカ', gender: 'female',
      birthdate: '1997-08-25', prefecture: '東京都', city: '杉並区',
      occupation: '営業職', income: '400〜500万円', height: 161,
      education: '大学卒', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: 'たまに飲む', religion: '特になし',
      hobbies: ['テニス', '旅行', 'ショッピング'],
      selfIntroduction: '明るくコミュニケーション好きです。一緒に楽しい時間を共有できる方を求めています。',
      status: 'active', joinDate: '2025-11-01', planType: 'standard',
      advisorId: 'ADV003', branch: '新宿支店', verified: true, photoCount: 1, color: '#D85E96'
    },
    {
      id: 'M009', email: 'sato.k@example.com', password: 'pass1234',
      name: '佐藤 健太', nameKana: 'サトウ ケンタ', gender: 'male',
      birthdate: '1994-05-10', prefecture: '東京都', city: '千代田区',
      occupation: 'ITエンジニア', income: '600〜700万円', height: 175,
      education: '大学院卒', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: 'たまに飲む', religion: '特になし',
      hobbies: ['登山', 'ギター', '料理'],
      selfIntroduction: 'エンジニアとして働いています。休日は登山や料理を楽しんでいます。一緒に成長できるパートナーを探しています。',
      desiredAge: '25〜33歳', desiredPrefecture: '首都圏',
      status: 'active', joinDate: '2025-05-20', planType: 'premium',
      advisorId: 'ADV001', branch: '東京本店', verified: true, photoCount: 3, color: '#5B9BD5'
    },
    {
      id: 'M010', email: 'takahashi.s@example.com', password: 'pass1234',
      name: '高橋 翔', nameKana: 'タカハシ ショウ', gender: 'male',
      birthdate: '1996-09-22', prefecture: '神奈川県', city: '横浜市',
      occupation: '医師', income: '1000万円以上', height: 178,
      education: '大学院卒（医学）', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: 'たまに飲む', religion: '特になし',
      hobbies: ['テニス', 'ゴルフ', '読書'],
      selfIntroduction: '内科医として働いています。仕事は忙しいですが、プライベートを大切にしたいと思っています。',
      desiredAge: '25〜32歳',
      status: 'active', joinDate: '2025-06-15', planType: 'premium',
      advisorId: 'ADV001', branch: '東京本店', verified: true, photoCount: 2, color: '#4A90D9'
    },
    {
      id: 'M011', email: 'tanaka.k@example.com', password: 'pass1234',
      name: '田中 康平', nameKana: 'タナカ コウヘイ', gender: 'male',
      birthdate: '1993-02-14', prefecture: '東京都', city: '港区',
      occupation: '弁護士', income: '1000万円以上', height: 172,
      education: '大学院卒（法律）', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: 'たまに飲む', religion: '特になし',
      hobbies: ['読書', 'ワイン', 'クラシック音楽'],
      selfIntroduction: '弁護士として働いています。知的でユーモアのある方と出会いたいです。',
      desiredAge: '26〜34歳',
      status: 'active', joinDate: '2025-04-10', planType: 'premium',
      advisorId: 'ADV001', branch: '東京本店', verified: true, photoCount: 2, color: '#3D7DC8'
    },
    {
      id: 'M012', email: 'ito.d@example.com', password: 'pass1234',
      name: '伊藤 大輝', nameKana: 'イトウ ダイキ', gender: 'male',
      birthdate: '1997-11-30', prefecture: '埼玉県', city: '川越市',
      occupation: '公務員', income: '400〜500万円', height: 170,
      education: '大学卒', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: 'たまに飲む', religion: '特になし',
      hobbies: ['サッカー', 'ドライブ', 'キャンプ'],
      selfIntroduction: '公務員として働いています。穏やかで誠実な性格です。アウトドアが好きです。',
      desiredAge: '25〜32歳',
      status: 'active', joinDate: '2025-07-01', planType: 'standard',
      advisorId: 'ADV003', branch: '新宿支店', verified: true, photoCount: 1, color: '#5588C4'
    },
    {
      id: 'M013', email: 'watanabe.k@example.com', password: 'pass1234',
      name: '渡辺 浩二', nameKana: 'ワタナベ コウジ', gender: 'male',
      birthdate: '1992-08-06', prefecture: '東京都', city: '渋谷区',
      occupation: '会社経営', income: '1000万円以上', height: 176,
      education: '大学卒', maritalStatus: '未婚', children: 'なし',
      smoking: 'たまに吸う', drinking: 'よく飲む', religion: '特になし',
      hobbies: ['ゴルフ', '海外旅行', 'グルメ'],
      selfIntroduction: '事業を経営しています。自由な時間は旅行やゴルフを楽しんでいます。',
      desiredAge: '25〜35歳',
      status: 'active', joinDate: '2025-03-01', planType: 'premium',
      advisorId: 'ADV001', branch: '東京本店', verified: true, photoCount: 3, color: '#2A6BB5'
    },
    {
      id: 'M014', email: 'nakamura.t@example.com', password: 'pass1234',
      name: '中村 拓也', nameKana: 'ナカムラ タクヤ', gender: 'male',
      birthdate: '1995-12-18', prefecture: '千葉県', city: '船橋市',
      occupation: '銀行員', income: '500〜600万円', height: 173,
      education: '大学卒', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: 'たまに飲む', religion: '特になし',
      hobbies: ['ジョギング', '映画', '料理'],
      selfIntroduction: '銀行で働いています。几帳面で誠実な性格です。家庭を大切にしたいと思っています。',
      desiredAge: '25〜32歳',
      status: 'active', joinDate: '2025-08-20', planType: 'standard',
      advisorId: 'ADV002', branch: '渋谷支店', verified: true, photoCount: 1, color: '#4477BB'
    },
    {
      id: 'M015', email: 'kobayashi.m2@example.com', password: 'pass1234',
      name: '小林 誠', nameKana: 'コバヤシ マコト', gender: 'male',
      birthdate: '1993-06-25', prefecture: '東京都', city: '文京区',
      occupation: '研究者（大学教員）', income: '600〜700万円', height: 171,
      education: '大学院卒（理工系）', maritalStatus: '未婚', children: 'なし',
      smoking: '吸わない', drinking: '飲まない', religion: '特になし',
      hobbies: ['囲碁', 'クラシック音楽', '読書'],
      selfIntroduction: '大学で研究しています。穏やかで落ち着いた性格です。知的な会話を楽しめる方を探しています。',
      desiredAge: '25〜35歳',
      status: 'active', joinDate: '2025-09-10', planType: 'standard',
      advisorId: 'ADV001', branch: '東京本店', verified: true, photoCount: 1, color: '#3A68A8'
    }
  ],

  events: [
    {
      id: 'E001', name: '夏の出会いパーティー in 恵比寿',
      type: 'party', date: '2026-07-05', time: '14:00〜17:00',
      location: '恵比寿ガーデンプレイス会議室', prefecture: '東京都',
      description: '夏の素敵な出会いをお手伝いする交流パーティーです。気軽に参加できるカジュアルな雰囲気で行います。お一人でも安心してご参加いただけます。',
      capacity: { male: 15, female: 15 }, registered: { male: 8, female: 11 },
      fee: 3000, ageRange: '25〜40歳', status: 'open', emoji: '🌸',
      category: 'party'
    },
    {
      id: 'E002', name: 'ランチ交流会 in 新宿',
      type: 'lunch', date: '2026-07-12', time: '11:30〜13:30',
      location: 'レストラン ハーモニー 新宿店', prefecture: '東京都',
      description: '美味しいランチを囲みながら、気軽に交流できるイベントです。少人数制でゆっくり話せます。',
      capacity: { male: 8, female: 8 }, registered: { male: 3, female: 6 },
      fee: 2000, ageRange: '25〜38歳', status: 'open', emoji: '🍽️',
      category: 'lunch'
    },
    {
      id: 'E003', name: '婚活成功セミナー〜専門家が語る成婚のコツ〜',
      type: 'seminar', date: '2026-07-19', time: '10:00〜12:00',
      location: 'ハーモニーブライダル 東京本店 セミナールーム', prefecture: '東京都',
      description: '成婚率アップのポイントを専任アドバイザーが直接お伝えします。プロフィール改善や会話術など実践的な内容です。',
      capacity: { male: 20, female: 20 }, registered: { male: 12, female: 15 },
      fee: 1000, ageRange: '全年齢対象', status: 'open', emoji: '📚',
      category: 'seminar'
    },
    {
      id: 'E004', name: 'サマーナイトパーティー in 渋谷',
      type: 'party', date: '2026-06-28', time: '18:00〜21:00',
      location: 'THE ROOFTOP TERRACE 渋谷', prefecture: '東京都',
      description: '夏の夜をテーマにしたおしゃれなパーティーです。ドレスコードはスマートカジュアル。フリードリンク付き。',
      capacity: { male: 20, female: 20 }, registered: { male: 14, female: 17 },
      fee: 4000, ageRange: '25〜42歳', status: 'open', emoji: '🌃',
      category: 'party', registeredMembers: ['M001']
    },
    {
      id: 'E005', name: 'スポーツ交流イベント（テニス）',
      type: 'sports', date: '2026-08-09', time: '09:00〜12:00',
      location: '代々木テニスコート', prefecture: '東京都',
      description: 'テニスを楽しみながら交流するスポーツイベントです。初心者も歓迎！',
      capacity: { male: 10, female: 10 }, registered: { male: 4, female: 3 },
      fee: 2500, ageRange: '23〜40歳', status: 'open', emoji: '🎾',
      category: 'sports'
    },
    {
      id: 'E006', name: 'アフタヌーンティー交流会 in 表参道',
      type: 'tea', date: '2026-08-16', time: '14:00〜16:30',
      location: 'ホテル表参道 ラウンジ', prefecture: '東京都',
      description: '優雅なアフタヌーンティーを楽しみながらの交流会。上品な雰囲気の中でゆっくりお話しできます。',
      capacity: { male: 12, female: 12 }, registered: { male: 2, female: 5 },
      fee: 5000, ageRange: '28〜45歳', status: 'open', emoji: '🫖',
      category: 'tea'
    },
    {
      id: 'E007', name: '婚活写真セミナー＆撮影会',
      type: 'seminar', date: '2026-06-10', time: '13:00〜16:00',
      location: 'ハーモニーブライダル 品川支店', prefecture: '東京都',
      description: '婚活で使えるプロフィール写真の撮影テクニックを学ぶセミナーです。実際に撮影も行います。',
      capacity: { male: 10, female: 10 }, registered: { male: 10, female: 10 },
      fee: 3000, ageRange: '全年齢対象', status: 'closed', emoji: '📸',
      category: 'seminar', registeredMembers: ['M001']
    }
  ],

  eventRegistrations: [
    { id: 'ER001', memberId: 'M001', eventId: 'E004', registeredAt: '2026-06-03', status: 'confirmed', attendance: null },
    { id: 'ER002', memberId: 'M001', eventId: 'E007', registeredAt: '2026-05-25', status: 'confirmed', attendance: 'attended' }
  ],

  introductions: [
    {
      id: 'INT001', fromMemberId: 'M001', toMemberId: 'M009',
      deliveredAt: '2026-06-01', expiresAt: '2026-06-30',
      status: 'delivered', advisorNote: '共通の趣味（料理）がありますね。ぜひプロフィールをご確認ください。',
      month: '2026-06'
    },
    {
      id: 'INT002', fromMemberId: 'M001', toMemberId: 'M010',
      deliveredAt: '2026-06-01', expiresAt: '2026-06-30',
      status: 'delivered', advisorNote: '誠実で安定した方です。ぜひ一度お話しされてみてはいかがでしょうか。',
      month: '2026-06'
    },
    {
      id: 'INT003', fromMemberId: 'M001', toMemberId: 'M011',
      deliveredAt: '2026-06-01', expiresAt: '2026-06-30',
      status: 'applied', advisorNote: '知的でしっかりされた方です。趣味も合いそうですね。',
      month: '2026-06'
    }
  ],

  stars: [
    { id: 'S001', fromMemberId: 'M001', toMemberId: 'M015', sentAt: '2026-06-10', status: 'pending' },
    { id: 'S002', fromMemberId: 'M009', toMemberId: 'M001', sentAt: '2026-06-08', status: 'matched' },
    { id: 'S003', fromMemberId: 'M001', toMemberId: 'M009', sentAt: '2026-06-09', status: 'matched' },
    { id: 'S004', fromMemberId: 'M013', toMemberId: 'M001', sentAt: '2026-06-12', status: 'pending' }
  ],

  talkApplications: [
    {
      id: 'TA001', fromMemberId: 'M001', toMemberId: 'M011',
      sentAt: '2026-06-08', status: 'pending',
      message: 'プロフィール拝見しました。共通の趣味が多く、ぜひお話しできればと思いメッセージしました。',
      questionnaire: { purpose: '真剣にパートナーを探しています', strength: '明るく前向きな性格', hobby: '料理と旅行' }
    },
    {
      id: 'TA002', fromMemberId: 'M014', toMemberId: 'M001',
      sentAt: '2026-06-14', status: 'pending',
      message: 'プロフィールを拝見して、素敵な方だと思いメッセージしました。ぜひお話しの機会をいただければと思います。',
      questionnaire: { purpose: '結婚を前提とした真剣なお付き合い', strength: '誠実で家庭を大切にします', hobby: 'ジョギングと料理' }
    },
    {
      id: 'TA003', fromMemberId: 'M001', toMemberId: 'M009',
      sentAt: '2026-05-20', status: 'accepted',
      message: '登山が好きとのこと、私も旅行が好きなのでぜひ話してみたいです。',
      questionnaire: { purpose: '真剣なお付き合い希望', strength: '明るく行動的', hobby: '料理と旅行' }
    }
  ],

  omiaApplications: [
    {
      id: 'OA001', fromMemberId: 'M001', toMemberId: 'M010',
      sentAt: '2026-06-05', status: 'pending',
      preferredDates: ['2026-07-10', '2026-07-12', '2026-07-17'],
      preferredLocations: ['東京（恵比寿・代官山エリア）']
    }
  ],

  bulletinBoards: [
    {
      id: 'B001', member1Id: 'M001', member2Id: 'M012',
      openedAt: '2026-05-15', status: 'active',
      openReason: 'introduction',
      member1Disclosure: false, member2Disclosure: false
    },
    {
      id: 'B002', member1Id: 'M001', member2Id: 'M009',
      openedAt: '2026-06-10', status: 'active',
      openReason: 'star_match',
      member1Disclosure: true, member2Disclosure: false
    }
  ],

  boardMessages: [
    { id: 'BM001', boardId: 'B001', senderId: 'M012', text: 'はじめまして！田中さんのプロフィールを見て、一度お話しできればと思いました。', sentAt: '2026-05-15T14:30:00', read: true },
    { id: 'BM002', boardId: 'B001', senderId: 'M001', text: 'はじめまして！こちらこそよろしくお願いします。伊藤さんのアウトドア好きというところに惹かれました🌿', sentAt: '2026-05-15T18:45:00', read: true },
    { id: 'BM003', boardId: 'B001', senderId: 'M012', text: 'ありがとうございます！田中さんは旅行が好きとのこと、国内ですか？海外もよく行かれますか？', sentAt: '2026-05-16T10:20:00', read: true },
    { id: 'BM004', boardId: 'B001', senderId: 'M001', text: '国内が多いですが、年に1回は海外にも行きます！先日は台湾に行ってきました。伊藤さんはどんなキャンプ場が好きですか？', sentAt: '2026-05-16T19:00:00', read: true },
    { id: 'BM005', boardId: 'B001', senderId: 'M012', text: '台湾いいですね！私は山梨や長野のキャンプ場が好きです。星がきれいで最高ですよ✨', sentAt: '2026-05-17T08:30:00', read: true },
    { id: 'BM006', boardId: 'B001', senderId: 'M001', text: '星空のキャンプ、素敵ですね！私もいつか行ってみたいと思っていました。', sentAt: '2026-05-17T20:00:00', read: true },
    { id: 'BM007', boardId: 'B001', senderId: 'M012', text: '機会があればぜひ！ところで、田中さんはどんな料理が得意ですか？', sentAt: '2026-06-12T09:15:00', read: false },
    { id: 'BM008', boardId: 'B002', senderId: 'M009', text: 'はじめまして、佐藤です！スターありがとうございました😊 田中さんのプロフィール拝見して、料理が好きとのこと、私もよく料理します！', sentAt: '2026-06-10T20:00:00', read: true },
    { id: 'BM009', boardId: 'B002', senderId: 'M001', text: 'はじめまして！佐藤さんも料理されるんですね。ITの仕事しながら登山もされているなんてアクティブですね！', sentAt: '2026-06-11T09:30:00', read: true },
    { id: 'BM010', boardId: 'B002', senderId: 'M009', text: '登山は月1〜2回ですが、楽しいですよ！田中さんは旅行好きとのことで、最近どこかに行かれましたか？', sentAt: '2026-06-11T12:00:00', read: true },
    { id: 'BM011', boardId: 'B002', senderId: 'M001', text: '先月沖縄に行ってきました！海がきれいで最高でした🌊 佐藤さんは山派ですか？', sentAt: '2026-06-11T19:45:00', read: true },
    { id: 'BM012', boardId: 'B002', senderId: 'M009', text: '沖縄いいですね！私は基本的に山派ですが、海も好きです。いつか沖縄でシュノーケルしてみたいと思っています。', sentAt: '2026-06-12T08:00:00', read: false }
  ],

  inquiries: [
    { id: 'INQ001', memberId: 'M001', advisorId: 'ADV001', subject: '紹介書について', status: 'answered', createdAt: '2026-06-03T10:00:00' },
    { id: 'INQ002', memberId: 'M001', advisorId: 'ADV001', subject: 'プロフィール写真の変更について', status: 'open', createdAt: '2026-06-15T14:30:00' }
  ],

  inquiryMessages: [
    { id: 'IQ001', inquiryId: 'INQ001', senderId: 'M001', senderType: 'member', text: '今月の紹介書が届きましたが、お話し申込はどのように行えばよいでしょうか？', sentAt: '2026-06-03T10:00:00' },
    { id: 'IQ002', inquiryId: 'INQ001', senderId: 'ADV001', senderType: 'advisor', text: 'お問い合わせありがとうございます。紹介書の画面から「お話し申込」ボタンをタップすると、アンケートとメッセージを入力していただける画面が表示されます。ぜひご活用ください！', sentAt: '2026-06-03T14:00:00' },
    { id: 'IQ003', inquiryId: 'INQ001', senderId: 'M001', senderType: 'member', text: 'ありがとうございます！やってみます。', sentAt: '2026-06-03T15:30:00' },
    { id: 'IQ004', inquiryId: 'INQ002', senderId: 'M001', senderType: 'member', text: 'プロフィール写真を新しく撮り直したいのですが、変更する方法を教えていただけますか？', sentAt: '2026-06-15T14:30:00' }
  ],

  notifications: [
    { id: 'NOT001', memberId: 'M001', type: 'matching', icon: '💌', title: '新しい紹介書が届きました', body: '今月の紹介書が3件届いています。ぜひプロフィールをご確認ください。', createdAt: '2026-06-01T09:00:00', read: false, link: '/member/introductions.html' },
    { id: 'NOT002', memberId: 'M001', type: 'application', icon: '💬', title: 'お話し申込が届いています', body: '中村 拓也さんからお話し申込が届いています。内容をご確認ください。', createdAt: '2026-06-14T11:00:00', read: false, link: '/member/applications.html' },
    { id: 'NOT003', memberId: 'M001', type: 'event', icon: '📅', title: 'イベント申込が確定しました', body: '6/28（土）サマーナイトパーティーのお申込みが確定しました。', createdAt: '2026-06-03T16:00:00', read: true, link: '/member/events.html' },
    { id: 'NOT004', memberId: 'M001', type: 'system', icon: '✅', title: 'プロフィール審査が完了しました', body: 'プロフィールの審査が完了しました。これで全機能をご利用いただけます。', createdAt: '2026-06-02T10:00:00', read: true, link: '/member/profile.html' },
    { id: 'NOT005', memberId: 'M001', type: 'info', icon: '📢', title: '今月の紹介書配信のお知らせ', body: '6月1日より、今月分の紹介書が配信されます。お楽しみに！', createdAt: '2026-05-28T09:00:00', read: true, link: null },
    { id: 'NOT006', memberId: 'M001', type: 'system', icon: '🔧', title: 'システムメンテナンスのお知らせ', body: '6月20日（土）2:00〜4:00の間、システムメンテナンスを実施予定です。ご不便をおかけしますが、ご理解のほどよろしくお願いいたします。', createdAt: '2026-06-18T10:00:00', read: false, link: null },
    { id: 'NOT007', memberId: 'M001', type: 'message', icon: '💬', title: '新しいメッセージが届いています', body: '伊藤 大輝さんから新しいメッセージが届いています。', createdAt: '2026-06-12T09:20:00', read: false, link: '/member/board.html?id=B001' }
  ],

  documents: [
    { id: 'DOC001', memberId: 'M001', type: '独身証明書', status: 'approved', submittedAt: '2026-06-05', reviewedAt: '2026-06-07', note: '' },
    { id: 'DOC002', memberId: 'M001', type: '収入証明書', status: 'pending', submittedAt: '2026-06-05', reviewedAt: null, note: '' },
    { id: 'DOC003', memberId: 'M001', type: '住民票', status: 'not_submitted', submittedAt: null, reviewedAt: null, note: '' },
    { id: 'DOC004', memberId: 'M001', type: '卒業証明書', status: 'not_submitted', submittedAt: null, reviewedAt: null, note: '任意提出' }
  ],

  options: [
    { id: 'O001', name: 'ピックアップ掲載', icon: '⭐', description: '写真検索の上部にプロフィールを掲載。露出を大幅アップして出会いのチャンスを広げます。', price: 3300, unit: '月', type: 'monthly' },
    { id: 'O002', name: 'フォト掲載追加', icon: '📷', description: 'プロフィール画面の写真を3枚まで追加掲載できます。より魅力的なプロフィールに。', price: 2200, unit: '枚', type: 'onetime' },
    { id: 'O003', name: 'ムービー掲載', icon: '🎥', description: 'プロフィール画面に60秒以内の動画を掲載。写真では伝わりきらない魅力をアピール。', price: 3300, unit: '本', type: 'onetime' },
    { id: 'O004', name: '申込権利追加', icon: '💌', description: 'お話し申込、スター送信の権利を追加購入できます。より多くの方へアプローチが可能に。', price: 5500, unit: '件', type: 'onetime' }
  ],

  videos: [
    { id: 'V001', title: '初めての婚活ガイド〜結婚相談所の使い方〜', category: '婚活入門', duration: '15:32', instructor: '山田 花子 アドバイザー', description: '結婚相談所での活動の流れや、婚活を成功させるためのポイントを解説します。', youtubeId: 'dQw4w9WgXcQ', thumbnail: '📖', views: 1240 },
    { id: 'V002', title: 'プロフィール写真の撮り方〜第一印象を最大化〜', category: 'プロフィール', duration: '12:45', instructor: '写真家 田村 誠', description: '婚活に使えるプロフィール写真の撮影テクニックを詳しく解説します。', youtubeId: 'dQw4w9WgXcQ', thumbnail: '📸', views: 985 },
    { id: 'V003', title: '成婚者インタビュー vol.1 〜7ヶ月での成婚ストーリー〜', category: '成婚者の声', duration: '20:15', instructor: '成婚者ご夫婦', description: 'ハーモニーブライダルで7ヶ月で成婚されたカップルにインタビュー。成功の秘訣を語っていただきました。', youtubeId: 'dQw4w9WgXcQ', thumbnail: '💑', views: 3256 },
    { id: 'V004', title: '自分磨き講座〜会話が上手くなる7つのコツ〜', category: '自分磨き', duration: '18:20', instructor: 'コーチ 伊藤 美香', description: '婚活で差がつく会話術を実践的に解説。相手の話の聞き方から自己開示の方法まで。', youtubeId: 'dQw4w9WgXcQ', thumbnail: '💬', views: 2108 },
    { id: 'V005', title: '成婚者インタビュー vol.2 〜30代での出会いと決断〜', category: '成婚者の声', duration: '25:40', instructor: '成婚者ご夫婦', description: '30代で婚活を始め、ハーモニーブライダルで出会ったカップルのストーリー。', youtubeId: 'dQw4w9WgXcQ', thumbnail: '💑', views: 2890 },
    { id: 'V006', title: 'お見合いの心得〜初対面を成功させるポイント〜', category: '婚活入門', duration: '14:10', instructor: '山田 花子 アドバイザー', description: 'お見合い当日の服装、会話のポイント、印象管理など実践的なアドバイスをお伝えします。', youtubeId: 'dQw4w9WgXcQ', thumbnail: '🤝', views: 1876 }
  ],

  globalNotifications: [
    { id: 'GN001', title: '【夏季限定】入会金半額キャンペーン実施中！', body: '7月31日まで、入会金が通常330,000円→165,000円になるキャンペーンを実施中です。', createdAt: '2026-06-01', important: true },
    { id: 'GN002', title: '累計成婚者数12,500組を突破しました！', body: 'おかげさまで、累計成婚者数が12,500組を突破しました。皆様のご支援に感謝申し上げます。', createdAt: '2026-05-15', important: false },
    { id: 'GN003', title: 'アプリのアップデートについて', body: '6月20日に会員アプリのアップデートを行います。新機能「ビデオ通話」が追加されます。', createdAt: '2026-06-10', important: false }
  ]
};
