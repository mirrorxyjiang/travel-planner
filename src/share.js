import LZ from 'lz-string';
import { toPng } from 'html-to-image';
import { state, replace } from './state.js';
import { CATS } from './categories.js';
import { legText, totals } from './map.js';
import { esc, fmtDist, fmtTime, toast, download } from './util.js';

const name = () => (state.title || '旅行计划').replace(/[\\/:*?"<>|]/g, '');

export function exportJSON() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  download(url, `${name()}-${new Date().toISOString().slice(0, 10)}.json`);
  URL.revokeObjectURL(url);
  toast('已导出 JSON');
}

export async function importFile(file) {
  try {
    replace(JSON.parse(await file.text()));
    toast(`已导入 ${state.stops.length} 个站点`);
  } catch (e) {
    toast('导入失败：' + e.message);
  }
}

export async function shareLink() {
  const url = `${location.origin}${location.pathname}#plan=${LZ.compressToEncodedURIComponent(JSON.stringify(state))}`;
  try {
    await navigator.clipboard.writeText(url);
    toast(url.length > 8000 ? '链接已复制，但较长，部分聊天软件可能会截断' : '分享链接已复制');
  } catch {
    prompt('复制下面的链接：', url);
  }
}

export function readHash() {
  const m = location.hash.match(/^#plan=(.+)$/);
  if (!m) return null;
  try { return JSON.parse(LZ.decompressFromEncodedURIComponent(m[1])); } catch { return null; }
}

export async function exportImage() {
  if (!state.stops.length) return toast('还没有站点');
  const t = totals();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-10000px;top:0';
  wrap.innerHTML = `<div class="poster"><h1>${esc(state.title || '旅行计划')}</h1>
    <p class="sub">${state.stops.length} 站${t ? ` · 全程 ${fmtDist(t.d)} · ${fmtTime(t.t)}` : ''}</p>
    ${state.stops.map((s, i) => `<div class="p-stop" style="--c:${CATS[s.cat].color}">
      <div class="p-b">${i + 1}</div>
      <div class="p-r"><div class="p-n">${CATS[s.cat].icon} ${esc(s.name)}</div>
        ${s.memo ? `<div class="p-m">${esc(s.memo)}</div>` : ''}
        ${s.checklist.map((c) => `<div class="p-t">${c.done ? '☑' : '☐'} ${esc(c.text)}</div>`).join('')}
        ${i < state.stops.length - 1 ? `<div class="p-s">${esc(legText(i))}</div>` : ''}
      </div></div>`).join('')}</div>`;
  document.body.appendChild(wrap);
  try {
    download(await toPng(wrap.firstElementChild, { pixelRatio: 2, backgroundColor: '#fff' }), `${name()}.png`);
    toast('已保存图片');
  } catch (e) {
    toast('生成图片失败');
  } finally {
    wrap.remove();
  }
}
