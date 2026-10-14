import Sortable from 'sortablejs';
import { state, commit, save, uid } from './state.js';
import { CATS } from './categories.js';
import { onSegments, legText, totals, ready, focus } from './map.js';
import { esc, fmtDist, fmtTime } from './util.js';

const list = document.getElementById('list');

function itemHTML(s, i) {
  const c = CATS[s.cat];
  const d = s.checklist.filter((x) => x.done).length;
  return `<section class="item" data-id="${s.id}" style="--c:${c.color}">
  <button class="badge" data-act="focus" title="在地图上定位">${i + 1}</button>
  <div class="card">
    <div class="card-head">
      <span class="grip" title="拖动排序">⋮⋮</span>
      <input class="name" data-f="name" value="${esc(s.name)}" />
      <button class="x" data-act="del" title="删除站点">✕</button>
    </div>
    <div class="cats">${Object.entries(CATS).map(([k, v]) => `<button class="chip${k === s.cat ? ' on' : ''}" data-act="cat" data-cat="${k}">${v.icon} ${v.label}</button>`).join('')}</div>
    <textarea class="memo" data-f="memo" placeholder="地址、营业时间、小贴士…">${esc(s.memo)}</textarea>
    <div class="todo-t">清单 ${d}/${s.checklist.length}</div>
    ${s.checklist.map((t) => `<div class="todo${t.done ? ' done' : ''}" data-cid="${t.id}"><input type="checkbox" data-f="done" ${t.done ? 'checked' : ''} /><input class="t" data-f="text" value="${esc(t.text)}" placeholder="要做的事…" /><button class="x" data-act="deltodo" title="删除">✕</button></div>`).join('')}
    <button class="add" data-act="addtodo">+ 添加一项</button>
  </div>
  ${i < state.stops.length - 1 ? `<div class="seg" data-seg="${i}"></div>` : ''}
</section>`;
}

export function render() {
  list.innerHTML = state.stops.length
    ? state.stops.map(itemHTML).join('')
    : '<div class="empty">在地图上点一下，<br/>落下第一个站点。</div>';
  updateSeg();
  summary();
}

function updateSeg() {
  list.querySelectorAll('[data-seg]').forEach((el) => {
    el.textContent = legText(+el.dataset.seg) || (ready() ? '计算中…' : '');
  });
}
export function summary() {
  const t = totals();
  document.getElementById('summary').textContent =
    `${state.stops.length} 站` + (t ? ` · 全程 ${fmtDist(t.d)} · ${fmtTime(t.t)}` : '');
}
onSegments(() => { updateSeg(); summary(); });

const find = (el) => {
  const it = el.closest('.item');
  return it && state.stops.find((s) => s.id === it.dataset.id);
};

list.addEventListener('input', (e) => {
  const f = e.target.dataset.f, s = find(e.target);
  if (!f || !s) return;
  if (f === 'name' || f === 'memo') s[f] = e.target.value;
  if (f === 'text') s.checklist.find((t) => t.id === e.target.closest('.todo').dataset.cid).text = e.target.value;
  save();
});
list.addEventListener('change', (e) => {
  const s = find(e.target);
  if (!s) return;
  if (e.target.dataset.f === 'name') commit(); // 名字改完再刷新地图标记提示
  if (e.target.dataset.f === 'done') {
    const row = e.target.closest('.todo');
    s.checklist.find((t) => t.id === row.dataset.cid).done = e.target.checked;
    row.classList.toggle('done', e.target.checked);
    row.closest('.card').querySelector('.todo-t').textContent = `清单 ${s.checklist.filter((t) => t.done).length}/${s.checklist.length}`;
    save();
  }
});
list.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'), s = b && find(b);
  if (!s) return;
  const act = b.dataset.act;
  if (act === 'focus') focus(s.id);
  if (act === 'del') { state.stops = state.stops.filter((x) => x !== s); commit(); }
  if (act === 'cat') { s.cat = b.dataset.cat; commit(); }
  if (act === 'addtodo') {
    s.checklist.push({ id: uid(), text: '', done: false });
    save(); render();
    const ins = list.querySelectorAll(`.item[data-id="${s.id}"] .todo .t`);
    ins[ins.length - 1].focus();
  }
  if (act === 'deltodo') {
    const cid = b.closest('.todo').dataset.cid;
    s.checklist = s.checklist.filter((t) => t.id !== cid);
    save(); render();
  }
});

new Sortable(list, {
  handle: '.grip',
  draggable: '.item',
  animation: 150,
  ghostClass: 'ghost',
  onEnd: (e) => {
    if (e.oldIndex === e.newIndex) return;
    const [m] = state.stops.splice(e.oldIndex, 1);
    state.stops.splice(e.newIndex, 0, m);
    commit();
  },
});
