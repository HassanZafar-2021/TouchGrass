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
  bootGame();
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

// ── Level config ──────────────────────────────────────────────────────
function buildConfig(data) {
  const grid = (data.grid || []).slice(-120);

  // Convert each day to a segment.
  // Rule: gaps need at least 3 solid tiles of runway before the next gap —
  // so even a user with 60 zero-day breaks gets a playable level.
  const segments  = [];
  let solidSince  = 0; // tiles since last gap

  grid.forEach(d => {
    if (d.count === 0 && solidSince >= 3) {
      segments.push({ type: 'gap' });
      solidSince = 0;
    } else {
      // Zero-day that can't be a gap becomes a thin low tile
      solidSince++;
      if (d.count >= 10)     segments.push({ type: 'high', count: d.count });
      else if (d.count >= 4) segments.push({ type: 'mid',  count: d.count });
      else                   segments.push({ type: 'low',  count: Math.max(d.count, 1) });
    }
  });

  // Guarantee enough segments to scroll indefinitely (loop them)
  while (segments.length < 60) {
    segments.push(...segments.slice(0, Math.max(1, segments.length)));
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

  // ── create ──────────────────────────────────────────────────────────
  create() {
    this.cfg  = this.registry.get('cfg');
    this.gd   = this.registry.get('gd');

    // ── State ──────────────────────────────────────────────────────
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
    this.elapsed     = 0;    // total seconds played
    this.worldX      = 0;    // how far camera has scrolled
    this.spawnedX    = 0;    // how far right tiles have been generated
    this.segIdx      = 0;    // next segment index to consume

    // Speed state
    this.speed       = this.cfg.startSpeed;
    this.targetSpeed = this.cfg.startSpeed;

    // Delta-based accumulators
    this.scoreAccum  = 0;
    this.bugAccum    = 0;
    this.coinAccum   = 0;
    this.pupAccum    = 0;

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
      this.announce('🎮 SPACE / TAP to jump — double jump unlocked!', '#9ef5a2');
  }

  // ── Segment helpers ─────────────────────────────────────────────────
  // Returns the next segment from the level, looping when exhausted
  getNextSeg() {
    const seg = this.cfg.segments[this.segIdx % this.cfg.segments.length];
    this.segIdx++;
    return seg;
  }

  // Returns the world-Y of the TOP surface of a tile column
  tileTop(seg) {
    switch (seg.type) {
      case 'high': return FLOOR_Y - TILE * 2;
      case 'mid':  return FLOOR_Y - TILE;
      default:     return FLOOR_Y;          // 'low' and default
    }
  }

  // Returns the appropriate tile texture key for a segment
  tileTex(seg) {
    switch (seg.type) {
      case 'high': return 'tile_high';
      case 'mid':  return 'tile_mid';
      default:     return 'tile_low';
    }
  }

  // ── Animations ───────────────────────────────────────────────────────
  makeAnimations() {
    // Only register once (scene restart would try to re-add otherwise)
    if (this.anims.exists('run')) return;

    this.anims.create({
      key: 'run',
      frames: [
        { key: 'run0' }, { key: 'run1' },
        { key: 'run2' }, { key: 'run3' },
      ],
      frameRate: 12,
      repeat: -1,
    });
  }

  // ── Textures ─────────────────────────────────────────────────────────
  makeTextures() {
    if (this.textures.exists('player')) return;
    const g = this.add.graphics();

    // Draw one player frame — body color, leg color, left-leg Y offset, right-leg Y offset
    const mkP = (key, bodyCol, legCol, lly, rly) => {
      lly = lly || 0; rly = rly || 0;
      g.clear();
      g.fillStyle(bodyCol); g.fillRect(2, 0, 28, 26);
      g.fillStyle(0x9ef5a2); g.fillRect(5, 4, 9, 8); g.fillRect(18, 4, 9, 8);
      g.fillStyle(0x060e07); g.fillRect(7, 6, 5, 4);  g.fillRect(20, 6, 5, 4);
      g.fillStyle(0x060e07); g.fillRect(9, 18, 14, 4);
      g.fillStyle(legCol);
      g.fillRect(2,  24 + lly, 10, 10);
      g.fillRect(20, 24 + rly, 10, 10);
      g.generateTexture(key, 32, 38); g.clear();
    };

    // 4-frame run cycle — legs alternate up/down
    mkP('run0', 0x40c463, 0x216e39,  0, -4);
    mkP('run1', 0x40c463, 0x216e39, -2, -2);
    mkP('run2', 0x40c463, 0x216e39, -4,  0);
    mkP('run3', 0x40c463, 0x216e39, -2, -2);

    // Air / hit states
    mkP('player_jump', 0x5cd462, 0x30a14e, -5, -5);
    mkP('player_fall', 0x2d8a32, 0x1a4820,  2,  2);
    mkP('player_hit',  0xff5566, 0xaa1122,  0,  0);
    mkP('player',      0x40c463, 0x216e39,  0,  0);

    // Ground tiles — 3 heights
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

    // Column filler (below top tile)
    g.fillStyle(0x122d14); g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x1a4820); g.fillRect(1, 0, TILE-2, 4);
    g.generateTexture('tile_fill', TILE, TILE); g.clear();

    // Gap danger tint (visual only, no physics body)
    g.fillStyle(0xff1122, 0.18); g.fillRect(0, 0, TILE, H);
    g.generateTexture('gap_warn', TILE, H); g.clear();

    // Ground bug (40×24)
    g.fillStyle(0xcc1122); g.fillRect(0, 2, 40, 22);
    g.fillStyle(0xaa0011); g.fillRect(0, 2, 40, 8);
    g.fillStyle(0xff7788); g.fillRect(4, 3, 8, 5); g.fillRect(28, 3, 8, 5);
    g.fillStyle(0xffffff); g.fillRect(5, 4, 4, 3); g.fillRect(29, 4, 4, 3);
    g.fillStyle(0x880011); g.fillRect(8, 14, 24, 8);
    g.fillStyle(0xffaaaa); g.fillRect(10,16, 4, 4); g.fillRect(26,16, 4, 4);
    g.fillStyle(0xcc1122); g.fillRect(8, 0, 3, 4);  g.fillRect(29, 0, 3, 4);
    g.generateTexture('bug', 40, 24); g.clear();

    // Tall bug (26×54)
    g.fillStyle(0xcc1122); g.fillRect(0, 0, 26, 54);
    g.fillStyle(0xaa0011); g.fillRect(0, 0, 26, 9);
    g.fillStyle(0xff7788); g.fillRect(3, 2, 7, 5); g.fillRect(16, 2, 7, 5);
    g.fillStyle(0xffffff); g.fillRect(4, 3, 3, 3); g.fillRect(17, 3, 3, 3);
    [14, 26, 38].forEach(y => { g.fillStyle(0x880011); g.fillRect(3, y, 20, 8); });
    g.fillStyle(0xcc1122); g.fillRect(4, 0, 3, 4); g.fillRect(18, 0, 3, 4);
    g.generateTexture('bug_tall', 26, 54); g.clear();

    // Flying bug (34×20)
    g.fillStyle(0xff7700); g.fillRect(0, 6, 34, 14);
    g.fillStyle(0xffaa00); g.fillRect(0, 6, 34, 6);
    g.fillStyle(0xffffff, 0.35); g.fillRect(0, 6, 34, 3);
    g.fillStyle(0xff4400); g.fillRect(4, 14, 8, 6); g.fillRect(22, 14, 8, 6);
    g.fillStyle(0xffdd00, 0.75); g.fillRect(6, 0, 10, 8); g.fillRect(18, 0, 10, 8);
    g.generateTexture('bug_fly', 34, 20); g.clear();

    // Coin (26×26)
    g.fillStyle(0xb8860b); g.fillCircle(13, 13, 13);
    g.fillStyle(0xf5e642); g.fillCircle(13, 13, 9);
    g.fillStyle(0xfff9c4); g.fillCircle(13, 13, 5);
    g.fillStyle(0xffffff, 0.8); g.fillCircle(9, 9, 3);
    g.generateTexture('coin', 26, 26); g.clear();

    // Shield powerup (30×30)
    g.fillStyle(0x42f5e8); g.fillCircle(15, 15, 15);
    g.fillStyle(0x060e07); g.fillCircle(15, 15, 10);
    g.fillStyle(0x42f5e8); g.fillRect(11, 5, 8, 20); g.fillRect(5, 11, 20, 8);
    g.generateTexture('pu_shield', 30, 30); g.clear();

    // 2× powerup
    g.fillStyle(0xf5e642); g.fillCircle(15, 15, 15);
    g.fillStyle(0x060e07); g.fillRect(5, 13, 20, 4); g.fillRect(13, 5, 4, 20);
    g.fillStyle(0xf5e642); g.fillCircle(15, 15, 4);
    g.generateTexture('pu_2x', 30, 30); g.clear();

    // Slow powerup
    g.fillStyle(0xff8c42); g.fillCircle(15, 15, 15);
    g.fillStyle(0x060e07);
    g.fillTriangle(5, 5, 25, 5, 15, 15);
    g.fillTriangle(5, 25, 25, 25, 15, 15);
    g.generateTexture('pu_slow', 30, 30); g.clear();

    // Magnet powerup
    g.fillStyle(0xff6eb4); g.fillCircle(15, 15, 15);
    g.fillStyle(0x060e07); g.fillRect(6, 8, 6, 16); g.fillRect(18, 8, 6, 16);
    g.fillStyle(0x060e07); g.fillRect(6, 8, 18, 6);
    g.fillStyle(0xff6eb4); g.fillRect(7, 9, 4, 6); g.fillRect(19, 9, 4, 6);
    g.generateTexture('pu_magnet', 30, 30); g.clear();

    // Star powerup
    g.fillStyle(0xffffff); g.fillCircle(15, 15, 15);
    g.fillStyle(0xf5e642); g.fillCircle(15, 15, 10);
    g.fillStyle(0xff8c42); g.fillCircle(15, 15, 6);
    g.fillStyle(0xffffff); g.fillCircle(15, 15, 3);
    g.generateTexture('pu_star', 30, 30); g.clear();

    // Life powerup
    g.fillStyle(0xff4455); g.fillCircle(10, 10, 10);
    g.fillStyle(0xff4455); g.fillCircle(20, 10, 10);
    g.fillStyle(0xff4455); g.fillTriangle(2, 14, 28, 14, 15, 26);
    g.fillStyle(0xff8899); g.fillCircle(10, 8, 5); g.fillCircle(20, 8, 5);
    g.generateTexture('pu_life', 30, 26); g.clear();

    // Particle dots
    [['pd_g',0x5cd462],['pd_y',0xf5e642],['pd_r',0xff4455],
     ['pd_c',0x42f5e8],['pd_o',0xff8c42],['pd_w',0xffffff]].forEach(([k,c])=>{
      g.fillStyle(c); g.fillCircle(4, 4, 4);
      g.generateTexture(k, 8, 8); g.clear();
    });

    g.destroy();
  }

  // ── Background ───────────────────────────────────────────────────────
  makeBg() {
    const sky = this.add.graphics().setDepth(0);
    sky.fillGradientStyle(0x050d06, 0x050d06, 0x0b1c0d, 0x0b1c0d, 1);
    sky.fillRect(0, 0, W, H);

    // Stars
    this.stars = [];
    for (let i = 0; i < 65; i++) {
      const s = this.add.circle(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(0, H * 0.7),
        Phaser.Math.Between(1, 2),
        0x9ef5a2,
        Phaser.Math.FloatBetween(0.08, 0.45)
      ).setDepth(1);
      this.stars.push(s);
    }

    // Clouds
    this.cloudGfx = [];
    for (let i = 0; i < 5; i++) {
      const cg = this.add.graphics().setDepth(2).setAlpha(0.18);
      const cx = Phaser.Math.Between(0, W);
      const cy = Phaser.Math.Between(10, 75);
      cg.fillStyle(0x1a4820);
      cg.fillCircle(cx, cy, 15);
      cg.fillCircle(cx+18, cy-6, 19);
      cg.fillCircle(cx+36, cy, 13);
      cg._x   = cx;
      cg._spd = Phaser.Math.FloatBetween(0.15, 0.4);
      this.cloudGfx.push(cg);
    }

    // Contribution ghost calendar in sky
    const cal  = this.add.graphics().setDepth(1).setAlpha(0.06);
    const segs = this.cfg.segments;
    const cw   = (W - 20) / Math.min(segs.length, 52);
    segs.forEach((s, i) => {
      const col = s.type==='gap' ? 0x110000 : s.type==='high' ? 0x40c463 : s.type==='mid' ? 0x30a14e : 0x1a4820;
      cal.fillStyle(col);
      cal.fillRect(10 + (i%52)*cw, H - 14 - Math.floor(i/52)*9, cw - 1, 7);
    });

    // Horizon line
    const hor = this.add.graphics().setDepth(3);
    hor.fillStyle(0x40c463, 0.12);
    hor.fillRect(0, FLOOR_Y - 1, W, 2);
  }

  // ── Audio ────────────────────────────────────────────────────────────
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
  }

  // ── Ground generation ────────────────────────────────────────────────
  makeGround() {
    this.groundGroup = this.physics.add.staticGroup();

    // Pre-fill the screen with tiles
    const initCols = Math.ceil(W / TILE) + 8;
    for (let col = 0; col < initCols; col++) {
      this.spawnTileCol(col * TILE);
    }
  }

  // Spawn one vertical column of tiles at the given world X
  spawnTileCol(worldX) {
    const seg  = this.getNextSeg();
    const topY = this.tileTop(seg);

    if (seg.type !== 'gap') {
      // Surface tile
      const surf = this.groundGroup.create(
        worldX + TILE/2, topY + TILE/2,
        this.tileTex(seg)
      ).setDepth(6);
      surf.refreshBody();

      // Fill column downward
      let fy = topY + TILE;
      while (fy <= FLOOR_Y + TILE) {
        const fill = this.groundGroup.create(
          worldX + TILE/2, fy + TILE/2, 'tile_fill'
        ).setDepth(5);
        fill.refreshBody();
        fy += TILE;
      }
    } else {
      // Visual-only gap warning
      this.add.image(worldX + TILE/2, H/2, 'gap_warn').setDepth(4).setScrollFactor(1);
    }

    this.spawnedX = worldX + TILE;
  }

  // ── Player ───────────────────────────────────────────────────────────
  makePlayer() {
    this.player = this.physics.add.sprite(this.worldX + 120, FLOOR_Y - 60, 'run0')
      .setDepth(20)
      .setCollideWorldBounds(false);
    this.player.jumpCount = 0;
    this.player.maxJumps  = this.cfg.hasDoubleJump ? 2 : 1;
    this.player.play('run');

    // Trail
    this.time.addEvent({ delay: 45, loop: true, callback: () => {
      if (!this.alive) return;
      const col = this.shielded    ? 0x42f5e8
                : this.doubleScore ? 0xf5e642
                : this.magnet      ? 0xff6eb4
                : 0x40c463;
      const d = this.add.circle(
        this.player.x - 6 + Phaser.Math.Between(-3, 3),
        this.player.y + 10,
        Phaser.Math.Between(2, 5), col, 0.5
      ).setDepth(18);
      this.tweens.add({ targets:d, alpha:0, scaleX:0, scaleY:0, duration:230, onComplete:()=>d.destroy() });
    }});
  }

  // ── Groups ───────────────────────────────────────────────────────────
  makeGroups() {
    this.bugGroup  = this.physics.add.group();
    this.coinGroup = this.physics.add.group();
    this.pupGroup  = this.physics.add.group();
  }

  // ── Input ────────────────────────────────────────────────────────────
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
          Phaser.Math.Between(2, 5), 0x40c463, 0.55
        ).setDepth(18);
        this.tweens.add({ targets:d, y:d.y+10, alpha:0, scaleX:0, scaleY:0, duration:200, onComplete:()=>d.destroy() });
      }
      if (this.player.jumpCount === 2) this.cameras.main.shake(50, 0.004);
    }
  }

  // ── Colliders ────────────────────────────────────────────────────────
  makeColliders() {
    this.physics.add.collider(this.player, this.groundGroup, () => {
      this.player.jumpCount = 0;
    });
    this.physics.add.overlap(this.player, this.bugGroup,  this.onBug,    null, this);
    this.physics.add.overlap(this.player, this.coinGroup, this.onCoin,   null, this);
    this.physics.add.overlap(this.player, this.pupGroup,  this.onPowerup,null, this);
  }

  // ── In-scene HUD extras ──────────────────────────────────────────────
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

  // ── Main update loop ─────────────────────────────────────────────────
  update(time, delta) {
    if (!this.alive) return;
    const dt = Math.min(delta / 1000, 0.05);
    this.elapsed += dt;

    // ── Progressive speed ramp ───────────────────────────────────────
    const t = this.elapsed;
    if (t < 20) {
      this.targetSpeed = this.cfg.startSpeed + (this.cfg.baseSpeed - this.cfg.startSpeed) * (t / 20);
    } else {
      this.targetSpeed = this.cfg.baseSpeed + (this.cfg.maxSpeed - this.cfg.baseSpeed) * Math.min((t - 20) / 70, 1);
    }
    if (this.slowMode) this.targetSpeed *= 0.55;
    this.speed += (this.targetSpeed - this.speed) * dt * 2.5;

    // ── Scroll camera ────────────────────────────────────────────────
    this.worldX += this.speed * dt;
    this.cameras.main.scrollX = this.worldX;

    // ── Pin player to fixed screen column — X only, never touch Y ────
    // body.x is the left edge; sprite.x (center) = worldX + 120
    this.player.body.x = this.worldX + 120 - this.player.body.halfWidth;
    this.player.body.velocity.x = 0;

    // ── Spawn tiles ahead of camera ──────────────────────────────────
    while (this.spawnedX < this.worldX + W + TILE * 4) {
      this.spawnTileCol(this.spawnedX);
    }

    // ── Cull tiles behind camera ─────────────────────────────────────
    this.groundGroup.getChildren().forEach(tile => {
      if (tile.x < this.worldX - TILE * 3) {
        this.groundGroup.remove(tile, true, true);
      }
    });

    // ── Bug spawning ─────────────────────────────────────────────────
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

    // ── Coin spawning ────────────────────────────────────────────────
    this.coinAccum += dt * 1000;
    if (this.coinAccum >= 1400) { this.spawnCoins(); this.coinAccum = 0; }

    // ── Powerup spawning ─────────────────────────────────────────────
    this.pupAccum += dt * 1000;
    if (this.pupAccum >= 12000) { this.spawnPowerup(); this.pupAccum = 0; }

    // ── Score accumulation ───────────────────────────────────────────
    this.scoreAccum += dt;
    if (this.scoreAccum >= 0.08) {
      this.score += this.doubleScore ? 2 : 1;
      document.getElementById('hud-score').textContent = this.score;
      this.scoreAccum = 0;
    }

    // ── Sync enemy velocities to current speed ───────────────────────
    const spd = this.speed;
    this.bugGroup.getChildren().forEach(b => {
      if (!b._customVX) b.setVelocityX(-spd);
    });
    this.coinGroup.getChildren().forEach(c => c.setVelocityX(-spd * 0.93));
    this.pupGroup.getChildren().forEach(p  => p.setVelocityX(-spd * 0.9));

    // ── Magnet — pull nearby coins ───────────────────────────────────
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

    // ── Pit death ────────────────────────────────────────────────────
    if (this.player.y > H + 40) this.pitDeath();

    // ── Player animation by state ────────────────────────────────────
    const vy = this.player.body.velocity.y;
    if (!this.godmode) {
      if (vy < -80) {
        // Rising — show jump texture (stop run cycle)
        if (this.player.anims.currentAnim?.key !== 'jump_hold') {
          this.player.anims.stop();
          this.player.setTexture('player_jump');
        }
      } else if (vy > 80) {
        // Falling
        if (this.player.anims.currentAnim?.key !== 'fall_hold') {
          this.player.anims.stop();
          this.player.setTexture('player_fall');
        }
      } else if (this.player.body.blocked.down) {
        // Grounded — play run cycle
        if (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key !== 'run') {
          this.player.play('run');
        }
      }
    }
    if (this.player.body.blocked.down) this.player.jumpCount = 0;

    // ── Cull off-screen enemies ──────────────────────────────────────
    const cullX = this.worldX - 100;
    [...this.bugGroup.getChildren(),
     ...this.coinGroup.getChildren(),
     ...this.pupGroup.getChildren()
    ].forEach(o => { if (o.x < cullX) o.destroy(); });

    // ── Shield follows player ────────────────────────────────────────
    if (this.shieldGfx) this.shieldGfx.setPosition(this.player.x, this.player.y);

    // ── Star twinkle ─────────────────────────────────────────────────
    if (Math.random() < 0.012) {
      const s = Phaser.Utils.Array.GetRandom(this.stars);
      if (s) this.tweens.add({ targets:s, alpha:{from:s.alpha, to:0.03}, duration:160, yoyo:true });
    }

    // ── Cloud drift ──────────────────────────────────────────────────
    this.cloudGfx.forEach(c => {
      c._x -= c._spd;
      if (c._x < -50) c._x = W + 50;
    });

    // ── Day counter ──────────────────────────────────────────────────
    const day = Math.floor(this.worldX / TILE);
    this.dayText.setText(`Day ${Math.min(day + 1, this.cfg.totalDays)} / ${this.cfg.totalDays}`);

    // ── Speed bar ────────────────────────────────────────────────────
    this.updateSpeedBar();
  }

  // ── Bug spawning — progressive difficulty ───────────────────────────
  spawnBug() {
    if (!this.alive) return;
    const spawnX = this.worldX + W + 50;
    const t      = this.elapsed;
    const roll   = Math.random();

    if (t < 12) {
      // Easy: only ground bugs
      this.mkBug(spawnX, FLOOR_Y - 12, 'bug');

    } else if (t < 30) {
      // Medium: ground + tall
      if (roll < 0.55) this.mkBug(spawnX, FLOOR_Y - 12, 'bug');
      else             this.mkBug(spawnX, FLOOR_Y - 27, 'bug_tall');

    } else if (t < 55) {
      // Hard: all types
      if      (roll < 0.35) this.mkBug(spawnX, FLOOR_Y - 12, 'bug');
      else if (roll < 0.60) this.mkBug(spawnX, FLOOR_Y - 27, 'bug_tall');
      else if (roll < 0.82) this.mkBug(spawnX, FLOOR_Y - 95, 'bug_fly', true);
      else {
        this.mkBug(spawnX,       FLOOR_Y - 12, 'bug');
        this.mkBug(spawnX + 110, FLOOR_Y - 12, 'bug');
      }

    } else {
      // Brutal: combos
      if      (roll < 0.28) this.mkBug(spawnX, FLOOR_Y - 12, 'bug');
      else if (roll < 0.48) this.mkBug(spawnX, FLOOR_Y - 27, 'bug_tall');
      else if (roll < 0.62) this.mkBug(spawnX, FLOOR_Y - 95, 'bug_fly', true);
      else if (roll < 0.76) {
        this.mkBug(spawnX,       FLOOR_Y - 12, 'bug');
        this.mkBug(spawnX + 160, FLOOR_Y - 92, 'bug_fly', true);
      } else if (roll < 0.88) {
        this.mkBug(spawnX,       FLOOR_Y - 12, 'bug');
        this.mkBug(spawnX + 130, FLOOR_Y - 12, 'bug');
      } else {
        this.mkBug(spawnX,       FLOOR_Y - 27, 'bug_tall');
        this.mkBug(spawnX + 140, FLOOR_Y - 12, 'bug');
        this.mkBug(spawnX + 240, FLOOR_Y - 92, 'bug_fly', true);
      }
    }
  }

  mkBug(worldX, worldY, tex, flying=false) {
    const sp = this.bugGroup.create(worldX, worldY, tex).setDepth(15);
    sp.body.allowGravity = false;
    sp.setVelocityX(-this.speed);
    if (flying) {
      this.tweens.add({ targets:sp, y:worldY - 36, duration:520, yoyo:true, repeat:-1, ease:'Sine.InOut' });
      sp._customVX = false;
    }
    this.tweens.add({ targets:sp, alpha:{from:0.82, to:1}, duration:180, yoyo:true, repeat:-1 });
    return sp;
  }

  // ── Coins ────────────────────────────────────────────────────────────
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

  // ── Powerups ─────────────────────────────────────────────────────────
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

  // ── Collision handlers ───────────────────────────────────────────────
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
    player.setTexture('player_hit');

    this.godmode = true;
    let f = 0;
    const fl = this.time.addEvent({ delay:80, repeat:15, callback: () => {
      player.setAlpha(player.alpha < 0.5 ? 1 : 0.12);
      if (++f >= 16) {
        player.setAlpha(1);
        player.play('run');   // resume run cycle after hit flash
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
    this.burst(coin.x, coin.y, 'pd_y', 8);
    this.floatText(coin.x, coin.y - 10, `+${val}`, this.doubleScore ? '#f5e642' : '#9ef5a2');
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
      `💀 FELL INTO A ${streak > 30 ? 'COMMIT DROUGHT' : 'GAP'} (${streak}d break in history)!`,
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
      fontFamily: 'Boogaloo,cursive', fontSize: '18px',
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

// ── Kick everything off ───────────────────────────────────────────────
init();