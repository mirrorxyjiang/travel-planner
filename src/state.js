import { CATS } from './categories.js';

const KEY = 'travel_planner_v2';
const OLD = 'travel_planner_v1';
export const state = { version: 2, title: '', mode: 'driving', stops: [] };
const subs = [];
export const subscribe = (f) => subs.push(f);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// 任何来源（本地存储 / 导入文件 / 分享链接 / v1 旧数据）都先经过这里清洗
export function normalize(s) {
  if (!s || !Array.isArray(s.stops)) throw new Error('不是有效的行程数据');
  return {
    version: 2,
    title: String(s.title || ''),
    mode: ['driving', 'walking', 'riding'].includes(s.mode) ? s.mode : 'driving',
    stops: s.stops
      .filter((x) => Number.isFinite(+x.lng) && Number.isFinite(+x.lat))
      .map((x) => ({
        id: x.id || uid(),
        name: x.name || '未命名',
        cat: CATS[x.cat] ? x.cat : 'sight',
        lng: +x.lng,
        lat: +x.lat,
        memo: x.memo || '',
        checklist: (x.checklist || []).map((c) => ({ id: c.id || uid(), text: c.text || '', done: !!c.done })),
      })),
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD);
    if (raw) Object.assign(state, normalize(JSON.parse(raw)));
  } catch {}
}
export const save = () => localStorage.setItem(KEY, JSON.stringify(state));
// 结构性变化（增删、排序、分类、位置）：保存并通知列表和地图
export function commit() {
  save();
  subs.forEach((f) => f());
}
export function replace(data) {
  Object.assign(state, normalize(data));
  commit();
}
