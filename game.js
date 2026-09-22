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

  // The canvas is a fixed 960x540 drawing surface stretched to whatever size the page
  // gives it, which on a large monitor meant a 2x upscale and a soft, blurry town.
  // Match the backing store to the real pixels and scale the context instead, so all
  // the drawing code keeps working in 960x540 coordinates.
  const SCENE_W = 960, SCENE_H = 540;

  function fitCanvasToDisplay() {
    const stage = canvas.parentElement;
    const availableW = stage.clientWidth;

    // The on-screen controls float over the stage, so the canvas has to stop above
    // them. It used to run underneath, which hid the bottom of the map - including
    // the player's own doorstep, where they spawn.
    let reserved = 58;
    const controls = document.querySelector(".mobile-controls");
    if (controls && getComputedStyle(controls).display !== "none") {
      const stageBottom = stage.getBoundingClientRect().bottom;
      const controlsTop = controls.getBoundingClientRect().top;
      reserved = Math.max(reserved, stageBottom - controlsTop + 10);
    }
    const availableH = stage.clientHeight - reserved;
    if (availableW <= 0 || availableH <= 0) return;

    // On a portrait phone the town deliberately overflows sideways so the camera can
    // follow the player; everywhere else the whole scene is shown.
    const followMode = state && state.scene === "town"
      && window.matchMedia("(max-width: 850px) and (orientation: portrait)").matches;
    let cssW, cssH;
    if (followMode) {
      cssH = availableH;
      cssW = cssH * (SCENE_W / SCENE_H);
    } else {
      const scale = Math.min(availableW / SCENE_W, availableH / SCENE_H);
      cssW = Math.floor(SCENE_W * scale);
      cssH = Math.floor(SCENE_H * scale);
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(cssW * dpr);
    const height = Math.round(cssH * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(width / SCENE_W, 0, 0, height / SCENE_H, 0, 0);
  }
  ctx.imageSmoothingEnabled = true;

  // A year was too long to hold: the back half repeated itself and the rent curve had
  // to stay gentle to survive it. Seven months keeps every month load-bearing.
  const TOTAL_MONTHS = 7;

  // Sleeping is what carries you into next month in one piece, so it is the reward for
  // getting the month's three jobs done. Run out of energy instead and you collapse
  // outdoors, which ends the month too -- just badly.
  const MONTH_TASKS = [
    { flag: "work", label: "工作", where: "摸鱼有限公司" },
    { flag: "food", label: "吃饭", where: "月底食堂" },
    { flag: "roi", label: "ROI", where: "ROI研究所" }
  ];
  const unfinishedTasks = () => MONTH_TASKS.filter(task => !state.flags[task.flag]);


  const HOUSES = [
    { id: "home", name: "你的小窝", icon: "🏠", rent: 220, sleep: 20, doorX: 480, x: 404, y: 378, w: 152, h: 100, color: "#e28c68" }
  ];

  // Collision footprints follow town-map-v2.png. The new map is deliberately simple:
  // one broad loop road, short direct approaches, and one home. Every entrance faces
  // the same connected road system -- re-run scripts/check-layout before moving one.
  const BASE_BUILDINGS = [
    // doorX is read off town-map-v2.png, not assumed to be the middle of the footprint.
    // The restaurant's door is round the side behind its tables and the arcade's is off
    // to the left of its plant pots, so the centre put you at a wall, not an entrance.
    { id: "work", label: "摸鱼有限公司", icon: "💼", labelDX: 62, doorX: 210, x: 130, y: 38, w: 128, h: 132, color: "#df795f" },
    { id: "bank", label: "稳稳银行", icon: "🏦", doorX: 365, x: 308, y: 38, w: 132, h: 132, color: "#e9c352" },
    { id: "stock", label: "涨跌交易所", icon: "📈", doorX: 584, x: 528, y: 30, w: 128, h: 142, color: "#5d9bd4" },
    { id: "roi", label: "ROI研究所", icon: "🎯", doorX: 775, x: 726, y: 36, w: 138, h: 146, color: "#8771bd" },
    { id: "food", label: "月底食堂", icon: "🍜", doorX: 148, x: 20, y: 230, w: 168, h: 104, color: "#ec9a49" },
    { id: "fun", label: "开心一下", icon: "🕹️", doorX: 838, x: 796, y: 226, w: 148, h: 108, color: "#d7659a" },
    { id: "shop", label: "包好运杂货铺", icon: "🔮", doorX: 789, x: 738, y: 374, w: 146, h: 104, color: "#6db789" }
  ];

  const BOARD = { x: 480, y: 327, label: "兼职公告板", icon: "📋" };

  // Walkable ground, read off town-map-v2.png itself (6px cells, 160x90). Road, plaza
  // paving and greenery are all open - a palm's leaves are overhead, so you walk under
  // them, and the same goes for hedges and planters. Buildings, the fountain, the sea
  // and the scenery framing the town stay solid, but only their lower body does: these
  // buildings are drawn with the roof rising above the footprint, and blocking the
  // roof too made it jut into the road running behind. This replaced a
  // set of hand-placed building rectangles that were drawn around each building
  // plus its garden and planters, which quietly narrowed every road and left
  // dead-end pockets between buildings. Regenerate with scripts/build-road-mask.py.
const ROAD_CELL = 6;
  const ROAD_MASK = [
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "0011100000221111111000000111111111111111111111111112112221111111120000021111222211111111111111111111111111111111111111111111111110111112121111111000000000000000",
    "1111111111211111111111111111111111111111111111111111111121111111122211111111222222111111111111111111111111111111111111111111111111111112111111111100000000000000",
    "1111111112211111111111111111111111111111111111111122112221111111122211221111222222111111001111111111111100001111111111111111111111111112112222211100000000000000",
    "1111111122111111111111111111111111111111111111111111121220111111021112111111222212211111000000000000000000011111111111111111111111111111112121111100000000000000",
    "1111111111221121111111111110000000002111111111111111111220000000021111111111122222211111000000000000000000011111111111111120000001111111111111111100000000000000",
    "1111111111112221222111111110000000001111111112211111111120000000021111111111122122211111110000000000000011111111111111111110000001111211111111100100000000000000",
    "1111111111112211122111111110000000001111111122211112111212000000211111211111222222211111111112000000000011211112222211111110000001122211111111000000000000000000",
    "1111111111111221111111111110000000001111111122222112111222000000222111211111222222211111111222121121222111111122222211111110000002111111111111000000000000000000",
    "1111111111111111111111111110000000000011111212111111111222000000222111111111222222211111111211111111112111111221222211111110000001111111111111000000000000000000",
    "1111111111121111111111111120000000000011111122211221111111000000112111111111222222211111112211111111111211122111222111111111000001111111111111000000000000000000",
    "1111111111111111111111111111111000000011112212112122111112200000222111111212222222221211211111112122111111221122121111111111110001111111111111111000000000000000",
    "1111111111121111111111111222111100000011111112111122222222221212221222222222222222222222222222222122222222211111111111111111110000001111112111111100000000000000",
    "1111111212121221222111111222111112121121111111222222222222222111211122222222222222222222222111111222222222222222111111111111120000002111112111111100000000000000",
    "1111112122222222222222111111111111111121111111222222222222222111111222222222222222222222222111112222222222222222221111111111110000001111112111111100000000000000",
    "2222211122222222221222212211111111112211112222222222222222221111111112222222222222222222221111111112222222222222222211111111111111222111112121221200000000000000",
    "2211111112222221111112222222211112211112222222222222222222211111111111222222222222222222211111111111222222222222222222111111222111112111112211111100000000000000",
    "2221111121222111111111112122222222222222222222222222222222211111111112222112211122221222211111111122222222222222222222222222222222222222221212222200000000000000",
    "1122111111111111111111111112222222222222222222222222222222221111111112112211112111122212221111111112222222222222222222222222222222222222222111222222221111122222",
    "2111111111111111111111111112222222222222222222222222222211111111111112221112211211121112211111111122112222222222222222222222222222222222221111122222222111111122",
    "2111111111111110000000111111122222211222222222222222211112111111112111111111112121121111111111111121111112222222222222222222122222211111111111111111221111111121",
    "1111111111111000000000111111111111112222222222222221111111111121111111111111112121121111111111111111111111122222222222222221111122111111111111111111111111111222",
    "2211111111100000000000111111111111111112222222222211111111111111111111111111111112121111111111111111111111112222222222222221111111111111111111111111111111111121",
    "1111111111000000000002221111111111111122222222222211111221111111111111211111111111111122211111111121111111111222222222222111111111111111110000011111111111111112",
    "1111111100000000000001111111111111111112222222222112111111112221111121112111111111111111121111111121111111121222222222221111111111000000000000000000011111111122",
    "1111111100000000000001111112212111111111222222222111111112222211111111111112111111111111121221111111111111111222222222211111111111000000000000000000000111211222",
    "1111111100000000000001211221221211111111222222222111111111111111111111111111111111111111111121111111111111111222222222221111111111000000000000000000000021222221",
    "1111111100000000002121121121121111111121222222222111211111111111111111111211111111112211111111111111121111111122222222211211111111000000000000000000000021222222",
    "1111111100000000001212111111111111111111222222222111211111111111111111111121111111111111111111111121121111111122222222211111211111000000000000000000000011222222",
    "1111111110000000001211111111111111111111222222222112211111112111111112111111111212121111111121111121112111111222222222211121211111120000000000000000211111122222",
    "1111111110000000000111111111111111111111222222222121111111212111112112211111112211111111111121111111121111112222222222221121111111110000000000000000111111111222",
    "1111111111000000000111211111111111111121222222222111111112112111111111111111111111111111111121111111111112121222222222221211111111110000000000000000111111111222",
    "2211111111000000000121111111111111111111222222222111111111111111111111112211111111111211111111111111111111111222222222222211111111120000000002200000211111111112",
    "2221222111000000111111111111122111211111222222222211111111111211111121111111111111111111111111111211121111111222222222222221111111110000000001100000111111111111",
    "2221222111111111111111121111111111111112222222222211111111111212111111112111111111111111111111221211111111112222222222221221111111110000000001100000111111111111",
    "2222222211111111111111111111111111111122222222222221111111111112221111111121111112211111111112111111111111122222222222221122111111110000000001100000111111111111",
    "2212221122111121111112111111121111112222222222222222111111111121112111111121111121112111111111112111111211222222222222222211112111111100000001111111111111111111",
    "2111111122211112111211111111111111222222222222222222221111111111121111111111111111111121111111111111111112222222222222222212212122111111221112112111111111111111",
    "2211111222222111121111221111111222222222222222222222222211111111111211111121111111111121111111111111111222222222222222222222222222111111111112111211112111111111",
    "1111111112222212212111212122222222222222222122222222222222111111111111112211222222211111111111111111222222222222222112211222222222222222222222222222222222222222",
    "1111111111222222222222222222222222222211111112222222222222222222121221222222222222222221122222222222222222222222222111111222222212222222222222222222222222222222",
    "1111111122222222222222222222222222222211111112222222222222222221222222222222222222222222222222222222222222222222111111112222222211122222222222222222222222222222",
    "1111111122222222222222222222222222222111111111122222222222222222222222222222222222222222222222222222222222222222221111111112222111111111111222211122222211211122",
    "1111111121222222221222222222222222221111111111112222222222222222222222222222222222222222222222222222222222222222211111111111211111111111111122111112222111111222",
    "1111111121221222111112222222222222211111111111112222222222222222221221122222222222222222222222222222222222222222111111111112211111111111111111111111122211111112",
    "0000000000000000000000000000000000000001111112222222222222222222221111122222222212222222222222222222222222222222111111111111111111111111111111111111121111111111",
    "0000000000000000000000000000000000000001111111222222222222222222211111122222221111222222221112111222222222222222111111111111111111122211111111111111111111111112",
    "0000000000000000000000000000000000000001111111112222222222222222111111111111111111111111111111111222222222222221111111111111111111222221111111111111111111111112",
    "0000000000000000000000000000000000000001111111111122222222221221111111111111111111111111111111111222222222222211111111111111111111222221111111111111111111111111",
    "0000000000000000000000000000000000000001111111111122222222222111111111111111111111111111111111111122222222222211111111111111111111111211111111111111111111111111",
    "0000000000000000000000000000000000000001111111111122222222221111111111111111111111111111111111111111222222222221111111111111111111211211111111111111111111111111",
    "0000000000000000000000000000000000000001111111111222222222221111111111111111112121111111111111111111222222222221111111111111111111111111111111111111111111111111",
    "0000000000000000000000000000000000000001111111111222222222221111111111111111221111221111111111111111122222222222221111111111111111111111111111111111111111111111",
    "0000000000000000000000000000000000000001111111112222222222211111111111111112111111112111111111111111122222222222221111111100000011111111111111111111111111111111",
    "0000000000000000000000000000000000000001111111122222222222111111111111111211111111111111111111111111122222222222111111111100000000000000011111111111111111111111",
    "0000000000000000000000000000000000000001212211122222222222111111111111111111221222211111211111111111112222222222222111111100000000000000000000021111111111111211",
    "0000000000000000000000000000000000000001211111222222222221111111211111111111112111111111111111211111111222222222221111212100000000000000000000011111111111111211",
    "0000000000000000000000000000000000000001111211222222222221111111111111111111121111111111111111121111111222222222221121211111111000000000000000011111112111111111",
    "0000000000000000000000000000000000000001111212222222222211111112111111111121121111111111111111122111111122222222222111211112111100000001100000011111112112211222",
    "0000000000000000000000000000000000000001111222222222222211111112111111111121121111111121111111111111111122222222222221221111111112222211111111111112111212222222",
    "0000000000000000000000000000000000000001111122222222222111111122111111111111121111111121111111112211111112222222222211211111111122222211111111111111121222112221",
    "0000000000000000000000000000000000000001111122222222222111111121112221111111121111111111111112211211111112222222222222111211111111111121111111111211121112221121",
    "0000000000000000000000000000000000000002111122222222221111111112211111111111122222211121111222221211111111222222222211222211111111111111111111112222221211111111",
    "0000000000000000000000000000000000000002121111112211121111111112221212111111122212211111112221112211111111222222111111212222211111111111212122222221121111111111",
    "0000000000000000000000000000000000000001222111111111222121111111111111111111111111211111111111111111111112222222111111111222221221212122222222222111111111111111",
    "0000000000000000000000000000000000000001212111221111111122122211111212111222111221111211111121211121112222222222111111122222222222221111222222221111111111111111",
    "0000000000000000000000000000000000000001211111111111112222222222222222222122222222222222222211222222222222222211111111111122222222111111122221111111111111122111",
    "0000000000000000000000000000000000000001111221111111111122222222112122222222222222222222222222222222222222222111111111111112222222111111112211111111111111122211",
    "0000000000000000000000000000000000000002211222111111111112222112111121222222222222222222222221111112222222222221111111111222222221111111111111111111111111222211",
    "0000000000000000000000000000000000000001111211111111111212212111111111122222222222222222222211111111122222222211111111111122221211111111111111111111111111122120",
    "0000000000000000000000000000000000000002111111111111111121111111111111122222222222222222222111111111111221111111111111111112221111111111111111112111122211112210",
    "0000000000000000000000000000000000000000222111111111111111111111111111111222222222222221211111111111111121111112112111111111121111121111111111122211122222111210",
    "0000000000000000000000000000000000000000000000011111111111111111111111111222222222222211111111111111111111111111121111112000000000211111111110000021212122111000"
  ];

  const ART = {
    town: loadArt("assets/art/town-map-v2.png"),
    player: loadArt("assets/art/player-sprites.png"),
    interiors: loadArt("assets/art/interior-atlas.png"),
    npcs: loadArt("assets/art/npc-sprites.png"),
    thief: loadArt("assets/art/thief-sprites.png")
  };

  // Each atlas states its own grid, so adding one is a line here rather than another
  // branch inside cardMarkup(). extra1-4 came from Codex with a manifest; the game
  // grew 64 cards past what the first two sheets could hold.
  const CARD_SHEETS = {
    main:   { src: "assets/art/card-art-main.png",    cols: 6, rows: 6 },
    items:  { src: "assets/art/card-art-items.png",   cols: 6, rows: 3 },
    extra1: { src: "assets/art/card-art-extra-1.png", cols: 4, rows: 4 },
    extra2: { src: "assets/art/card-art-extra-2.png", cols: 4, rows: 4 },
    extra3: { src: "assets/art/card-art-extra-3.png", cols: 4, rows: 4 },
    extra4: { src: "assets/art/card-art-extra-4.png", cols: 4, rows: 4 }
  };

  const CARD_ART = {
    "fate:bonus": ["main", 0], "fate:bus": ["main", 1], "fate:rent": ["main", 2],
    "fate:energy": ["main", 3], "fate:bankday": ["main", 4], "fate:phone": ["main", 5],
    "fate:cold": ["main", 6], "fate:leak": ["main", 7], "fate:lost": ["main", 8],
    "fate:snack": ["main", 9], "fate:overtime": ["main", 10], "fate:coin": ["main", 11],
    "stock:tech": ["main", 12], "stock:foodco": ["main", 13], "stock:transit": ["main", 14],
    "stock:energy": ["main", 15], "stock:funco": ["main", 16],
    "roi:steady": ["main", 17], "roi:growth": ["main", 18], "roi:bold": ["main", 19],
    "work:easy": ["main", 20], "work:normal": ["main", 21], "work:hard": ["main", 22],
    "food:nasi": ["main", 24], "food:roti": ["main", 25], "food:big": ["main", 26],
    "food:lucky": ["main", 27], "food:spicy": ["main", 28], "food:free": ["main", 29],
    "fun:movie": ["main", 30], "fun:arcade": ["main", 31], "fun:tea": ["main", 32],
    "fun:boring": ["main", 33], "fun:cancel": ["main", 34], "parttime:board": ["main", 35],
    "tool:shoes": ["items", 0], "tool:calculator": ["items", 1], "tool:meal": ["items", 2],
    "tool:bus": ["items", 3], "tool:alarm": ["items", 4], "tool:paper": ["items", 5], "tool:coin": ["items", 6],
    "luck:necklace": ["items", 7], "luck:coincharm": ["items", 8], "luck:socks": ["items", 9],
    "luck:cat": ["items", 10], "luck:potion": ["items", 11],
    "parttime:mamak": ["items", 12], "parttime:market": ["items", 13], "parttime:warehouse": ["items", 14],
    "parttime:flyer": ["items", 15], "parttime:tutor": ["items", 16], "parttime:mystery": ["items", 17],

    // added with card-art-extra-1..4
    "fate:pocket": ["extra1", 0], "fate:angpow": ["extra1", 1], "fate:promo": ["extra1", 2],
    "fate:extrameat": ["extra1", 3], "fate:lift": ["extra1", 4], "fate:powerbank": ["extra1", 5],
    "fate:farewell": ["extra1", 6], "fate:wifi": ["extra1", 7], "fate:slipper": ["extra1", 8],
    "fate:fixdeposit": ["extra1", 9], "fate:aircon": ["extra1", 10], "fate:jam": ["extra1", 11],
    "fate:sock": ["extra1", 12], "fate:databill": ["extra1", 13], "fate:reno": ["extra1", 14],
    "fate:puddle": ["extra1", 15], "fate:battery": ["extra2", 0], "fate:rain": ["extra2", 1],
    "fate:catplant": ["extra2", 2], "fate:annualfee": ["extra2", 3], "fate:nobonus": ["extra2", 4],
    "fate:lend": ["extra2", 5], "fate:parking": ["extra2", 6], "fate:cousin": ["extra2", 7],
    "fate:drama": ["extra2", 8], "fate:moving": ["extra2", 9], "fate:expired": ["extra2", 10],
    "fate:resell": ["extra2", 11], "fate:gym": ["extra2", 12], "fate:remedy": ["extra2", 13],
    "fate:allnight": ["extra2", 14], "fate:nightrun": ["extra2", 15], "fate:livestream": ["extra3", 0],
    "fate:covershift": ["extra3", 1], "fate:charm": ["extra3", 2], "fate:durian": ["extra3", 3],
    "food:claypot": ["extra3", 4], "food:wantan": ["extra3", 5], "food:chicken": ["extra3", 6],
    "food:satay": ["extra3", 7], "food:cendol": ["extra3", 8], "food:instant": ["extra3", 9],
    "food:coldpack": ["extra3", 10], "food:hair": ["extra3", 11], "fun:karaoke": ["extra3", 12],
    "fun:badminton": ["extra3", 13], "fun:mall": ["extra3", 14], "fun:claw": ["extra3", 15],
    "fun:park": ["extra4", 0], "fun:spoiler": ["extra4", 1], "fun:queue": ["extra4", 2],
    "tool:coffee": ["extra4", 3], "tool:earplug": ["extra4", 4], "tool:shortcut": ["extra4", 5],
    "tool:amulet": ["extra4", 6], "tool:energydrink": ["extra4", 7], "parttime:wedding": ["extra4", 8],
    "parttime:mascot": ["extra4", 9], "parttime:delivery": ["extra4", 10], "parttime:petshop": ["extra4", 11],
    "parttime:carwash": ["extra4", 12], "parttime:survey": ["extra4", 13], "parttime:lineup": ["extra4", 14],
    "luck:spray": ["extra4", 15], "tool:spray": ["extra4", 15],
    // Permanent goods. The running shoes and the earplugs were drawn for the old
    // one-month tools, which no longer exist, so the pictures come across with them.
    "luck:shoes": ["items", 0], "luck:earplug": ["extra4", 4], "luck:laptop": ["main", 23]
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

  // Energy (动力) is the month's only budget: there is no clock. Every number the
  // player has to plan around lives here so it can be tuned in one place.
  const ENERGY = {
    monthStart: 100,
    noSleepPenalty: 25,       // collapse outdoors and next month opens short
    pixelsPerPoint: 80,       // walking the full 960px map costs about 12
    partTime: 20,
    bank: 0,              // paperwork, not effort
    stock: 5,
    roi: 10,
    shop: 3,
    // Eating and working stay repeatable, so both need diminishing returns or the
    // pair becomes an infinite money loop (buy energy cheap, sell it dear).
    mealFalloff: [1, 0.6, 0.3, 0.1],
    workFalloff: [1, 0.7, 0.5, 0.35],
    // Time of day is read from energy left, and only ever moves forward.
    afternoonBelow: 50,
    nightBelow: 25
  };

  const WORK_TIERS = [
    { id: "easy", name: "简单的活", icon: "🧹", energy: 15, pay: 320, span: 12, copy: "题目很简单" },
    { id: "normal", name: "普通的活", icon: "💼", energy: 30, pay: 560, span: 25, copy: "题目普通" },
    { id: "hard", name: "困难的活", icon: "🧠", energy: 50, pay: 880, span: 40, copy: "题目会让你想一下" }
  ];

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

// Permanent goods live in the three backpack slots until you sell them back at half
  // price. Luck used to be the only thing the shop sold, which made it the only stat
  // anyone thought about; it is now one item among several that change how a month
  // actually plays out.
const PERMANENT_ITEMS = [
    { id: "necklace", name: "转运项链", icon: "📿", price: 280, luck: 10, copy: "永久幸运+10" },
    { id: "shoes", name: "飞毛腿跑鞋", icon: "👟", price: 300, speed: 0.18, copy: "永久走路快18%，小偷追不上" },
    { id: "socks", name: "软底舒服袜", icon: "🧦", price: 240, walk: 0.3, copy: "走路少花30%动力" },
    { id: "earplug", name: "隔音耳塞", icon: "🎧", price: 220, sleep: 10, copy: "每次睡觉多回10动力" },
    { id: "potion", name: "阿嬷的补药水", icon: "🧪", price: 260, meal: 0.35, copy: "每餐多回35%动力" },
    { id: "coincharm", name: "铜钱串", icon: "🪙", price: 320, rate: 0.03, copy: "银行利息永久+3%" },
    { id: "cat", name: "招财猫", icon: "🐱", price: 460, income: 90, copy: "每月月初自动进账$90" },
    { id: "laptop", name: "炒股笔电", icon: "💻", price: 520, hint: 1, copy: "交易所永久显示每只股票的走势" }
  ];

  // One-shot goods. They keep until you use them, and unlike the permanents they do
  // not take a backpack slot away from a long-term plan. The spray is the odd one out:
  // it spends itself the moment a thief catches you, so it is carried as a charge.
  const CONSUMABLES = [
    { id: "spray", name: "防身喷雾", icon: "🧴", price: 150, spray: true, copy: "被小偷追上时自动使用，保住钱包" },
    { id: "energydrink", name: "提神饮料", icon: "⚡", price: 90, copy: "立刻动力+30", use: () => { state.motivation += 30; } },
    { id: "coffee", name: "三合一咖啡", icon: "☕", price: 60, copy: "立刻动力+18", use: () => { state.motivation += 18; } },
    { id: "bus", name: "飞快巴士票", icon: "🚌", price: 50, copy: "立刻动力+15，省下走路的力气", use: () => { state.motivation += 15; } },
    { id: "amulet", name: "转运手绳", icon: "🧿", price: 80, copy: "本月幸运+15", use: () => { state.monthLuckBonus += 15; } },
    { id: "coin", name: "幸运硬币", icon: "🪙", price: 140, copy: "永久幸运+3", use: () => { state.luck = clamp(state.luck + 3, 0, 100); } },
    { id: "calculator", name: "不太作弊计算器", icon: "🧮", price: 120, copy: "下一道数学题答错也不扣工资", use: () => { state.mathShield = true; } },
    { id: "meal", name: "免费餐券", icon: "🎟️", price: 50, copy: "本月下一餐免费", use: () => { state.freeFood = true; } },
    { id: "paper", name: "市场小道消息", icon: "📰", price: 180, copy: "本月交易所显示所有走势", use: () => { state.marketHint = true; } },
    { id: "alarm", name: "超级闹钟", icon: "⏰", price: 90, copy: "本月睡觉额外恢复8动力", use: () => { state.sleepBonus += 8; } },
    { id: "shortcut", name: "抄近路地图", icon: "🗺️", price: 110, copy: "本月走路省一半动力", use: () => { state.walkDiscount += 0.5; } }
  ];

  const shopItem = (id) => PERMANENT_ITEMS.find(item => item.id === id) || CONSUMABLES.find(item => item.id === id);
  const shopArt = (item) => item.art || (CONSUMABLES.includes(item) ? `tool:${item.id}` : `luck:${item.id}`);

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
    { id: "bus", type: "good", name: "巴士居然没迟到", icon: "🚌", copy: "动力+12", apply: () => state.motivation += 12 },
    { id: "rent", type: "good", name: "房东今天心情很好", icon: "🏠", copy: "本月房租减少20%", apply: () => state.rentDiscount = 0.2 },
    { id: "energy", type: "good", name: "醒来没有腰酸背痛", icon: "✨", copy: "动力+10", apply: () => state.motivation += 10 },
    { id: "bankday", type: "good", name: "银行庆典月", icon: "🏦", copy: "本月银行利息提高到12%", apply: () => state.bankRate = Math.max(state.bankRate, 0.12) },
    { id: "phone", type: "bad", name: "手机自由落体", icon: "📱", copy: "产生$80命运债务", apply: () => state.debt += 80 },
    { id: "cold", type: "bad", name: "冷气开太大，感冒了", icon: "🤧", copy: "动力-14", apply: () => { state.motivation -= 14; } },
    { id: "leak", type: "bad", name: "天花板开始下小雨", icon: "🪣", copy: "产生$60命运债务", apply: () => state.debt += 60 },
    { id: "lost", type: "bad", name: "钥匙在手上却找了半天", icon: "🔑", copy: "动力-8", apply: () => state.motivation -= 8 },
    { id: "snack", type: "choice", name: "同事请吃神秘零食", icon: "🍘", copy: "动力+8，但幸运-1", apply: () => { state.motivation += 8; state.luck -= 1; } },
    { id: "overtime", type: "choice", name: "老板问：今晚有空吗？", icon: "🌙", copy: "钱包+$120，但动力-10", apply: () => { state.wallet += 120; state.motivation -= 10; } },
    { id: "coin", type: "choice", name: "路边闪闪发光", icon: "🪙", copy: "钱包+$30、幸运+1", apply: () => { state.wallet += 30; state.luck += 1; } },

    // The twelve above have illustrations in card-art-main.png; everything below falls
    // back to its emoji in the same frame, which is why they all carry a good one.
    { id: "pocket", type: "good", name: "旧外套口袋有惊喜", icon: "🧥", copy: "钱包+$60。上个月的你留给现在的你", apply: () => state.wallet += 60 },
    { id: "angpow", type: "good", name: "亲戚突然发红包", icon: "🧧", copy: "钱包+$150，但被问了三次几时结婚", apply: () => { state.wallet += 150; state.motivation -= 3; } },
    { id: "promo", type: "good", name: "超市大促销", icon: "🛒", copy: "本月食物免费。你囤了三个月的泡面", apply: () => state.freeFood = true },
    { id: "extrameat", type: "good", name: "摊主手抖多给一块肉", icon: "🍗", copy: "动力+12、幸运+1", apply: () => { state.motivation += 12; state.luck += 1; } },
    { id: "lift", type: "good", name: "电梯今天居然没坏", icon: "🛗", copy: "动力+14", apply: () => { state.motivation += 14; } },
    { id: "powerbank", type: "good", name: "抽奖中了充电宝", icon: "🔋", copy: "钱包+$80。不是手机，但也行", apply: () => state.wallet += 80 },
    { id: "farewell", type: "good", name: "同事离职请客", icon: "🍰", copy: "动力+15、钱包+$30", apply: () => { state.motivation += 15; state.wallet += 30; } },
    { id: "wifi", type: "good", name: "网速终于正常了", icon: "📶", copy: "动力+15", apply: () => state.motivation += 15 },
    { id: "slipper", type: "good", name: "拖鞋底居然没掉", icon: "🩴", copy: "本月走路速度+15%", apply: () => state.speedBonus += 0.15 },
    { id: "fixdeposit", type: "good", name: "翻到忘记的定存", icon: "🧾", copy: "银行+$200", apply: () => state.bank += 200 },
    { id: "aircon", type: "good", name: "冷气终于修好了", icon: "❄️", copy: "动力+14、本月睡觉多回5动力", apply: () => { state.motivation += 14; state.sleepBonus += 5; } },

    { id: "jam", type: "bad", name: "塞车塞到怀疑人生", icon: "🚗", copy: "动力-16", apply: () => state.motivation -= 16 },
    { id: "sock", type: "bad", name: "洗衣机吃掉一只袜子", icon: "🧦", copy: "幸运-3。另一只还在，但没用了", apply: () => state.luck -= 3 },
    { id: "databill", type: "bad", name: "流量账单超标", icon: "📵", copy: "产生$50命运债务", apply: () => state.debt += 50 },
    { id: "reno", type: "bad", name: "隔壁装修从早敲到晚", icon: "🔨", copy: "动力-12", apply: () => state.motivation -= 12 },
    { id: "puddle", type: "bad", name: "一脚踩进水坑", icon: "💦", copy: "动力-8、幸运-1", apply: () => { state.motivation -= 8; state.luck -= 1; } },
    { id: "battery", type: "bad", name: "电动摩托没电了", icon: "🛵", copy: "动力-13", apply: () => state.motivation -= 13 },
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
    { id: "resell", type: "choice", name: "二手平台卖掉旧手机", icon: "📲", copy: "钱包+$160，但动力-13", apply: () => { state.wallet += 160; state.motivation -= 13; } },
    { id: "gym", type: "choice", name: "健身房免费试用", icon: "🏋️", copy: "动力+18，但要先跑一趟，动力-30", apply: () => { state.motivation -= 12; } },
    { id: "remedy", type: "choice", name: "相信了网上的偏方", icon: "🌿", copy: "幸运+6，但动力-8", apply: () => { state.luck += 6; state.motivation -= 8; } },
    { id: "allnight", type: "choice", name: "通宵打了一整晚游戏", icon: "🎮", copy: "动力-18，但幸运+4", apply: () => { state.motivation -= 18; state.luck += 4; } },
    { id: "nightrun", type: "choice", name: "下班多跑几单", icon: "🚕", copy: "钱包+$140，但动力-14", apply: () => { state.wallet += 140; state.motivation -= 14; } },
    { id: "livestream", type: "choice", name: "直播抽奖真的中了", icon: "🎁", copy: "钱包+$70，但看了三小时，动力-16", apply: () => { state.wallet += 70; state.motivation -= 16; } },
    { id: "covershift", type: "choice", name: "替同事顶一个班", icon: "⏰", copy: "钱包+$110，但动力-9", apply: () => { state.wallet += 110; state.motivation -= 9; } },
    { id: "charm", type: "choice", name: "买了个平安符", icon: "🧿", copy: "幸运+8，但钱包-$60", apply: () => { state.luck += 8; state.wallet -= 60; } },
    { id: "durian", type: "choice", name: "榴莲季节到了", icon: "🥭", copy: "动力+20，但钱包-$80", apply: () => { state.motivation += 20; state.wallet -= 80; } }
  ];

  // One ceiling for every project, so "which risk" is the decision and "how much" is
  // not a way to make the bold one safe.
  const ROI_MAX = 1000;
  const ROI_MIN = 50;

  const ROI_TYPES = [
    { id: "steady", name: "稳健项目", icon: "🪴", min: -5, max: 12, color: "good" },
    { id: "growth", name: "成长项目", icon: "🚲", min: -15, max: 30, color: "choice" },
    { id: "bold", name: "冒险项目", icon: "🚀", min: -30, max: 60, color: "bad" }
  ];

  const CATALOG = {
    "命运卡": FATE_CARDS,
    "工作卡": WORK_TIERS.map(tier => ({ id: tier.id, name: tier.name, icon: tier.icon, copy: tier.copy })),
    "兼职卡": PART_TIME,
    "一次性物品": CONSUMABLES,
    "食物卡": FOODS,
    "娱乐卡": FUN_CARDS,
    "股票卡": STOCKS,
    "ROI卡": ROI_TYPES,
    "永久物品": PERMANENT_ITEMS
  };

  let state = null;
  let paused = true;
  let playing = false;
  let lastFrame = performance.now();
  let modalOnClose = null;
  let modalLocked = false;
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
      rentPaid: false,
      motivation: ENERGY.monthStart,
      energyStart: ENERGY.monthStart,
      phaseReached: 0,
      energySpent: 0,
      walkCarry: 0,
      mealsEaten: 0,
      walkDiscount: 0,
      mealBonus: 0,
      workDone: 0,
      sleptLastMonth: true,
      pendingEnergyPenalty: 0,
      thieves: [],
      thiefRespawn: 0,
      sprayCharges: 0,
      shake: 0,
      thiefWarned: false,
      luck: 50,
      monthLuckBonus: 0,
      houseId,
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
      pendingStock: {},
      nextStock: {},
      stockTips: {},
      shopOffers: [],
      boughtItems: {},
      pendingROI: [],
      monthLog: [],
      lastFateId: null,
      tutorialSeen: false
    };
  }

  // Sums one field across whatever permanent goods you own.
  function ownedBonus(field) {
    if (!state) return 0;
    return state.permanentItems.reduce((sum, id) => sum + (PERMANENT_ITEMS.find(e => e.id === id)?.[field] || 0), 0);
  }

  function effectiveLuck() {
    if (!state) return 50;
    const itemLuck = state.permanentItems.reduce((sum, itemId) => {
      const item = PERMANENT_ITEMS.find(entry => entry.id === itemId);
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


  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1900);
  }

  function openModal(html, options = {}) {
    paused = true;
    modalLocked = !!options.locked;
    $("#counter-bar").hidden = true;
    modalContent.innerHTML = html;
    modal.classList.toggle("wide", !!options.wide);
    modalClose.hidden = options.closable === false;
    modalLayer.hidden = false;
    modalOnClose = options.onClose || null;
    beep(460, 0.05, "square", 0.025);
  }

  function closeModal({ force = false } = {}) {
    // The month-end report is locked: an action that ends the month mid-click used to
    // have its own tidy-up run afterwards and close the report, leaving the player in
    // a building with no report, no counter and no way to act.
    if (modalLocked && !force) return;
    if (modalLayer.hidden) return;
    modalLocked = false;
    modalLayer.hidden = true;
    modalContent.innerHTML = "";
    modal.classList.remove("wide");
    const callback = modalOnClose;
    modalOnClose = null;
    paused = !playing;
    callback?.();
    // Still standing at the counter after finishing an errand: offer it again.
    if (state && state.scene === "interior" && playing) {
      const building = buildingList().find(item => item.id === state.interiorId);
      if (building) showCounter(building);
    }
  }

  // A draw should feel like a draw. Every pool used to render face-up the instant its
  // modal opened, so the "抽卡" was really just a receipt. Here the player sees backs,
  // picks one blind, watches it flip, and then sees the ones they dodged -- the near
  // miss is most of the fun, so it is shown rather than thrown away.
  function runCardDraw({ eyebrow, title, hint, candidates, faceUp, confirmLabel, onConfirm, stingFor }) {
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
        $("#draw-row").outerHTML = `<div class="reveal-wrap">
          <div class="reveal-card flip-in">${faceUp(picked)}</div>
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
    const atlas = art ? CARD_SHEETS[art[0]] : null;
    const sheet = atlas ? atlas.src : "";
    const cols = atlas ? atlas.cols : 1;
    const rows = atlas ? atlas.rows : 1;
    const index = art?.[1] ?? 0;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = cols === 1 ? 0 : col * 100 / (cols - 1);
    const y = rows === 1 ? 0 : row * 100 / (rows - 1);
    const artStyle = art ? `style="--card-image:url('${sheet}');--card-size:${cols * 100}% ${rows * 100}%;--card-x:${x}%;--card-y:${y}%"` : "";
    const effect = item.copy || item.effect || (item.pay != null ? `工资 ${money(item.pay)}` : "");
    const footer = meta && meta.trim() && meta.trim() !== effect.trim() ? meta : "";
    // No rarity strip and no gem: they said nothing the picture and the title do not,
    // and the 23px they took was coming out of the text, which then ran into the price.
    return `<button class="game-card ${extraClass}" data-card-id="${item.id}">
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
      <h2>欢迎来到巴生小镇</h2>
      <div class="result-box">
        <p><strong>动力就是你的一天。</strong>每月${ENERGY.monthStart}点，走路、上班、投资都要扣。没有倒计时，慢慢想没关系。</p>
        <p><strong>这${TOTAL_MONTHS}个月，每个月要做完三件事：</strong>${MONTH_TASKS.map(task => `${task.label}（${task.where}）`).join("、")}。做完才睡得着。</p>
        <p><strong>① 去公司：</strong>简单／普通／困难三选一。越难越赚，动力扣得越多，数学题也越难。可以做很多次，但加班费会越来越少。</p>
        <p><strong>② 去食堂：</strong>吃饭补回动力，可以吃很多次，但越吃补得越少。</p>
        <p><strong>③ 交房租：</strong>回家交给房东，<strong>只收钱包里的现金</strong>。银行利息每月3%～9%，但存进去就要记得提出来。</p>
        <p><strong>④ 回家睡觉：</strong>睡了下个月动力才回满${ENERGY.monthStart}。<strong>动力归零会当场倒在外面</strong>，下个月只剩${ENERGY.monthStart - ENERGY.noSleepPenalty}。</p>
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
    state.motivation = ENERGY.monthStart
      - (state.sleptLastMonth ? 0 : ENERGY.noSleepPenalty)
      - (state.pendingEnergyPenalty || 0);
    state.pendingEnergyPenalty = 0;
    state.energyStart = state.motivation;
    state.phaseReached = 0;
    state.energySpent = 0;
    state.walkCarry = 0;
    state.mealsEaten = 0;
    state.workDone = 0;
    state.thieves = [];
    state.thiefRespawn = 0;
    state.shake = 0;
    // Permanent goods are folded in here rather than read at each use site, so the
    // month always starts from "base + what you own" and temporary boosts stack on top.
    // 3% to 9%, re-rolled monthly. A fixed 5% made "put it in the bank" a decision you
    // only ever had to make once.
    state.bankRate = (3 + Math.floor(Math.random() * 7)) / 100 + ownedBonus("rate");
    state.rentDiscount = 0;
    state.monthLuckBonus = 0;
    state.speedBonus = ownedBonus("speed");
    state.sleepBonus = ownedBonus("sleep");
    state.walkDiscount = Math.min(0.6, ownedBonus("walk"));
    state.mealBonus = ownedBonus("meal");
    state.mathShield = false;
    state.freeFood = false;
    state.marketHint = ownedBonus("hint") > 0;
    state.rentPaid = false;
    state.boughtItems = {};
    state.flags = { work: false, food: false, fun: false, roi: false, partTimeDrawn: false, stockBought: false };
    state.stockOffers = [];
    if (!state.pendingStock || !Object.keys(state.pendingStock).length) state.pendingStock = rollStockChanges();
    if (!state.nextStock || !Object.keys(state.nextStock).length) state.nextStock = rollStockChanges();
    state.stockTips = {};
    // Two shelves, restocked every month: three permanents and four one-shots. The
    // spray answers the thief, so once thieves exist it is always on the shelf;
    // leaving it to a shuffle meant the counter was missing it half the months.
    const staple = thiefCountForMonth() ? CONSUMABLES.filter(item => item.spray) : [];
    const rest = shuffle(CONSUMABLES.filter(item => !staple.includes(item)));
    state.shopOffers = {
      permanent: shuffle(PERMANENT_ITEMS.filter(item => !state.permanentItems.includes(item.id))).slice(0, 3).map(item => item.id),
      consumable: [...staple, ...rest].slice(0, 4).map(item => item.id)
    };
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
    const passive = ownedBonus("income");
    if (passive) {
      state.wallet += passive;
      state.monthLog.push({ label: "招财猫招来的钱", amount: passive, positive: true });
    }
    updateHUD();
    if (state.month === THIEF.firstMonth && !state.thiefWarned) {
      state.thiefWarned = true;
      openModal(`<p class="eyebrow">巴生小镇</p><h2>街上开始不太干净</h2>
        <div class="result-box">
          <p>街上有小偷盯着你的钱包。有力气的时候你跑得过他——<strong>但动力越低你跑得越慢</strong>，他就会追上来。</p>
          <p><strong>躲进任何一家店，出来时他已经换地方了。</strong></p>
          <p>钱存进银行他就碰不到——身上别带太多现金。</p>
        </div>
        <button id="thief-warned" class="pixel-btn primary full-button">知道了</button>`, { closable: false });
      $("#thief-warned").addEventListener("click", () => { closeModal(); drawFateCard(); });
      return;
    }
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
      hint: "选中的那张就是你这个月。",
      candidates,
      faceUp: card => cardMarkup(card, card.type, "本月命运", `fate:${card.id}`),
      stingFor: card => card.type === "good" ? 880 : card.type === "bad" ? 220 : 620,
      confirmLabel: "接受命运，开始本月",
      onConfirm: card => {
        state.lastFateId = card.id;
        collect("命运卡", card.id);
        card.apply();
        state.motivation = Math.max(0, state.motivation);
        state.luck = clamp(state.luck, 0, 100);
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
    $("#month-total").textContent = `共${TOTAL_MONTHS}月`;
    $("#wallet-label").textContent = money(state.wallet);
    $("#bank-label").textContent = money(state.bank);
    $("#motivation-label").textContent = Math.round(state.motivation);
    const luck = effectiveLuck();
    $("#luck-label").textContent = `${luck} · ${luckLabel(luck)}`;

    // Debt decides bankruptcy but used to be invisible until the month-end report.
    const owing = Math.round(state.debt);
    $("#debt-tile").hidden = owing <= 0;
    $("#debt-label").textContent = money(owing);
    // Rent is taken from the bank, so falling short matters - but the old banner sat
    // over the map and covered the building labels. Mark the bank tile instead.
    const rent = currentRent();
    // Rent falls back to the wallet, so the warning is about combined funds -- and
    // there is nothing to warn about once you have actually paid it.
    const rentShort = !state.rentPaid && state.wallet < rent;
    $(".hud-stat.wallet").classList.toggle("short", rentShort);
    $("#wallet-label").title = rentShort ? `钱包现金不够付本月房租（${money(rent)}）` : "";
    $("#bag-count").textContent = state.permanentItems.length + state.tempTools.length + state.sprayCharges;
    // Only the three that gate sleeping. A night out is optional, so listing it here
    // made it look like homework.
    MONTH_TASKS.forEach(task => setCheck(task.flag, state.flags[task.flag], task.label));
    setCheck("rent", state.rentPaid, "房租");
  }

  function setCheck(id, done, label) {
    const element = $(`#check-${id}`);
    if (!element) return;
    element.classList.toggle("done", done);
    element.textContent = `${done ? "✓" : "□"} ${label}`;
  }

  // Phase comes from cumulative spend, so it only ever moves forward. Eating or using
  // a tool buys you more energy, not an earlier hour.
  // Read from energy left, but one-way: eating buys you more energy, not an earlier
  // hour, so the clock latches at the furthest point it has reached this month.
  const PHASE_ORDER = ["morning", "afternoon", "night"];

  function advanceDayPhase() {
    if (!state) return;
    const left = state.motivation;
    const reached = left <= ENERGY.nightBelow ? 2 : left <= ENERGY.afternoonBelow ? 1 : 0;
    if (reached > (state.phaseReached || 0)) state.phaseReached = reached;
  }

  function dayPhase() {
    return PHASE_ORDER[state ? (state.phaseReached || 0) : 0];
  }

  const PHASE_LABELS = { morning: "早上", afternoon: "下午", night: "晚上" };

  // Returns false when the player ran out and the month ended under them, so callers
  // can stop before charging money for something that no longer happens.
  function spendEnergy(amount) {
    if (!state || amount <= 0) return true;
    state.motivation -= amount;
    state.energySpent += amount;
    if (state.motivation <= 0) {
      state.motivation = 0;
      updateHUD();
      collapseFromExhaustion();
      return false;
    }
    updateHUD();
    return true;
  }

  function collapseFromExhaustion() {
    if (!playing) return;
    closeModal();
    showToast("动力见底，你就地倒下了");
    endMonth(false);
  }

  function formatTime(seconds) {
    const whole = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
  }

  // Rent climbs $50 a month: $220 in month 1, $520 in month 7. A flat $220 against a
  // first month that already cleared $1,600 meant nothing to push against, and over
  // seven months the curve has to be steeper than it was over twelve to still bite.
  function currentRent() {
    const house = HOUSES.find(item => item.id === state.houseId);
    const base = house.rent + (state.month - 1) * 50;
    return Math.round(base * (1 - state.rentDiscount));
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

  // Small enough that the prompt means "you are at the door", not "you are somewhere
  // in front of the shop". At 46 you could trigger it standing beside the plant pots.
  const INTERACT_RADIUS = 36;

  function getDoor(building) { return { x: building.doorX ?? building.x + building.w / 2, y: building.y + building.h + 8 }; }

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

  // The art is the single source of truth for where you can walk: if it is painted as
  // road or plaza you can stand on it, and if it is a building, planter, tree, hedge,
  // beach or sea you cannot.
  function maskAt(x, y) {
    const row = ROAD_MASK[Math.floor(y / ROAD_CELL)];
    return row ? row[Math.floor(x / ROAD_CELL)] : "0";
  }

  function isTownBlocked(x, y) {
    return maskAt(x, y) === "0";
  }

  // Real road or plaza paving, as opposed to a hedge or the freed roof edge you can
  // pass through. A thief loitering in a bush or on a shop's steps reads as a bug.
  function isRoad(x, y) {
    return maskAt(x, y) === "2";
  }

  function isBlocked(x, y) {
    if (state.scene !== "town") return x < 300 || x > 660 || y < 80 || y > 510;
    return isTownBlocked(x, y);
  }

  function movePlayer(dx, dy, delta) {
    if (!state || paused || !playing) return;
    if (state.scene !== "town") return;
    // Steeper than it was (-5%/-10%), because the thief's threat hangs off it: a
    // 152 -> 144 -> 137 curve leaves no speed that is slower than a rested player yet
    // meaningfully faster than a tired one. Running out of energy now visibly costs
    // you your legs, which is the whole point of "I can't run at night".
    const fatigueSpeed = state.motivation < 10 ? -0.30 : state.motivation < 30 ? -0.15 : state.motivation >= 90 ? 0.05 : 0;
    const speed = 152 * (1 + state.speedBonus + fatigueSpeed);
    const length = Math.hypot(dx, dy);
    const scale = length > 1 ? 1 / length : 1;
    const vx = dx * scale * speed * delta;
    const vy = dy * scale * speed * delta;
    const nextX = clamp(state.player.x + vx, 14, 946);
    const nextY = clamp(state.player.y + vy, 18, 520);
    const fromX = state.player.x, fromY = state.player.y;
    if (!isBlocked(nextX, state.player.y)) state.player.x = nextX;
    if (!isBlocked(state.player.x, nextY)) state.player.y = nextY;
    state.player.moving = length > 0.08;

    // Charge for ground actually covered, so walking into a wall is free.
    state.walkCarry += Math.hypot(state.player.x - fromX, state.player.y - fromY) * (1 - Math.min(0.75, state.walkDiscount || 0));
    if (state.walkCarry >= ENERGY.pixelsPerPoint) {
      const points = Math.floor(state.walkCarry / ENERGY.pixelsPerPoint);
      state.walkCarry -= points * ENERGY.pixelsPerPoint;
      if (!spendEnergy(points)) return;
    }

    if (Math.abs(dx) > Math.abs(dy)) state.player.facing = dx > 0 ? "right" : "left";
    else if (dy) state.player.facing = dy > 0 ? "down" : "up";
  }

  function findNearbyTarget() {
    if (!state) return null;
    if (state.scene === "interior") {
      const building = buildingList().find(item => item.id === state.interiorId);
      return { id: "counter", label: building?.label || "柜台" };
    }
    const target = buildingList().find(building => {
      const door = getDoor(building);
      return Math.hypot(state.player.x - door.x, state.player.y - door.y) < INTERACT_RADIUS;
    });
    if (target) return target;
    const boardDistance = Math.hypot(state.player.x - BOARD.x, state.player.y - BOARD.y);
    return boardDistance < INTERACT_RADIUS ? { id: "parttime", label: BOARD.label } : null;
  }

  function interact() {
    if (!state || paused || !playing) return;
    const target = findNearbyTarget();
    if (!target) { showToast("这里没有可以互动的东西"); return; }
    beep(620, 0.05, "square", 0.03);
    if (target.id === "counter") {
      const building = buildingList().find(item => item.id === state.interiorId);
      if (building) showCounter(building);
      return;
    }
    if (target.id === "parttime") { showPartTime(); return; }
    enterBuilding(target);
  }

  function enterBuilding(building) {
    state.scene = "interior";
    state.interiorId = building.id;
    $("#location-label").textContent = building.label;
    setTimeout(() => showCounter(building), 90);
  }

  const COUNTER_LINES = {
    work: "老板抬头看你：「今天做哪一种？」",
    bank: "柜台阿姨推了推眼镜：「存还是取？」",
    stock: "经纪人转过屏幕：「今天这三只，看看？」",
    roi: "研究员举起发光的小盆栽：「要投哪一种？」",
    food: "老板挥着锅铲：「吃什么？」",
    fun: "店员摘下耳机：「要玩一轮吗？」",
    shop: "老板娘笑着说：「不灵不退款哦。」",
    home: "你的房间。床就在那里。"
  };

  // A bottom dialogue bar rather than a centred modal, so the two characters stay
  // visible above it while the player chooses.
  function showCounter(building) {
    $("#counter-who").textContent = building.label;
    $("#counter-line").textContent = COUNTER_LINES[building.id] || "有人抬头看了你一眼。";
    $("#counter-act").textContent = building.id === "home" ? "睡觉" : "办事";
    $("#counter-bar").hidden = false;
  }

  function hideCounter() {
    $("#counter-bar").hidden = true;
  }

  function leaveInterior() {
    hideCounter();
    // He has moved on while you were inside; you come out somewhere new to him.
    state.thieves = [];
    state.thiefRespawn = 0;
    const building = buildingList().find(item => item.id === state.interiorId);
    state.scene = "town";
    state.interiorId = null;
    const spot = standingSpot(building);
    state.player = { x: spot.x, y: spot.y, facing: "down", moving: false };
    $("#location-label").textContent = "巴生小镇";
  }

  function openBuildingInteraction(id) {
    const actions = { work: showWork, bank: showBank, stock: showStock, roi: showROI, food: showFood, fun: showFun, shop: showShop, home: showHome };
    actions[id]?.();
  }

  function showWork() {
    const done = state.workDone;
    const rate = ENERGY.workFalloff[Math.min(done, ENERGY.workFalloff.length - 1)];
    openModal(`<p class="eyebrow">摸鱼有限公司</p><h2>今天做哪一种活？</h2>
      <p class="modal-intro">越难越赚，动力扣得越多。答错扣20%工资。</p>
      <div class="status-strip">
        <span class="status-chip">动力 ${Math.round(state.motivation)}</span>
        <span class="status-chip">本月已做 ${done} 次</span>
        ${done ? `<span class="status-chip warn">加班费只剩 ${Math.round(rate * 100)}%</span>` : ""}
      </div>
      <div class="card-grid">${WORK_TIERS.map(tier => {
        const pay = Math.round(tier.pay * rate);
        const tooTired = state.motivation <= tier.energy;
        return cardMarkup(
          { id: tier.id, icon: tier.icon, name: tier.name, copy: tooTired ? "动力不够，做不动了" : tier.copy },
          tooTired ? "unaffordable work-card" : "choice work-card",
          `动力-${tier.energy} · 工资 ${money(pay)}`,
          `work:${tier.id}`);
      }).join("")}</div>`);
    $$(".game-card").forEach(button => button.addEventListener("click", () => {
      const tier = WORK_TIERS.find(item => item.id === button.dataset.cardId);
      if (state.motivation <= tier.energy) { showToast("动力不够做这份活"); return; }
      startMathQuestion(tier, Math.round(tier.pay * rate));
    }));
  }

  // `span` comes from the work tier, so the harder the shift the bigger the numbers.
  function makeMathQuestion(span = 25) {
    const big = Math.max(6, Math.round(span * 2.4));
    const small = Math.max(3, Math.round(span * 0.5));
    const kind = Math.floor(Math.random() * 5);
    let prompt, answer;
    if (kind === 0) { const a = small + Math.floor(Math.random() * big), b = small + Math.floor(Math.random() * big); prompt = `${a} + ${b} = ?`; answer = a + b; }
    else if (kind === 1) { const a = big + Math.floor(Math.random() * big), b = small + Math.floor(Math.random() * big); prompt = `${a} − ${b} = ?`; answer = a - b; }
    else if (kind === 2) { const a = 3 + Math.floor(Math.random() * Math.max(4, span / 3)), b = 4 + Math.floor(Math.random() * Math.max(4, span / 4)); prompt = `${a} × ${b} = ?`; answer = a * b; }
    else if (kind === 3) { const base = random(span > 30 ? [120, 160, 240, 320] : span > 18 ? [40, 60, 80, 100, 120, 200] : [20, 40, 60, 80]), percent = random(span > 30 ? [15, 35, 45] : [10, 20, 25, 50]); prompt = `${percent}% × $${base} = ?`; answer = base * percent / 100; }
    else { const base = random(span > 30 ? [160, 240, 320] : [80, 100, 120, 200]), percent = random(span > 30 ? [15, 35] : [10, 20, 25, 50]); prompt = `$${base}打${100 - percent}%折，售价是？`; answer = base * (100 - percent) / 100; }
    const spread = Math.max(4, Math.round(span * 0.8));
    const wrong = new Set();
    while (wrong.size < 2) {
      const value = Math.max(1, Math.round(answer + random([-spread, -spread / 2, spread / 2, spread])));
      if (value !== answer) wrong.add(value);
    }
    return { prompt, answer, options: shuffle([answer, ...wrong]) };
  }

  function startMathQuestion(tier, pay) {
    collect("工作卡", tier.id);
    const question = makeMathQuestion(tier.span);
    openModal(`<p class="eyebrow">${tier.name} · 动力-${tier.energy}</p><h2>答对就拿完整工资</h2>
      <div class="math-question">${question.prompt}</div>
      <div class="answer-grid">${question.options.map(value => `<button class="pixel-btn" data-answer="${value}">${money(value)}</button>`).join("")}</div>`, { closable: false });
    $$('[data-answer]').forEach(button => button.addEventListener("click", () => {
      const correct = Number(button.dataset.answer) === question.answer;
      let protectedByTool = false;
      if (!correct && state.mathShield) { state.mathShield = false; protectedByTool = true; }
      const paid = (!correct && !protectedByTool) ? Math.round(pay * 0.8) : pay;
      state.wallet += paid;
      state.workDone += 1;
      state.flags.work = true;
      state.monthLog.push({ label: `${tier.name}工资`, amount: paid, positive: true });
      beep(correct || protectedByTool ? 760 : 180, 0.13, correct ? "square" : "sawtooth", 0.04);
      openModal(`<p class="eyebrow">打卡完成</p><h2>${correct ? "算得漂亮！" : protectedByTool ? "计算器救了你" : "老板抓到机会扣钱了"}</h2>
        <div class="result-box">正确答案：${money(question.answer)}<br>到手工资：<strong>${money(paid)}</strong><br>动力：-${tier.energy}</div>
        <button id="work-done" class="pixel-btn primary">收工</button>`, { closable: false });
      $("#work-done").addEventListener("click", closeModal);
      updateHUD();
      // Charged last so that if this shift empties the tank, the month ends over the
      // top of the payslip and the player still keeps what they just earned.
      spendEnergy(tier.energy);
    }));
  }

  function tipWording(change) {
    if (change >= 12) return { text: "会大涨", tone: "good" };
    if (change >= 4) return { text: "会涨一点", tone: "good" };
    if (change > -4) return { text: "大概不动", tone: "flat" };
    if (change > -12) return { text: "会跌一点", tone: "bad" };
    return { text: "会大跌", tone: "bad" };
  }

  // A tip is only worth having if it is true, so both months read the moves that have
  // already been decided rather than a guess at history.
  function stockTipFor(id) { return tipWording((state.pendingStock || {})[id] ?? 0); }
  function stockTipNextFor(id) { return tipWording((state.nextStock || {})[id] ?? 0); }

  // "This month and next" in one line, which is what makes a tip worth a shift's work:
  // you can buy now and know whether to hold.
  function stockOutlook(id) {
    return `这个月${stockTipFor(id).text}，下个月${stockTipNextFor(id).text}`;
  }

  function showPartTime() {
    if (state.flags.partTimeDrawn) { simpleMessage("这个月抽过了", "公告板只剩『免费加班』。", "📌"); return; }
    state.flags.partTimeDrawn = true;
    const jobs = shuffle(PART_TIME).slice(0, 3);
    const tipped = shuffle(STOCKS).slice(0, 3);
    const offers = jobs.map((job, index) => ({ job, stock: tipped[index] || tipped[0] }));

    runCardDraw({
      eyebrow: "兼职公告板",
      title: "撕一张",
      hint: "撕下哪张做哪份。工友还会顺便透露一只股票这两个月的风声。",
      candidates: offers,
      faceUp: ({ job, stock }) => `<div class="offer-pair">
        ${cardMarkup(job, "choice", "", `parttime:${job.id}`)}
        ${cardMarkup({ id: stock.id, name: stock.name, icon: stock.icon, copy: `工友说${stockOutlook(stock.id)}` }, "stock", "两个月内幕", `stock:${stock.id}`)}
      </div>`,
      stingFor: ({ job }) => job.pay >= 160 ? 880 : job.pay >= 120 ? 620 : 380,
      confirmLabel: "接下这份工",
      onConfirm: ({ job, stock }) => {
        collect("兼职卡", job.id);
        state.wallet += job.pay;
        state.stockTips[stock.id] = true;
        state.monthLog.push({ label: `兼职：${job.name}`, amount: job.pay, positive: true });
        if (!spendEnergy(ENERGY.partTime)) return;
        closeModal();
        updateHUD();
        showToast(`兼职完成，得到${money(job.pay)}，还听到${stock.name}两个月的风声`);
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
    const cost = state.freeFood ? 0 : 70;
    if (state.wallet < cost) { simpleMessage("钱包不够", `吃饭要${money(cost)}现金。`, "👛"); return; }
    const rate = ENERGY.mealFalloff[Math.min(state.mealsEaten, ENERGY.mealFalloff.length - 1)];
    if (rate <= 0.1 && state.mealsEaten >= ENERGY.mealFalloff.length - 1) {
      simpleMessage("真的吃不下了", "这个月再吃也补不回动力了。", "🍚");
      return;
    }
    openModal(`<p class="eyebrow">月底食堂</p><h2>今天吃什么？</h2>
      <p>抽一道菜补动力。吃越多，补越少。</p>
      <div class="status-strip">
        <span class="status-chip">动力 ${Math.round(state.motivation)}</span>
        <span class="status-chip">本月第 ${state.mealsEaten + 1} 餐</span>
        <span class="status-chip${rate < 1 ? " warn" : ""}">回复效果 ${Math.round(rate * 100)}%</span>
      </div>
      <button id="draw-food" class="pixel-btn primary">${cost ? `支付${money(cost)}并抽卡` : "使用免费餐券抽卡"}</button>`);
    $("#draw-food").addEventListener("click", () => {
      state.wallet -= cost;
      state.freeFood = false;
      const candidates = [weightedOutcome(FOODS), weightedOutcome(FOODS), weightedOutcome(FOODS)];
      runCardDraw({
        eyebrow: "月底食堂",
        title: "今天吃什么？",
        hint: "翻哪张吃哪张。",
        candidates,
        faceUp: food => cardMarkup(food, "good", "本月一次", `food:${food.id}`),
        stingFor: food => food.motivation >= 12 ? 880 : food.motivation >= 6 ? 620 : 300,
        confirmLabel: "吃饱了",
        onConfirm: food => {
          collect("食物卡", food.id);
          const gained = Math.round(food.motivation * rate * (1 + (state.mealBonus || 0)));
          state.motivation += gained;
          state.luck = clamp(state.luck + (food.luck || 0), 0, 100);
          state.wallet += food.refund || 0;
          state.mealsEaten += 1;
          state.flags.food = true;
          state.monthLog.push({ label: `食物：${food.name}`, amount: -(cost - (food.refund || 0)), positive: false });
          closeModal();
          updateHUD();
          showToast(`吃了${food.name}，动力+${gained}`);
        }
      });
    });
  }

  function showFun() {
    if (state.flags.fun) { simpleMessage("这个月玩过了", "老板笑你：「回家啦，钱留着交房租。」", "🕹️"); return; }
    if (state.wallet < 50) { simpleMessage("钱不够", "娱乐要$50现金。", "👛"); return; }
    openModal(`<p class="eyebrow">开心一下</p><h2>花$50抽一次快乐</h2>
      <p>最差也不会亏动力。</p>
      <div class="status-strip"><span class="status-chip">动力 ${Math.round(state.motivation)}</span></div>
      <button id="draw-fun" class="pixel-btn primary">支付$50并抽卡</button>`);
    $("#draw-fun").addEventListener("click", () => {
      state.wallet -= 50;
      const candidates = [weightedOutcome(FUN_CARDS), weightedOutcome(FUN_CARDS), weightedOutcome(FUN_CARDS)];
      runCardDraw({
        eyebrow: "开心一下",
        title: "今晚做什么？",
        hint: "翻开哪个就去做哪个。",
        candidates,
        faceUp: fun => cardMarkup(fun, "choice", "本月一次", `fun:${fun.id}`),
        stingFor: fun => fun.motivation >= 12 ? 880 : fun.motivation >= 5 ? 620 : 300,
        confirmLabel: "心情好多了",
        onConfirm: fun => {
          collect("娱乐卡", fun.id);
          state.motivation += fun.motivation;
          state.luck = clamp(state.luck + (fun.luck || 0), 0, 100);
          state.wallet += (fun.cash || 0) + (fun.refund || 0);
          state.flags.fun = true;
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
    const rentLine = state.rentPaid
      ? `<div class="result-box positive">本月房租 ${money(rent)} 已经交了。</div>`
      : `<div class="result-box">本月房租 <strong>${money(rent)}</strong>，回家交给房东，只收现金。<br>
          <small>钱包现在 ${money(state.wallet)}，不够就先提款。</small></div>`;
    openModal(`<p class="eyebrow">稳稳银行 · 本月利息${Math.round(state.bankRate * 100)}%</p><h2>钱要放对地方</h2>
      <div class="status-strip"><span class="status-chip">钱包 ${money(state.wallet)}</span><span class="status-chip">银行 ${money(state.bank)}</span><span class="status-chip">债务 ${money(state.debt)}</span></div>
      ${rentLine}
      <div class="input-row"><label>金额<input id="bank-amount" type="number" min="1" step="10" value="100"></label>
        <button id="deposit-btn" class="pixel-btn primary">存入银行</button><button id="withdraw-btn" class="pixel-btn">从银行提款</button><button id="repay-btn" class="pixel-btn danger">偿还债务</button></div>`);
    $("#deposit-btn").addEventListener("click", () => bankTransfer("deposit"));
    $("#withdraw-btn").addEventListener("click", () => bankTransfer("withdraw"));
    $("#repay-btn").addEventListener("click", () => bankTransfer("repay"));
  }

  // The landlord wants cash in hand, so rent only ever comes out of the wallet. That
  // is what makes "how much do I dare put in the bank" a decision instead of a formality.
  function chargeRent() {
    const rent = currentRent();
    const fromWallet = Math.min(state.wallet, rent);
    state.wallet -= fromWallet;
    return { rent, fromWallet, shortfall: rent - fromWallet };
  }

  function payRent() {
    if (state.rentPaid) return;
    const rent = currentRent();
    if (state.wallet < rent) { showToast("钱包现金不够，先去银行提款"); return; }
    chargeRent();
    state.rentPaid = true;
    state.missedRentStreak = 0;
    state.monthLog.push({ label: "交房租", amount: -rent, positive: false });
    beep(520, .12, "square", .04);
    updateHUD();
    showHome();
    showToast(`房租交了 ${money(rent)}`);
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
    if (!spendEnergy(ENERGY.bank)) return;
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
    openModal(`<p class="eyebrow">涨跌交易所</p><h2>本月发现的三只股票</h2><div class="status-strip"><span class="status-chip">买卖一次 动力-${ENERGY.stock}</span><span class="status-chip">动力 ${Math.round(state.motivation)}</span></div>
      <p class="modal-intro">本月只能买一种，最多10股。持有的随时可卖。</p>
      <div class="card-grid">${offers.map(item => {
        const price = state.stockPrices[item.id];
        const known = state.stockTips[item.id] || state.marketHint;
        const hint = known ? `内幕：${stockOutlook(item.id)}` : "趋势每月更新";
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
      state.monthLog.push({ label: `买入${stock.name}`, amount: -cost, positive: false });
      if (!spendEnergy(ENERGY.stock)) return;
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
    state.monthLog.push({ label: `卖出${stock.name}1股`, amount: price, positive: true });
    if (!spendEnergy(ENERGY.stock)) return;
    updateHUD();
    showStock();
  }

  function showROI() {
    if (state.flags.roi) { simpleMessage("本月已经投过了", "投资需要一点耐心。下个月钱会自动进入银行。", "🎯"); return; }
    const lastMonth = state.month >= TOTAL_MONTHS;
    openModal(`<p class="eyebrow">ROI研究所</p><h2>选择风险，再抽回报</h2><div class="status-strip"><span class="status-chip">投资一次 动力-${ENERGY.roi}</span><span class="status-chip">动力 ${Math.round(state.motivation)}</span></div>
      <p class="modal-intro">${lastMonth ? "最后一个月，这笔钱会在月底结算时直接进银行。" : "钱锁一个月，下月自动进银行。"}</p>
      <div class="card-grid">${ROI_TYPES.map(type => cardMarkup(type, type.color, `${type.min}% ～ +${type.max}%`, `roi:${type.id}`)).join("")}</div>`);
    $$('.game-card').forEach(button => button.addEventListener("click", () => chooseROIAmount(button.dataset.cardId)));
  }

  function chooseROIAmount(typeId) {
    const type = ROI_TYPES.find(item => item.id === typeId);
    const ceiling = Math.min(ROI_MAX, Math.floor(combinedFunds()));
    openModal(`<p class="eyebrow">${type.name}</p><h2>投入多少？</h2>
      <p>可能回报：${type.min}%至+${type.max}%。每次最多投 ${money(ROI_MAX)}，不管哪一种项目。</p>
      <div class="status-strip">
        <span class="status-chip">钱包 ${money(state.wallet)}</span>
        <span class="status-chip">银行 ${money(state.bank)}</span>
        <span class="status-chip">这次上限 ${money(ceiling)}</span>
      </div>
      <div class="input-row">
        <label>投入金额<input id="roi-amount" type="number" min="${ROI_MIN}" max="${ceiling}" step="10" value="${clamp(200, ROI_MIN, Math.max(ROI_MIN, ceiling))}"></label>
        <label>优先付款<select id="roi-payment"><option value="wallet">钱包优先</option><option value="bank">银行优先</option><option value="auto">自动组合</option></select></label>
      </div>
      <p id="roi-range" class="modal-intro"></p>
      <div class="button-row">
        <button id="roi-go" class="pixel-btn primary" ${ceiling < ROI_MIN ? "disabled" : ""}>${ceiling < ROI_MIN ? `至少要 ${money(ROI_MIN)}` : "投下去"}</button>
        <button id="roi-max" class="pixel-btn">全下 ${money(ceiling)}</button>
        <button id="back-roi" class="pixel-btn ghost">返回</button>
      </div>`);
    const field = $("#roi-amount");
    const preview = () => {
      const amount = roiAmountFrom(field, ceiling);
      $("#roi-range").textContent = `投 ${money(amount)} 的话，下个月拿回 ${money(Math.round(amount * (1 + type.min / 100)))} 到 ${money(Math.round(amount * (1 + type.max / 100)))}。`;
    };
    field.addEventListener("input", preview);
    preview();
    $("#roi-max").addEventListener("click", () => { field.value = String(ceiling); preview(); });
    $("#roi-go").addEventListener("click", () => investROI(type, roiAmountFrom(field, ceiling), $("#roi-payment").value));
    $("#back-roi").addEventListener("click", showROI);
  }

  // One place decides what a typed amount really means, so the preview and the charge
  // can never disagree about it.
  function roiAmountFrom(field, ceiling) {
    return clamp(Math.floor(Number(field.value) || 0), ROI_MIN, Math.max(ROI_MIN, ceiling));
  }

  function investROI(type, amount, payment) {
    if (amount < ROI_MIN) { showToast(`至少要投 ${money(ROI_MIN)}`); return; }
    if (amount > ROI_MAX) { showToast(`每次最多投 ${money(ROI_MAX)}`); return; }
    if (!spendCombined(amount, payment)) { showToast("钱包加银行都不够"); return; }
    const rate = Math.floor(type.min + Math.random() * (type.max - type.min + 1));
    const payout = Math.max(1, Math.round(amount * (1 + rate / 100)));
    state.pendingROI.push({ dueMonth: state.month + 1, amount, payout, rate, name: type.name });
    state.flags.roi = true;
    collect("ROI卡", type.id);
    state.monthLog.push({ label: `投入${type.name}`, amount: -amount, positive: false });
    if (!spendEnergy(ENERGY.roi)) return;
    openModal(`<p class="eyebrow">ROI抽卡结果</p><h2>${rate >= 0 ? "项目看起来不错" : "好像有点不妙"}</h2>
      <div class="result-box">投入：${money(amount)}<br>抽到回报：<strong class="${rate >= 0 ? "positive" : "negative"}">${rate >= 0 ? "+" : ""}${rate}%</strong><br>下个月进入银行：<strong>${money(payout)}</strong></div>
      <button id="roi-done" class="pixel-btn primary">记住了</button>`, { closable: false });
    $("#roi-done").addEventListener("click", closeModal);
    updateHUD();
  }

  function showShop() {
    const offers = state.shopOffers || {};
    const permanent = (offers.permanent || []).map(shopItem).filter(Boolean);
    const consumable = (offers.consumable || []).map(shopItem).filter(Boolean);
    const shelf = (items, kind) => items.map(item => {
      const owned = kind === "permanent" && state.permanentItems.includes(item.id);
      const boughtAlready = kind === "consumable" && (state.boughtItems || {})[item.id];
      const full = kind === "permanent" ? state.permanentItems.length >= 3
        : !item.spray && state.tempTools.length >= 3;
      const tooPoor = state.wallet < item.price;
      const note = owned ? "已拥有"
        : boughtAlready ? `${money(item.price)} · 这个月买过了`
        : tooPoor ? `${money(item.price)} · 钱不够`
        : full ? `${money(item.price)} · 背包满了`
        : `${money(item.price)} · ${kind === "permanent" ? "永久" : "一次性"}`;
      const tone = owned || boughtAlready ? "owned" : tooPoor || full ? "unaffordable" : "choice";
      return cardMarkup(item, tone, note, shopArt(item));
    }).join("");

    openModal(`<p class="eyebrow">包好运杂货铺</p><h2>老板说：不灵不退款</h2>
      <div class="status-strip">
        <span class="status-chip">钱包 ${money(state.wallet)}</span>
        <span class="status-chip">永久 ${state.permanentItems.length}/3</span>
        <span class="status-chip">一次性 ${state.tempTools.length}/3</span>
        <span class="status-chip">买一件 动力-${ENERGY.shop}</span>
      </div>
      <h3 class="shelf-title">永久物品 · 买了一直有效</h3>
      <div class="card-grid">${shelf(permanent, "permanent")}</div>
      <h3 class="shelf-title">一次性 · 每种一个月只能买一次</h3>
      <div class="card-grid">${shelf(consumable, "consumable")}</div>`);
    $$('.game-card').forEach(button => button.addEventListener("click", () => buyShopItem(button.dataset.cardId)));
  }

  function buyShopItem(id) {
    const item = shopItem(id);
    if (!item) return;
    const permanent = PERMANENT_ITEMS.includes(item);
    if (state.wallet < item.price) { showToast("钱包现金不够"); return; }
    if (permanent && state.permanentItems.includes(id)) { showToast("同名物品效果不能叠加"); return; }
    if (permanent && state.permanentItems.length >= 3) { showToast("永久背包满了，先卖掉一件"); return; }
    if (!permanent && state.boughtItems[id]) { showToast(`${item.name}这个月买过了`); return; }
    if (!permanent && !item.spray && state.tempTools.length >= 3) { showToast("一次性背包满了，先用掉一件"); return; }

    state.wallet -= item.price;
    if (permanent) {
      state.permanentItems.push(item.id);
      applyPermanent(item);
      collect("永久物品", item.id);
    } else if (item.spray) {
      state.sprayCharges += 1;
      state.boughtItems[item.id] = true;
      collect("一次性物品", item.id);
    } else {
      state.tempTools.push(item.id);
      state.boughtItems[item.id] = true;
      collect("一次性物品", item.id);
    }
    // spendEnergy can end the month on the spot, and re-opening the shop over the
    // month report is how you get stranded in a building. Bail out if it did.
    if (!spendEnergy(ENERGY.shop)) return;
    updateHUD();
    showShop();
    showToast(`买到${item.name}`);
  }

  // A permanent bought mid-month should work for the rest of that month too, not wait
  // for the next reset to be folded in.
  function applyPermanent(item, sign = 1) {
    if (item.speed) state.speedBonus += sign * item.speed;
    if (item.sleep) state.sleepBonus += sign * item.sleep;
    if (item.rate) state.bankRate += sign * item.rate;
    if (item.walk) state.walkDiscount = Math.min(0.6, Math.max(0, state.walkDiscount + sign * item.walk));
    if (item.meal) state.mealBonus = Math.max(0, state.mealBonus + sign * item.meal);
    if (item.hint) state.marketHint = ownedBonus("hint") > 0;
  }

  function showHome() {
    const house = HOUSES.find(item => item.id === state.houseId);
    const left = unfinishedTasks();
    const rent = currentRent();
    const checklist = MONTH_TASKS.map(task =>
      `<span class="status-chip${state.flags[task.flag] ? " good" : " warn"}">${state.flags[task.flag] ? "✔" : "✘"} ${task.label}</span>`).join("");
    // The landlord waits at the door for cash. Doing it here, by hand, is what makes
    // leaving money in the bank a gamble rather than a free interest payment.
    const rentBox = state.rentPaid
      ? `<div class="result-box positive">第${state.month}月房租 ${money(rent)} 已经交了。</div>`
      : `<div class="result-box">房东在门口等：第${state.month}月房租 <strong>${money(rent)}</strong>，只收现金。<br>
          <small>钱包 ${money(state.wallet)}${state.wallet < rent ? "，不够，去银行提款" : ""}。拖到月底他自己来收，还要算你欠租。</small>
          <button id="pay-rent-btn" class="pixel-btn danger full-button" ${state.wallet < rent ? "disabled" : ""}>${state.wallet < rent ? "现金不够" : `交房租 ${money(rent)}`}</button></div>`;
    const body = left.length
      ? `<p>本月还没做完，躺下也睡不着：<strong>${left.map(task => `${task.label}（${task.where}）`).join("、")}</strong>。</p>`
      : `<p>现在是${PHASE_LABELS[dayPhase()]}，你还剩<strong>${Math.round(state.motivation)}</strong>动力。睡觉会结束第${state.month}月，下个月动力回满${ENERGY.monthStart}。</p>`;
    openModal(`<p class="eyebrow">${house.name}</p><h2>${left.length ? "还不能睡" : "要睡觉了吗？"}</h2>
      <div class="status-strip">${checklist}</div>
      ${rentBox}
      ${body}
      <div class="button-row">${left.length
        ? `<button id="not-yet-btn" class="pixel-btn primary">出去做完它</button>`
        : `<button id="sleep-btn" class="pixel-btn primary">睡觉，结束本月</button><button id="not-yet-btn" class="pixel-btn ghost">还没，我再出去一下</button>`}</div>`);
    $("#pay-rent-btn")?.addEventListener("click", payRent);
    $("#sleep-btn")?.addEventListener("click", () => { closeModal(); endMonth(true); });
    $("#not-yet-btn").addEventListener("click", closeModal);
  }

  function showBag() {
    if (!state) return;
    const sprayLine = state.sprayCharges > 0
      ? `<div class="status-strip"><span class="status-chip">🧴 防身喷雾 x${state.sprayCharges} · 被追上时自动使用</span></div>`
      : "";
    const permanent = state.permanentItems.map(id => PERMANENT_ITEMS.find(item => item.id === id));
    const temporary = state.tempTools.map(id => CONSUMABLES.find(item => item.id === id));
    openModal(`<p class="eyebrow">背包</p><h2>永久物品 ${permanent.length}/3</h2>${sprayLine}
      <div class="inventory-grid">${[0, 1, 2].map(index => permanent[index] ? `<div class="inventory-slot"><strong>${permanent[index].icon} ${permanent[index].name}</strong><p>${permanent[index].copy}</p><button class="pixel-btn" data-sell-item="${permanent[index].id}">卖出 ${money(permanent[index].price * .5)}</button></div>` : `<div class="inventory-slot empty">空位</div>`).join("")}</div>
      <h3 style="margin-top:24px">一次性物品 ${temporary.length}/3</h3>
      <div class="inventory-grid">${[0, 1, 2].map(index => temporary[index] ? `<div class="inventory-slot"><strong>${temporary[index].icon} ${temporary[index].name}</strong><p>${temporary[index].copy}</p><button class="pixel-btn primary" data-use-tool="${index}">使用</button></div>` : `<div class="inventory-slot empty">空位</div>`).join("")}</div>`);
    $$('[data-sell-item]').forEach(button => button.addEventListener("click", () => sellItem(button.dataset.sellItem)));
    $$('[data-use-tool]').forEach(button => button.addEventListener("click", () => useTool(Number(button.dataset.useTool))));
  }

  function sellItem(id) {
    const item = PERMANENT_ITEMS.find(entry => entry.id === id);
    state.permanentItems.splice(state.permanentItems.indexOf(id), 1);
    applyPermanent(item, -1);
    state.wallet += Math.round(item.price * 0.5);
    updateHUD(); showBag();
  }

  function useTool(index) {
    const id = state.tempTools[index], tool = CONSUMABLES.find(item => item.id === id);
    tool.use();
    state.tempTools.splice(index, 1);
    updateHUD(); showBag(); showToast(`${tool.name}已使用`);
  }

  function simpleMessage(title, copy, icon = "💬") {
    openModal(`<p class="eyebrow">${icon} 提醒</p><h2>${title}</h2><div class="result-box">${copy}</div><button id="message-ok" class="pixel-btn primary">知道了</button>`);
    $("#message-ok").addEventListener("click", closeModal);
  }

  // This month's move is decided at the START of the month and applied at the end, so
  // a tip bought from the notice board can name what is actually going to happen
  // rather than describing last month and hoping.
  function rollStockChanges() {
    const rolled = {};
    STOCKS.forEach(stock => {
      // Symmetric on purpose. The old band averaged +2.5% a month, so simply holding
      // anything printed money; now the edge has to come from the tip you were given.
      const strong = Math.random() < 0.18;
      const min = strong ? -25 : -12, max = strong ? 24 : 12;
      rolled[stock.id] = Math.floor(min + Math.random() * (max - min + 1));
    });
    return rolled;
  }

  function updateStocks() {
    const changes = state.pendingStock && Object.keys(state.pendingStock).length
      ? state.pendingStock
      : rollStockChanges();
    STOCKS.forEach(stock => {
      const entry = state.stockPrices[stock.id];
      const change = changes[stock.id] ?? 0;
      entry.price = Math.max(5, Math.round(entry.price * (1 + change / 100)));
      entry.change = change;
    });
    // Next month's move was already promised to anyone holding a tip, so it becomes
    // this month's and a fresh one is rolled two months out.
    state.pendingStock = state.nextStock && Object.keys(state.nextStock).length ? state.nextStock : rollStockChanges();
    state.nextStock = rollStockChanges();
    return changes;
  }

  function endMonth(slept) {
    if (!playing) return;
    playing = false;
    paused = true;
    closeModal();
    const house = HOUSES.find(item => item.id === state.houseId);
    const report = [...state.monthLog];

    // Sleeping is what resets you properly; collapsing outdoors carries into next month.
    state.sleptLastMonth = !!slept;
    if (slept) {
      report.push({ label: "回家睡觉", text: `下个月动力回满 ${ENERGY.monthStart}` });
    } else {
      report.push({ label: "没回家睡觉", text: `下个月开局只有 ${ENERGY.monthStart - ENERGY.noSleepPenalty} 动力` });
    }
    // Deducting here would hit an energy pool that is usually already spent, so bank
    // the penalty and take it out of next month's opening balance instead.
    state.pendingEnergyPenalty = state.flags.food ? 0 : 10;
    if (state.pendingEnergyPenalty) report.push({ label: "本月一餐都没吃", text: `下个月开局再扣 ${state.pendingEnergyPenalty} 动力` });

    // Rent is yours to pay at the bank. If you did, this is just a line in the report;
    // if you did not, the landlord comes round and takes the bank, then your pocket,
    // and only what is still missing after that turns into debt.
    if (state.rentPaid) {
      report.push({ label: "房租（已在银行交了）", text: money(currentRent()) });
    } else {
      const { rent, fromWallet, shortfall } = chargeRent();
      if (shortfall <= 0) {
        state.missedRentStreak = 0;
        report.push({ label: "房东上门收租", amount: -rent, text: "从钱包掏的现金", positive: false });
      } else {
        state.debt += shortfall;
        state.missedRentStreak += 1;
        report.push({ label: `房租不足（连续${state.missedRentStreak}月）`, amount: -fromWallet, text: `新增债务${money(shortfall)}`, positive: false });
      }
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
    const finished = state.month >= TOTAL_MONTHS;
    // ROI locks money up for a month, and there is no month eight to unlock it in. With
    // ROI now required every month, leaving it in there would mean the last month is a
    // tax you cannot avoid, so the final report settles whatever is still out.
    if (finished && state.pendingROI.length) {
      state.pendingROI.forEach(item => {
        state.bank += item.payout;
        report.push({ label: `${item.name}提前结算`, amount: item.payout, positive: true });
      });
      state.pendingROI = [];
    }
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
      <button id="next-month" class="pixel-btn ${failed ? "danger" : "primary"}" style="width:100%">${failed ? "面对破产" : finished ? `查看${TOTAL_MONTHS}个月结局` : `开始第${state.month + 1}月`}</button>`, { closable: false, wide: true, locked: true });
    $("#next-month").addEventListener("click", () => {
      closeModal({ force: true });
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
    if (bankrupt) { title = "钱包正式投降"; art = "💸"; message = "哎呀，你真的撑不到月底了。下次记得先把房租的现金留在钱包。"; }
    else if (assets >= 9000) { title = "钱包战神"; art = "👑"; message = "十二个月过去，月底看到你都绕路走。"; }
    else if (assets >= 6500) { title = "投资勇者"; art = "🚀"; message = "你把工资、运气和一点胆量变成了真正的资产。"; }
    else if (assets >= 4000) { title = "银行常客"; art = "🏦"; message = "你可能不富，但你至少每个月都把房租准时交到房东手上。"; }
    $("#ending-kicker").textContent = bankrupt ? "游戏失败" : `${TOTAL_MONTHS}个月结束`;
    $("#ending-title").textContent = title;
    $("#ending-art").textContent = art;
    $("#ending-message").textContent = message;
    $("#ending-assets").textContent = money(assets);
  }

  const COLLECTION_ART_PREFIXES = { "命运卡": "fate", "工作卡": "work", "兼职卡": "parttime", "一次性物品": "tool", "食物卡": "food", "娱乐卡": "fun", "股票卡": "stock", "ROI卡": "roi", "永久物品": "luck" };

  function collectionArtKey(category, item) {
    // Some goods borrow another card's picture (the shoes are drawn on the tool sheet).
    return item.art || `${COLLECTION_ART_PREFIXES[category]}:${item.id}`;
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

  // --- thieves -------------------------------------------------------------------
  // The wallet/bank split had no teeth: rent comes out of the bank, so cash in hand
  // was never at risk and there was no reason to make the trip to deposit it. A thief
  // who empties only the wallet turns "should I bank this?" into a real question that
  // follows you all twelve months.
  const THIEF = {
    firstMonth: 3,          // months 1-2 are for learning the town
    secondMonth: 6,         // a second one from here on, on a seven-month clock
    // Always slower than a rested player (152), but he picks up as the day wears on -
    // and you slow down as energy drains, so the two curves cross at night. Morning he
    // is a nuisance you jog away from; at night, tired, he is on your heels.
    speedByPhase: { morning: 0.58, afternoon: 0.66, night: 0.74 },
    // The second one is an old hand who does not run any more. He is a threat only if
    // you walk into him, which keeps two thieves from feeling like a wall of them.
    slowpokeFactor: 0.45,
    // He sees less once it is dark, which is the counterweight to being quicker then.
    sightByPhase: { morning: 155, afternoon: 155, night: 100 },
    sightConeDeg: 35,
    noticeRadius: 74,       // bump into him and he does not need to be looking
    turnRate: 0.7,          // rad/s the gaze drifts, so there is no permanent blind side
    catchRadius: 24,
    spotFreeze: 0.45,       // he gawks for a beat before giving chase
    scanPeriod: 2.4,        // seconds for one full look left-and-right
    scanSweepDeg: 55,
    respawnDelay: 20
  };

  function thiefCountForMonth() {
    if (state.month >= THIEF.secondMonth) return 2;
    if (state.month >= THIEF.firstMonth) return 1;
    return 0;
  }

  function spawnThief() {
    for (let tries = 0; tries < 300; tries++) {
      const x = 24 + Math.random() * 900;
      const y = 30 + Math.random() * 470;
      if (!isRoad(x, y)) continue;
      // never materialise on top of the player
      if (Math.hypot(x - state.player.x, y - state.player.y) < 300) continue;
      return { x, y, baseDir: Math.random() * Math.PI * 2, dir: 0, mode: "idle", timer: Math.random() * THIEF.scanPeriod };
    }
    return null;
  }

  function updateThieves(delta) {
    if (!state || !playing) return;
    // Indoors you are simply safe: he is gone, and a new one turns up later elsewhere.
    if (state.scene !== "town" || !thiefCountForMonth()) {
      if (state.thieves.length) { state.thieves = []; state.thiefRespawn = THIEF.respawnDelay; }
      return;
    }

    state.thiefRespawn -= delta;
    if (state.thieves.length < thiefCountForMonth() && state.thiefRespawn <= 0) {
      const born = spawnThief();
      // There is always exactly one runner; any second is the slow one, so month 6
      // adds pressure without doubling the speed you are running from. Keyed off who
      // is actually out there, not spawn order, so robbing the runner does not leave
      // two slowpokes (or, worse, promote the slowpoke).
      if (born) { born.slow = state.thieves.some(other => !other.slow); state.thieves.push(born); }
      state.thiefRespawn = THIEF.respawnDelay;
    }

    const baseSpeed = 152 * THIEF.speedByPhase[dayPhase()];
    for (const thief of state.thieves) {
      const speed = baseSpeed * (thief.slow ? THIEF.slowpokeFactor : 1);
      thief.timer += delta;
      const toPlayer = Math.atan2(state.player.y - thief.y, state.player.x - thief.x);
      const distance = Math.hypot(state.player.x - thief.x, state.player.y - thief.y);

      if (thief.mode === "idle") {
        // head sweeps left and right; he only notices what he happens to be facing
        // The sweep oscillated around a fixed heading, which left a permanent
        // 180-degree blind side you could stand in untouched. The heading itself now
        // drifts, so he comes round to everything eventually.
        thief.baseDir += THIEF.turnRate * delta;
        thief.dir = thief.baseDir + Math.sin(thief.timer / THIEF.scanPeriod * Math.PI * 2) * (THIEF.scanSweepDeg * Math.PI / 180);
        const offset = Math.abs(((toPlayer - thief.dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const inView = distance < THIEF.sightByPhase[dayPhase()] && offset < THIEF.sightConeDeg * Math.PI / 180;
        if (inView || distance < THIEF.noticeRadius) {
          thief.mode = "spotted";
          thief.timer = 0;
          state.shake = 0.35;
          beep(180, .18, "sawtooth", .05);
          setTimeout(() => beep(300, .12, "square", .04), 120);
        }
        continue;
      }

      if (thief.mode === "spotted") {
        thief.dir = toPlayer;
        if (thief.timer >= THIEF.spotFreeze) { thief.mode = "chase"; thief.timer = 0; }
        continue;
      }

      thief.dir = toPlayer;
      const step = speed * delta;
      const nextX = clamp(thief.x + Math.cos(toPlayer) * step, 14, 946);
      const nextY = clamp(thief.y + Math.sin(toPlayer) * step, 18, 520);
      if (!isTownBlocked(nextX, thief.y)) thief.x = nextX;
      if (!isTownBlocked(thief.x, nextY)) thief.y = nextY;

      if (distance < THIEF.catchRadius) robPlayer(thief);
    }
  }

  function robPlayer(thief) {
    state.thieves = state.thieves.filter(item => item !== thief);
    state.thiefRespawn = THIEF.respawnDelay;
    state.shake = 0.5;

    if (state.sprayCharges > 0) {
      state.sprayCharges -= 1;
      beep(880, .16, "square", .05);
      updateHUD();
      simpleMessage("防身喷雾救了你", "你闭着眼睛一顿乱喷。他捂着脸跑了，钱包还在。", "🧴");
      return;
    }
    if (state.wallet <= 0) {
      beep(220, .2, "sawtooth", .04);
      simpleMessage("他白跑一趟", "他翻了翻你的口袋，一张钞票都没有，骂骂咧咧地走了。", "🕵️");
      return;
    }
    const taken = Math.round(state.wallet);
    state.wallet = 0;
    state.monthLog.push({ label: "被小偷抢走", amount: -taken, positive: false });
    beep(140, .3, "sawtooth", .06);
    updateHUD();
    simpleMessage("你被盗了", `他抢走了钱包里的全部${money(taken)}就跑了。<br><strong>银行里的钱他碰不到。</strong>`, "💸");
  }

  function drawThieves() {
    for (const thief of state.thieves) {
      const directionX = Math.cos(thief.dir);
      const directionY = Math.sin(thief.dir);
      const row = Math.abs(directionX) > Math.abs(directionY)
        ? (directionX >= 0 ? 2 : 1)
        : (directionY >= 0 ? 0 : 3);
      const column = thief.mode === "spotted"
        ? 7
        : thief.mode === "chase"
          ? 1 + Math.floor(performance.now() / 95) % 6
          : 0;
      const hasThiefArt = ART.thief.complete && ART.thief.naturalWidth;
      // Keep the old darkened NPC as a loading/failure fallback only.
      const previous = ctx.filter;
      if (!hasThiefArt) ctx.filter = "brightness(0.42) saturate(0.55) contrast(1.15)";
      const drawn = drawSpriteCell(hasThiefArt ? ART.thief : ART.npcs,
        hasThiefArt ? column : NPC_COLUMNS.parttime,
        hasThiefArt ? row : 0,
        hasThiefArt ? 8 : 9,
        hasThiefArt ? 4 : 2,
        thief.x, thief.y, 62);
      ctx.filter = previous;
      if (!drawn) {
        ctx.fillStyle = "#1d1730";
        ctx.fillRect(thief.x - 13, thief.y - 46, 26, 46);
      }
      if (thief.mode === "spotted" && !hasThiefArt) {
        ctx.fillStyle = "#ff4b5c";
        ctx.font = "bold 30px monospace";
        ctx.textAlign = "center";
        ctx.fillText("!", thief.x, thief.y - 56);
      }
    }
  }

  function drawTown() {
    // A short shove of the camera when he spots you, and again when he gets you.
    let shaking = false;
    if (state.shake > 0) {
      state.shake = Math.max(0, state.shake - 0.016);
      const power = state.shake * 14;
      ctx.save();
      ctx.translate((Math.random() - .5) * power, (Math.random() - .5) * power);
      shaking = true;
    }
    const phase = dayPhase() === "morning" ? "day" : dayPhase() === "afternoon" ? "sunset" : "night";
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
    drawThieves();
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
    // Last, so the night tint never dims it and the player never covers it.
    drawNameplate();
    if (shaking) ctx.restore();
  }

  // Pops the building's name over its roof as you walk up to it. This is the only
  // place label on small screens (the street signposts are hidden there), so it has
  // to work without them.
  let nameplate = { id: null, since: 0 };

  function nameplateTarget() {
    if (!state || state.scene !== "town") return null;
    const target = findNearbyTarget();
    if (!target) return null;
    if (target.id === "parttime") return { id: target.id, text: `${BOARD.icon} ${BOARD.label}`, cx: BOARD.x, topY: BOARD.y - 30 };
    if (target.w) return { id: target.id, text: `${target.icon} ${target.label}`, cx: target.x + target.w / 2, topY: target.y };
    return null;
  }

  function drawNameplate() {
    const target = nameplateTarget();
    if (!target) { nameplate.id = null; return; }
    if (nameplate.id !== target.id) nameplate = { id: target.id, since: performance.now() };
    const progress = clamp((performance.now() - nameplate.since) / 190, 0, 1);
    const ease = 1 - Math.pow(1 - progress, 3);

    ctx.save();
    ctx.font = "bold 19px monospace";
    const width = ctx.measureText(target.text).width + 28;
    const height = 34;
    const lift = Math.max(target.topY - 18, height / 2 + 10);
    ctx.globalAlpha = ease;
    ctx.translate(target.cx, lift + (1 - ease) * 14);
    ctx.scale(0.82 + 0.18 * ease, 0.82 + 0.18 * ease);

    ctx.fillStyle = "rgba(255,216,96,.97)";
    ctx.strokeStyle = "#241d35";
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-width / 2, -height / 2, width, height, 10);
    else ctx.rect(-width / 2, -height / 2, width, height);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();                                  // little tail pointing at the roof
    ctx.moveTo(-9, height / 2 - 1);
    ctx.lineTo(9, height / 2 - 1);
    ctx.lineTo(0, height / 2 + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#241d35";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(target.text, 0, 1);
    ctx.restore();
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
    // When you're here, the nameplate over the roof says it - no need to say it twice.
    if (!compactMobile && !near) drawSignpost(`${building.icon} ${building.label}`, building.x + building.w / 2 + (building.labelDX || 0), door.y + 24, false);
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
    if (!compactMobile && !near) drawSignpost(`${BOARD.icon} ${BOARD.label}`, BOARD.x, BOARD.y + 34, false);
    if (near) {
      ctx.strokeStyle = "rgba(255,214,90,.9)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(BOARD.x, BOARD.y, 20, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawTree(x, y, phase) {
    ctx.fillStyle = "#6b432e"; ctx.fillRect(x, y, 7, 20);
    ctx.fillStyle = phase === "night" ? "#28564b" : "#397c45"; ctx.fillRect(x - 9, y - 16, 25, 24); ctx.fillRect(x - 3, y - 24, 14, 12);
  }

  // Interiors are a conversation, not a room. Walking across a one-purpose shop cost
  // energy and changed nothing, so the player and the shopkeeper simply stand facing
  // each other at the same height, and a menu handles interact/leave.
  function drawInterior() {
    const building = buildingList().find(item => item.id === state.interiorId);
    const panel = INTERIOR_PANELS[state.interiorId];
    const useArt = panel && ART.interiors.complete && ART.interiors.naturalWidth;

    ctx.fillStyle = "#2b2338";
    ctx.fillRect(0, 0, 960, 540);
    if (useArt) {
      const cellW = ART.interiors.naturalWidth / 5;
      const cellH = ART.interiors.naturalHeight / 2;
      drawCover(ART.interiors, panel[0] * cellW, panel[1] * cellH, cellW, cellH, 0, 0, 960, 540);
    }
    // Push the backdrop back so the two characters read as the foreground.
    ctx.fillStyle = "rgba(24,18,40,.36)";
    ctx.fillRect(0, 0, 960, 540);

    // Placed close together on purpose: the portrait camera shows roughly the middle
    // 350px of the canvas, and both figures have to stay inside that window.
    const groundY = 486;
    const figureHeight = 372;
    drawNPC(586, groundY, building?.id, figureHeight);
    drawPlayerPortrait(374, groundY, figureHeight);

  }

  // The walking sheet's side-on frame, drawn big enough to match the NPC.
  function drawPlayerPortrait(x, groundY, height) {
    if (drawSpriteCell(ART.player, 0, 2, 8, 4, x, groundY, height)) return;
    ctx.fillStyle = "#657fd1";
    ctx.fillRect(x - 30, groundY - height, 60, height);
  }

  function drawNPC(x, y, id, height = 190) {
    const col = NPC_COLUMNS[id] ?? NPC_COLUMNS.work;
    const row = Math.floor(performance.now() / 900) % 2;
    if (drawSpriteCell(ART.npcs, col, row, 9, 2, x, y, height)) return;
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
    // canvas.width is the device-pixel backing store, not the 960-wide scene the
    // player's coordinates live in. Dividing by it put the camera in the wrong place
    // and left the player just off the edge of the screen.
    const renderedWidth = canvas.clientHeight * (SCENE_W / SCENE_H);
    const focusX = state.scene === "town" ? state.player.x : SCENE_W / 2;
    const desiredLeft = stage.clientWidth / 2 - (focusX / SCENE_W) * renderedWidth;
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
      updateHUD();
    } else if (state) {
      state.player.moving = false;
      movementVelocity.x = 0;
      movementVelocity.y = 0;
    }

    if (state && !screens.game.hidden) {
      // Two watchdogs, because being stranded with nothing to press is the worst
      // failure this game has. Whatever drained the last point, the month ends here;
      // and if an errand ever leaves the counter closed while you are still indoors,
      // put it back rather than trapping the player behind a blank screen.
      if (playing && state.motivation <= 0) collapseFromExhaustion();
      else if (playing && state.scene === "interior" && modalLayer.hidden && $("#counter-bar").hidden) {
        const here = buildingList().find(item => item.id === state.interiorId);
        if (here) showCounter(here);
      }
      advanceDayPhase();
      updateThieves(delta);
      fitCanvasToDisplay();
      if (state.scene === "town") drawTown(); else drawInterior();
      updateCamera();
      nearbyTarget = findNearbyTarget();
      const hint = $("#interaction-hint");
      hint.hidden = !nearbyTarget || paused;
      hint.textContent = nearbyTarget ? `进去 · ${nearbyTarget.label}` : "";
      const canAct = !!nearbyTarget && !paused && state.scene === "town";
      $("#mobile-action").classList.toggle("inactive", !canAct);
      $("#mobile-action").textContent = canAct ? "进入" : "Click";
      $(".month-checklist").hidden = state.scene !== "town";
      // Outdoors the roof nameplate already names whatever you're standing at, so the
      // chip stays on the town name and gets out of the way while a plate is showing.
      if (state.scene === "town") {
        const chip = $("#location-label");
        chip.textContent = "巴生小镇";
        chip.hidden = !!nearbyTarget;
      } else {
        $("#location-label").hidden = false;
      }
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
        const phaseBoost = dayPhase() === "night" ? 1.18 : dayPhase() === "afternoon" ? 1.08 : 1;
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
    $("#help-btn").addEventListener("click", () => simpleMessage("控制方法", "WASD或方向键走路，E或空格互动。手机用屏幕方向键和右下角按钮。走路和做事都会扣动力，动力归零本月就结束。", "🎮"));
    modalClose.addEventListener("click", closeModal);
    $("#mobile-action").addEventListener("pointerdown", event => { event.preventDefault(); interact(); });
    $("#counter-act").addEventListener("click", () => {
      const building = buildingList().find(item => item.id === state?.interiorId);
      if (building) openBuildingInteraction(building.id);
    });
    $("#counter-leave").addEventListener("click", leaveInterior);
    // On a desktop the prompt is a button you can click, not just a reminder that the
    // E key exists.
    $("#interaction-hint").addEventListener("click", interact);

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

    // Holding a control on a phone used to raise the OS copy/paste/share bar, which
    // ate the press and left the player stuck. CSS user-select alone does not stop
    // it on Android, so the long-press gestures are cancelled here too.
    const swallow = event => event.preventDefault();
    for (const node of [$("#game-screen"), $(".mobile-controls"), $(".hud"), canvas]) {
      if (!node) continue;
      node.addEventListener("contextmenu", swallow);
      node.addEventListener("selectstart", swallow);
      node.addEventListener("dragstart", swallow);
    }
    // Scoped to the D-pad only: preventDefault on touchstart also cancels the
    // synthesized click, which would kill the action button below.
    $$('[data-move]').forEach(button => {
      button.addEventListener("touchstart", swallow, { passive: false });
      button.addEventListener("touchmove", swallow, { passive: false });
    });
  }

  // Opt-in, read-only snapshot for browser tests. Without it a test can only infer the
  // world from what happens to be painted, which made several bugs here very slow to
  // pin down. Off unless the page is opened with ?debug=1.
  if (location.search.includes("debug")) {
    window.__peek = () => !state ? null : {
      month: state.month, wallet: state.wallet, bank: state.bank, debt: state.debt,
      energy: Math.round(state.motivation), spent: Math.round(state.energySpent),
      phase: dayPhase(), scene: state.scene, playing,
      player: { x: Math.round(state.player.x), y: Math.round(state.player.y) },
      thieves: state.thieves.map(t => ({ x: Math.round(t.x), y: Math.round(t.y), mode: t.mode })),
      spray: state.sprayCharges,
      thiefRespawn: Math.round((state.thiefRespawn || 0) * 10) / 10,
      wanted: thiefCountForMonth(),
      thievesType: Array.isArray(state.thieves) ? "array" : typeof state.thieves,
      rent: currentRent(),
      items: [...state.permanentItems],
      tools: [...state.tempTools],
      tips: Object.keys(state.stockTips || {}),
      pendingStock: { ...(state.pendingStock || {}) },
      nextStock: { ...(state.nextStock || {}) },
      stockChange: Object.fromEntries(STOCKS.map(item => [item.id, state.stockPrices[item.id].change]))
    };
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
