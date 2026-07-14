import "./styles.css";
// judo3d main.js —— UI 接線+播報(字幕+mp3 人聲)
// P1:A/D 進退、J 輕拳、K 重拳、S(按住)格擋、空白鍵(按住)蓄氣放開必殺。
// 雙人 P2:←→、1 輕拳、2 重拳、0(按住)格擋、Enter(按住)蓄氣。V 視角。
import { JudoGame, DIFFICULTY_PRESETS, GAME_MODES } from "./game.js";
import { AudioManager } from "./audio.js";
import { loadSettings, saveSettings } from "./storage.js";
import { speakLine, setVoiceEnabled } from "./voice.js";
import { SCRIPTURES } from "./voicePhrases.js";

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $("gameCanvas"),
  homeStamina: $("homeStamina"), awayStamina: $("awayStamina"),
  homeCharge: $("homeCharge"), awayCharge: $("awayCharge"),
  homeName: $("homeName"), awayName: $("awayName"),
  roundLabel: $("roundLabel"), winsLabel: $("winsLabel"),
  statusMessage: $("statusMessage"), commentaryBar: $("commentaryBar"), koFlash: $("koFlash"),
  touchLight: $("touchLight"), touchHeavy: $("touchHeavy"), touchKick: $("touchKick"), touchBlock: $("touchBlock"), touchSpecial: $("touchSpecial"),
  menuButton: $("menuButton"), audioButton: $("audioButton"), cameraButton: $("cameraButton"),
  matchOverlay: $("matchOverlay"), overlayTitle: $("overlayTitle"), overlayText: $("overlayText"),
  overlayMenuButton: $("overlayMenuButton"), overlayReplayButton: $("overlayReplayButton"),
  homeScreen: $("homeScreen"), modeCardGrid: $("modeCardGrid"),
  roundsSelect: $("roundsSelect"), difficultySelect: $("difficultySelect"), audioSelect: $("audioSelect"),
  startMatchButton: $("startMatchButton"),
};

const settings = loadSettings();
let selectedMode = GAME_MODES[settings.modeId] ? settings.modeId : "vsai";
let selectedDifficulty = DIFFICULTY_PRESETS[settings.difficulty] ? settings.difficulty : "easy";
let selectedRounds = [1, 3, 5].includes(settings.rounds) ? settings.rounds : 3;
let audioEnabled = settings.audioEnabled !== false;

const audio = new AudioManager();
audio.setEnabled(audioEnabled);
setVoiceEnabled(audioEnabled);

const game = new JudoGame({ canvas: ui.canvas });
window.__judo3d = game; // dev hook

function pushCommentary(sub, tone = "info", say = "") {
  const bar = ui.commentaryBar;
  if (!bar || !sub) return;
  bar.hidden = false;
  bar.dataset.tone = tone;
  bar.textContent = sub;
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
  if (say) speakLine(say);
}
const sideLabel = (s) => (game.modeId === "duel2p" ? (s === "home" ? "P1" : "P2") : (s === "home" ? "雅各" : "那人"));

game.onEvent = (event) => {
  switch (event.type) {
    case "match-start":
      audio.whistle();
      audio.startCrowd(); // 觀眾環境人聲(07-11 鐵則:觀眾要有聲音)
      pushCommentary("雅博渡口,只剩下雅各一人——有一個人來和他摔跤,直到黎明。(創32:24)", "info", SCRIPTURES[1]); // 開幕經文自動朗讀(曉臻)
      break;
    case "fight":
      audio.uiTap();
      pushCommentary(`第 ${event.round} 回合——開始!`, "hot", "開始!");
      break;
    case "final-round":
      pushCommentary("平手!最後一回合!", "hot", "最後一回合!");
      break;
    case "swing":
      audio.kick(event.move === "special" ? 0.9 : event.move === "heavy" ? 0.6 : 0.35);
      break;
    case "whiff":
      audio.bounce();
      break;
    case "blocked":
      audio.steal();
      pushCommentary(`${sideLabel(event.side)} 穩穩格住!`, "cool", "");
      break;
    case "blocked-stagger":
      audio.steal();
      pushCommentary(`${sideLabel(event.side)} 格擋成功——對手露出破綻!`, "hot", "格擋得漂亮!");
      break;
    case "throw": {
      audio.kick(0.9);
      audio.vibrate([40, 30, 60]);
      pushCommentary(event.ippon ? "大外摔——飛出去了!" : "過肩摔——漂亮的入身!", "hot", event.ippon ? "大外摔,飛出去了!" : "漂亮的過肩摔!");
      break;
    }
    case "throw-land": {
      audio.kick(1);
      audio.crowdCheer(1);
      audio.vibrate([60, 40, 90]);
      pushCommentary("一本!!", "hot", "一本!");
      break;
    }
    case "hit": {
      audio.thud ? audio.thud(0.6) : audio.kick(0.5);
      if (event.move === "special" || event.counter) audio.crowdCheer(0.8); // 必殺/反擊=喝采浪
      const w = sideLabel(event.side);
      if (event.move === "special") pushCommentary(`${w} 旋風必殺命中!−${event.dmg} 點!`, event.side === "home" ? "hot" : "cool", "必殺技命中!");
      else if (event.move === "kick") pushCommentary(`${w} 飛踢命中!−${event.dmg} 點!`, event.side === "home" ? "hot" : "cool", "飛踢命中!");
      else if (event.counter) pushCommentary(`${w} 抓住空檔反擊!−${event.dmg} 點!`, event.side === "home" ? "hot" : "cool", "精彩的反擊!");
      else pushCommentary(`${w} 命中!−${event.dmg} 點`, event.side === "home" ? "hot" : "cool", "");
      break;
    }
    case "status":
      pushCommentary(event.text, "info", "");
      break;
    case "round-end": {
      audio.cheer();
      audio.crowdCheer(1); // 回合分出勝負=最大喝采浪
      ui.koFlash.hidden = false;
      ui.koFlash.textContent = "力竭!";
      ui.koFlash.style.animation = "none";
      void ui.koFlash.offsetWidth;
      ui.koFlash.style.animation = "";
      setTimeout(() => { ui.koFlash.hidden = true; }, 1400);
      pushCommentary(`${sideLabel(game.other(event.winner))} 力竭坐地——本回合 ${sideLabel(event.winner)} 拿下!`, event.winner === "home" ? "hot" : "cool", "力竭了,休息一下!");
      break;
    }
    case "match-end":
      if (event.winner === "home" && game.modeId !== "duel2p") setTimeout(() => speakLine(SCRIPTURES[0]), 2600); // 終幕經文自動朗讀(曉臻)
      audio.horn(); audio.cheer(); audio.crowdCheer(1);
      ui.matchOverlay.classList.add("visible");
      ui.overlayTitle.textContent = event.title;
      ui.overlayText.textContent = event.text;
      pushCommentary("勝負已分!雙方抱拳!", "hot", "勝負已分!");
      break;
    default:
      break;
  }
};

game.onHud = (s) => {
  ui.homeStamina.style.transform = `scaleX(${s.home.stamina / 100})`;
  ui.awayStamina.style.transform = `scaleX(${s.away.stamina / 100})`;
  ui.homeCharge.style.transform = `scaleX(${Math.min(1, s.home.charge / 0.8)})`;
  ui.awayCharge.style.transform = `scaleX(${Math.min(1, s.away.charge / 0.8)})`;
  ui.homeCharge.classList.toggle("full", s.home.charge >= 0.8);
  { // 07-14 拍板:中下方大蓄力條(按住空白鍵看得到力道長大)
    const bp = document.getElementById("bigPower"), bf = document.getElementById("bigPowerFill");
    if (bp) {
      bp.hidden = !(s.home.charge > 0.03);
      bf.style.transform = `scaleX(${Math.min(1, s.home.charge / 0.8)})`;
      bf.classList.toggle("full", s.home.charge >= 0.8);
    }
  }
  ui.awayCharge.classList.toggle("full", s.away.charge >= 0.8);
  ui.roundLabel.textContent = `R${s.round}/${s.totalRounds}`;
  ui.winsLabel.textContent = `${s.wins.home} - ${s.wins.away}`;
  ui.statusMessage.textContent = s.message;
  ui.homeName.textContent = game.modeId === "duel2p" ? "P1(藍)" : "你(藍)";
  ui.awayName.textContent = game.modeId === "duel2p" ? "P2" : "那人(天使)";
};

// ── 鍵盤 ──
window.addEventListener("keydown", (e) => {
  if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (["Space", "ArrowLeft", "ArrowRight", "Enter"].includes(e.code)) e.preventDefault();
  if (game.phase === "menu" || game.phase === "done") return;
  audio.unlock();
  const solo = game.modeId !== "duel2p";
  if (e.code === "KeyA") game.controls.p1.left = true;
  if (e.code === "KeyD") game.controls.p1.right = true;
  const p2 = solo ? game.controls.p1 : game.controls.p2;
  if (e.code === "ArrowLeft") p2.left = true;
  if (e.code === "ArrowRight") p2.right = true;
  if (!e.repeat) {
    if (e.code === "KeyJ") game.attack("home", "light");
    if (e.code === "KeyK") game.attack("home", "heavy");
    if (e.code === "KeyL") game.attack("home", "kick");
    if (e.code === "KeyS") game.setBlock("home", true);
    if (e.code === "Space") game.setCharge("home", true);
    if (e.code === "Digit1") game.attack(solo ? "home" : "away", "light");
    if (e.code === "Digit2") game.attack(solo ? "home" : "away", "heavy");
    if (e.code === "Digit3") game.attack(solo ? "home" : "away", "kick");
    if (e.code === "Digit0") game.setBlock(solo ? "home" : "away", true);
    if (e.code === "Enter") game.setCharge(solo ? "home" : "away", true);
    if (e.code === "KeyV") game.cycleCamView();
  }
});
window.addEventListener("keyup", (e) => {
  const solo = game.modeId !== "duel2p";
  if (e.code === "KeyA") game.controls.p1.left = false;
  if (e.code === "KeyD") game.controls.p1.right = false;
  const p2 = solo ? game.controls.p1 : game.controls.p2;
  if (e.code === "ArrowLeft") p2.left = false;
  if (e.code === "ArrowRight") p2.right = false;
  if (e.code === "KeyS") game.setBlock("home", false);
  if (e.code === "Space") game.setCharge("home", false);
  if (e.code === "Digit0") game.setBlock(solo ? "home" : "away", false);
  if (e.code === "Enter") game.setCharge(solo ? "home" : "away", false);
});
window.addEventListener("blur", () => {
  game.controls.p1.left = game.controls.p1.right = false;
  game.controls.p2.left = game.controls.p2.right = false;
  game.setBlock("home", false);
  game.setCharge("home", false);
});

// 觸控
ui.touchLight.addEventListener("pointerdown", (e) => { e.preventDefault(); audio.unlock(); game.attack("home", "light"); });
ui.touchHeavy.addEventListener("pointerdown", (e) => { e.preventDefault(); audio.unlock(); game.attack("home", "heavy"); });
ui.touchKick.addEventListener("pointerdown", (e) => { e.preventDefault(); audio.unlock(); game.attack("home", "kick"); });
ui.touchBlock.addEventListener("pointerdown", (e) => { e.preventDefault(); audio.unlock(); game.setBlock("home", true); });
ui.touchBlock.addEventListener("pointerup", (e) => { e.preventDefault(); game.setBlock("home", false); });
ui.touchSpecial.addEventListener("pointerdown", (e) => { e.preventDefault(); audio.unlock(); game.setCharge("home", true); });
ui.touchSpecial.addEventListener("pointerup", (e) => { e.preventDefault(); game.setCharge("home", false); });

// HUD 鈕
ui.cameraButton.addEventListener("click", () => { audio.uiTap(); game.cycleCamView(); });
ui.menuButton.addEventListener("click", () => {
  audio.uiTap();
  audio.stopCrowd(); // 回選單:停觀眾環境音
  game.phase = "menu";
  ui.homeScreen.classList.add("visible");
  ui.matchOverlay.classList.remove("visible");
});
const setAudio = (on) => {
  audioEnabled = on;
  audio.setEnabled(on);
  setVoiceEnabled(on);
  ui.audioButton.textContent = on ? "音效開啟" : "音效靜音";
  persist();
};
ui.audioButton.addEventListener("click", () => setAudio(!audioEnabled));
ui.audioSelect.addEventListener("change", (e) => setAudio(e.target.value === "on"));

function persist() {
  saveSettings({ modeId: selectedMode, difficulty: selectedDifficulty, rounds: selectedRounds, audioEnabled });
}
function syncMenu() {
  for (const c of ui.modeCardGrid.querySelectorAll(".mode-card")) c.classList.toggle("selected", c.dataset.mode === selectedMode);
  ui.difficultySelect.value = selectedDifficulty;
  ui.roundsSelect.value = String(selectedRounds);
  ui.audioSelect.value = audioEnabled ? "on" : "off";
}
ui.modeCardGrid.addEventListener("click", (e) => {
  const card = e.target.closest(".mode-card");
  if (!card) return;
  audio.unlock(); audio.uiTap();
  selectedMode = card.dataset.mode;
  syncMenu();
});
ui.difficultySelect.addEventListener("change", (e) => { selectedDifficulty = e.target.value; persist(); });
ui.roundsSelect.addEventListener("change", (e) => { selectedRounds = Number(e.target.value); persist(); });

ui.startMatchButton.addEventListener("click", () => {
  audio.unlock(); audio.uiTap();
  persist();
  game.applyPresentation({ modeId: selectedMode, difficulty: selectedDifficulty, rounds: selectedRounds });
  ui.homeScreen.classList.remove("visible");
  ui.matchOverlay.classList.remove("visible");
  game.startMatch();
});
ui.overlayReplayButton.addEventListener("click", () => {
  audio.uiTap();
  ui.matchOverlay.classList.remove("visible");
  game.startMatch();
});
ui.overlayMenuButton.addEventListener("click", () => {
  audio.uiTap();
  ui.matchOverlay.classList.remove("visible");
  game.phase = "menu";
  ui.homeScreen.classList.add("visible");
});

const doResize = () => game.resize();
window.addEventListener("resize", doResize);
syncMenu();
doResize();
game.startLoop();
