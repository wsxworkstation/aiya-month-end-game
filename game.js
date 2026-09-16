(() => {
  "use strict";

  const GAME_KEY = "aiyaMonthEndGame_checkpoint_v1";
  const COLLECTION_KEY = "aiyaMonthEndGame_collection_v1";
  const SETTINGS_KEY = "aiyaMonthEndGame_settings_v1";
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const money = (value) => `${value < 0 ? "-" : ""}$${Math.abs(Math.round(value)).toLocaleString("en-US")}`;
  const random = (items) => items[Math.floor(Math.random() * items.length)];
  const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);

  const screens = {
    title: $("#title-screen"),
    game: $("#game-screen"),
    end: $("#end-screen")
  };
  const modalLayer = $("#modal-layer");
  const modal = $("#modal");
  const modalContent = $("#modal-content");
  const modalClose = $("#modal-close");
  const canvas = $("#game-canvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;

  const HOUSES = [
    { id: "home", name: "你的小窝", icon: "🏠", rent: 220, sleep: 20, x: 382, y: 369, w: 196, h: 120, color: "#e28c68" }
  ];

  // Collision footprints follow town-map-v2.png. The new map is deliberately simple:
  // one broad loop road, short direct approaches, and one home. Every entrance faces
  // the same connected road system -- re-run scripts/check-layout before moving one.
  const BASE_BUILDINGS = [
    { id: "work", label: "摸鱼有限公司", icon: "💼", x: 118, y: 28, w: 151, h: 150, color: "#df795f" },
    { id: "bank", label: "稳稳银行", icon: "🏦", x: 298, y: 28, w: 151, h: 150, color: "#e9c352" },
    { id: "stock", label: "涨跌交易所", icon: "📈", x: 519, y: 18, w: 146, h: 164, color: "#5d9bd4" },
    { id: "roi", label: "回报研究所", icon: "🎯", x: 717, y: 24, w: 156, h: 166, color: "#8771bd" },
    { id: "food", label: "月底食堂", icon: "🍜", x: 12, y: 221, w: 185, h: 122, color: "#ec9a49" },
    { id: "fun", label: "开心一下", icon: "🕹️", x: 786, y: 217, w: 168, h: 126, color: "#d7659a" },
    { id: "shop", label: "包好运杂货铺", icon: "🔮", x: 728, y: 365, w: 166, h: 122, color: "#6db789" }
  ];

  const BOARD = { x: 480, y: 327, label: "兼职公告板", icon: "📋" };
  const TOWN_SCENERY = [
    { x: 418, y: 218, w: 124, h: 84 }
  ];

  const ART = {
    town: loadArt("assets/art/town-map-v2.png"),
    player: loadArt("assets/art/player-sprites.png"),
    interiors: loadArt("assets/art/interior-atlas.png"),
    npcs: loadArt("assets/art/npc-sprites.png")
  };

  const CARD_ART = {
    "fate:bonus": ["main", 0], "fate:bus": ["main", 1], "fate:rent": ["main", 2],
    "fate:energy": ["main", 3], "fate:bankday": ["main", 4], "fate:phone": ["main", 5],
    "fate:cold": ["main", 6], "fate:leak": ["main", 7], "fate:lost": ["main", 8],
    "fate:snack": ["main", 9], "fate:overtime": ["main", 10], "fate:coin": ["main", 11],
    "stock:tech": ["main", 12], "stock:foodco": ["main", 13], "stock:transit": ["main", 14],
    "stock:energy": ["main", 15], "stock:funco": ["main", 16],
    "roi:steady": ["main", 17], "roi:growth": ["main", 18], "roi:bold": ["main", 19],
    "work:600": ["main", 20], "work:700": ["main", 21], "work:800": ["main", 22], "work:900": ["main", 23],
    "food:nasi": ["main", 24], "food:roti": ["main", 25], "food:big": ["main", 26],
    "food:lucky": ["main", 27], "food:spicy": ["main", 28], "food:free": ["main", 29],
    "fun:movie": ["main", 30], "fun:arcade": ["main", 31], "fun:tea": ["main", 32],
    "fun:boring": ["main", 33], "fun:cancel": ["main", 34], "parttime:board": ["main", 35],
    "tool:shoes": ["items", 0], "tool:calculator": ["items", 1], "tool:meal": ["items", 2],
    "tool:bus": ["items", 3], "tool:alarm": ["items", 4], "tool:paper": ["items", 5], "tool:coin": ["items", 6],
    "luck:necklace": ["items", 7], "luck:coincharm": ["items", 8], "luck:socks": ["items", 9],
    "luck:cat": ["items", 10], "luck:potion": ["items", 11],
    "parttime:mamak": ["items", 12], "parttime:market": ["items", 13], "parttime:warehouse": ["items", 14],
    "parttime:flyer": ["items", 15], "parttime:tutor": ["items", 16], "parttime:mystery": ["items", 17]
  };

  const INTERIOR_PANELS = {
    work: [0, 0], bank: [1, 0], stock: [2, 0], roi: [3, 0], food: [4, 0],
    fun: [0, 1], shop: [1, 1], home: [3, 1]
  };

  const NPC_COLUMNS = { home: 0, work: 1, bank: 2, stock: 3, roi: 4, food: 5, fun: 6, shop: 7, parttime: 8 };

  function loadArt(src) {
    const image = new Image();
    image.src = src;
    return image;
  }

  const STOCKS = [
    { id: "tech", name: "嗖嗖科技", icon: "💻", price: 66 },
    { id: "foodco", name: "饱饱食品", icon: "🍱", price: 34 },
    { id: "transit", name: "快快交通", icon: "🚌", price: 45 },
    { id: "energy", name: "亮亮能源", icon: "💡", price: 58 },
    { id: "funco", name: "哈哈娱乐", icon: "🎮", price: 27 }
  ];

  const FOODS = [
    { id: "nasi", name: "香喷喷椰浆饭", icon: "🍛", effect: "动力+15", motivation: 15 },
    { id: "roti", name: "脆脆煎饼", icon: "🥞", effect: "动力+12", motivation: 12 },
    { id: "big", name: "老板手抖大份餐", icon: "🍲", effect: "动力+20", motivation: 20 },
    { id: "lucky", name: "幸运甜点", icon: "🍰", effect: "动力+10、幸运+2", motivation: 10, luck: 2 },
    { id: "spicy", name: "辣到看见明天", icon: "🌶️", effect: "动力+5、幸运-1", motivation: 5, luck: -1 },
    { id: "free", name: "老板突然请客", icon: "🎉", effect: "退回$70、动力+15", motivation: 15, refund: 70 },
    { id: "claypot", name: "瓦煲鸡饭", icon: "🍚", effect: "动力+16", motivation: 16 },
    { id: "wantan", name: "云吞面加料", icon: "🍜", effect: "动力+14", motivation: 14 },
    { id: "chicken", name: "海南鸡饭", icon: "🍗", effect: "动力+13", motivation: 13 },
    { id: "satay", name: "沙爹十串", icon: "🍢", effect: "动力+11、幸运+1", motivation: 11, luck: 1 },
    { id: "cendol", name: "煎蕊解暑", icon: "🍧", effect: "动力+9、幸运+1", motivation: 9, luck: 1 },
    { id: "instant", name: "又是泡面", icon: "🍥", effect: "动力+6", motivation: 6 },
    { id: "coldpack", name: "打包回来已经凉了", icon: "🥡", effect: "动力+4", motivation: 4 },
    { id: "hair", name: "汤里有根头发", icon: "🥣", effect: "退回$30、动力+2、幸运-2", motivation: 2, luck: -2, refund: 30 }
  ];

  const FUN_CARDS = [
    { id: "movie", name: "意外好看的电影", icon: "🎬", effect: "动力+15", motivation: 15 },
    { id: "arcade", name: "游戏厅大胜利", icon: "👾", effect: "动力+18、钱包+$10", motivation: 18, cash: 10 },
    { id: "tea", name: "朋友请你喝茶", icon: "🧋", effect: "动力+12、幸运+1", motivation: 12, luck: 1 },
    { id: "boring", name: "看到睡着的电影", icon: "🥱", effect: "动力+5", motivation: 5 },
    { id: "cancel", name: "活动临时取消", icon: "📢", effect: "退回$50、动力+3", motivation: 3, refund: 50 },
    { id: "karaoke", name: "唱到嗓子哑", icon: "🎤", effect: "动力+16", motivation: 16 },
    { id: "badminton", name: "羽球打了三小时", icon: "🏸", effect: "动力+14、幸运+1", motivation: 14, luck: 1 },
    { id: "mall", name: "逛街只看不买", icon: "🛍️", effect: "动力+13", motivation: 13 },
    { id: "claw", name: "夹娃娃机居然夹到了", icon: "🧸", effect: "动力+12、幸运+1", motivation: 12, luck: 1 },
    { id: "park", name: "公园喂鸽子", icon: "🕊️", effect: "动力+10、幸运+2", motivation: 10, luck: 2 },
    { id: "spoiler", name: "进场前被剧透结局", icon: "😑", effect: "动力+4、幸运-1", motivation: 4, luck: -1 },
    { id: "queue", name: "排了两小时的队", icon: "⏳", effect: "动力+3", motivation: 3 }
  ];

  const TEMP_TOOLS = [
    { id: "shoes", name: "飞毛腿跑鞋", icon: "👟", copy: "本月走路速度+15%", use: () => { state.speedBonus += 0.15; } },
    { id: "calculator", name: "不太作弊计算器", icon: "🧮", copy: "下一道数学题答错也不扣工资", use: () => { state.mathShield = true; } },
    { id: "meal", name: "免费餐券", icon: "🎟️", copy: "本月食物免费", use: () => { state.freeFood = true; } },
    { id: "bus", name: "飞快巴士票", icon: "🚌", copy: "立刻节省20秒", use: () => { state.remainingSec = Math.min(360, state.remainingSec + 20); } },
    { id: "alarm", name: "超级闹钟", icon: "⏰", copy: "本月睡觉额外恢复5动力", use: () => { state.sleepBonus += 5; } },
    { id: "paper", name: "市场小道消息", icon: "📰", copy: "交易所显示本月走势提示", use: () => { state.marketHint = true; } },
    { id: "coin", name: "捡到的幸运硬币", icon: "🪙", copy: "永久幸运+2", use: () => { state.luck = clamp(state.luck + 2, 0, 100); } },
    { id: "coffee", name: "三合一咖啡", icon: "☕", copy: "立刻动力+25", use: () => { state.motivation = clamp(state.motivation + 25, 0, 100); } },
    { id: "earplug", name: "隔音耳塞", icon: "🎧", copy: "本月睡觉额外恢复8动力", use: () => { state.sleepBonus += 8; } },
    { id: "shortcut", name: "抄近路地图", icon: "🗺️", copy: "立刻节省30秒", use: () => { state.remainingSec = Math.min(360, state.remainingSec + 30); } },
    { id: "amulet", name: "转运手绳", icon: "🧿", copy: "本月幸运+5", use: () => { state.monthLuckBonus += 5; } },
    { id: "energydrink", name: "提神饮料", icon: "⚡", copy: "本月走路速度+25%", use: () => { state.speedBonus += 0.25; } }
  ];

  const LUCK_ITEMS = [
    { id: "necklace", name: "水晶项链", icon: "📿", price: 250, luck: 10, copy: "装备时幸运+10" },
    { id: "coincharm", name: "招财硬币", icon: "🪙", price: 160, luck: 5, copy: "装备时幸运+5" },
    { id: "socks", name: "左右脚幸运袜", icon: "🧦", price: 180, luck: 6, copy: "装备时幸运+6" },
    { id: "cat", name: "摇手猫挂件", icon: "🐈", price: 220, luck: 8, copy: "装备时幸运+8" },
    { id: "potion", name: "本月一定行药水", icon: "🧪", price: 60, luck: 15, temporary: true, copy: "本月幸运+15" }
  ];

  const PART_TIME = [
    { id: "mamak", name: "Mamak店帮手", icon: "🍽️", pay: 120 },
    { id: "market", name: "夜市搬货员", icon: "📦", pay: 160 },
    { id: "warehouse", name: "仓库点货员", icon: "🏷️", pay: 180 },
    { id: "flyer", name: "车站宣传员", icon: "📣", pay: 100 },
    { id: "tutor", name: "临时补习助教", icon: "📚", pay: 200 },
    { id: "wedding", name: "婚宴端菜", icon: "🍽️", pay: 170 },
    { id: "mascot", name: "商场玩偶人", icon: "🐻", pay: 165 },
    { id: "delivery", name: "送外卖跑腿", icon: "🛵", pay: 150 },
    { id: "petshop", name: "宠物店洗狗", icon: "🐕", pay: 140 },
    { id: "carwash", name: "洗车场帮工", icon: "🚿", pay: 130 },
    { id: "survey", name: "街头问卷员", icon: "📋", pay: 110 },
    { id: "lineup", name: "帮人排队", icon: "🧍", pay: 95 }
  ];

  const FATE_CARDS = [
    { id: "bonus", type: "good", name: "老板忘了自己小气", icon: "💵", copy: "钱包+$100", apply: () => state.wallet += 100 },
    { id: "bus", type: "good", name: "巴士居然没迟到", icon: "🚌", copy: "本月时间+20秒", apply: () => state.remainingSec += 20 },
    { id: "rent", type: "good", name: "房东今天心情很好", icon: "🏠", copy: "本月房租减少20%", apply: () => state.rentDiscount = 0.2 },
    { id: "energy", type: "good", name: "醒来没有腰酸背痛", icon: "✨", copy: "动力+10", apply: () => state.motivation = clamp(state.motivation + 10, 0, 100) },
    { id: "bankday", type: "good", name: "银行庆典月", icon: "🏦", copy: "本月银行利息提高至8%", apply: () => state.bankRate = 0.08 },
    { id: "phone", type: "bad", name: "手机自由落体", icon: "📱", copy: "产生$80命运债务", apply: () => state.debt += 80 },
    { id: "cold", type: "bad", name: "冷气开太大，感冒了", icon: "🤧", copy: "本月时间-15秒、动力-5", apply: () => { state.remainingSec -= 15; state.motivation -= 5; } },
    { id: "leak", type: "bad", name: "天花板开始下小雨", icon: "🪣", copy: "产生$60命运债务", apply: () => state.debt += 60 },
    { id: "lost", type: "bad", name: "钥匙在手上却找了半天", icon: "🔑", copy: "本月时间-10秒", apply: () => state.remainingSec -= 10 },
    { id: "snack", type: "choice", name: "同事请吃神秘零食", icon: "🍘", copy: "动力+8，但幸运-1", apply: () => { state.motivation += 8; state.luck -= 1; } },
    { id: "overtime", type: "choice", name: "老板问：今晚有空吗？", icon: "🌙", copy: "钱包+$120，但动力-10", apply: () => { state.wallet += 120; state.motivation -= 10; } },
    { id: "coin", type: "choice", name: "路边闪闪发光", icon: "🪙", copy: "钱包+$30、幸运+1", apply: () => { state.wallet += 30; state.luck += 1; } },

    // The twelve above have illustrations in card-art-main.png; everything below falls
    // back to its emoji in the same frame, which is why they all carry a good one.
    { id: "pocket", type: "good", name: "旧外套口袋有惊喜", icon: "🧥", copy: "钱包+$60。上个月的你留给现在的你", apply: () => state.wallet += 60 },
    { id: "angpow", type: "good", name: "亲戚突然发红包", icon: "🧧", copy: "钱包+$150，但被问了三次几时结婚", apply: () => { state.wallet += 150; state.motivation -= 3; } },
    { id: "promo", type: "good", name: "超市大促销", icon: "🛒", copy: "本月食物免费。你囤了三个月的泡面", apply: () => state.freeFood = true },
    { id: "extrameat", type: "good", name: "摊主手抖多给一块肉", icon: "🍗", copy: "动力+12、幸运+1", apply: () => { state.motivation += 12; state.luck += 1; } },
    { id: "lift", type: "good", name: "电梯今天居然没坏", icon: "🛗", copy: "本月时间+15秒、动力+5", apply: () => { state.remainingSec += 15; state.motivation += 5; } },
    { id: "powerbank", type: "good", name: "抽奖中了充电宝", icon: "🔋", copy: "钱包+$80。不是手机，但也行", apply: () => state.wallet += 80 },
    { id: "farewell", type: "good", name: "同事离职请客", icon: "🍰", copy: "动力+15、钱包+$30", apply: () => { state.motivation += 15; state.wallet += 30; } },
    { id: "wifi", type: "good", name: "网速终于正常了", icon: "📶", copy: "本月时间+25秒", apply: () => state.remainingSec += 25 },
    { id: "slipper", type: "good", name: "拖鞋底居然没掉", icon: "🩴", copy: "本月走路速度+15%", apply: () => state.speedBonus += 0.15 },
    { id: "fixdeposit", type: "good", name: "翻到忘记的定存", icon: "🧾", copy: "银行+$200", apply: () => state.bank += 200 },
    { id: "aircon", type: "good", name: "冷气终于修好了", icon: "❄️", copy: "动力+14、本月睡觉多回5动力", apply: () => { state.motivation += 14; state.sleepBonus += 5; } },

    { id: "jam", type: "bad", name: "塞车塞到怀疑人生", icon: "🚗", copy: "本月时间-25秒", apply: () => state.remainingSec -= 25 },
    { id: "sock", type: "bad", name: "洗衣机吃掉一只袜子", icon: "🧦", copy: "幸运-3。另一只还在，但没用了", apply: () => state.luck -= 3 },
    { id: "databill", type: "bad", name: "流量账单超标", icon: "📵", copy: "产生$50命运债务", apply: () => state.debt += 50 },
    { id: "reno", type: "bad", name: "隔壁装修从早敲到晚", icon: "🔨", copy: "动力-12", apply: () => state.motivation -= 12 },
    { id: "puddle", type: "bad", name: "一脚踩进水坑", icon: "💦", copy: "动力-8、幸运-1", apply: () => { state.motivation -= 8; state.luck -= 1; } },
    { id: "battery", type: "bad", name: "电动摩托没电了", icon: "🛵", copy: "本月时间-20秒", apply: () => state.remainingSec -= 20 },
    { id: "rain", type: "bad", name: "出门前五分钟下大雨", icon: "🌧️", copy: "动力-10、幸运-2", apply: () => { state.motivation -= 10; state.luck -= 2; } },
    { id: "catplant", type: "bad", name: "猫把花盆推下楼", icon: "🐈", copy: "产生$40命运债务", apply: () => state.debt += 40 },
    { id: "annualfee", type: "bad", name: "信用卡年费扣了", icon: "💳", copy: "钱包-$90。你一直说要取消", apply: () => state.wallet -= 90 },
    { id: "nobonus", type: "bad", name: "老板说今年比较难", icon: "📉", copy: "动力-15", apply: () => state.motivation -= 15 },
    { id: "lend", type: "bad", name: "朋友说下个月一定还", icon: "🤝", copy: "钱包-$120", apply: () => state.wallet -= 120 },
    { id: "parking", type: "bad", name: "停车罚单夹在雨刷上", icon: "🎫", copy: "产生$70命运债务", apply: () => state.debt += 70 },

    { id: "cousin", type: "choice", name: "表哥说这个稳赚的", icon: "🤵", copy: "钱包+$200，但幸运-5", apply: () => { state.wallet += 200; state.luck -= 5; } },
    { id: "drama", type: "choice", name: "追剧追到凌晨三点", icon: "📺", copy: "动力-15，但幸运+3。值得", apply: () => { state.motivation -= 15; state.luck += 3; } },
    { id: "moving", type: "choice", name: "帮邻居搬家", icon: "📦", copy: "钱包+$90，但动力-12", apply: () => { state.wallet += 90; state.motivation -= 12; } },
    { id: "expired", type: "choice", name: "面包过期一天而已", icon: "🍞", copy: "钱包+$40，但动力-6", apply: () => { state.wallet += 40; state.motivation -= 6; } },
    { id: "resell", type: "choice", name: "二手平台卖掉旧手机", icon: "📲", copy: "钱包+$160，但本月时间-20秒", apply: () => { state.wallet += 160; state.remainingSec -= 20; } },
    { id: "gym", type: "choice", name: "健身房免费试用", icon: "🏋️", copy: "动力+18，但本月时间-30秒", apply: () => { state.motivation += 18; state.remainingSec -= 30; } },
    { id: "remedy", type: "choice", name: "相信了网上的偏方", icon: "🌿", copy: "幸运+6，但动力-8", apply: () => { state.luck += 6; state.motivation -= 8; } },
    { id: "allnight", type: "choice", name: "通宵打了一整晚游戏", icon: "🎮", copy: "动力-18，但幸运+4", apply: () => { state.motivation -= 18; state.luck += 4; } },
    { id: "nightrun", type: "choice", name: "下班多跑几单", icon: "🚕", copy: "钱包+$140，但动力-14", apply: () => { state.wallet += 140; state.motivation -= 14; } },
    { id: "livestream", type: "choice", name: "直播抽奖真的中了", icon: "🎁", copy: "钱包+$70，但看了三小时", apply: () => { state.wallet += 70; state.remainingSec -= 25; } },
    { id: "covershift", type: "choice", name: "替同事顶一个班", icon: "⏰", copy: "钱包+$110，但动力-9", apply: () => { state.wallet += 110; state.motivation -= 9; } },
    { id: "charm", type: "choice", name: "买了个平安符", icon: "🧿", copy: "幸运+8，但钱包-$60", apply: () => { state.luck += 8; state.wallet -= 60; } },
    { id: "durian", type: "choice", name: "榴莲季节到了", icon: "🥭", copy: "动力+20，但钱包-$80", apply: () => { state.motivation += 20; state.wallet -= 80; } }
  ];

  const ROI_TYPES = [
    { id: "steady", name: "稳健项目", icon: "🪴", min: -5, max: 12, color: "good" },
    { id: "growth", name: "成长项目", icon: "🚲", min: -15, max: 30, color: "choice" },
    { id: "bold", name: "冒险项目", icon: "🚀", min: -30, max: 60, color: "bad" }
  ];

  const CATALOG = {
    "命运卡": FATE_CARDS,
    "工作卡": [600, 700, 800, 900].map(v => ({ id: `salary-${v}`, name: `$${v}工作`, icon: "💼", copy: `完成数学题领取${money(v)}` })),
    "兼职卡": PART_TIME,
    "工具卡": TEMP_TOOLS,
    "食物卡": FOODS,
    "娱乐卡": FUN_CARDS,
    "股票卡": STOCKS,
    "ROI卡": ROI_TYPES,
    "幸运物品": LUCK_ITEMS
  };

  let state = null;
  let paused = true;
  let playing = false;
  let lastFrame = performance.now();
  let modalOnClose = null;
  let nearbyTarget = null;
  let toastTimer = null;
  let collection = loadJson(COLLECTION_KEY, []);
  let soundEnabled = loadJson(SETTINGS_KEY, { sound: true }).sound;
  let audioContext = null;
  let musicTimer = null;
  const keys = new Set();
  const movementVelocity = { x: 0, y: 0 };

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  function saveCollection() {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
  }

  function collect(category, id) {
    const key = `${category}:${id}`;
    if (!collection.includes(key)) {
      collection.push(key);
      saveCollection();
    }
  }

  function switchScreen(name) {
    Object.entries(screens).forEach(([key, element]) => { element.hidden = key !== name; });
  }

  function createInitialState(houseId) {
    return {
      version: 1,
      month: 1,
      wallet: 500,
      bank: 0,
      debt: 0,
      missedRentStreak: 0,
      motivation: 60,
      luck: 50,
      monthLuckBonus: 0,
      houseId,
      remainingSec: 300,
      bankRate: 0.05,
      rentDiscount: 0,
      speedBonus: 0,
      sleepBonus: 0,
      mathShield: false,
      freeFood: false,
      marketHint: false,
      scene: "town",
      interiorId: null,
      player: homeSpawn(),
      flags: { work: false, food: false, fun: false, roi: false, partTimeDrawn: false, stockBought: false },
      permanentItems: [],
      tempTools: [],
      stockPrices: Object.fromEntries(STOCKS.map(item => [item.id, { price: item.price, change: 0 }])),
      holdings: {},
      stockOffers: [],
      shopOffers: [],
      pendingROI: [],
      monthLog: [],
      lastFateId: null,
      tutorialSeen: false
    };
  }

  function effectiveLuck() {
    if (!state) return 50;
    const itemLuck = state.permanentItems.reduce((sum, itemId) => {
      const item = LUCK_ITEMS.find(entry => entry.id === itemId);
      return sum + (item?.luck || 0);
    }, 0);
    return clamp(state.luck + state.monthLuckBonus + itemLuck, 0, 100);
  }

  function luckLabel(value) {
    if (value < 25) return "倒霉";
    if (value < 50) return "普通";
    if (value < 75) return "幸运";
    return "超幸运";
  }

  function monthDuration() {
    const value = state.motivation;
    if (value >= 90) return 340;
    if (value >= 80) return 320;
    if (value >= 50) return 300;
    if (value >= 30) return 240;
    if (value >= 10) return 180;
    return 120;
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1900);
  }

  function openModal(html, options = {}) {
    paused = true;
    modalContent.innerHTML = html;
    modal.classList.toggle("wide", !!options.wide);
    modalClose.hidden = options.closable === false;
    modalLayer.hidden = false;
    modalOnClose = options.onClose || null;
    beep(460, 0.05, "square", 0.025);
  }

  function closeModal() {
    if (modalLayer.hidden) return;
    modalLayer.hidden = true;
    modalContent.innerHTML = "";
    modal.classList.remove("wide");
    const callback = modalOnClose;
    modalOnClose = null;
    paused = !playing;
    callback?.();
  }

  // A draw should feel like a draw. Every pool used to render face-up the instant its
  // modal opened, so the "抽卡" was really just a receipt. Here the player sees backs,
  // picks one blind, watches it flip, and then sees the ones they dodged -- the near
  // miss is most of the fun, so it is shown rather than thrown away.
  function runCardDraw({ eyebrow, title, hint, candidates, faceUp, missed, confirmLabel, onConfirm, stingFor }) {
    const backs = candidates.map((_, index) =>
      `<button class="card-back" data-slot="${index}" style="animation-delay:${index * 90}ms" aria-label="翻开第${index + 1}张">
        <span class="card-back-inner"><span class="card-back-mark">月底</span><span class="card-back-q">?</span></span>
      </button>`).join("");

    openModal(`<div class="card-draw">
      <p class="eyebrow">${eyebrow}</p><h2>${title}</h2>
      <p class="modal-intro draw-hint">${hint}</p>
      <div class="draw-row" id="draw-row">${backs}</div>
    </div>`, { closable: false });

    let taken = false;
    $$("#draw-row .card-back").forEach(button => button.addEventListener("click", () => {
      if (taken) return;
      taken = true;
      const index = Number(button.dataset.slot);
      const picked = candidates[index];
      beep(360, .05, "square", .03);
      setTimeout(() => beep(520, .05, "square", .03), 90);

      $$("#draw-row .card-back").forEach(other => other.classList.add(other === button ? "flip-out" : "fade-out"));

      setTimeout(() => {
        const others = candidates.filter((_, i) => i !== index);
        $("#draw-row").outerHTML = `<div class="reveal-wrap">
          <div class="reveal-card flip-in">${faceUp(picked)}</div>
          ${others.length ? `<p class="dodged-label">差点抽到</p>
            <div class="dodged-row">${others.map(missed).join("")}</div>` : ""}
        </div>
        <button id="draw-confirm" class="pixel-btn primary full-button">${confirmLabel}</button>`;
        const sting = stingFor ? stingFor(picked) : 660;
        setTimeout(() => beep(sting, .16, "square", .035), 120);
        $("#draw-confirm").addEventListener("click", () => onConfirm(picked));
      }, 230);
    }));
  }

  function cardMarkup(item, extraClass = "", meta = "", artKey = "") {
    const art = CARD_ART[artKey];
    const sheet = art?.[0] === "items" ? "assets/art/card-art-items.png" : "assets/art/card-art-main.png";
    const cols = 6;
    const rows = art?.[0] === "items" ? 3 : 6;
    const index = art?.[1] ?? 0;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = cols === 1 ? 0 : col * 100 / (cols - 1);
    const y = rows === 1 ? 0 : row * 100 / (rows - 1);
    const artStyle = art ? `style="--card-image:url('${sheet}');--card-size:${cols * 100}% ${rows * 100}%;--card-x:${x}%;--card-y:${y}%"` : "";
    const effect = item.copy || item.effect || "等待揭晓";
    const footer = meta && meta.trim() !== effect.trim() ? meta : "";
    const rarity = extraClass.includes("bad") ? "风险" : extraClass.includes("good") ? "好运" : extraClass.includes("stock") ? "市场" : "生活";
    return `<button class="game-card ${extraClass}" data-card-id="${item.id}">
      <span class="card-head"><span>${rarity}</span><span class="card-gem">◆</span></span>
      <span class="card-art" ${artStyle}>${art ? "" : `<span class="card-icon">${item.icon || "🃏"}</span>`}</span>
      <span class="card-body"><strong class="card-title">${item.name}</strong>
      <span class="card-copy"><b>效果</b>${effect}</span>
      ${footer ? `<span class="card-meta">${footer}</span>` : ""}</span>
    </button>`;
  }

  function selectHouse(houseId) {
    state = createInitialState(houseId);
    switchScreen("game");
    updateHUD();
    showTutorial();
  }

  function showTutorial() {
    openModal(`<p class="eyebrow">房东的新手教学</p>
      <h2>欢迎来到月底小镇</h2>
      <div class="result-box">
        <p><strong>① 去公司：</strong>三张工作卡选一张，回答一道数学题。</p>
        <p><strong>② 去食堂：</strong>每月必须吃一次，不然动力−20。</p>
        <p><strong>③ 去银行：</strong>房租只会从银行自动扣，记得存钱。</p>
        <p><strong>④ 回家睡觉：</strong>睡觉会结束本月并恢复动力。时间归零就没有睡眠奖励。</p>
      </div>
      <p>WASD或方向键走路，靠近门口按E进入。手机使用屏幕按钮。</p>
      <button id="tutorial-start" class="pixel-btn primary">懂了，抽第一张命运卡</button>`, { closable: false });
    $("#tutorial-start").addEventListener("click", () => {
      state.tutorialSeen = true;
      closeModal();
      beginMonth();
    });
  }

  function resetMonthlyState() {
    state.remainingSec = monthDuration();
    state.bankRate = 0.05;
    state.rentDiscount = 0;
    state.monthLuckBonus = 0;
    state.speedBonus = 0;
    state.sleepBonus = 0;
    state.mathShield = false;
    state.freeFood = false;
    state.marketHint = false;
    state.flags = { work: false, food: false, fun: false, roi: false, partTimeDrawn: false, stockBought: false };
    state.tempTools = [];
    state.stockOffers = [];
    state.shopOffers = shuffle(LUCK_ITEMS).slice(0, 3).map(item => item.id);
    state.monthLog = [];
    state.scene = "town";
    state.interiorId = null;
    state.player = homeSpawn();
  }

  function resolveDueROI() {
    const due = state.pendingROI.filter(item => item.dueMonth === state.month);
    due.forEach(item => {
      state.bank += item.payout;
      state.monthLog.push({ label: `${item.name}结算`, amount: item.payout, positive: true });
    });
    state.pendingROI = state.pendingROI.filter(item => item.dueMonth !== state.month);
  }

  function beginMonth() {
    resetMonthlyState();
    resolveDueROI();
    updateHUD();
    drawFateCard();
  }

  function chooseFateType() {
    const luck = effectiveLuck();
    const roll = Math.random() * 100;
    const goodChance = luck < 25 ? 25 : luck < 50 ? 35 : luck < 75 ? 45 : 55;
    const badChance = luck < 25 ? 50 : luck < 50 ? 40 : luck < 75 ? 30 : 20;
    if (roll < goodChance) return "good";
    if (roll < goodChance + badChance) return "bad";
    return "choice";
  }

  function drawFateCard() {
    let type = chooseFateType();
    if (state.month === 1 && type === "bad") type = Math.random() < 0.65 ? "choice" : "bad";
    let pool = FATE_CARDS.filter(card => card.type === type);
    if (state.month === 1) pool = pool.filter(card => !["phone", "leak"].includes(card.id));
    // Three blind candidates, all drawn from the same luck-weighted pool: the pick is
    // real, the player just can't see which is which yet.
    const candidates = shuffle(pool).slice(0, 3);
    while (candidates.length < 3) candidates.push(random(pool));

    runCardDraw({
      eyebrow: `第${state.month}月 · 命运抽卡`,
      title: "选一张，翻开它",
      hint: "三张背面朝上。选中的那张就是你这个月要过的日子。",
      candidates,
      faceUp: card => cardMarkup(card, card.type, "本月命运", `fate:${card.id}`),
      missed: card => cardMarkup(card, card.type, "", `fate:${card.id}`),
      stingFor: card => card.type === "good" ? 880 : card.type === "bad" ? 220 : 620,
      confirmLabel: "接受命运，开始本月",
      onConfirm: card => {
        state.lastFateId = card.id;
        collect("命运卡", card.id);
        card.apply();
        state.motivation = clamp(state.motivation, 0, 100);
        state.luck = clamp(state.luck, 0, 100);
        state.remainingSec = Math.max(30, state.remainingSec);
        state.monthLog.push({ label: `命运：${card.name}`, text: card.copy });
        playing = true;
        closeModal();
        saveCheckpoint();
        updateHUD();
        startMusic();
      }
    });
  }

  function saveCheckpoint() {
    if (!state || !playing) return;
    const snapshot = structuredClone(state);
    snapshot.scene = "town";
    snapshot.interiorId = null;
    snapshot.player = homeSpawn();
    localStorage.setItem(GAME_KEY, JSON.stringify(snapshot));
    $("#resume-btn").hidden = false;
  }

  function restoreCheckpoint() {
    const restored = loadJson(GAME_KEY, null);
    if (!restored) return;
    state = restored;
    switchScreen("game");
    playing = true;
    paused = false;
    updateHUD();
    startMusic();
    showToast(`已恢复第${state.month}月月初`);
  }

  function updateHUD() {
    if (!state) return;
    $("#month-label").textContent = `第${state.month}月`;
    $("#wallet-label").textContent = money(state.wallet);
    $("#bank-label").textContent = money(state.bank);
    $("#motivation-label").textContent = Math.round(state.motivation);
    const luck = effectiveLuck();
    $("#luck-label").textContent = `${luck} · ${luckLabel(luck)}`;
    $("#timer-label").textContent = formatTime(state.remainingSec);
    const phase = state.remainingSec > 200 ? "白天" : state.remainingSec > 100 ? "黄昏" : "夜晚";
    $("#day-phase").textContent = phase;
    const rent = currentRent();
    $("#rent-warning").hidden = state.bank >= rent;
    $("#bag-count").textContent = state.permanentItems.length + state.tempTools.length;
    const flags = state.flags;
    setCheck("work", flags.work);
    setCheck("food", flags.food);
    setCheck("fun", flags.fun);
    setCheck("roi", flags.roi);
  }

  function setCheck(id, done) {
    const element = $(`#check-${id}`);
    element.classList.toggle("done", done);
    element.textContent = `${done ? "✓" : "□"} ${id === "work" ? "工作" : id === "food" ? "吃饭" : id === "fun" ? "娱乐" : "ROI"}`;
  }

  function formatTime(seconds) {
    const whole = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
  }

  function currentRent() {
    const house = HOUSES.find(item => item.id === state.houseId);
    return Math.round(house.rent * (1 - state.rentDiscount));
  }

  function spendTime(seconds) {
    state.remainingSec = Math.max(0, state.remainingSec - seconds);
    updateHUD();
  }

  function combinedFunds() { return state.wallet + state.bank; }

  function spendCombined(amount, preferred = "auto") {
    if (combinedFunds() < amount) return false;
    if (preferred === "bank") {
      const fromBank = Math.min(state.bank, amount);
      state.bank -= fromBank;
      state.wallet -= amount - fromBank;
    } else {
      const fromWallet = Math.min(state.wallet, amount);
      state.wallet -= fromWallet;
      state.bank -= amount - fromWallet;
    }
    return true;
  }

  function buildingList() {
    const house = HOUSES[0];
    return [...BASE_BUILDINGS, { id: "home", label: house.name, icon: house.icon, x: house.x, y: house.y, w: house.w, h: house.h, color: house.color }];
  }

  function homeSpawn() {
    const spot = standingSpot(buildingList().find(building => building.id === "home"));
    return { x: spot.x, y: spot.y, facing: "up", moving: false };
  }

  function getDoor(building) { return { x: building.x + building.w / 2, y: building.y + building.h + 8 }; }

  // Where the player stands after stepping out of a door. Walking out onto a fixed
  // offset once dropped the player inside the collision box of whatever building sat
  // below, leaving them unable to move in any direction but up, so step outwards
  // until the spot is actually free. Uses isTownBlocked because this also runs while
  // building the initial state, before `state` exists.
  function standingSpot(building) {
    const door = getDoor(building);
    for (let offset = 8; offset <= 90; offset += 4) {
      const y = clamp(door.y + offset, 18, 520);
      if (!isTownBlocked(door.x, y)) return { x: door.x, y };
    }
    for (let offset = 8; offset <= 90; offset += 4) {
      const y = clamp(door.y - building.h - offset, 18, 520);
      if (!isTownBlocked(door.x, y)) return { x: door.x, y };
    }
    return { x: door.x, y: clamp(door.y + 20, 18, 520) };
  }

  // Keep this margin small: it is invisible, so a generous one reads to the player as
  // an invisible wall floating in the open pavement beside a building.
  const WALL_MARGIN = 3;

  function isTownBlocked(x, y) {
    const solids = [...buildingList(), ...TOWN_SCENERY];
    return solids.some(b => x > b.x - WALL_MARGIN && x < b.x + b.w + WALL_MARGIN && y > b.y - WALL_MARGIN && y < b.y + b.h + WALL_MARGIN);
  }

  function isBlocked(x, y) {
    if (state.scene !== "town") return x < 300 || x > 660 || y < 80 || y > 510;
    return isTownBlocked(x, y);
  }

  function movePlayer(dx, dy, delta) {
    if (!state || paused || !playing) return;
    const fatigueSpeed = state.motivation < 10 ? -0.10 : state.motivation < 30 ? -0.05 : state.motivation >= 90 ? 0.05 : 0;
    const speed = 152 * (1 + state.speedBonus + fatigueSpeed);
    const length = Math.hypot(dx, dy);
    const scale = length > 1 ? 1 / length : 1;
    const vx = dx * scale * speed * delta;
    const vy = dy * scale * speed * delta;
    const nextX = clamp(state.player.x + vx, 14, 946);
    const nextY = clamp(state.player.y + vy, 18, 520);
    if (!isBlocked(nextX, state.player.y)) state.player.x = nextX;
    if (!isBlocked(state.player.x, nextY)) state.player.y = nextY;
    state.player.moving = length > 0.08;
    if (Math.abs(dx) > Math.abs(dy)) state.player.facing = dx > 0 ? "right" : "left";
    else if (dy) state.player.facing = dy > 0 ? "down" : "up";
  }

  function findNearbyTarget() {
    if (!state) return null;
    if (state.scene === "interior") {
      const distance = Math.hypot(state.player.x - 480, state.player.y - 498);
      return distance < 54 ? { id: "exit", label: "离开建筑" } : null;
    }
    const target = buildingList().find(building => {
      const door = getDoor(building);
      return Math.hypot(state.player.x - door.x, state.player.y - door.y) < 46;
    });
    if (target) return target;
    const boardDistance = Math.hypot(state.player.x - BOARD.x, state.player.y - BOARD.y);
    return boardDistance < 46 ? { id: "parttime", label: BOARD.label } : null;
  }

  function interact() {
    if (!state || paused || !playing) return;
    const target = findNearbyTarget();
    if (!target) { showToast("这里没有可以互动的东西"); return; }
    beep(620, 0.05, "square", 0.03);
    if (target.id === "exit") { leaveInterior(); return; }
    if (target.id === "parttime") { showPartTime(); return; }
    enterBuilding(target);
  }

  function enterBuilding(building) {
    state.scene = "interior";
    state.interiorId = building.id;
    state.player = { x: 480, y: 458, facing: "up", moving: false };
    $("#location-label").textContent = building.label;
    setTimeout(() => openBuildingInteraction(building.id), 70);
  }

  function leaveInterior() {
    const building = buildingList().find(item => item.id === state.interiorId);
    state.scene = "town";
    state.interiorId = null;
    const spot = standingSpot(building);
    state.player = { x: spot.x, y: spot.y, facing: "down", moving: false };
    $("#location-label").textContent = "月底小镇";
  }

  function openBuildingInteraction(id) {
    const actions = { work: showWork, bank: showBank, stock: showStock, roi: showROI, food: showFood, fun: showFun, shop: showShop, home: showHome };
    actions[id]?.();
  }

  function showWork() {
    if (state.flags.work) { simpleMessage("今天真的下班了", "本月主工作已经完成。老板假装没看见你又回来。", "💼"); return; }
    const luck = effectiveLuck();
    const pool = luck >= 75 ? [700, 800, 800, 900] : luck >= 50 ? [600, 700, 800, 900] : luck >= 25 ? [600, 600, 700, 800] : [600, 600, 600, 700];
    const salaries = Array.from({ length: 3 }, () => random(pool));
    const cost = { 600: 0, 700: 3, 800: 6, 900: 10 };
    openModal(`<p class="eyebrow">摸鱼有限公司</p><h2>本月工作三选一</h2>
      <p class="modal-intro">工资越高，工作越累。选择后回答一道数学题，答错工资减少20%。</p>
      <div class="card-grid">${salaries.map((salary, index) => cardMarkup({ id: String(index), icon: "💼", name: `${money(salary)}工作`, copy: `完成消耗30秒，动力-${cost[salary]}` }, "choice work-card", `工资 ${money(salary)}`, `work:${salary}`)).join("")}</div>`);
    $$(".game-card").forEach((button, index) => button.addEventListener("click", () => startMathQuestion(salaries[index], cost[salaries[index]])));
  }

  function makeMathQuestion() {
    const kind = Math.floor(Math.random() * 5);
    let prompt, answer;
    if (kind === 0) { const a = 20 + Math.floor(Math.random() * 60), b = 10 + Math.floor(Math.random() * 40); prompt = `${a} + ${b} = ?`; answer = a + b; }
    else if (kind === 1) { const a = 70 + Math.floor(Math.random() * 80), b = 10 + Math.floor(Math.random() * 50); prompt = `${a} − ${b} = ?`; answer = a - b; }
    else if (kind === 2) { const a = 3 + Math.floor(Math.random() * 9), b = 4 + Math.floor(Math.random() * 8); prompt = `${a} × ${b} = ?`; answer = a * b; }
    else if (kind === 3) { const base = random([40, 60, 80, 100, 120, 200]), percent = random([10, 20, 25, 50]); prompt = `${percent}% × $${base} = ?`; answer = base * percent / 100; }
    else { const base = random([80, 100, 120, 200]), percent = random([10, 20, 25, 50]); prompt = `$${base}打${100 - percent}%折，售价是？`; answer = base * (100 - percent) / 100; }
    const wrong = new Set();
    while (wrong.size < 2) {
      const value = Math.max(1, Math.round(answer + random([-20, -10, -5, 5, 10, 20])));
      if (value !== answer) wrong.add(value);
    }
    return { prompt, answer, options: shuffle([answer, ...wrong]) };
  }

  function startMathQuestion(salary, motivationCost) {
    collect("工作卡", `salary-${salary}`);
    const question = makeMathQuestion();
    openModal(`<p class="eyebrow">本月唯一一道工作题</p><h2>答对就拿完整工资</h2>
      <div class="math-question">${question.prompt}</div>
      <div class="answer-grid">${question.options.map(value => `<button class="pixel-btn" data-answer="${value}">${money(value)}</button>`).join("")}</div>`, { closable: false });
    $$('[data-answer]').forEach(button => button.addEventListener("click", () => {
      const correct = Number(button.dataset.answer) === question.answer;
      let protectedByTool = false;
      if (!correct && state.mathShield) { state.mathShield = false; protectedByTool = true; }
      const paid = (!correct && !protectedByTool) ? Math.round(salary * 0.8) : salary;
      state.wallet += paid;
      state.motivation = clamp(state.motivation - motivationCost, 0, 100);
      state.flags.work = true;
      state.monthLog.push({ label: "主工作工资", amount: paid, positive: true });
      spendTime(30);
      beep(correct || protectedByTool ? 760 : 180, 0.13, correct ? "square" : "sawtooth", 0.04);
      openModal(`<p class="eyebrow">打卡完成</p><h2>${correct ? "算得漂亮！" : protectedByTool ? "计算器救了你" : "老板抓到机会扣钱了"}</h2>
        <div class="result-box">正确答案：${money(question.answer)}<br>本月工资：<strong>${money(paid)}</strong><br>动力：-${motivationCost}</div>
        <button id="work-done" class="pixel-btn primary">收工</button>`, { closable: false });
      $("#work-done").addEventListener("click", closeModal);
      updateHUD();
    }));
  }

  function showPartTime() {
    if (state.flags.partTimeDrawn) { simpleMessage("本月兼职抽过了", "公告板只剩下『免费加班』，你决定假装没看到。", "📌"); return; }
    state.flags.partTimeDrawn = true;
    const jobs = shuffle(PART_TIME).slice(0, 3);
    const offers = jobs.map(job => ({ job, tool: random(TEMP_TOOLS) }));

    runCardDraw({
      eyebrow: "兼职公告板",
      title: "三张招工单，撕一张",
      hint: "公告板上三张单子都反着贴。撕下哪张就做哪份，老板还附送一件工具。",
      candidates: offers,
      faceUp: ({ job, tool }) => `<div class="offer-pair">
        ${cardMarkup(job, "choice", `工资 ${money(job.pay)}`, `parttime:${job.id}`)}
        ${cardMarkup(tool, "good", "附赠工具", `tool:${tool.id}`)}
      </div>`,
      missed: ({ job }) => cardMarkup(job, "choice", "", `parttime:${job.id}`),
      stingFor: ({ job }) => job.pay >= 160 ? 880 : job.pay >= 120 ? 620 : 380,
      confirmLabel: "接下这份工",
      onConfirm: ({ job, tool }) => {
        collect("兼职卡", job.id);
        collect("工具卡", tool.id);
        state.wallet += job.pay;
        spendTime(20);
        if (state.tempTools.length < 3) state.tempTools.push(tool.id);
        else showToast("临时工具栏已满，新工具没地方放");
        state.monthLog.push({ label: `兼职：${job.name}`, amount: job.pay, positive: true });
        closeModal();
        updateHUD();
        showToast(`兼职完成，得到${money(job.pay)}和${tool.name}`);
      }
    });
    updateHUD();
  }

  function weightedOutcome(items) {
    const luck = effectiveLuck();
    const indexShift = luck >= 75 ? -1 : luck < 25 ? 1 : 0;
    const baseIndex = Math.floor(Math.random() * items.length);
    return items[clamp(baseIndex + indexShift, 0, items.length - 1)];
  }

  function showFood() {
    if (state.flags.food) { simpleMessage("已经吃过了", "一个月只能抽一次食物。再吃下去钱包会先撑不住。", "🍜"); return; }
    const cost = state.freeFood ? 0 : 70;
    if (state.wallet < cost) { simpleMessage("钱包不够", `吃饭需要${money(cost)}现金。银行有钱也要先去提款。`, "👛"); return; }
    openModal(`<p class="eyebrow">月底食堂</p><h2>今天吃什么？</h2>
      <p>支付${money(cost)}后随机抽一道食物。每月只能吃一次。</p>
      <button id="draw-food" class="pixel-btn primary">${cost ? `支付${money(cost)}并抽卡` : "使用免费餐券抽卡"}</button>`);
    $("#draw-food").addEventListener("click", () => {
      state.wallet -= cost;
      state.freeFood = false;
      const candidates = [weightedOutcome(FOODS), weightedOutcome(FOODS), weightedOutcome(FOODS)];
      runCardDraw({
        eyebrow: "月底食堂",
        title: "看menu太久了，直接抽",
        hint: "老板把三张菜牌反扣在桌上。翻哪张就吃哪张。",
        candidates,
        faceUp: food => cardMarkup(food, "good", "本月一次", `food:${food.id}`),
        missed: food => cardMarkup(food, "good", "", `food:${food.id}`),
        stingFor: food => food.motivation >= 12 ? 880 : food.motivation >= 6 ? 620 : 300,
        confirmLabel: "吃饱了",
        onConfirm: food => {
          collect("食物卡", food.id);
          state.motivation = clamp(state.motivation + food.motivation, 0, 100);
          state.luck = clamp(state.luck + (food.luck || 0), 0, 100);
          state.wallet += food.refund || 0;
          state.flags.food = true;
          spendTime(10);
          state.monthLog.push({ label: `食物：${food.name}`, amount: -(cost - (food.refund || 0)), positive: false });
          closeModal();
          updateHUD();
          showToast(`吃了${food.name}，${food.effect}`);
        }
      });
    });
  }

  function showFun() {
    if (state.flags.fun) { simpleMessage("快乐额度用完", "一个月只能娱乐一次。剩下的快乐请留到下个月。", "🕹️"); return; }
    if (state.wallet < 50) { simpleMessage("钱包不允许快乐", "娱乐需要$50现金。", "👛"); return; }
    openModal(`<p class="eyebrow">开心一下</p><h2>花$50抽一次快乐</h2><p>最差也会恢复一点动力。</p><button id="draw-fun" class="pixel-btn primary">支付$50并抽卡</button>`);
    $("#draw-fun").addEventListener("click", () => {
      state.wallet -= 50;
      const candidates = [weightedOutcome(FUN_CARDS), weightedOutcome(FUN_CARDS), weightedOutcome(FUN_CARDS)];
      runCardDraw({
        eyebrow: "开心一下",
        title: "今晚做什么？",
        hint: "三个计划反扣着。翻开哪个就去做哪个，不准反悔。",
        candidates,
        faceUp: fun => cardMarkup(fun, "choice", "本月一次", `fun:${fun.id}`),
        missed: fun => cardMarkup(fun, "choice", "", `fun:${fun.id}`),
        stingFor: fun => fun.motivation >= 12 ? 880 : fun.motivation >= 5 ? 620 : 300,
        confirmLabel: "心情好多了",
        onConfirm: fun => {
          collect("娱乐卡", fun.id);
          state.motivation = clamp(state.motivation + fun.motivation, 0, 100);
          state.luck = clamp(state.luck + (fun.luck || 0), 0, 100);
          state.wallet += (fun.cash || 0) + (fun.refund || 0);
          state.flags.fun = true;
          spendTime(15);
          state.monthLog.push({ label: `娱乐：${fun.name}`, amount: -50 + (fun.cash || 0) + (fun.refund || 0), positive: false });
          closeModal();
          updateHUD();
          showToast(`${fun.name}，${fun.effect}`);
        }
      });
    });
  }

  function showBank() {
    const rent = currentRent();
    openModal(`<p class="eyebrow">稳稳银行 · 本月利息${Math.round(state.bankRate * 100)}%</p><h2>钱要放对地方</h2>
      <div class="status-strip"><span class="status-chip">钱包 ${money(state.wallet)}</span><span class="status-chip">银行 ${money(state.bank)}</span><span class="status-chip">债务 ${money(state.debt)}</span><span class="status-chip">房租 ${money(rent)}</span></div>
      <p class="modal-intro">房租只会从银行自动扣款。存款、提款和还债每次消耗5秒。</p>
      <div class="input-row"><label>金额<input id="bank-amount" type="number" min="1" step="10" value="100"></label>
        <button id="deposit-btn" class="pixel-btn primary">存入银行</button><button id="withdraw-btn" class="pixel-btn">从银行提款</button><button id="repay-btn" class="pixel-btn danger">偿还债务</button></div>`);
    $("#deposit-btn").addEventListener("click", () => bankTransfer("deposit"));
    $("#withdraw-btn").addEventListener("click", () => bankTransfer("withdraw"));
    $("#repay-btn").addEventListener("click", () => bankTransfer("repay"));
  }

  function bankTransfer(type) {
    const amount = Math.max(0, Math.floor(Number($("#bank-amount").value) || 0));
    if (!amount) { showToast("先输入金额"); return; }
    if (type === "deposit") {
      if (state.wallet < amount) { showToast("钱包现金不够"); return; }
      state.wallet -= amount; state.bank += amount;
    } else if (type === "withdraw") {
      if (state.bank < amount) { showToast("银行余额不够"); return; }
      state.bank -= amount; state.wallet += amount;
    } else {
      const paid = Math.min(amount, state.debt, state.bank);
      if (!paid) { showToast("银行余额不足，或目前没有债务"); return; }
      state.bank -= paid; state.debt -= paid;
    }
    spendTime(5);
    updateHUD();
    showBank();
  }

  function ensureStockOffers() {
    if (!state.stockOffers.length) state.stockOffers = shuffle(STOCKS).slice(0, 3).map(item => item.id);
  }

  function showStock() {
    ensureStockOffers();
    state.stockOffers.forEach(id => collect("股票卡", id));
    const offers = state.stockOffers.map(id => STOCKS.find(item => item.id === id));
    const holdings = Object.entries(state.holdings).filter(([, holding]) => holding.qty > 0);
    openModal(`<p class="eyebrow">涨跌交易所</p><h2>本月发现的三只股票</h2>
      <p class="modal-intro">本月只能购买其中一种，最多10股；已有股票随时可以卖。买卖没有手续费，每次操作消耗8秒。</p>
      <div class="card-grid">${offers.map(item => {
        const price = state.stockPrices[item.id];
        const hint = state.marketHint ? (price.change >= 0 ? "小道消息：市场气氛不错" : "小道消息：最近有点冷") : "趋势每月更新";
        return cardMarkup(item, "stock", `${money(price.price)}/股 · ${hint}`, `stock:${item.id}`);
      }).join("")}</div>
      <h3>我的持仓</h3>
      ${holdings.length ? `<table class="ledger"><tbody>${holdings.map(([id, holding]) => {
        const item = STOCKS.find(stock => stock.id === id), current = state.stockPrices[id].price;
        const profit = Math.round((current / holding.avg - 1) * 100);
        return `<tr><td>${item.icon} ${item.name}</td><td>${holding.qty}股 · 均价${money(holding.avg)}</td><td class="${profit >= 0 ? "positive" : "negative"}">${profit >= 0 ? "+" : ""}${profit}% ${profit >= 15 ? "· 经纪人建议考虑卖出" : ""}</td><td><button class="pixel-btn" data-sell="${id}">卖1股</button></td></tr>`;
      }).join("")}</tbody></table>` : "<p>还没有股票。</p>"}` , { wide: true });
    $$('.game-card[data-card-id]').forEach(button => button.addEventListener("click", () => buyStockPrompt(button.dataset.cardId)));
    $$('[data-sell]').forEach(button => button.addEventListener("click", () => sellStock(button.dataset.sell)));
  }

  function buyStockPrompt(id) {
    if (state.flags.stockBought) { showToast("本月已经买过一种股票"); return; }
    const stock = STOCKS.find(item => item.id === id), price = state.stockPrices[id].price;
    openModal(`<p class="eyebrow">买入股票</p><h2>${stock.icon} ${stock.name}</h2><p>当前每股${money(price)}，最多持有10股。所选账户不足时会自动使用另一个账户补足。</p>
      <div class="input-row"><label>购买股数<select id="stock-qty">${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}股 · ${money((i + 1) * price)}</option>`).join("")}</select></label>
      <label>优先付款<select id="stock-payment"><option value="wallet">钱包优先</option><option value="bank">银行优先</option><option value="auto">自动组合</option></select></label>
      <button id="confirm-stock" class="pixel-btn primary">确认购买</button><button id="back-stock" class="pixel-btn">返回</button></div>`);
    $("#confirm-stock").addEventListener("click", () => {
      const qty = Number($("#stock-qty").value), currentQty = state.holdings[id]?.qty || 0;
      if (currentQty + qty > 10) { showToast("这只股票最多持有10股"); return; }
      const cost = qty * price;
      const payment = $("#stock-payment").value;
      if (!spendCombined(cost, payment)) { showToast("钱包和银行加起来也不够"); return; }
      const old = state.holdings[id] || { qty: 0, avg: 0 };
      state.holdings[id] = { qty: old.qty + qty, avg: Math.round((old.avg * old.qty + cost) / (old.qty + qty)) };
      state.flags.stockBought = true;
      spendTime(8);
      state.monthLog.push({ label: `买入${stock.name}`, amount: -cost, positive: false });
      closeModal(); updateHUD(); showToast(`买入${qty}股${stock.name}`);
    });
    $("#back-stock").addEventListener("click", showStock);
  }

  function sellStock(id) {
    const holding = state.holdings[id];
    if (!holding?.qty) return;
    const stock = STOCKS.find(item => item.id === id), price = state.stockPrices[id].price;
    holding.qty -= 1;
    state.wallet += price;
    spendTime(8);
    state.monthLog.push({ label: `卖出${stock.name}1股`, amount: price, positive: true });
    updateHUD();
    showStock();
  }

  function showROI() {
    if (state.flags.roi) { simpleMessage("本月已经投过了", "投资需要一点耐心。下个月钱会自动进入银行。", "🎯"); return; }
    openModal(`<p class="eyebrow">回报研究所</p><h2>选择风险，再抽回报</h2>
      <p class="modal-intro">投入的钱会锁定一个月，下个月自动进入银行。不会损失全部本金。</p>
      <div class="card-grid">${ROI_TYPES.map(type => cardMarkup(type, type.color, `${type.min}% ～ +${type.max}%`, `roi:${type.id}`)).join("")}</div>`);
    $$('.game-card').forEach(button => button.addEventListener("click", () => chooseROIAmount(button.dataset.cardId)));
  }

  function chooseROIAmount(typeId) {
    const type = ROI_TYPES.find(item => item.id === typeId);
    openModal(`<p class="eyebrow">${type.name}</p><h2>投入多少？</h2>
      <p>可能回报：${type.min}%至+${type.max}%。付款会自动组合钱包与银行余额。</p>
      <div class="input-row"><label>优先付款<select id="roi-payment"><option value="wallet">钱包优先</option><option value="bank">银行优先</option><option value="auto">自动组合</option></select></label></div>
      <div class="button-row">${[100, 200, 300].map(amount => `<button class="pixel-btn ${amount === 200 ? "primary" : ""}" data-roi-amount="${amount}" ${combinedFunds() < amount ? "disabled" : ""}>投入${money(amount)}<br><small>${money(Math.round(amount * (1 + type.min / 100)))}～${money(Math.round(amount * (1 + type.max / 100)))}</small></button>`).join("")}</div>
      <button id="back-roi" class="pixel-btn ghost" style="margin-top:16px">返回</button>`);
    $$('[data-roi-amount]').forEach(button => button.addEventListener("click", () => investROI(type, Number(button.dataset.roiAmount), $("#roi-payment").value)));
    $("#back-roi").addEventListener("click", showROI);
  }

  function investROI(type, amount, payment) {
    if (!spendCombined(amount, payment)) return;
    const rate = Math.floor(type.min + Math.random() * (type.max - type.min + 1));
    const payout = Math.max(1, Math.round(amount * (1 + rate / 100)));
    state.pendingROI.push({ dueMonth: state.month + 1, amount, payout, rate, name: type.name });
    state.flags.roi = true;
    collect("ROI卡", type.id);
    spendTime(10);
    state.monthLog.push({ label: `投入${type.name}`, amount: -amount, positive: false });
    openModal(`<p class="eyebrow">ROI抽卡结果</p><h2>${rate >= 0 ? "项目看起来不错" : "好像有点不妙"}</h2>
      <div class="result-box">投入：${money(amount)}<br>抽到回报：<strong class="${rate >= 0 ? "positive" : "negative"}">${rate >= 0 ? "+" : ""}${rate}%</strong><br>下个月进入银行：<strong>${money(payout)}</strong></div>
      <button id="roi-done" class="pixel-btn primary">记住了</button>`, { closable: false });
    $("#roi-done").addEventListener("click", closeModal);
    updateHUD();
  }

  function showShop() {
    const offers = state.shopOffers.map(id => LUCK_ITEMS.find(item => item.id === id));
    openModal(`<p class="eyebrow">包好运杂货铺</p><h2>老板说：不灵不退款</h2>
      <p class="modal-intro">永久物品占用三格背包；药水只在本月生效。商品只能用钱包现金购买。</p>
      <div class="status-strip">
        <span class="status-chip">钱包 ${money(state.wallet)}</span>
        <span class="status-chip">永久背包 ${state.permanentItems.length}/3</span>
        <span class="status-chip">当前幸运 ${effectiveLuck()}</span>
      </div>
      <div class="card-grid">${offers.map(item => {
        const owned = !item.temporary && state.permanentItems.includes(item.id);
        const tooPoor = state.wallet < item.price;
        const note = owned ? "已拥有" : tooPoor ? `${money(item.price)} · 钱不够` : `${money(item.price)} · ${item.temporary ? "本月有效" : "永久装备"}`;
        return cardMarkup(item, owned ? "owned" : tooPoor ? "unaffordable" : "choice", note, `luck:${item.id}`);
      }).join("")}</div>`);
    $$('.game-card').forEach(button => button.addEventListener("click", () => buyLuckItem(button.dataset.cardId)));
  }

  function buyLuckItem(id) {
    const item = LUCK_ITEMS.find(entry => entry.id === id);
    if (state.wallet < item.price) { showToast("钱包现金不够"); return; }
    if (!item.temporary && state.permanentItems.length >= 3) { showToast("永久背包已经满了，先卖掉一件"); return; }
    if (!item.temporary && state.permanentItems.includes(id)) { showToast("同名物品效果不能叠加"); return; }
    state.wallet -= item.price;
    if (item.temporary) state.monthLuckBonus += item.luck;
    else state.permanentItems.push(item.id);
    collect("幸运物品", item.id);
    spendTime(5);
    updateHUD();
    showShop();
    showToast(`买到${item.name}`);
  }

  function showHome() {
    const house = HOUSES.find(item => item.id === state.houseId);
    openModal(`<p class="eyebrow">${house.name}</p><h2>要睡觉了吗？</h2>
      <p>睡觉会立即结束第${state.month}月，恢复${house.sleep + state.sleepBonus}动力。还剩<strong>${formatTime(state.remainingSec)}</strong>。</p>
      <div class="button-row"><button id="sleep-btn" class="pixel-btn primary">睡觉，结束本月</button><button id="not-yet-btn" class="pixel-btn ghost">还没，我再出去一下</button></div>`);
    $("#sleep-btn").addEventListener("click", () => { closeModal(); endMonth(true); });
    $("#not-yet-btn").addEventListener("click", closeModal);
  }

  function showBag() {
    if (!state) return;
    const permanent = state.permanentItems.map(id => LUCK_ITEMS.find(item => item.id === id));
    const temporary = state.tempTools.map(id => TEMP_TOOLS.find(item => item.id === id));
    openModal(`<p class="eyebrow">背包</p><h2>永久幸运物品 ${permanent.length}/3</h2>
      <div class="inventory-grid">${[0, 1, 2].map(index => permanent[index] ? `<div class="inventory-slot"><strong>${permanent[index].icon} ${permanent[index].name}</strong><p>${permanent[index].copy}</p><button class="pixel-btn" data-sell-item="${permanent[index].id}">卖出 ${money(permanent[index].price * .5)}</button></div>` : `<div class="inventory-slot empty">空位</div>`).join("")}</div>
      <h3 style="margin-top:24px">本月临时工具 ${temporary.length}/3</h3>
      <div class="inventory-grid">${[0, 1, 2].map(index => temporary[index] ? `<div class="inventory-slot"><strong>${temporary[index].icon} ${temporary[index].name}</strong><p>${temporary[index].copy}</p><button class="pixel-btn primary" data-use-tool="${index}">使用</button></div>` : `<div class="inventory-slot empty">空位</div>`).join("")}</div>`);
    $$('[data-sell-item]').forEach(button => button.addEventListener("click", () => sellItem(button.dataset.sellItem)));
    $$('[data-use-tool]').forEach(button => button.addEventListener("click", () => useTool(Number(button.dataset.useTool))));
  }

  function sellItem(id) {
    const item = LUCK_ITEMS.find(entry => entry.id === id);
    state.permanentItems.splice(state.permanentItems.indexOf(id), 1);
    state.wallet += Math.round(item.price * 0.5);
    updateHUD(); showBag();
  }

  function useTool(index) {
    const id = state.tempTools[index], tool = TEMP_TOOLS.find(item => item.id === id);
    tool.use();
    state.tempTools.splice(index, 1);
    updateHUD(); showBag(); showToast(`${tool.name}已使用`);
  }

  function simpleMessage(title, copy, icon = "💬") {
    openModal(`<p class="eyebrow">${icon} 提醒</p><h2>${title}</h2><div class="result-box">${copy}</div><button id="message-ok" class="pixel-btn primary">知道了</button>`);
    $("#message-ok").addEventListener("click", closeModal);
  }

  function updateStocks() {
    const changes = {};
    STOCKS.forEach(stock => {
      const strong = Math.random() < 0.18;
      const min = strong ? -20 : -10, max = strong ? 25 : 15;
      const change = Math.floor(min + Math.random() * (max - min + 1));
      const entry = state.stockPrices[stock.id];
      entry.price = Math.max(5, Math.round(entry.price * (1 + change / 100)));
      entry.change = change;
      changes[stock.id] = change;
    });
    return changes;
  }

  function endMonth(slept) {
    if (!playing) return;
    playing = false;
    paused = true;
    closeModal();
    const house = HOUSES.find(item => item.id === state.houseId);
    const report = [...state.monthLog];

    if (slept) {
      const gain = house.sleep + state.sleepBonus;
      state.motivation = clamp(state.motivation + gain, 0, 100);
      report.push({ label: "回家睡觉", text: `动力+${gain}` });
    } else {
      state.motivation = clamp(state.motivation - 10, 0, 100);
      report.push({ label: "时间归零没睡觉", text: "动力-10" });
    }
    if (!state.flags.food) {
      state.motivation = clamp(state.motivation - 20, 0, 100);
      report.push({ label: "本月忘了吃饭", text: "动力-20" });
    }

    const rent = currentRent();
    if (state.bank >= rent) {
      state.bank -= rent;
      state.missedRentStreak = 0;
      report.push({ label: "自动支付房租", amount: -rent, positive: false });
    } else {
      const paid = state.bank;
      const shortfall = rent - paid;
      state.bank = 0;
      state.debt += shortfall;
      state.missedRentStreak += 1;
      report.push({ label: `房租不足（连续${state.missedRentStreak}月）`, amount: -paid, text: `新增债务${money(shortfall)}`, positive: false });
    }

    if (state.debt > 0) {
      const interest = Math.max(1, Math.round(state.debt * 0.05));
      state.debt += interest;
      report.push({ label: "债务利息5%", amount: -interest, positive: false });
    }
    if (state.bank > 0) {
      const interest = Math.max(2, Math.round(state.bank * state.bankRate));
      state.bank += interest;
      report.push({ label: `银行利息${Math.round(state.bankRate * 100)}%`, amount: interest, positive: true });
    }

    const stockChanges = updateStocks();
    const ownedChanges = Object.keys(state.holdings).filter(id => state.holdings[id].qty > 0).map(id => {
      const stock = STOCKS.find(item => item.id === id);
      return `${stock.name} ${stockChanges[id] >= 0 ? "+" : ""}${stockChanges[id]}%`;
    });
    if (ownedChanges.length) report.push({ label: "股票行情", text: ownedChanges.join("、") });

    const failed = state.missedRentStreak >= 3;
    const finished = state.month >= 12;
    localStorage.removeItem(GAME_KEY);
    showMonthReport(report, slept, failed, finished);
  }

  function showMonthReport(report, slept, failed, finished) {
    const total = totalAssets();
    const rows = report.map(row => `<tr><td>${row.label}</td><td class="${row.amount > 0 ? "positive" : row.amount < 0 ? "negative" : ""}">${row.text || (row.amount != null ? money(row.amount) : "—")}</td></tr>`).join("");
    openModal(`<p class="eyebrow">第${state.month}月结束</p><h2>${slept ? "至少今晚睡得着" : "你在路边站到了月底"}</h2>
      <table class="ledger"><tbody>${rows || "<tr><td>这个月很安静</td><td>—</td></tr>"}</tbody></table>
      <div class="status-strip"><span class="status-chip">钱包 ${money(state.wallet)}</span><span class="status-chip">银行 ${money(state.bank)}</span><span class="status-chip">债务 ${money(state.debt)}</span><span class="status-chip">总资产 ${money(total)}</span><span class="status-chip">动力 ${state.motivation}</span></div>
      ${state.missedRentStreak ? `<div class="result-box negative">⚠ 已连续${state.missedRentStreak}个月没有完整交租。连续3个月将破产。</div>` : ""}
      <button id="next-month" class="pixel-btn ${failed ? "danger" : "primary"}" style="width:100%">${failed ? "面对破产" : finished ? "查看12个月结局" : `开始第${state.month + 1}月`}</button>`, { closable: false, wide: true });
    $("#next-month").addEventListener("click", () => {
      closeModal();
      if (failed) showEnding(true);
      else if (finished) showEnding(false);
      else { state.month += 1; beginMonth(); }
    });
  }

  function totalAssets() {
    const stockValue = Object.entries(state.holdings).reduce((sum, [id, holding]) => sum + holding.qty * state.stockPrices[id].price, 0);
    const pending = state.pendingROI.reduce((sum, item) => sum + item.payout, 0);
    return Math.round(state.wallet + state.bank + stockValue + pending - state.debt);
  }

  function showEnding(bankrupt) {
    playing = false; paused = true; stopMusic();
    localStorage.removeItem(GAME_KEY);
    switchScreen("end");
    const assets = totalAssets();
    let title = "月底幸存者", art = "🧾", message = "你没有成为百万富翁，但至少房东暂时没有追出来。";
    if (bankrupt) { title = "钱包正式投降"; art = "💸"; message = "哎呀，你真的撑不到月底了。下次记得先把房租放进银行。"; }
    else if (assets >= 9000) { title = "钱包战神"; art = "👑"; message = "十二个月过去，月底看到你都绕路走。"; }
    else if (assets >= 6500) { title = "投资勇者"; art = "🚀"; message = "你把工资、运气和一点胆量变成了真正的资产。"; }
    else if (assets >= 4000) { title = "银行常客"; art = "🏦"; message = "你可能不富，但你至少知道房租应该放在哪里。"; }
    $("#ending-kicker").textContent = bankrupt ? "游戏失败" : "12个月结束";
    $("#ending-title").textContent = title;
    $("#ending-art").textContent = art;
    $("#ending-message").textContent = message;
    $("#ending-assets").textContent = money(assets);
  }

  const COLLECTION_ART_PREFIXES = { "命运卡": "fate", "工作卡": "work", "兼职卡": "parttime", "工具卡": "tool", "食物卡": "food", "娱乐卡": "fun", "股票卡": "stock", "ROI卡": "roi", "幸运物品": "luck" };

  function collectionArtKey(category, item) {
    const rawId = category === "工作卡" ? item.id.replace("salary-", "") : item.id;
    return `${COLLECTION_ART_PREFIXES[category]}:${rawId}`;
  }

  function collectionCardClass(category, item) {
    if (category === "命运卡") return item.type || "choice";
    if (category === "股票卡") return "stock";
    if (category === "ROI卡") return item.color || "choice";
    return "choice";
  }

  function showCollectionCard(category, id) {
    const item = CATALOG[category]?.find(entry => entry.id === id);
    if (!item) return;
    openModal(`<p class="eyebrow">${category}</p><h2>${item.name}</h2>
      <div class="collection-preview">${cardMarkup(item, collectionCardClass(category, item), "已收集", collectionArtKey(category, item))}</div>
      <button id="collection-back" class="pixel-btn primary full-button">返回卡片图鉴</button>`);
    $("#collection-back").addEventListener("click", showCollection);
  }

  function showCollection() {
    const sections = Object.entries(CATALOG).map(([category, items]) => {
      const cards = items.map(item => {
        const found = collection.includes(`${category}:${item.id}`);
        const display = found ? item : { id: item.id, name: "尚未发现", icon: "❓", copy: "继续游戏来解锁" };
        return `<div class="collection-card ${found ? "is-found" : "locked"}" data-collection-category="${category}" data-collection-id="${item.id}">${cardMarkup(display, found ? collectionCardClass(category, item) : "unaffordable", found ? "已收集" : "???", found ? collectionArtKey(category, item) : "")}</div>`;
      }).join("");
      return `<h3 class="collection-heading">${category} <small>${items.filter(item => collection.includes(`${category}:${item.id}`)).length}/${items.length}</small></h3><div class="collection-grid">${cards}</div>`;
    }).join("");
    openModal(`<p class="eyebrow">永久收藏</p><h2>卡片图鉴</h2>${sections}`, { wide: true });
    $$(".collection-card.is-found").forEach(card => card.addEventListener("click", () => {
      showCollectionCard(card.dataset.collectionCategory, card.dataset.collectionId);
    }));
  }

  function drawCover(img, sx, sy, sw, sh, dx, dy, dw, dh) {
    const srcAspect = sw / sh, dstAspect = dw / dh;
    let cx = sx, cy = sy, cw = sw, ch = sh;
    if (srcAspect > dstAspect) { cw = sh * dstAspect; cx = sx + (sw - cw) / 2; }
    else { ch = sw / dstAspect; cy = sy + (sh - ch) / 2; }
    ctx.drawImage(img, cx, cy, cw, ch, dx, dy, dw, dh);
  }

  function drawSpriteCell(img, col, row, cols, rows, x, y, height) {
    if (!img.complete || !img.naturalWidth) return false;
    const cellW = img.naturalWidth / cols;
    const cellH = img.naturalHeight / rows;
    const width = height * (cellW / cellH);
    ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH, Math.round(x - width / 2), Math.round(y - height + 8), width, height);
    return true;
  }

  function drawPixelPerson(x, y, facing, moving) {
    if (!ART.player.complete || !ART.player.naturalWidth) return;
    const cellW = ART.player.naturalWidth / 8;
    const cellH = ART.player.naturalHeight / 4;
    const rows = { down: 0, left: 1, right: 2, up: 3 };
    const row = rows[facing] ?? 0;
    const column = moving ? 1 + Math.floor(performance.now() / 105) % 6 : 0;
    const size = state.scene === "town" ? 58 : 66;
    ctx.drawImage(ART.player, column * cellW, row * cellH, cellW, cellH, Math.round(x - size / 2), Math.round(y - size + 7), size, size);
  }

  function drawTown() {
    const phase = state.remainingSec > 200 ? "day" : state.remainingSec > 100 ? "sunset" : "night";
    const useArt = ART.town.complete && ART.town.naturalWidth;
    if (useArt) {
      drawCover(ART.town, 0, 0, ART.town.naturalWidth, ART.town.naturalHeight, 0, 0, 960, 540);
    } else {
      const colors = phase === "day" ? { grass: "#75be65", road: "#d8c294" } : phase === "sunset" ? { grass: "#79a85e", road: "#c7a278" } : { grass: "#315370", road: "#66728a" };
      ctx.fillStyle = colors.grass; ctx.fillRect(0, 0, 960, 540);
      ctx.fillStyle = colors.road; ctx.fillRect(0, 158, 960, 48); ctx.fillRect(0, 346, 960, 42); ctx.fillRect(232, 0, 28, 540); ctx.fillRect(704, 0, 28, 540);
      ctx.fillStyle = "rgba(255,255,255,.25)";
      for (let x = 8; x < 960; x += 60) ctx.fillRect(x, 180, 30, 4);
      for (let y = 10; y < 540; y += 54) { ctx.fillRect(244, y, 4, 25); ctx.fillRect(716, y, 4, 25); }
      for (let i = 0; i < 12; i++) drawTree(18 + (i * 83) % 920, 214 + (i % 2) * 118, phase);
    }
    buildingList().forEach(building => drawBuilding(building, useArt));
    drawBoard(useArt);
    drawPixelPerson(state.player.x, state.player.y, state.player.facing, state.player.moving);
    if (phase === "sunset" || phase === "night") {
      if (useArt) ctx.fillStyle = phase === "night" ? "rgba(10,14,40,.45)" : "rgba(255,140,70,.12)";
      else ctx.fillStyle = "rgba(13,18,50,.24)";
      if (useArt || phase === "night") ctx.fillRect(0, 0, 960, 540);
    }
    if (phase === "night") {
      buildingList().forEach(building => {
        if (useArt) { const door = getDoor(building); ctx.fillStyle = "rgba(255,214,90,.55)"; ctx.beginPath(); ctx.arc(door.x, building.y + building.h * 0.35, 3, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillStyle = "rgba(255,214,90,.7)"; ctx.fillRect(building.x + 20, building.y + 42, 26, 22); }
      });
      LAMP_SPOTS.forEach(spot => drawLampGlow(spot.x, spot.y));
    }
  }

  // Roughly where the street lamps are painted in town-map-v2.png.
  const LAMP_SPOTS = [
    { x: 36, y: 126 }, { x: 122, y: 196 }, { x: 266, y: 264 }, { x: 302, y: 200 },
    { x: 456, y: 240 }, { x: 492, y: 190 }, { x: 628, y: 288 }, { x: 800, y: 288 },
    { x: 944, y: 206 }, { x: 36, y: 392 }, { x: 806, y: 466 }, { x: 596, y: 452 }
  ];

  function drawLampGlow(x, y) {
    const radius = 36;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, "rgba(255,228,160,.75)");
    glow.addColorStop(0.45, "rgba(255,210,120,.28)");
    glow.addColorStop(1, "rgba(255,200,110,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.fillStyle = "rgba(255,248,222,.95)";
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawBuilding(building, useArt) {
    if (!useArt) {
      ctx.fillStyle = "#2a233c"; ctx.fillRect(building.x - 5, building.y - 18, building.w + 10, 22);
      ctx.fillStyle = building.color; ctx.fillRect(building.x, building.y, building.w, building.h);
      ctx.fillStyle = "#fff2ce"; ctx.fillRect(building.x + 10, building.y + 8, building.w - 20, 25);
      ctx.fillStyle = "#241d35"; ctx.font = "bold 13px monospace"; ctx.textAlign = "center"; ctx.fillText(`${building.icon} ${building.label}`, building.x + building.w / 2, building.y + 26);
      ctx.fillStyle = "#8ed2df"; ctx.fillRect(building.x + 18, building.y + 47, 30, 24); ctx.fillRect(building.x + building.w - 48, building.y + 47, 30, 24);
      ctx.fillStyle = "#4d3650"; ctx.fillRect(building.x + building.w / 2 - 15, building.y + building.h - 30, 30, 30);
      ctx.fillStyle = "#f6cd62"; ctx.fillRect(building.x + building.w / 2 + 7, building.y + building.h - 15, 3, 3);
      return;
    }
    const door = getDoor(building);
    const near = Math.hypot(state.player.x - door.x, state.player.y - door.y) < 46;
    const compactMobile = window.matchMedia("(max-width: 850px)").matches;
    if (!compactMobile) drawSignpost(`${building.icon} ${building.label}`, building.x + building.w / 2, door.y + 24, near);
    if (near) {
      ctx.strokeStyle = "rgba(255,214,90,.9)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(door.x, door.y, 20, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawSignpost(text, centerX, centerY, near) {
    ctx.font = "bold 17px monospace";
    const textWidth = ctx.measureText(text).width;
    ctx.fillStyle = near ? "rgba(255,214,90,.95)" : "rgba(18,14,32,.78)";
    ctx.fillRect(centerX - textWidth / 2 - 11, centerY - 15, textWidth + 22, 28);
    ctx.strokeStyle = near ? "#241d35" : "rgba(255,246,222,.35)"; ctx.lineWidth = 2;
    ctx.strokeRect(centerX - textWidth / 2 - 11, centerY - 15, textWidth + 22, 28);
    ctx.fillStyle = near ? "#241d35" : "#fff6de";
    ctx.textAlign = "center";
    ctx.fillText(text, centerX, centerY + 6);
  }

  function drawBoard(useArt) {
    if (!useArt) {
      ctx.fillStyle = "#5c3829"; ctx.fillRect(818, 286, 7, 56); ctx.fillRect(875, 286, 7, 56);
      ctx.fillStyle = "#f4d777"; ctx.fillRect(802, 258, 96, 55);
      ctx.strokeStyle = "#2a233c"; ctx.lineWidth = 4; ctx.strokeRect(802, 258, 96, 55);
      ctx.fillStyle = "#2a233c"; ctx.font = "bold 13px monospace"; ctx.textAlign = "center"; ctx.fillText("兼职抽卡", 850, 282); ctx.fillText("每月一次", 850, 300);
      return;
    }
    const near = Math.hypot(state.player.x - BOARD.x, state.player.y - BOARD.y) < 46;
    const compactMobile = window.matchMedia("(max-width: 850px)").matches;
    if (!compactMobile) drawSignpost(`${BOARD.icon} ${BOARD.label}`, BOARD.x, BOARD.y + 34, near);
    if (near) {
      ctx.strokeStyle = "rgba(255,214,90,.9)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(BOARD.x, BOARD.y, 20, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawTree(x, y, phase) {
    ctx.fillStyle = "#6b432e"; ctx.fillRect(x, y, 7, 20);
    ctx.fillStyle = phase === "night" ? "#28564b" : "#397c45"; ctx.fillRect(x - 9, y - 16, 25, 24); ctx.fillRect(x - 3, y - 24, 14, 12);
  }

  function drawInterior() {
    const building = buildingList().find(item => item.id === state.interiorId);
    const panel = INTERIOR_PANELS[state.interiorId];
    const useArt = panel && ART.interiors.complete && ART.interiors.naturalWidth;
    ctx.fillStyle = "#d8c29d"; ctx.fillRect(0, 0, 960, 540);
    if (useArt) {
      const cellW = ART.interiors.naturalWidth / 5;
      const cellH = ART.interiors.naturalHeight / 2;
      drawCover(ART.interiors, panel[0] * cellW, panel[1] * cellH, cellW, cellH, 50, 95, 860, 360);
    } else {
      ctx.fillStyle = building?.color || "#9275b8"; ctx.fillRect(0, 0, 960, 105);
      ctx.fillStyle = "#f6eccf"; ctx.fillRect(50, 95, 860, 360);
      ctx.fillStyle = "#8d765e";
      for (let y = 110; y < 455; y += 34) ctx.fillRect(50, y, 860, 3);
      ctx.fillStyle = "#755244"; ctx.fillRect(350, 185, 260, 62);
    }
    ctx.fillStyle = building?.color || "#9275b8"; ctx.fillRect(0, 0, 960, 40);
    ctx.fillStyle = "#fff2ce"; ctx.font = "bold 22px monospace"; ctx.textAlign = "center"; ctx.fillText(`${building?.icon || ""} ${building?.label || "室内"}`, 480, 27);
    ctx.fillStyle = "#2a233c"; ctx.fillRect(446, 453, 68, 62);
    drawNPC(480, 330, building?.id);
    drawPixelPerson(state.player.x, state.player.y, state.player.facing, state.player.moving);
  }

  function drawNPC(x, y, id) {
    const col = NPC_COLUMNS[id] ?? NPC_COLUMNS.work;
    const row = Math.floor(performance.now() / 900) % 2;
    if (drawSpriteCell(ART.npcs, col, row, 9, 2, x, y, 190)) return;
    const colors = { bank: "#e6bb3e", work: "#657fd1", stock: "#58a4cd", roi: "#8268b6", food: "#dc7d3e", fun: "#d75b91", shop: "#58a879", home: "#a7846a" };
    ctx.fillStyle = "#33243c"; ctx.fillRect(x - 11, y - 24, 22, 8);
    ctx.fillStyle = "#f2ad7f"; ctx.fillRect(x - 9, y - 17, 18, 15);
    ctx.fillStyle = colors[id] || "#657fd1"; ctx.fillRect(x - 13, y - 2, 26, 28);
  }

  function updateCamera() {
    const stage = canvas.parentElement;
    const portraitPhone = window.matchMedia("(max-width: 850px) and (orientation: portrait)").matches;
    if (!portraitPhone || !stage.clientHeight) {
      canvas.style.left = "";
      return;
    }
    const renderedWidth = canvas.clientHeight * (canvas.width / canvas.height);
    const focusX = state.scene === "town" ? state.player.x : 480;
    const desiredLeft = stage.clientWidth / 2 - (focusX / canvas.width) * renderedWidth;
    canvas.style.left = `${clamp(desiredLeft, stage.clientWidth - renderedWidth, 0)}px`;
  }

  function renderFrame(now) {
    const delta = Math.min(0.04, (now - lastFrame) / 1000);
    lastFrame = now;
    if (state && playing && !paused) {
      let dx = 0, dy = 0;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
      if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
      if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;
      const smoothing = 1 - Math.exp(-delta * 18);
      movementVelocity.x += (dx - movementVelocity.x) * smoothing;
      movementVelocity.y += (dy - movementVelocity.y) * smoothing;
      movePlayer(movementVelocity.x, movementVelocity.y, delta);
      state.remainingSec -= delta;
      if (state.remainingSec <= 0) { state.remainingSec = 0; endMonth(false); }
      updateHUD();
    } else if (state) {
      state.player.moving = false;
      movementVelocity.x = 0;
      movementVelocity.y = 0;
    }

    if (state && !screens.game.hidden) {
      if (state.scene === "town") drawTown(); else drawInterior();
      updateCamera();
      nearbyTarget = findNearbyTarget();
      const hint = $("#interaction-hint");
      hint.hidden = !nearbyTarget || paused;
      hint.textContent = nearbyTarget ? `E · ${nearbyTarget.label}` : "";
      $("#mobile-action").hidden = !nearbyTarget || paused;
      if (state.scene === "town") $("#location-label").textContent = nearbyTarget?.label || "月底小镇";
    }
    requestAnimationFrame(renderFrame);
  }

  function initAudio() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
  }

  function beep(frequency, duration = .08, type = "square", volume = .02) {
    if (!soundEnabled) return;
    try {
      initAudio();
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = type; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
    } catch { /* Audio is optional. */ }
  }

  function startMusic() {
    stopMusic();
    if (!soundEnabled) return;
    const notes = [262, 330, 392, 330, 294, 349, 440, 349];
    let index = 0;
    musicTimer = setInterval(() => {
      if (!paused && playing) {
        const phaseBoost = state.remainingSec < 100 ? 1.18 : state.remainingSec < 200 ? 1.08 : 1;
        beep(notes[index++ % notes.length] * phaseBoost, .09, "square", .009);
      }
    }, 520);
  }

  function stopMusic() { clearInterval(musicTimer); musicTimer = null; }

  function toggleAudio() {
    soundEnabled = !soundEnabled;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sound: soundEnabled }));
    $("#audio-btn").textContent = soundEnabled ? "🔊" : "🔇";
    if (soundEnabled && playing) startMusic(); else stopMusic();
  }

  function restart() {
    localStorage.removeItem(GAME_KEY);
    state = null; playing = false; paused = true; stopMusic();
    selectHouse(HOUSES[0].id);
  }

  function initEvents() {
    $("#new-game-btn").addEventListener("click", restart);
    $("#resume-btn").addEventListener("click", restoreCheckpoint);
    $("#collection-btn").addEventListener("click", showCollection);
    $("#ending-collection-btn").addEventListener("click", showCollection);
    $("#restart-btn").addEventListener("click", restart);
    $("#bag-btn").addEventListener("click", showBag);
    $("#audio-btn").addEventListener("click", toggleAudio);
    $("#help-btn").addEventListener("click", () => simpleMessage("控制方法", "WASD或方向键走路，E或空格互动。手机使用屏幕方向键和互动按钮。卡片与数学题阅读期间计时暂停。", "🎮"));
    modalClose.addEventListener("click", closeModal);
    $("#mobile-action").addEventListener("click", interact);

    window.addEventListener("keydown", event => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
      keys.add(event.code);
      if (!event.repeat && (event.code === "KeyE" || event.code === "Space")) interact();
    });
    window.addEventListener("keyup", event => keys.delete(event.code));
    window.addEventListener("blur", () => keys.clear());

    $$('[data-move]').forEach(button => {
      const code = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" }[button.dataset.move];
      const press = event => { event.preventDefault(); keys.add(code); };
      const release = event => { event.preventDefault(); keys.delete(code); };
      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("pointerleave", release);
    });
  }

  function init() {
    initEvents();
    $("#audio-btn").textContent = soundEnabled ? "🔊" : "🔇";
    $("#resume-btn").hidden = !localStorage.getItem(GAME_KEY);
    switchScreen("title");
    requestAnimationFrame(renderFrame);
  }

  init();
})();
