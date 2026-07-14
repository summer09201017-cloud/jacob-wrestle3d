// 播報詞庫(固定唸稿)+voiceKey——烤製與 runtime 共用(人聲鐵律)。
export function voiceKey(text) {
  let h = 0x811c9dc5;
  const s = String(text).replace(/\s+/g, "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const PHRASES = [
  "開始!",
  "精彩的反擊!",
  "一本!",
  "漂亮的過肩摔!",
  "大外摔,飛出去了!",
  "受身漂亮!",
  "力竭了,休息一下!",
  "最後一回合!",
  "勝負已分!",
  "終場!比賽結束!",
  "摔跤到黎明,抓住不放!",
  "得勝了!你的名要叫以色列!",
  "天黎明了,再摔一回!",
];

// 經文朗讀(07-13 鐵則)——曉臻讀經;和合本 cuv 逐句查驗 2026-07-14
export const SCRIPTURES = [
  "那人說,你的名不要再叫雅各,要叫以色列。因為你與神與人較力,都得了勝。(創世記三十二章二十八節)",
  "只剩下雅各一人。有一個人來和他摔跤,直到黎明。(創世記三十二章二十四節)",
];
