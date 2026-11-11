// RSS Filter — Hacker News (Algolia API) + generic RSS via AllOrigins proxy.
// No account, no server. Lists live in localStorage on this device only.
const KEY = 'rssfilter.v1';
const HN_API = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50';
const HN_RSS = 'https://news.ycombinator.com/rss';

const defaults = {
  feeds: [{ id: 'hn', name: 'Hacker News', type: 'hn', url: HN_RSS }],
  interested: ['rust', 'space', 'batteries'],
  blacklist: ['crypto'],
  hiddenIds: [],
  viewedIds: [],
  view: 'all',
  theme: 'dark',
};

let state = load();
let stories = [];
let lastUpdated = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(defaults);
    const s = JSON.parse(raw);
    return { ...structuredClone(defaults), ...s, feeds: s.feeds?.length ? s.feeds : defaults.feeds };
  } catch { return structuredClone(defaults); }
}
function save(note) {
  localStorage.setItem(KEY, JSON.stringify(state));
  const el = document.getElementById('savedNote');
  if (el && note) { el.textContent = note; setTimeout(() => el.textContent = '', 2500); }
}
const $ = id => document.getElementById(id);
const norm = s => (s || '').toLowerCase();
const domainOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const esc = s => (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function haystack(st) { return norm([st.title, st.domain, st.author, st.feedName].join(' ')); }
function isBlacklisted(st) { return state.blacklist.some(t => t && haystack(st).includes(norm(t))); }
function isInterested(st) { return state.interested.some(t => t && haystack(st).includes(norm(t))); }
function isHidden(st) { return state.hiddenIds.includes(st.id) || (state.viewedIds || []).includes(st.id) || isBlacklisted(st); }

async function fetchHN() {
  try {
    const r = await fetch(HN_API);
    if (!r.ok) throw new Error('HN API ' + r.status);
    const j = await r.json();
    return (j.hits || []).map(h => ({
      id: 'hn-' + h.objectID, title: h.title || '(no title)',
      url: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
      domain: h.url ? domainOf(h.url) : 'news.ycombinator.com',
      points: h.points ?? null, comments: h.num_comments ?? null,
      commentsUrl: 'https://news.ycombinator.com/item?id=' + h.objectID,
      date: h.created_at, author: h.author || '', feedName: 'Hacker News',
    }));
  } catch (e) {
    // Fallback: raw HN RSS through the proxy (no points/comments there).
    const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(HN_RSS));
    const text = await r.text();
    return parseRSS(text, 'Hacker News');
  }
}

function parseRSS(text, feedName) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  return [...doc.querySelectorAll('item, entry')].map((it, i) => {
    const t = s => it.querySelector(s)?.textContent?.trim() || '';
    const linkEl = it.querySelector('link');
    const link = linkEl?.getAttribute('href') || t('link') || t('guid');
    return {
      id: 'rss-' + feedName + '-' + i + '-' + link,
      title: t('title') || '(no title)', url: link, domain: domainOf(link),
      points: null, comments: null, commentsUrl: '',
      date: t('pubDate') || t('updated') || t('published'), author: t('author') || t('creator') || '', feedName,
    };
  }).filter(s => s.title && s.url);
}

async function fetchRSSFeed(feed) {
  const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(feed.url));
  if (!r.ok) throw new Error('Feed fetch failed: ' + r.status);
  return parseRSS(await r.text(), feed.name);
}

async function refresh() {
  const status = $('status');
  status.textContent = 'Loading…';
  const jobs = state.feeds.map(async f => {
    try { return f.type === 'hn' ? await fetchHN() : await fetchRSSFeed(f); }
    catch (e) { console.warn(f.name, e); return []; }
  });
  const groups = await Promise.all(jobs);
  stories = groups.flat();
  // Interested first, then points, then newest.
  stories.sort((a, b) => {
    const ia = isInterested(a) ? 0 : 1, ib = isInterested(b) ? 0 : 1;
    if (ia !== ib) return ia - ib;
    if ((b.points ?? -1) !== (a.points ?? -1)) return (b.points ?? -1) - (a.points ?? -1);
    return new Date(b.date || 0) - new Date(a.date || 0);
  });
  lastUpdated = new Date();
  $('updatedAt').textContent = 'Updated ' + lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  status.textContent = stories.length
    ? `${stories.length} stories from ${state.feeds.length} feed${state.feeds.length > 1 ? 's' : ''} · ${stories.filter(s => isInterested(s) && !isHidden(s)).length} interested · ${stories.filter(isHidden).length} not interested`
    : 'No stories loaded. Check the feed URLs in Filters & Feeds, then Refresh.';
  render();
}

function visibleStories() {
  const q = norm($('searchInput').value);
  return stories.filter(st => {
    if (q && !haystack(st).includes(q)) return false;
    if (state.view === 'interested') return isInterested(st) && !isHidden(st);
    if (state.view === 'hidden') return isHidden(st);
    return !isHidden(st);
  });
}

function render() {
  const list = $('storyList');
  const shown = visibleStories();
  $('countAll').textContent = stories.filter(s => !isHidden(s)).length || '';
  $('countInterested').textContent = stories.filter(s => isInterested(s) && !isHidden(s)).length || '';
  $('countHidden').textContent = stories.filter(isHidden).length || '';
  $('empty').hidden = shown.length > 0;
  list.innerHTML = shown.map(st => {
    const hot = isInterested(st);
    const meta = [
      st.points != null ? `▲ ${st.points} pts` : '',
      st.comments != null ? `${st.comments} comments` : '',
      st.domain, st.date ? new Date(st.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '',
      st.feedName !== 'Hacker News' ? esc(st.feedName) : '',
    ].filter(Boolean).join(' · ');
    return `<li class="story${hot ? ' interested' : ''}" data-id="${esc(st.id)}">
      <h3><a href="${esc(st.url)}" target="_blank" rel="noopener">${esc(st.title)}</a></h3>
      <div class="meta">${hot ? '<span class="badge">★ Interested</span>' : ''}<span>${esc(meta)}</span>
      ${st.commentsUrl ? `<a href="${esc(st.commentsUrl)}" target="_blank" rel="noopener">comments ↗</a>` : ''}</div>
      <div class="actions">
        <button class="btn" data-act="hide" data-id="${esc(st.id)}">Not interested in this story</button>
        <button class="btn" data-act="block-domain" data-domain="${esc(st.domain)}">Block ${esc(st.domain)}</button>
        ${isHidden(st) ? `<button class="btn" data-act="unhide" data-id="${esc(st.id)}">Undo</button>` : ''}
      </div></li>`;
  }).join('');
  renderChips(); renderFeeds();
}

function renderChips() {
  const chip = (term, list, cls) =>
    `<button type="button" class="chip ${cls || ''}" data-list="${list}" data-term="${esc(term)}" title="Tap to remove">${esc(term)} ✕</button>`;
  $('interestedChips').innerHTML = state.interested.map(t => chip(t, 'interested', 'interested')).join('') || '<span class="hint">None yet — add one below.</span>';
  $('blacklistChips').innerHTML = state.blacklist.map(t => chip(t, 'blacklist')).join('') || '<span class="hint">None yet.</span>';
}
function renderFeeds() {
  $('feedList').innerHTML = state.feeds.map(f =>
    `<li><span>${esc(f.name)}<small>${esc(f.url)}</small></span>
    ${f.type === 'hn' ? '<span class="hint">built-in</span>' : `<button class="btn small" data-remove-feed="${f.id}" type="button">Remove</button>`}</li>`).join('');
}

function markViewed(id) {
  if (!id || (state.viewedIds || []).includes(id)) return;
  state.viewedIds.push(id);
  if (state.viewedIds.length > 500) state.viewedIds = state.viewedIds.slice(-500);
  save(); render();
}

// Sync link: packs lists + feeds into the URL hash. No account, no server —
// open the link on another device and it imports everything (last-shared wins).
function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b64 + '='.repeat((4 - b64.length % 4) % 4))));
}
function syncPayload() {
  return { v: 1, feeds: state.feeds, interested: state.interested, blacklist: state.blacklist, hiddenIds: state.hiddenIds, viewedIds: state.viewedIds || [] };
}
async function copySyncLink() {
  const url = location.href.split('#')[0] + '#sync=' + b64urlEncode(JSON.stringify(syncPayload()));
  try { await navigator.clipboard.writeText(url); toast('Sync link copied — open it on your other device'); }
  catch {
    const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Sync link copied — open it on your other device'); }
    catch { prompt('Copy this sync link:', url); }
    ta.remove();
  }
}
function applySyncLink() {
  const m = location.hash.match(/^#sync=([A-Za-z0-9\-_]+)$/);
  if (!m) return false;
  try {
    const data = JSON.parse(b64urlDecode(m[1]));
    if (!data || typeof data !== 'object') throw new Error('bad sync data');
    if (Array.isArray(data.feeds) && data.feeds.length) state.feeds = data.feeds;
    if (Array.isArray(data.interested)) state.interested = data.interested;
    if (Array.isArray(data.blacklist)) state.blacklist = data.blacklist;
    if (Array.isArray(data.hiddenIds)) state.hiddenIds = data.hiddenIds;
    if (Array.isArray(data.viewedIds)) state.viewedIds = data.viewedIds;
    save('Synced ✓');
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  } catch { return 'error'; }
}

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2600);
}
function addTerms(inputId, listKey, label) {
  const input = $(inputId);
  const terms = input.value.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
  if (!terms.length) return;
  let added = 0;
  for (const t of terms) if (!state[listKey].some(x => norm(x) === norm(t))) { state[listKey].push(t); added++; }
  input.value = ''; save('Saved ✓'); render();
  toast(added ? `Added ${added} to ${label}` : 'Already in the list');
}

function applyTheme() {
  document.body.classList.toggle('light', state.theme === 'light');
  const b = document.getElementById('themeBtn');
  if (b) b.textContent = state.theme === 'light' ? '🌙 Dark mode' : '☀ Light mode';
}
function setView(v) {
  state.view = v; save();
  for (const [id, val] of [['tabAll', 'all'], ['tabInterested', 'interested'], ['tabHidden', 'hidden']]) {
    $(id).classList.toggle('active', val === v);
    $(id).setAttribute('aria-selected', val === v);
  }
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  $('themeBtn').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    save(); applyTheme();
  });
  $('settingsBtn').addEventListener('click', () => {
    const s = $('settings'); s.hidden = !s.hidden;
    $('settingsBtn').setAttribute('aria-expanded', String(!s.hidden));
  });
  $('refreshBtn').addEventListener('click', refresh);
  $('tabAll').addEventListener('click', () => setView('all'));
  $('tabInterested').addEventListener('click', () => setView('interested'));
  $('tabHidden').addEventListener('click', () => setView('hidden'));
  $('searchInput').addEventListener('input', render);
  $('addInterestedBtn').addEventListener('click', () => addTerms('interestedInput', 'interested', 'Interested'));
  $('addBlacklistBtn').addEventListener('click', () => addTerms('blacklistInput', 'blacklist', 'blacklist'));
  $('interestedInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTerms('interestedInput', 'interested', 'Interested'); });
  $('blacklistInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTerms('blacklistInput', 'blacklist', 'blacklist'); });
  $('addFeedBtn').addEventListener('click', () => {
    const name = $('feedNameInput').value.trim(), url = $('feedUrlInput').value.trim();
    if (!name || !/^https?:\/\//.test(url)) { toast('Enter a feed name and a full https:// feed URL'); return; }
    state.feeds.push({ id: 'f' + Date.now(), name, type: 'rss', url });
    $('feedNameInput').value = ''; $('feedUrlInput').value = '';
    save('Saved ✓'); render(); refresh();
  });
  $('resetHiddenBtn').addEventListener('click', () => { state.hiddenIds = []; state.viewedIds = []; save('Saved ✓'); render(); toast('Cleared — all stories are back'); });
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'news-filter-settings.json'; a.click();
  });
  $('importFile').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { state = { ...structuredClone(defaults), ...JSON.parse(await file.text()) }; save('Imported ✓'); setView(state.view || 'all'); refresh(); }
    catch { toast('That file could not be imported'); }
  });
  document.addEventListener('click', e => {
    const link = e.target.closest('.story a');
    if (link) { const li = link.closest('.story'); if (li?.dataset.id) markViewed(li.dataset.id); return; }
    const chip = e.target.closest('.chip');
    if (chip) {
      const list = chip.dataset.list;
      state[list] = state[list].filter(x => x !== chip.dataset.term);
      save('Saved ✓'); render(); return;
    }
    const rm = e.target.closest('[data-remove-feed]');
    if (rm) { state.feeds = state.feeds.filter(f => f.id !== rm.dataset.removeFeed); save('Saved ✓'); render(); refresh(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const st = stories.find(s => s.id === btn.dataset.id);
    if (btn.dataset.act === 'hide' && st) { state.hiddenIds.push(st.id); save('Saved ✓'); render(); toast('Marked not interested'); }
    if (btn.dataset.act === 'unhide' && st) { state.hiddenIds = state.hiddenIds.filter(id => id !== st.id); state.viewedIds = (state.viewedIds || []).filter(id => id !== st.id); save('Saved ✓'); render(); }
    if (btn.dataset.act === 'block-domain') {
      const d = btn.dataset.domain;
      if (d && !state.blacklist.some(x => norm(x) === norm(d))) state.blacklist.push(d);
      if (st && !state.hiddenIds.includes(st.id)) state.hiddenIds.push(st.id);
      save('Saved ✓'); render(); toast(`Blocked ${d}`);
    }
  });
  $('syncBtn').addEventListener('click', copySyncLink);
  const syncResult = applySyncLink();
  if (syncResult === true) toast('Settings synced from your other device');
  if (syncResult === 'error') toast('That sync link could not be read');
  if (/Android/i.test(navigator.userAgent)) $('installHint').hidden = false;
  applyTheme();
  setView(state.view || 'all');
  refresh();
});
