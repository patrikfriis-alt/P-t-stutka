// ============================================================
// CONSTANTS
// ============================================================

const PROXY_BASE        = 'https://kaupunki.onrender.com';
const PROXY_DECISIONS   = PROXY_BASE + '/decisions';
const PROXY_MEETINGS    = PROXY_BASE + '/meetings';
const PROXY_AGENDAS     = PROXY_BASE + '/agendas';

// ============================================================
// STATE
// ============================================================

let activeFilter    = 'all';
let showAll         = false;
let activeQuery     = '';
let allAgendaItems  = [];
let meetingFilter   = 'tulevat';
let totalDecisionsCount = 0;
const newsCache     = {};
const statsCache    = { data: null, timestamp: null };
const agendasCache  = { data: null, timestamp: null };
const meetingsCache = { data: null, timestamp: null };
const NEWS_LIMIT    = 10;
const visibleNews   = { arctial: NEWS_LIMIT, kokkola: NEWS_LIMIT };
let activeNewsTab   = 'arctial';
let searchTimeout;

// Advanced search filters
let searchFilters = {
  topic: '',
  author: '',
  dateFrom: '',
  dateTo: ''
};

// Notifications
let lastViewedDecisions = localStorage.getItem('lastViewedDecisions') || 0;
let newDecisionsCount = 0;

// ============================================================
// VIEW NAVIGATION
// ============================================================

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });

  document.getElementById('nav-search').style.display = name === 'dashboard' ? 'flex' : 'none';

  if (name === 'dashboard') {
    totalDecisionsCount = 0;
    Promise.all([loadDecisions(), loadStats(), loadMeetings(), loadAgendas(), loadForecasts()]);
  }
}

// ============================================================
// SKELETON SCREENS
// ============================================================

function showSkeleton(container, type, count = 5) {
  let skeletonHTML = '';
  for (let i = 0; i < count; i++) {
    if (type === 'decisions') {
      skeletonHTML += `
        <div class="skeleton-decision">
          <div class="skeleton skeleton-dot"></div>
          <div class="skeleton-content">
            <div class="skeleton skeleton-line long"></div>
            <div class="skeleton skeleton-line medium"></div>
          </div>
          <div class="skeleton skeleton-status"></div>
        </div>
      `;
    } else if (type === 'stats') {
      skeletonHTML += `
        <div class="skeleton-card">
          <div class="skeleton skeleton-line short"></div>
          <div class="skeleton skeleton-line medium"></div>
          <div class="skeleton skeleton-line short"></div>
        </div>
      `;
    }
  }
  container.innerHTML = skeletonHTML;
  container.classList.add('pulse');
}

function hideSkeleton(container) {
  container.classList.remove('pulse');
}

// ============================================================
// STATISTICS
// ============================================================

async function loadStats() {
  const now = Date.now();
  let data;
  if (statsCache.data && (now - statsCache.timestamp) < 5 * 60 * 1000) {
    data = statsCache.data;
  } else {
    try {
      const res  = await fetch(PROXY_BASE + '/stats');
      data = await res.json();
      statsCache.data = data;
      statsCache.timestamp = now;
    } catch (e) {
      console.error('Error loading stats:', e);
      ['stat-vaesto', 'stat-nuoret', 'stat-tyottomyys'].forEach(id => {
        document.getElementById(id).textContent = '–';
      });
      return;
    }
  }

  // Väestö
    if (!isNaN(data.vaesto)) {
      document.getElementById('stat-vaesto').textContent = Math.round(data.vaesto).toLocaleString('fi-FI');
      const diff = data.vaesto - data.vaestoPrev;
      const sign = diff >= 0 ? '+' : '';
      const el = document.getElementById('stat-vaesto-change');
      el.textContent = sign + Math.round(diff).toLocaleString('fi-FI') + ' hlö (2024 vs 2023)';
      el.className = 'stat-change ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral');
    }

    // Alle 18-v
    if (!isNaN(data.nuoret)) {
      document.getElementById('stat-nuoret').textContent = data.nuoret.toFixed(1) + '%';
      const diff = data.nuoret - data.nuoretPrev;
      const sign = diff >= 0 ? '+' : '';
      const el = document.getElementById('stat-nuoret-change');
      el.textContent = sign + diff.toFixed(1) + '% (2024 vs 2023)';
      el.className = 'stat-change ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral');
    }

    // Työttömyys
    if (!isNaN(data.tyottomyys)) {
      document.getElementById('stat-tyottomyys').textContent = data.tyottomyys.toFixed(1) + '%';
      const diff = data.tyottomyys - data.tyottomyysPrev;
      const sign = diff >= 0 ? '+' : '';
      const el = document.getElementById('stat-tyottomyys-change');
      el.textContent = sign + diff.toFixed(1) + '% vs vuosi sitten (' + (data.tyottomyysKk || '') + ')';
      el.className = 'stat-change ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral');
    }
}

// ============================================================
// FORECASTS
// ============================================================

async function loadForecasts() {
  const forecastContainer = document.querySelector('.card .card-header + div');
  if (!forecastContainer) return;

  try {
    // Try to load from API first
    const res = await fetch(PROXY_BASE + '/forecasts');
    if (res.ok) {
      const data = await res.json();
      renderForecasts(data);
      return;
    }
  } catch (e) {
    console.log('API forecasts not available, using fallback data');
  }

  // Fallback to hardcoded data (could be moved to a config file)
  const fallbackData = {
    bkt: { value: '+1.2%', source: 'ETLA 2026' },
    employment: { value: '72.4%', source: 'TEM ennuste' },
    population: { value: '48 100', source: 'Tilastokeskus' },
    investments: [
      { name: 'Arctial (arvio)', value: '~3 mrd €' },
      { name: 'Kokkolan satama 2026', value: '45 M€' },
      { name: 'Kaupungin investoinnit', value: '22.1 M€' }
    ]
  };
  renderForecasts(fallbackData);
}

function renderForecasts(data) {
  const forecastContainer = document.querySelector('.card .card-header + div');
  if (!forecastContainer) return;

  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:16px 24px;">
      <div>
        <div style="font-size:0.68rem;color:var(--text3);margin-bottom:4px;">BKT-kasvu (K-P)</div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--green);">${data.bkt?.value || '+1.2%'}</div>
        <div style="font-size:0.68rem;color:var(--text3);">${data.bkt?.source || 'ETLA 2026'}</div>
      </div>
      <div>
        <div style="font-size:0.68rem;color:var(--text3);margin-bottom:4px;">Työllisyysaste</div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--cyan);">${data.employment?.value || '72.4%'}</div>
        <div style="font-size:0.68rem;color:var(--text3);">${data.employment?.source || 'TEM ennuste'}</div>
      </div>
      <div>
        <div style="font-size:0.68rem;color:var(--text3);margin-bottom:4px;">Väestöennuste 2030</div>
        <div style="font-size:1.1rem;font-weight:700;">${data.population?.value || '48 100'}</div>
        <div style="font-size:0.68rem;color:var(--text3);">${data.population?.source || 'Tilastokeskus'}</div>
      </div>
    </div>
    <div style="padding:0 24px 16px;">
      <div style="border-top:1px solid var(--border);padding-top:12px;">
        <div style="font-size:0.68rem;color:var(--text3);margin-bottom:8px;">Investoinnit alueelle</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${(data.investments || [
            { name: 'Arctial (arvio)', value: '~3 mrd €' },
            { name: 'Kokkolan satama 2026', value: '45 M€' },
            { name: 'Kaupungin investoinnit', value: '22.1 M€' }
          ]).map(inv => `
            <div style="display:flex;justify-content:space-between;font-size:0.78rem;gap:12px;">
              <span style="flex:1;min-width:0;">${inv.name}</span>
              <span style="color:var(--green);font-weight:600;white-space:nowrap;">${inv.value}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div style="margin-top:10px;font-size:0.65rem;color:var(--text3);">⚠️ Ennustedata päivitetään manuaalisesti — lähde: ETLA, TEM, Tilastokeskus</div>
    </div>
  `;

  forecastContainer.innerHTML = html;
}

// ============================================================
// DECISIONS
// ============================================================

async function loadDecisions() {
  const list = document.getElementById('decisions-list');
  showSkeleton(list, 'decisions', 8);

  try {
    const res    = await fetch(PROXY_DECISIONS);
    const buffer = await res.arrayBuffer();
    let text     = new TextDecoder('windows-1252').decode(buffer);
    text         = text.replace(/encoding="[^"]+"/i, 'encoding="utf-8"');
    const xml    = new DOMParser().parseFromString(text, 'application/xml');
    const items  = xml.querySelectorAll('item');

    if (!items.length) {
      list.innerHTML = '<div style="padding:32px 24px;text-align:center;color:var(--text3);font-size:0.8rem;">⚠️ Ei päätöksiä saatavilla</div>';
      list.classList.remove('pulse');
      return;
    }

    list.innerHTML = '';
    items.forEach(item => {
      const title   = item.querySelector('title')?.textContent || '–';
      const desc    = item.querySelector('description')?.textContent || '';
      const link    = item.querySelector('link')?.textContent || '#';
      const pubDate = item.querySelector('pubDate')?.textContent || '';

      let dateStr = '';
      if (pubDate) {
        let d = new Date(pubDate);
        if (isNaN(d.getTime())) d = new Date(Date.parse(pubDate));
        if (isNaN(d.getTime())) d = new Date();
        dateStr = d.toLocaleDateString('fi-FI');
      }

      let issuer = 'Kokkola', decisionTitle = title;
      if (title.includes(' / ')) {
        const parts = title.split(' / ');
        issuer = parts[0].trim();
        decisionTitle = parts.slice(1).join(' / ').trim();
      }

      const el = document.createElement('div');
      el.className     = 'decision-item';
      el.dataset.status = 'passed';
      el.dataset.text  = (title + ' ' + desc).toLowerCase();
      if (pubDate) {
        let d = new Date(pubDate);
        if (isNaN(d.getTime())) d = new Date(Date.parse(pubDate));
        if (isNaN(d.getTime())) d = new Date();
        el.dataset.date = d.toISOString();
      }
      el.innerHTML = `
        <div class="decision-dot" style="background:var(--green)"></div>
        <div class="decision-content">
          <div class="decision-title">${decisionTitle}</div>
          <div class="decision-meta">
            <span>${issuer}</span>
            ${dateStr ? `<span>${dateStr}</span>` : ''}
          </div>
        </div>
        <div class="decision-status status-passed">Päätös</div>
      `;
      el.addEventListener('click', () => openModal(decisionTitle, desc || 'Ei kuvausta saatavilla.', issuer + (dateStr ? ' · ' + dateStr : ''), link));
      list.appendChild(el);
    });

    totalDecisionsCount += items.length;
    document.getElementById('decisions-count').textContent = totalDecisionsCount + ' kpl';
    applyFilters();
    hideSkeleton(list);
    checkForNewDecisions();
  } catch (e) {
    console.error('Error loading decisions:', e);
    list.innerHTML = '<div style="padding:32px 24px;text-align:center;color:var(--text3);font-size:0.8rem;">Tietoja ei voida ladata juuri nyt. Yritä myöhemmin.</div>';
    const btn = document.createElement('button');
    btn.className = 'retry-btn';
    btn.textContent = 'Yritä uudelleen';
    btn.onclick = () => loadDecisions();
    list.appendChild(btn);
    hideSkeleton(list);
  }
}

// ============================================================
// MEETINGS (kokousasiat)
// ============================================================

async function loadMeetings() {
  const now = Date.now();
  const list = document.getElementById('decisions-list');
  let items;
  if (meetingsCache.data && (now - meetingsCache.timestamp) < 5 * 60 * 1000) {
    items = meetingsCache.data;
  } else {
    try {
      const res    = await fetch(PROXY_MEETINGS);
      const buffer = await res.arrayBuffer();
      let text     = new TextDecoder('windows-1252').decode(buffer);
      text         = text.replace(/encoding="[^"]+"/i, 'encoding="utf-8"');
      const xml    = new DOMParser().parseFromString(text, 'application/xml');
      items  = xml.querySelectorAll('item');
      meetingsCache.data = Array.from(items);
      meetingsCache.timestamp = now;
    } catch (e) {
      console.error('Virhe ladattaessa kokousasioita:', e);
      if (list.innerHTML.includes('Ladataan')) {
        list.innerHTML = '<div style="padding:32px 24px;text-align:center;color:var(--text3);font-size:0.8rem;">Tietoja ei voida ladata juuri nyt. Yritä myöhemmin.</div>';
        const btn = document.createElement('button');
        btn.className = 'retry-btn';
        btn.textContent = 'Yritä uudelleen';
        btn.onclick = () => loadMeetings();
        list.appendChild(btn);
      }
      return;
    }
  }

  if (!items.length) return;

  document.getElementById('stat-paatokset').textContent = items.length;

  items.forEach(item => {
    const getTag = tag => {
      const el = item.querySelector(tag);
      return el ? (el.textContent || el.innerHTML || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    };
    const title   = getTag('title') || '–';
    const desc    = getTag('description') || '';
    const link    = getTag('link') || '#';
    const pubDate = getTag('pubDate') || '';

    let dateStr = '';
    if (pubDate) {
      let d = new Date(pubDate);
      if (isNaN(d.getTime())) d = new Date(Date.parse(pubDate));
      if (isNaN(d.getTime())) d = new Date();
      dateStr = d.toLocaleDateString('fi-FI');
    }

    let issuer = 'Kokkola', meetingTitle = title;
    if (title.includes(' / ')) {
      const parts = title.split(' / ');
      issuer = parts[0].trim();
      meetingTitle = parts.slice(1).join(' / ').trim();
    }

    const el = document.createElement('div');
    el.className      = 'decision-item';
    el.dataset.status = 'meeting';
    el.dataset.text   = (title + ' ' + desc).toLowerCase();
    const dmatch = title.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dmatch) {
      let md = new Date(parseInt(dmatch[3]), parseInt(dmatch[2]) - 1, parseInt(dmatch[1]));
      if (isNaN(md.getTime())) md = new Date(Date.parse(title));
      if (isNaN(md.getTime())) md = new Date();
      el.dataset.date = md.toISOString();
    }
    el.innerHTML =
      '<div class="decision-dot" style="background:var(--cyan)"></div>' +
      '<div class="decision-content">' +
        '<div class="decision-title">' + meetingTitle + '</div>' +
        '<div class="decision-meta"><span>' + issuer + '</span>' + (dateStr ? '<span>' + dateStr + '</span>' : '') + '</div>' +
      '</div>' +
      '<div class="decision-status status-review">Kokous</div>';
    el.addEventListener('click', () => openModal(meetingTitle, desc || 'Ei kuvausta.', issuer + (dateStr ? ' – ' + dateStr : ''), link));
    list.appendChild(el);
  });

  // Update badge
  const badge = document.getElementById('decisions-count');
  const current = parseInt(badge.textContent) || 0;
  badge.textContent = (current + items.length) + ' kpl';
  applyFilters();
  checkForNewDecisions();
}

// ============================================================
// AGENDAS (kokoukset)
// ============================================================

function setMeetingFilter(filter, btn) {
  meetingFilter = filter;
  document.querySelectorAll('[data-mfilter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAgendasTop();
}

function renderAgendasTop() {
  const list = document.getElementById('upcoming-meetings-list-top');
  if (!list) return;
  const now       = new Date();
  const searchVal = (document.getElementById('meeting-search')?.value || '').toLowerCase().trim();

  let filtered = allAgendaItems.filter(item => {
    const d    = item.date ? new Date(item.date) : null;
    const year = d ? d.getFullYear() : null;
    if (meetingFilter === 'tulevat') { if (!(!d || d >= now)) return false; }
    else if (meetingFilter === 'menneet') { if (!(d && d < now && year >= 2026)) return false; }
    else if (meetingFilter === 'kh') { if (!item.title.toLowerCase().includes('kaupunginhallitus')) return false; }
    if (searchVal && !item.title.toLowerCase().includes(searchVal)) return false;
    return true;
  });

  filtered.sort((a, b) =>
    meetingFilter === 'tulevat'
      ? (a.date || '') < (b.date || '') ? -1 : 1
      : (a.date || '') > (b.date || '') ? -1 : 1
  );
  filtered = filtered.slice(0, 8);

  if (!filtered.length) {
    list.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:0.78rem;">Ei kokouksia</div>';
    return;
  }
  list.innerHTML = filtered.map(item =>
    '<a href="' + item.link + '" target="_blank" class="upcoming-item">' +
      (item.dateStr ? '<div class="upcoming-date">' + item.dateStr + '</div>' : '') +
      '<div class="upcoming-title">' + item.title + '</div>' +
      '<div class="upcoming-body">Avaa esityslista →</div>' +
    '</a>'
  ).join('');
}

async function loadAgendas() {
  const list = document.getElementById('upcoming-meetings-list-top');
  if (!list) return;

  const now = Date.now();
  if (agendasCache.data && (now - agendasCache.timestamp) < 5 * 60 * 1000) {
    allAgendaItems = agendasCache.data;
    renderAgendasTop();
    loadNews();
    return;
  }

  list.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:0.78rem;">⏳ Ladataan...</div>';
  list.classList.add('pulse');

  try {
    const res    = await fetch(PROXY_AGENDAS);
    const buffer = await res.arrayBuffer();
    let text     = new TextDecoder('windows-1252').decode(buffer);
    text         = text.replace(/encoding="[^"]+"/i, 'encoding="utf-8"');
    const xml    = new DOMParser().parseFromString(text, 'application/xml');
    const items  = Array.from(xml.querySelectorAll('item'));

    allAgendaItems = items.map(item => {
      const fullTitle = item.querySelector('title')?.textContent || '–';
      const linkUrl   = item.querySelector('link')?.textContent || '#';
      const dateMatch = fullTitle.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      let dateStr = '', date = null, title = fullTitle;
      if (dateMatch) {
        const [, day, mon, year] = dateMatch;
        let d = new Date(year, mon - 1, day);
        if (isNaN(d.getTime())) d = new Date(Date.parse(fullTitle));
        if (isNaN(d.getTime())) d = new Date();
        date    = d.toISOString();
        dateStr = d.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' });
      }
      return { title, link: linkUrl, date, dateStr };
    });

    agendasCache.data = allAgendaItems;
    agendasCache.timestamp = now;

    const nowDate = new Date();
    allAgendaItems.sort((a, b) => {
      const da = a.date ? new Date(a.date) : nowDate;
      const db = b.date ? new Date(b.date) : nowDate;
      if (da >= nowDate && db >= nowDate) return da - db;
      if (da <  nowDate && db <  nowDate) return db - da;
      return 0;
    });

    renderAgendasTop();
    loadNews();
    list.classList.remove('pulse');
  } catch (e) {
    console.error('Error loading agendas:', e);
    list.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:0.78rem;">Tietoja ei voida ladata juuri nyt. Yritä myöhemmin.</div>';
    const btn = document.createElement('button');
    btn.className = 'retry-btn';
    btn.textContent = 'Yritä uudelleen';
    btn.onclick = () => loadAgendas();
    list.appendChild(btn);
    list.classList.remove('pulse');
  }
}

// ============================================================
// FILTERS & SEARCH
// ============================================================

function setFilter(filter, btn) {
  activeFilter = filter;
  showAll      = false;
  document.querySelectorAll('[data-dfilter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

function handleSearch(value) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    activeQuery = value.trim().toLowerCase();
    document.getElementById('searchClear').style.display = activeQuery ? 'block' : 'none';
    applyFilters();
  }, 300);
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  activeQuery = '';
  document.getElementById('searchClear').style.display = 'none';
  applyFilters();
  document.getElementById('searchInput').focus();
}

function toggleAdvancedSearch() {
  const advanced = document.getElementById('advanced-search');
  const btn = document.getElementById('toggle-advanced-search');
  const isVisible = advanced.style.display !== 'none';

  if (isVisible) {
    advanced.style.display = 'none';
    btn.textContent = '🔍 Tarkempi haku';
  } else {
    advanced.style.display = 'block';
    btn.textContent = '🔽 Piilota tarkempi haku';
  }
}

function applyAdvancedFilters() {
  searchFilters.topic = document.getElementById('search-topic').value.trim();
  searchFilters.author = document.getElementById('search-author').value.trim();
  searchFilters.dateFrom = document.getElementById('search-date-from').value;
  searchFilters.dateTo = document.getElementById('search-date-to').value;
  applyFilters();
}

function clearAdvancedFilters() {
  document.getElementById('search-topic').value = '';
  document.getElementById('search-author').value = '';
  document.getElementById('search-date-from').value = '';
  document.getElementById('search-date-to').value = '';
  searchFilters = { topic: '', author: '', dateFrom: '', dateTo: '' };
  applyFilters();
}

// ============================================================
// NOTIFICATIONS
// ============================================================

function updateNotifications() {
  const btn = document.getElementById('notification-btn');
  const badge = document.getElementById('notification-badge');

  if (newDecisionsCount > 0) {
    btn.style.display = 'block';
    badge.style.display = 'flex';
    badge.textContent = newDecisionsCount > 99 ? '99+' : newDecisionsCount;
  } else {
    btn.style.display = 'none';
    badge.style.display = 'none';
  }
}

function markNotificationsAsRead() {
  newDecisionsCount = 0;
  lastViewedDecisions = totalDecisionsCount;
  localStorage.setItem('lastViewedDecisions', lastViewedDecisions);
  updateNotifications();
}

function checkForNewDecisions() {
  if (totalDecisionsCount > lastViewedDecisions) {
    newDecisionsCount = totalDecisionsCount - lastViewedDecisions;
  }
  updateNotifications();
}

function showNotificationPanel() {
  // Simple notification panel - could be expanded to show list of new decisions
  const hasNew = newDecisionsCount > 0;
  const message = hasNew
    ? `${newDecisionsCount} uutta päätöstä saatavilla!`
    : 'Ei uusia päätöksiä.';

  openModal(
    'Ilmoitukset',
    message,
    'PäätösTutka',
    '#'
  );

  if (hasNew) {
    markNotificationsAsRead();
  }
}

function applyFilters() {
  const now   = new Date();
  const items = document.querySelectorAll('#decisions-list .decision-item');
  let visible = 0;

  items.forEach(item => {
    const status   = item.dataset.status;
    const text     = (item.dataset.text + ' ' + item.innerText).toLowerCase();
    const itemDate = item.dataset.date ? new Date(item.dataset.date) : null;
    const title    = item.querySelector('.decision-title')?.textContent.toLowerCase() || '';
    const meta     = item.querySelector('.decision-meta')?.textContent.toLowerCase() || '';

    let matchFilter = false;
    // Show all items regardless of status
    if (activeFilter === 'all') {
      matchFilter = true;
    // Show only passed decisions (official decisions)
    } else if (activeFilter === 'viranomais') {
      matchFilter = status === 'passed';
    // Show passed decisions and past meetings
    } else if (activeFilter === 'paatokset') {
      matchFilter = status === 'passed' || (status === 'meeting' && itemDate && itemDate < now);
    // Show upcoming meetings and proposals
    } else if (activeFilter === 'esitykset') {
      matchFilter = status === 'meeting' && (!itemDate || itemDate >= now);
    } else {
      // Fallback: match status directly (should not occur with current filters)
      matchFilter = status === activeFilter;
    }

    // Apply advanced search filters
    let matchAdvanced = true;
    if (searchFilters.topic && !title.includes(searchFilters.topic.toLowerCase())) {
      matchAdvanced = false;
    }
    if (searchFilters.author && !meta.includes(searchFilters.author.toLowerCase())) {
      matchAdvanced = false;
    }
    if (searchFilters.dateFrom && itemDate) {
      const fromDate = new Date(searchFilters.dateFrom);
      if (itemDate < fromDate) matchAdvanced = false;
    }
    if (searchFilters.dateTo && itemDate) {
      const toDate = new Date(searchFilters.dateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      if (itemDate > toDate) matchAdvanced = false;
    }

    const matchQuery = !activeQuery || text.includes(activeQuery);
    const show = matchFilter && matchQuery && matchAdvanced;
    item.style.display = show ? '' : 'none';

    if (show) {
        // Highlight search term
      const titleEl = item.querySelector('.decision-title');
      if (activeQuery && titleEl) {
        const orig = titleEl.textContent;
        const idx  = orig.toLowerCase().indexOf(activeQuery);
        if (idx >= 0) {
          titleEl.textContent = ''; // Clear existing content
          const before = document.createTextNode(orig.slice(0, idx));
          const highlight = document.createElement('span');
          highlight.className = 'search-highlight';
          highlight.textContent = orig.slice(idx, idx + activeQuery.length);
          const after = document.createTextNode(orig.slice(idx + activeQuery.length));
          titleEl.appendChild(before);
          titleEl.appendChild(highlight);
          titleEl.appendChild(after);
        }
      }
      visible++;
    }
  });

  // Limit to 15 unless showAll or search active
  if (!showAll && !activeQuery) {
    let shown = 0;
    items.forEach(item => {
      if (item.style.display !== 'none') {
        shown++;
        if (shown > 15) item.style.display = 'none';
      }
    });
    visible = Math.min(visible, 15);
  }

  document.getElementById('decisions-empty').style.display = visible === 0 ? 'block' : 'none';
  const showMoreBtn = document.getElementById('show-more-btn');
  if (showMoreBtn) showMoreBtn.style.display = (!showAll && !activeQuery && visible >= 15) ? 'block' : 'none';
}

// ============================================================
// NEWS
// ============================================================

function switchNewsTab(aihe) {
  activeNewsTab = aihe;
  ['arctial', 'kokkola'].forEach(a => {
    const tab = document.getElementById('news-tab-' + a);
    if (tab) {
      tab.classList.toggle('active', a === aihe);
      tab.style.borderBottomColor = a === aihe ? 'var(--accent)' : 'transparent';
      tab.style.color = a === aihe ? 'var(--text1)' : 'var(--text3)';
    }
  });
  const query = (document.getElementById('search-news')?.value || '').toLowerCase().trim();
  const el = document.getElementById('news-panel');
  if (!newsCache[aihe]) {
    el.innerHTML = '<div style="padding:16px 0;color:var(--text3);font-size:0.78rem;">⏳ Ladataan...</div>';
    return;
  }
  const items = query
    ? newsCache[aihe].filter(item => (item.otsikko + ' ' + (item.kuvaus || '')).toLowerCase().includes(query))
    : newsCache[aihe];
  renderNewsItems(el, items, aihe, !!query);
}

function filterNews() {
  switchNewsTab(activeNewsTab);
}

function renderNewsItems(el, items, aihe, isSearch) {
  if (!items || !items.length) {
    el.innerHTML = '<div style="padding:16px 0;color:var(--text3);font-size:0.78rem;">Ei hakutuloksia</div>';
    return;
  }
  const limit   = isSearch ? items.length : (visibleNews[aihe] || NEWS_LIMIT);
  const visible = items.slice(0, limit);
  const rest    = items.length - visible.length;

  let html = visible.map(item =>
    '<a href="' + (item.url || '#') + '" target="_blank" class="news-item">' +
      '<div class="news-title">' + item.otsikko + '</div>' +
      '<div class="news-meta">' +
        (item.julkaistu ? item.julkaistu : '') +
        (item.source ? ' · <span class="news-source">' + item.source + '</span>' : '') +
      '</div>' +
      (item.kuvaus    ? '<div class="news-desc">'  + item.kuvaus   + '</div>' : '') +
    '</a>'
  ).join('');

  if (!isSearch && rest > 0) {
    html += '<button class="news-load-more" onclick="showMoreNews(\'' + aihe + '\')">' +
              '+ Näytä lisää (' + rest + ' uutista)' +
            '</button>';
  } else if (!isSearch && limit > NEWS_LIMIT) {
    html += '<button class="news-load-more news-load-less" onclick="showLessNews(\'' + aihe + '\')">' +
              '↑ Näytä vähemmän' +
            '</button>';
  }
  el.innerHTML = html;
}

async function showMoreNews(aihe) {
  const newLimit = (visibleNews[aihe] || NEWS_LIMIT) + NEWS_LIMIT;
  if (newLimit > (newsCache[aihe]?.length || 0)) {
    try {
      const res   = await fetch(PROXY_BASE + '/news/' + aihe + '?limit=' + newLimit);
      const items = await res.json();
      if (Array.isArray(items) && items.length) {
        items.sort((a, b) => {
          const parse = s => { if (!s) return 0; const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (m) return new Date(m[3], m[2]-1, m[1]).getTime(); return new Date(s).getTime() || 0; };
          return parse(b.julkaistu) - parse(a.julkaistu);
        });
        newsCache[aihe] = items;
      }
    } catch (e) { console.error('showMoreNews error', e); }
  }
  visibleNews[aihe] = newLimit;
  renderNewsItems(document.getElementById('news-panel'), newsCache[aihe], aihe, false);
}

function showLessNews(aihe) {
  visibleNews[aihe] = NEWS_LIMIT;
  const el = document.getElementById('news-panel');
  renderNewsItems(el, newsCache[aihe], aihe, false);
  el.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadNews() {
  // Load Arctial news from multiple sources
  try {
    const sources = [
      { url: PROXY_BASE + '/news/arctial', label: 'Arctial' },
      { url: PROXY_BASE + '/rss?url=' + encodeURIComponent('https://news.google.com/rss/search?q=arctial&hl=fi-FI&gl=FI&ceid=FI:fi'), label: 'Google' }
    ];
    const results = await Promise.all(sources.map(async s => {
      console.log('Fetching URL:', s.url);
      const res = await fetch(s.url);
      console.log('Response status:', res.status, 'for', s.url);
      let items = [];
      if (s.url.includes('/rss')) {
        // Parse as XML (UTF-8)
        const text = await res.text();
        console.log('Raw XML response length:', text.length, 'for', s.url);
        const xml = new DOMParser().parseFromString(text, 'application/xml');
        const xmlItems = xml.querySelectorAll('item');
        items = Array.from(xmlItems).map(item => {
          const titleText = item.querySelector('title')?.textContent || '–';
          const normalizedTitle = titleText.split(' - ')[0].trim();
          const cleanTitle = normalizedTitle.replace(/<[^>]*>/g, '');
          const descText = item.querySelector('description')?.textContent || '';
          const cleanDesc = descText.replace(/<[^>]*>/g, '');
          return {
            otsikko: cleanTitle,
            kuvaus: cleanDesc,
            julkaistu: item.querySelector('pubDate')?.textContent || '',
            url: item.querySelector('link')?.textContent || '#'
          };
        });
        console.log('Parsed items from XML:', items.length, 'for', s.url);
      } else {
        // Parse as JSON
        items = await res.json();
        console.log('Parsed items from JSON:', items.length, 'for', s.url);
      }
      items.forEach(item => item.source = s.label);
      return items;
    }));
    const allItems = [].concat(...results);
    console.log('Total allItems for arctial before sorting:', allItems.length);
    allItems.sort((a, b) => {
      const parse = s => { if (!s) return 0; const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (m) return new Date(m[3], m[2]-1, m[1]).getTime(); return new Date(s).getTime() || 0; };
      return parse(b.julkaistu) - parse(a.julkaistu);
    });
    // Deduplicate by title
    const seen = new Set();
    const deduped = allItems.filter(item => {
      if (seen.has(item.otsikko)) return false;
      seen.add(item.otsikko);
      return true;
    });
    console.log('Deduplicated items for arctial:', deduped.length);
    newsCache['arctial'] = deduped.length ? deduped : [];
  } catch (e) {
    console.error('Error loading news for arctial:', e);
    newsCache['arctial'] = [];
  }

  // Load Kokkola news from multiple sources
  try {
    const sources = [
      { url: PROXY_BASE + '/news/kokkola', label: 'Arctial' },
      { url: PROXY_BASE + '/rss?url=' + encodeURIComponent('https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-135629'), label: 'YLE' },
      { url: PROXY_BASE + '/rss?url=' + encodeURIComponent('https://news.google.com/rss/search?q=kokkola&hl=fi-FI&gl=FI&ceid=FI:fi'), label: 'Google' }
    ];
    const results = await Promise.all(sources.map(async s => {
      console.log('Fetching URL:', s.url);
      const res = await fetch(s.url);
      console.log('Response status:', res.status, 'for', s.url);
      let items = [];
      if (s.url.includes('/rss')) {
        // Parse as XML (UTF-8)
        const text = await res.text();
        console.log('Raw XML response length:', text.length, 'for', s.url);
        const xml = new DOMParser().parseFromString(text, 'application/xml');
        const xmlItems = xml.querySelectorAll('item');
        items = Array.from(xmlItems).map(item => {
          const titleText = item.querySelector('title')?.textContent || '–';
          const normalizedTitle = titleText.split(' - ')[0].trim();
          const cleanTitle = normalizedTitle.replace(/<[^>]*>/g, '');
          const descText = item.querySelector('description')?.textContent || '';
          const cleanDesc = descText.replace(/<[^>]*>/g, '');
          return {
            otsikko: cleanTitle,
            kuvaus: cleanDesc,
            julkaistu: item.querySelector('pubDate')?.textContent || '',
            url: item.querySelector('link')?.textContent || '#'
          };
        });
        console.log('Parsed items from XML:', items.length, 'for', s.url);
      } else {
        // Parse as JSON
        items = await res.json();
        console.log('Parsed items from JSON:', items.length, 'for', s.url);
      }
      items.forEach(item => item.source = s.label);
      return items;
    }));
    const allItems = [].concat(...results);
    console.log('Total allItems before sorting:', allItems.length);
    allItems.sort((a, b) => {
      const parse = s => { if (!s) return 0; const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (m) return new Date(m[3], m[2]-1, m[1]).getTime(); return new Date(s).getTime() || 0; };
      return parse(b.julkaistu) - parse(a.julkaistu);
    });
    // Deduplicate by title
    const seen = new Set();
    const deduped = allItems.filter(item => {
      if (seen.has(item.otsikko)) return false;
      seen.add(item.otsikko);
      return true;
    });
    console.log('Deduplicated items:', deduped.length);
    newsCache['kokkola'] = deduped.length ? deduped : [];
  } catch (e) {
    console.error('Error loading news for kokkola:', e);
    newsCache['kokkola'] = [];
  }

  switchNewsTab('arctial');
}

// ============================================================
// MODAL
// ============================================================

function openModal(title, body, tag, link) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent  = body;
  document.getElementById('modal-tag').textContent   = tag;
  const btn = document.querySelector('.modal-footer .btn-primary');
  if (btn) btn.onclick = () => { const newWindow = window.open(link, '_blank'); if (newWindow) newWindow.opener = null; };
  const overlay = document.getElementById('modal');
  overlay.classList.add('open');
  overlay.removeAttribute('aria-hidden');
}

function closeModal(e) {
  if (e.target === document.getElementById('modal')) closeModalDirect();
}

function closeModalDirect() {
  const overlay = document.getElementById('modal');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Date
  const now = new Date();
  const dateEl = document.getElementById('dash-date');
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Kaikki data-view napit (nav + hero CTA)
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Filter buttons (data-dfilter = decisions filter)
  document.querySelectorAll('[data-dfilter]').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.dfilter, btn));
  });

  // Meeting filter buttons (data-mfilter)
  document.querySelectorAll('[data-mfilter]').forEach(btn => {
    btn.addEventListener('click', () => setMeetingFilter(btn.dataset.mfilter, btn));
  });

  // Search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', e => handleSearch(e.target.value));
    searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') clearSearch(); });
  }
  const searchClear = document.getElementById('searchClear');
  if (searchClear) searchClear.addEventListener('click', clearSearch);

  // Show more
  const showMoreBtn = document.getElementById('show-more-btn');
  if (showMoreBtn) showMoreBtn.addEventListener('click', () => { showAll = true; applyFilters(); });

  // Modal close
  document.getElementById('modal')?.addEventListener('click', closeModal);
  document.getElementById('modal-close')?.addEventListener('click', closeModalDirect);

  // Meeting search
  document.getElementById('meeting-search')?.addEventListener('input', renderAgendasTop);

  // News search
  document.getElementById('search-news')?.addEventListener('input', filterNews);

  // Advanced search
  document.getElementById('toggle-advanced-search')?.addEventListener('click', toggleAdvancedSearch);
  document.getElementById('apply-filters')?.addEventListener('click', applyAdvancedFilters);
  document.getElementById('clear-filters')?.addEventListener('click', clearAdvancedFilters);

  // Notifications
  document.getElementById('notification-btn')?.addEventListener('click', showNotificationPanel);

  // Keyboard navigation for filters
  document.querySelectorAll('[data-dfilter], [data-mfilter]').forEach(btn => {
    btn.tabIndex = 0;
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });
});
