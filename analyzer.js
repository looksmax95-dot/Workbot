/* ============================================================================
   LOOKSSCAN · analyzer.js · v1.0
   MediaPipe FaceLandmarker (478 точек) → геометрия лица → тиры через LMX.
   Зависимость: metrics.js (window.LMX). Сервер не нужен, всё локально.

   API:
     await LMXAnalyzer.init()                     // загрузить MediaPipe с CDN
     await LMXAnalyzer.analyze(imgOrUrlOrFile)    // полный анализ фото
     LMXAnalyzer.recompute(landmarksPx, overrides)// пересчёт после доводки точек
     LMXAnalyzer.suggestOverrides(landmarksPx)    // стартовые позиции 9 точек

   Все координаты — в пикселях исходного изображения.
   ============================================================================ */
(function (root) {
'use strict';

var VERSION = '1.0';
var MP_VERSION = '0.10.14';
var CDN = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION,
  'https://unpkg.com/@mediapipe/tasks-vision@' + MP_VERSION
];
var MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
var IRIS_MM = 11.7; // средняя радужка для мм-калибровки

/* ── Индексы ландмарок MediaPipe (канон) ── */
var IDX = {
  hairlineTop: 10, glabella: 9, subnasale: 2, menton: 152,
  eyeL: { outer: 33, inner: 133, upper: 159, lower: 145 },
  eyeR: { outer: 263, inner: 362, upper: 386, lower: 374 },
  irisA: [468, 469, 470, 471, 472], irisB: [473, 474, 475, 476, 477],
  browL: { inner: 107, outer: 70, lower: 55 },
  browR: { inner: 334, outer: 300, lower: 285 },
  alarL: 64, alarR: 294, noseTip: 1,
  mouthL: 61, mouthR: 291,
  lipUpTop: 0, lipUpBot: 13, lipLoTop: 14, lipLoBot: 17,
  zygoL: 234, zygoR: 454, gonionL: 172, gonionR: 397,
  temporalL: 127, temporalR: 356
};

/* ── Точки для ручной доводки (AI врёт на краях лица) ── */
var MANUAL_POINTS = [
  { key: 'hairline',  label: 'Линия волос', lm: 10,  hint: 'центр верхней границы лба' },
  { key: 'zygoL',     label: 'Скула L',     lm: 234, hint: 'самая широкая точка скулы слева' },
  { key: 'zygoR',     label: 'Скула R',     lm: 454, hint: 'самая широкая точка скулы справа' },
  { key: 'gonionL',   label: 'Гонион L',    lm: 172, hint: 'угол челюсти слева' },
  { key: 'gonionR',   label: 'Гонион R',    lm: 397, hint: 'угол челюсти справа' },
  { key: 'temporalL', label: 'Висок L',     lm: 127, hint: 'височная точка слева' },
  { key: 'temporalR', label: 'Висок R',     lm: 356, hint: 'височная точка справа' },
  { key: 'neckL',     label: 'Шея L',       lm: null, hint: 'левая граница шеи под челюстью' },
  { key: 'neckR',     label: 'Шея R',       lm: null, hint: 'правая граница шеи под челюстью' }
];

var LOW_CONFIDENCE = ['iaa', 'iaaJfa', 'eme', 'foreheadRatio', 'medialCanthi', 'jawThirds', 'cheekSet', 'neckWidth'];

/* ── Состояние MediaPipe ── */
var _mp = null, _lm = null, _initPromise = null, _base = null;

function info() {
  return { ready: !!_lm, version: VERSION, mpVersion: MP_VERSION, backend: _base, irisMM: IRIS_MM };
}

async function init(opts) {
  opts = opts || {};
  if (_lm) return info();
  if (_initPromise) return _initPromise;

  _initPromise = (async function () {
    var vision = null, err = null;
    for (var i = 0; i < CDN.length; i++) {
      try { vision = await import(CDN[i] + '/vision_bundle.mjs'); _base = CDN[i]; break; }
      catch (e) { err = e; }
    }
    if (!vision) throw new Error('MediaPipe CDN недоступен. Проверь интернет. ' + (err && err.message || ''));

    var fileset = await vision.FilesetResolver.forVisionTasks(_base + '/wasm');
    var common = {
      baseOptions: { modelAssetPath: MODEL },
      runningMode: 'IMAGE',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true
    };
    try {
      _lm = await vision.FaceLandmarker.createFromOptions(fileset,
        Object.assign({}, common, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' } }));
    } catch (e) {
      _lm = await vision.FaceLandmarker.createFromOptions(fileset,
        Object.assign({}, common, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' } }));
    }
    _mp = vision;
    return info();
  })();

  try { return await _initPromise; }
  catch (e) { _initPromise = null; throw e; }
}

/* ── Загрузка изображения из разных источников ── */
function loadImage(src) {
  return new Promise(function (resolve, reject) {
    if (src && typeof src === 'object' && src.width && src.height) { resolve(src); return; }
    var url;
    if (typeof src === 'string') url = src;
    else if (root.File && src instanceof File) url = URL.createObjectURL(src);
    else { reject(new Error('Неподдерживаемый источник изображения')); return; }
    var img = new Image();
    img.onload = function () { if (url && url.indexOf('blob:') === 0) URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () { reject(new Error('Не удалось загрузить фото')); };
    img.src = url;
  });
}

function dims(src) {
  return { w: src.naturalWidth || src.videoWidth || src.width, h: src.naturalHeight || src.videoHeight || src.height };
}

/* ── Математика ── */
function d(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
function vd(a, b) { return Math.abs(a.y - b.y); }
function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function r2(x) { return Math.round(x * 100) / 100; }
function avg(arr) { return arr.reduce(function (s, x) { return s + x; }, 0) / arr.length; }
function centroid(pts) {
  var x = 0, y = 0; pts.forEach(function (p) { x += p.x; y += p.y; });
  return { x: x / pts.length, y: y / pts.length };
}
function angleAt(vertex, p1, p2) {
  var a = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  var b = { x: p2.x - vertex.x, y: p2.y - vertex.y };
  var dot = a.x * b.x + a.y * b.y, na = Math.sqrt(a.x * a.x + a.y * a.y), nb = Math.sqrt(b.x * b.x + b.y * b.y);
  if (!na || !nb) return 0;
  return Math.acos(clamp(dot / (na * nb), -1, 1)) * 180 / Math.PI;
}
function lineTilt(inner, outer) {
  var dx = outer.x - inner.x, dy = inner.y - outer.y;
  return Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI;
}
function rotate(pts, ang, c) {
  var co = Math.cos(ang), si = Math.sin(ang);
  return pts.map(function (p) {
    var x = p.x - c.x, y = p.y - c.y;
    return { x: c.x + x * co - y * si, y: c.y + x * si + y * co, z: p.z };
  });
}

/* ── Стартовые позиции ручных точек ── */
function suggestOverrides(lm) {
  var o = {};
  MANUAL_POINTS.forEach(function (mp) {
    if (mp.lm != null && lm[mp.lm]) o[mp.key] = { x: lm[mp.lm].x, y: lm[mp.lm].y };
  });
  var menton = lm[IDX.menton], gl = lm[IDX.glabella], sub = lm[IDX.subnasale];
  var lowerH = Math.abs(menton.y - sub.y) || 1;
  var gonL = lm[IDX.gonionL], gonR = lm[IDX.gonionR];
  var neckY = menton.y + lowerH * 0.45;
  var inset = d(gonL, gonR) * 0.06;
  o.neckL = { x: gonL.x + inset, y: neckY };
  o.neckR = { x: gonR.x - inset, y: neckY };
  return o;
}

/* ── Качество фото / поза ── */
function assessQuality(lm, img) {
  var warnings = [], pose = {};
  var irisL = centroid(IDX.irisA.map(function (i) { return lm[i]; }));
  var irisR = centroid(IDX.irisB.map(function (i) { return lm[i]; }));
  if (irisL.x > irisR.x) { var t = irisL; irisL = irisR; irisR = t; }
  var roll = Math.atan2(irisR.y - irisL.y, irisR.x - irisL.x) * 180 / Math.PI;
  var biz = d(lm[IDX.zygoL], lm[IDX.zygoR]);
  var midX = (irisL.x + irisR.x) / 2;
  var yaw = (lm[IDX.noseTip].x - midX) / (biz || 1);

  pose.roll = r2(roll); pose.yaw = r2(yaw * 100);
  if (Math.abs(roll) > 8) warnings.push('Голова наклонена ' + r2(roll) + '° — выровняй фото или доводи точки вручную');
  if (Math.abs(yaw) > 0.06) warnings.push('Лицо повёрнуто вбок — нужен строгий анфас');
  if (biz < 120) warnings.push('Низкое разрешение лица (<120px между скулами) — точность падает');

  var light = null;
  try {
    var c = document.createElement('canvas'), scale = Math.min(1, 256 / Math.max(dims(img).w, dims(img).h));
    c.width = Math.max(1, Math.round(dims(img).w * scale));
    c.height = Math.max(1, Math.round(dims(img).h * scale));
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    var xs = lm.map(function (p) { return p.x * scale; }), ys = lm.map(function (p) { return p.y * scale; });
    var x0 = clamp(Math.min.apply(null, xs), 0, c.width - 1), x1 = clamp(Math.max.apply(null, xs), 0, c.width - 1);
    var y0 = clamp(Math.min.apply(null, ys), 0, c.height - 1), y1 = clamp(Math.max.apply(null, ys), 0, c.height - 1);
    var data = ctx.getImageData(Math.floor(x0), Math.floor(y0), Math.max(1, Math.floor(x1 - x0)), Math.max(1, Math.floor(y1 - y0))).data;
    var sum = 0, sum2 = 0, n = 0;
    for (var i = 0; i < data.length; i += 16) {
      var lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += lum; sum2 += lum * lum; n++;
    }
    var mean = sum / n, std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    light = { mean: r2(mean), contrast: r2(std) };
    if (mean < 55) warnings.push('Фото тёмное — освещение влияет на MISC');
    if (mean > 225) warnings.push('Фото пересвечено');
    if (std < 18) warnings.push('Низкий контраст — детали кожи/теней теряются');
  } catch (e) {}

  var score = 100;
  score -= Math.min(35, Math.abs(roll) * 2);
  score -= Math.min(35, Math.abs(yaw) * 400);
  score -= biz < 120 ? 20 : 0;
  score -= light && light.mean < 55 ? 15 : 0;
  score -= light && light.mean > 225 ? 15 : 0;
  return { score: Math.round(clamp(score, 0, 100)), warnings: warnings, pose: pose, light: light };
}

/* ── Главная геометрия: ландмарки → 35 ратио ── */
function buildGeometry(rawLm, rawOverrides, opts) {
  opts = opts || {};
  var lm = rawLm.map(function (p) { return { x: p.x, y: p.y, z: p.z }; });
  var ov = {};
  Object.keys(rawOverrides || {}).forEach(function (k) { ov[k] = { x: rawOverrides[k].x, y: rawOverrides[k].y }; });

  // Выравнивание по линии зрачков (roll correction)
  var iA = centroid(IDX.irisA.map(function (i) { return lm[i]; }));
  var iB = centroid(IDX.irisB.map(function (i) { return lm[i]; }));
  var roll = Math.atan2(iB.y - iA.y, iB.x - iA.x);
  var center = centroid(lm);
  if (opts.correctRoll !== false) {
    lm = rotate(lm, -roll, center);
    Object.keys(ov).forEach(function (k) {
      var p = ov[k], x = p.x - center.x, y = p.y - center.y, co = Math.cos(-roll), si = Math.sin(-roll);
      ov[k] = { x: center.x + x * co - y * si, y: center.y + x * si + y * co };
    });
  }

  function P(i) { return lm[i]; }
  function O(key, fallbackIdx) { return ov[key] || lm[fallbackIdx]; }

  var hairline = O('hairline', IDX.hairlineTop);
  var glabella = P(IDX.glabella), subnasale = P(IDX.subnasale), menton = P(IDX.menton);
  var zygoL = O('zygoL', IDX.zygoL), zygoR = O('zygoR', IDX.zygoR);
  var gonionL = O('gonionL', IDX.gonionL), gonionR = O('gonionR', IDX.gonionR);
  var tempL = O('temporalL', IDX.temporalL), tempR = O('temporalR', IDX.temporalR);

  var irisPtsA = IDX.irisA.map(function (i) { return lm[i]; });
  var irisPtsB = IDX.irisB.map(function (i) { return lm[i]; });
  var irisL = centroid(irisPtsA), irisR = centroid(irisPtsB);
  if (irisL.x > irisR.x) { var tt = irisL; irisL = irisR; irisR = tt; var tp = irisPtsA; irisPtsA = irisPtsB; irisPtsB = tp; }

  var eyeL = { outer: P(IDX.eyeL.outer), inner: P(IDX.eyeL.inner), upper: P(IDX.eyeL.upper), lower: P(IDX.eyeL.lower) };
  var eyeR = { outer: P(IDX.eyeR.outer), inner: P(IDX.eyeR.inner), upper: P(IDX.eyeR.upper), lower: P(IDX.eyeR.lower) };
  var browL = { inner: P(IDX.browL.inner), outer: P(IDX.browL.outer), lower: P(IDX.browL.lower) };
  var browR = { inner: P(IDX.browR.inner), outer: P(IDX.browR.outer), lower: P(IDX.browR.lower) };
  var alarL = P(IDX.alarL), alarR = P(IDX.alarR), noseTip = P(IDX.noseTip);
  var mouthL = P(IDX.mouthL), mouthR = P(IDX.mouthR), mouthC = mid(mouthL, mouthR);
  var lipUT = P(IDX.lipUpTop), lipUB = P(IDX.lipUpBot), lipLT = P(IDX.lipLoTop), lipLB = P(IDX.lipLoBot);

  var bizW = d(zygoL, zygoR), gonW = d(gonionL, gonionR), tempW = d(tempL, tempR);
  var ipd = d(irisL, irisR), icd = d(eyeL.inner, eyeR.inner);
  var eyeWL = d(eyeL.outer, eyeL.inner), eyeWR = d(eyeR.outer, eyeR.inner);
  var eyeHL = d(eyeL.upper, eyeL.lower), eyeHR = d(eyeR.upper, eyeR.lower);
  var eyeW = (eyeWL + eyeWR) / 2, eyeH = (eyeHL + eyeHR) / 2 || 1;
  var noseW = d(alarL, alarR), mouthW = d(mouthL, mouthR);

  var upperThirdH = vd(hairline, glabella), midfaceH = vd(glabella, subnasale);
  var lowerThirdH = vd(subnasale, menton), fullFaceH = vd(hairline, menton);
  var upperFaceH = vd(glabella, lipUT) || 1;
  var totalThirds = upperThirdH + midfaceH + lowerThirdH || 1;
  var thirds = [upperThirdH / totalThirds * 100, midfaceH / totalThirds * 100, lowerThirdH / totalThirds * 100];
  var thirdsDev = Math.max.apply(null, thirds.map(function (t) { return Math.abs(t - 100 / 3); }));

  var philtrumH = vd(subnasale, lipUT) || 1;
  var chinH = vd(lipLB, menton);
  var upperLipH = vd(lipUT, lipUB) || 1, lowerLipH = vd(lipLT, lipLB);
  var jawSeg = [philtrumH, vd(lipUT, lipLB), vd(lipLB, menton)];
  var jawThirdsDev = Math.max.apply(null, jawSeg.map(function (s) { return Math.abs(s / (lowerThirdH || 1) * 100 - 100 / 3); }));

  // Калибровка мм по радужке
  function irisDiam(pts) {
    var edges = pts.slice(1), mx = 0;
    for (var i = 0; i < edges.length; i++) for (var j = i + 1; j < edges.length; j++) mx = Math.max(mx, d(edges[i], edges[j]));
    return mx;
  }
  var irisPx = (irisDiam(irisPtsA) + irisDiam(irisPtsB)) / 2;
  var mmPerPx = irisPx > 0 ? IRIS_MM / irisPx : null;

  var canthal = avg([lineTilt(eyeL.inner, eyeL.outer), lineTilt(eyeR.inner, eyeR.outer)]);
  var browTilt = avg([lineTilt(browL.inner, browL.outer), lineTilt(browR.inner, browR.outer)]);
  var browSet = avg([(eyeL.upper.y - browL.lower.y) / eyeH, (eyeR.upper.y - browR.lower.y) / eyeH]);
  var jfa = angleAt(menton, gonionL, gonionR);
  var iaa = avg([angleAt(alarL, subnasale, gonionL), angleAt(alarR, subnasale, gonionR)]);
  var eme = angleAt(mouthC, irisL, irisR);
  var cheekSet = clamp((subnasale.y - (zygoL.y + zygoR.y) / 2) / (midfaceH || 1) * 100, 0, 100);
  var medialCanthi = avg([angleAt(eyeL.inner, eyeL.upper, eyeL.lower), angleAt(eyeR.inner, eyeR.upper, eyeR.lower)]);

  var neckW = (ov.neckL && ov.neckR) ? d(ov.neckL, ov.neckR) : null;

  // Facial fifths: 5 ширин должны быть ≈ ширине глаза
  var fifthEdges = [zygoL.x, eyeL.outer.x, eyeL.inner.x, eyeR.inner.x, eyeR.outer.x, zygoR.x];
  var fifthW = [];
  for (var f = 0; f < 5; f++) fifthW.push(Math.abs(fifthEdges[f + 1] - fifthEdges[f]));
  var fifthsDev = Math.max.apply(null, fifthW.map(function (w) { return Math.abs(w - eyeW) / (eyeW || 1) * 100; }));

  // Симметрия: зеркалим L→R относительно средней линии
  var midX = (irisL.x + irisR.x) / 2;
  var pairs = [[33, 263], [133, 362], [159, 386], [145, 374], [70, 300], [107, 334], [64, 294], [61, 291], [234, 454], [172, 397], [127, 356]];
  var sq = 0;
  pairs.forEach(function (pr) {
    var L = lm[pr[0]], R = lm[pr[1]], mir = { x: 2 * midX - L.x, y: L.y };
    sq += Math.pow(d(mir, R), 2);
  });
  var symmetry = Math.sqrt(sq / pairs.length) / (bizW || 1) * 100;

  var geometry = {
    jawWidth: bizW > 0 ? gonW / bizW * 100 : null,
    browSet: browSet,
    thirds: thirdsDev,
    neckWidth: neckW != null && gonW > 0 ? neckW / gonW * 100 : null,
    lowerThird: Math.abs(thirds[2] - 100 / 3),
    fwhr: bizW / upperFaceH,
    eyeAspect: eyeW / eyeH,
    jawThirds: jawThirdsDev,
    chinPhiltrum: chinH / philtrumH,
    canthal: canthal,
    mouthNose: noseW > 0 ? mouthW / noseW : null,
    esr: bizW > 0 ? ipd / bizW * 100 : null,
    midface: ipd / upperFaceH,
    jfa: jfa,
    cheekSet: cheekSet,
    faceLength: bizW > 0 ? fullFaceH / bizW : null,
    bizygo: mmPerPx ? bizW * mmPerPx : null,
    noseBizygo: bizW > 0 ? noseW / bizW * 100 : null,
    browTilt: browTilt,
    medialCanthi: medialCanthi,
    bitemporal: bizW > 0 ? tempW / bizW * 100 : null,
    nostrilComm: lowerThirdH > 0 ? (mouthC.y - subnasale.y) / lowerThirdH * 100 : null,
    eyeSpacing: eyeW > 0 ? icd / eyeW : null,
    lipRatio: lowerLipH / upperLipH,
    iaaJfa: Math.abs(iaa - jfa),
    iaa: iaa,
    pflBizygo: bizW > 0 ? eyeW / bizW * 100 : null,
    eme: eme,
    lowerFull: fullFaceH > 0 ? vd(glabella, menton) / fullFaceH * 100 : null,
    fifths: fifthsDev,
    noseHW: noseW > 0 ? midfaceH / noseW : null,
    mouthBigonial: gonW > 0 ? mouthW / gonW * 100 : null,
    foreheadRatio: tempW > 0 ? upperThirdH / tempW : null,
    upperLower: lowerThirdH > 0 ? midfaceH / lowerThirdH : null,
    symmetry: symmetry
  };

  Object.keys(geometry).forEach(function (k) { if (geometry[k] != null && isFinite(geometry[k])) geometry[k] = r2(geometry[k]); else geometry[k] = null; });

  var points = {
    hairline: hairline, glabella: glabella, subnasale: subnasale, menton: menton,
    zygoL: zygoL, zygoR: zygoR, gonionL: gonionL, gonionR: gonionR,
    temporalL: tempL, temporalR: tempR, irisL: irisL, irisR: irisR,
    eyeL: eyeL, eyeR: eyeR, browL: browL, browR: browR,
    alarL: alarL, alarR: alarR, mouthL: mouthL, mouthR: mouthR,
    lipUT: lipUT, lipUB: lipUB, lipLT: lipLT, lipLB: lipLB
  };

  var thirdsPct = thirds.map(r2);
  return {
    geometry: geometry, points: points,
    meta: {
      mmPerPx: mmPerPx ? r2(mmPerPx * 1000) / 1000 : null,
      irisPx: r2(irisPx), bizygoPx: r2(bizW), roll: r2(roll * 180 / Math.PI),
      thirdsPct: thirdsPct, fifthsPx: fifthW.map(r2),
      confidence: LOW_CONFIDENCE.reduce(function (o, k) { o[k] = 'low'; return o; }, {}),
      computed: Object.keys(geometry).filter(function (k) { return geometry[k] != null; }).length
    }
  };
}

/* ── Пересчёт после ручной доводки (без повторного MediaPipe) ── */
function recompute(landmarksPx, overrides, opts) {
  opts = opts || {};
  var built = buildGeometry(landmarksPx, overrides || suggestOverrides(landmarksPx), opts);
  var tiers = null, detail = null;
  if (root.LMX) {
    var at = root.LMX.autoTiers(built.geometry, { sex: opts.sex || 'm', view: 'F', mode: 'A', extras: opts.extras !== false });
    tiers = at.tiers; detail = at.detail;
  }
  return Object.assign({ ok: true }, built, { tiers: tiers, detail: detail });
}

/* ── Полный анализ фото ── */
async function analyze(src, opts) {
  opts = opts || {};
  await init(opts);
  var img = await loadImage(src);
  var wh = dims(img);
  var res = _lm.detect(img);
  if (!res.faceLandmarks || !res.faceLandmarks.length) throw new Error('Лицо не найдено. Нужен чёткий анфас без очков и чёлки.');

  var raw = res.faceLandmarks[0].map(function (p) { return { x: p.x * wh.w, y: p.y * wh.h, z: p.z * wh.w }; });
  var quality = assessQuality(raw, img);
  var overrides = opts.overrides || suggestOverrides(raw);
  var built = recompute(raw, overrides, opts);

  return Object.assign({}, built, {
    ok: true, landmarks: raw, overrides: overrides,
    width: wh.w, height: wh.h, quality: quality,
    transform: res.facialTransformationMatrixes && res.facialTransformationMatrixes[0] || null
  });
}

function analyzeFile(file, opts) { return analyze(file, opts); }

/* ── Экспорт ── */
var LMXAnalyzer = {
  VERSION: VERSION, IDX: IDX, MANUAL_POINTS: MANUAL_POINTS, IRIS_MM: IRIS_MM,
  init: init, info: info, analyze: analyze, analyzeFile: analyzeFile,
  recompute: recompute, suggestOverrides: suggestOverrides, buildGeometry: buildGeometry
};

root.LMXAnalyzer = LMXAnalyzer;
if (typeof module !== 'undefined' && module.exports) module.exports = LMXAnalyzer;

})(typeof window !== 'undefined' ? window : this);
