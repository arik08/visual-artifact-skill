/*!
 * report-kit.js — 세로형 HTML 업무 보고서 런타임
 * - .rk-chart   : <script type="application/json"> 차트 스펙 → ECharts 옵션 자동 생성
 * - .rk-kpis    : JSON 배열 → KPI 카드 / 또는 HTML 카드의 증감·스파크라인 자동 처리
 * - .rk-tablejs : JSON → 숫자 서식·증감색·셀막대·히트맵이 적용된 표
 * - .rk-diagram : <script type="text/x-mermaid"> → Mermaid 다이어그램(테마 자동 적용)
 * - .rk-progress, .rk-toc, 인쇄 대응, QA(검증) 결과를 <html data-rk-qa> 에 기록
 * LLM은 데이터(JSON)만 작성하고, 스타일·축·라벨·툴팁은 이 파일이 결정한다.
 */
(function (global) {
  'use strict';
  var RK = global.RK = global.RK || {};
  RK.version = '1.0.0';
  RK.charts = [];
  RK.issues = [];
  var doc = document, root = doc.documentElement;
  var CONFIG = global.RK_CONFIG || {};

  /* ------------------------------------------------------------------ *
   * 0. 유틸
   * ------------------------------------------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isArr(a) { return Array.isArray(a); }
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function has(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }
  function first() { for (var i = 0; i < arguments.length; i++) if (arguments[i] != null) return arguments[i]; }
  function h(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function where(el) {
    if (!el) return '';
    var fig = el.closest && el.closest('.rk-section');
    var h2 = fig && fig.querySelector('h2');
    return (h2 ? '[' + h2.textContent.trim().slice(0, 30) + '] ' : '') + (el.className ? '.' + String(el.className).split(' ')[0] : el.tagName);
  }
  function issue(level, el, msg) {
    RK.issues.push({ level: level, where: where(el), msg: msg });
    (level === 'error' ? console.error : console.warn)('[report-kit] ' + where(el) + ' ' + msg);
  }

  /* 숫자 파싱: "1,234" "12.5%" "△12" "-3" "▲4" → number */
  function num(v) {
    if (v == null || v === '' || v === '-' || v === '–') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    var s = v.trim();
    var neg = /^[△▼\-−–]/.test(s) || /^\(.*\)$/.test(s);
    var m = s.replace(/,/g, '').match(/\d+(\.\d+)?|\.\d+/);
    if (!m) return null;
    var n = parseFloat(m[0]);
    return neg ? -n : n;
  }
  function decimalsOf(arr) {
    var d = 0;
    (arr || []).forEach(function (v) {
      if (v == null) return;
      var s = typeof v === 'string' ? v.replace(/,/g, '') : String(v);
      var m = s.match(/\.(\d+)/);
      if (m) d = Math.max(d, Math.min(m[1].length, 2));
    });
    return d;
  }

  /* 숫자 서식: RK.fmt(1234.5, {decimals:1, unit:'억원', sign:true, compact:true}) */
  function fmt(v, o) {
    o = o || {};
    if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) return o.empty != null ? o.empty : '–';
    var n = typeof v === 'number' ? v : num(v);
    if (n == null) return String(v);
    var suffix = '';
    if (o.compact) {
      var a = Math.abs(n);
      if (a >= 1e12) { n /= 1e12; suffix = '조'; }
      else if (a >= 1e8) { n /= 1e8; suffix = '억'; }
      else if (a >= 1e4) { n /= 1e4; suffix = '만'; }
    }
    var d = o.decimals;
    var trimZ = !!o.trim;
    if (suffix) {   // 축약 시: 원 데이터의 소수 자릿수 대신 유효숫자 기준 (93,600 → 9.36만)
      d = o.compactDecimals != null ? o.compactDecimals : (Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2);
      trimZ = true;
    } else if (d == null) d = Number.isInteger(n) ? 0 : (Math.abs(n) >= 100 ? 0 : 1);
    var abs = Math.abs(n);
    var body = abs.toLocaleString('ko-KR', { minimumFractionDigits: trimZ ? 0 : d, maximumFractionDigits: d, useGrouping: o.grouping !== false });
    var sign = '';
    if (n < 0 && Number(body.replace(/,/g, '')) !== 0) sign = o.negative === 'triangle' ? '△' : '-';
    else if (o.sign && n > 0) sign = '+';
    return sign + body + suffix + (o.unit || '');
  }
  RK.fmt = fmt;
  RK.num = num;

  /* ------------------------------------------------------------------ *
   * 1. 색 / 토큰
   * ------------------------------------------------------------------ */
  var _cv;
  function toHex(c) {
    c = String(c || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(c)) return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toUpperCase();
    try {
      _cv = _cv || doc.createElement('canvas').getContext('2d');
      _cv.fillStyle = '#000'; _cv.fillStyle = c;
      var r = _cv.fillStyle;
      if (r.charAt(0) === '#') return r.toUpperCase();
      var m = r.match(/[\d.]+/g);
      if (m) return rgbToHex(+m[0], +m[1], +m[2]);
    } catch (e) { /* ignore */ }
    return c;
  }
  function hexToRgb(hx) { hx = toHex(hx).replace('#', ''); return [parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16)]; }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map(function (x) { x = Math.max(0, Math.min(255, Math.round(x))); return (x < 16 ? '0' : '') + x.toString(16); }).join('').toUpperCase(); }
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function delin(c) { c = Math.max(0, Math.min(1, c)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); }
  function toOklab(hx) {
    var c = hexToRgb(hx), r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function fromOklab(L) {
    var l = Math.pow(L[0] + 0.3963377774 * L[1] + 0.2158037573 * L[2], 3);
    var m = Math.pow(L[0] - 0.1055613458 * L[1] - 0.0638541728 * L[2], 3);
    var s = Math.pow(L[0] - 0.0894841775 * L[1] - 1.2914855480 * L[2], 3);
    return rgbToHex(delin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), delin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), delin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s));
  }
  function mix(a, b, t) { var A = toOklab(a), B = toOklab(b); return fromOklab([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
  function luminance(hx) { var c = hexToRgb(hx); return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function textOn(hx) { return luminance(hx) > 0.36 ? '#18202D' : '#FFFFFF'; }
  /* 순차 램프: 연한색 → 진한색 (n단계) */
  function ramp(base, n) {
    var lo = mix('#FFFFFF', base, 0.16), hi = mix(base, '#000000', 0.28), out = [];
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0.75 : i / (n - 1);
      out.push(t < 0.72 ? mix(lo, base, t / 0.72) : mix(base, hi, (t - 0.72) / 0.28));
    }
    return out;
  }
  function divergingRamp(neg, pos) { var mid = '#EEF0F3'; return [neg, mix(neg, mid, 0.55), mid, mix(pos, mid, 0.55), pos]; }
  RK.color = { mix: mix, ramp: ramp, toHex: toHex, textOn: textOn };

  var NAMED_PALETTES = {
    'okabe-ito': ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#56B4E9', '#CC79A7', '#F0E442', '#000000'],
    // 순서는 check_palette.py 로 인접 쌍(정상시각 ΔE≥15, 적·녹색맹 ΔE≥8) 검증 후 재배열한 것
    'tableau': ['#4E79A7', '#F28E2B', '#76B7B2', '#E15759', '#EDC948', '#59A14F', '#B07AA1', '#FF9DA7'],
    'observable': ['#4269D0', '#EFB118', '#FF725C', '#6CC5B0', '#A463F2', '#3CA951', '#FF8AB7', '#97BBF5'],
    'carbon': ['#6929C4', '#1192E8', '#005D5D', '#9F1853', '#FA4D56', '#570408', '#198038', '#002D9C']
  };
  RK.palettes = NAMED_PALETTES;

  var _tok = null;
  function tokens() {
    if (_tok) return _tok;
    var cs = getComputedStyle(root);
    function v(n, d) { var x = cs.getPropertyValue(n).trim(); return x ? toHex(x) : d; }
    var pal = [];
    for (var i = 1; i <= 8; i++) pal.push(v('--rk-c' + i, '#888888'));
    var named = root.getAttribute('data-palette');
    if (named && NAMED_PALETTES[named]) pal = NAMED_PALETTES[named].slice();
    var font = cs.getPropertyValue('--rk-font').trim() || 'sans-serif';
    _tok = {
      font: font, ink: v('--rk-ink', '#18202D'), ink2: v('--rk-ink-2', '#465265'), muted: v('--rk-muted', '#7A8597'),
      line: v('--rk-line', '#E2E7EE'), lineStrong: v('--rk-line-strong', '#C7D0DC'), surface2: v('--rk-surface-2', '#F6F8FB'),
      surface3: v('--rk-surface-3', '#EEF2F7'), paper: v('--rk-paper', '#FFFFFF'), gray: v('--rk-gray-mark', '#C3CAD4'),
      brand: v('--rk-brand', '#1F3A5F'), brandSoft: v('--rk-brand-soft', '#EDF2F8'), brandLine: v('--rk-brand-line', '#C8D5E5'),
      accent: v('--rk-accent', '#D9692B'), accentSoft: v('--rk-accent-soft', '#FCEEE4'),
      good: v('--rk-good', '#188255'), bad: v('--rk-bad', '#CC3D3D'), warn: v('--rk-warn', '#C77C02'), info: v('--rk-info', '#2C6BC9'),
      up: v('--rk-market-up', '#D23A3A'), down: v('--rk-market-down', '#2763C8'),
      palette: pal, seq: v('--rk-seq', pal[0]), divNeg: v('--rk-div-neg', '#C8553D'), divPos: v('--rk-div-pos', '#2F6FA8'),
      market: root.getAttribute('data-delta') === 'market'
    };
    return _tok;
  }
  RK.tokens = tokens;

  /* 스펙의 색 이름 해석: "brand", "accent", "good", "bad", "gray", "c3", "#hex" */
  function resolveColor(c, t, fallback) {
    if (!c) return fallback;
    var k = String(c).trim();
    var map = { brand: t.brand, primary: t.palette[0], accent: t.accent, good: t.good, positive: t.good, bad: t.bad, negative: t.bad,
      warn: t.warn, warning: t.warn, info: t.info, gray: t.gray, grey: t.gray, muted: t.muted, ink: t.ink, up: t.up, down: t.down };
    if (map[k.toLowerCase()]) return map[k.toLowerCase()];
    var m = k.match(/^c([1-8])$/i);
    if (m) return t.palette[+m[1] - 1];
    return toHex(k);
  }

  /* ------------------------------------------------------------------ *
   * 2. 스펙 정규화 (관대한 입력 → 표준형)
   * ------------------------------------------------------------------ */
  var TYPE_ALIAS = {
    column: ['bar'], columns: ['bar'], bars: ['bar'], 'grouped-bar': ['bar'], 'stacked-bar': ['bar', { stack: true }], stacked: ['bar', { stack: true }],
    'stacked-column': ['bar', { stack: true }], 'percent-bar': ['bar', { stack: 'percent' }], 'stacked-100': ['bar', { stack: 'percent' }], '100%': ['bar', { stack: 'percent' }],
    hbar: ['bar', { horizontal: true }], barh: ['bar', { horizontal: true }], 'horizontal-bar': ['bar', { horizontal: true }], 'bar-horizontal': ['bar', { horizontal: true }],
    ranking: ['bar', { horizontal: true, sort: 'desc' }], rank: ['bar', { horizontal: true, sort: 'desc' }], lollipop: ['bar', { horizontal: true, sort: 'desc' }],
    lines: ['line'], spline: ['line', { smooth: true }], trend: ['line'], area: ['line', { area: true }], 'stacked-area': ['line', { area: true, stack: true }],
    mixed: ['combo'], 'bar-line': ['combo'], 'line-bar': ['combo'], dual: ['combo'],
    donut: ['pie', { donut: true }], doughnut: ['pie', { donut: true }], ring: ['pie', { donut: true }],
    bridge: ['waterfall'], 'variance-bridge': ['waterfall'],
    bubble: ['scatter', { bubble: true }], quadrant: ['scatter', { quadrant: true }], 'scatter-quadrant': ['scatter', { quadrant: true }],
    'progress-ring': ['gauge'], meter: ['gauge'],
    roadmap: ['gantt'], schedule: ['gantt'], timeline: ['gantt'],
    'calendar-heatmap': ['calendar'], box: ['boxplot'], hist: ['histogram'], slopegraph: ['slope'],
    tree: ['treemap'], 'tree-map': ['treemap'], flow: ['sankey'], alluvial: ['sankey'], spider: ['radar']
  };
  var TYPES = ['bar', 'line', 'combo', 'pie', 'waterfall', 'bullet', 'dumbbell', 'slope', 'pareto', 'scatter', 'heatmap', 'calendar',
    'funnel', 'gauge', 'radar', 'sankey', 'treemap', 'sunburst', 'boxplot', 'histogram', 'gantt', 'raw'];
  RK.types = TYPES;

  function normItems(arr, valueKeys) {
    // [{name, value}] / [["A", 10]] / {"A":10} → [{name, value, ...}]
    if (isObj(arr)) return Object.keys(arr).map(function (k) { return { name: k, value: num(arr[k]) }; });
    if (!isArr(arr)) return [];
    return arr.map(function (d, i) {
      if (isArr(d)) return { name: String(d[0]), value: num(d[1]), _raw: d };
      if (isObj(d)) {
        var o = {};
        for (var k in d) o[k] = d[k];
        o.name = String(first(d.name, d.label, d.category, d.stage, d.item, d.x, '항목' + (i + 1)));
        var vk = (valueKeys || ['value', 'val', 'y', 'amount', 'count', 'v']).filter(function (k) { return has(d, k); })[0];
        if (vk) o.value = num(d[vk]);
        return o;
      }
      return { name: '항목' + (i + 1), value: num(d) };
    });
  }

  function normalize(spec, el) {
    var s = {};
    for (var k in spec) s[k] = spec[k];
    var warnings = [];
    var t = String(s.type || s.chart || s.kind || '').toLowerCase().trim().replace(/\s+/g, '-');
    if (!t) {
      if (s.links) t = 'sankey'; else if (s.tasks) t = 'gantt'; else if (s.stages) t = 'funnel'; else if (s.indicators) t = 'radar';
      else if (s.points) t = 'scatter'; else if (s.matrix || s.values && isArr(s.values) && isArr(s.values[0])) t = 'heatmap';
      else if (s.option) t = 'raw'; else if (s.items && s.items[0] && has(s.items[0], 'actual')) t = 'bullet';
      else t = 'bar';
      warnings.push('type 누락 → "' + t + '"로 추정');
    }
    if (TYPE_ALIAS[t]) {
      var al = TYPE_ALIAS[t]; t = al[0];
      if (al[1]) for (var ak in al[1]) if (s[ak] == null) s[ak] = al[1][ak];
    }
    s.type = t;
    if (TYPES.indexOf(t) < 0) throw new Error('지원하지 않는 type "' + t + '". 사용 가능: ' + TYPES.join(', '));
    if (s.orientation === 'horizontal' || s.direction === 'horizontal') s.horizontal = true;
    if (s.stacked != null && s.stack == null) s.stack = s.stacked;

    // 범주(x축)
    var cats = first(s.categories, s.xAxis && (s.xAxis.data || s.xAxis), s.x, s.periods, s.dates, s.labels && isArr(s.labels) && typeof s.labels[0] !== 'object' ? s.labels : null);
    if (cats && !isArr(cats)) cats = null;
    if (cats) s.categories = cats.map(String);
    if (isArr(s.labels)) delete s.labels;

    // 계열
    var ser = s.series;
    if (!ser && isArr(s.data) && s.data.length && (typeof s.data[0] === 'number' || typeof s.data[0] === 'string' || s.data[0] == null) && s.categories) {
      ser = [{ name: s.name || s.seriesName || s.title || '값', data: s.data }];
    }
    if (!ser && isArr(s.values) && !isArr(s.values[0]) && s.categories) ser = [{ name: s.name || '값', data: s.values }];
    if (isObj(ser)) ser = Object.keys(ser).map(function (k) { return { name: k, data: ser[k] }; });
    if (isArr(ser)) {
      s.series = ser.map(function (sr, i) {
        if (isArr(sr)) sr = { data: sr };
        var o = {};
        for (var k in sr) o[k] = sr[k];
        o.name = String(first(sr.name, sr.label, '계열' + (i + 1)));
        var d = first(sr.data, sr.values, sr.value, []);
        o.raw = d;
        o.data = isArr(d) ? d.map(function (x) { return isObj(x) ? num(first(x.value, x.y)) : num(x); }) : [];
        if (sr.type && !sr.as) o.as = sr.type;
        return o;
      });
      if (s.categories) {
        s.series.forEach(function (sr) {
          if (sr.data.length !== s.categories.length) {
            warnings.push('계열 "' + sr.name + '" 데이터 개수(' + sr.data.length + ')가 categories 개수(' + s.categories.length + ')와 다름');
            while (sr.data.length < s.categories.length) sr.data.push(null);
            sr.data.length = s.categories.length;
          }
        });
      }
    }
    // 단위·소수점
    if (s.unit == null && s.units) s.unit = s.units;
    if (s.unit == null) s.unit = '';
    s.decimals = s.decimals != null ? +s.decimals : null;
    s._warnings = warnings;
    return s;
  }
  RK.normalize = normalize;

  /* 이름-값 항목 추출: categories+series / data / items / stages 어느 형식이든 */
  function itemsOf(s, keys) {
    if (s.categories && s.series && s.series.length) return s.categories.map(function (c, i) { return { name: c, value: s.series[0].data[i] }; });
    var src = null;
    (keys || ['data', 'items', 'stages', 'steps', 'values']).some(function (k) { if (s[k] != null) { src = s[k]; return true; } return false; });
    return normItems(src);
  }
  function needCats(s) {
    if (!s.categories || !s.categories.length) throw new Error('"categories"(x축 항목 배열)가 필요합니다. 예: "categories": ["1월","2월","3월"]');
    if (!s.series || !s.series.length) throw new Error('"series"가 필요합니다. 예: "series": [{"name":"매출","data":[10,20,30]}]');
  }
  function autoDecimals(s, values) {
    if (s.decimals != null) return s.decimals;
    var raws = [];
    (s.series || []).forEach(function (sr) { raws = raws.concat(sr.raw || sr.data || []); });
    if (values) raws = raws.concat(values);
    return decimalsOf(raws);
  }

  /* ------------------------------------------------------------------ *
   * 3. 공통 옵션 조각
   * ------------------------------------------------------------------ */
  function animOn() { return root.getAttribute('data-animation') === 'on' && !RK._printing; }
  function base(t, extra) {
    var o = {
      animation: animOn(), animationDuration: 450,
      color: t.palette.slice(),
      textStyle: { fontFamily: t.font, color: t.ink2, fontSize: 12 },
      tooltip: tooltipBase(t, 'axis'),
      aria: { enabled: true }
    };
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  function tooltipBase(t, trigger) {
    return {
      trigger: trigger || 'axis', confine: true, backgroundColor: '#FFFFFF', borderColor: t.line, borderWidth: 1, padding: [8, 12],
      textStyle: { color: t.ink, fontSize: 12, fontFamily: t.font },
      extraCssText: 'box-shadow:0 6px 20px rgba(16,24,40,.12);border-radius:8px;',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(120,130,150,0.08)' }, lineStyle: { color: t.lineStrong } }
    };
  }
  function legendCfg(t, names, s) {
    var show = names.length > 1 && s.legend !== false;
    return { show: show, data: names, top: 0, left: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8, itemGap: 16,
      textStyle: { color: t.ink2, fontSize: 12, fontFamily: t.font }, selectedMode: true };
  }
  function grid(top, extra) {
    var g = { left: 6, right: 18, top: top, bottom: 6, containLabel: true };
    for (var k in extra) g[k] = extra[k];
    return g;
  }
  /* 라벨 폭 추정(px, 12px 기준) 및 한글 단어 단위 줄바꿈(keep-all) */
  function textW(s, fs) {
    var w = 0, k = (fs || 12) / 12;
    String(s).split('').forEach(function (ch) { w += /[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(ch) ? 12 : (/[A-Z0-9%@#&]/.test(ch) ? 7.6 : (/[ .,:;'|!()\-~]/.test(ch) ? 3.8 : 6.6)); });
    return w * k;
  }
  function wrapLabel(s, maxPx) {
    s = String(s == null ? '' : s);
    if (!maxPx || textW(s) <= maxPx) return s;
    var toks = s.match(/[^\s~\/·]+[~\/·]?|[~\/·]|\s+/g) || [s];
    var lines = [], cur = '';
    toks.forEach(function (tk) {
      if (/^\s+$/.test(tk)) { if (cur) cur += ' '; return; }
      if (cur.trim() && textW((cur + tk).trim()) > maxPx) { lines.push(cur.trim()); cur = tk; }
      else cur += tk;
    });
    if (cur.trim()) lines.push(cur.trim());
    return lines.slice(0, 3).join('\n');
  }
  RK.wrapLabel = wrapLabel;
  function niceStep(x) { var e = Math.pow(10, Math.floor(Math.log10(Math.abs(x) || 1))), f = x / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
  function niceCeil(v) { if (v <= 0) return v; var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e; return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].filter(function (x) { return x >= f - 1e-9; })[0] * e; }
  function niceExtent(lo, hi, padRatio) {
    var span = (hi - lo) || Math.abs(hi) || 1, pad = span * (padRatio == null ? 0.08 : padRatio);
    var step = niceStep((span + 2 * pad) / 6);
    return { min: Math.floor((lo - pad) / step) * step, max: Math.ceil((hi + pad) / step) * step, step: step };
  }
  function catAxis(t, cats, o) {
    o = o || {};
    var lw = o.labelWidth;
    return {
      type: 'category', data: cats, inverse: !!o.inverse, boundaryGap: o.boundaryGap !== false,
      axisLine: { show: !o.noLine, lineStyle: { color: t.lineStrong } }, axisTick: { show: false },
      axisLabel: { color: t.ink2, fontSize: 12, margin: 10, interval: o.interval != null ? o.interval : 0, hideOverlap: o.hideOverlap !== false,
        lineHeight: 15, fontFamily: t.font, formatter: lw ? function (v) { return wrapLabel(v, lw); } : undefined },
      splitLine: { show: false }
    };
  }
  function slotWidth(ctx, n, reserve) { return ctx && ctx.width ? Math.max(36, Math.floor((ctx.width - (reserve || 70)) / Math.max(1, n)) - 8) : 80; }
  function valAxis(t, s, o) {
    o = o || {};
    var ax = {
      type: 'value', min: o.min, max: o.max, scale: !!o.scale,
      axisLine: { show: false, onZero: false }, axisTick: { show: false },
      splitLine: { show: o.split !== false, lineStyle: { color: t.line, width: 1, type: 'solid' } },
      axisLabel: { color: t.muted, fontSize: 11, fontFamily: t.font, formatter: o.formatter || axisFormatter(s, o.unit) },
      name: o.name || '', nameTextStyle: { color: t.muted, fontSize: 11, align: o.nameAlign || 'left' }, nameGap: 10
    };
    if (o.interval) ax.interval = o.interval;
    return ax;
  }
  // 연도처럼 천 단위 쉼표가 어색한 값: "grouping": false 또는 unit '년'
  function noGroup(s) { return (s && (s.grouping === false || s.unit === '년')) ? false : undefined; }
  function axisFormatter(s, unit) {
    var maxAbs = 0;
    (s.series || []).forEach(function (sr) { sr.data.forEach(function (v) { if (v != null) maxAbs = Math.max(maxAbs, Math.abs(v)); }); });
    var compact = s.compact != null ? !!s.compact : maxAbs >= 100000;
    var pct = (unit != null ? unit : s.unit) === '%';
    var grp = noGroup(s);
    return function (v) { return fmt(v, { compact: compact, decimals: Number.isInteger(v) ? 0 : (Math.abs(v) < 1 ? 2 : 1), trim: true, grouping: grp }) + (pct ? '%' : ''); };
  }
  function valueFmt(s, d, unit) {
    var u = unit != null ? unit : s.unit;
    return function (v) { return fmt(v, { decimals: d, unit: u, compact: s.compact === true, negative: s.negative, grouping: noGroup(s) }); };
  }
  function labelFmt(s, d) {
    return function (p) {
      var v = isObj(p.value) ? p.value.value : (isArr(p.value) ? p.value[p.value.length - 1] : p.value);
      if (v == null) return '';
      return fmt(v, { decimals: d, compact: s.compact === true, negative: s.negative, unit: s.labelUnit != null ? s.labelUnit : (s.unit === '%' ? '%' : '') });
    };
  }
  function toSet(x) {
    if (x == null || x === false) return null;
    var a = isArr(x) ? x : [x];
    var set = {};
    a.forEach(function (k) { set[String(k)] = 1; if (typeof k === 'number') set['#' + k] = 1; });
    return set;
  }
  /* highlight: "3월"(이름) 또는 2(0부터 시작하는 순번) */
  function inSet(set, name, idx) { return !!set && (set[String(name)] === 1 || (typeof idx === 'number' && idx >= 0 && set['#' + idx] === 1)); }

  /* 계열 색 / IBCS 역할 */
  var ROLE_ALIAS = { '실적': 'actual', 'ac': 'actual', '계획': 'plan', 'pl': 'plan', 'budget': 'plan', '예산': 'plan', '목표': 'plan', 'target': 'plan',
    '전망': 'forecast', 'fc': 'forecast', '예측': 'forecast', 'estimate': 'forecast', '추정': 'forecast', '전년': 'prev', 'py': 'prev', 'previous': 'prev', 'prior': 'prev', 'ly': 'prev' };
  function roleOf(sr) { var r = String(sr.role || '').toLowerCase(); return ROLE_ALIAS[r] || ROLE_ALIAS[sr.role] || r || null; }
  function seriesColor(s, t, sr, i) {
    if (sr.color) return resolveColor(sr.color, t, t.palette[i % 8]);
    if (s.colors && s.colors[i]) return resolveColor(s.colors[i], t, t.palette[i % 8]);
    var role = roleOf(sr);
    if (role === 'prev') return '#B9C1CC';
    if (role === 'plan') return t.ink2;
    return t.palette[i % 8];
  }
  function barRoleStyle(role, color, t, horizontal) {
    if (role === 'plan') return { color: '#FFFFFF', borderColor: t.ink2, borderWidth: 1.5, borderType: 'solid' };
    if (role === 'forecast') return { color: color, opacity: 0.9, decal: { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 3], rotation: -Math.PI / 4, color: 'rgba(255,255,255,0.55)' } };
    return { color: color };
  }
  function radius(horizontal, v) {
    var r = 3;
    if (v != null && v < 0) return horizontal ? [r, 0, 0, r] : [0, 0, r, r];
    return horizontal ? [0, r, r, 0] : [r, r, 0, 0];
  }

  /* 목표선(markLine) */
  function targetLine(s, t, horizontal) {
    var tg = s.target;
    if (tg == null || isArr(tg)) return undefined;
    var val = isObj(tg) ? num(tg.value) : num(tg);
    var label = isObj(tg) && tg.label ? tg.label : (s.targetLabel || '목표');
    if (val == null) return undefined;
    var d = {}; d[horizontal ? 'xAxis' : 'yAxis'] = val;
    return {
      silent: true, symbol: 'none', animation: false,
      lineStyle: { color: t.ink, type: [5, 4], width: 1.4 },
      label: { show: true, formatter: (function () {
          var vtxt = fmt(val, { decimals: decimalsOf([isObj(tg) ? tg.value : tg]), unit: s.unit === '%' ? '%' : '' });
          // 라벨에 이미 값이 들어 있으면("월 목표 125억원") 값을 다시 붙이지 않음
          return String(label).replace(/,/g, '').indexOf(String(val)) >= 0 ? String(label) : label + ' ' + vtxt;
        })(),
        position: horizontal ? 'end' : 'insideStartTop', color: t.ink, fontSize: 11, fontWeight: 700, fontFamily: t.font,
        backgroundColor: 'rgba(255,255,255,0.85)', padding: [1, 4] },
      data: [d]
    };
  }
  /* 주석(annotations): [{at:"3월", text:"신제품 출시"}] → 세로 점선 + 라벨 */
  function annotationLines(s, t, horizontal) {
    var an = s.annotations || s.annotation || s.events;
    if (!an) return null;
    if (!isArr(an)) an = [an];
    return an.map(function (a) {
      var d = {}; d[horizontal ? 'yAxis' : 'xAxis'] = String(first(a.at, a.x, a.category, a.date));
      d.label = { formatter: String(a.text || a.label || ''), position: 'end', color: t.ink2, fontSize: 11, fontWeight: 700,
        backgroundColor: 'rgba(255,255,255,0.9)', padding: [1, 4], fontFamily: t.font, distance: 4 };
      d.lineStyle = { color: t.muted, type: [3, 3], width: 1 };
      return d;
    });
  }
  function mergeMarkLine(a, extra) {
    if (!extra || !extra.length) return a;
    if (!a) return { silent: true, symbol: 'none', animation: false, data: extra };
    a.data = a.data.concat(extra);
    return a;
  }

  function axisTooltip(s, t, d, opt) {
    opt = opt || {};
    return function (params) {
      if (!isArr(params)) params = [params];
      var head = params[0] ? (params[0].axisValueLabel || params[0].name) : '';
      var seen = {}, rows = [];
      params.forEach(function (p) {
        if (!p.seriesName || p.seriesName.indexOf('__') === 0) return;
        var v = p.value;
        if (isArr(v)) v = v[v.length - 1];
        if (isObj(v)) v = v.value;
        if (v == null || v === '-') return;
        var nm = p.seriesName.replace(/ \(전망\)$/, '');
        if (seen[nm]) return;
        seen[nm] = 1;
        var extra = opt.extra ? opt.extra(p) : '';
        var u = opt.unitOf ? opt.unitOf(p) : s.unit;
        rows.push('<div style="display:flex;justify-content:space-between;gap:16px;align-items:center;line-height:1.7">' +
          '<span>' + p.marker + esc(nm) + '</span><b style="font-variant-numeric:tabular-nums">' + esc(fmt(v, { decimals: d, unit: u, negative: s.negative, grouping: noGroup(s) })) + extra + '</b></div>');
      });
      if (opt.footer) rows.push(opt.footer(params));
      return '<div style="font-weight:700;margin-bottom:2px">' + esc(head) + '</div>' + rows.join('');
    };
  }

  /* ------------------------------------------------------------------ *
   * 4. 차트 빌더 — 각 함수는 (정규화된 스펙 s, 토큰 t, ctx) → ECharts option
   * ------------------------------------------------------------------ */
  var B = {};

  /* ---- 막대: 세로/가로, 묶음/누적/100%누적, 강조, 목표선, 정렬, 부호색 ---- */
  B.bar = function (s, t, ctx) {
    needCats(s);
    var horiz = !!s.horizontal, stack = s.stack, pct = stack === 'percent' || s.percent === true;
    if (pct) stack = true;
    var cats = s.categories.slice(), series = s.series;
    var n = series.length;
    // 정렬
    if (s.sort && s.sort !== 'none') {
      var key = series[0].data;
      var idx = cats.map(function (_, i) { return i; });
      if (stack) key = cats.map(function (_, i) { return series.reduce(function (a, sr) { return a + (sr.data[i] || 0); }, 0); });
      idx.sort(function (a, b) { return s.sort === 'asc' ? key[a] - key[b] : key[b] - key[a]; });
      cats = idx.map(function (i) { return cats[i]; });
      series = series.map(function (sr) { var o = {}; for (var k in sr) o[k] = sr[k]; o.data = idx.map(function (i) { return sr.data[i]; }); return o; });
    }
    var d = autoDecimals(s);
    var totals = cats.map(function (_, i) { return series.reduce(function (a, sr) { return a + (sr.data[i] || 0); }, 0); });
    var hl = toSet(s.highlight);
    var hlSeries = hl && n > 1 && series.some(function (sr) { return hl[sr.name]; });
    // IBCS 역할 모드: 실적=1번색(진한 막대), 전망=1번색+빗금(실적과 같은 자리), 계획=외곽선, 전년=회색
    var roleMode = series.some(function (sr) { return roleOf(sr); });
    var roles = series.map(function (sr) { return roleOf(sr) || (roleMode ? 'actual' : null); });
    var acfc = roleMode && roles.indexOf('actual') >= 0 && roles.indexOf('forecast') >= 0 && !stack;
    var labelsMode = s.labels != null ? String(s.labels) : (stack ? 'auto' : (n === 1 ? (cats.length <= 16 ? 'all' : 'none') : ((n * cats.length <= 18 || (acfc && cats.length <= 12)) ? 'all' : 'none')));
    if (s.labels === true) labelsMode = 'all';
    if (s.labels === false) labelsMode = 'none';
    var maxTotal = Math.max.apply(null, totals.map(Math.abs).concat([1]));
    var lf = labelFmt(s, pct ? 0 : d);
    var tgVal = (s.target != null && !isArr(s.target)) ? num(isObj(s.target) ? s.target.value : s.target) : null;
    var axMax = Math.max.apply(null, [tgVal || 0].concat(series.reduce(function (a, sr) { return a.concat(sr.data.filter(function (x) { return x != null; })); }, [])));
    // 누적 막대 라벨이 들어갈 픽셀 공간 추정
    var plotLen = horiz ? (ctx.width || 760) - 200 : (ctx.height || 300) - 80;
    var nextColor = roleMode ? 1 : 0;

    var es = series.map(function (sr, i) {
      var role = roles[i];
      var color;
      if (sr.color || (s.colors && s.colors[i])) color = seriesColor(s, t, sr, i);
      else if (roleMode) color = role === 'prev' ? '#B9C1CC' : role === 'plan' ? t.ink2 : (role === 'actual' || role === 'forecast') ? t.palette[0] : t.palette[(nextColor++) % 8];
      else color = t.palette[i % 8];
      if (hlSeries && !hl[sr.name]) color = t.gray;
      var data = sr.data.map(function (v, j) {
        var val = pct ? (totals[j] ? (v || 0) / totals[j] * 100 : 0) : v;
        var item = { value: val, raw: v };
        var st = {};
        if (n === 1 && hl && !hlSeries) {
          var isH = inSet(hl, cats[j], j);
          st.color = isH ? resolveColor(s.highlightColor, t, t.palette[0]) : t.gray;
          item.label = { color: isH ? t.ink : t.muted, fontWeight: isH ? 800 : 500 };
        }
        if (s.colorBySign || s.signColors) st.color = (v != null && v < 0) ? (t.market ? t.down : t.bad) : (t.market ? t.up : t.good);
        if (!stack) st.borderRadius = radius(horiz, v);
        item.itemStyle = st;
        // 목표선과 값 라벨이 겹치는 막대는 라벨을 막대 안쪽 위로
        if (tgVal != null && !stack && v != null && axMax > 0 && Math.abs(v - tgVal) / axMax < 0.07) {
          var fillC = st.color || color;
          item.label = Object.assign(item.label || {}, { position: horiz ? 'insideRight' : 'insideTop', color: textOn(fillC) });
        }
        return item;
      });
      var showLabel = labelsMode === 'all' || (labelsMode === 'auto' && stack) || (labelsMode === 'max' && n === 1) || (labelsMode === 'last');
      var segMax = Math.max.apply(null, sr.data.filter(function (x) { return x != null; }).concat([-Infinity]));
      var label = {
        show: showLabel, position: stack ? 'inside' : (horiz ? 'right' : 'top'), distance: 4,
        color: stack ? textOn(color) : t.ink2, fontSize: 11, fontWeight: 600, fontFamily: t.font,
        formatter: function (p) {
          var v = p.data && p.data.value;
          if (v == null) return '';
          if (labelsMode === 'max' && v !== segMax) return '';
          if (labelsMode === 'last' && p.dataIndex !== cats.length - 1) return '';
          if (stack) {
            var txt = pct ? fmt(v, { decimals: s.decimals != null ? s.decimals : 0 }) + '%' : lf(p);
            var segPx = (pct ? v / 100 : Math.abs(v) / maxTotal) * plotLen;
            if (horiz ? segPx < textW(txt, 11) + 8 : segPx < 16) return '';
            return txt;
          }
          return lf(p);
        }
      };
      var o = {
        type: 'bar', name: sr.name, data: data, stack: stack ? 'total' : (acfc && (role === 'actual' || role === 'forecast') ? 'acfc' : undefined),
        barMaxWidth: horiz ? (stack ? 26 : 22) : (n > 1 && !stack ? 24 : 36), barGap: '18%', barCategoryGap: n > 1 && !stack ? '32%' : '42%',
        itemStyle: barRoleStyle(role, color, t, horiz), label: label, emphasis: { focus: n > 1 ? 'series' : 'none' },
        labelLayout: { hideOverlap: true }, z: 2
      };
      if (stack) { o.itemStyle.borderColor = '#FFFFFF'; o.itemStyle.borderWidth = role === 'plan' ? 1.5 : 1; }
      if (i === 0) o.markLine = mergeMarkLine(targetLine(s, t, horiz), annotationLines(s, t, horiz));
      return o;
    });
    // 누적 합계 라벨
    if (stack && !pct && s.totals !== false && labelsMode !== 'none') {
      es.push({
        type: 'bar', name: '__total', stack: 'total', silent: true, data: totals.map(function () { return 0; }),
        itemStyle: { color: 'transparent' }, barMaxWidth: horiz ? 26 : 36, tooltip: { show: false },
        label: { show: true, position: horiz ? 'right' : 'top', color: t.ink, fontWeight: 700, fontSize: 11, fontFamily: t.font,
          formatter: function (p) { return fmt(totals[p.dataIndex], { decimals: d, compact: s.compact === true }); } }
      });
    }
    // 항목별 목표 마커
    if (isArr(s.targets) || isArr(s.target)) {
      var tv = (s.targets || s.target).map(num);
      es.push({ type: 'scatter', name: s.targetLabel || '목표', data: tv, symbol: 'rect', symbolSize: horiz ? [3, 24] : [30, 3],
        itemStyle: { color: t.ink }, z: 5, label: { show: false } });
    }
    var names = series.map(function (sr) { return sr.name; });
    if (isArr(s.targets) || isArr(s.target)) names.push(s.targetLabel || '목표');
    var legend = legendCfg(t, names, s);
    var hasAnn = !!(s.annotations || s.annotation || s.events);
    var top = (legend.show ? 36 : 14) + (hasAnn ? 18 : 0);
    var cAx = catAxis(t, cats, { inverse: horiz, labelWidth: horiz ? 130 : slotWidth(ctx, cats.length, 60) });
    var vAx = valAxis(t, s, { min: s.yMin != null ? s.yMin : (pct ? 0 : undefined), max: s.yMax != null ? s.yMax : (pct ? 100 : undefined), unit: pct ? '%' : s.unit });
    if (horiz && !stack && labelsMode === 'all' && s.axis !== true) { vAx.axisLabel.show = false; vAx.splitLine.show = false; }
    var tip = tooltipBase(t, 'axis');
    tip.formatter = axisTooltip(s, t, pct ? 1 : d, pct ? {
      unitOf: function () { return '%'; },
      extra: function (p) { var r = p.data && p.data.raw; return r != null ? ' <span style="color:#7A8597;font-weight:500">(' + esc(fmt(r, { decimals: d, unit: s.unit })) + ')</span>' : ''; }
    } : (stack ? { footer: function (ps) { var i = ps[0] && ps[0].dataIndex; return '<div style="border-top:1px solid #E2E7EE;margin-top:4px;padding-top:4px;display:flex;justify-content:space-between"><span>합계</span><b>' + esc(fmt(totals[i], { decimals: d, unit: s.unit })) + '</b></div>'; } } : {}));
    return base(t, {
      legend: legend, tooltip: tip,
      grid: grid(top, { right: horiz ? 60 : 18 }),
      xAxis: horiz ? vAx : cAx, yAxis: horiz ? cAx : vAx, series: es
    });
  };

  /* ---- 꺾은선 / 영역 ---- */
  B.line = function (s, t, ctx) {
    needCats(s);
    var cats = s.categories, n = s.series.length, d = autoDecimals(s);
    var hl = toSet(s.highlight);
    var area = !!s.area, stack = !!s.stack;
    var autoArea = !area && !stack && n === 1 && s.area !== false && richOn();
    var fIdx = s.forecastFrom != null ? (typeof s.forecastFrom === 'number' ? s.forecastFrom : cats.indexOf(String(s.forecastFrom))) : -1;
    var endLabels = s.endLabels != null ? !!s.endLabels : (n <= 4 && !stack);
    var showAll = s.markers === 'all' || (s.markers == null && cats.length <= 12 && n <= 3);
    var es = [];
    var allVals = [];
    s.series.forEach(function (sr, i) {
      var color = seriesColor(s, t, sr, i);
      var dim = hl && !hl[sr.name] && !hl[String(i)];
      if (dim) color = t.gray;
      sr.data.forEach(function (v) { if (v != null) allVals.push(v); });
      var mk = function (dataArr, nameSuffix, dashed) {
        return {
          type: 'line', name: sr.name + (nameSuffix || ''), data: dataArr, smooth: s.smooth ? 0.3 : false, connectNulls: s.connectNulls !== false,
          symbol: 'circle', symbolSize: dim ? 5 : 7, showSymbol: showAll && !dim,
          lineStyle: { width: dim ? 1.6 : (hl ? 3 : 2.4), color: color, type: dashed ? [6, 4] : 'solid', cap: 'round', join: 'round' },
          itemStyle: { color: color, borderColor: '#FFFFFF', borderWidth: 1.5 },
          areaStyle: (area || autoArea) ? { opacity: stack ? 0.78 : 0.12, color: color } : undefined,
          stack: stack ? 'total' : undefined, z: dim ? 1 : 3,
          emphasis: { focus: n > 1 ? 'series' : 'none' },
          label: { show: s.labels === 'all' || s.labels === true, position: 'top', fontSize: 11, color: t.ink2, fontWeight: 600, formatter: labelFmt(s, d) },
          labelLayout: { hideOverlap: true }
        };
      };
      var lastIdx = -1;
      sr.data.forEach(function (v, j) { if (v != null) lastIdx = j; });
      var mainData = sr.data.map(function (v, j) { return fIdx >= 0 && j > fIdx ? null : v; });
      var main = mk(mainData);
      if (endLabels || (hl && !dim)) {
        // 마지막 실측 지점 강조 + 라벨
        var li = fIdx >= 0 && lastIdx > fIdx ? lastIdx : lastIdx;
        var target = fIdx >= 0 && lastIdx > fIdx ? null : main;
        if (target) {
          target.data = mainData.map(function (v, j) {
            if (j !== li) return v;
            return { value: v, symbol: 'circle', symbolSize: dim ? 6 : 9, label: { show: true, position: 'right', distance: 6, color: dim ? t.muted : t.ink, fontWeight: dim ? 500 : 700, fontSize: 12,
              formatter: (n > 1 ? sr.name + '  ' : '') + fmt(v, { decimals: d, unit: s.unit === '%' ? '%' : '', compact: s.compact === true, grouping: noGroup(s) }) } };
          });
          target.showSymbol = true;
          if (!showAll) target.data = target.data.map(function (x, j) { return j === li ? x : { value: x, symbol: 'none' }; });
        }
      }
      if (i === 0) main.markLine = mergeMarkLine(targetLine(s, t, false), annotationLines(s, t, false));
      if (i === 0 && fIdx >= 0 && fIdx < cats.length - 1) {
        main.markArea = { silent: true, itemStyle: { color: 'rgba(120,133,151,0.07)' },
          label: { show: true, position: 'insideTop', color: t.muted, fontSize: 11, fontWeight: 700, formatter: s.forecastLabel || '전망' },
          data: [[{ xAxis: cats[fIdx] }, { xAxis: cats[cats.length - 1] }]] };
      }
      es.push(main);
      if (fIdx >= 0) {
        var fData = sr.data.map(function (v, j) { return j < fIdx ? null : v; });
        var fs = mk(fData, ' (전망)', true);
        fs.showSymbol = false;
        if (endLabels) {
          fs.data = fData.map(function (v, j) {
            if (j !== lastIdx) return v;
            return { value: v, symbol: 'circle', symbolSize: 8, itemStyle: { color: '#FFFFFF', borderColor: color, borderWidth: 2 },
              label: { show: true, position: 'right', distance: 6, color: dim ? t.muted : t.ink2, fontWeight: dim ? 500 : 700, fontSize: 12,
                formatter: (n > 1 ? sr.name + '  ' : '') + fmt(v, { decimals: d, unit: s.unit === '%' ? '%' : '' }) } };
          });
          fs.showSymbol = true;
          fs.data = fs.data.map(function (x, j) { return j === lastIdx || isObj(x) ? x : { value: x, symbol: 'none' }; });
        }
        es.push(fs);
      }
    });
    var minV = Math.min.apply(null, allVals.concat([0])), maxV = Math.max.apply(null, allVals.concat([0]));
    var dataMin = Math.min.apply(null, allVals);
    var scale = s.zero === false || (s.zero == null && !area && !stack && dataMin > 0 && dataMin > maxV * 0.55);
    var names = s.series.map(function (sr) { return sr.name; });
    var legend = legendCfg(t, names, s);
    var longest = 0;
    if (endLabels) s.series.forEach(function (sr) { longest = Math.max(longest, (n > 1 ? sr.name.length * 12 + 12 : 0) + 8 * String(fmt(Math.max.apply(null, sr.data.filter(function (x) { return x != null; })), { decimals: d })).length + 16); });
    var tip = tooltipBase(t, 'axis');
    tip.axisPointer = { type: 'line', lineStyle: { color: t.lineStrong, width: 1 } };
    tip.formatter = axisTooltip(s, t, d);
    var hasAnn = !!(s.annotations || s.annotation || s.events);
    var yAx = valAxis(t, s, { scale: scale, min: s.yMin, max: s.yMax });
    if (s.log) { // 지수 추세: 로그 축 (값은 모두 0보다 커야 함)
      yAx.type = 'log'; yAx.logBase = s.logBase || 10; yAx.scale = true;
      delete yAx.interval; delete yAx.splitNumber;
      if (s.yMin == null) delete yAx.min; if (s.yMax == null) delete yAx.max;
      es.forEach(function (e) { e.areaStyle = undefined; });
    }
    return base(t, {
      legend: legend, tooltip: tip,
      grid: grid((legend.show ? 36 : 18) + (hasAnn ? 18 : 0), { right: endLabels ? Math.min(Math.max(longest, 40), 170) : 22 }),
      xAxis: catAxis(t, cats, { boundaryGap: false, labelWidth: cats.length > 14 ? undefined : slotWidth(ctx, Math.max(1, cats.length - 1), 110), interval: cats.length > 14 ? 'auto' : 0 }),
      yAxis: yAx,
      series: es
    });
  };

  /* ---- 막대+선 (보조축은 비율(%)일 때만 권장) ---- */
  B.combo = function (s, t, ctx) {
    needCats(s);
    var cats = s.categories, d = autoDecimals(s);
    var right = s.series.some(function (sr) { return sr.axis === 'right' || sr.yAxis === 1 || sr.yAxisIndex === 1; });
    var units = [s.unit, s.unit2 != null ? s.unit2 : (right ? '%' : s.unit)];
    var nBars = s.series.filter(function (sr, i) { return (sr.as || (i === 0 ? 'bar' : 'line')) === 'bar'; }).length;
    var hlC = toSet(s.highlight);
    // 보조축 사용 시: 막대는 아래 60%, 선은 위쪽 영역에 배치해 겹침 방지 (보조축 눈금은 숨기고 선에 값 라벨 표시)
    var barVals = [], lineVals = [];
    s.series.forEach(function (sr, i) {
      var isR = sr.axis === 'right' || sr.yAxis === 1 || sr.yAxisIndex === 1;
      sr.data.forEach(function (v) { if (v != null) (isR ? lineVals : barVals).push(v); });
    });
    var es = s.series.map(function (sr, i) {
      var isLine = (sr.as || (i === 0 ? 'bar' : 'line')) === 'line';
      var ax = (sr.axis === 'right' || sr.yAxis === 1 || sr.yAxisIndex === 1) ? 1 : 0;
      var color = seriesColor(s, t, sr, i);
      var dd = decimalsOf(sr.raw);
      var o = {
        type: isLine ? 'line' : 'bar', name: sr.name, yAxisIndex: ax, data: sr.data.map(function (v, j) {
          if (isLine) return { value: v };
          var st = { borderRadius: radius(false, v) };
          if (hlC && nBars === 1) st.color = inSet(hlC, cats[j], j) ? color : t.gray;
          return { value: v, itemStyle: st };
        }),
        itemStyle: isLine ? { color: color, borderColor: '#FFFFFF', borderWidth: 1.5 } : barRoleStyle(roleOf(sr), color, t),
        barMaxWidth: nBars > 1 ? 22 : 34, barGap: '18%', z: isLine ? 4 : 2,
        lineStyle: isLine ? { width: 2.4, color: color } : undefined, symbol: 'circle', symbolSize: 7,
        label: { show: s.labels !== false && s.labels !== 'none' && (isLine || nBars === 1) && cats.length <= 14, position: 'top', fontSize: 11, fontWeight: isLine ? 700 : 600,
          color: isLine ? t.ink : t.ink2, formatter: function (p) { var v = p.data && p.data.value; return v == null ? '' : fmt(v, { decimals: dd }) + (units[ax] === '%' ? '%' : ''); } },
        labelLayout: { hideOverlap: true }, emphasis: { focus: 'series' }
      };
      if (i === 0) o.markLine = mergeMarkLine(targetLine(s, t, false), annotationLines(s, t, false));
      return o;
    });
    var tip = tooltipBase(t, 'axis');
    tip.formatter = axisTooltip(s, t, d, { unitOf: function (p) { return units[es[p.seriesIndex] ? es[p.seriesIndex].yAxisIndex : 0]; } });
    var yl = valAxis(t, s, { unit: units[0] });
    var yAxes = [yl];
    if (right) {
      var bMax = Math.max.apply(null, barVals.concat([0]));
      if (bMax > 0 && s.yMax == null) yl.max = niceCeil(bMax * 1.6);
      var lMin = Math.min.apply(null, lineVals), lMax = Math.max.apply(null, lineVals), lr = (lMax - lMin) || Math.abs(lMax) * 0.2 || 1;
      yAxes.push({ type: 'value', show: false, min: lMin - lr * 3.2, max: lMax + lr * 0.4, splitLine: { show: false },
        axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, name: '' });
    }
    var legend = legendCfg(t, s.series.map(function (sr) { return sr.name + (sr.axis === 'right' || sr.yAxisIndex === 1 ? (units[1] ? ' (' + units[1] + ')' : '') : ''); }), s);
    legend.show = s.series.length > 1;
    es.forEach(function (o, i) { var sr = s.series[i]; if (sr.axis === 'right' || sr.yAxisIndex === 1) o.name = sr.name + (units[1] ? ' (' + units[1] + ')' : ''); });
    return base(t, {
      legend: legend, tooltip: tip, grid: grid(legend.show ? 40 : 20),
      xAxis: catAxis(t, cats, { labelWidth: slotWidth(ctx, cats.length, 70) }),
      yAxis: yAxes, series: es
    });
  };

  /* ---- 파이 / 도넛 (6조각 초과 → '기타'로 합침) ---- */
  B.pie = function (s, t, ctx) {
    ctx = ctx || {};
    var items = itemsOf(s);
    if (!items.length) throw new Error('pie: "data": [{"name":"A","value":10}, ...] 형식이 필요합니다.');
    items = items.filter(function (x) { return x.value != null; });
    if (items.some(function (x) { return x.value < 0; })) throw new Error('pie: 음수 값은 파이 차트로 표현할 수 없습니다. 막대(bar)를 사용하세요.');
    if (s.sort !== false) items.sort(function (a, b) { return b.value - a.value; });
    var max = s.maxSlices || 6;
    if (items.length > max) {
      var rest = items.slice(max - 1);
      items = items.slice(0, max - 1).concat([{ name: s.otherLabel || '기타', value: rest.reduce(function (a, x) { return a + x.value; }, 0), _other: true }]);
      s._warnings.push('조각이 ' + max + '개를 넘어 나머지를 "기타"로 합침');
    }
    var total = items.reduce(function (a, x) { return a + x.value; }, 0);
    var d = s.decimals != null ? s.decimals : decimalsOf(items.map(function (x) { return x.value; }));
    var hl = toSet(s.highlight);
    var grays = ['#9AA4B2', '#B3BBC6', '#C9CFD8', '#DCE0E6', '#E8EBEF'];
    var gi = 0;
    var data = items.map(function (x, i) {
      var c = x._other ? '#B9C1CC' : t.palette[i % 8];
      if (hl) c = inSet(hl, x.name, i) ? resolveColor(s.highlightColor, t, t.palette[0]) : grays[Math.min(gi++, grays.length - 1)];
      if (x.color) c = resolveColor(x.color, t, c);
      return { name: x.name, value: x.value, itemStyle: { color: c } };
    });
    var donut = s.donut !== false && s.donut !== 'false';
    var pd = s.pctDecimals != null ? s.pctDecimals : 1;
    var pctOf = function (v) { return (total ? v / total * 100 : 0).toFixed(pd); };
    var isShare = s.unit === '%'; // 값 자체가 비중(%)이면 값과 비중을 중복 표시하지 않음
    // 좁은 칸(2단 그리드 등): 바깥 라벨 대신 오른쪽 범례에 이름·값·비중 표시
    var narrow = s.legendMode === true || (s.legendMode !== false && (ctx.width || 760) < 560);
    var W = ctx.width || 760, H = ctx.height || 300;
    var nameW = Math.min(96, Math.max.apply(null, data.map(function (x) { return textW(x.name); })) + 8);
    var legW = 14 + nameW + 50 + 50;
    var outerR = Math.max(60, Math.min((W - legW - 24) / 2, H * 0.4));
    var cx = narrow ? (outerR + 6) : '50%';
    var o = base(t, {
      tooltip: { trigger: 'item', confine: true, backgroundColor: '#fff', borderColor: t.line, textStyle: { color: t.ink, fontSize: 12, fontFamily: t.font },
        extraCssText: 'box-shadow:0 6px 20px rgba(16,24,40,.12);border-radius:8px;',
        formatter: function (p) { return p.marker + esc(p.name) + '<br><b>' + esc(fmt(p.value, { decimals: d, unit: s.unit })) + '</b> (' + p.percent.toFixed(1) + '%)'; } },
      legend: narrow ? {
        show: true, orient: 'vertical', right: 0, top: 'middle', icon: 'circle', itemWidth: 9, itemHeight: 9, itemGap: 11,
        data: data.map(function (x) { return x.name; }),
        formatter: function (name) { var x = data.filter(function (y) { return y.name === name; })[0]; return '{n|' + name + '}{v|' + (isShare ? pctOf(x.value) + '%' : fmt(x.value, { decimals: d })) + '}{p|' + (isShare ? '' : pctOf(x.value) + '%') + '}'; },
        textStyle: { fontFamily: t.font, rich: { n: { width: nameW, fontSize: 12, color: t.ink2 }, v: { width: 50, align: 'right', fontSize: 12, color: t.ink, fontWeight: 700 }, p: { width: 50, align: 'right', fontSize: 12, color: t.muted } } }
      } : { show: false },
      series: [{
        type: 'pie', radius: narrow ? (donut ? [outerR * 0.64, outerR] : [0, outerR]) : (donut ? ['50%', '74%'] : [0, '74%']), center: [cx, '52%'], startAngle: 90, avoidLabelOverlap: true,
        itemStyle: { borderColor: '#FFFFFF', borderWidth: 2, borderRadius: donut ? 3 : 0 },
        label: { show: !narrow, color: t.ink2, fontFamily: t.font, lineHeight: 16,
          formatter: function (p) { return '{n|' + p.name + '}\n{v|' + (isShare ? pctOf(p.value) + '%' : fmt(p.value, { decimals: d, unit: s.labelUnit != null ? s.labelUnit : '' }) + '  ' + pctOf(p.value) + '%') + '}'; },
          rich: { n: { fontSize: 12, color: t.ink2, fontWeight: 500 }, v: { fontSize: 12, color: t.ink, fontWeight: 700 } } },
        labelLine: { show: !narrow, length: 10, length2: 12, lineStyle: { color: t.lineStrong } }, labelLayout: { hideOverlap: true },
        data: data
      }]
    });
    if (donut && s.center !== false) {
      o.title = { text: s.centerLabel || '합계', subtext: s.centerValue || (isShare ? '' : fmt(total, { decimals: d, compact: total >= 100000 }) + (s.unit || '')),
        left: cx, top: '41%', textAlign: 'center', itemGap: 4,
        textStyle: { fontSize: 12, fontWeight: 500, color: t.muted, fontFamily: t.font },
        subtextStyle: { fontSize: narrow ? 17 : 20, fontWeight: 800, color: t.ink, fontFamily: t.font } };
    }
    return o;
  };

  /* ---- 워터폴(증감 브리지): items: [{name, value, total?}] ---- */
  B.waterfall = function (s, t, ctx) {
    var items = itemsOf(s, ['items', 'data', 'steps']);
    if (!items.length) throw new Error('waterfall: "items": [{"name":"전년","value":100,"total":true},{"name":"증가요인","value":20},...] 형식이 필요합니다.');
    var totalsIdx = toSet(s.totals);
    var cum = 0, rows = [];
    items.forEach(function (it, i) {
      var isTotal = it.total === true || it.isTotal === true || it.type === 'total' || (totalsIdx && (totalsIdx[String(i)] || totalsIdx[it.name]));
      if (isTotal) {
        var v = it.value != null ? it.value : cum;
        cum = v;
        rows.push({ name: it.name, total: true, start: 0, end: v, delta: v });
      } else {
        var dv = it.value || 0;
        rows.push({ name: it.name, total: false, start: cum, end: cum + dv, delta: dv });
        cum += dv;
      }
    });
    var d = s.decimals != null ? s.decimals : decimalsOf(items.map(function (x) { return x.value; }));
    // good:"down" → 비용·배출량 브리지처럼 감소가 좋은 경우 (증가=빨강, 감소=초록)
    var invert = String(s.good || '').toLowerCase() === 'down';
    var upC = resolveColor(s.upColor, t, t.market ? t.up : (invert ? t.bad : t.good)), downC = resolveColor(s.downColor, t, t.market ? t.down : (invert ? t.good : t.bad)), totC = resolveColor(s.totalColor, t, t.palette[0]);
    var baseD = [], seg1 = [], seg2 = [];
    rows.forEach(function (r) {
      var lo = Math.min(r.start, r.end), hi = Math.max(r.start, r.end);
      var col = r.total ? totC : (r.delta >= 0 ? upC : downC);
      var st = { color: col };
      if (r.total) { baseD.push(0); seg1.push({ value: r.end, itemStyle: st }); seg2.push(null); return; }
      if (lo >= 0) { baseD.push(lo); seg1.push({ value: hi - lo, itemStyle: st }); seg2.push(null); }
      else if (hi <= 0) { baseD.push(hi); seg1.push({ value: lo - hi, itemStyle: st }); seg2.push(null); }
      else { baseD.push(0); seg1.push({ value: hi, itemStyle: st }); seg2.push({ value: lo, itemStyle: st }); }
    });
    var cats = rows.map(function (r) { return r.name; });
    var lab = {
      show: true, position: 'top', fontSize: 11, fontWeight: 700, color: t.ink, fontFamily: t.font,
      formatter: function (p) { var r = rows[p.dataIndex]; return r.total ? fmt(r.end, { decimals: d, compact: s.compact === true }) : fmt(r.delta, { decimals: d, sign: true, compact: s.compact === true, negative: s.negative }); }
    };
    var barW = Math.min(44, ctx.width ? (ctx.width - 70) / cats.length * 0.56 : 40);
    var es = [
      { type: 'bar', name: '__base', stack: 'w', data: baseD, itemStyle: { color: 'transparent' }, silent: true, tooltip: { show: false }, barWidth: barW },
      { type: 'bar', name: s.name || '값', stack: 'w', data: seg1, barWidth: barW, label: lab, itemStyle: { borderRadius: 2 } },
      { type: 'bar', name: '__seg2', stack: 'w', data: seg2, barWidth: barW, silent: true, itemStyle: { borderRadius: 2 } },
      { // 연결선
        type: 'custom', name: '__conn', silent: true, tooltip: { show: false }, z: 1,
        data: rows.slice(0, -1).map(function (r, i) { return [i, r.end]; }),
        renderItem: function (params, api) {
          var i = api.value(0), lv = api.value(1);
          var a = api.coord([i, lv]), b = api.coord([i + 1, lv]);
          return { type: 'line', shape: { x1: a[0] + barW / 2, y1: a[1], x2: b[0] - barW / 2, y2: b[1] }, style: { stroke: t.lineStrong, lineWidth: 1, lineDash: [3, 2] } };
        }
      }
    ];
    // 음수 구간 라벨 위치 보정
    es[1].data = es[1].data.map(function (it, i) { var r = rows[i]; if (!r.total && r.delta < 0) it.label = { position: 'bottom' }; if (r.total && r.end < 0) it.label = { position: 'bottom' }; return it; });
    es[1].markLine = mergeMarkLine(targetLine(s, t, false), null);
    var tip = tooltipBase(t, 'axis');
    tip.formatter = function (ps) {
      var p = isArr(ps) ? ps[0] : ps, r = rows[p.dataIndex];
      return '<b>' + esc(r.name) + '</b><br>' + (r.total ? '합계 ' + esc(fmt(r.end, { decimals: d, unit: s.unit })) :
        '증감 <b>' + esc(fmt(r.delta, { decimals: d, unit: s.unit, sign: true })) + '</b><br><span style="color:#7A8597">누계 ' + esc(fmt(r.end, { decimals: d, unit: s.unit })) + '</span>');
    };
    var sv = { series: [{ data: rows.map(function (r) { return r.end; }) }], unit: s.unit, compact: s.compact };
    return base(t, {
      tooltip: tip, legend: { show: false }, grid: grid(22),
      xAxis: catAxis(t, cats, { labelWidth: ctx.width ? Math.max(44, Math.floor((ctx.width - 70) / cats.length) - 6) : 70 }),
      yAxis: valAxis(t, sv, { min: s.yMin, max: s.yMax }), series: es
    });
  };

  /* ---- 불릿 차트(실적 vs 목표 + 구간) : items: [{name, actual, target, ranges?}] ---- */
  B.bullet = function (s, t) {
    var items = (s.items || s.data || []).map(function (it, i) {
      return { name: String(first(it.name, it.label, 'KPI' + (i + 1))), actual: num(first(it.actual, it.value, it.ac)), target: num(first(it.target, it.plan, it.goal)),
        ranges: (it.ranges || s.ranges || []).map(num), unit: first(it.unit, s.unit, '') };
    });
    if (!items.length) throw new Error('bullet: "items": [{"name":"매출","actual":92,"target":100}] 형식이 필요합니다.');
    var spread = items.map(function (x) { return Math.max(x.target || 0, x.actual || 0); });
    var normalize = s.normalize != null ? !!s.normalize : (Math.max.apply(null, spread) / Math.max(1e-9, Math.min.apply(null, spread)) > 3);
    var rows = items.map(function (x) {
      var k = normalize && x.target ? 100 / x.target : 1;
      var rg = x.ranges.length ? x.ranges.map(function (r) { return r * k; }) : null;
      return { name: x.name, a: x.actual * k, tg: x.target != null ? x.target * k : null, rg: rg, raw: x };
    });
    var maxV = niceCeil(Math.max.apply(null, rows.map(function (r) { return Math.max(r.a || 0, r.tg || 0, r.rg ? Math.max.apply(null, r.rg) : 0); })) * 1.04);
    var bands = ['#DDE2E8', '#E8EBF0', '#F2F4F7'];
    var d = s.decimals != null ? s.decimals : decimalsOf(items.map(function (x) { return x.actual; }));
    var es = [{
      type: 'custom', name: '실적', data: rows.map(function (r, i) { return [i, r.a, r.tg == null ? -1 : r.tg]; }),
      renderItem: function (params, api) {
        var i = api.value(0), r = rows[i];
        var c0 = api.coord([0, i]), bandH = api.size([0, 1])[1];
        var H = Math.min(bandH * 0.62, 26), y = c0[1];
        var kids = [];
        var rg = r.rg || [maxV];
        var prev = 0;
        rg.forEach(function (v, k) {
          var x0 = api.coord([prev, i])[0], x1 = api.coord([v, i])[0];
          kids.push({ type: 'rect', shape: { x: x0, y: y - H / 2, width: Math.max(0, x1 - x0), height: H }, style: { fill: r.rg ? ['#C9D0D9', '#DCE1E7', '#ECEFF3'][Math.min(k, 2)] : bands[2] } });
          prev = v;
        });
        var ax = api.coord([r.a || 0, i])[0];
        var good = r.tg == null || r.a >= r.tg;
        var col = s.color ? resolveColor(s.color, t, t.palette[0]) : t.palette[0];
        kids.push({ type: 'rect', shape: { x: c0[0], y: y - H * 0.19, width: Math.max(0, ax - c0[0]), height: H * 0.38, r: [0, 2, 2, 0] }, style: { fill: col } });
        if (r.tg != null) {
          var tx = api.coord([r.tg, i])[0];
          kids.push({ type: 'rect', shape: { x: tx - 1.25, y: y - H * 0.46, width: 2.5, height: H * 0.92 }, style: { fill: t.ink } });
        }
        var pctTxt = r.raw.target ? '  (' + fmt(r.raw.actual / r.raw.target * 100, { decimals: 0 }) + '%)' : '';
        kids.push({ type: 'text', style: { text: fmt(r.raw.actual, { decimals: d, unit: r.raw.unit }) + pctTxt, x: Math.max(ax, r.tg != null ? api.coord([r.tg, i])[0] : 0) + 8, y: y, verticalAlign: 'middle',
          fill: good ? t.ink : t.bad, font: '700 12px ' + t.font } });
        return { type: 'group', children: kids };
      },
      encode: { x: [1, 2], y: 0 }
    }];
    var tip = tooltipBase(t, 'item');
    tip.formatter = function (p) { var r = rows[p.dataIndex].raw; return '<b>' + esc(r.name) + '</b><br>실적 ' + esc(fmt(r.actual, { decimals: d, unit: r.unit })) + (r.target != null ? '<br>목표 ' + esc(fmt(r.target, { decimals: d, unit: r.unit })) + '<br>달성률 <b>' + fmt(r.actual / r.target * 100, { decimals: 1 }) + '%</b>' : ''); };
    return base(t, {
      tooltip: tip, legend: { show: false }, grid: grid(10, { right: 110 }),
      xAxis: valAxis(t, { series: [] }, { min: 0, max: Math.ceil(maxV), formatter: normalize ? function (v) { return v + '%'; } : undefined, split: true }),
      yAxis: catAxis(t, rows.map(function (r) { return r.name; }), { inverse: true, labelWidth: 120 }),
      series: es
    });
  };

  /* ---- 덤벨(전/후 비교): items: [{name, from, to}] ---- */
  B.dumbbell = function (s, t) {
    var items = (s.items || s.data || []).map(function (it, i) {
      if (isArr(it)) return { name: String(it[0]), from: num(it[1]), to: num(it[2]) };
      return { name: String(first(it.name, it.label, '항목' + (i + 1))), from: num(first(it.from, it.before, it.start, it.prev)), to: num(first(it.to, it.after, it.end, it.curr, it.value)) };
    });
    if (!items.length) throw new Error('dumbbell: "items": [{"name":"A","from":10,"to":15}] 형식이 필요합니다.');
    if (s.sort !== false) items.sort(function (a, b) { return (b.to - b.from) - (a.to - a.from); });
    var d = s.decimals != null ? s.decimals : decimalsOf(items.map(function (x) { return x.to; }).concat(items.map(function (x) { return x.from; })));
    var fromL = s.fromLabel || '이전', toL = s.toLabel || '이후';
    var cats = items.map(function (x) { return x.name; });
    var cTo = s.color ? resolveColor(s.color, t, t.palette[0]) : t.palette[0];
    var hlD = toSet(s.highlight);
    var isDim = function (x, i) { return hlD && !inSet(hlD, x.name, i); };
    var es = [
      { type: 'custom', name: '__conn', silent: true, tooltip: { show: false }, data: items.map(function (x, i) { return [i, x.from, x.to]; }), encode: { x: [1, 2], y: 0 },
        renderItem: function (p, api) {
          var a = api.coord([api.value(1), api.value(0)]), b = api.coord([api.value(2), api.value(0)]);
          var dimC = hlD && !inSet(hlD, items[api.value(0)].name, api.value(0));
          return { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: dimC ? '#E3E7EC' : (hlD ? mix(cTo, '#FFFFFF', 0.45) : t.lineStrong), lineWidth: hlD && !dimC ? 4 : 3, lineCap: 'round' } };
        } },
      { type: 'scatter', name: fromL, symbolSize: 11, itemStyle: { color: '#AAB3C0', borderColor: '#fff', borderWidth: 1.5 }, z: 3,
        data: items.map(function (x, i) { return { value: [x.from, i], itemStyle: isDim(x, i) ? { color: '#D5DAE1' } : undefined, label: { position: x.to >= x.from ? 'left' : 'right', color: isDim(x, i) ? '#B4BCC7' : undefined } }; }),
        label: { show: true, color: t.muted, fontSize: 11, distance: 8, formatter: function (p) { return fmt(p.value[0], { decimals: d }); } } },
      { type: 'scatter', name: toL, symbolSize: 13, itemStyle: { color: cTo, borderColor: '#fff', borderWidth: 1.5 }, z: 4,
        data: items.map(function (x, i) { return { value: [x.to, i], itemStyle: isDim(x, i) ? { color: t.gray } : undefined, label: { position: x.to >= x.from ? 'right' : 'left', color: isDim(x, i) ? t.muted : undefined, fontWeight: isDim(x, i) ? 500 : undefined } }; }),
        label: { show: true, color: t.ink, fontWeight: 700, fontSize: 11, distance: 8, formatter: function (p) { return fmt(p.value[0], { decimals: d }); } } }
    ];
    var tip = tooltipBase(t, 'axis');
    tip.axisPointer = { type: 'none' };
    tip.formatter = function (ps) { var i = (isArr(ps) ? ps[0] : ps).dataIndex, x = items[i]; return '<b>' + esc(x.name) + '</b><br>' + esc(fromL) + ' ' + esc(fmt(x.from, { decimals: d, unit: s.unit })) + '<br>' + esc(toL) + ' <b>' + esc(fmt(x.to, { decimals: d, unit: s.unit })) + '</b><br>변화 ' + esc(fmt(x.to - x.from, { decimals: d, unit: s.unit, sign: true })); };
    var vals = items.map(function (x) { return x.from; }).concat(items.map(function (x) { return x.to; }));
    return base(t, {
      tooltip: tip, legend: legendCfg(t, [fromL, toL], s), grid: grid(36, { right: 40, left: 10 }),
      xAxis: valAxis(t, { series: [{ data: vals }], unit: s.unit }, { scale: s.zero === false || s.zero == null, min: s.xMin, max: s.xMax }),
      yAxis: catAxis(t, cats, { inverse: true, labelWidth: 120, noLine: true }),
      series: es
    });
  };

  /* ---- 슬로프(두 시점 순위·값 변화): items: [{name, from, to}] ---- */
  B.slope = function (s, t) {
    var items = (s.items || s.data || []).map(function (it, i) {
      if (isArr(it)) return { name: String(it[0]), from: num(it[1]), to: num(it[2]) };
      return { name: String(first(it.name, it.label, '항목' + (i + 1))), from: num(first(it.from, it.before, it.start)), to: num(first(it.to, it.after, it.end, it.value)) };
    });
    if (!items.length) throw new Error('slope: "items": [{"name":"A","from":10,"to":15}] 형식이 필요합니다.');
    var d = s.decimals != null ? s.decimals : decimalsOf(items.map(function (x) { return x.to; }).concat(items.map(function (x) { return x.from; })));
    var hl = toSet(s.highlight);
    var cats = [s.fromLabel || '이전', s.toLabel || '이후'];
    var es = items.map(function (x, i) {
      var dim = hl && !inSet(hl, x.name, i);
      var c = dim ? t.gray : (hl ? (x.to >= x.from ? t.palette[0] : t.palette[1]) : t.palette[i % 8]);
      return {
        type: 'line', name: x.name, z: dim ? 1 : 3, symbol: 'circle', symbolSize: 8,
        lineStyle: { width: dim ? 1.5 : 2.6, color: c }, itemStyle: { color: c, borderColor: '#fff', borderWidth: 1.5 },
        data: [
          { value: x.from, label: { show: true, position: 'left', distance: 8, color: dim ? t.muted : t.ink2, fontSize: 11, formatter: x.name + '  ' + fmt(x.from, { decimals: d }) } },
          { value: x.to, label: { show: true, position: 'right', distance: 8, color: dim ? t.muted : t.ink, fontWeight: dim ? 500 : 700, fontSize: 11, formatter: fmt(x.to, { decimals: d }) + '  ' + x.name } }
        ],
        labelLayout: { moveOverlap: 'shiftY' }
      };
    });
    var tip = tooltipBase(t, 'item');
    tip.formatter = function (p) { var x = items[p.seriesIndex]; return '<b>' + esc(x.name) + '</b><br>' + esc(cats[0]) + ' ' + esc(fmt(x.from, { decimals: d, unit: s.unit })) + ' → ' + esc(cats[1]) + ' <b>' + esc(fmt(x.to, { decimals: d, unit: s.unit })) + '</b>'; };
    var longest = Math.max.apply(null, items.map(function (x) { return x.name.length; }));
    var side = Math.min(200, 30 + longest * 12 + 40);
    return base(t, {
      tooltip: tip, legend: { show: false }, grid: { left: side, right: side, top: 30, bottom: 10, containLabel: false },
      xAxis: { type: 'category', data: cats, boundaryGap: false, position: 'top', axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: t.ink, fontWeight: 700, fontSize: 13, fontFamily: t.font }, splitLine: { show: true, lineStyle: { color: t.lineStrong } } },
      yAxis: { type: 'value', show: false, scale: s.zero !== true },
      series: es
    });
  };

  /* ---- 파레토(내림차순 막대 + 누적% 선) ---- */
  B.pareto = function (s, t, ctx) {
    var items;
    if (s.categories && s.series) items = s.categories.map(function (c, i) { return { name: c, value: s.series[0].data[i] }; });
    else items = normItems(first(s.items, s.data));
    if (!items.length) throw new Error('pareto: "items": [{"name":"원인A","value":40}, ...] 형식이 필요합니다.');
    items.sort(function (a, b) { return b.value - a.value; });
    var total = items.reduce(function (a, x) { return a + (x.value || 0); }, 0), acc = 0;
    var cum = items.map(function (x) { acc += x.value || 0; return +(acc / total * 100).toFixed(1); });
    var d = s.decimals != null ? s.decimals : decimalsOf(items.map(function (x) { return x.value; }));
    var thr = s.threshold || 80;
    var cut = cum.findIndex(function (c) { return c >= thr; });
    var cats = items.map(function (x) { return x.name; });
    var tip = tooltipBase(t, 'axis');
    tip.formatter = function (ps) { var i = ps[0].dataIndex; return '<b>' + esc(cats[i]) + '</b><br>' + esc(fmt(items[i].value, { decimals: d, unit: s.unit })) + '<br>누적 ' + cum[i] + '%'; };
    return base(t, {
      tooltip: tip, legend: legendCfg(t, [s.name || '건수', '누적 비율'], s), grid: grid(38),
      xAxis: catAxis(t, cats, { labelWidth: ctx.width ? Math.max(40, Math.floor((ctx.width - 90) / cats.length) - 8) : undefined }),
      yAxis: [valAxis(t, { series: [{ data: items.map(function (x) { return x.value; }) }] }, {}), valAxis(t, { series: [] }, { min: 0, max: 100, split: false, formatter: function (v) { return v + '%'; } })],
      series: [
        { type: 'bar', name: s.name || '건수', barMaxWidth: 34, data: items.map(function (x, i) { return { value: x.value, itemStyle: { color: i <= cut ? t.palette[0] : t.gray, borderRadius: [3, 3, 0, 0] } }; }),
          label: { show: cats.length <= 14, position: 'top', fontSize: 11, color: t.ink2, fontWeight: 600, formatter: labelFmt(s, d) } },
        { type: 'line', name: '누적 비율', yAxisIndex: 1, data: cum, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2, color: t.accent }, itemStyle: { color: t.accent, borderColor: '#fff', borderWidth: 1.5 },
          markLine: { silent: true, symbol: 'none', lineStyle: { color: t.muted, type: [4, 4] }, label: { formatter: thr + '%', position: 'insideEndTop', color: t.muted, fontSize: 11 }, data: [{ yAxis: thr }] } }
      ]
    });
  };

  /* ---- 산점도 / 버블 / 4분면 ---- */
  B.scatter = function (s, t) {
    var pts = (s.points || s.data || s.items || []).map(function (p, i) {
      if (isArr(p)) return { name: p.length > 2 && typeof p[0] === 'string' ? p[0] : '', x: num(typeof p[0] === 'string' ? p[1] : p[0]), y: num(typeof p[0] === 'string' ? p[2] : p[1]), size: num(typeof p[0] === 'string' ? p[3] : p[2]) };
      return { name: String(first(p.name, p.label, '')), x: num(p.x), y: num(p.y), size: num(first(p.size, p.z, p.r)), group: p.group != null ? String(p.group) : '' };
    }).filter(function (p) { return p.x != null && p.y != null; });
    if (!pts.length) throw new Error('scatter: "points": [{"name":"A","x":10,"y":20,"size":5}] 형식이 필요합니다.');
    var groups = [];
    pts.forEach(function (p) { if (groups.indexOf(p.group) < 0) groups.push(p.group); });
    if (groups.length > 4) s._warnings.push('산점도 그룹이 ' + groups.length + '개 — 4개 이하 권장(색 구분 한계)');
    var bubble = s.bubble || pts.some(function (p) { return p.size != null; });
    var maxS = Math.max.apply(null, pts.map(function (p) { return p.size || 0; }).concat([1]));
    var showNames = s.labels != null ? s.labels !== false && s.labels !== 'none' : pts.length <= 24;
    var hl = toSet(s.highlight);
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var dx = decimalsOf(xs), dy = decimalsOf(ys);
    var lo = function (a) { return Math.min.apply(null, a); }, hi = function (a) { return Math.max.apply(null, a); };
    var ex = niceExtent(s.zero === true ? Math.min(0, lo(xs)) : lo(xs), hi(xs), bubble ? 0.12 : 0.08);
    var ey = niceExtent(s.zero === true ? Math.min(0, lo(ys)) : lo(ys), hi(ys), bubble ? 0.14 : 0.08);
    if (s.xMin != null) ex.min = s.xMin;
    if (s.xMax != null) ex.max = s.xMax;
    if (s.yMin != null) ey.min = s.yMin;
    if (s.yMax != null) ey.max = s.yMax;
    var es = groups.map(function (g, gi) {
      var c = t.palette[gi % 8];
      return {
        type: 'scatter', name: g || (s.name || '항목'), z: 3,
        data: pts.filter(function (p) { return p.group === g; }).map(function (p) {
          var dim = hl && !inSet(hl, p.name, -1);
          return { name: p.name, value: [p.x, p.y, p.size], itemStyle: dim ? { color: t.gray, opacity: 0.8 } : undefined, label: dim ? { color: t.muted, fontWeight: 500 } : undefined };
        }),
        symbolSize: function (v) { return bubble && v[2] != null ? 8 + Math.sqrt(Math.max(v[2], 0) / maxS) * 38 : 11; },
        itemStyle: { color: c, opacity: bubble ? 0.78 : 0.95, borderColor: '#fff', borderWidth: 1.5 },
        label: { show: showNames, position: 'right', distance: 6, color: t.ink, fontSize: 11, fontWeight: 600, formatter: function (p) { return p.name; } },
        labelLayout: { hideOverlap: true }, emphasis: { focus: 'self', scale: 1.15 }
      };
    });
    // 4분면 기준선
    var q = s.quadrant;
    if (q || s.xLine != null || s.yLine != null) {
      var qx = q && q.x != null ? q.x : s.xLine, qy = q && q.y != null ? q.y : s.yLine;
      var mean = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
      var median = function (a) { var b = a.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
      var pick = function (v, arr) { return v === 'median' ? median(arr) : (v == null || v === 'mean' || v === true || v === 'avg' ? mean(arr) : num(v)); };
      qx = pick(qx, xs); qy = pick(qy, ys);
      es[0].markLine = { silent: true, symbol: 'none', lineStyle: { color: t.muted, type: [4, 4], width: 1 }, label: { show: false }, data: [{ xAxis: qx }, { yAxis: qy }] };
      var ql = q && q.labels;
      var qhl = q && q.highlight != null ? +q.highlight : -1;
      var qPos = ['insideTopLeft', 'insideTopRight', 'insideBottomLeft', 'insideBottomRight'];
      var qBox = [[[ex.min, ey.max], [qx, qy]], [[qx, ey.max], [ex.max, qy]], [[ex.min, qy], [qx, ey.min]], [[qx, qy], [ex.max, ey.min]]];
      if (ql && ql.length === 4) {
        es[0].markArea = { silent: true, animation: false,
          data: qBox.map(function (b, i) {
            return [{ coord: b[0], name: ql[i], itemStyle: { color: i === qhl ? t.brandSoft : 'transparent' },
              label: { show: true, position: qPos[i], color: i === qhl ? t.brand : t.muted, fontSize: 12, fontWeight: 800, fontFamily: t.font, distance: 6 } }, { coord: b[1] }];
          }) };
      }
    }
    // 추세선
    if (s.trend) {
      var n = pts.length, mx = xs.reduce(function (a, b) { return a + b; }, 0) / n, my = ys.reduce(function (a, b) { return a + b; }, 0) / n;
      var sxy = 0, sxx = 0, syy = 0;
      pts.forEach(function (p) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) * (p.x - mx); syy += (p.y - my) * (p.y - my); });
      var slope = sxx ? sxy / sxx : 0, icpt = my - slope * mx, r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
      var xa = Math.min.apply(null, xs), xb = Math.max.apply(null, xs);
      es.push({ type: 'line', name: '__trend', silent: true, symbol: 'none', z: 2, tooltip: { show: false },
        lineStyle: { color: t.ink2, type: [6, 4], width: 1.4 }, data: [[xa, slope * xa + icpt], [xb, slope * xb + icpt]],
        endLabel: { show: true, formatter: '추세 R²=' + r2.toFixed(2), color: t.ink2, fontSize: 11 } });
    }
    var tip = tooltipBase(t, 'item');
    tip.formatter = function (p) {
      if (!p.value || !isArr(p.value)) return '';
      return (p.name ? '<b>' + esc(p.name) + '</b><br>' : '') + esc(s.xName || 'X') + ' ' + esc(fmt(p.value[0], { decimals: dx, unit: s.xUnit || '' })) + '<br>' + esc(s.yName || 'Y') + ' ' + esc(fmt(p.value[1], { decimals: dy, unit: s.yUnit || '' })) +
        (p.value[2] != null ? '<br>' + esc(s.sizeName || '크기') + ' ' + esc(fmt(p.value[2], { unit: s.sizeUnit || '' })) : '');
    };
    var xAx = valAxis(t, { series: [{ data: xs }] }, { min: ex.min, max: ex.max, interval: ex.step, name: (s.xName || '') + (s.xUnit ? ' (' + s.xUnit + ')' : '') });
    xAx.nameLocation = 'middle'; xAx.nameGap = 28; xAx.nameTextStyle = { color: t.ink2, fontSize: 12, fontWeight: 700 };
    var yAx = valAxis(t, { series: [{ data: ys }] }, { min: ey.min, max: ey.max, interval: ey.step, name: (s.yName || '') + (s.yUnit ? ' (' + s.yUnit + ')' : '') });
    yAx.nameLocation = 'end'; yAx.nameGap = 12; yAx.nameTextStyle = { color: t.ink2, fontSize: 12, fontWeight: 700, align: 'left' };
    return base(t, {
      tooltip: tip, legend: legendCfg(t, groups.filter(Boolean), s), grid: grid(groups.filter(Boolean).length > 1 ? 54 : 30, { right: 24, bottom: 26 }),
      xAxis: xAx, yAxis: yAx, series: es
    });
  };

  /* ---- 히트맵: x, y, values(행=y) ---- */
  B.heatmap = function (s, t) {
    var xs = (first(s.x, s.categories, s.columns) || []).map(String), ys = (first(s.y, s.rows) || []).map(String);
    var data = [];
    var mtx = first(s.values, s.matrix);
    if (isArr(mtx) && isArr(mtx[0])) {
      mtx.forEach(function (row, yi) { row.forEach(function (v, xi) { data.push([xi, yi, num(v)]); }); });
    } else if (isArr(s.data)) {
      s.data.forEach(function (r) {
        if (isArr(r)) data.push([typeof r[0] === 'number' ? r[0] : xs.indexOf(String(r[0])), typeof r[1] === 'number' ? r[1] : ys.indexOf(String(r[1])), num(r[2])]);
        else data.push([xs.indexOf(String(r.x)), ys.indexOf(String(r.y)), num(r.value)]);
      });
    }
    if (!xs.length || !ys.length || !data.length) throw new Error('heatmap: "x":[...], "y":[...], "values":[[행1...],[행2...]] 형식이 필요합니다 (values의 행 = y 항목).');
    var vals = data.map(function (d) { return d[2]; }).filter(function (v) { return v != null; });
    var mn = s.min != null ? s.min : Math.min.apply(null, vals), mx = s.max != null ? s.max : Math.max.apply(null, vals);
    var diverging = s.diverging || (mn < 0 && mx > 0);
    if (diverging) { var m = Math.max(Math.abs(mn), Math.abs(mx)); mn = -m; mx = m; }
    var colors = diverging ? divergingRamp(t.divNeg, t.divPos) : ramp(s.color ? resolveColor(s.color, t, t.seq) : t.seq, 5);
    var d = s.decimals != null ? s.decimals : decimalsOf(vals);
    var showLab = s.labels != null ? !!s.labels : xs.length * ys.length <= 120;
    var cellData = data.map(function (c) {
      var v = c[2], tt = v == null ? 0 : (v - mn) / ((mx - mn) || 1);
      var dark = diverging ? Math.abs(tt - 0.5) > 0.32 : tt > 0.62;
      return { value: c, label: { color: dark ? '#FFFFFF' : t.ink } };
    });
    var tip = tooltipBase(t, 'item');
    tip.formatter = function (p) { return esc(ys[p.value[1]]) + ' · ' + esc(xs[p.value[0]]) + '<br><b>' + esc(fmt(p.value[2], { decimals: d, unit: s.unit })) + '</b>'; };
    return base(t, {
      tooltip: tip,
      grid: grid(s.legend === false ? 8 : 40, { right: 8 }),
      xAxis: Object.assign(catAxis(t, xs, { interval: 0 }), { position: 'top', axisLine: { show: false }, splitArea: { show: false } }),
      yAxis: Object.assign(catAxis(t, ys, { inverse: true, labelWidth: 110 }), { axisLine: { show: false } }),
      visualMap: { show: s.legend !== false, min: mn, max: mx, calculable: false, orient: 'horizontal', right: 0, top: 0, itemWidth: 10, itemHeight: 120,
        text: [fmt(mx, { decimals: d }), fmt(mn, { decimals: d })], textStyle: { color: t.muted, fontSize: 11 }, inRange: { color: colors } },
      series: [{ type: 'heatmap', data: cellData, itemStyle: { borderColor: '#FFFFFF', borderWidth: 2, borderRadius: 3 },
        label: { show: showLab, fontSize: 11, fontWeight: 600, fontFamily: t.font, formatter: function (p) { return p.value[2] == null ? '' : fmt(p.value[2], { decimals: d }); } },
        emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } } }]
    });
  };

  /* ---- 달력 히트맵: data: [["2026-01-01", 5], ...] ---- */
  B.calendar = function (s, t, ctx) {
    var data = (s.data || []).map(function (r) { return isArr(r) ? [String(r[0]).replace(/\./g, '-'), num(r[1])] : [String(r.date).replace(/\./g, '-'), num(r.value)]; });
    if (!data.length) throw new Error('calendar: "data": [["2026-01-01", 5], ...] 형식이 필요합니다.');
    var dates = data.map(function (r) { return r[0]; }).sort();
    var range = s.range || [dates[0], dates[dates.length - 1]];
    var vals = data.map(function (r) { return r[1]; }).filter(function (v) { return v != null; });
    var days = (new Date(range[1]) - new Date(range[0])) / 864e5 + 1;
    var weeks = Math.ceil(days / 7) + 1;
    var cell = Math.max(10, Math.min(22, Math.floor(((ctx.width || 760) - 60) / weeks)));
    var d = decimalsOf(vals);
    var tip = tooltipBase(t, 'item');
    tip.formatter = function (p) { return esc(p.value[0]) + '<br><b>' + esc(fmt(p.value[1], { decimals: d, unit: s.unit })) + '</b>'; };
    return base(t, {
      tooltip: tip,
      visualMap: { show: true, min: Math.min.apply(null, vals), max: Math.max.apply(null, vals), orient: 'horizontal', right: 0, top: 0, itemWidth: 10, itemHeight: 110, calculable: false,
        textStyle: { color: t.muted, fontSize: 11 }, inRange: { color: ramp(t.seq, 5) } },
      calendar: { range: range, top: 46, left: 36, right: 10, cellSize: ['auto', cell], splitLine: { show: false }, itemStyle: { borderColor: '#FFFFFF', borderWidth: 2, color: '#F3F5F8' },
        yearLabel: { show: false }, monthLabel: { color: t.ink2, fontSize: 11, formatter: '{M}월' }, dayLabel: { nameMap: ['일', '월', '화', '수', '목', '금', '토'], color: t.muted, fontSize: 10, firstDay: 1 } },
      series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: data }]
    });
  };

  /* ---- 퍼널: stages: [{name, value}] ---- */
  B.funnel = function (s, t) {
    var items = itemsOf(s, ['stages', 'items', 'data']);
    if (!items.length) throw new Error('funnel: "stages": [{"name":"방문","value":10000}, ...] 형식이 필요합니다.');
    var d = s.decimals != null ? s.decimals : decimalsOf(items.map(function (x) { return x.value; }));
    var colors = ramp(s.color ? resolveColor(s.color, t, t.seq) : t.seq, items.length + 1).slice(1).reverse();
    var top = items[0].value || 1;
    var data = items.map(function (x, i) {
      var c = colors[i];
      return { name: x.name, value: x.value, itemStyle: { color: c }, label: { color: textOn(c) },
        _conv: i ? x.value / (items[i - 1].value || 1) * 100 : null, _all: x.value / top * 100 };
    });
    var tip = tooltipBase(t, 'item');
    tip.formatter = function (p) { var x = data[p.dataIndex]; return '<b>' + esc(x.name) + '</b><br>' + esc(fmt(x.value, { decimals: d, unit: s.unit })) + '<br>최초 대비 ' + x._all.toFixed(1) + '%' + (x._conv != null ? '<br>전 단계 대비 ' + x._conv.toFixed(1) + '%' : ''); };
    return base(t, {
      tooltip: tip,
      series: [{
        type: 'funnel', sort: 'none', left: '4%', right: '30%', top: 8, bottom: 8, gap: 3, minSize: '34%', maxSize: '100%',
        itemStyle: { borderColor: '#fff', borderWidth: 0 },
        label: { show: true, position: 'inside', fontSize: 12, fontWeight: 700, fontFamily: t.font, lineHeight: 16,
          formatter: function (p) { return p.name + '\n' + fmt(p.value, { decimals: d, compact: s.compact === true }); } },
        data: data
      }, {
        type: 'funnel', sort: 'none', left: '4%', right: '30%', top: 8, bottom: 8, gap: 3, minSize: '34%', silent: true, z: 0, tooltip: { show: false },
        itemStyle: { color: 'transparent', borderWidth: 0 },
        label: { show: true, position: 'right', color: t.ink2, fontSize: 11, fontWeight: 600, fontFamily: t.font,
          formatter: function (p) { var x = data[p.dataIndex]; return x._conv == null ? '' : '전환 ' + x._conv.toFixed(1) + '%'; } },
        labelLine: { show: false }, data: data.map(function (x) { return { name: x.name, value: x.value }; })
      }]
    });
  };

  /* ---- 게이지(달성률 링): value, max, target / items:[...] 여러 개 ---- */
  B.gauge = function (s, t, ctx) {
    var items = s.items ? s.items : [{ name: s.name || s.label || '', value: s.value, max: s.max, target: s.target, unit: s.unit }];
    var n = items.length;
    var series = items.map(function (it, i) {
      var v = num(it.value), mx = num(first(it.max, s.max, 100)), tg = num(first(it.target, s.targetValue));
      var unit = first(it.unit, s.unit, '%');
      var status = tg != null ? (v >= tg ? t.good : (v >= tg * 0.9 ? t.warn : t.bad)) : t.palette[0];
      if (it.color || s.color) status = resolveColor(it.color || s.color, t, status);
      var cx = ((i + 0.5) / n * 100) + '%';
      return {
        type: 'gauge', center: [cx, '58%'], radius: n > 2 ? '78%' : '86%', startAngle: 210, endAngle: -30, min: 0, max: mx,
        progress: { show: true, width: 14, roundCap: true, itemStyle: { color: status } },
        axisLine: { roundCap: true, lineStyle: { width: 14, color: [[1, t.surface3]] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, anchor: { show: false },
        title: { show: true, offsetCenter: [0, '62%'], color: t.ink2, fontSize: 13, fontWeight: 600, fontFamily: t.font },
        detail: { valueAnimation: false, offsetCenter: [0, '2%'], fontSize: n > 2 ? 22 : 28, fontWeight: 800, color: t.ink, fontFamily: t.font,
          formatter: function (val) { return fmt(val, { decimals: decimalsOf([it.value]) }) + '{u|' + unit + '}' + (tg != null ? '\n{t|목표 ' + fmt(tg, { decimals: decimalsOf([tg]) }) + unit + '}' : ''); },
          rich: { u: { fontSize: 13, color: t.ink2, fontWeight: 600, padding: [0, 0, 0, 2] }, t: { fontSize: 11, color: t.muted, fontWeight: 500, lineHeight: 22 } } },
        data: [{ value: v, name: it.name || it.label || '' }]
      };
    });
    return base(t, { tooltip: { show: false }, series: series });
  };

  /* ---- 레이더: indicators:[{name,max}], series:[{name, data}] ---- */
  B.radar = function (s, t) {
    var ind = (s.indicators || s.axes || s.categories || []).map(function (x) { return isObj(x) ? { name: String(x.name), max: num(first(x.max, s.max)) } : { name: String(x), max: num(s.max) }; });
    if (!ind.length || !s.series) throw new Error('radar: "indicators": [{"name":"품질","max":5}], "series": [{"name":"A사","data":[4,3,...]}] 형식이 필요합니다.');
    if (s.series.length > 3) s._warnings.push('레이더 계열이 3개 초과 — 판독성 저하');
    var allMax = Math.max.apply(null, s.series.reduce(function (a, sr) { return a.concat(sr.data); }, []));
    ind.forEach(function (x) { if (x.max == null) x.max = Math.ceil(allMax * 1.1); });
    var d = autoDecimals(s);
    return base(t, {
      tooltip: tooltipBase(t, 'item'),
      legend: legendCfg(t, s.series.map(function (sr) { return sr.name; }), s),
      radar: { indicator: ind, radius: '66%', center: ['50%', '56%'], splitNumber: 4, shape: 'polygon',
        axisName: { color: t.ink2, fontSize: 12, fontWeight: 600, fontFamily: t.font }, splitLine: { lineStyle: { color: t.line } },
        splitArea: { show: false }, axisLine: { lineStyle: { color: t.line } } },
      series: [{ type: 'radar', symbol: 'circle', symbolSize: 6,
        data: s.series.map(function (sr, i) { var c = seriesColor(s, t, sr, i); return { name: sr.name, value: sr.data, lineStyle: { color: c, width: 2 }, itemStyle: { color: c }, areaStyle: { color: c, opacity: 0.12 },
          label: { show: s.series.length === 1 || s.labels === true, color: t.ink, fontSize: 11, fontWeight: 600, formatter: function (p) { return fmt(p.value, { decimals: d }); } } }; }) }]
    });
  };

  /* ---- 생키(흐름): links: [{source, target, value}] ---- */
  B.sankey = function (s, t) {
    var links = (s.links || s.flows || s.data || []).map(function (l) { return isArr(l) ? { source: String(l[0]), target: String(l[1]), value: num(l[2]) } : { source: String(l.source || l.from), target: String(l.target || l.to), value: num(l.value) }; });
    if (!links.length) throw new Error('sankey: "links": [{"source":"A","target":"B","value":10}] 형식이 필요합니다.');
    var names = [];
    links.forEach(function (l) { [l.source, l.target].forEach(function (nm) { if (names.indexOf(nm) < 0) names.push(nm); }); });
    links.forEach(function (l) { if (l.source === l.target) throw new Error('sankey: source와 target이 같은 링크("' + l.source + '")는 허용되지 않습니다.'); });
    var nodeColor = {};
    (s.nodes || []).forEach(function (nd) { if (nd.color) nodeColor[nd.name] = resolveColor(nd.color, t); });
    var d = s.decimals != null ? s.decimals : decimalsOf(links.map(function (l) { return l.value; }));
    var longest = Math.max.apply(null, names.map(function (n) { return n.length; }));
    return base(t, {
      tooltip: { trigger: 'item', confine: true, backgroundColor: '#fff', borderColor: t.line, textStyle: { color: t.ink, fontSize: 12, fontFamily: t.font },
        formatter: function (p) { return p.dataType === 'edge' ? esc(p.data.source) + ' → ' + esc(p.data.target) + '<br><b>' + esc(fmt(p.data.value, { decimals: d, unit: s.unit })) + '</b>' : '<b>' + esc(p.name) + '</b> ' + esc(fmt(p.value, { decimals: d, unit: s.unit })); } },
      series: [{
        type: 'sankey', left: 4, right: Math.min(160, longest * 13 + 50), top: 10, bottom: 10, nodeAlign: s.align || 'justify', nodeGap: 12, nodeWidth: 14, layoutIterations: 64, draggable: false,
        emphasis: { focus: 'adjacency' },
        data: names.map(function (nm, i) { return { name: nm, itemStyle: { color: nodeColor[nm] || t.palette[i % 8], borderWidth: 0 } }; }),
        links: links,
        lineStyle: { color: 'gradient', opacity: 0.32, curveness: 0.5 },
        label: { color: t.ink, fontSize: 12, fontWeight: 600, fontFamily: t.font, formatter: function (p) { return p.name + '  {v|' + fmt(p.value, { decimals: d, compact: s.compact === true }) + '}'; }, rich: { v: { color: t.muted, fontWeight: 500, fontSize: 11 } } }
      }]
    });
  };

  /* ---- 트리맵 / 선버스트: data: [{name, value, children}] ---- */
  function hier(arr) {
    return (arr || []).map(function (x) {
      if (isArr(x)) return { name: String(x[0]), value: num(x[1]) };
      var o = { name: String(first(x.name, x.label, '')) };
      if (x.children && x.children.length) o.children = hier(x.children);
      else o.value = num(x.value);
      if (x.color) o.color = x.color;
      return o;
    });
  }
  function sumTree(n) { return n.children ? n.children.reduce(function (a, c) { return a + sumTree(c); }, 0) : (n.value || 0); }
  B.treemap = function (s, t) {
    var data = hier(first(s.data, s.items));
    if (!data.length) throw new Error('treemap: "data": [{"name":"A","value":10}, {"name":"B","children":[...]}] 형식이 필요합니다.');
    var total = data.reduce(function (a, n) { return a + sumTree(n); }, 0);
    var d = s.decimals != null ? s.decimals : 0;
    data.forEach(function (n, i) {
      var c = n.color ? resolveColor(n.color, t) : t.palette[i % 8];
      (function paint(node, col) {
        node.itemStyle = { color: col, borderColor: node.children ? col : '#FFFFFF' };
        node.label = { color: textOn(col) };
        node.upperLabel = { color: textOn(col) };
        if (node.children) {
          node.children.sort(function (a, b) { return sumTree(b) - sumTree(a); });
          node.children.forEach(function (ch, j) { paint(ch, mix(col, '#FFFFFF', Math.min(0.5, j * 0.16))); });
        }
      })(n, c);
    });
    var nested = data.some(function (n) { return n.children; });
    return base(t, {
      tooltip: { trigger: 'item', confine: true, backgroundColor: '#fff', borderColor: t.line, textStyle: { color: t.ink, fontSize: 12, fontFamily: t.font },
        formatter: function (p) { return '<b>' + esc(p.treePathInfo.slice(1).map(function (x) { return x.name; }).join(' › ')) + '</b><br>' + esc(fmt(p.value, { decimals: d, unit: s.unit })) + ' (' + (p.value / total * 100).toFixed(1) + '%)'; } },
      series: [{
        type: 'treemap', left: 0, right: 0, top: 0, bottom: 0, roam: false, nodeClick: false, breadcrumb: { show: false }, sort: 'desc', squareRatio: 0.5 * (1 + Math.sqrt(5)),
        label: { show: true, fontFamily: t.font, fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 17, overflow: 'truncate',
          formatter: function (p) { return p.name + '\n{v|' + fmt(p.value, { decimals: d, compact: s.compact === true }) + ' · ' + (p.value / total * 100).toFixed(1) + '%}'; },
          rich: { v: { fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.88)' } } },
        upperLabel: { show: nested, height: 22, color: '#fff', fontWeight: 700, fontSize: 12, fontFamily: t.font },
        itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 },
        levels: nested ? [{ itemStyle: { borderColor: '#fff', borderWidth: 3, gapWidth: 3 } }, { itemStyle: { gapWidth: 1, borderWidth: 1, borderColor: '#fff' } }] : undefined,
        data: data
      }]
    });
  };
  B.sunburst = function (s, t) {
    var data = hier(first(s.data, s.items));
    if (!data.length) throw new Error('sunburst: "data": [{"name":"A","children":[...]}] 형식이 필요합니다.');
    data.forEach(function (n, i) { n.itemStyle = { color: n.color ? resolveColor(n.color, t) : t.palette[i % 8] }; });
    return base(t, {
      tooltip: { trigger: 'item', confine: true, backgroundColor: '#fff', borderColor: t.line, textStyle: { color: t.ink, fontSize: 12, fontFamily: t.font },
        formatter: function (p) { return '<b>' + esc(p.name) + '</b> ' + esc(fmt(p.value, { unit: s.unit })); } },
      series: [{ type: 'sunburst', radius: ['16%', '92%'], center: ['50%', '50%'], sort: null, nodeClick: false,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { rotate: 'tangential', fontSize: 11, fontWeight: 600, color: '#fff', fontFamily: t.font, minAngle: 12 },
        levels: [{}, { r0: '16%', r: '52%' }, { r0: '52%', r: '78%', itemStyle: { opacity: 0.85 } }, { r0: '78%', r: '92%', label: { position: 'outside', color: t.ink2 }, itemStyle: { opacity: 0.7 } }],
        data: data }]
    });
  };

  /* ---- 박스플롯: groups: [{name, values:[원자료...]}] ---- */
  function quantile(a, q) { var p = (a.length - 1) * q, b = Math.floor(p); return a[b + 1] !== undefined ? a[b] + (p - b) * (a[b + 1] - a[b]) : a[b]; }
  B.boxplot = function (s, t) {
    var groups = (s.groups || s.data || []).map(function (g, i) { return { name: String(first(g.name, '그룹' + (i + 1))), values: (g.values || g.data || []).map(num).filter(function (v) { return v != null; }).sort(function (a, b) { return a - b; }) }; });
    if (!groups.length) throw new Error('boxplot: "groups": [{"name":"A","values":[원자료 숫자...]}] 형식이 필요합니다.');
    var box = [], out = [];
    groups.forEach(function (g, i) {
      var q1 = quantile(g.values, 0.25), q2 = quantile(g.values, 0.5), q3 = quantile(g.values, 0.75), iqr = q3 - q1;
      var lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
      var inl = g.values.filter(function (v) { return v >= lo && v <= hi; });
      box.push([inl[0], q1, q2, q3, inl[inl.length - 1]]);
      g.values.forEach(function (v) { if (v < lo || v > hi) out.push([i, v]); });
    });
    var d = s.decimals != null ? s.decimals : 1;
    var tip = tooltipBase(t, 'item');
    tip.formatter = function (p) {
      if (p.seriesType === 'scatter') return '이상치 ' + esc(fmt(p.value[1], { decimals: d, unit: s.unit }));
      var v = p.value.slice(-5);
      return '<b>' + esc(groups[p.dataIndex].name) + '</b><br>최대 ' + fmt(v[4], { decimals: d }) + '<br>Q3 ' + fmt(v[3], { decimals: d }) + '<br>중앙값 <b>' + fmt(v[2], { decimals: d }) + '</b><br>Q1 ' + fmt(v[1], { decimals: d }) + '<br>최소 ' + fmt(v[0], { decimals: d });
    };
    return base(t, {
      tooltip: tip, grid: grid(16),
      xAxis: catAxis(t, groups.map(function (g) { return g.name; })),
      yAxis: valAxis(t, { series: [{ data: groups.reduce(function (a, g) { return a.concat(g.values); }, []) }] }, { scale: true }),
      series: [{ type: 'boxplot', data: box, boxWidth: [12, 40], itemStyle: { color: t.brandSoft, borderColor: t.palette[0], borderWidth: 1.6 } },
        { type: 'scatter', data: out, symbolSize: 7, itemStyle: { color: t.accent } }]
    });
  };

  /* ---- 히스토그램: values: [원자료...], bins ---- */
  B.histogram = function (s, t, ctx) {
    var vals = (s.values || s.data || []).map(num).filter(function (v) { return v != null; });
    if (!vals.length) throw new Error('histogram: "values": [원자료 숫자...] 형식이 필요합니다.');
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var k = s.bins || Math.max(5, Math.min(20, Math.ceil(Math.log2(vals.length) + 1)));
    var w = s.binWidth || (mx - mn) / k || 1;
    var counts = new Array(k).fill(0);
    vals.forEach(function (v) { var i = Math.min(k - 1, Math.floor((v - mn) / w)); counts[i]++; });
    var d = s.decimals != null ? s.decimals : decimalsOf(vals);
    var cats = counts.map(function (_, i) { return fmt(mn + i * w, { decimals: d }) + '~' + fmt(mn + (i + 1) * w, { decimals: d }); });
    var ns = { categories: cats, series: [{ name: s.name || '빈도', data: counts, raw: counts }], unit: s.countUnit || '건', labels: s.labels, _warnings: [] };
    var o = B.bar(ns, t, ctx);
    o.series[0].barCategoryGap = '6%';
    o.series[0].barMaxWidth = 80;
    return o;
  };

  /* ---- 간트/로드맵: tasks: [{name, start, end, group?, progress?, milestone?}] ---- */
  function parseDate(v, end) {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    var s = String(v).trim().replace(/[./]/g, '-');
    var m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
    if (!m) { var dd = Date.parse(s); return isNaN(dd) ? null : dd; }
    var y = +m[1], mo = +m[2] - 1, day = m[3] ? +m[3] : (end ? new Date(y, mo + 1, 0).getDate() : 1);
    return new Date(y, mo, day, end ? 23 : 0, end ? 59 : 0).getTime();
  }
  B.gantt = function (s, t) {
    var tasks = (s.tasks || s.items || s.data || []).map(function (x, i) {
      var st = parseDate(first(x.start, x.from, x.begin)), en = parseDate(first(x.end, x.to, x.finish, x.start), true);
      return { name: String(first(x.name, x.task, x.label, '작업' + (i + 1))), start: st, end: en, group: String(first(x.group, x.phase, x.category, '')),
        progress: num(x.progress), milestone: !!(x.milestone || x.type === 'milestone'), owner: x.owner || '' };
    });
    if (!tasks.length) throw new Error('gantt: "tasks": [{"name":"설계","start":"2026-01-05","end":"2026-02-13","group":"1단계"}] 형식이 필요합니다.');
    tasks.forEach(function (x) { if (x.start == null) throw new Error('gantt: "' + x.name + '"의 start 날짜를 해석할 수 없습니다 (YYYY-MM-DD 형식 사용).'); if (x.milestone) x.end = x.start; });
    var groups = [];
    tasks.forEach(function (x) { if (groups.indexOf(x.group) < 0) groups.push(x.group); });
    var minT = Math.min.apply(null, tasks.map(function (x) { return x.start; })), maxT = Math.max.apply(null, tasks.map(function (x) { return x.end; }));
    var span = maxT - minT, pad = Math.max(span * 0.02, 864e5);
    var today = s.today ? parseDate(s.today) : null;
    var es = groups.map(function (g, gi) {
      var color = t.palette[gi % 8];
      var light = mix('#FFFFFF', color, 0.38);
      return {
        type: 'custom', name: g || '일정', encode: { x: [1, 2], y: 0 },
        data: tasks.map(function (x, i) { return x.group === g ? [i, x.start, x.end, x.progress == null ? -1 : x.progress, x.milestone ? 1 : 0] : null; }).filter(Boolean),
        renderItem: function (params, api) {
          var i = api.value(0), a = api.coord([api.value(1), i]), b = api.coord([api.value(2), i]);
          var H = api.size([0, 1])[1] * 0.56, prog = api.value(3), ms = api.value(4);
          var cs = params.coordSys;
          if (ms) {
            var r = H * 0.5;
            return { type: 'group', children: [
              { type: 'polygon', shape: { points: [[a[0], a[1] - r], [a[0] + r, a[1]], [a[0], a[1] + r], [a[0] - r, a[1]]] }, style: { fill: color } },
              { type: 'text', style: { text: msLabel(tasks[i].start), x: a[0] - r - 5, y: a[1], align: 'right', verticalAlign: 'middle', fill: t.ink, font: '700 11px ' + t.font } }] };
          }
          var rect = echarts.graphic.clipRectByRect({ x: a[0], y: a[1] - H / 2, width: Math.max(b[0] - a[0], 3), height: H }, { x: cs.x, y: cs.y, width: cs.width, height: cs.height });
          if (!rect) return;
          var kids = [{ type: 'rect', shape: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, r: 4 }, style: { fill: prog >= 0 ? light : color } }];
          if (prog >= 0) {
            kids.push({ type: 'rect', shape: { x: rect.x, y: rect.y, width: rect.width * Math.min(prog, 100) / 100, height: rect.height, r: 4 }, style: { fill: color } });
            if (rect.width > 34) kids.push({ type: 'text', style: { text: Math.round(prog) + '%', x: rect.x + rect.width - 6, y: rect.y + rect.height / 2, align: 'right', verticalAlign: 'middle', fill: prog > 85 ? '#fff' : t.ink, font: '700 10px ' + t.font } });
          }
          return { type: 'group', children: kids };
        }
      };
    });
    if (today) {
      es.push({ type: 'line', name: '__today', data: [], markLine: { silent: true, symbol: 'none', animation: false, lineStyle: { color: t.bad, width: 1.5, type: 'solid' },
        label: { formatter: s.todayLabel || '오늘', position: 'end', distance: 4, color: '#FFFFFF', backgroundColor: t.bad, padding: [2, 5], borderRadius: 3, fontWeight: 700, fontSize: 10 }, data: [{ xAxis: today }] } });
    }
    var long = span > 120 * 864e5;
    var multiYear = new Date(minT).getFullYear() !== new Date(maxT).getFullYear();
    function msLabel(ts) { var dt = new Date(ts); return (multiYear ? "'" + String(dt.getFullYear()).slice(2) + '.' : '') + (dt.getMonth() + 1) + '/' + dt.getDate(); }
    var nameW = Math.min(200, Math.max(110, Math.max.apply(null, tasks.map(function (x) { return textW(x.name); })) + 10));
    var tip = tooltipBase(t, 'item');
    tip.formatter = function (p) {
      var x = tasks[p.value[0]];
      return '<b>' + esc(x.name) + '</b>' + (x.group ? ' <span style="color:#7A8597">' + esc(x.group) + '</span>' : '') + '<br>' + fmtDate(x.start) + (x.milestone ? '' : ' ~ ' + fmtDate(x.end) + ' (' + Math.round((x.end - x.start) / 864e5) + '일)') +
        (x.progress != null ? '<br>진척률 <b>' + x.progress + '%</b>' : '') + (x.owner ? '<br>담당 ' + esc(x.owner) : '');
    };
    var gNames = groups.filter(Boolean);
    return base(t, {
      tooltip: tip, legend: legendCfg(t, gNames, s), grid: grid(gNames.length > 1 ? 40 : 26, { right: 24, bottom: today ? 26 : 6 }),
      xAxis: { type: 'time', min: minT - pad, max: maxT + pad, position: 'top', axisLine: { show: false }, axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: t.line } },
        axisLabel: { color: t.muted, fontSize: 11, fontFamily: t.font, hideOverlap: true, formatter: long ? function (v) { var d = new Date(v); return (d.getMonth() === 0 ? d.getFullYear() + '.' : '') + (d.getMonth() + 1) + '월'; } : function (v) { var d = new Date(v); return (d.getMonth() + 1) + '/' + d.getDate(); } } },
      yAxis: catAxis(t, tasks.map(function (x) { return x.name; }), { inverse: true, labelWidth: nameW, hideOverlap: false }),
      series: es
    });
  };
  function fmtDate(ts) { var d = new Date(ts); return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0'); }

  /* ---- raw: 완전한 ECharts option (고급 사용자용) ---- */
  B.raw = function (s, t) {
    var o = s.option;
    if (!isObj(o)) throw new Error('raw: "option": { ...ECharts 옵션... } 이 필요합니다.');
    if (!o.color) o.color = t.palette.slice();
    o.textStyle = Object.assign({ fontFamily: t.font, color: t.ink2 }, o.textStyle || {});
    if (o.animation == null) o.animation = animOn();
    return o;
  };

  /* 기본 높이 */
  function defaultHeight(s) {
    var n = (s.categories || []).length;
    switch (s.type) {
      case 'bar': return s.horizontal ? Math.max(160, n * Math.max(30, (s.series || []).length * 16 + 14) + 60) : 300;
      case 'bullet': return Math.max(140, (s.items || s.data || []).length * 44 + 50);
      case 'dumbbell': return Math.max(160, (s.items || s.data || []).length * 38 + 60);
      case 'slope': return Math.max(260, (s.items || s.data || []).length * 26 + 60);
      case 'gantt':
        var tk = s.tasks || s.items || s.data || [];
        var wraps = tk.some(function (x) { return textW(first(x.name, x.task, x.label, '')) > 200; });
        return Math.max(180, tk.length * (wraps ? 44 : 34) + 64);
      case 'heatmap': return Math.max(200, (first(s.y, s.rows) || []).length * 36 + 70);
      case 'calendar': return 220;
      case 'gauge': return 230;
      case 'pie': return 300;
      case 'sankey': return 360;
      case 'treemap': return 340;
      case 'sunburst': return 380;
      case 'radar': return 340;
      case 'funnel': return Math.max(240, (first(s.stages, s.items, s.data) || []).length * 52);
      default: return 300;
    }
  }

  /* ------------------------------------------------------------------ *
   * 5. 데이터 표(접근성·검증용) 자동 생성
   * ------------------------------------------------------------------ */
  function tableFor(s) {
    var u = s.unit || '';
    var F = function (v, d) { return fmt(v, { decimals: d != null ? d : decimalsOf([v]), negative: s.negative, grouping: noGroup(s) }); };
    try {
      if (s.categories && s.series && ['bar', 'line', 'combo', 'pareto'].indexOf(s.type) >= 0) {
        return { head: ['구분'].concat(s.series.map(function (sr) { return sr.name; })), rows: s.categories.map(function (c, i) { return [c].concat(s.series.map(function (sr) { return F(sr.data[i]); })); }) };
      }
      switch (s.type) {
        case 'pie': case 'funnel': case 'pareto':
          return { head: ['항목', '값' + (u ? '(' + u + ')' : '')], rows: itemsOf(s).map(function (x) { return [x.name, F(x.value)]; }) };
        case 'waterfall':
          return { head: ['항목', '증감/합계' + (u ? '(' + u + ')' : '')], rows: itemsOf(s, ['items', 'data', 'steps']).map(function (x) { return [x.name + (x.total ? ' (합계)' : ''), x.value == null ? '(자동합계)' : F(x.value)]; }) };
        case 'bullet':
          return { head: ['항목', '실적', '목표', '달성률'], rows: (s.items || []).map(function (x) { var a = num(x.actual), g = num(x.target); return [x.name, F(a), F(g), g ? fmt(a / g * 100, { decimals: 1 }) + '%' : '–']; }) };
        case 'dumbbell': case 'slope':
          return { head: ['항목', s.fromLabel || '이전', s.toLabel || '이후', '변화'], rows: (s.items || []).map(function (x) { var a = num(first(x.from, x.before)), b = num(first(x.to, x.after)); return [x.name, F(a), F(b), fmt(b - a, { sign: true, decimals: decimalsOf([a, b]) })]; }) };
        case 'scatter':
          return { head: ['항목', s.xName || 'X', s.yName || 'Y', s.sizeName || '크기'], rows: (s.points || s.data || []).map(function (p) { return isArr(p) ? p.map(String) : [p.name || '', F(p.x), F(p.y), p.size != null ? F(p.size) : '']; }) };
        case 'heatmap':
          var xs = first(s.x, s.categories) || [], m = first(s.values, s.matrix) || [];
          return { head: [''].concat(xs), rows: (first(s.y, s.rows) || []).map(function (y, i) { return [y].concat((m[i] || []).map(function (v) { return F(v); })); }) };
        case 'sankey':
          return { head: ['출발', '도착', '값'], rows: (s.links || []).map(function (l) { return isArr(l) ? [l[0], l[1], F(l[2])] : [l.source, l.target, F(l.value)]; }) };
        case 'gantt':
          return { head: ['작업', '그룹', '시작', '종료', '진척률'], rows: (s.tasks || []).map(function (x) { return [x.name, x.group || '', x.start, x.milestone ? '(마일스톤)' : x.end, x.progress != null ? x.progress + '%' : '']; }) };
        case 'radar':
          return { head: ['지표'].concat(s.series.map(function (sr) { return sr.name; })), rows: (s.indicators || []).map(function (x, i) { return [isObj(x) ? x.name : x].concat(s.series.map(function (sr) { return F(sr.data[i]); })); }) };
        case 'treemap': case 'sunburst':
          var rows = [];
          (function walk(arr, path) { (arr || []).forEach(function (n) { var p = path.concat([n.name]); if (n.children) walk(n.children, p); else rows.push([p.join(' › '), F(n.value)]); }); })(first(s.data, s.items), []);
          return { head: ['항목', '값'], rows: rows };
        case 'gauge':
          var its = s.items || [{ name: s.name || s.label || '', value: s.value, target: s.target }];
          return { head: ['항목', '값', '목표'], rows: its.map(function (x) { return [x.name || x.label || '', F(x.value), x.target != null ? F(x.target) : '']; }) };
        case 'boxplot':
          return { head: ['그룹', 'N'], rows: (s.groups || []).map(function (g) { return [g.name, String((g.values || []).length)]; }) };
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  function tableHTML(tb, cls) {
    if (!tb) return '';
    return '<table class="rk-table rk-compact ' + (cls || '') + '"><thead><tr>' + tb.head.map(function (x, i) { return '<th' + (i ? ' class="num"' : '') + '>' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      tb.rows.map(function (r) { return '<tr>' + r.map(function (x, i) { return '<td' + (i ? ' class="num"' : '') + '>' + esc(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }

  /* ------------------------------------------------------------------ *
   * 6. JSON 읽기(관대한 파서) / 그림 틀
   * ------------------------------------------------------------------ */
  function readSpec(el, kind) {
    var sc = el.querySelector('script[type="application/json"], script[type="text/json"], script[type="application/ld+json"]');
    var txt = sc ? sc.textContent : (el.getAttribute('data-spec') || '');
    txt = txt.trim();
    if (!txt) throw new Error((kind || '차트') + ' 데이터가 비어 있습니다. <script type="application/json">{...}</script> 안에 JSON을 넣으세요.');
    try { return JSON.parse(txt); }
    catch (e1) {
      try {
        // 흔한 실수 허용: 주석, 후행 쉼표, 따옴표 없는 키, 작은따옴표 — JS 객체 리터럴로 해석
        var obj = (new Function('"use strict";return (' + txt + '\n);'))();
        issue('warn', el, 'JSON 문법이 엄격하지 않음(주석/후행 쉼표/작은따옴표 등) — 자동 보정해 렌더링함: ' + e1.message);
        return obj;
      } catch (e2) {
        throw new Error('JSON 문법 오류: ' + e1.message + '\n힌트: 키는 큰따옴표("key"), 마지막 항목 뒤 쉼표 금지, 숫자에 단위/콤마 넣지 말 것.');
      }
    }
  }
  function figureShell(el, s) {
    el.classList.add('rk-figure');
    if (s.frame === false || s.frame === 'none') el.classList.add('rk-plain');
    var title = s.title || el.getAttribute('data-title');
    var sub = s.subtitle || s.subTitle || el.getAttribute('data-subtitle');
    var unit = s.unitLabel || (s.unit && s.showUnit !== false ? '단위: ' + s.unit : '');
    if (!s.unitLabel && (s.stack === 'percent' || s.percent === true)) unit = '구성비, %' + (s.unit && s.unit !== '%' ? ' · 원값 ' + s.unit : '');
    if (s.type === 'scatter' || s.type === 'gauge' || s.type === 'gantt') unit = s.unitLabel || '';
    var head = '';
    if (title || sub || unit) {
      head = '<div class="rk-fig-head">' + (title ? '<div class="rk-fig-title">' + esc(title) + (s.sample ? '<span class="rk-sample-flag">예시 데이터</span>' : '') + '</div>' : '') +
        ((sub || unit) ? '<div class="rk-fig-subrow"><span class="rk-fig-sub">' + esc(sub || '') + '</span>' + (unit ? '<span class="rk-fig-unit">(' + esc(unit) + ')</span>' : '') + '</div>' : '') + '</div>';
    }
    var canvas = h('div', 'rk-chart-canvas');
    var foot = '';
    if (s.insight || s.sowhat) foot += '<div class="rk-fig-insight">' + esc(String(s.insight || s.sowhat).replace(/^\s*(→|->|=>|▶|►|※)\s*/, '')) + '</div>';
    if (s.source || s.note) foot += '<div class="rk-fig-foot"><span class="rk-source">' + esc(s.source || '') + '</span><span class="rk-fig-note">' + esc(s.note || '') + '</span></div>';
    el.insertAdjacentHTML('beforeend', head);
    el.appendChild(canvas);
    if (foot) el.insertAdjacentHTML('beforeend', foot);
    return canvas;
  }
  function showError(el, msg, s) {
    el.classList.add('rk-figure');
    var box = h('div', 'rk-error');
    box.textContent = msg;
    el.appendChild(box);
    if (s) {
      var tb = tableFor(s);
      if (tb) el.insertAdjacentHTML('beforeend', '<div style="margin-top:10px">' + tableHTML(tb) + '</div>');
    }
    issue('error', el, msg);
  }

  /* ------------------------------------------------------------------ *
   * 7. 차트 렌더링
   * ------------------------------------------------------------------ */
  function renderChart(el) {
    if (el.__rkDone) return;
    el.__rkDone = true;
    var spec, s;
    try { spec = readSpec(el, '차트'); }
    catch (e) { showError(el, e.message); return; }
    try { s = normalize(spec, el); }
    catch (e) { showError(el, e.message); return; }
    s._warnings.forEach(function (w) { issue('warn', el, w); });
    if (s.sample) issue('warn', el, '예시(sample) 데이터가 표시된 차트가 있음 — 실제 데이터로 교체 필요');
    var canvas = figureShell(el, s);
    var hgt = +(el.getAttribute('data-height') || s.height || defaultHeight(s));
    canvas.style.height = hgt + 'px';
    if (typeof global.echarts === 'undefined') {
      canvas.style.height = 'auto';
      showError(el, 'ECharts 라이브러리를 불러오지 못했습니다(인터넷 차단 환경일 수 있음). build_report.py --offline 으로 다시 빌드하세요. 아래는 원본 데이터입니다.', s);
      return;
    }
    var t = tokens();
    var ctx = { width: canvas.clientWidth || 760, height: hgt, el: el };
    var option;
    try { option = applyRich(B[s.type](s, t, ctx), s, t); }
    catch (e) { canvas.remove(); showError(el, s.type + ' 차트 생성 실패: ' + e.message, s); return; }
    try {
      var chart = echarts.init(canvas, null, { renderer: el.getAttribute('data-renderer') || 'svg' });
      chart.setOption(option);
      chart.__lastW = canvas.clientWidth;
      syncViewBox(chart);
      chart.__rk = { spec: s, el: el, option: option };
      RK.charts.push(chart);
      el.__rkChart = chart;
      var zoomAttr = el.getAttribute('data-zoom');
      var wantZoom = s.zoom === true || zoomAttr === 'on' || (s.zoom !== false && zoomAttr !== 'off' && ZOOM_DEFAULT_TYPES.indexOf(s.type) >= 0);
      if (wantZoom) addZoomButton(el, function () { return chartZoomNode(chart); }, s.title || '');
    } catch (e) { canvas.remove(); showError(el, 'ECharts 렌더링 실패: ' + e.message, s); return; }
    // 데이터 표
    if (s.table !== false) {
      var tb = tableFor(s);
      if (tb) {
        var det = h('details', 'rk-datatable');
        if (s.table === 'open') det.open = true;
        det.innerHTML = '<summary>데이터 표 보기</summary>' + tableHTML(tb);
        el.appendChild(det);
      }
    }
  }

  /* 리치 스타일(기본): 막대 그라데이션, 영역 페이드. <html data-style="flat"> 이면 끔 */
  function richOn() { return root.getAttribute('data-style') !== 'flat'; }
  function rgbaOf(hx, a) { var c = hexToRgb(hx); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function gradFill(hx, horizontal) {
    var tip = mix(hx, '#FFFFFF', 0.24);
    return horizontal
      ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: hx }, { offset: 1, color: tip }])
      : new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: tip }, { offset: 1, color: hx }]);
  }
  function applyRich(option, s, t) {
    if (!richOn() || !option || !isArr(option.series) || s.type === 'raw' || typeof echarts === 'undefined') return option;
    var horiz = !!s.horizontal;
    var plain = [t.gray, '#B9C1CC', t.good, t.bad, t.warn, t.up, t.down].map(function (x) { return String(x).toUpperCase(); });
    var skip = function (c) { return typeof c !== 'string' || c.charAt(0) !== '#' || /^#(FFFFFF|FFF)$/i.test(c) || plain.indexOf(c.toUpperCase()) >= 0; };
    option.series.forEach(function (se) {
      if (se.type === 'bar' && se.name !== '__base' && se.name !== '__total') {
        if (se.itemStyle && !skip(se.itemStyle.color)) se.itemStyle.color = gradFill(se.itemStyle.color, horiz);
        (se.data || []).forEach(function (d) { if (isObj(d) && d.itemStyle && !skip(d.itemStyle.color)) d.itemStyle.color = gradFill(d.itemStyle.color, horiz); });
      }
      if (se.type === 'line' && se.areaStyle && !se.stack && typeof se.areaStyle.color === 'string' && se.areaStyle.color.charAt(0) === '#') {
        var c = se.areaStyle.color;
        se.areaStyle = { opacity: 1, color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: rgbaOf(c, 0.26) }, { offset: 1, color: rgbaOf(c, 0.01) }]) };
      }
    });
    return option;
  }

  /* SVG에 현재 크기의 viewBox를 유지 → 인쇄/PDF에서 종이 폭에 맞춰 비율 그대로 축소 */
  function syncViewBox(chart) {
    try {
      var svg = chart.getDom().querySelector('svg');
      if (!svg) return;
      var w = parseFloat(svg.getAttribute('width')), hh = parseFloat(svg.getAttribute('height'));
      if (w && hh) { svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hh); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); }
    } catch (e) { /* ignore */ }
  }

  /* 크기 변화 대응 */
  var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function (entries) {
    entries.forEach(function (en) {
      var c = en.target.__rkChart;
      if (!c) return;
      var w = en.contentRect.width;
      if (c.__lastW && Math.abs(c.__lastW - w) < 2) return;
      c.__lastW = w;
      // 범주축 라벨 폭 재계산이 필요한 유형은 옵션을 다시 생성
      var info = c.__rk;
      if (info && ['bar', 'line', 'combo', 'waterfall', 'pareto', 'histogram', 'calendar', 'pie'].indexOf(info.spec.type) >= 0) {
        try { c.setOption(applyRich(B[info.spec.type](info.spec, tokens(), { width: w, height: en.contentRect.height }), info.spec, tokens()), { notMerge: true }); } catch (e) { /* ignore */ }
      }
      c.resize({ animation: { duration: 0 } });
      syncViewBox(c);
    });
  }) : null;

  /* ------------------------------------------------------------------ *
   * 8. KPI 카드 / 증감 / 스파크라인 / 진척률 / 표
   * ------------------------------------------------------------------ */
  function deltaInfo(text, good) {
    var s = String(text).trim();
    var dir = /^[+▲↑]/.test(s) ? 'up' : (/^[-−△▼↓]/.test(s) ? 'down' : (num(s) > 0 ? 'up' : (num(s) < 0 ? 'down' : 'flat')));
    if (num(s) === 0) dir = 'flat';
    var goodDir = (good || 'up').toLowerCase();
    var isGood = dir === 'flat' ? null : (goodDir === 'down' ? dir === 'down' : dir === 'up');
    return { dir: dir, good: isGood };
  }
  function decorateDelta(span, good) {
    if (span.__rkDelta || span.hasAttribute('data-raw')) return;
    span.__rkDelta = true;
    var info = deltaInfo(span.textContent, span.getAttribute('data-good') || good);
    span.classList.add('is-' + info.dir);
    if (info.good === true) span.classList.add('is-good');
    if (info.good === false) span.classList.add('is-bad');
    var txt = span.textContent.trim().replace(/^[+▲▼↑↓]\s*/, '').replace(/^[-−](?=\d)/, '');
    if (span.getAttribute('data-raw') == null) span.textContent = (info.dir === 'up' ? '▲ ' : info.dir === 'down' ? '▼ ' : '– ') + txt;
  }
  var _spkId = 0;
  function sparkSVG(values, w, color, opts) {
    opts = opts || {};
    var v = values.map(num).filter(function (x) { return x != null; });
    if (v.length < 2) return '';
    var H = 30, pad = 3;
    var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), rg = mx - mn || 1;
    var pts = v.map(function (x, i) { return [pad + i * (w - pad * 2) / (v.length - 1), pad + (H - pad * 2) * (1 - (x - mn) / rg)]; });
    var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');
    var area = path + 'L' + pts[pts.length - 1][0].toFixed(1) + ' ' + H + 'L' + pts[0][0].toFixed(1) + ' ' + H + 'Z';
    var last = pts[pts.length - 1];
    var gid = 'rkspk' + (++_spkId);
    return '<svg viewBox="0 0 ' + w + ' ' + H + '" width="' + w + '" height="' + H + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity="' + (richOn() ? 0.32 : 0.10) + '"/><stop offset="1" stop-color="' + color + '" stop-opacity="' + (richOn() ? 0.02 : 0.10) + '"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
      '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3" fill="' + color + '" stroke="#fff" stroke-width="1.5"/></svg>';
  }
  function drawSpark(el) {
    var vals = el.__vals || (el.getAttribute('data-values') || '').split(/[,\s]+/);
    el.__vals = vals;
    var w = Math.max(60, el.clientWidth || 150);
    var t = tokens();
    el.innerHTML = sparkSVG(vals, w, el.getAttribute('data-color') ? resolveColor(el.getAttribute('data-color'), t) : t.palette[0]);
  }
  function renderKpis(el) {
    if (el.__rkDone) return;
    el.__rkDone = true;
    var sc = el.querySelector('script[type="application/json"]');
    if (sc) {
      var arr;
      try { arr = readSpec(el, 'KPI'); } catch (e) { showError(el, e.message); return; }
      if (isObj(arr)) arr = arr.items || arr.kpis || [arr];
      if (arr.length > 6) issue('warn', el, 'KPI 카드가 ' + arr.length + '개 — 3~5개 권장(핵심만)');
      var html = arr.map(function (k) {
        var v = k.value;
        var vTxt = typeof v === 'number' ? fmt(v, { decimals: k.decimals != null ? k.decimals : decimalsOf([v]), compact: k.compact }) : esc(v == null ? '–' : v);
        var delta = k.delta != null ? (typeof k.delta === 'number' ? (k.delta > 0 ? '+' : '') + fmt(k.delta, { decimals: k.deltaDecimals != null ? k.deltaDecimals : decimalsOf([k.delta]) }) + (k.deltaUnit != null ? k.deltaUnit : '%') : String(k.delta)) : null;
        var st = k.status ? ' data-status="' + esc(k.status) + '"' : '';
        var prog = num(first(k.progress, k.achievement));
        var bar = '';
        if (prog != null) {
          var scale = Math.max(100, prog) * 1.05;
          bar = '<div class="rk-kpi-bar" title="달성률 ' + prog + '%"><i style="width:' + (prog / scale * 100).toFixed(1) + '%;background:' + (prog >= 100 ? 'var(--rk-good)' : prog >= 90 ? 'var(--rk-warn)' : 'var(--rk-bad)') + '"></i><b style="left:' + (100 / scale * 100).toFixed(1) + '%"></b></div>';
        }
        return '<div class="rk-kpi"' + st + '>' +
          '<div class="rk-kpi-label">' + esc(k.label || k.name || '') + '</div>' +
          '<div class="rk-kpi-value">' + vTxt + (k.unit ? '<span class="rk-unit">' + esc(k.unit) + '</span>' : '') + '</div>' +
          ((delta || k.deltaLabel || k.compare) ? '<div class="rk-kpi-meta">' + (delta ? '<span class="rk-delta" data-good="' + esc(k.good || 'up') + '">' + esc(delta) + '</span>' : '') + '<span>' + esc(k.deltaLabel || k.compare || '') + '</span></div>' : '') +
          bar +
          (k.spark || k.trend ? '<div class="rk-kpi-spark" data-values="' + esc(isArr(k.spark || k.trend) ? (k.spark || k.trend).join(',') : String(k.spark || k.trend)) + '"></div>' : '') +
          (k.note ? '<div class="rk-kpi-note">' + esc(k.note) + '</div>' : '') +
          '</div>';
      }).join('');
      el.insertAdjacentHTML('beforeend', html);
    }
    el.querySelectorAll('.rk-delta').forEach(function (d) { decorateDelta(d); });
    el.querySelectorAll('.rk-kpi-spark').forEach(function (sp) { drawSpark(sp); if (ro2) ro2.observe(sp); });
  }
  var ro2 = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function (en) { en.forEach(function (e) { if (Math.abs((e.target.__w || 0) - e.contentRect.width) > 2) { e.target.__w = e.contentRect.width; drawSpark(e.target); } }); }) : null;

  function renderProgress(el) {
    if (el.__rkDone) return;
    el.__rkDone = true;
    var v = num(el.getAttribute('data-value')), tg = num(el.getAttribute('data-target')), mx = num(el.getAttribute('data-max')) || 100;
    var label = el.getAttribute('data-label') || el.textContent.trim();
    var unit = el.getAttribute('data-unit') != null ? el.getAttribute('data-unit') : '%';
    if (v == null) { issue('warn', el, 'rk-progress에 data-value가 없음'); return; }
    var st = el.getAttribute('data-status');
    if (!st && tg != null) { st = v >= tg ? 'good' : (v >= tg * 0.9 ? 'warn' : 'bad'); el.setAttribute('data-status', st); }
    var scale = Math.max(mx, v);
    el.innerHTML = '<div class="rk-progress-head"><b>' + esc(label) + '</b><span>' + esc(fmt(v, { decimals: decimalsOf([el.getAttribute('data-value')]) })) + esc(unit) +
      (tg != null ? ' <small style="color:var(--rk-muted);font-weight:500">/ 목표 ' + esc(fmt(tg, { decimals: decimalsOf([el.getAttribute('data-target')]) })) + esc(unit) + '</small>' : '') + '</span></div>' +
      '<div class="rk-progress-track"><div class="rk-progress-fill" style="width:' + Math.min(100, v / scale * 100).toFixed(1) + '%"></div>' +
      (tg != null ? '<div class="rk-progress-target" style="left:' + Math.min(100, tg / scale * 100).toFixed(1) + '%"></div>' : '') + '</div>';
  }

  var BADGE_MAP = { good: ['정상', '완료', '달성', '양호', '해결', 'good', 'ok', 'done', 'green', '초과달성', '순조'], warn: ['주의', '지연', '보통', '검토', 'warn', 'amber', 'yellow', '관찰', '일부'], bad: ['위험', '미달', '심각', '중단', '미해결', 'bad', 'red', '긴급', '실패', '경고'],
    info: ['진행', '계획', '예정', '권고', '준비', '운영', '병행', '착수', '신규', 'info', 'plan'] };
  function badgeClass(txt) {
    var s = String(txt).toLowerCase();
    for (var k in BADGE_MAP) if (BADGE_MAP[k].some(function (w) { return s.indexOf(w) >= 0; })) return k;
    return '';
  }
  function heatColor(v, mn, mx, t, diverging) {
    if (v == null) return '';
    if (diverging) {
      var m = Math.max(Math.abs(mn), Math.abs(mx)) || 1, r = v / m;
      return r >= 0 ? mix('#FFFFFF', t.divPos, Math.min(1, r) * 0.42) : mix('#FFFFFF', t.divNeg, Math.min(1, -r) * 0.42);
    }
    return mix('#FFFFFF', t.seq, 0.06 + (v - mn) / ((mx - mn) || 1) * 0.4);
  }
  function renderTableJS(el) {
    if (el.__rkDone) return;
    el.__rkDone = true;
    var s;
    try { s = readSpec(el, '표'); } catch (e) { showError(el, e.message); return; }
    var t = tokens();
    var cols = (s.columns || []).map(function (c, i) { return isObj(c) ? c : { key: i, label: String(c) }; });
    var rows = (s.rows || s.data || []).map(function (r) {
      if (isArr(r)) { var o = {}; cols.forEach(function (c, i) { o[c.key] = r[i]; }); return o; }
      return r;
    });
    if (!cols.length) {
      if (rows.length && isObj(rows[0])) cols = Object.keys(rows[0]).map(function (k) { return { key: k, label: k }; });
      else { showError(el, '표: "columns": [...], "rows": [...] 형식이 필요합니다.'); return; }
    }
    cols.forEach(function (c, ci) {
      if (!c.type) {
        var allNum = rows.length && rows.every(function (r) { var v = r[c.key]; return v == null || v === '' || typeof v === 'number' || /^[\s+\-−△▲▼]*[\d,]+(\.\d+)?\s*%?$/.test(String(v)); });
        c.type = ci > 0 && allNum ? 'num' : 'text';
      }
      if (c.type === 'num' || c.type === 'delta' || c.type === 'pct' || c.type === 'bar') {
        var vals = rows.map(function (r) { return num(r[c.key]); }).filter(function (v) { return v != null; });
        c._min = Math.min.apply(null, vals); c._max = Math.max.apply(null, vals);
        c._d = c.decimals != null ? c.decimals : decimalsOf(rows.map(function (r) { return r[c.key]; }));
      }
    });
    var heat = toSet(s.heat);
    var hl = toSet(s.highlight);
    function cell(c, r, isTotal) {
      var v = r[c.key], n = num(v), cls = [], style = '', html;
      switch (c.type) {
        case 'num': case 'pct':
          cls.push('num');
          html = n == null ? esc(v == null ? '' : v) : esc(fmt(n, { decimals: c._d, compact: c.compact, negative: c.negative || s.negative }) + (c.type === 'pct' ? '%' : (c.unit && c.showUnit ? c.unit : '')));
          if (heat && heat[c.key] && !isTotal && n != null) style = 'background:' + heatColor(n, c._min, c._max, t, c._min < 0 && c._max > 0);
          break;
        case 'delta':
          cls.push('num');
          if (n == null) { html = esc(v == null ? '' : v); break; }
          var info = deltaInfo(typeof v === 'string' ? v : (n > 0 ? '+' : '') + n, c.good || 'up');
          html = '<span class="rk-delta' + (info.good === true ? ' is-good' : info.good === false ? ' is-bad' : '') + ' is-' + info.dir + '" data-raw>' + (info.dir === 'up' ? '▲ ' : info.dir === 'down' ? '▼ ' : '') + esc(fmt(Math.abs(n), { decimals: c._d })) + esc(c.unit || '') + '</span>';
          break;
        case 'bar':
          cls.push('num');
          var mx = c.max != null ? c.max : Math.max(Math.abs(c._max), Math.abs(c._min)) || 1;
          html = '<div class="rk-cellbar"><span>' + esc(fmt(n, { decimals: c._d })) + esc(c.unit || '') + '</span><i><em class="' + (n < 0 ? 'neg' : '') + '" style="width:' + Math.min(100, Math.abs(n) / mx * 100).toFixed(1) + '%' + (c.color ? ';background:' + resolveColor(c.color, t) : '') + '"></em></i></div>';
          break;
        case 'badge': case 'status':
          html = v == null || v === '' ? '' : '<span class="rk-badge ' + (c.map && c.map[v] ? c.map[v] : badgeClass(v)) + '">' + esc(v) + '</span>';
          cls.push('ctr');
          break;
        default:
          html = esc(v == null ? '' : v);
      }
      if (c.align) cls.push(c.align === 'right' ? 'num' : c.align === 'center' ? 'ctr' : '');
      return '<td' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + (style ? ' style="' + style + '"' : '') + '>' + html + '</td>';
    }
    var head = '<thead><tr>' + cols.map(function (c) { var nm = c.type === 'num' || c.type === 'delta' || c.type === 'pct' || c.type === 'bar'; return '<th' + (nm ? ' class="num"' : (c.type === 'badge' ? ' class="ctr"' : '')) + '>' + esc(c.label != null ? c.label : c.key) + (c.unit && !c.showUnit && c.type !== 'delta' && c.type !== 'bar' ? '<br><small style="font-weight:500">(' + esc(c.unit) + ')</small>' : '') + '</th>'; }).join('') + '</tr></thead>';
    var body = rows.map(function (r, i) {
      var isH = hl && (hl[String(i)] || hl[String(r[cols[0].key])]);
      return '<tr' + (isH ? ' class="rk-hl"' : '') + '>' + cols.map(function (c) { return cell(c, r); }).join('') + '</tr>';
    }).join('');
    var tot = s.total;
    if (tot === true || tot === 'auto' || tot === 'sum') {
      tot = {}; tot[cols[0].key] = s.totalLabel || '합계';
      cols.slice(1).forEach(function (c) { if (c.type === 'num') tot[c.key] = rows.reduce(function (a, r) { return a + (num(r[c.key]) || 0); }, 0); });
    }
    if (isObj(tot)) body += '<tr class="rk-total">' + cols.map(function (c) { return cell(c, tot, true); }).join('') + '</tr>';
    el.classList.add('rk-figure', 'rk-plain');
    var unitTxt = s.unit ? '(단위: ' + esc(s.unit) + ')' : '';
    var headHtml = (s.title || unitTxt) ? '<div class="rk-fig-head">' + (s.title ? '<div class="rk-fig-title">' + esc(s.title) + (s.sample ? '<span class="rk-sample-flag">예시 데이터</span>' : '') + '</div>' : '') +
      '<div class="rk-fig-subrow"><span class="rk-fig-sub">' + esc(s.subtitle || '') + '</span>' + (unitTxt ? '<span class="rk-fig-unit">' + unitTxt + '</span>' : '') + '</div></div>' : '';
    el.insertAdjacentHTML('beforeend', headHtml + '<div class="rk-table-wrap"><table class="rk-table' + (s.compact ? ' rk-compact' : '') + '">' + head + '<tbody>' + body + '</tbody></table></div>' +
      ((s.source || s.note) ? '<div class="rk-fig-foot" style="margin-top:-16px"><span class="rk-source">' + esc(s.source || '') + '</span><span>' + esc(s.note || '') + '</span></div>' : ''));
    if (s.sample) issue('warn', el, '예시(sample) 표 데이터 — 실제 데이터로 교체 필요');
  }

  /* 일반 HTML 표 보정: 숫자 셀 우측 정렬, data-heat 열 색칠, 넓은 표 스크롤 래핑 */
  function enhanceTable(tb) {
    if (tb.__rkDone || tb.closest('.rk-tablejs') || tb.closest('.rk-datatable')) return;
    tb.__rkDone = true;
    var re = /^[\s(]*[+\-−△▲▼]?\s*[\d,]+(\.\d+)?\s*(%p?|%|배|건|명|개|원|억|만|천|조|억원|만원|백만원|천원|일|시간|회|점|톤|kg|km)?\s*\)?$/;
    var colStat = {};
    tb.querySelectorAll('tbody tr').forEach(function (tr) {
      [].forEach.call(tr.children, function (td, ci) {
        var tx = td.textContent.trim();
        if (!tx || tx === '-' || tx === '–') return;
        var st = colStat[ci] || (colStat[ci] = { n: 0, num: 0 });
        st.n++; if (re.test(tx)) st.num++;
      });
    });
    var inlineOnly = function (td) { return ![].some.call(td.querySelectorAll('*'), function (c) { return !/^(STRONG|B|EM|I|MARK|SMALL|SUP|SUB|SPAN)$/.test(c.tagName) || c.classList.contains('rk-badge'); }); };
    var numCols = {};
    Object.keys(colStat).forEach(function (ci) { var st = colStat[ci]; if (+ci > 0 && st.n && st.num / st.n >= 0.8) numCols[ci] = 1; });
    tb.querySelectorAll('tbody tr').forEach(function (tr) {
      [].forEach.call(tr.children, function (td, ci) {
        if (!numCols[ci] || td.tagName !== 'TD' || td.classList.contains('num') || !inlineOnly(td)) return;
        var tx = td.textContent.trim();
        if (re.test(tx) || /^[-–]$/.test(tx)) td.classList.add('num');
      });
    });
    var hr = tb.querySelector('thead tr:last-child');
    if (hr) [].forEach.call(hr.children, function (th, ci) { if (numCols[ci] && !th.hasAttribute('colspan')) th.classList.add('num'); });
    var t = tokens();
    var hc = tb.getAttribute('data-heat');
    if (hc) {
      hc.split(',').map(function (x) { return +x.trim() - 1; }).forEach(function (ci) {
        var cells = [].slice.call(tb.querySelectorAll('tbody tr:not(.rk-total) > *:nth-child(' + (ci + 1) + ')'));
        var vals = cells.map(function (c) { return num(c.textContent); });
        var nums = vals.filter(function (v) { return v != null; });
        var mn = Math.min.apply(null, nums), mx = Math.max.apply(null, nums);
        cells.forEach(function (c, i) { if (vals[i] != null) c.style.background = heatColor(vals[i], mn, mx, t, mn < 0 && mx > 0); });
      });
    }
    tb.querySelectorAll('.rk-delta').forEach(function (d) { decorateDelta(d); });
    if (!tb.parentElement.classList.contains('rk-table-wrap') && !tb.closest('.rk-card, .rk-callout, .rk-decision')) {
      var w = h('div', 'rk-table-wrap'); tb.parentNode.insertBefore(w, tb); w.appendChild(tb);
    }
  }

  /* ------------------------------------------------------------------ *
   * 9. Mermaid 다이어그램
   * ------------------------------------------------------------------ */
  var MERMAID_CLASSES = function (t) {
    return [
      'classDef brand fill:' + t.brand + ',stroke:' + t.brand + ',color:#ffffff,font-weight:700',
      'classDef accent fill:' + t.accent + ',stroke:' + t.accent + ',color:#ffffff,font-weight:700',
      'classDef soft fill:' + t.brandSoft + ',stroke:' + t.brandLine + ',color:' + t.ink,
      'classDef good fill:#E5F3EC,stroke:' + t.good + ',color:' + t.good + ',font-weight:700',
      'classDef warn fill:#FDF2DF,stroke:' + t.warn + ',color:#8A5600,font-weight:700',
      'classDef bad fill:#FBEBEB,stroke:' + t.bad + ',color:' + t.bad + ',font-weight:700',
      'classDef muted fill:#F3F5F8,stroke:#C7D0DC,color:' + t.muted,
      'classDef decision fill:#FFF8E6,stroke:' + t.warn + ',color:' + t.ink
    ];
  };
  function injectClassDefs(code, t) {
    var lines = code.split('\n');
    var i = 0;
    if (/^\s*---\s*$/.test(lines[0])) { i = 1; while (i < lines.length && !/^\s*---\s*$/.test(lines[i])) i++; i++; }
    while (i < lines.length && !lines[i].trim()) i++;
    if (i < lines.length && /^\s*(flowchart|graph)\b/i.test(lines[i])) {
      lines.splice(i + 1, 0, MERMAID_CLASSES(t).map(function (l) { return '    ' + l; }).join('\n'));
    }
    return lines.join('\n');
  }
  function dedent(txt) {
    var lines = txt.replace(/\t/g, '    ').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    var ind = Math.min.apply(null, lines.filter(function (l) { return l.trim(); }).map(function (l) { return l.match(/^ */)[0].length; }));
    return lines.map(function (l) { return l.slice(ind); }).join('\n');
  }
  var _mermaidP = null;
  function loadMermaid() {
    if (global.mermaid) return Promise.resolve(global.mermaid);
    if (_mermaidP) return _mermaidP;
    var url = CONFIG.mermaidEsm || 'https://cdn.jsdelivr.net/npm/mermaid@12.3.0/dist/mermaid.esm.min.mjs';
    _mermaidP = (new Function('u', 'return import(u)'))(url).then(function (m) { return m.default || m; });
    return _mermaidP;
  }
  var _mermaidInit = false;
  function renderDiagrams() {
    var els = [].slice.call(doc.querySelectorAll('.rk-diagram, .rk-mermaid, pre.mermaid'));
    els = els.filter(function (e) { return !e.__rkDone; });
    if (!els.length) return Promise.resolve();
    var t = tokens();
    var fontsReady = doc.fonts && doc.fonts.ready ? doc.fonts.ready.then(function () { return doc.fonts.load('600 14px "Pretendard Variable"', '가나다라ABC123').catch(function () { }); }) : Promise.resolve();
    return fontsReady.then(loadMermaid).then(function (mermaid) {
      if (!_mermaidInit) {
        mermaid.initialize({
          startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: t.font,
          themeCSS: richOn() ? '.node rect, .node polygon, .node circle, .node path, .actor { filter: drop-shadow(0 2px 4px rgba(16,24,40,.14)); } .edgeLabel { border-radius: 4px; }' : '',
          themeVariables: {
            fontFamily: t.font, fontSize: '14px', primaryColor: t.brandSoft, primaryBorderColor: t.brand, primaryTextColor: t.ink,
            secondaryColor: t.accentSoft, secondaryBorderColor: t.accent, secondaryTextColor: t.ink, tertiaryColor: t.surface2, tertiaryBorderColor: t.lineStrong,
            lineColor: '#8A94A6', textColor: t.ink, mainBkg: t.brandSoft, nodeBorder: t.brand, clusterBkg: t.surface2, clusterBorder: t.lineStrong,
            edgeLabelBackground: '#FFFFFF', noteBkgColor: '#FFF8E6', noteBorderColor: '#E5B85C', noteTextColor: t.ink,
            actorBkg: t.brandSoft, actorBorder: t.brand, actorTextColor: t.ink, signalColor: t.ink2, signalTextColor: t.ink, labelBoxBkgColor: t.brandSoft,
            activationBkgColor: t.accentSoft, activationBorderColor: t.accent, sequenceNumberColor: '#FFFFFF',
            sectionBkgColor: t.brandSoft, altSectionBkgColor: '#FFFFFF', taskBkgColor: t.palette[0], taskBorderColor: t.palette[0], taskTextColor: '#FFFFFF',
            activeTaskBkgColor: t.accent, activeTaskBorderColor: t.accent, doneTaskBkgColor: '#B9C1CC', doneTaskBorderColor: '#B9C1CC', critBkgColor: t.bad, critBorderColor: t.bad, todayLineColor: t.bad,
            gridColor: t.line, git0: t.palette[0], cScale0: t.palette[0], cScale1: t.palette[1], cScale2: t.palette[2], cScale3: t.palette[3], cScale4: t.palette[4], cScale5: t.palette[5],
            pie1: t.palette[0], pie2: t.palette[1], pie3: t.palette[2], pie4: t.palette[3], pie5: t.palette[4], pie6: t.palette[5], pie7: t.palette[6], pie8: t.palette[7],
            quadrant1Fill: t.brandSoft, quadrant2Fill: '#F6F8FB', quadrant3Fill: '#F6F8FB', quadrant4Fill: '#F6F8FB', quadrantPointFill: t.accent
          },
          flowchart: { htmlLabels: true, curve: 'basis', padding: 14, nodeSpacing: 36, rankSpacing: 46, useMaxWidth: true, diagramPadding: 8 },
          sequence: { useMaxWidth: true, mirrorActors: false, showSequenceNumbers: false, actorMargin: 48, width: 120, height: 42, boxMargin: 8, messageMargin: 30, actorFontSize: 13, messageFontSize: 13, noteFontSize: 12 },
          gantt: { useMaxWidth: true, barHeight: 22, fontSize: 12, sectionFontSize: 12 },
          timeline: { useMaxWidth: true }, mindmap: { useMaxWidth: true }, journey: { useMaxWidth: true }
        });
        _mermaidInit = true;
      }
      var chain = Promise.resolve();
      els.forEach(function (el, i) {
        chain = chain.then(function () {
          el.__rkDone = true;
          var sc = el.querySelector('script[type="text/x-mermaid"], script[type="text/plain"], script[type="text/mermaid"]');
          var code = sc ? sc.textContent : (el.__src || el.textContent);
          code = dedent(code);
          if (!sc) { el.__src = code; el.textContent = ''; }
          code = injectClassDefs(code, t);
          var title = el.getAttribute('data-title'), sub = el.getAttribute('data-subtitle'), src = el.getAttribute('data-source');
          el.classList.add('rk-figure');
          if (el.hasAttribute('data-plain')) el.classList.add('rk-plain');
          if (title || sub) el.insertAdjacentHTML('beforeend', '<div class="rk-fig-head">' + (title ? '<div class="rk-fig-title">' + esc(title) + '</div>' : '') + (sub ? '<div class="rk-fig-subrow"><span class="rk-fig-sub">' + esc(sub) + '</span></div>' : '') + '</div>');
          var box = h('div', 'rk-diagram-canvas');
          el.appendChild(box);
          var id = 'rkm-' + Date.now().toString(36) + '-' + i;
          return mermaid.render(id, code).then(function (res) {
            box.innerHTML = res.svg;
            var svg = box.querySelector('svg');
            if (svg) {
              // 자연 크기보다 확대하지 않음(시퀀스 다이어그램 과대 표시 방지)
              var vb = svg.viewBox && svg.viewBox.baseVal;
              var natW = vb && vb.width ? Math.ceil(vb.width) : 0;
              svg.style.maxWidth = el.getAttribute('data-max-width') || (natW ? natW + 'px' : '100%');
              svg.style.width = '100%';
              svg.removeAttribute('height');
              // 너무 넓은 다이어그램은 글자가 읽히는 최소 배율(72%)까지만 축소하고 가로 스크롤 + '크게 보기'로 확인
              var cw = box.clientWidth;
              if (natW && cw && natW * 0.72 > cw && !el.hasAttribute('data-max-width')) {
                svg.style.width = Math.round(natW * 0.72) + 'px';
                svg.style.maxWidth = 'none';
                box.classList.add('rk-scroll');
              }
              svg.setAttribute('role', 'img');
              if (title) svg.setAttribute('aria-label', title);
            }
            if (src) el.insertAdjacentHTML('beforeend', '<div class="rk-fig-foot"><span class="rk-source">' + esc(src) + '</span></div>');
            if (el.getAttribute('data-zoom') !== 'off') addZoomButton(el, function () { return box.querySelector('svg'); }, title || '다이어그램');
          }).catch(function (e) {
            var bad = doc.getElementById('d' + id); if (bad) bad.remove();
            box.remove();
            showError(el, 'Mermaid 문법 오류: ' + String(e && (e.message || e.str) || e).split('\n').slice(0, 4).join('\n') +
              '\n힌트: 한글/특수문자 라벨은 큰따옴표로 감싸기 → A["매출(억원)"], 노드 ID는 영문(A1, step2), 소문자 end 금지.');
            el.insertAdjacentHTML('beforeend', '<pre style="font-size:11px;overflow:auto;background:#F6F8FB;padding:8px;border-radius:6px">' + esc(code) + '</pre>');
          });
        });
      });
      return chain;
    }).catch(function (e) {
      els.forEach(function (el) { if (!el.__rkDone) { el.__rkDone = true; showError(el, 'Mermaid 라이브러리를 불러오지 못했습니다: ' + (e && e.message || e)); } });
    });
  }

  /* ------------------------------------------------------------------ *
   * 9.5 크게 보기 뷰어 — 흐름도·복잡한 차트를 확대/축소/이동하며 보기
   *  - 다이어그램(Mermaid): 기본 제공 (끄기: data-zoom="off")
   *  - 차트: sankey·gantt·treemap·sunburst·heatmap 기본, 그 외 "zoom": true 로 켬 ("zoom": false 로 끔)
   * ------------------------------------------------------------------ */
  var ICON_EXPAND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';
  function addZoomButton(fig, getNode, title) {
    if (fig.__rkZoom) return;
    fig.__rkZoom = true;
    fig.classList.add('rk-zoomable');
    var b = h('button', 'rk-zoom-btn rk-noprint', ICON_EXPAND);
    b.type = 'button';
    b.title = '크게 보기 (확대·축소·이동)';
    b.setAttribute('aria-label', '크게 보기');
    b.addEventListener('click', function (e) { e.stopPropagation(); var n = getNode(); if (n) openViewer(n, title); });
    fig.appendChild(b);
  }
  function openViewer(src, title) {
    var node, natW, natH;
    if (src.tagName && src.tagName.toLowerCase() === 'img') {
      node = src; natW = src.__w; natH = src.__h;
    } else {
      var vb = src.viewBox && src.viewBox.baseVal, bb = src.getBoundingClientRect();
      natW = (vb && vb.width) || parseFloat(src.getAttribute('width')) || bb.width;
      natH = (vb && vb.height) || parseFloat(src.getAttribute('height')) || bb.height;
      node = src.cloneNode(true);
      node.setAttribute('width', natW);
      node.setAttribute('height', natH);
      node.style.maxWidth = 'none';
      node.style.width = natW + 'px';
      node.style.height = natH + 'px';
    }
    var ov = h('div', 'rk-viewer rk-noprint');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="rk-viewer-bar"><b class="rk-viewer-title"></b>' +
      '<span class="rk-viewer-hint">휠·버튼: 확대/축소 · 드래그: 이동 · 더블클릭: 화면 맞춤 · Esc: 닫기</span>' +
      '<div class="rk-viewer-tools"><button type="button" data-a="out" title="축소 (-)">−</button><span class="rk-viewer-pct">100%</span>' +
      '<button type="button" data-a="in" title="확대 (+)">+</button><button type="button" data-a="fit" title="화면 맞춤 (0)">맞춤</button>' +
      '<button type="button" data-a="one" title="원본 크기">1:1</button><button type="button" data-a="close" title="닫기 (Esc)">✕</button></div></div>' +
      '<div class="rk-viewer-stage"><div class="rk-viewer-canvas"></div></div>';
    ov.querySelector('.rk-viewer-title').textContent = title || '';
    var stage = ov.querySelector('.rk-viewer-stage'), canvas = ov.querySelector('.rk-viewer-canvas'), pctEl = ov.querySelector('.rk-viewer-pct');
    canvas.style.width = natW + 'px';
    canvas.style.height = natH + 'px';
    canvas.appendChild(node);
    doc.body.appendChild(ov);
    var prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    var k = 1, x = 0, y = 0;
    function clampK(v) { return Math.max(0.1, Math.min(12, v)); }
    function apply() { canvas.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + k.toFixed(4) + ')'; pctEl.textContent = Math.round(k * 100) + '%'; }
    function fit() {
      var r = stage.getBoundingClientRect();
      k = clampK(Math.min(r.width / natW, r.height / natH) * 0.92);
      x = (r.width - natW * k) / 2; y = (r.height - natH * k) / 2; apply();
    }
    function zoomAt(f, cx, cy) {
      var r = stage.getBoundingClientRect(), nk = clampK(k * f);
      var px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
      x = px - (px - x) * nk / k; y = py - (py - y) * nk / k; k = nk; apply();
    }
    stage.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
    var pts = {}, pinch = null;
    stage.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      try { stage.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      stage.classList.add('is-grab');
    });
    stage.addEventListener('pointermove', function (e) {
      var prev = pts[e.pointerId];
      if (!prev) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts);
      if (ids.length === 1) { x += e.clientX - prev.x; y += e.clientY - prev.y; apply(); }
      else if (ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]], dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoomAt(dist / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = dist;
      }
    });
    function up(e) { delete pts[e.pointerId]; if (Object.keys(pts).length < 2) pinch = null; if (!Object.keys(pts).length) stage.classList.remove('is-grab'); }
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('dblclick', fit);
    function close() { doc.removeEventListener('keydown', onKey, true); global.removeEventListener('resize', fit); ov.remove(); root.style.overflow = prevOverflow; }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === '+' || e.key === '=') zoomAt(1.25);
      else if (e.key === '-' || e.key === '_') zoomAt(0.8);
      else if (e.key === '0') fit();
    }
    doc.addEventListener('keydown', onKey, true);
    global.addEventListener('resize', fit);
    ov.querySelector('.rk-viewer-tools').addEventListener('click', function (e) {
      var bt = e.target.closest('button'), a = bt && bt.getAttribute('data-a');
      if (a === 'in') zoomAt(1.25);
      else if (a === 'out') zoomAt(0.8);
      else if (a === 'fit') fit();
      else if (a === 'one') { var r = stage.getBoundingClientRect(); k = 1; x = (r.width - natW) / 2; y = (r.height - natH) / 2; apply(); }
      else if (a === 'close') close();
    });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    global.requestAnimationFrame(fit);
    var cb = ov.querySelector('[data-a="close"]');
    if (cb) cb.focus();
    RK._viewer = { close: close, fit: fit, zoom: zoomAt };
  }
  RK.openViewer = openViewer;
  var ZOOM_DEFAULT_TYPES = ['sankey', 'gantt', 'treemap', 'sunburst', 'heatmap'];
  function chartZoomNode(chart) {
    var dom = chart.getDom(), svg = dom.querySelector('svg');
    if (svg) return svg;
    var img = new Image();
    img.src = chart.getDataURL({ pixelRatio: 2, backgroundColor: '#FFFFFF' });
    img.__w = dom.clientWidth; img.__h = dom.clientHeight;
    img.style.width = img.__w + 'px'; img.style.height = img.__h + 'px';
    return img;
  }

  /* ------------------------------------------------------------------ *
   * 10. 목차 / 툴바 / 인쇄 / QA
   * ------------------------------------------------------------------ */
  function slug(i) { return 'sec-' + (i + 1); }
  function buildToc() {
    var secs = [].slice.call(doc.querySelectorAll('.rk-section > h2'));
    if (!secs.length) return;
    var roman = root.getAttribute('data-numbering') === 'roman', none = root.getAttribute('data-numbering') === 'none';
    var ROM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    var k = 0;
    var items = secs.map(function (h2, i) {
      if (!h2.id) h2.id = slug(i);
      var app = h2.parentElement.classList.contains('rk-appendix');
      var no = app ? '부록' : (none ? '' : (roman ? ROM[k] + '.' : String(k + 1).padStart(2, '0')));
      if (!app) k++;
      return { id: h2.id, no: no, text: h2.textContent.trim() };
    });
    doc.querySelectorAll('.rk-toc').forEach(function (nav) {
      if (nav.__rkDone) return; nav.__rkDone = true;
      nav.innerHTML = '<div class="rk-toc-title">목차</div><ol>' + items.map(function (x) { return '<li><a href="#' + x.id + '"><span class="rk-toc-no">' + esc(x.no) + '</span>' + esc(x.text) + '</a></li>'; }).join('') + '</ol>';
    });
    if (items.length >= 4 && !doc.querySelector('.rk-toc-float') && root.getAttribute('data-float-toc') !== 'off') {
      var fl = h('nav', 'rk-toc-float rk-noprint');
      fl.innerHTML = items.map(function (x) { return '<a href="#' + x.id + '">' + esc(x.no ? x.no + ' ' : '') + esc(x.text) + '</a>'; }).join('');
      doc.body.appendChild(fl);
      if (typeof IntersectionObserver !== 'undefined') {
        var links = fl.querySelectorAll('a');
        var io = new IntersectionObserver(function (ents) {
          ents.forEach(function (en) {
            if (en.isIntersecting) { var idx = secs.indexOf(en.target); links.forEach(function (a, j) { a.classList.toggle('active', j === idx); }); }
          });
        }, { rootMargin: '-10% 0px -75% 0px' });
        secs.forEach(function (s) { io.observe(s); });
      }
    }
  }
  /* 인쇄/PDF 버튼: 요청 시에만 (front matter "toolbar: print" → <html data-toolbar="print">) */
  function toolbar() {
    var mode = (root.getAttribute('data-toolbar') || '').toLowerCase();
    if (doc.querySelector('.rk-toolbar') || ['print', 'on', 'true', 'yes'].indexOf(mode) < 0) return;
    var tb = h('div', 'rk-toolbar rk-noprint');
    var b = h('button', '', '인쇄 / PDF 저장');
    b.type = 'button';
    b.addEventListener('click', function () { global.print(); });
    tb.appendChild(b);
    doc.body.appendChild(tb);
  }
  /* 우클릭 = 전체화면 전환 (기본 탑재). Shift/Ctrl/⌘ + 우클릭은 브라우저 기본 메뉴.
     끄려면 front matter "fullscreen: off" → <html data-fullscreen="off"> */
  var _fsBound = false;
  function toast(msg) {
    var old = doc.querySelector('.rk-toast');
    if (old) old.remove();
    var tt = h('div', 'rk-toast rk-noprint');
    tt.textContent = msg;
    doc.body.appendChild(tt);
    setTimeout(function () { tt.classList.add('rk-toast-out'); }, 1800);
    setTimeout(function () { tt.remove(); }, 2400);
  }
  function fullscreenSetup() {
    if (_fsBound || root.getAttribute('data-fullscreen') === 'off') return;
    _fsBound = true;
    var target = root;
    var req = target.requestFullscreen || target.webkitRequestFullscreen;
    if (!req) return;
    doc.addEventListener('contextmenu', function (e) {
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      var cur = doc.fullscreenElement || doc.webkitFullscreenElement;
      e.preventDefault();
      try {
        var pr = cur ? (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc) : req.call(target);
        if (pr && pr.catch) pr.catch(function () { toast('이 환경에서는 전체화면을 사용할 수 없습니다'); });
      } catch (er) { toast('이 환경에서는 전체화면을 사용할 수 없습니다'); }
    });
    var onChange = function () {
      var on = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
      root.classList.toggle('rk-is-fullscreen', on);
      if (on) toast('전체화면 — 우클릭 또는 Esc로 종료');
      setTimeout(function () { RK.charts.forEach(function (c) { try { c.resize({ animation: { duration: 0 } }); syncViewBox(c); } catch (er) { } }); }, 120);
    };
    doc.addEventListener('fullscreenchange', onChange);
    doc.addEventListener('webkitfullscreenchange', onChange);
  }
  function printSetup() {
    var resizeAll = function () { RK.charts.forEach(function (c) { try { c.resize({ animation: { duration: 0 } }); syncViewBox(c); } catch (e) { } }); };
    // 인쇄 시에는 다시 그리지 않고, viewBox가 있는 SVG를 CSS(@media print)로 종이 폭에 맞춰 비율 축소한다
    var before = function () { RK._printing = true; RK.charts.forEach(syncViewBox); };
    var after = function () { RK._printing = false; setTimeout(resizeAll, 50); };
    global.addEventListener('beforeprint', before);
    global.addEventListener('afterprint', after);
  }
  function runQA() {
    RK.charts.forEach(syncViewBox);
    var page = doc.querySelector('.rk-page') || doc.body;
    var pageRect = page.getBoundingClientRect();
    var overflow = [];
    page.querySelectorAll('.rk-figure, table, .rk-kpi, .rk-card, .rk-steps, pre, img, svg').forEach(function (el) {
      if (el.closest('.rk-table-wrap') && el.tagName === 'TABLE') return;
      if (el.closest('.rk-diagram-canvas') || el.closest('.rk-chart-canvas')) return;
      var r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > pageRect.right + 1 || r.left < pageRect.left - 1)) { overflow.push(where(el)); if (QA_MODE) el.classList.add('rk-qa-outline'); }
    });
    if (overflow.length) issue('warn', null, '페이지 폭을 넘는 요소 ' + overflow.length + '개: ' + overflow.slice(0, 5).join(', '));
    var figs = page.querySelectorAll('.rk-chart');
    figs.forEach(function (f) { if (!f.querySelector('.rk-fig-title') && !f.querySelector('.rk-error')) issue('warn', f, '차트에 제목(title)이 없음 — 결론형 제목을 넣으세요'); });
    var nKpi = page.querySelectorAll('.rk-kpi').length;
    var res = {
      version: RK.version, ready: true,
      charts: figs.length, rendered: RK.charts.length, diagrams: page.querySelectorAll('.rk-diagram, .rk-mermaid').length,
      sections: page.querySelectorAll('.rk-section').length, kpis: nKpi, tables: page.querySelectorAll('table.rk-table').length,
      errors: RK.issues.filter(function (x) { return x.level === 'error'; }).map(function (x) { return x.where + ' ' + x.msg; }),
      warnings: RK.issues.filter(function (x) { return x.level === 'warn'; }).map(function (x) { return x.where + ' ' + x.msg; }),
      pageHeight: Math.round(page.getBoundingClientRect().height)
    };
    root.setAttribute('data-rk-qa', JSON.stringify(res));
    root.setAttribute('data-rk-ready', '1');
    RK.qa = res;
    if (QA_MODE) {
      console.log('%c[report-kit QA]', 'font-weight:bold;color:#1F3A5F', res);
      var box = h('div', 'rk-noprint');
      box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99;max-width:520px;max-height:40vh;overflow:auto;background:#fff;border:2px solid ' + (res.errors.length ? '#CC3D3D' : '#188255') + ';border-radius:8px;padding:10px 12px;font-size:12px;box-shadow:0 6px 24px rgba(0,0,0,.15)';
      box.innerHTML = '<b>QA</b> 차트 ' + res.rendered + '/' + res.charts + ' · 오류 ' + res.errors.length + ' · 경고 ' + res.warnings.length +
        (res.errors.concat(res.warnings).length ? '<ul style="margin:6px 0 0;padding-left:16px">' + res.errors.map(function (e) { return '<li style="color:#CC3D3D">' + esc(e) + '</li>'; }).join('') + res.warnings.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' : '');
      doc.body.appendChild(box);
    }
    return res;
  }
  var QA_MODE = /[?&]qa\b/.test(location.search) || root.hasAttribute('data-qa');

  /* ------------------------------------------------------------------ *
   * 11. 진입점
   * ------------------------------------------------------------------ */
  /* 모델이 직접 넣은 기호(※ → ▶ '시사점:')와 CSS 자동 기호가 겹치지 않게 정리 */
  function dedupeMarkers(scope) {
    var rules = [['.rk-note', /^\s*※\s*/], ['.rk-lead', /^\s*(▶|►|▷|→)\s*/], ['.rk-sowhat', /^\s*(시사점|so what)\s*[:：]?\s*(→\s*)?/i], ['.rk-fig-insight', /^\s*(→|->|▶)\s*/]];
    rules.forEach(function (r) {
      scope.querySelectorAll(r[0]).forEach(function (el) {
        var w = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n;
        while ((n = w.nextNode())) { if (n.nodeValue.trim()) { n.nodeValue = n.nodeValue.replace(r[1], ''); break; } }
      });
    });
  }
  /* 참고문헌·각주·부록의 URL을 자동 링크로 */
  function linkify(scope) {
    scope.querySelectorAll('.rk-refs, .rk-footnotes, .rk-appendix, .rk-source').forEach(function (box) {
      var w = doc.createTreeWalker(box, NodeFilter.SHOW_TEXT, null), nodes = [], n;
      while ((n = w.nextNode())) { if (/https?:\/\//.test(n.nodeValue) && !(n.parentElement && n.parentElement.closest('a, script'))) nodes.push(n); }
      nodes.forEach(function (tn) {
        var frag = doc.createDocumentFragment(), txt = tn.nodeValue, last = 0;
        txt.replace(/https?:\/\/[^\s<>"')\]]+/g, function (u, idx) {
          var clean = u.replace(/[.,;:]+$/, '');
          frag.appendChild(doc.createTextNode(txt.slice(last, idx)));
          var a = doc.createElement('a'); a.href = clean; a.textContent = clean; a.target = '_blank'; a.rel = 'noopener';
          frag.appendChild(a); last = idx + clean.length; return u;
        });
        frag.appendChild(doc.createTextNode(txt.slice(last)));
        tn.parentNode.replaceChild(frag, tn);
      });
    });
  }
  RK.render = function (scope) {
    scope = scope || doc;
    _tok = null;
    dedupeMarkers(scope);
    scope.querySelectorAll('.rk-kpis').forEach(renderKpis);
    scope.querySelectorAll('.rk-delta').forEach(function (d) { decorateDelta(d, d.closest('[data-good]') && d.closest('[data-good]').getAttribute('data-good')); });
    scope.querySelectorAll('.rk-kpi-spark[data-values]').forEach(function (sp) { if (!sp.innerHTML) { drawSpark(sp); if (ro2) ro2.observe(sp); } });
    scope.querySelectorAll('.rk-progress[data-value]').forEach(renderProgress);
    scope.querySelectorAll('.rk-tablejs').forEach(renderTableJS);
    scope.querySelectorAll('table.rk-table, .rk-page table').forEach(function (tb) { if (!tb.classList.contains('rk-table')) tb.classList.add('rk-table'); enhanceTable(tb); });
    scope.querySelectorAll('.rk-chart').forEach(function (el) {
      try { renderChart(el); } catch (e) { showError(el, '알 수 없는 오류: ' + e.message); }
      if (ro && el.__rkChart) ro.observe(el.querySelector('.rk-chart-canvas'));
      var cv = el.querySelector('.rk-chart-canvas'); if (cv) cv.__rkChart = el.__rkChart;
    });
    linkify(scope);
    buildToc();
    toolbar();
    fullscreenSetup();
    return renderDiagrams();
  };
  RK.option = function (spec) { var s = normalize(spec); return B[s.type](s, tokens(), { width: 760 }); };

  function boot() {
    printSetup();
    var p;
    try { p = RK.render(doc); } catch (e) { console.error(e); p = Promise.resolve(); }
    Promise.resolve(p).then(function () { setTimeout(runQA, 60); }, function () { setTimeout(runQA, 60); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
