{
/* ================= setup ================= */
const MOODS = {
  calm: [[11, 61, 74], [31, 111, 139], [143, 211, 224]],
  joyful: [[255, 122, 61], [255, 201, 60], [255, 79, 129]],
  majestic: [[59, 10, 30], [158, 42, 43], [232, 176, 74]],
  reflective: [[18, 24, 38], [58, 74, 107], [184, 196, 224]],
  hopeful: [[43, 27, 61], [232, 106, 92], [255, 210, 154]],
  intimate: [[26, 15, 20], [107, 45, 74], [242, 167, 184]]
};
const MOOD_NAMES = Object.keys(MOODS);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rgb = c => `rgb(${c.map(Math.round).join(',')})`;
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

const cfg = window.SING_CONFIG || {};
const sb = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

let songs = [], canEdit = false, userEmail = '', editing = null, draft = null, lang = 'en';

/* ================= data ================= */
const LS = 'singalong-songs';
const localLoad = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
const localSave = () => { try { localStorage.setItem(LS, JSON.stringify(songs)); } catch {} };
const pick = s => ({ id: s.id, title: s.title, artist: s.artist || '', lang: s.lang, sections: s.sections, chords: s.chords || '' });

async function loadSongs() {
  if (!sb) { songs = localLoad(); render(); return; }
  $('#syncNote').textContent = 'Loading library…';
  const { data, error } = await sb.from('songs').select('id,title,artist,lang,sections,chords').order('title');
  if (error) { $('#syncNote').textContent = 'The library could not load. Check your connection and the Supabase settings.'; return; }
  $('#syncNote').textContent = '';
  songs = data; render();
}
async function saveSong(s) {
  if (!sb) { songs = songs.filter(x => x.id !== s.id).concat(pick(s)); localSave(); render(); return; }
  const { data, error } = await sb.from('songs').upsert(pick(s)).select('id');
  if (error || !data?.length) throw new Error(error?.message || 'Not allowed');
  await loadSongs();
}
async function removeSong(id) {
  if (!sb) { songs = songs.filter(x => x.id !== id); localSave(); render(); return; }
  const { data, error } = await sb.from('songs').delete().eq('id', id).select('id');
  if (error || !data?.length) throw new Error(error?.message || 'Not allowed');
  await loadSongs();
}

/* ================= auth ================= */
async function refreshAuth() {
  if (!sb) { canEdit = true; userEmail = ''; return applyAuth(); }
  const { data: { session } } = await sb.auth.getSession();
  userEmail = session?.user?.email || '';
  canEdit = false;
  if (session) {
    const { data } = await sb.from('editors').select('user_id').eq('user_id', session.user.id).maybeSingle();
    canEdit = !!data;
  }
  applyAuth();
}
function applyAuth() {
  const logged = !!userEmail;
  $('#loginBtn').hidden = !sb || logged;
  $('#logoutBtn').hidden = !logged;
  $('#addBtn').hidden = !canEdit;
  $('#importBtn').hidden = !canEdit;
  $('#who').textContent = logged ? (canEdit ? `Editor: ${userEmail}` : `${userEmail} is not an editor yet`) : '';
  render();
}
$('#loginBtn').onclick = () => { $('#loginStatus').textContent = ''; $('#loginSheet').classList.add('on'); $('#lEmail').focus(); };
$('#loginCancel').onclick = () => $('#loginSheet').classList.remove('on');
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  $('#loginStatus').textContent = 'Logging in…';
  const { error } = await sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lPass').value });
  if (error) { $('#loginStatus').innerHTML = '<span class="err">Wrong email or password.</span>'; return; }
  $('#lPass').value = '';
  $('#loginSheet').classList.remove('on');
  await refreshAuth();
};
$('#logoutBtn').onclick = async () => { await sb.auth.signOut(); await refreshAuth(); };

/* ================= library ================= */
const thumbBg = s => { const m = MOODS[s.sections?.[0]?.mood] || MOODS.calm; return `linear-gradient(135deg,${rgb(m[0])},${rgb(m[1])} 55%,${rgb(m[2])})`; };
function render() {
  const q = $('#q').value.trim().toLowerCase();
  const list = songs.filter(s => (s.title + ' ' + (s.artist || '')).toLowerCase().includes(q)).sort((a, b) => a.title.localeCompare(b.title));
  $('#grid').innerHTML = list.length ? list.map(s => `<article class="song">
    <button class="thumb" style="background:${thumbBg(s)}" data-play="${esc(s.id)}" aria-label="Play ${esc(s.title)}"><b dir="auto">${esc(s.title)}</b><span class="play"></span></button>
    <div class="meta"><span dir="auto">${esc(s.artist || 'Unknown artist')} · ${s.sections?.length || 0} parts</span><span class="tag">${s.lang === 'ar' ? 'Arabic' : 'English'}</span>
    ${s.chords?.trim() ? `<button data-chords="${esc(s.id)}" title="Lyrics with chords for the music team">Chords</button>` : ''}
    ${canEdit ? `<span class="bar"><button data-edit="${esc(s.id)}">Edit</button><button data-del="${esc(s.id)}">Delete</button></span>` : ''}</div></article>`).join('')
    : `<div class="empty">${songs.length ? 'No songs match your search.' : canEdit ? 'Your library is empty. Add your first song.' : 'No songs yet.'}</div>`;
}
$('#q').addEventListener('input', render);
$('#grid').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const find = id => songs.find(s => s.id === id);
  if (b.dataset.play) present(find(b.dataset.play));
  if (b.dataset.chords) openChords(find(b.dataset.chords));
  if (b.dataset.edit) openEditor(find(b.dataset.edit));
  if (b.dataset.del) {
    if (!b.dataset.armed) {
      b.dataset.armed = 1; b.textContent = 'Confirm delete';
      setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 3000);
      return;
    }
    try { await removeSong(b.dataset.del); } catch { b.textContent = 'Not allowed'; }
  }
});

/* export / import */
$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(songs.map(({ id, ...s }) => s), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'sing-along-library.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const list = JSON.parse(await file.text());
    if (!Array.isArray(list)) throw 0;
    const have = new Set(songs.map(s => s.title + '|' + s.lang));
    let added = 0;
    for (const s of list) {
      if (!s?.title || !Array.isArray(s.sections) || have.has(s.title + '|' + s.lang)) continue;
      await saveSong({ id: uuid(), title: String(s.title), artist: String(s.artist || ''), lang: s.lang === 'ar' ? 'ar' : 'en', sections: s.sections, chords: String(s.chords || '') });
      added++;
    }
    $('#syncNote').textContent = `Imported ${added} song${added === 1 ? '' : 's'}. Songs with the same title were skipped.`;
  } catch { $('#syncNote').textContent = 'That file could not be imported.'; }
};

/* ================= editor ================= */
function setLang(l) {
  lang = l;
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === l));
  $('#subLbl').textContent = l === 'en' ? 'Arabic translation' : 'Pronunciation in English letters';
  $('#fSub').placeholder = l === 'en' ? 'One line for each lyric line' : 'e.g. inta noori fid-dalma';
  $('#trCol').hidden = l !== 'ar';
  if (draft) renderDraft();
}
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => setLang(b.dataset.lang));

function openEditor(s) {
  editing = s || null;
  draft = s ? JSON.parse(JSON.stringify(s.sections)) : null;
  $('#edTitle').textContent = s ? 'Edit song' : 'Add song';
  $('#fTitle').value = s?.title || '';
  $('#fArtist').value = s?.artist || '';
  const join = k => s ? s.sections.map(x => x.lines.map(l => l[k]).join('\n')).join('\n\n') : '';
  $('#fRaw').value = s ? s.sections.map(x => `[${x.label}]\n` + x.lines.map(l => l.main).join('\n')).join('\n\n') : '';
  $('#fSub').value = join('sub');
  $('#fTr').value = join('tr');
  $('#fChords').value = s?.chords || '';
  $('#chordsBox').open = !!s?.chords;
  $('#status').textContent = '';
  sel = 0;
  setLang(s?.lang || 'en');
  $('#sheet').classList.add('on');
  renderDraft();
  $('#fTitle').focus();
}
$('#addBtn').onclick = () => openEditor();
$('#closeEd').onclick = () => $('#sheet').classList.remove('on');

/* --- finding parts without AI --- */
const LABEL = /^\s*(?:\[(.+?)\]|\(((?:verse|chorus|pre-?chorus|bridge|intro|outro|tag|refrain|ending)[^)]*)\)|((?:verse|chorus|pre-?chorus|bridge|intro|outro|tag|refrain|ending|كورال|قرار|مقطع|عدد|ردة)(?:\s*\d+)?)\s*:?)\s*$/i;
const JUNK = /^\s*(\d+\s*contributors?.*|.*\blyrics\b\s*$|embed|you might also like|translations?|see .* live|get tickets.*|written by.*|copyright.*|©.*|ccli.*|\(?repeat( chorus)?\)?|\(?x\d\)?)\s*$/i;
const CHORDS = /^\s*([A-G][#b]?(m|maj|min|sus|dim|aug|add)?\d*(\/[A-G][#b]?)?\s*)+$/;
const REPEAT = /\s*[\(\[]?\s*(?:x|×)\s*(\d)\s*[\)\]]?\s*$/i;

function expand(line) {
  const m = line.match(REPEAT);
  if (!m) return [line];
  const text = line.replace(REPEAT, '').trim();
  return Array(+m[1]).fill(text);
}
function blocksFrom(raw) {
  const blocks = []; let cur = null;
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    const lab = line.match(LABEL);
    if (lab) { cur = { label: (lab[1] || lab[2] || lab[3]).trim(), lines: [] }; blocks.push(cur); continue; }
    if (!line) { if (cur && cur.lines.length) cur = null; continue; }
    if (JUNK.test(line) || CHORDS.test(line)) continue;
    if (!cur) { cur = { label: null, lines: [] }; blocks.push(cur); }
    cur.lines.push(...expand(line));
  }
  return blocks.filter(b => b.lines.length);
}
function plainLines(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !LABEL.test(l) && !JUNK.test(l) && !CHORDS.test(l)).flatMap(expand);
}
function nameBlocks(blocks) {
  if (blocks.some(b => b.label)) { let n = 0; blocks.forEach(b => { if (!b.label) b.label = 'Part ' + (++n); }); return blocks; }
  if (blocks.length === 1 && blocks[0].lines.length > 6) {
    const one = blocks[0].lines; blocks = [];
    for (let i = 0; i < one.length; i += 4) blocks.push({ label: null, lines: one.slice(i, i + 4) });
    blocks.forEach((b, i) => b.label = 'Part ' + (i + 1));
    return blocks;
  }
  const key = b => b.lines.join('\n').toLowerCase().replace(/[^\p{L}\p{N}\n]/gu, '');
  const count = {}; blocks.forEach(b => count[key(b)] = (count[key(b)] || 0) + 1);
  const chorusAt = blocks.map((b, i) => count[key(b)] > 1 ? i : -1).filter(i => i >= 0);
  let v = 0;
  blocks.forEach((b, i) => {
    if (count[key(b)] > 1) b.label = 'Chorus';
    else if (chorusAt.length >= 2 && i > chorusAt[1]) b.label = 'Bridge';
    else b.label = 'Verse ' + (++v);
  });
  return blocks;
}
function moodFor(label) {
  const l = label.toLowerCase();
  if (/pre/.test(l)) return 'hopeful';
  if (/chorus|refrain|كورال|قرار|ردة/.test(l)) return 'joyful';
  if (/bridge/.test(l)) return 'majestic';
  if (/tag|ending|outro/.test(l)) return 'intimate';
  return 'calm';
}
function build() {
  const raw = $('#fRaw').value;
  const blocks = nameBlocks(blocksFrom(raw));
  const subs = plainLines($('#fSub').value), trs = lang === 'ar' ? plainLines($('#fTr').value) : [];
  const oldMood = Object.fromEntries((draft || []).map(s => [s.label, s.mood]));
  let k = 0;
  const secs = blocks.map(b => ({
    label: b.label,
    mood: oldMood[b.label] || moodFor(b.label),
    lines: b.lines.map(main => { const l = { main, sub: subs[k] || '', tr: trs[k] || '' }; k++; return l; })
  }));
  const msgs = [];
  if (subs.length && subs.length !== k) msgs.push(`${lang === 'en' ? 'Arabic translation' : 'Pronunciation'} has ${subs.length} lines but the lyrics have ${k}.`);
  if (trs.length && trs.length !== k) msgs.push(`English translation has ${trs.length} lines but the lyrics have ${k}.`);
  return { secs, msgs };
}
$('#buildBtn').onclick = () => {
  const { secs, msgs } = build();
  draft = secs; sel = 0;
  renderDraft();
  $('#status').innerHTML = !secs.length ? 'Add some lyrics first.'
    : `Found ${secs.length} parts. Check the names and lines below.` + (msgs.length ? `<br><span class="err">${esc(msgs.join(' '))} Check for missing or extra lines.</span>` : '');
};

let sel = 0;
/* Fill translations into the parts as you paste or type, without rebuilding the parts. */
let fillT;
function fillFromBoxes() {
  if (!draft?.length) return;
  const subs = plainLines($('#fSub').value), trs = lang === 'ar' ? plainLines($('#fTr').value) : [];
  let k = 0;
  draft.forEach(sec => sec.lines.forEach(l => { if (subs.length) l.sub = subs[k] || ''; if (trs.length) l.tr = trs[k] || ''; k++; }));
  renderDraft();
  const msgs = [];
  if (subs.length && subs.length !== k) msgs.push(`${lang === 'en' ? 'Arabic translation' : 'Pronunciation'} has ${subs.length} lines but the lyrics have ${k}.`);
  if (trs.length && trs.length !== k) msgs.push(`English translation has ${trs.length} lines but the lyrics have ${k}.`);
  $('#status').innerHTML = msgs.length ? `<span class="err">${esc(msgs.join(' '))}</span>` : (subs.length || trs.length ? 'Translations matched to the lyrics.' : '');
}
['#fSub', '#fTr'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(fillT); fillT = setTimeout(fillFromBoxes, 300); }));

function renderDraft() {
  $('#edgrid').hidden = !draft || !draft.length;
  if (!draft) { $('#secs').innerHTML = ''; return; }
  sel = Math.max(0, Math.min(sel, draft.length - 1));
  const cols = lang === 'ar' ? 3 : 2;
  const hdr = lang === 'ar' ? ['Arabic', 'Pronunciation', 'English'] : ['English', 'Arabic'];
  const last = draft.length - 1;
  $('#secs').innerHTML = draft.map((s, i) => `<div class="sec${i === sel ? ' sel' : ''}" data-sec="${i}"><div class="sec-h">
    <input value="${esc(s.label)}" data-i="${i}" data-k="label" aria-label="Part name">
    <select data-i="${i}" data-k="mood" aria-label="Background mood">${MOOD_NAMES.map(m => `<option ${m === s.mood ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div class="tools" style="margin-bottom:8px">
      <button data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move part up">↑ Up</button>
      <button data-act="down" data-i="${i}" ${i === last ? 'disabled' : ''} aria-label="Move part down">↓ Down</button>
      <button data-act="dup" data-i="${i}">Duplicate</button>
      <button data-act="mergeUp" data-i="${i}" ${i === 0 ? 'disabled' : ''}>Join with part above</button>
      <button data-act="del" data-i="${i}">Delete part</button>
    </div>
    ${s.lines.map((l, j) => `<div class="ln" style="--c:${cols}">${['main', 'sub', 'tr'].slice(0, cols).map((k, c) => `<input dir="auto" value="${esc(l[k])}" placeholder="${hdr[c]}" aria-label="${hdr[c]}" data-i="${i}" data-j="${j}" data-k="${k}">`).join('')}
      <span class="lt">${j > 0 ? `<button data-act="split" data-i="${i}" data-j="${j}" title="Start a new part from this line">Split</button>` : ''}<button data-act="delLine" data-i="${i}" data-j="${j}" aria-label="Delete line">×</button></span></div>`).join('')}
    <button data-act="addLine" data-i="${i}" style="min-height:36px;font-size:13px">+ Add line</button></div>`).join('')
    + `<button data-act="addPart" style="margin-top:12px">+ Add part</button>`;
  renderMini();
}
function renderMini() {
  if (!draft?.length) return;
  const s = draft[sel];
  const m = MOODS[s.mood] || MOODS.calm;
  $('#mini').style.background = `radial-gradient(circle at 25% 30%,${rgb(m[1])},transparent 60%),radial-gradient(circle at 80% 75%,rgba(${m[2].join(',')},.65),transparent 55%),${rgb(m[0].map(v => v * .5))}`;
  renderSlide($('#miniWords'), s);
  $('#pvLabel').textContent = `${s.label} (${sel + 1} of ${draft.length})`;
  document.querySelectorAll('.sec').forEach(el => el.classList.toggle('sel', +el.dataset.sec === sel));
}
function selectPart(i) { if (i !== sel && draft?.[i]) { sel = i; renderMini(); } }
$('#pvPrev').onclick = () => selectPart(Math.max(0, sel - 1));
$('#pvNext').onclick = () => selectPart(Math.min(draft.length - 1, sel + 1));
$('#secs').addEventListener('focusin', e => { const s = e.target.closest('.sec'); if (s) selectPart(+s.dataset.sec); });
$('#secs').addEventListener('click', e => {
  const s = e.target.closest('.sec'); if (s) selectPart(+s.dataset.sec);
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const i = +b.dataset.i, j = +b.dataset.j, d = draft, blank = () => ({ main: '', sub: '', tr: '' });
  switch (b.dataset.act) {
    case 'up': [d[i - 1], d[i]] = [d[i], d[i - 1]]; sel = i - 1; break;
    case 'down': [d[i + 1], d[i]] = [d[i], d[i + 1]]; sel = i + 1; break;
    case 'dup': d.splice(i + 1, 0, JSON.parse(JSON.stringify(d[i]))); sel = i + 1; break;
    case 'mergeUp': d[i - 1].lines.push(...d[i].lines); d.splice(i, 1); sel = i - 1; break;
    case 'del': d.splice(i, 1); sel = Math.min(i, d.length - 1); break;
    case 'split': d.splice(i + 1, 0, { label: d[i].label + ' (part 2)', mood: d[i].mood, lines: d[i].lines.splice(j) }); sel = i + 1; break;
    case 'delLine': d[i].lines.splice(j, 1); if (!d[i].lines.length) d.splice(i, 1); break;
    case 'addLine': d[i].lines.push(blank()); break;
    case 'addPart': d.push({ label: 'New part', mood: 'calm', lines: [blank()] }); sel = d.length - 1; break;
  }
  renderDraft();
});
$('#secs').addEventListener('input', e => {
  const { i, j, k } = e.target.dataset; if (i == null) return;
  if (j != null) draft[i].lines[j][k] = e.target.value; else draft[i][k] = e.target.value;
  selectPart(+i); renderMini();
});
$('#secs').addEventListener('change', e => { if (e.target.dataset.k === 'mood') renderMini(); });

function currentSong() {
  if (!draft) draft = build().secs;
  return { id: editing?.id || uuid(), title: $('#fTitle').value.trim() || 'Untitled song', artist: $('#fArtist').value.trim(), lang, sections: draft, chords: $('#fChords').value };
}
$('#previewBtn').onclick = () => { const s = currentSong(); if (s.sections.length) present(s); else $('#status').textContent = 'Add some lyrics first.'; };
$('#saveBtn').onclick = async () => {
  const s = currentSong();
  if (!s.sections.length) { $('#status').textContent = 'Add some lyrics first.'; return; }
  try { await saveSong(s); $('#sheet').classList.remove('on'); }
  catch { $('#status').innerHTML = '<span class="err">Could not save. Make sure you are logged in as an editor.</span>'; }
};

/* ================= chords view ================= */
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const CHORD = /^\(?[A-G][#b]?(?:maj|min|m|M|sus|dim|aug|add|\+|°|ø)?\d*(?:(?:sus|add|maj|b|#)\d+)*(?:\/[A-G][#b]?)?\)?$/;
const FILLER = /^(\||\/|-|x\d|\(x\d\)|N\.?C\.?)$/i;
const HEAD = /^\s*\[?\s*((?:verse|chorus|pre-?chorus|bridge|intro|outro|tag|ending|interlude|instrumental|refrain|turnaround|كورال|قرار|مقطع|عدد|ردة)[^\]:]*)\]?\s*:?\s*$/i;
let chordSong = null, shift = 0, cfs = 17;
try { cfs = +localStorage.getItem('singalong-cfs') || 17; } catch {}

function tNote(n, st, flat) {
  let i = SHARP.indexOf(n); if (i < 0) i = FLAT.indexOf(n); if (i < 0) return n;
  return (flat ? FLAT : SHARP)[(i + st + 120) % 12];
}
function tChord(c, st) {
  if (!st) return c;
  const flat = /^\(?[A-G]b/.test(c) || (st < 0 && !/#/.test(c));
  return c.replace(/^(\(?)([A-G][#b]?)/, (_, p, n) => p + tNote(n, st, flat)).replace(/\/([A-G][#b]?)/, (_, n) => '/' + tNote(n, st, flat));
}
// a chord line is mostly chords; notes like "(B7 2nd time)" are allowed
const isChordLine = line => { const t = line.trim().split(/\s+/).filter(x => x && !FILLER.test(x)); const n = t.filter(x => CHORD.test(x)).length; return n > 0 && n / t.length >= 0.5 && !/[\u0600-\u06FF]/.test(line); };
const chordSpan = c => `<span class="ch">${esc(c)}</span>`;
function chordLineHtml(line) {
  // transpose each chord, keep the spacing so chords stay over the right words
  let out = '', pad = 0;
  line.split(/(\s+)/).forEach(tok => {
    if (!tok) return;
    if (/^\s+$/.test(tok)) { const n = Math.max(1, tok.length - pad); out += ' '.repeat(n); pad = 0; return; }
    if (CHORD.test(tok)) { const t = tChord(tok, shift); pad = Math.max(0, t.length - tok.length); out += chordSpan(t); }
    else out += esc(tok);
  });
  return out;
}
function inlineToTwoLines(line) {
  // "[G]Amazing [C]grace" -> chords line above lyric line
  let chords = '', lyric = '';
  line.split(/(\[[^\]]+\])/).forEach(part => {
    const m = part.match(/^\[([^\]]+)\]$/);
    if (m && CHORD.test(m[1].trim())) {
      const c = tChord(m[1].trim(), shift);
      if (chords.length > lyric.length) lyric += ' '.repeat(chords.length - lyric.length + 1);
      chords += ' '.repeat(Math.max(0, lyric.length - chords.length)) + '\u0000' + c + '\u0001';
    } else lyric += part;
  });
  const html = esc(chords).replace(/\u0000(.*?)\u0001/g, (_, c) => chordSpan(c));
  return `<span class="cl">${html}</span><span class="cl">${esc(lyric) || ' '}</span>`;
}
function renderChart() {
  const blocks = [[]];
  for (const raw of (chordSong.chords || '').replace(/\t/g, '    ').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    const head = line.match(HEAD) || (/^\s*\[[^\]]+\]\s*$/.test(line) && !CHORD.test(line.trim().slice(1, -1)) ? [0, line.trim().slice(1, -1)] : null);
    if (head) { blocks.push([`<h3 dir="auto">${esc(head[1].trim())}</h3>`]); continue; }
    const cur = blocks[blocks.length - 1];
    if (!line.trim()) { if (cur.length) blocks.push([]); continue; }
    if (/\[[A-G][^\]]*\]/.test(line) && line.match(/\[([^\]]+)\]/g).some(x => CHORD.test(x.slice(1, -1).trim()))) cur.push(inlineToTwoLines(line));
    else if (isChordLine(line)) cur.push(`<span class="cl">${chordLineHtml(line)}</span>`);
    else cur.push(`<span class="cl">${esc(line)}</span>`);
  }
  $('#chart').innerHTML = blocks.filter(b => b.length).map(b => `<div class="blk">${b.join('')}</div>`).join('');
  $('#chart').style.setProperty('--cfs', cfs + 'px');
  $('#cKey').textContent = shift ? `Transposed ${shift > 0 ? '+' : ''}${shift}` : 'Original key';
}
function openChords(s) {
  if (!s) return;
  chordSong = s; shift = 0;
  $('#cTitle').textContent = s.title;
  renderChart();
  $('#chordView').classList.add('on');
  $('#chordView').scrollTop = 0;
}
$('#tUp').onclick = () => { shift = shift + 1 > 11 ? 0 : shift + 1; renderChart(); };
$('#tDown').onclick = () => { shift = shift - 1 < -11 ? 0 : shift - 1; renderChart(); };
const setFs = d => { cfs = Math.max(12, Math.min(32, cfs + d)); try { localStorage.setItem('singalong-cfs', cfs); } catch {} renderChart(); };
$('#fsUp').onclick = () => setFs(2);
$('#fsDown').onclick = () => setFs(-2);
$('#cClose').onclick = () => $('#chordView').classList.remove('on');

/* ================= presenter ================= */
let slides = [], idx = 0, idleT;
/* Draw one whole part and shrink the text until all of it fits the box. */
function renderSlide(box, part) {
  box.innerHTML = `<div class="inner">${part.lines.filter(l => l.main || l.sub || l.tr).map(l => `<div class="pair">${l.main ? `<div class="m" dir="auto">${esc(l.main)}</div>` : ''}${l.sub ? `<div class="s" dir="auto">${esc(l.sub)}</div>` : ''}${l.tr ? `<div class="t" dir="auto">${esc(l.tr)}</div>` : ''}</div>`).join('')}</div>`;
  fit(box);
}
function fit(box) {
  const inner = box.firstElementChild; if (!inner) return;
  const cs = getComputedStyle(box);
  const availH = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const availW = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  if (availH <= 0 || availW <= 0) return;
  let size = Math.min(availW * .075, availH * .16, 72);
  box.style.fontSize = size + 'px';
  while (size > 8 && (inner.scrollHeight > availH || inner.scrollWidth > availW)) { size *= .93; box.style.fontSize = size + 'px'; }
}
window.addEventListener('resize', () => {
  if ($('#stage').classList.contains('on')) fit($('#words'));
  if ($('#sheet').classList.contains('on')) fit($('#miniWords'));
});
function present(s) {
  if (!s) return;
  slides = s.sections.filter(x => x.lines.length); idx = 0;
  if (!slides.length) return;
  $('#stTitle').textContent = s.title;
  $('#stage').classList.add('on');
  show(0, true); poke(); startBg();
}
function show(i, instant) {
  idx = Math.max(0, Math.min(slides.length - 1, i));
  const sl = slides[idx], w = $('#words');
  setMood(sl.mood);
  const paint = () => { renderSlide(w, sl); w.classList.remove('fade'); };
  if (instant) paint(); else { w.classList.add('fade'); setTimeout(paint, matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 420); }
  $('#dots').innerHTML = slides.map((x, k) => `<button data-k="${k}" aria-current="${k === idx}">${esc(x.label)}</button>`).join('');
}
const go = d => { if (slides.length) show(idx + d); };
$('#prevBtn').onclick = () => go(-1);
$('#nextBtn').onclick = () => go(1);
$('#dots').onclick = e => { const b = e.target.closest('button'); if (b) show(+b.dataset.k); };

const isFs = () => document.fullscreenElement || document.webkitFullscreenElement;
const exitFs = () => (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
function closeStage() { $('#stage').classList.remove('on'); stopBg(); if (isFs()) exitFs(); }
$('#exitBtn').onclick = closeStage;
$('#fsBtn').onclick = () => {
  if (isFs()) return exitFs();
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  req?.call(el)?.catch?.(() => {});
};
const fsLabel = () => { $('#fsBtn').textContent = isFs() ? 'Exit full screen' : 'Full screen'; };
document.addEventListener('fullscreenchange', fsLabel);
document.addEventListener('webkitfullscreenchange', fsLabel);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('#loginSheet').classList.contains('on')) return $('#loginSheet').classList.remove('on');
    if ($('#sheet').classList.contains('on')) return $('#sheet').classList.remove('on');
    if ($('#chordView').classList.contains('on')) return $('#chordView').classList.remove('on');
  }
  if (!$('#stage').classList.contains('on')) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1); }
  else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1); }
  else if (e.key === 'Escape' && !isFs()) closeStage();
  else if (e.key === 'f') $('#fsBtn').click();
  poke();
});
let tx = null;
$('#stage').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
$('#stage').addEventListener('touchend', e => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); tx = null; poke(); });
function poke() { $('#stage').classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => $('#stage').classList.add('idle'), 3000); }
$('#stage').addEventListener('mousemove', poke);

/* ================= living background ================= */
const cv = $('#bg'), cx = cv.getContext('2d');
let raf = 0, cur = MOODS.calm.map(c => c.slice()), target = MOODS.calm, moodName = 'calm';
const t0 = performance.now();
const blobs = Array.from({ length: 6 }, (_, i) => ({ ph: i * 1.7, sp: .6 + Math.random() * .6, r: .35 + Math.random() * .3, ci: i % 3 }));
const motes = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 2 + .6, v: Math.random() * .4 + .1 }));
function setMood(m) { moodName = MOODS[m] ? m : 'calm'; target = MOODS[moodName]; }
function frame(now) {
  const W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = cv.clientHeight * devicePixelRatio;
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const t = (now - t0) / 1000, speed = (moodName === 'joyful' ? 1.6 : moodName === 'majestic' ? 1.1 : .7) * (reduce ? 0 : 1);
  const rot = Math.floor(t / 14) % 3; // palette slowly rotates so the scene keeps changing
  for (let i = 0; i < 3; i++) { const tg = target[(i + rot) % 3]; for (let k = 0; k < 3; k++) cur[i][k] += (tg[k] - cur[i][k]) * .015; }
  cx.fillStyle = rgb(cur[0].map(v => v * .35)); cx.fillRect(0, 0, W, H);
  cx.globalCompositeOperation = 'screen';
  blobs.forEach((b, i) => {
    const a = t * .08 * speed * b.sp + b.ph;
    const x = W * (.5 + .38 * Math.sin(a * 1.3 + i)), y = H * (.5 + .34 * Math.cos(a * .9 + i * 2)), r = Math.max(W, H) * b.r;
    const g = cx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${cur[b.ci].map(Math.round)},.55)`); g.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
  });
  cx.fillStyle = `rgba(${cur[2].map(v => Math.round(v * .5 + 127))},.5)`;
  motes.forEach(m => {
    m.y -= m.v * .0006 * speed; if (m.y < -.02) { m.y = 1.02; m.x = Math.random(); }
    cx.beginPath(); cx.arc(m.x * W + Math.sin(t * .5 + m.s * 9) * 12, m.y * H, m.s * devicePixelRatio, 0, 7); cx.fill();
  });
  cx.globalCompositeOperation = 'source-over';
  const v = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); cx.fillStyle = v; cx.fillRect(0, 0, W, H);
  raf = requestAnimationFrame(frame);
}
const startBg = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); };
const stopBg = () => cancelAnimationFrame(raf);

/* ================= start ================= */
$('#demoBanner').hidden = !!sb;
if (sb) sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' || ev === 'TOKEN_REFRESHED') refreshAuth(); });
refreshAuth().then(loadSongs);
}
