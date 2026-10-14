import { state, commit } from './state.js';
import { CATS, MODES } from './categories.js';
import { fmtDist, fmtTime } from './util.js';

let map = null, timer, token = 0, polys = [];
const markers = new Map();
const cache = new Map(); // 路段缓存：只重算变动的那几段
const segs = []; // segs[i] = 第 i 站 → 第 i+1 站
const listeners = [];
export const onSegments = (f) => listeners.push(f);
const emit = () => listeners.forEach((f) => f());
export const ready = () => !!map;

export function legText(i) {
  const r = segs[i];
  if (!r) return '';
  return r.err ? '暂无路线' : `${MODES[state.mode].icon} ${fmtDist(r.distance)} · ${fmtTime(r.time)}`;
}
export function totals() {
  let d = 0, t = 0, ok = false;
  segs.forEach((r) => { if (r && !r.err) { d += r.distance; t += r.time; ok = true; } });
  return ok ? { d, t } : null;
}

export function loadAmap(key, sec) {
  return new Promise((res, rej) => {
    window._AMapSecurityConfig = { securityJsCode: sec };
    const s = document.createElement('script');
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${key}&plugin=AMap.Driving,AMap.Walking,AMap.Riding,AMap.AutoComplete,AMap.PlaceSearch,AMap.Geocoder`;
    s.onload = () => (typeof AMap === 'undefined' ? rej(new Error('高德脚本未就绪')) : res());
    s.onerror = () => rej(new Error('高德脚本加载失败，请检查网络或 Key'));
    document.head.appendChild(s);
  });
}

export function initMap(onAdd) {
  map = new AMap.Map('map', { zoom: 11, center: [116.397, 39.909] });
  map.on('click', (e) => onAdd(e.lnglat.getLng(), e.lnglat.getLat()));
  sync();
  fit();
}

const pin = (s, i) =>
  `<div class="pin" style="background:${CATS[s.cat].color}">${i + 1}<i>${CATS[s.cat].icon}</i></div>`;

export function sync() {
  if (!map) return;
  const ids = new Set(state.stops.map((s) => s.id));
  for (const [id, m] of markers) if (!ids.has(id)) { map.remove(m); markers.delete(id); }
  state.stops.forEach((s, i) => {
    let m = markers.get(s.id);
    if (!m) {
      m = new AMap.Marker({ map, draggable: true, offset: new AMap.Pixel(-14, -14) });
      m.on('dragend', () => {
        const cur = state.stops.find((x) => x.id === s.id);
        const p = m.getPosition();
        if (cur) { cur.lng = p.getLng(); cur.lat = p.getLat(); commit(); }
      });
      markers.set(s.id, m);
    }
    m.setPosition([s.lng, s.lat]);
    m.setContent(pin(s, i));
    m.setTitle(s.name);
  });
  clearTimeout(timer);
  timer = setTimeout(route, 400);
}

export function fit() {
  if (map && markers.size) map.setFitView([...markers.values()], false, [60, 60, 60, 60]);
}
export function focus(id) {
  const s = state.stops.find((x) => x.id === id);
  if (map && s) map.setZoomAndCenter(15, [s.lng, s.lat]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fetchLeg(a, b) {
  return new Promise((res) => {
    const C = { driving: AMap.Driving, walking: AMap.Walking, riding: AMap.Riding }[state.mode];
    new C().search([a.lng, a.lat], [b.lng, b.lat], (st, r) => {
      const x = r && r.routes && r.routes[0];
      if (st !== 'complete' || !x) return res({ err: true });
      const path = (x.steps || x.rides || []).flatMap((p) => p.path || []);
      res({ distance: x.distance, time: x.time, path });
    });
  });
}

async function route() {
  const my = ++token;
  polys.forEach((p) => map.remove(p));
  polys = [];
  segs.length = 0;
  emit();
  const L = state.stops;
  let called = false;
  for (let i = 0; i < L.length - 1; i++) {
    const [a, b] = [L[i], L[i + 1]];
    const k = `${state.mode}|${a.lng},${a.lat}|${b.lng},${b.lat}`;
    let r = cache.get(k);
    if (!r) {
      if (called) await sleep(350); // 高德免费额度有 QPS 限制，逐段请求
      r = await fetchLeg(a, b);
      called = true;
      if (my !== token) return;
      if (!r.err) cache.set(k, r);
    }
    if (my !== token) return;
    segs[i] = r;
    if (r.path && r.path.length)
      polys.push(new AMap.Polyline({ map, path: r.path, strokeColor: '#1f7a6d', strokeWeight: 6, strokeOpacity: 0.85, lineJoin: 'round', showDir: true }));
    emit();
  }
}

let ac, ps;
export function searchTips(kw) {
  return new Promise((res) => {
    ac = ac || new AMap.AutoComplete({ city: '全国' });
    ac.search(kw, (st, r) => res(st === 'complete' && r.tips ? r.tips : []));
  });
}
// 部分提示（如公交线、泛类目）没有坐标，退回用 PlaceSearch 查一次
export function resolveTip(t) {
  return new Promise((res, rej) => {
    const l = t.location;
    if (l && l.lng != null) return res({ lng: l.lng, lat: l.lat });
    ps = ps || new AMap.PlaceSearch({ pageSize: 1 });
    ps.search(`${typeof t.district === 'string' ? t.district : ''}${t.name}`, (st, r) => {
      const p = st === 'complete' && r.poiList && r.poiList.pois[0];
      p && p.location ? res({ lng: p.location.lng, lat: p.location.lat }) : rej(new Error('no location'));
    });
  });
}
export const panTo = (lng, lat) => map && map.setZoomAndCenter(15, [lng, lat]);

// 点选地图：把坐标换成“名称 + 地址”。名称优先取所在区域/附近 80 米内的地点，其次是路名
let gc;
const str = (x) => (typeof x === 'string' ? x : '');
export function reverseGeocode(lng, lat) {
  return new Promise((res) => {
    gc = gc || new AMap.Geocoder({ radius: 100, extensions: 'all' });
    gc.getAddress([lng, lat], (st, r) => {
      const g = st === 'complete' && r.regeocode;
      if (!g) return res({});
      const aoi = (g.aois || [])[0];
      const poi = (g.pois || []).find((p) => +p.distance <= 80);
      const c = g.addressComponent || {};
      const name = str(aoi && aoi.name) || str(poi && poi.name) || (str(c.street) + str(c.streetNumber)) || str(c.township);
      res({ name, address: str(g.formattedAddress) });
    });
  });
}
