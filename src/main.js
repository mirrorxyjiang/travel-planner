import './style.css';
import { state, load, save, subscribe, commit, replace, uid } from './state.js';
import { MODES } from './categories.js';
import { loadAmap, initMap, sync, ready, searchTips, resolveTip, panTo, reverseGeocode } from './map.js';
import { render } from './list.js';
import { exportJSON, importFile, shareLink, readHash, exportImage } from './share.js';
import { toast, esc } from './util.js';

const $ = (id) => document.getElementById(id);

load();
const shared = readHash();
if (shared) {
  if (!state.stops.length || confirm('这是一份分享的行程，打开会覆盖当前行程。\n想保留当前行程？先点“取消”，导出 JSON 后再打开。')) {
    try { replace(shared); } catch (e) { toast(e.message); }
  }
  history.replaceState(null, '', location.pathname + location.search);
}

$('modes').innerHTML = Object.entries(MODES).map(([k, m]) => `<button data-mode="${k}">${m.icon} ${m.label}</button>`).join('');
$('modes').onclick = (e) => {
  const b = e.target.closest('[data-mode]');
  if (b) { state.mode = b.dataset.mode; commit(); }
};
$('title').oninput = (e) => { state.title = e.target.value; save(); };

function header() {
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.mode));
  if (document.activeElement !== $('title')) $('title').value = state.title;
}
subscribe(() => { header(); render(); sync(); });
header();
render();

$('bExport').onclick = exportJSON;
$('bImport').onclick = () => $('file').click();
$('file').onchange = (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; };
$('bLink').onclick = shareLink;
$('bImg').onclick = exportImage;
$('bClear').onclick = () => {
  if (state.stops.length && confirm('确定清空所有站点和清单？')) { state.stops = []; commit(); }
};

function addStop(lng, lat, extra = {}) {
  state.stops.push({ id: uid(), name: extra.name || `站点 ${state.stops.length + 1}`, cat: 'sight', lng, lat, memo: extra.memo || '', checklist: [] });
  commit();
}

/* 地点搜索 */
const q = $('q'), sg = $('sugg');
let tips = [], seq = 0, st;
const closeSg = () => { sg.hidden = true; };
const addr = (t) => [t.district, t.address].filter((x) => typeof x === 'string' && x).join(' ');
q.oninput = () => {
  clearTimeout(st);
  const v = q.value.trim(), my = ++seq;
  if (!v || !ready()) return closeSg();
  st = setTimeout(async () => {
    const r = (await searchTips(v)).filter((t) => t.name);
    if (my !== seq) return;
    tips = r;
    sg.innerHTML = r.length
      ? r.map((t, i) => `<li data-i="${i}"><b>${esc(t.name)}</b><span>${esc(addr(t))}</span></li>`).join('')
      : '<li class="none">没有找到相关地点</li>';
    sg.hidden = false;
  }, 250);
};
async function pick(t) {
  closeSg(); q.value = ''; seq++;
  try {
    const p = await resolveTip(t);
    addStop(p.lng, p.lat, { name: t.name, memo: addr(t) });
    panTo(p.lng, p.lat);
  } catch { toast('没能定位到这个地点'); }
}
sg.onclick = (e) => { const li = e.target.closest('[data-i]'); if (li) pick(tips[+li.dataset.i]); };
q.onkeydown = (e) => {
  if (e.key === 'Enter' && !sg.hidden && tips[0]) pick(tips[0]);
  if (e.key === 'Escape') closeSg();
};
document.addEventListener('click', (e) => { if (!e.target.closest('#search')) closeSg(); });
function start(key, sec) {
  loadAmap(key, sec)
    .then(() => { initMap(async (lng, lat) => { const g = await reverseGeocode(lng, lat); addStop(lng, lat, { name: g.name, memo: g.address }); }); $('gate').hidden = true; render(); })
    .catch((e) => { toast(e.message); $('gate').hidden = false; });
}
const key = import.meta.env.VITE_AMAP_KEY || localStorage.getItem('travel_planner_key') || '';
const sec = import.meta.env.VITE_AMAP_SEC || localStorage.getItem('travel_planner_sec') || '';
$('inKey').value = key;
$('inSec').value = sec;
$('bStart').onclick = () => {
  const k = $('inKey').value.trim(), s = $('inSec').value.trim();
  if (!k) return toast('请填写高德 Key');
  localStorage.setItem('travel_planner_key', k);
  localStorage.setItem('travel_planner_sec', s);
  start(k, s);
};
if (key) start(key, sec);
else $('gate').hidden = false;
