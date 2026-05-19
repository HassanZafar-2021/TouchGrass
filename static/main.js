// ── Grass blades ─────────────────────────────────────────────────
const bladesEl = document.getElementById('blades');
for (let i = 0; i < 60; i++) {
  const b = document.createElement('div');
  b.className = 'blade';
  b.style.height = (30 + Math.random() * 80) + 'px';
  b.style.animationDuration = (2 + Math.random() * 2) + 's';
  b.style.animationDelay = (-Math.random() * 3) + 's';
  bladesEl.appendChild(b);
}

// ── Floating particles ────────────────────────────────────────────
const EMOJIS = ['🌱','🍃','🌿','☘️','🌾','🌻','🌼','🍀'];
const particlesEl = document.getElementById('particles');
for (let i = 0; i < 18; i++) {
  const p = document.createElement('div');
  p.className = 'particle';
  p.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  p.style.left = Math.random() * 100 + 'vw';
  p.style.animationDuration  = (8 + Math.random() * 12) + 's';
  p.style.animationDelay     = (-Math.random() * 20) + 's';
  p.style.fontSize = (1 + Math.random() * 1.2) + 'rem';
  particlesEl.appendChild(p);
}

// ── Colour scale ──────────────────────────────────────────────────
function dayColor(count, max) {
  if (count === 0) return 'rgba(255,255,255,0.05)';
  const t = Math.min(count / Math.max(max, 1), 1);
  const colors = ['#1a3d1c','#2d6a30','#40a044','#5cd462','#9ef5a2'];
  const idx = Math.min(Math.floor(t * colors.length), colors.length - 1);
  return colors[idx];
}

// ── State ─────────────────────────────────────────────────────────
let currentData = null;

// ── DOM refs ──────────────────────────────────────────────────────
const usernameInput = document.getElementById('username');
const searchBtn     = document.getElementById('search-btn');
const loadingEl     = document.getElementById('loading');
const errorBox      = document.getElementById('error-box');
const resultsEl     = document.getElementById('results');

function show(el) { el.style.display = 'block'; }
function hide(el) { el.style.display = 'none';  }

// ── Fetch & render ────────────────────────────────────────────────
async function lookup(username) {
  hide(errorBox);
  hide(resultsEl);
  show(loadingEl);
  searchBtn.disabled = true;

  try {
    const res  = await fetch(`/api/score/${encodeURIComponent(username)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    currentData = data;
    render(data);
  } catch (err) {
    errorBox.textContent = '⚠️ ' + err.message;
    show(errorBox);
  } finally {
    hide(loadingEl);
    searchBtn.disabled = false;
  }
}

function render(d) {
  // Profile
  document.getElementById('avatar').src              = d.avatar;
  document.getElementById('display-name').textContent = d.name;
  document.getElementById('handle').textContent       = '@' + d.username;

  // Class
  document.getElementById('class-emoji').textContent = d.class.emoji;
  document.getElementById('class-name').textContent  = d.class.name;
  document.getElementById('class-desc').textContent  = d.class.description;

  // Grass meter
  const pct = (d.class.grass_level / 10) * 100;
  setTimeout(() => {
    document.getElementById('grass-fill').style.width = pct + '%';
  }, 200);

  // Message
  document.getElementById('message-box').textContent = d.message;

  // Stats cards
  const statsData = [
    { icon: '🔥', value: d.stats.streak,    label: 'Current Streak' },
    { icon: '⚡', value: d.stats.max_streak, label: 'Longest Streak' },
    { icon: '📝', value: d.stats.total,      label: 'Total Commits'  },
    { icon: '📊', value: d.stats.avg,        label: 'Avg / Day'      },
    { icon: '🌊', value: d.stats.peak,       label: 'Peak Day'       },
    { icon: '😴', value: d.stats.max_break,  label: 'Longest Break'  },
  ];
  const statsGrid = document.getElementById('stats-grid');
  statsGrid.innerHTML = statsData.map((s, i) => `
    <div class="stat-card" style="animation-delay:${i * 0.07}s">
      <div class="stat-icon">${s.icon}</div>
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');

  // Contribution heatmap
  const cgEl     = document.getElementById('contrib-grid');
  cgEl.innerHTML = '';
  const maxCount = Math.max(...d.grid.map(x => x.count));

  // Group days into weeks of 7
  const weeks = [];
  let week = [];
  d.grid.forEach((day, i) => {
    week.push(day);
    if (week.length === 7 || i === d.grid.length - 1) {
      weeks.push(week);
      week = [];
    }
  });

  weeks.forEach(w => {
    const wEl = document.createElement('div');
    wEl.className = 'contrib-week';
    w.forEach(day => {
      const dEl = document.createElement('div');
      dEl.className = 'contrib-day';
      dEl.style.background = dayColor(day.count, maxCount);
      dEl.setAttribute('data-count', day.count);
      dEl.setAttribute('data-tip', `${day.date}: ${day.count} commit${day.count !== 1 ? 's' : ''}`);
      wEl.appendChild(dEl);
    });
    cgEl.appendChild(wEl);
  });

  show(resultsEl);
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Search events ─────────────────────────────────────────────────
searchBtn.addEventListener('click', () => {
  const u = usernameInput.value.trim();
  if (u) lookup(u);
});

usernameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const u = usernameInput.value.trim();
    if (u) lookup(u);
  }
});

// ── Share buttons ─────────────────────────────────────────────────
document.getElementById('share-btn').addEventListener('click', function () {
  const url = location.origin + '?u=' + encodeURIComponent(usernameInput.value.trim());
  navigator.clipboard.writeText(url).then(() => {
    this.textContent = '✅ Copied!';
    this.classList.add('copied');
    setTimeout(() => {
      this.textContent = '📋 Copy result link';
      this.classList.remove('copied');
    }, 2000);
  });
});

document.getElementById('twitter-btn').addEventListener('click', () => {
  if (!currentData) return;
  const cls  = currentData.class;
  const text = `My GitHub dev class is ${cls.emoji} ${cls.name}! "${cls.description}" Check yours 👇`;
  const url  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(location.origin)}`;
  window.open(url, '_blank');
});

// ── Auto-lookup from URL param ────────────────────────────────────
const params = new URLSearchParams(location.search);
if (params.get('u')) {
  usernameInput.value = params.get('u');
  lookup(params.get('u'));
}