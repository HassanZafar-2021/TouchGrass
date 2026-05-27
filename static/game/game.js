// ═══════════════════════════════════════════════════════════════════
// TouchGrass: The Game
// Your GitHub contribution history = your level.
// ═══════════════════════════════════════════════════════════════════

const W       = 800;
const H       = 400;
const TILE    = 40;
const FLOOR_Y = H - 56;   // top Y of standard ground

let githubData = null;
let phaserGame = null;

// ── Utilities ────────────────────────────────────────────────────────
const sleep  = ms  => new Promise(r => setTimeout(r, ms));
const setBar = pct => { document.getElementById('load-bar').style.width = pct + '%'; };
const setMsg = m   => { document.getElementById('load-status').textContent = m; };

function updateHearts(n) {
  const h = ['','❤️','❤️❤️','❤️❤️❤️','❤️❤️❤️❤️','❤️❤️❤️❤️❤️'];
  document.getElementById('hud-hearts').textContent = h[Math.max(0, Math.min(n, 5))];
}

// ── Init ─────────────────────────────────────────────────────────────
async function init() {
  const params   = new URLSearchParams(location.search);
  const username = params.get('u');
  setBar(10);

  if (!username) {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('username-gate').classList.add('visible');
    document.getElementById('gate-btn').addEventListener('click', goFromGate);
    document.getElementById('gate-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') goFromGate();
    });
    return;
  }

  setMsg(`Fetching ${username}'s commit history…`);
  setBar(25);

  try {
    const res  = await fetch(`/api/score/${encodeURIComponent(username)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    githubData = data;
    setMsg(`${data.stats.total} commits loaded — generating level…`);
    setBar(65);
  } catch(e) {
    githubData = fallback(username);
    setMsg('Using fallback data…');
    setBar(65);
  }

  await sleep(350);
  setMsg('Spawning bugs…'); setBar(88);
  await sleep(280);
  setBar(100); await sleep(220);
  document.getElementById('loading-screen').style.display = 'none';
  showTutorial();
}

function goFromGate() {
  const u = document.getElementById('gate-input').value.trim();
  if (u) location.href = `?u=${encodeURIComponent(u)}`;
}

function fallback(username) {
  const grid = [];
  for (let i = 0; i < 120; i++) {
    const r = Math.random();
    grid.push({ count: r < 0.28 ? 0 : Math.floor(r * 7), date: '2024-01-01' });
  }
  return {
    username, name: username, avatar: '', grid,
    stats: { streak: 2, max_streak: 5, total: 80, avg: 0.5, peak: 4, max_break: 30 },
    class: { name: 'Rookie Coder', emoji: '🌱', grass_level: 6, touch_grass: false },
  };
}

// ── Tutorial Screen ───────────────────────────────────────────────────
function showTutorial() {
  const overlay = document.getElementById('tutorial-overlay');
  overlay.classList.add('visible');

  // Use onclick so it doesn't stack duplicate listeners on retry
  document.getElementById('tutorial-play-btn').onclick = () => {
    overlay.classList.remove('visible');
    overlay.style.display = 'none';
    bootGame();
  };
}

// ── Level config ──────────────────────────────────────────────────────
function buildConfig(data) {
  const grid = (data.grid || []).slice(-1095);

  const segments  = [];
  let solidSince  = 0;

  grid.forEach(d => {
    if (d.count === 0 && solidSince >= 3) {
      segments.push({ type: 'gap' });
      solidSince = 0;
    } else {
      solidSince++;
      if (d.count >= 10)     segments.push({ type: 'high', count: d.count });
      else if (d.count >= 4) segments.push({ type: 'mid',  count: d.count });
      else                   segments.push({ type: 'low',  count: Math.max(d.count, 1) });
    }
  });

  // REPLACE WITH this (pads segments for gameplay without lying about totalDays):
if (segments.length < 30) {
  const orig = segments.slice();
  while (segments.length < 30) segments.push(...orig);
}

  return {
    segments,
    totalDays:     grid.length,
    startSpeed:    160,
    baseSpeed:     240 + Math.min((data.stats.avg || 0) * 18, 100),
    maxSpeed:      720,
    bugStartDelay: 3500,
    bugStartRate:  3200,
    bugMinRate:    480,
    coinValue:     5 + Math.floor((data.stats.streak || 0) * 0.8),
    hasDoubleJump: (data.stats.max_streak || 0) >= 7,
    breakPenalty:  data.stats.max_break || 0,
  };
}

// ── Boot ──────────────────────────────────────────────────────────────
function bootGame() {
  const cfg = buildConfig(githubData);

  document.getElementById('hud').classList.add('visible');
  document.getElementById('hud-class').textContent  = `${githubData.class.emoji} ${githubData.class.name}`;
  document.getElementById('hud-streak').textContent = `🔥 ${githubData.stats.streak}d streak`;
  updateHearts(3);

  phaserGame = new Phaser.Game({
    type: Phaser.AUTO,
    width: W, height: H,
    parent: 'game-container',
    backgroundColor: '#060e07',
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 1800 }, debug: false },
    },
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
  phaserGame.registry.set('cfg', cfg);
  phaserGame.registry.set('gd',  githubData);
}

// ════════════════════════════════════════════════════════════════════
//  GAME SCENE
// ════════════════════════════════════════════════════════════════════
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    this.cfg  = this.registry.get('cfg');
    this.gd   = this.registry.get('gd');

    this.score       = 0;
    this.lives       = 3;
    this.alive       = true;
    this.godmode     = false;
    this.shielded    = false;
    this.shieldGfx   = null;
    this.doubleScore = false;
    this.magnet      = false;
    this.slowMode    = false;
    this.starMode    = false;
    this.coinCount   = 0;
    this.elapsed     = 0;
    this.worldX      = 0;
    this.spawnedX    = 0;
    this.segIdx      = 0;
    this.won         = false;

    this.speed       = this.cfg.startSpeed;
    this.targetSpeed = this.cfg.startSpeed;

    this.scoreAccum  = 0;
    this.bugAccum    = 0;
    this.coinAccum   = 0;
    this.pupAccum    = 0;
    this.envAccum    = 0;

    this.makeTextures();
    this.makeAnimations();
    this.makeBg();
    this.makeAudio();
    this.makeGround();
    this.makePlayer();
    this.makeGroups();
    this.makeInput();
    this.makeColliders();
    this.makeHUD();

    if (!this.cfg.hasDoubleJump)
      this.announce('⚠️ No double jump — max streak too low!', '#ff8c42');
    else
      this.announce('🐱 SPACE / TAP to jump — double jump unlocked!', '#9ef5a2');
  }

  getNextSeg() {
    const seg = this.cfg.segments[this.segIdx % this.cfg.segments.length];
    this.segIdx++;
    return seg;
  }

  tileTop(seg) {
    switch (seg.type) {
      case 'high': return FLOOR_Y - TILE * 2;
      case 'mid':  return FLOOR_Y - TILE;
      default:     return FLOOR_Y;
    }
  }

  tileTex(seg) {
    switch (seg.type) {
      case 'high': return 'tile_high';
      case 'mid':  return 'tile_mid';
      default:     return 'tile_low';
    }
  }

  makeAnimations() {
    if (this.anims.exists('run')) return;

    this.anims.create({
      key: 'run',
      frames: [
        { key: 'cat0' }, { key: 'cat1' },
        { key: 'cat2' }, { key: 'cat3' },
      ],
      frameRate: 10,
      repeat: -1,
    });
  }

  makeTextures() {
    if (this.textures.exists('cat0')) return;
    const g = this.add.graphics();

    // ── Octocat-style GitHub Cat ──────────────────────────────────
    const drawOctocat = (key, legPhase, eyeOpen, tintColor) => {
      g.clear();
      const bc = tintColor || 0xd0d7de;
      const dc = 0xa8b0ba;

      const phases = [legPhase, -legPhase, legPhase * 0.7, -legPhase * 0.7];
      [-9, -3, 3, 9].forEach((ox, i) => {
        g.fillStyle(dc);
        g.fillEllipse(16 + ox, 36 + phases[i], 5, 8);
      });

      g.fillStyle(bc);
      g.fillEllipse(16, 20, 26, 28);

      g.fillStyle(bc);
      g.fillEllipse(16, 10, 24, 18);

      g.fillStyle(bc);
      g.fillTriangle(5, 8, 10, -2, 14, 7);
      g.fillTriangle(27, 8, 22, -2, 18, 7);

      g.fillStyle(0xff8fa3, 0.7);
      g.fillTriangle(7, 7, 10, 1, 13, 7);
      g.fillTriangle(25, 7, 22, 1, 19, 7);

      if (eyeOpen) {
        g.fillStyle(0x000000);
        g.fillEllipse(11, 11, 5, 6);
        g.fillEllipse(21, 11, 5, 6);
        g.fillStyle(0xffffff);
        g.fillCircle(12, 10, 1.5);
        g.fillCircle(22, 10, 1.5);
      } else {
        g.fillStyle(0x000000);
        g.fillRect(8, 11, 7, 2);
        g.fillRect(18, 11, 7, 2);
      }

      g.fillStyle(0xff8fa3);
      g.fillTriangle(14, 15, 18, 15, 16, 17);

      g.fillStyle(0x606060);
      g.fillRect(1, 14, 8, 1);
      g.fillRect(1, 16, 7, 1);
      g.fillRect(23, 14, 8, 1);
      g.fillRect(24, 16, 7, 1);

      g.fillStyle(dc);
      g.fillEllipse(28, 20, 5, 14);
      g.fillEllipse(30, 26, 6, 5);

      g.generateTexture(key, 32, 42);
      g.clear();
    };

    drawOctocat('cat0', 0,  true,  0xd0d7de);
    drawOctocat('cat1', 2,  true,  0xd0d7de);
    drawOctocat('cat2', 3,  false, 0xd0d7de);
    drawOctocat('cat3', 2,  true,  0xd0d7de);
    drawOctocat('cat_jump', -4, false, 0xe6edf3);
    drawOctocat('cat_fall', 4,  false, 0xb0bbbf);
    drawOctocat('cat_hit',  0,  false, 0xff8fa3);
    drawOctocat('cat_star', 0,  true,  0xf5e642);

    // ── Ground tiles ──────────────────────────────────────────────
    const mkT = (key, base, mid, top) => {
      g.clear();
      g.fillStyle(base); g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(mid);  g.fillRect(1, 1, TILE-2, TILE-6);
      g.fillStyle(top);  g.fillRect(2, 2, TILE-4, 8);
      g.fillStyle(0x060e07, 0.25); g.fillRect(1, TILE-5, TILE-2, 4);
      g.generateTexture(key, TILE, TILE); g.clear();
    };
    mkT('tile_low',  0x1a4820, 0x216e39, 0x2d8a32);
    mkT('tile_mid',  0x216e39, 0x30a14e, 0x40c463);
    mkT('tile_high', 0x30a14e, 0x40c463, 0x9be9a8);

    g.fillStyle(0x122d14); g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x1a4820); g.fillRect(1, 0, TILE-2, 4);
    g.generateTexture('tile_fill', TILE, TILE); g.clear();

    g.fillStyle(0xff1122, 0.18); g.fillRect(0, 0, TILE, H);
    g.generateTexture('gap_warn', TILE, H); g.clear();

    // ── GITHUB-THEMED ENEMIES ──────────────────────────────────────

    // 1. Empty Contribution Box
    g.clear();
    g.fillStyle(0x21262d); g.fillRoundedRect(0, 0, 36, 36, 4);
    g.fillStyle(0x30363d); g.fillRoundedRect(2, 2, 32, 32, 3);
    g.lineStyle(1, 0x3d444d, 0.8);
    for (let i = 1; i < 3; i++) {
      g.strokeRect(2, 2 + i*10, 32, 1);
      g.strokeRect(2 + i*10, 2, 1, 32);
    }
    g.fillStyle(0xff4455);
    g.fillRect(8, 8, 7, 7);
    g.fillRect(21, 8, 7, 7);
    g.fillStyle(0xff4455);
    g.fillRect(7, 5, 9, 2);
    g.fillRect(20, 5, 9, 2);
    g.fillStyle(0xff4455);
    g.fillRect(10, 24, 16, 3);
    g.fillRect(8, 21, 4, 3);
    g.fillRect(24, 21, 4, 3);
    g.generateTexture('bug_box', 36, 36); g.clear();

    // 2. Angry Code Snippet
    g.clear();
    g.fillStyle(0x0d1117); g.fillRoundedRect(0, 0, 52, 28, 3);
    g.fillStyle(0x161b22); g.fillRoundedRect(1, 1, 50, 26, 3);
    g.fillStyle(0xff7b72); g.fillRect(6, 6, 18, 3);
    g.fillStyle(0x79c0ff); g.fillRect(26, 6, 12, 3);
    g.fillStyle(0xa5d6ff); g.fillRect(6, 12, 8, 3);
    g.fillStyle(0xffa657); g.fillRect(16, 12, 14, 3);
    g.fillStyle(0x3fb950); g.fillRect(6, 18, 22, 3);
    g.fillStyle(0xff4455, 0.9);
    for (let x = 6; x < 46; x += 4) {
      g.fillRect(x, 23, 2, 2);
      g.fillRect(x+2, 22, 2, 2);
    }
    g.fillStyle(0xff4455);
    g.fillEllipse(18, 10, 6, 6);
    g.fillEllipse(34, 10, 6, 6);
    g.fillStyle(0xffffff);
    g.fillCircle(19, 9, 1.5);
    g.fillCircle(35, 9, 1.5);
    g.generateTexture('bug_code', 52, 28); g.clear();

    // 3. Merge Conflict Monster
    g.clear();
    g.fillStyle(0x3fb950); g.fillRect(0, 0, 14, 52);
    g.fillStyle(0xff4455); g.fillRect(14, 0, 14, 52);
    g.fillStyle(0x0d1117);
    g.fillRect(2, 3, 10, 3);
    g.fillRect(16, 3, 10, 3);
    g.fillRect(0, 24, 28, 4);
    g.fillStyle(0xffffff); g.fillEllipse(9, 14, 8, 9);
    g.fillStyle(0xffffff); g.fillEllipse(21, 14, 8, 9);
    g.fillStyle(0x000000); g.fillEllipse(9, 15, 4, 5);
    g.fillStyle(0x000000); g.fillEllipse(21, 15, 4, 5);
    g.fillStyle(0xffffff); g.fillCircle(10, 14, 1.2); g.fillCircle(22, 14, 1.2);
    g.fillStyle(0x000000);
    g.fillRect(7, 34, 14, 3);
    g.fillRect(5, 31, 4, 3);
    g.fillRect(19, 31, 4, 3);
    g.generateTexture('bug_merge', 28, 52); g.clear();

    // 4. Broken CI/CD Robot
    g.clear();
    g.fillStyle(0x161b22); g.fillRoundedRect(0, 4, 38, 26, 4);
    g.fillStyle(0x21262d); g.fillRoundedRect(1, 5, 36, 24, 3);
    g.fillStyle(0xff4455); g.fillRect(17, 0, 4, 5);
    g.fillStyle(0xff4455); g.fillCircle(19, 1, 3);
    g.fillStyle(0xff4455);
    g.fillRect(7, 10, 9, 3); g.fillRect(7, 10, 3, 9);
    g.fillRect(13, 10, 3, 9); g.fillRect(7, 16, 9, 3);
    g.fillRect(22, 10, 9, 3); g.fillRect(22, 10, 3, 9);
    g.fillRect(28, 10, 3, 9); g.fillRect(22, 16, 9, 3);
    g.fillStyle(0xff4455); g.fillRect(5, 22, 28, 4);
    g.fillStyle(0xff7b72); g.fillRect(5, 22, 8, 4);
    g.generateTexture('bug_ci', 38, 30); g.clear();

    // ── Coin (commit gem) ──────────────────────────────────────────
    g.fillStyle(0x1f6feb); g.fillCircle(13, 13, 13);
    g.fillStyle(0x388bfd); g.fillCircle(13, 13, 9);
    g.fillStyle(0x79c0ff); g.fillCircle(13, 13, 5);
    g.fillStyle(0xcae8ff, 0.8); g.fillCircle(9, 9, 3);
    g.fillStyle(0x0d1117, 0.6);
    g.fillCircle(10, 13, 2.5);
    g.fillCircle(16, 10, 2.5);
    g.fillCircle(16, 16, 2.5);
    g.fillRect(10, 10, 6, 2);
    g.generateTexture('coin', 26, 26); g.clear();

    // ── Powerups ───────────────────────────────────────────────────
    g.fillStyle(0x42f5e8); g.fillCircle(15, 15, 15);
    g.fillStyle(0x060e07); g.fillCircle(15, 15, 10);
    g.fillStyle(0x42f5e8); g.fillRect(11, 5, 8, 20); g.fillRect(5, 11, 20, 8);
    g.generateTexture('pu_shield', 30, 30); g.clear();

    g.fillStyle(0xf5e642); g.fillCircle(15, 15, 15);
    g.fillStyle(0x060e07); g.fillRect(5, 13, 20, 4); g.fillRect(13, 5, 4, 20);
    g.fillStyle(0xf5e642); g.fillCircle(15, 15, 4);
    g.generateTexture('pu_2x', 30, 30); g.clear();

    g.fillStyle(0xff8c42); g.fillCircle(15, 15, 15);
    g.fillStyle(0x060e07);
    g.fillTriangle(5, 5, 25, 5, 15, 15);
    g.fillTriangle(5, 25, 25, 25, 15, 15);
    g.generateTexture('pu_slow', 30, 30); g.clear();

    g.fillStyle(0xff6eb4); g.fillCircle(15, 15, 15);
    g.fillStyle(0x060e07); g.fillRect(6, 8, 6, 16); g.fillRect(18, 8, 6, 16);
    g.fillStyle(0x060e07); g.fillRect(6, 8, 18, 6);
    g.fillStyle(0xff6eb4); g.fillRect(7, 9, 4, 6); g.fillRect(19, 9, 4, 6);
    g.generateTexture('pu_magnet', 30, 30); g.clear();

    g.fillStyle(0xffffff); g.fillCircle(15, 15, 15);
    g.fillStyle(0xf5e642); g.fillCircle(15, 15, 10);
    g.fillStyle(0xff8c42); g.fillCircle(15, 15, 6);
    g.fillStyle(0xffffff); g.fillCircle(15, 15, 3);
    g.generateTexture('pu_star', 30, 30); g.clear();

    g.fillStyle(0xff4455); g.fillCircle(10, 10, 10);
    g.fillStyle(0xff4455); g.fillCircle(20, 10, 10);
    g.fillStyle(0xff4455); g.fillTriangle(2, 14, 28, 14, 15, 26);
    g.fillStyle(0xff8899); g.fillCircle(10, 8, 5); g.fillCircle(20, 8, 5);
    g.generateTexture('pu_life', 30, 26); g.clear();

    // ── Environment: Pixel Tree ────────────────────────────────────
    g.clear();
    g.fillStyle(0x6b3a1f); g.fillRect(14, 50, 12, 22);
    g.fillStyle(0x1a5c1a); g.fillTriangle(4, 52, 40, 52, 22, 28);
    g.fillStyle(0x216e39); g.fillTriangle(8, 40, 36, 40, 22, 18);
    g.fillStyle(0x2d8a32); g.fillTriangle(11, 28, 33, 28, 22, 8);
    g.fillStyle(0x9ef5a2, 0.5); g.fillTriangle(13, 25, 22, 12, 18, 25);
    g.generateTexture('tree', 44, 72); g.clear();

    g.clear();
    g.fillStyle(0x5a2e0e); g.fillRect(18, 80, 14, 30);
    g.fillStyle(0x143d14); g.fillTriangle(0, 82, 50, 82, 25, 44);
    g.fillStyle(0x1a5c1a); g.fillTriangle(5, 60, 45, 60, 25, 28);
    g.fillStyle(0x216e39); g.fillTriangle(9, 44, 41, 44, 25, 14);
    g.fillStyle(0x2d8a32); g.fillTriangle(13, 30, 37, 30, 25, 4);
    g.fillStyle(0x9ef5a2, 0.4); g.fillTriangle(15, 26, 25, 8, 20, 26);
    g.generateTexture('tree_tall', 50, 110); g.clear();

    g.clear();
    g.fillStyle(0x216e39); g.fillEllipse(18, 18, 36, 28);
    g.fillStyle(0x2d8a32); g.fillEllipse(10, 14, 22, 20);
    g.fillStyle(0x2d8a32); g.fillEllipse(26, 14, 22, 20);
    g.fillStyle(0x40c463, 0.5); g.fillEllipse(14, 10, 12, 10);
    g.generateTexture('bush', 36, 28); g.clear();

    g.clear();
    g.fillStyle(0x40c463);
    g.fillTriangle(0, 14, 4, 0, 8, 14);
    g.fillTriangle(6, 14, 10, 2, 14, 14);
    g.fillTriangle(12, 14, 16, 4, 20, 14);
    g.fillStyle(0x9ef5a2, 0.6);
    g.fillRect(1, 4, 2, 8);
    g.fillRect(7, 6, 2, 6);
    g.fillRect(13, 7, 2, 5);
    g.generateTexture('grass_tuft', 20, 14); g.clear();

    g.clear();
    g.fillStyle(0x1e3a5f); g.fillRect(0, 0, 120, 18);
    g.fillStyle(0x204f7a); g.fillRect(0, 0, 120, 8);
    g.fillStyle(0x7ec8e3, 0.3);
    g.fillRect(10, 4, 30, 3);
    g.fillRect(55, 6, 40, 3);
    g.fillRect(90, 3, 20, 2);
    g.fillStyle(0x2d8a32); g.fillEllipse(20, 14, 18, 8);
    g.fillStyle(0x2d8a32); g.fillEllipse(70, 13, 14, 6);
    g.fillStyle(0xff6eb4, 0.8); g.fillCircle(22, 13, 3);
    g.generateTexture('lake', 120, 18); g.clear();

    g.clear();
    g.fillStyle(0xf5e642, 0.9); g.fillCircle(4, 4, 4);
    g.fillStyle(0xffffff, 0.5); g.fillCircle(3, 3, 2);
    g.generateTexture('firefly', 8, 8); g.clear();

    g.clear();
    g.fillStyle(0x6b3a1f); g.fillRect(7, 16, 8, 10);
    g.fillStyle(0xff4455); g.fillEllipse(11, 12, 22, 18);
    g.fillStyle(0xffffff); g.fillCircle(6, 10, 3); g.fillCircle(14, 7, 3); g.fillCircle(19, 11, 3);
    g.generateTexture('mushroom', 22, 26); g.clear();

    [['pd_g',0x5cd462],['pd_y',0xf5e642],['pd_r',0xff4455],
     ['pd_c',0x42f5e8],['pd_o',0xff8c42],['pd_w',0xffffff],
     ['pd_b',0x388bfd]].forEach(([k,c])=>{
      g.fillStyle(c); g.fillCircle(4, 4, 4);
      g.generateTexture(k, 8, 8); g.clear();
    });

    g.destroy();
  }

  makeBg() {
    const sky = this.add.graphics().setDepth(0);
    sky.fillGradientStyle(0x010c03, 0x010c03, 0x0a1f0c, 0x0a1f0c, 1);
    sky.fillRect(0, 0, W, H);

    this.stars = [];
    for (let i = 0; i < 65; i++) {
      const s = this.add.circle(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(0, H * 0.65),
        Phaser.Math.Between(1, 2),
        0x9ef5a2,
        Phaser.Math.FloatBetween(0.08, 0.45)
      ).setDepth(1);
      this.stars.push(s);
    }

    const moon = this.add.graphics().setDepth(1);
    moon.fillStyle(0xd4e8b0, 0.85);
    moon.fillCircle(720, 45, 28);
    moon.fillStyle(0x0a1f0c);
    moon.fillCircle(728, 40, 22);

    this.cloudGfx = [];
    for (let i = 0; i < 6; i++) {
      const cg = this.add.graphics().setDepth(2).setAlpha(0.14);
      const cx = Phaser.Math.Between(0, W);
      const cy = Phaser.Math.Between(8, 70);
      cg.fillStyle(0x2d6e3a);
      cg.fillCircle(cx, cy, 14);
      cg.fillCircle(cx+20, cy-7, 18);
      cg.fillCircle(cx+40, cy, 13);
      cg.fillCircle(cx+55, cy+5, 10);
      cg._x   = cx;
      cg._spd = Phaser.Math.FloatBetween(0.12, 0.35);
      this.cloudGfx.push(cg);
    }

    const bgForest = this.add.graphics().setDepth(2).setAlpha(0.18);
    bgForest.fillStyle(0x0d2e10);
    for (let x = -20; x < W + 60; x += 45) {
      const h = 50 + Math.sin(x * 0.08) * 25 + Math.random() * 20;
      bgForest.fillTriangle(x, FLOOR_Y - 2, x + 40, FLOOR_Y - 2, x + 20, FLOOR_Y - h);
    }

    const cal  = this.add.graphics().setDepth(1).setAlpha(0.05);
    const segs = this.cfg.segments;
    const cw   = (W - 20) / Math.min(segs.length, 52);
    segs.forEach((s, i) => {
      const col = s.type==='gap' ? 0x110000 : s.type==='high' ? 0x40c463 : s.type==='mid' ? 0x30a14e : 0x1a4820;
      cal.fillStyle(col);
      cal.fillRect(10 + (i%52)*cw, H - 14 - Math.floor(i/52)*9, cw - 1, 7);
    });

    const hor = this.add.graphics().setDepth(3);
    hor.fillStyle(0x40c463, 0.08);
    hor.fillRect(0, FLOOR_Y - 3, W, 4);

    this.envGroup = this.add.group();

    this.fireflies = [];
    for (let i = 0; i < 12; i++) {
      const ff = this.add.image(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(FLOOR_Y - 140, FLOOR_Y - 30),
        'firefly'
      ).setDepth(25).setAlpha(0);
      ff._baseX = ff.x;
      ff._baseY = ff.y;
      ff._phase = Math.random() * Math.PI * 2;
      ff._speed = Phaser.Math.FloatBetween(0.5, 1.2);
      this.fireflies.push(ff);
      this.tweens.add({
        targets: ff, alpha: { from: 0, to: 0.8 },
        duration: 600 + Math.random() * 800,
        yoyo: true, repeat: -1,
        delay: Math.random() * 2000
      });
    }
  }

  makeAudio() {
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.input.once('pointerdown', () => {
        if (this.ac.state === 'suspended') this.ac.resume();
      });
      this.startMusic();
    } catch(e) { this.ac = null; }
  }

  startMusic() {
    if (!this.ac) return;
    const ac  = this.ac;
    const mel = [330,392,494,392, 330,294,262,294, 330,392,494,523, 494,440,392,330];
    const bas = [131,131,165,165, 147,147,131,131, 131,131,165,165, 147,174,131,131];
    const bpm = 150, bl = 60/bpm;

    const note = (f, t, d, v, w='square', f0) => {
      if (!f || !this.alive) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = w;
      o.frequency.setValueAtTime(f0 || f, t);
      if (f0) o.frequency.exponentialRampToValueAtTime(f, t + d*0.4);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d*0.87);
      o.start(t); o.stop(t + d);
    };

    const loop = (t0) => {
      if (!this.alive) return;
      mel.forEach((f, i) => {
        note(f,      t0+i*bl, bl*0.7,  0.05, 'square');
        note(bas[i], t0+i*bl, bl*0.88, 0.038,'triangle');
        if (i%4===0) note(80,  t0+i*bl,       0.04,  0.06,  'sawtooth');
        if (i%2===0) note(200, t0+i*bl+bl*0.5, 0.03, 0.022, 'square');
      });
      this._mt = this.time.delayedCall(
        (mel.length * bl - 0.08) * 1000,
        () => { if (this.alive) loop(ac.currentTime + 0.05); }
      );
    };
    if (ac.state === 'suspended') ac.resume().then(() => loop(ac.currentTime + 0.1));
    else loop(ac.currentTime + 0.1);
  }

  sfx(type) {
    if (!this.ac) return;
    const ac = this.ac, t = ac.currentTime;
    const b = (f, d, v, w='square', f0) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = w; o.frequency.setValueAtTime(f0||f, t);
      if (f0) o.frequency.exponentialRampToValueAtTime(f, t + d*0.4);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.start(t); o.stop(t + d);
    };
    if (type==='jump')  b(440, 0.10, 0.065, 'square', 220);
    if (type==='jump2') b(660, 0.11, 0.060, 'square', 330);
    if (type==='coin')  { b(880,  0.07, 0.05, 'sine'); b(1100, 0.06, 0.038, 'sine'); }
    if (type==='hit')   b(110, 0.20, 0.085, 'sawtooth', 260);
    if (type==='pu')    { b(523, 0.055, 0.055, 'sine'); b(659, 0.055, 0.055, 'sine'); b(784, 0.1, 0.055, 'sine'); }
    if (type==='die')   b(180, 0.50, 0.09,  'sawtooth', 400);
    if (type==='fall')  b(65,  0.30, 0.075, 'sawtooth', 160);
    if (type==='life')  { b(784, 0.06, 0.065, 'sine'); b(1047, 0.1, 0.065, 'sine'); }
    if (type==='win') {
      // Ascending fanfare
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = ac.createOscillator(), gain = ac.createGain();
        o.connect(gain); gain.connect(ac.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t + i * 0.12);
        gain.gain.setValueAtTime(0.08, t + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.35);
        o.start(t + i * 0.12);
        o.stop(t + i * 0.12 + 0.4);
      });
    }
  }

  makeGround() {
    this.groundGroup = this.physics.add.staticGroup();
    const initCols = Math.ceil(W / TILE) + 8;
    for (let col = 0; col < initCols; col++) {
      this.spawnTileCol(col * TILE);
    }
  }

  spawnTileCol(worldX) {
    const seg  = this.getNextSeg();
    const topY = this.tileTop(seg);

    if (seg.type !== 'gap') {
      const surf = this.groundGroup.create(
        worldX + TILE/2, topY + TILE/2,
        this.tileTex(seg)
      ).setDepth(6);
      surf.refreshBody();

      let fy = topY + TILE;
      while (fy <= FLOOR_Y + TILE) {
        const fill = this.groundGroup.create(
          worldX + TILE/2, fy + TILE/2, 'tile_fill'
        ).setDepth(5);
        fill.refreshBody();
        fy += TILE;
      }

      if (Math.random() < 0.18) this.spawnEnvDecor(worldX, topY);
    } else {
      this.add.image(worldX + TILE/2, H/2, 'gap_warn').setDepth(4).setScrollFactor(1);
    }

    this.spawnedX = worldX + TILE;
  }

  spawnEnvDecor(worldX, topY) {
    const roll = Math.random();
    const x = worldX + TILE / 2;
    const y = topY;

    if (roll < 0.3) {
      const tex = Math.random() < 0.4 ? 'tree_tall' : 'tree';
      const h = tex === 'tree_tall' ? 110 : 72;
      this.add.image(x, y - h/2 + 4, tex).setDepth(4).setAlpha(0.88);
    } else if (roll < 0.55) {
      this.add.image(x, y - 10, 'bush').setDepth(7);
    } else if (roll < 0.72) {
      this.add.image(x - 4, y - 4, 'grass_tuft').setDepth(7);
    } else if (roll < 0.84) {
      this.add.image(x + Phaser.Math.Between(-6, 6), y - 10, 'mushroom').setDepth(7);
    } else {
      if (topY >= FLOOR_Y - 5) {
        this.add.image(x + 20, y + 10, 'lake').setDepth(4).setAlpha(0.75);
      }
    }
  }

  makePlayer() {
    this.player = this.physics.add.sprite(this.worldX + 120, FLOOR_Y - 60, 'cat0')
      .setDepth(20)
      .setCollideWorldBounds(false);
    this.player.jumpCount = 0;
    this.player.maxJumps  = this.cfg.hasDoubleJump ? 2 : 1;
    this.player.play('run');

    this.time.addEvent({ delay: 45, loop: true, callback: () => {
      if (!this.alive) return;
      const col = this.shielded    ? 0x42f5e8
                : this.doubleScore ? 0xf5e642
                : this.magnet      ? 0xff6eb4
                : 0xd0d7de;
      const d = this.add.circle(
        this.player.x - 6 + Phaser.Math.Between(-3, 3),
        this.player.y + 14,
        Phaser.Math.Between(2, 4), col, 0.4
      ).setDepth(18);
      this.tweens.add({ targets:d, alpha:0, scaleX:0, scaleY:0, duration:200, onComplete:()=>d.destroy() });
    }});
  }

  makeGroups() {
    this.bugGroup  = this.physics.add.group();
    this.coinGroup = this.physics.add.group();
    this.pupGroup  = this.physics.add.group();
  }

  makeInput() {
    const j = () => this.doJump();
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', j);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP).on('down', j);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W).on('down', j);
    this.input.on('pointerdown', j);
  }

  doJump() {
    if (!this.alive) return;
    if (this.player.jumpCount < this.player.maxJumps) {
      const vel = this.player.jumpCount === 0 ? -680 : -560;
      this.player.setVelocityY(vel);
      this.player.jumpCount++;
      this.sfx(this.player.jumpCount === 2 ? 'jump2' : 'jump');
      for (let i = 0; i < 5; i++) {
        const d = this.add.circle(
          this.player.x + Phaser.Math.Between(-8, 8),
          this.player.y + 14,
          Phaser.Math.Between(2, 5), 0xd0d7de, 0.55
        ).setDepth(18);
        this.tweens.add({ targets:d, y:d.y+10, alpha:0, scaleX:0, scaleY:0, duration:200, onComplete:()=>d.destroy() });
      }
      if (this.player.jumpCount === 2) this.cameras.main.shake(50, 0.004);
    }
  }

  makeColliders() {
    this.physics.add.collider(this.player, this.groundGroup, () => {
      this.player.jumpCount = 0;
    });
    this.physics.add.overlap(this.player, this.bugGroup,  this.onBug,    null, this);
    this.physics.add.overlap(this.player, this.coinGroup, this.onCoin,   null, this);
    this.physics.add.overlap(this.player, this.pupGroup,  this.onPowerup,null, this);
  }

  makeHUD() {
    this.dayText = this.add.text(
      W/2, 5,
      `Day 1 / ${this.cfg.totalDays}`,
      { fontFamily:'DM Mono,monospace', fontSize:'11px', color:'#5cd462' }
    ).setDepth(30).setOrigin(0.5, 0).setScrollFactor(0);

    this.speedBar = this.add.graphics().setDepth(30).setScrollFactor(0);
  }

  updateSpeedBar() {
    this.speedBar.clear();
    const pct = (this.speed - this.cfg.startSpeed) / (this.cfg.maxSpeed - this.cfg.startSpeed);
    this.speedBar.fillStyle(0x40c463, 0.3);
    this.speedBar.fillRect(W - 82, H - 8, 80, 5);
    this.speedBar.fillStyle(pct > 0.7 ? 0xff4455 : pct > 0.4 ? 0xf5e642 : 0x40c463, 0.8);
    this.speedBar.fillRect(W - 82, H - 8, 80 * pct, 5);
  }

  update(time, delta) {
    if (!this.alive) return;
    const dt = Math.min(delta / 1000, 0.05);
    this.elapsed += dt;

    const t = this.elapsed;
    if (t < 20) {
      this.targetSpeed = this.cfg.startSpeed + (this.cfg.baseSpeed - this.cfg.startSpeed) * (t / 20);
    } else {
      this.targetSpeed = this.cfg.baseSpeed + (this.cfg.maxSpeed - this.cfg.baseSpeed) * Math.min((t - 20) / 70, 1);
    }
    if (this.slowMode) this.targetSpeed *= 0.55;
    this.speed += (this.targetSpeed - this.speed) * dt * 2.5;

    this.worldX += this.speed * dt;
    this.cameras.main.scrollX = this.worldX;

    this.player.body.x = this.worldX + 120 - this.player.body.halfWidth;
    this.player.body.velocity.x = 0;

    while (this.spawnedX < this.worldX + W + TILE * 4) {
      this.spawnTileCol(this.spawnedX);
    }

    this.groundGroup.getChildren().forEach(tile => {
      if (tile.x < this.worldX - TILE * 3) {
        this.groundGroup.remove(tile, true, true);
      }
    });

    // Bugs
    if (this.elapsed > 3.5) {
      const bugRate = this.elapsed < 15
        ? this.cfg.bugStartRate
        : this.elapsed < 40
          ? Phaser.Math.Linear(this.cfg.bugStartRate, 1200, (this.elapsed - 15) / 25)
          : Phaser.Math.Linear(1200, this.cfg.bugMinRate, Math.min((this.elapsed - 40) / 50, 1));
      this.bugAccum += dt * 1000;
      if (this.bugAccum >= bugRate) {
        this.spawnBug();
        this.bugAccum = 0;
      }
    }

    this.coinAccum += dt * 1000;
    if (this.coinAccum >= 1400) { this.spawnCoins(); this.coinAccum = 0; }

    this.pupAccum += dt * 1000;
    if (this.pupAccum >= 12000) { this.spawnPowerup(); this.pupAccum = 0; }

    this.scoreAccum += dt;
    if (this.scoreAccum >= 0.08) {
      this.score += this.doubleScore ? 2 : 1;
      document.getElementById('hud-score').textContent = this.score;
      this.scoreAccum = 0;
    }

    const spd = this.speed;
    this.bugGroup.getChildren().forEach(b => {
      if (!b._customVX) b.setVelocityX(-spd);
    });
    this.coinGroup.getChildren().forEach(c => c.setVelocityX(-spd * 0.93));
    this.pupGroup.getChildren().forEach(p  => p.setVelocityX(-spd * 0.9));

    if (this.magnet) {
      this.coinGroup.getChildren().forEach(c => {
        const dx = this.player.x - c.x, dy = this.player.y - c.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 160) {
          c.setVelocityX(c.body.velocity.x + dx/dist * 400);
          c.setVelocityY(c.body.velocity.y + dy/dist * 400);
        }
      });
    }

    if (this.player.y > H + 40) this.pitDeath();

    // Animate fireflies with world scroll
    this.fireflies.forEach((ff, i) => {
      ff._phase += dt * ff._speed;
      ff.x = ff._baseX + this.worldX * 0.05 + Math.sin(ff._phase * 0.7) * 20;
      if (ff.x > this.worldX + W + 40) ff._baseX -= W + 80;
      if (ff.x < this.worldX - 40) ff._baseX += W + 80;
      ff.y = ff._baseY + Math.sin(ff._phase * 1.3) * 8;
    });

    // Player animation
    const vy = this.player.body.velocity.y;
    if (!this.godmode && !this.starMode) {
      if (vy < -80) {
        this.player.anims.stop();
        this.player.setTexture('cat_jump');
      } else if (vy > 80) {
        this.player.anims.stop();
        this.player.setTexture('cat_fall');
      } else if (this.player.body.blocked.down) {
        if (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key !== 'run') {
          this.player.play('run');
        }
      }
    }
    if (this.player.body.blocked.down) this.player.jumpCount = 0;

    const cullX = this.worldX - 100;
    [...this.bugGroup.getChildren(),
     ...this.coinGroup.getChildren(),
     ...this.pupGroup.getChildren()
    ].forEach(o => { if (o.x < cullX) o.destroy(); });

    if (this.shieldGfx) this.shieldGfx.setPosition(this.player.x, this.player.y);

    if (Math.random() < 0.012) {
      const s = Phaser.Utils.Array.GetRandom(this.stars);
      if (s) this.tweens.add({ targets:s, alpha:{from:s.alpha, to:0.03}, duration:160, yoyo:true });
    }

    this.cloudGfx.forEach(c => {
      c._x -= c._spd;
      if (c._x < -60) c._x = W + 60;
    });

    const day = Math.floor(this.worldX / TILE);
    this.dayText.setText(`Day ${Math.min(day + 1, this.cfg.totalDays)} / ${this.cfg.totalDays}`);
    this.updateSpeedBar();

    // ── Win condition ──────────────────────────────────────────────
    if (day >= this.cfg.totalDays && this.alive && !this.won) {
      this.won = true;
      this.winGame();
    }
  }

  spawnBug() {
    if (!this.alive) return;
    const spawnX = this.worldX + W + 50;
    const t      = this.elapsed;
    const roll   = Math.random();

    if (t < 12) {
      this.mkBug(spawnX, FLOOR_Y - 18, 'bug_box');

    } else if (t < 30) {
      if (roll < 0.5) this.mkBug(spawnX, FLOOR_Y - 18, 'bug_box');
      else            this.mkBug(spawnX, FLOOR_Y - 26, 'bug_merge');

    } else if (t < 55) {
      if      (roll < 0.32) this.mkBug(spawnX, FLOOR_Y - 18, 'bug_box');
      else if (roll < 0.58) this.mkBug(spawnX, FLOOR_Y - 26, 'bug_merge');
      else if (roll < 0.78) this.mkBug(spawnX, FLOOR_Y - 88, 'bug_ci', true);
      else {
        this.mkBug(spawnX,       FLOOR_Y - 18, 'bug_box');
        this.mkBug(spawnX + 110, FLOOR_Y - 14, 'bug_code');
      }

    } else {
      if      (roll < 0.25) this.mkBug(spawnX, FLOOR_Y - 18, 'bug_box');
      else if (roll < 0.44) this.mkBug(spawnX, FLOOR_Y - 26, 'bug_merge');
      else if (roll < 0.58) this.mkBug(spawnX, FLOOR_Y - 88, 'bug_ci', true);
      else if (roll < 0.70) {
        this.mkBug(spawnX,       FLOOR_Y - 14, 'bug_code');
        this.mkBug(spawnX + 160, FLOOR_Y - 88, 'bug_ci', true);
      } else if (roll < 0.83) {
        this.mkBug(spawnX,       FLOOR_Y - 18, 'bug_box');
        this.mkBug(spawnX + 130, FLOOR_Y - 18, 'bug_box');
      } else {
        this.mkBug(spawnX,       FLOOR_Y - 26, 'bug_merge');
        this.mkBug(spawnX + 120, FLOOR_Y - 14, 'bug_code');
        this.mkBug(spawnX + 250, FLOOR_Y - 88, 'bug_ci', true);
      }
    }
  }

  mkBug(worldX, worldY, tex, flying=false) {
    const sp = this.bugGroup.create(worldX, worldY, tex).setDepth(15);
    sp.body.allowGravity = false;
    sp.setVelocityX(-this.speed);
    if (flying) {
      this.tweens.add({ targets:sp, y:worldY - 30, duration:600, yoyo:true, repeat:-1, ease:'Sine.InOut' });
      sp._customVX = false;
    }
    this.tweens.add({ targets:sp, alpha:{from:0.8, to:1}, duration:200, yoyo:true, repeat:-1 });
    return sp;
  }

  spawnCoins() {
    if (!this.alive) return;
    const bx  = this.worldX + W + 40;
    const pat = Phaser.Math.Between(0, 2);
    const mk  = (x, y) => {
      const c = this.coinGroup.create(x, y, 'coin').setDepth(14);
      c.body.allowGravity = false;
      c.setVelocityX(-this.speed * 0.93);
      this.tweens.add({ targets:c, y:y - 8, duration:460, yoyo:true, repeat:-1, ease:'Sine.InOut' });
      this.tweens.add({ targets:c, angle:360, duration:900, repeat:-1 });
    };
    if      (pat === 0) { for (let i=0; i<4; i++) mk(bx + i*44, FLOOR_Y - 62); }
    else if (pat === 1) { for (let i=0; i<5; i++) mk(bx + i*36, FLOOR_Y - 52 - Math.sin(i/4*Math.PI)*66); }
    else                { for (let i=0; i<5; i++) mk(bx + i*40, i%2===0 ? FLOOR_Y-58 : FLOOR_Y-118); }
  }

  spawnPowerup() {
    if (!this.alive) return;
    const all  = ['pu_shield','pu_2x','pu_slow','pu_magnet','pu_star','pu_life'];
    const pool = this.lives < 3 ? all : all.filter(t => t !== 'pu_life');
    const type = Phaser.Utils.Array.GetRandom(pool);

    const p = this.pupGroup.create(this.worldX + W + 50, FLOOR_Y - 85, type).setDepth(15);
    p.puType = type;
    p.body.allowGravity = false;
    p.setVelocityX(-this.speed * 0.9);
    this.tweens.add({ targets:p, y:p.y - 18, duration:680, yoyo:true, repeat:-1, ease:'Sine.InOut' });
    this.tweens.add({ targets:p, angle:360,   duration:1800, repeat:-1 });
  }

  onBug(player, bug) {
    if (this.godmode) return;
    if (this.starMode) { bug.destroy(); return; }
    if (this.shielded) {
      this.shielded = false; this.deactivateShield();
      this.burst(bug.x, bug.y, 'pd_c', 12);
      this.announce('🛡️ SHIELD BLOCKED THE BUG!', '#42f5e8');
      this.cameras.main.shake(130, 0.014);
      bug.destroy(); return;
    }

    this.lives--;
    updateHearts(this.lives);
    this.sfx('hit');
    this.burst(player.x, player.y, 'pd_r', 14);
    this.cameras.main.shake(230, 0.022);
    this.score = Math.max(0, this.score - 50);
    document.getElementById('hud-score').textContent = this.score;
    this.floatText(player.x, player.y - 22, '-50', '#ff4455');
    bug.destroy();
    player.setTexture('cat_hit');

    this.godmode = true;
    let f = 0;
    const fl = this.time.addEvent({ delay:80, repeat:15, callback: () => {
      player.setAlpha(player.alpha < 0.5 ? 1 : 0.12);
      if (++f >= 16) {
        player.setAlpha(1);
        player.play('run');
        this.godmode = false;
        fl.destroy();
      }
    }});

    if (this.lives <= 0) this.endGame();
  }

  onCoin(player, coin) {
    const val = this.doubleScore ? this.cfg.coinValue * 2 : this.cfg.coinValue;
    this.score += val; this.coinCount++;
    document.getElementById('hud-score').textContent = this.score;
    this.sfx('coin');
    this.burst(coin.x, coin.y, 'pd_b', 8);
    this.floatText(coin.x, coin.y - 10, `+${val}`, this.doubleScore ? '#f5e642' : '#79c0ff');
    coin.destroy();
  }

  onPowerup(player, p) {
    const type = p.puType; p.destroy();
    this.sfx('pu');
    this.cameras.main.flash(90, 255, 255, 255, false);

    if (type === 'pu_shield') {
      this.activateShield();
      this.announce('🛡️ SHIELD — absorbs one hit or pit!', '#42f5e8');

    } else if (type === 'pu_2x') {
      this.doubleScore = true;
      this.announce(`⭐ DOUBLE COMMITS! Coins worth ${this.cfg.coinValue*2}pts!`, '#f5e642');
      this.burst(player.x, player.y, 'pd_y', 20);
      this.time.delayedCall(7000, () => { this.doubleScore = false; });

    } else if (type === 'pu_slow') {
      this.slowMode = true;
      this.announce('⏱️ SLOW TIME — breathe…', '#ff8c42');
      this.burst(player.x, player.y, 'pd_o', 16);
      this.time.delayedCall(5500, () => { this.slowMode = false; });

    } else if (type === 'pu_magnet') {
      this.magnet = true;
      this.announce('🧲 COMMIT MAGNET — coins fly to you!', '#ff6eb4');
      this.burst(player.x, player.y, 'pd_c', 16);
      this.time.delayedCall(6000, () => { this.magnet = false; });

    } else if (type === 'pu_star') {
      this.starMode = true;
      this.announce('⭐ INVINCIBILITY STAR — NOTHING CAN STOP YOU!', '#ffffff');
      this.burst(player.x, player.y, 'pd_w', 24);
      const colors = [0xf5e642,0xff8c42,0xff4455,0x42f5e8,0x9ef5a2,0xff6eb4];
      let ci = 0;
      const rainbow = this.time.addEvent({ delay:80, repeat:50, callback: () => {
        player.setTint(colors[ci++ % colors.length]);
      }});
      this.time.delayedCall(4500, () => {
        this.starMode = false; player.clearTint(); rainbow.destroy();
        player.play('run');
      });

    } else if (type === 'pu_life') {
      if (this.lives < 3) {
        this.lives++;
        updateHearts(this.lives);
        this.sfx('life');
        this.announce('❤️ EXTRA LIFE!', '#ff4455');
        this.burst(player.x, player.y, 'pd_r', 20);
        this.floatText(player.x, player.y - 30, '+1 LIFE', '#ff4455');
      }
    }
  }

  pitDeath() {
    if (this.shielded) {
      this.shielded = false; this.deactivateShield();
      this.player.setPosition(this.worldX + 120, FLOOR_Y - 80);
      this.player.setVelocityY(-200);
      this.announce('🛡️ SHIELD SAVED YOU FROM THE PIT!', '#42f5e8');
      return;
    }
    if (this.starMode) {
      this.player.setPosition(this.worldX + 120, FLOOR_Y - 80);
      this.player.setVelocityY(-200);
      return;
    }
    this.lives--;
    updateHearts(this.lives);
    this.sfx('fall');
    this.burst(this.player.x, H, 'pd_r', 18);
    const streak = this.gd.stats.max_break;
    this.announce(
      `💀 FELL INTO A ${streak > 30 ? 'COMMIT DROUGHT' : 'GAP'} (${streak}d break)!`,
      '#ff4455'
    );
    if (this.lives <= 0) { this.endGame(); return; }
    this.player.setPosition(this.worldX + 120, FLOOR_Y - 80);
    this.player.setVelocity(0, 0);
    this.godmode = true; this.player.setAlpha(0.38);
    this.time.delayedCall(1500, () => { this.player.setAlpha(1); this.godmode = false; });
  }

  activateShield() {
    this.shielded = true;
    if (this.shieldGfx) this.shieldGfx.destroy();
    this.shieldGfx = this.add.circle(this.player.x, this.player.y, 30, 0x42f5e8, 0.22).setDepth(22);
    this.tweens.add({ targets:this.shieldGfx, alpha:{from:0.08, to:0.38}, duration:460, yoyo:true, repeat:-1 });
  }

  deactivateShield() {
    if (!this.shieldGfx) return;
    const g = this.shieldGfx; this.shieldGfx = null;
    this.tweens.add({ targets:g, alpha:0, scaleX:2, scaleY:2, duration:200, onComplete:()=>g.destroy() });
  }

  burst(x, y, tex, n) {
    for (let i = 0; i < n; i++) {
      const a  = Math.random() * Math.PI * 2;
      const sp = Phaser.Math.Between(50, 190);
      const d  = this.add.image(x, y, tex).setDepth(26).setScale(0.85);
      this.tweens.add({ targets:d,
        x: x + Math.cos(a)*sp*0.4,
        y: y + Math.sin(a)*sp*0.4,
        alpha:0, scaleX:0, scaleY:0,
        duration: Phaser.Math.Between(200, 460),
        onComplete: () => d.destroy()
      });
    }
  }

  floatText(x, y, msg, color='#9ef5a2') {
    const t = this.add.text(x, y, msg, {
      fontFamily: 'DM Mono,monospace', fontSize: '18px',
      color, stroke: '#060e07', strokeThickness: 3
    }).setDepth(30).setOrigin(0.5);
    this.tweens.add({ targets:t, y:y - 46, alpha:0, duration:680, ease:'Quad.Out', onComplete:()=>t.destroy() });
  }

  announce(txt, color='#f5e642') {
    const el = document.getElementById('powerup-announce');
    el.textContent = txt;
    el.style.color = color;
    el.style.borderColor = color + '88';
    el.style.display = 'block';
    clearTimeout(this._at);
    this._at = setTimeout(() => el.style.display = 'none', 3200);
  }

  winGame() {
    this.alive = false;
    this.sfx('win');
    if (this.ac) { try { this.ac.suspend(); } catch(e) {} }
    this.player.setVelocityX(0);

    // Rainbow celebration bursts
    ['pd_g','pd_y','pd_r','pd_c','pd_o','pd_w','pd_b'].forEach((tex, i) => {
      this.time.delayedCall(i * 80, () => {
        for (let j = 0; j < 18; j++) this.burst(
          Phaser.Math.Between(100, W - 100),
          Phaser.Math.Between(50, H - 80),
          tex, 10
        );
      });
    });

    this.time.delayedCall(900, () => {
      document.getElementById('hud').classList.remove('visible');
      const days = this.cfg.totalDays;
      const tot  = this.gd.stats.total;
      const rec  = this.coinCount;
      const pct  = tot > 0 ? Math.round(rec / tot * 100) : 0;
      const shareText = `🌿 I just survived all ${days} days of my GitHub history in TouchGrass! Score: ${this.score} | ${rec}/${tot} commits reclaimed (${pct}%) as ${this.gd.class.emoji} ${this.gd.class.name}`;

      document.getElementById('win-emoji').textContent  = this.gd.class.emoji;
      document.getElementById('win-class').textContent  = `${this.gd.class.emoji} ${this.gd.class.name}`;
      document.getElementById('win-score').textContent  = this.score;
      document.getElementById('win-days').textContent   = `${days} days`;
      document.getElementById('win-coins').textContent  = `${rec}/${tot} (${pct}%)`;
      document.getElementById('win-screen').classList.add('visible');

      document.getElementById('win-retry-btn').onclick = () => {
        document.getElementById('win-screen').classList.remove('visible');
        document.getElementById('hud').classList.add('visible');
        updateHearts(3);
        document.getElementById('hud-score').textContent = '0';
        if (this.ac) { try { this.ac.resume(); } catch(e) {} }
        this.cameras.main.scrollX = 0;
        this.scene.restart();
      };

      document.getElementById('win-share').onclick = () => {
        if (navigator.share) {
          navigator.share({ text: shareText }).catch(() => {});
        } else {
          navigator.clipboard.writeText(shareText).then(() => {
            document.getElementById('win-share').textContent = '✅ Copied to clipboard!';
          }).catch(() => {
            // Fallback: prompt with text
            prompt('Copy your result:', shareText);
          });
        }
      };
    });
  }

  endGame() {
    this.alive = false;
    this.sfx('die');
    if (this.ac) { try { this.ac.suspend(); } catch(e) {} }
    this.player.setVelocityX(0);
    this.player.setVelocityY(-320);

    this.time.delayedCall(950, () => {
      document.getElementById('hud').classList.remove('visible');
      const days = Math.floor(this.worldX / TILE);
      const tot  = this.gd.stats.total;
      const rec  = this.coinCount;
      const pct  = tot > 0 ? Math.round(rec / tot * 100) : 0;

      document.getElementById('go-emoji').textContent    = this.gd.class.emoji;
      document.getElementById('go-class').textContent    = `${this.gd.class.emoji} ${this.gd.class.name}`;
      document.getElementById('go-score').textContent    = this.score;
      document.getElementById('go-distance').textContent = `${days} days`;
      document.getElementById('go-coins').textContent    = `${rec}/${tot} (${pct}%)`;
      document.getElementById('gameover-screen').classList.add('visible');

      document.getElementById('retry-btn').onclick = () => {
        document.getElementById('gameover-screen').classList.remove('visible');
        document.getElementById('hud').classList.add('visible');
        updateHearts(3);
        document.getElementById('hud-score').textContent = '0';
        if (this.ac) { try { this.ac.resume(); } catch(e) {} }
        this.cameras.main.scrollX = 0;
        this.scene.restart();
      };
    });
  }
}

init();