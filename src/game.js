// 3D 柔道(judo3d,07-12 使用者拍板)——kungfu3d 底座+「擒抱→摔投」編排(fork)
// 溫和設計:運動化柔道——體勢點數制(不是血)、乾淨的一本、力竭=坐地喘氣、勝者鞠躬行禮。
// ★摔投=判定先擲再演軌跡(判定=畫面):命中當下邏輯位置先落定,畫面演「扛上肩→翻兩圈→對側俯臥」
//   關鍵影格,不用 ragdoll——可重現、乾淨、有戲。俯臥 1.2 秒自己爬起(won:true 溫柔規則)。
import * as THREE from "three";

export const DIFFICULTY_LABELS = { kids: "幼兒", child: "兒童", easy: "入門", normal: "標準", hard: "職業" };
// aggro=AI 每秒出手率;blockReact=AI 對預告的格擋率;special=AI 用必殺傾向
export const DIFFICULTY_PRESETS = {
  kids:   { aggro: 0.16, blockReact: 0.06, special: 0.03, dmgMul: 0.55 }, // 07-13 調弱:AI 靠更近後命中變高
  child:  { aggro: 0.28, blockReact: 0.15, special: 0.07, dmgMul: 0.68 },
  easy:   { aggro: 0.4,  blockReact: 0.26, special: 0.12, dmgMul: 0.78 },
  normal: { aggro: 0.75, blockReact: 0.55, special: 0.24, dmgMul: 1.0 },
  hard:   { aggro: 0.95, blockReact: 0.72, special: 0.34, dmgMul: 1.1 },
  hell:   { aggro: 1.6,  blockReact: 0.88, special: 0.5,  dmgMul: 1.6, boss: null }, // 地獄:天使全力(聖經皮不用勇次郎)
};
export const GAME_MODES = {
  vsai:   { id: "vsai",   label: "對戰 AI" },
  duel2p: { id: "duel2p", label: "雙人同機" },
};

const ARENA_HALF = 4.2;
// 柔道技(鍵名沿用底座:light=絆摔 heavy=過肩摔(可受身反制) kick=掃腿摔 special=蓄力大外摔)
// throw:true 的技命中=摔投編排;arc=拋弧高度倍率
const MOVES = {
  light:   { range: 1.2,  startup: 0.2,  dmg: [8, 12],  cd: 0.4,  stagger: 0,    blockedDmg: 1, throw: true, arc: 0.35, style: "trip" }, // 絆摔=原地絆倒(07-13 拍板:摔技要真摔)
  heavy:   { range: 1.1,  startup: 0.5,  dmg: [22, 28], cd: 1.0,  stagger: 0.7,  blockedDmg: 2, throw: true, arc: 1.0 },
  kick:    { range: 1.5,  startup: 0.3,  dmg: [12, 16], cd: 0.6,  stagger: 0,    blockedDmg: 2, throw: true, arc: 0.45, style: "trip" }, // 掃腿摔=掃倒
  special: { range: 1.4,  startup: 0.3,  dmg: [34, 42], cd: 1.2,  stagger: 0,    blockedDmg: 6, throw: true, arc: 1.45 },
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class JudoGame {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.onEvent = null;
    this.onHud = null;
    this.modeId = "vsai";
    this.difficulty = "easy";
    this.totalRounds = 3; // 三戰兩勝(量值:1/3/5)
    this.phase = "menu";  // menu | ready | fight | roundend | done
    this.controls = {
      p1: { left: false, right: false, block: false, charge: false },
      p2: { left: false, right: false, block: false, charge: false },
    };
    this.camView = 0;
    try {
      const saved = Number(localStorage.getItem("jacob-wrestle3d-camview"));
      if ([0, 1, 2, 3, 4].includes(saved)) this.camView = saved;
    } catch { /* ignore */ }
    this._setupScene();
    this._buildArena();
    this._buildFighters();
    this._hudTimer = 0;
  }

  get preset() { return DIFFICULTY_PRESETS[this.difficulty]; }
  emit(type, payload = {}) { if (this.onEvent) this.onEvent({ type, ...payload }); }
  _isHuman(side) { return side === "home" || this.modeId === "duel2p"; }
  other(side) { return side === "home" ? "away" : "home"; }

  _setupScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1020); // 毘努伊勒之夜
    this.camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.1, 100);
    this._camPos = new THREE.Vector3(0, 2.4, 7.6);
    this._camLook = new THREE.Vector3(0, 1.1, 0);
    this.scene.add(new THREE.AmbientLight(0xbcd0ee, 1.2)); // 月夜環境光
    const moonLight = new THREE.DirectionalLight(0xcfe0ff, 1.6);
    moonLight.position.set(-6, 10, 7);
    this.scene.add(moonLight);
    const fire = new THREE.PointLight(0xffa04a, 1.6, 12);
    fire.position.set(5.2, 1.0, -2.6);
    this.scene.add(fire);
  }

  _buildArena() {
    const g = new THREE.Group();
    // 河邊沙地
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_HALF * 2 + 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x9a8564, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    g.add(floor);
    // 摔跤圈(沙圈)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(ARENA_HALF - 0.05, ARENA_HALF + 0.05, 48),
      new THREE.MeshBasicMaterial({ color: 0xe8dcc0, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    ring.scale.set(1, 0.55, 1);
    g.add(ring);
    // 雅博溪(場後一條夜溪,微光)
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x1d4a73, roughness: 0.25, metalness: 0.4, emissive: 0x14344f, emissiveIntensity: 0.5 }),
    );
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, 0.02, -5.4);
    g.add(river);
    const farBank = new THREE.Mesh(
      new THREE.BoxGeometry(26, 0.7, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x4a3c2c, roughness: 1 }),
    );
    farBank.position.set(0, 0.35, -7.6);
    g.add(farBank);
    // 岸邊石頭
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.95 });
    for (const [x, z, s] of [[-5.6, -3.4, 0.55], [-4.2, -3.9, 0.35], [4.6, -3.6, 0.5], [6.2, -3.1, 0.4], [-6.8, -1.2, 0.45]]) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      rock.position.set(x, s * 0.55, z);
      rock.rotation.set(rand(0, 2), rand(0, 2), 0);
      g.add(rock);
    }
    // 營火(打發家人過河後留下的火堆)
    const fireG = new THREE.Group();
    for (let i = 0; i < 4; i += 1) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 1 }));
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 4) * Math.PI;
      log.position.y = 0.08;
      fireG.add(log);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 8), new THREE.MeshBasicMaterial({ color: 0xffb03a }));
    flame.position.y = 0.42;
    fireG.add(flame);
    const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 8), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
    flame2.position.set(0.08, 0.5, 0.05);
    fireG.add(flame2);
    fireG.position.set(5.2, 0, -2.6);
    g.add(fireG);
    // 月亮+星星
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 16), new THREE.MeshBasicMaterial({ color: 0xf2ecd8 }));
    moon.position.set(-7.5, 8.2, -14);
    g.add(moon);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff });
    const stars = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 5, 5), starMat, 130);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 130; i += 1) {
      const a = rand(-Math.PI * 0.75, Math.PI * 0.75);
      const rr = rand(11, 20);
      dummy.position.set(Math.sin(a) * rr, rand(2.5, 13), -Math.abs(Math.cos(a)) * rr - 3);
      dummy.scale.setScalar(rand(0.6, 1.6));
      dummy.updateMatrix();
      stars.setMatrixAt(i, dummy.matrix);
    }
    g.add(stars);
    this.crowd = null; // 「只剩下雅各一人」(創32:24)——無觀眾
    this.scene.add(g);
  }

  // 功夫拳手(面向 +z 建構,mesh.rotation.y 轉向對手)
  // ★07-12 拍板:全系列人物統一「3D 射箭男生的樣子」(關節人物鐵則全集,抄自 archery3d makePerson):
  // 雙節肢體(上臂+肘+前臂、大腿+膝+小腿+腳掌)、瘦腰+脖子、頭髮+耳朵、身短腿長。
  // 功夫特例:五指手(沒有手套)、隊色細頭帶+腰帶。動畫介面不變(userData 的 pivot)。
  _makeFighter(giColor, beltColor) {
    const g = new THREE.Group();
    const gi = new THREE.MeshStandardMaterial({ color: giColor, roughness: 0.85 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.8 }); // 道服褲也白(07-14 拍板:全身白)
    const skin = new THREE.MeshStandardMaterial({ color: 0xf2d8b0, roughness: 0.7, emissive: 0x8a7355, emissiveIntensity: 0.5 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x25201a });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.85 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x2b2119, roughness: 0.85 });
    

    // 雙節肢體(archery3d createLimb 範式;end: glove=拳套 / foot=腳掌)
    const mkLimb = ({ upperMat, lowerMat, upperLen, lowerLen, upperR, lowerR, end }) => {
      const pivot = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(upperR, upperLen, 4, 8), upperMat);
      upper.position.y = -upperLen / 2;
      pivot.add(upper);
      const joint = new THREE.Group();
      joint.position.y = -upperLen;
      pivot.add(joint);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(lowerR, lowerLen, 4, 8), lowerMat);
      lower.position.y = -lowerLen / 2;
      joint.add(lower);
      if (end === "foot") {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(lowerR * 2.1, lowerR, lowerR * 3.4), shoeMat);
        foot.position.set(0, -lowerLen - lowerR * 0.4, lowerR * 0.9);
        joint.add(foot);
      } else {
        // 五指手(07-12 拍板不要圓球手)
        const r = lowerR;
        const hand = new THREE.Group();
        hand.position.y = -lowerLen - r * 0.2;
        const palm = new THREE.Mesh(new THREE.BoxGeometry(r * 2.2, r * 1.7, r * 1.0), skin);
        palm.position.y = -r * 0.85;
        hand.add(palm);
        for (let i = 0; i < 4; i += 1) {
          const finger = new THREE.Mesh(new THREE.BoxGeometry(r * 0.44, r * 1.25, r * 0.55), skin);
          finger.position.set((i - 1.5) * r * 0.54, -r * 2.1, 0);
          finger.rotation.x = 0.14;
          hand.add(finger);
        }
        const thumb = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 1.0, r * 0.55), skin);
        thumb.position.set(r * 1.3, -r * 0.95, r * 0.1);
        thumb.rotation.z = -0.55;
        hand.add(thumb);
        joint.add(hand);
      }
      return { pivot, joint };
    };

    // 身體:胸腔(短)+腰收細+髖直筒(男)+腰帶(隊色)+脖子
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.76, 0.32), gi);
    chest.position.y = 1.42;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.2, 12), skin);
    neck.position.y = 1.88;
    const waist = new THREE.Group();
    waist.position.y = 1.16;
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.27), gi);
    belly.position.y = -0.05;
    const hip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.27), pantsMat);
    hip.position.y = -0.26;
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.65 });
    const beltLine = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.36), beltMat); // 黑帶環腰一圈:加粗外凸(07-14 拍板)
    const beltKnot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.07), beltMat); // 帶結
    beltKnot.position.set(0, -0.15, 0.19);
    beltLine.position.y = -0.15;
    waist.add(belly, hip, beltLine, beltKnot);

    // 頭(Group:動畫會晃 head.position.y)+臉+髮+耳+護頭圈
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 18), skin);
    const earL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), skin);
    earL.scale.set(0.45, 1, 0.8);
    earL.position.set(-0.245, -0.01, 0);
    const earR = earL.clone();
    earR.position.x = 0.245;
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.265, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), hairMat);
    hairCap.position.y = 0.01;
    hairCap.rotation.x = -0.22;
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.255, 16, 8, Math.PI, Math.PI, Math.PI * 0.35, Math.PI * 0.22), hairMat);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.268, 0.268, 0.055, 16), new THREE.MeshStandardMaterial({ color: beltColor, roughness: 0.55 })); // 功夫頭帶
    band.position.y = 0.08;
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), white); eL.position.set(-0.09, 0.06, 0.21);
    const eR = eL.clone(); eR.position.x = 0.09;
    const pL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), dark); pL.position.set(-0.09, 0.06, 0.25);
    const pR = pL.clone(); pR.position.x = 0.09;
    const bL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.02), dark); bL.position.set(-0.09, 0.14, 0.22); bL.rotation.z = 0.18;
    const bR = bL.clone(); bR.position.x = 0.09; bR.rotation.z = -0.18;
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 14, Math.PI), dark);
    mouth.position.set(0, -0.08, 0.21);
    mouth.rotation.z = Math.PI;
    head.add(skull, earL, earR, hairCap, hairBack, band, eL, eR, pL, pR, bL, bR, mouth);
    head.position.y = 2.12;

    // 雙臂(拳套)/雙腿(腳掌);肘微彎=備戰感
    const armLimbL = mkLimb({ upperMat: gi, lowerMat: skin, upperLen: 0.34, lowerLen: 0.33, upperR: 0.07, lowerR: 0.058, end: "glove" });
    armLimbL.pivot.position.set(-0.4, 1.72, 0);
    armLimbL.joint.rotation.x = -0.45;
    const armLimbR = mkLimb({ upperMat: gi, lowerMat: skin, upperLen: 0.34, lowerLen: 0.33, upperR: 0.07, lowerR: 0.058, end: "glove" });
    armLimbR.pivot.position.set(0.4, 1.72, 0);
    armLimbR.joint.rotation.x = -0.45;
    const legLimbL = mkLimb({ upperMat: pantsMat, lowerMat: pantsMat, upperLen: 0.44, lowerLen: 0.42, upperR: 0.09, lowerR: 0.072, end: "foot" });
    legLimbL.pivot.position.set(-0.15, 1.0, 0);
    legLimbL.pivot.rotation.x = -0.05;
    legLimbL.joint.rotation.x = 0.1;
    const legLimbR = mkLimb({ upperMat: pantsMat, lowerMat: pantsMat, upperLen: 0.44, lowerLen: 0.42, upperR: 0.09, lowerR: 0.072, end: "foot" });
    legLimbR.pivot.position.set(0.15, 1.0, 0);
    legLimbR.pivot.rotation.x = -0.05;
    legLimbR.joint.rotation.x = 0.1;

    // 蓄力光環
    const aura = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.85 }),
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.08;
    aura.visible = false;

    g.add(legLimbL.pivot, legLimbR.pivot, chest, neck, waist, armLimbL.pivot, armLimbR.pivot, head, aura);
    // 動畫介面不變:pivot 掛進 userData,既有出拳/踢腿/格擋程式照用
    g.userData = { armL: armLimbL.pivot, armR: armLimbR.pivot, legL: legLimbL.pivot, legR: legLimbR.pivot, head, aura, mouth };
    return g;
  }

  _buildFighters() {
    this.meshes = {
      home: this._makeFighter(0xc9a06a, 0x6b4a2a), // 雅各:駝色古袍+棕頭帶
      away: this._makeFighter(0xf6f2e8, 0xd8c46a), // 那人(天使):白袍+金頭帶
    };
    // 天使微微發光(創32「有一個人」——人形,不加翅膀;只用淡光暗示)
    this.meshes.away.traverse((o) => {
      if (o.isMesh && o.material?.color && o.material.color.getHex() === 0xf6f2e8 && o.material.emissive) {
        o.material.emissive.setHex(0x8a86aa);
        o.material.emissiveIntensity = 0.35;
      }
    });
    // ★身體真正面對面(07-11 使用者點名):home 朝 +x、away 朝 -x
    this.meshes.home.rotation.y = Math.PI / 2;
    this.meshes.away.rotation.y = -Math.PI / 2;
    this.meshes.home.scale.setScalar(0.95); // 新人物本身較高,調回同等畫面大小
    this.meshes.away.scale.setScalar(0.95);
    this.scene.add(this.meshes.home, this.meshes.away);
    this.f = {};
  }

  applyPresentation({ modeId, difficulty, rounds }) {
    if (GAME_MODES[modeId]) this.modeId = modeId;
    if (DIFFICULTY_PRESETS[difficulty]) this.difficulty = difficulty;
    this.totalRounds = [1, 3, 5].includes(rounds) ? rounds : 3;
  }

  _applyBossLook() {
    const boss = this.preset.boss === "yujiro" && this.modeId === "vsai";
    const m = this.meshes.away;
    m.scale.setScalar(boss ? 1.16 : 0.95); // 巨漢
    m.traverse((o) => {
      if (!o.isMesh || !o.material?.color || o.userData.bossPart) return;
      const hex = o.material.color.getHex();
      const gp = o.geometry?.parameters;
      if (hex === 0x2b2119 || hex === 0xb5352b) o.material.color.setHex(boss ? 0xb5352b : 0x2b2119); // 髮染火紅
      if (hex === 0xf2f2ef || hex === 0xdca77c) o.material.color.setHex(boss ? 0xdca77c : 0xf2f2ef); // 赤膊(非boss=白道服)
      if (o.geometry?.type === "CylinderGeometry" && gp?.radiusTop === 0.268) o.visible = !boss; // 不戴頭帶
      if (o.geometry?.type === "BoxGeometry" && gp?.width === 0.09 && gp?.height === 0.02) o.visible = !boss; // 藏原友善眉
      if (o.geometry?.type === "SphereGeometry" && [0.25, 0.06, 0.05, 0.025].includes(gp?.radius)) o.visible = !boss; // 藏圓顱/耳/眼(改方臉銳眼)
    });
    const ud = m.userData;
    if (ud.mouth) ud.mouth.scale.setScalar(boss ? 1.15 : 1);
    if (ud.bossKit) { for (const o of ud.bossKit) o.visible = boss; return; }
    if (!boss) return;
    const kit = [];
    const skinM = new THREE.MeshStandardMaterial({ color: 0xd6a173, roughness: 0.5 });
    const hairM = new THREE.MeshStandardMaterial({ color: 0xb5352b, roughness: 0.6 });
    const browM = new THREE.MeshStandardMaterial({ color: 0x531410, roughness: 0.7 });
    const whiteM = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35 });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    const add = (parent, mesh) => { mesh.userData.bossPart = true; parent.add(mesh); kit.push(mesh); return mesh; };
    const head = ud.head;
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.44, 0.38), skinM);
    add(head, face);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.07), skinM);
      ear.position.set(s * 0.215, -0.01, 0);
      add(head, ear);
    }
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.3), skinM);
    jaw.position.set(0, -0.23, 0.02);
    add(head, jaw);
    for (const s of [-1, 1]) {
      const eyeW = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.034, 0.015), whiteM);
      eyeW.position.set(s * 0.09, 0.05, 0.195);
      add(head, eyeW);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.034, 0.017), darkM);
      pupil.position.set(s * 0.075, 0.05, 0.198);
      add(head, pupil);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.026, 0.02), skinM);
      lid.position.set(s * 0.09, 0.073, 0.196);
      lid.rotation.z = s * -0.12;
      add(head, lid);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.03, 0.02), browM);
      brow.position.set(s * 0.095, 0.105, 0.198);
      brow.rotation.z = s * -0.32;
      add(head, brow);
    }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.11, 0.055), skinM);
    nose.position.set(0, -0.01, 0.205);
    add(head, nose);
    const up = new THREE.Vector3(0, 1, 0);
    const spikeAt = (dir, h, r) => {
      const s = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), hairM);
      s.position.copy(dir.clone().multiplyScalar(0.225)).add(new THREE.Vector3(0, 0.02, 0));
      s.quaternion.setFromUnitVectors(up, dir);
      add(head, s);
    };
    spikeAt(new THREE.Vector3(0, 1, -0.08).normalize(), 0.26, 0.075);
    for (const [t, n, h, r] of [[0.3, 7, 0.24, 0.07], [0.55, 11, 0.2, 0.065], [0.8, 13, 0.16, 0.058]]) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t;
        const dir = new THREE.Vector3(Math.cos(a) * Math.sin(t), Math.cos(t), Math.sin(a) * Math.sin(t)).normalize();
        if (dir.z > 0.3 && t > 0.6) continue;
        spikeAt(dir, h, r);
      }
    }
    const widow = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 6), hairM);
    widow.position.set(0, 0.19, 0.16);
    widow.rotation.x = 2.35;
    add(head, widow);
    for (const s of [-1, 1]) {
      const pec = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.07), skinM);
      pec.position.set(s * 0.125, 1.56, 0.16);
      pec.rotation.x = 0.12;
      add(m, pec);
      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), skinM);
      delt.position.set(s * 0.31, 1.69, 0);
      delt.scale.set(1, 0.8, 0.9);
      add(m, delt);
      const trap = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.16), skinM);
      trap.position.set(s * 0.16, 1.80, -0.02);
      trap.rotation.z = s * 0.55;
      add(m, trap);
    }
    for (let r = 0; r < 3; r++) for (const s of [-1, 1]) {
      const ab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.05), skinM);
      ab.position.set(s * 0.07, 1.32 - r * 0.09, 0.15);
      add(m, ab);
    }
    const bump = (x, y, sx, sy, rz = 0) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinM);
      b.position.set(x, y, -0.155);
      b.scale.set(sx, sy, 0.6);
      b.rotation.z = rz;
      add(m, b);
    };
    bump(-0.1, 1.64, 1.3, 0.8, -0.5); bump(0.1, 1.64, 1.3, 0.8, 0.5);
    bump(-0.09, 1.55, 0.9, 0.9); bump(0.09, 1.55, 0.9, 0.9);
    bump(0, 1.46, 0.7, 1.1);
    bump(-0.08, 1.37, 0.9, 0.6, 0.4); bump(0, 1.35, 1.0, 0.6); bump(0.08, 1.37, 0.9, 0.6, -0.4); // 鬼之背
    ud.bossKit = kit;
  }

  startMatch() {
    this._applyBossLook();
    this.wins = { home: 0, away: 0 };
    this.round = 1;
    this._startRound();
    this.emit("match-start", {});
  }

  _startRound() {
    this.phase = "ready";
    this._readyTimer = 1.3;
    this.f = {
      home: this._freshFighter(-1.7),
      away: this._freshFighter(1.7),
    };
    this.message = `第 ${this.round} 回合——預備!`;
    const needed = Math.ceil(this.totalRounds / 2);
    if (this.wins.home === needed - 1 && this.wins.away === needed - 1 && this.totalRounds > 1) {
      this.emit("final-round", {});
    }
    this._pushHud();
  }

  _freshFighter(x) {
    return {
      x, stamina: 100,
      attackT: 0, attackMove: null, // 出手中(startup 倒數)
      cd: 0, stunT: 0, chargeT: 0, blocking: false,
      thrown: null, proneT: 0, // 摔投飛行編排/俯臥計時
      hitFlashT: 0, sitT: 0, bowT: 0,
      aiT: rand(0.6, 1.4),
    };
  }

  // ── 操作 ──
  attack(side, moveName) {
    if (this.phase !== "fight") return;
    const f = this.f[side];
    if (f.attackMove || f.cd > 0 || f.stunT > 0 || f.sitT > 0 || f.thrown || f.proneT > 0) return;
    if (moveName === "special") {
      if (f.chargeT < 0.8) return; // 沒蓄滿不能放
      f.chargeT = 0;
    }
    f.attackMove = moveName;
    f.attackT = MOVES[moveName].startup;
    f.blocking = false;
    this.emit("swing", { side, move: moveName });
  }

  setBlock(side, on) {
    if (this.phase !== "fight") return;
    const f = this.f[side];
    if (f.stunT > 0 || f.sitT > 0) { f.blocking = false; return; }
    f.blocking = !!on;
    if (on) f.chargeT = 0;
  }

  setCharge(side, on) {
    if (this.phase !== "fight") return;
    const f = this.f[side];
    if (on && !f.attackMove && f.stunT <= 0) f.charging = true;
    if (!on && f.charging) {
      f.charging = false;
      if (f.chargeT >= 0.8) this.attack(side, "special");
      else f.chargeT = 0;
    }
  }

  _resolveHit(side, moveName) {
    const mv = MOVES[moveName];
    const f = this.f[side];
    const o = this.f[this.other(side)];
    const dist = Math.abs(o.x - f.x);
    if (dist > mv.range) { this.emit("whiff", { side }); return; }
    const dmgMul = side === "away" && this.modeId === "vsai" ? this.preset.dmgMul : 1;
    if (o.blocking) {
      o.stamina = Math.max(0, o.stamina - mv.blockedDmg);
      if (mv.stagger > 0) {
        f.stunT = mv.stagger; // 重拳被格=攻方硬直(反擊窗)
        this.emit("blocked-stagger", { side: this.other(side) });
      } else {
        this.emit("blocked", { side: this.other(side) });
      }
      o.x += (o.x >= f.x ? 1 : -1) * 0.15;
    } else {
      const dmg = Math.round(rand(mv.dmg[0], mv.dmg[1]) * dmgMul);
      const counter = f.stunTWasSet === undefined && o.attackMove; // 對方出手中被打=反擊
      o.stamina = Math.max(0, o.stamina - dmg);
      o.attackMove = null;
      o.hitFlashT = 0.25;
      if (mv.throw) {
        // ★摔投:判定先擲(邏輯位置立即落到攻擊者另一側),畫面再演「翻過肩」軌跡
        const fromX = o.x;
        const trip = mv.style === "trip"; // 絆倒式:原地往後倒,不翻越
        const overX = trip ? (o.x + (o.x >= f.x ? 0.4 : -0.4)) : f.x;
        const toX = trip
          ? clamp(o.x + (o.x >= f.x ? 0.8 : -0.8), -ARENA_HALF, ARENA_HALF)
          : clamp(f.x + (o.x >= f.x ? -1.4 : 1.4), -ARENA_HALF, ARENA_HALF); // 翻過頭頂摔到攻擊者「背後」
        o.thrown = { t: 0, dur: trip ? 0.6 : 0.95, fromX, overX, toX, arc: mv.arc, spin: trip ? 0.5 : 2.5 };
        o.x = toX;
        o.stunT = Math.max(o.stunT, 2.2); // 飛行+俯臥期間無法行動
        this.cameraShake = Math.max(this.cameraShake, 0.12);
        this.emit("throw", { side, move: moveName, dmg, ippon: moveName === "special", targetStamina: o.stamina });
      } else {
        o.stunT = Math.max(o.stunT, 0.3);
        o.x += (o.x >= f.x ? 1 : -1) * 0.9; // 被打明顯後退(07-13 拍板)
        o.x = clamp(o.x, -ARENA_HALF, ARENA_HALF);
        this.cameraShake = Math.max(this.cameraShake, 0.07);
        this.emit("hit", { side, move: moveName, dmg, counter: !!counter, targetStamina: o.stamina });
      }
    }
    if (o.stamina <= 0) this._endRound(side);
  }

  _endRound(winner) {
    this.phase = "roundend";
    this.wins[winner] += 1;
    const loser = this.other(winner);
    this.f[loser].sitT = 2.4;   // 力竭坐地喘氣(溫和 KO)
    this.f[winner].bowT = 2.4;  // 勝者抱拳行禮
    this._roundTimer = 2.6;
    this.emit("round-end", { winner, wins: { ...this.wins } });
    const needed = Math.ceil(this.totalRounds / 2);
    if (this.wins[winner] >= needed) {
      this._matchWinner = winner;
    }
    this._pushHud();
  }

  cycleCamView() {
    this.camView = (this.camView + 1) % 5;
    try { localStorage.setItem("jacob-wrestle3d-camview", String(this.camView)); } catch { /* ignore */ }
    this.emit("status", { text: ["視角:側面。", "視角:你的肩後。", "視角:高空。", "視角:左邊(你背後)。", "視角:右邊(對手背後)。"][this.camView] });
  }

  // ── 主迴圈 ──
  update(dt) {
    if (this.phase === "menu" || this.phase === "done") return;
    if (this.phase === "ready") {
      this._readyTimer -= dt;
      if (this._readyTimer <= 0) {
        this.phase = "fight";
        this.message = "はじめ——開始!";
        this.emit("fight", { round: this.round });
        this._pushHud();
      }
      return;
    }
    if (this.phase === "roundend") {
      this._roundTimer -= dt;
      for (const f of Object.values(this.f)) {
        f.sitT = Math.max(0, f.sitT - dt);
        f.bowT = Math.max(0, f.bowT - dt);
      }
      if (this._roundTimer <= 0) {
        if (this._matchWinner) {
          this.phase = "done";
          const w = this._matchWinner;
          this._matchWinner = null;
          const youWin = w === "home";
          this.emit("match-end", {
            winner: w,
            title: this.modeId === "duel2p" ? (youWin ? "P1 獲勝!" : "P2 獲勝!") : (youWin ? "得勝了!你的名要叫以色列!🌅" : "天黎明了……再摔一回!"),
            text: youWin
              ? `${this.wins.home} 比 ${this.wins.away}——那人摸了雅各的大腿窩,雅各瘸了,卻得了祝福:「你與神與人較力,都得了勝。」(創32:25,28)`
              : `${this.wins.home} 比 ${this.wins.away}——雅各說:「你不給我祝福,我就不容你去。」抓緊了,再來一場!(創32:26)`,
            wins: { ...this.wins },
          });
        } else {
          this.round += 1;
          this._startRound();
        }
      }
      this._pushHud();
      return;
    }

    // fight
    for (const side of ["home", "away"]) {
      const f = this.f[side];
      const ctl = side === "home" ? this.controls.p1 : this.controls.p2;
      f.cd = Math.max(0, f.cd - dt);
      f.stunT = Math.max(0, f.stunT - dt);
      f.hitFlashT = Math.max(0, f.hitFlashT - dt);
      if (f.thrown) {
        f.thrown.t += dt;
        if (f.thrown.t >= f.thrown.dur) {
          f.thrown = null;
          f.proneT = 1.2; // 落地俯臥,溫柔規則:一下就自己爬起來
          this.cameraShake = Math.max(this.cameraShake || 0, 0.2);
          this.emit("throw-land", { side });
        }
      } else if (f.proneT > 0) {
        f.proneT = Math.max(0, f.proneT - dt);
      }
      // 蓄力
      if (f.charging && f.stunT <= 0 && !f.attackMove) f.chargeT = Math.min(1.4, f.chargeT + dt);
      // 出手 startup → 判定
      if (f.attackMove) {
        f.attackT -= dt;
        if (f.attackT <= 0) {
          const mv = f.attackMove;
          f.attackMove = null;
          f.cd = MOVES[mv].cd;
          this._resolveHit(side, mv);
        }
      }
      // 移動(人類)
      if (this._isHuman(side) && f.stunT <= 0) {
        const spd = (f.blocking ? 1.1 : f.charging ? 1.4 : 3.4) * dt;
        if (ctl.left) f.x -= spd;
        if (ctl.right) f.x += spd;
        const o = this.f[this.other(side)];
        const lo = o.x < f.x ? o.x + 0.45 : -ARENA_HALF; // 交換位置後邊界跟著換(07-13 拍板)
        const hi = o.x > f.x ? o.x - 0.45 : ARENA_HALF;
        f.x = clamp(f.x, lo, hi);
      }
    }

    // AI(away)
    if (!this._isHuman("away") && this.phase === "fight") {
      const p = this.preset;
      const ai = this.f.away;
      const me = this.f.home;
      const dist = Math.abs(ai.x - me.x);
      ai.aiT -= dt;
      // 對玩家的預告反應:玩家重拳/蓄力中→依難度格擋
      const threat = (me.attackMove === "heavy" && me.attackT > 0.15) || me.chargeT > 0.5;
      if (threat && ai.stunT <= 0 && !ai.attackMove) {
        ai.blocking = Math.random() < p.blockReact * dt * 14 ? true : ai.blocking;
      } else if (ai.blocking && !threat && Math.random() < 2.2 * dt) {
        ai.blocking = false;
      }
      // 走位:保持 1.0~1.3
      if (ai.stunT <= 0 && !ai.blocking && !ai.attackMove) {
        if (dist > 1.0) ai.x -= 2.4 * dt * Math.sign(ai.x - me.x);
        else if (dist < 0.6) ai.x += 1.8 * dt * Math.sign(ai.x - me.x);
        ai.x = ai.x > me.x ? clamp(ai.x, me.x + 0.45, ARENA_HALF) : clamp(ai.x, -ARENA_HALF, me.x - 0.45); // 可在任一邊(07-13 拍板)
      }
      // 出手
      if (ai.aiT <= 0 && ai.stunT <= 0 && !ai.attackMove && ai.cd <= 0 && !ai.blocking) {
        ai.aiT = rand(0.5, 1.3) / Math.max(0.2, p.aggro);
        if (dist <= 1.35) {
          const r = Math.random();
          if (r < p.special && ai.chargeT >= 0.8) this.attack("away", "special");
          else if (r < 0.4) this.attack("away", "heavy");
          else this.attack("away", "light");
        } else if (Math.random() < p.special * 1.6) {
          ai.charging = true;
          setTimeoutSafe(this, () => { ai.charging = false; if (ai.chargeT >= 0.8) this.attack("away", "special"); }, 900);
        }
      }
    }

    this.cameraShake = Math.max(0, (this.cameraShake || 0) - dt * 1.9);
    this._hudTimer -= dt;
    if (this._hudTimer <= 0) { this._hudTimer = 0.1; this._pushHud(); }
  }

  _pushHud() {
    if (!this.onHud) return;
    this.onHud({
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      wins: this.wins || { home: 0, away: 0 },
      home: this.f.home ? { stamina: this.f.home.stamina, charge: this.f.home.chargeT } : { stamina: 100, charge: 0 },
      away: this.f.away ? { stamina: this.f.away.stamina, charge: this.f.away.chargeT } : { stamina: 100, charge: 0 },
      message: this.message,
      modeLabel: GAME_MODES[this.modeId].label,
    });
  }

  render(dt) {
    for (const side of ["home", "away"]) {
      const f = this.f[side];
      const mesh = this.meshes[side];
      if (!f) continue;
      const foeF = this.f[this.other(side)];
      const faceDir = ((foeF ? foeF.x : 0) >= f.x ? 1 : -1) * (Math.PI / 2); // 動態面向對手(07-13 拍板:摔=交換位置)
      // ★摔投編排:扛上肩(升到對手頭頂)→翻兩圈→對側落地
      if (f.thrown) {
        const th = f.thrown;
        const k = Math.min(1, th.t / th.dur);
        const x = k < 0.5
          ? th.fromX + (th.overX - th.fromX) * (k / 0.5)
          : th.overX + (th.toX - th.overX) * ((k - 0.5) / 0.5);
        const y = Math.sin(k * Math.PI) * (1.35 * th.arc);
        mesh.position.set(x, y, 0);
        mesh.rotation.y = faceDir;
        mesh.rotation.x = -k * Math.PI * (th.spin ?? 2.5); // trip=半圈絆倒/over=翻兩圈,終點≡俯臥角
        mesh.scale.y = 1;
        continue;
      }
      // 俯臥(被摔落地):趴 1.2 秒喘一下,自己爬起
      if (f.proneT > 0) {
        mesh.position.set(f.x, 0.3, 0);
        mesh.rotation.y = faceDir;
        mesh.rotation.x = -Math.PI / 2;
        mesh.scale.y = 1 + Math.sin(performance.now() / 150) * 0.02;
        continue;
      }
      // 出手撲身:攻擊動畫期間身體往對手方向撲近(拳/腳真的碰到人,07-11 使用者點名)
      let lungeShift = 0;
      if (f.attackMove) {
        const mv = MOVES[f.attackMove];
        const k = Math.sin((1 - f.attackT / mv.startup) * Math.PI);
        const foe = this.f[this.other(side)];
        const gap = Math.abs((foe ? foe.x : f.x) - f.x);
        lungeShift = Math.sign((foe ? foe.x : 0) - f.x) * Math.min(gap - 0.3, k * (mv.range * 0.8)); // 撲更深:拳腳真的碰到人(07-13 拍板)
        if (!isFinite(lungeShift)) lungeShift = 0;
      }
      mesh.position.set(f.x + lungeShift, 0, 0);
      const ud = mesh.userData;
      const punchArm = ud.armR;
      // 出拳(本地 +z=面向對手):pivot 前旋
      if (f.attackMove && f.attackMove !== "kick") {
        const mv = MOVES[f.attackMove];
        const k = 1 - f.attackT / mv.startup;
        punchArm.rotation.x = -(0.4 + k * 1.25);
        if (f.attackMove === "heavy" || f.attackMove === "special") {
          ud.head.position.y = 2.12 + Math.sin(k * Math.PI) * 0.06; // 頭高隨新人物
        }
      } else if (!f.blocking) {
        punchArm.rotation.x *= Math.max(0, 1 - dt * 10);
      }
      // 踢腿(07-11 使用者點名):右腿 pivot 前踢
      if (f.attackMove === "kick") {
        const k = 1 - f.attackT / MOVES.kick.startup;
        ud.legR.rotation.x = -Math.sin(k * Math.PI) * 1.5;
        mesh.position.y = Math.sin(k * Math.PI) * 0.08;
      } else {
        ud.legR.rotation.x *= Math.max(0, 1 - dt * 12);
      }
      // 格擋:雙臂交叉抬起
      ud.armL.rotation.x = f.blocking ? -1.5 : ud.armL.rotation.x * Math.max(0, 1 - dt * 10);
      if (f.blocking) punchArm.rotation.x = -1.5;
      // 蓄力光環
      ud.aura.visible = f.chargeT > 0.15;
      if (ud.aura.visible) {
        ud.aura.scale.setScalar(0.8 + f.chargeT * 0.5 + Math.sin(performance.now() / 90) * 0.06);
        ud.aura.material.opacity = f.chargeT >= 0.8 ? 0.95 : 0.5;
        ud.aura.material.color.setHex(f.chargeT >= 0.8 ? 0xffd24a : 0x8899aa);
      }
      // 被打表情:笑臉翻成苦臉(07-13 拍板;半月嘴上下顛倒)
      if (ud.mouth) ud.mouth.rotation.z = f.hitFlashT > 0 ? 0 : Math.PI;
      // 受擊白閃
      mesh.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive) {
          o.material.emissiveIntensity = f.hitFlashT > 0 ? 1.4 : (o.material.userData?.baseEI ?? (o.material.userData = { baseEI: o.material.emissiveIntensity }, o.material.emissiveIntensity));
        }
      });
      // 力竭坐地/抱拳行禮(rotation.y 保持面對面,姿勢用 rotation.x/位移)
      mesh.rotation.y = faceDir; // 動態面向(07-13 拍板)
      if (this.phase === "done" && side === "home" && this.wins.home > this.wins.away) {
        const tt = performance.now() / 1000;
        mesh.rotation.x = 0.06;
        mesh.rotation.z = Math.sin(tt * 3.2) * 0.06; // 一拐一拐
        ud.legR.rotation.x = -0.45; // 大腿窩扭了=右腿僵直(創32:31)
        mesh.position.y = Math.max(0, Math.sin(tt * 3.2)) * 0.05;
        mesh.scale.y = 1;
        continue;
      }
      if (f.sitT > 0) {
        mesh.position.y = -0.32;
        mesh.rotation.x = 0.12;
        mesh.scale.y = 0.9 + Math.sin(performance.now() / 160) * 0.03;
      } else if (f.bowT > 0) {
        mesh.rotation.x = 0.28; // 面對面鞠躬(繞本地 x=向前傾)
        mesh.position.y = 0;
        mesh.scale.y = 1;
      } else {
        mesh.rotation.x = 0;
        if (f.attackMove !== "kick") mesh.position.y = f.stunT > 0 ? Math.sin(performance.now() / 50) * 0.02 : 0;
        mesh.scale.y = 1;
      }
    }
    // 鏡頭
    const midX = this.f.home ? (this.f.home.x + this.f.away.x) / 2 : 0;
    let tPos, tLook;
    if (this.camView === 1) {
      tPos = new THREE.Vector3((this.f.home?.x ?? -1.7) - 2.6, 1.9, 2.2);
      tLook = new THREE.Vector3(this.f.away?.x ?? 1.7, 1.1, 0);
    } else if (this.camView === 2) {
      tPos = new THREE.Vector3(midX, 9, 2.2);
      tLook = new THREE.Vector3(midX, 0, 0);
    } else if (this.camView === 3) {
      tPos = new THREE.Vector3(midX - 7.2, 2.3, 1.8);
      tLook = new THREE.Vector3(midX, 1.05, 0);
    } else if (this.camView === 4) {
      tPos = new THREE.Vector3(midX + 7.2, 2.3, 1.8);
      tLook = new THREE.Vector3(midX, 1.05, 0);
    } else {
      tPos = new THREE.Vector3(midX, 2.4, 7.4);
      tLook = new THREE.Vector3(midX, 1.05, 0);
    }
    const k = 1 - Math.exp(-dt * 3.4);
    this._camPos.lerp(tPos, k);
    this._camLook.lerp(tLook, k);
    const sh = this.cameraShake || 0;
    this.camera.position.set(this._camPos.x + rand(-sh, sh) * 0.4, this._camPos.y + rand(-sh, sh) * 0.25, this._camPos.z);
    this.camera.lookAt(this._camLook);
    this.renderer.render(this.scene, this.camera);
  }

  startLoop() {
    if (this._running) return;
    this._running = true;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this.update(dt);
      this.render(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

// AI 蓄力用的安全計時(存在 game 上,round 重置不炸)
function setTimeoutSafe(game, fn, ms) {
  setTimeout(() => { if (game.phase === "fight") fn(); }, ms);
}
