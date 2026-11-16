/* ============================================================================
   LOOKSSCAN · metrics.js · v1.1
   108 метрик · 4 пиллара · калиброванный PSL-скор + покрытие/надёжность.
   Полная замена v1.0. API совместим с index.html / bot.js / console.html.

   ЧТО НОВОГО ОТНОСИТЕЛЬНО v1.0:
   · Пустой пиллар больше не обваливает скор в 1.0 — исключается из spread.
   · Покрытие: частично заполненный пиллар мягко тянется к нейтралу (5.0),
     чтобы пропуск сложных метрик не завышал результат.
   · Калибровка: монотонная кривая矫正 средней зоны и компрессия топа.
   · Опциональное доверие: opts.conf = {metricId:{p:0..1}} или {metricId:0.7}.
     Низкая уверенность тянет метрику к нейтральному тиру, а не к идеалу.
   · Результат обогащён: rawScore, calibration, reliability, per-pillar coverage.
   Все канонические таблицы баллов, идеалы, MAX/WORST и веса — без изменений.
   ============================================================================ */
(function (root) {
'use strict';

var EPS = 1e-9, INF = 1e9;
function r2(x){ return Math.round(x*100)/100; }
function clamp(x,a,b){ return Math.max(a,Math.min(b,x)); }
function num(v,d){ return (typeof v==='number'&&isFinite(v))?v:d; }

/* ─────────────────────────── ПИЛЛАРЫ ─────────────────────────── */
var PILLARS = {
  HARM: { ru:'Гармония',    base:0.32, max:389.74, worst:-409.92 },
  MISC: { ru:'Фичи',        base:0.26, max:1031,   worst:-460    },
  ANGU: { ru:'Угловатость', base:0.22, max:149.83, worst:19.03   },
  DIMO: { ru:'Диморфизм',   base:0.20, max:120,    worst:-67.44  }
};
var PENALTY_FIXED = [
  [8.0,1.00],[7.5,1.05],[7.0,1.10],[6.5,1.25],[6.0,1.45],
  [5.5,1.70],[5.0,2.00],[4.5,2.35],[4.0,2.75],[3.5,3.00],
  [3.0,3.25],[2.5,3.55],[-INF,3.85]
];
var PENALTY_RAW = [
  [8.0,1.00],[7.5,1.05],[7.0,1.10],[6.5,1.25],[6.0,1.45],
  [5.5,1.70],[5.0,2.00],[4.5,2.35],[4.0,2.75],[3.5,2.20],
  [3.0,2.70],[2.5,3.25],[-INF,3.85]
];
var SCALE = [
  [9.0,'один на миллионы'],[8.5,'один на сотни тысяч'],
  [8.0,'один на пару тысяч'],[7.5,'один на сотни'],
  [7.0,'один на сотню'],[6.5,'один на десятки'],
  [6.0,'один из 5'],[5.5,'один из 3'],
  [5.0,'среднее'],[4.5,'ниже среднего'],
  [4.0,'заметно плохо'],[3.5,'очень плохо'],
  [3.0,'крайне плохо'],[-INF,'вне шкалы']
];
/* Калибровочная кривая (raw → PSL). Монотонна, топпинг сжат, средняя зона приподнята. */
var CAL_ANCHORS = [
  [1.0,1.0],[2.5,2.8],[3.5,4.3],[4.5,5.2],[5.5,5.9],
  [6.5,6.6],[7.5,7.5],[8.5,8.4],[9.5,9.3],[10.0,9.7]
];

/* ─────────────────────── HARM · 26 КАНОН ─────────────────────── */
var HARM_CORE = [
{ id:'jawWidth', ru:'Jaw Width (bigonial/zygo)', u:'%', iM:[85,92], iF:[82,89],
  p:[20.59,18.53,10.29,6.18,-18.53,-46.32], sp:['dev',[2,5,7,11,16]], v:'F', m:'A',
  d:'ширина гонионов / ширина скул', alt:[87.5,91.5] },
{ id:'browSet', ru:'Eyebrow Setedness', u:'x', iM:[0,0.66], iF:[0.40,0.85],
  p:[19.83,17.84,9.91,5.95,-5.95,-11.90],
  sp:['abs',[[[0,0.66]],[[0.66,0.95]],[[0.95,1.20]],[[1.20,1.50]],[[1.50,1.80]],[[1.80,INF]]]],
  sf:['abs',[[[0,0.85]],[[0.85,1.20]],[[1.20,1.50]],[[1.50,1.80]],[[1.80,2.00]],[[2.00,INF]]]],
  v:'F', m:'A', d:'бровь над линией глаза, в высотах глаза (ниже = лучше)' },
{ id:'browRidge', ru:'Brow Ridge Inclination', u:'deg', iM:[13,24],
  p:[19.83,17.84,9.91,5.96,-5.96,-11.90], sp:['dev',[3,6,10,16]], v:'S', m:'Q',
  d:'наклон надбровного валика (профиль)' },
{ id:'thirds', ru:'Facial Thirds', u:'%', iM:[0,3],
  p:[19.83,17.84,9.91,5.95,-5.95,-11.90], sp:['dev',[1,2,3,4]], v:'F', m:'A',
  d:'макс. отклонение любой трети от 33%', alt:[30,36] },
{ id:'nasofrontal', ru:'Nasofrontal Angle', u:'deg', iM:[116,128],
  p:[19.06,17.16,9.53,5.72,-5.72,-34.31], sp:['dev',[4,8,14,22]], v:'S', m:'Q',
  d:'лоб → спинка носа (профиль)' },
{ id:'neckWidth', ru:'Neck Width', u:'%', iM:[90,100], iF:[75,85],
  p:[19.06,17.16,9.53,5.72,-17.16,-34.31], sp:['dev',[5,10,15,20]], v:'F', m:'A',
  d:'шея / bigonial width' },
{ id:'lowerThird', ru:'Lower Third Proportion', u:'%', iM:[0,3],
  p:[18.30,16.47,9.15,5.49,-5.49,-10.98], sp:['dev',[1,2,3,4]], v:'F', m:'A',
  d:'отклонение нижней трети от 33%', alt:[34,37] },
{ id:'fwhr', ru:'FWHR', u:'x', iM:[1.90,2.06],
  p:[18.30,16.47,9.15,5.49,-16.47,-49.41],
  sp:['abs',[[[1.90,2.06]],[[1.83,1.90],[2.06,2.13]],[[1.80,1.83],[2.13,2.16]],
             [[1.78,1.80],[2.16,2.19]],[[1.70,1.78],[2.19,2.23]],[[-INF,1.70],[2.23,INF]]]],
  v:'F', m:'A', d:'скулы / высота верхнего лица', alt:[1.95,2.05] },
{ id:'eyeAspect', ru:'Eye Aspect Ratio', u:'x', iM:[2.8,3.6], iF:[2.5,3.3],
  p:[18.30,16.47,9.15,5.49,-5.49,-10.98], sp:['dev',[0.2,0.4,0.6,0.8]], v:'F', m:'A',
  d:'длина глазной щели / высота', alt:[3.0,3.7] },
{ id:'gonial', ru:'Gonial Angle', u:'deg', iM:[115,121], iF:[125,135],
  p:[16.78,15.10,8.39,5.03,-10.07,-20.13], sp:['dev',[3,6,10,16]], v:'S', m:'Q',
  d:'угол челюсти (профиль)' },
{ id:'ramusLen', ru:'Ramus Length', u:'x', iM:[0.59,0.78],
  p:[14.41,14.41,8.01,5.80,-10.59,-20.13], sp:['dev',[0.05,0.10,0.18,0.28]], v:'S', m:'Q',
  d:'ramus / mandible (профиль)' },
{ id:'jawThirds', ru:'Thirds of Jaw', u:'%', iM:[0,3],
  p:[17.54,15.78,8.77,6.48,-3.89,-23.35], sp:['dev',[1,2,3,4]], v:'F', m:'A',
  d:'вертикальные трети челюсти: симметрия и баланс' },
{ id:'chinPhiltrum', ru:'Chin to Philtrum', u:'x', iM:[2.05,2.55], iF:[2.0,2.5],
  p:[12.96,11.67,6.48,3.89,-1.95,-3.89], sp:['dev',[0.10,0.25,0.50,1.00]], v:'F', m:'A',
  d:'подбородок / фильтрум', alt:[2.1,2.75] },
{ id:'canthal', ru:'Lateral Canthal Tilt', u:'deg', iM:[5,8.5], iF:[6,9.5],
  p:[12.35,11.12,6.18,3.71,-3.71,-7.40],
  sp:['abs',[[[5,8.5]],[[3.75,5],[8.5,9.75]],[[2.01,3.75],[9.75,11.49]],
             [[0,2.01],[11.49,INF]],[[-2,0]],[[-INF,-2]]]],
  sf:['abs',[[[6,9.5]],[[4.75,6],[9.5,10.75]],[[3.01,4.75],[10.75,12.49]],
             [[0,3.01],[12.49,INF]],[[-2,0]],[[-INF,-2]]]],
  v:'F', m:'A', d:'наклон внешний/внутренний угол глаза' },
{ id:'mouthNose', ru:'Mouth to Nose Width', u:'x', iM:[1.38,1.53], iF:[1.45,1.67],
  p:[12.35,11.12,6.18,3.71,-3.71,-7.40], sp:['dev',[0.04,0.08,0.12,0.16]], v:'F', m:'A',
  d:'ширина рта / ширина носа', alt:[1.4,1.6] },
{ id:'esr', ru:'Eye Separation Ratio', u:'%', iM:[44.3,47.7], iF:[45,47.9],
  p:[12.20,10.98,6.59,3.66,-10.98,-65.88], sp:['dev',[0.5,1.0,1.5,2.3,2.5]], v:'F', m:'A',
  d:'межзрачковое / ширина скул ×100', alt:[45,47] },
{ id:'midface', ru:'Midface Ratio', u:'x', iM:[0.93,1.01], iF:[1.0,1.1],
  p:[11.90,10.71,5.95,3.57,-3.57,-7.14], sp:['dev',[0.02,0.05,0.08,0.13]], v:'F', m:'A',
  d:'межзрачковое / высота среднего лица', alt:[0.98,1.02] },
{ id:'jfa', ru:'Jaw Frontal Angle', u:'deg', iM:[84,95], iF:[86,97],
  p:[9.15,8.24,4.58,2.75,-4.58,-9.15], sp:['dev',[3,5,10,15,20]], v:'F', m:'A',
  d:'угол между линиями мандибулы анфас', alt:[86.5,92.5] },
{ id:'cheekSet', ru:'Cheekbone Setedness', u:'%', iM:[81,100],
  p:[20,10,5,2.5,0,-2.5],
  sp:['abs',[[[81,INF]],[[76,81]],[[70,76]],[[66,70]],[[60,66]],[[-INF,60]]]],
  v:'F', m:'A', d:'высота скулы относительно midface' },
{ id:'faceLength', ru:'Face Length (TFWHR)', u:'x', iM:[1.33,1.38], iF:[1.29,1.33],
  p:[20,10,5,2.5,0,-2.5], sp:['dev',[0.05,0.08,0.10,0.12,0.16]], v:'F', m:'A',
  d:'hairline→chin / ширина скул', alt:[1.33,1.37] },
{ id:'bizygo', ru:'Bizygomatic Width', u:'mm', iM:[140,150], iF:[130,140],
  p:[20,10,5,2.5,0,-2.5], sp:['dev',[3,6,10,16]], v:'F', m:'A',
  d:'абсолютная ширина скул, калибровка по радужке 11.7 мм' },
{ id:'noseBizygo', ru:'Nose to Bizygomatic', u:'%', iM:[19,21],
  p:[7,3.75,1.88,0.94,0,-0.94], sp:['dev',[1,2,3.5,5.5]], v:'F', m:'A',
  d:'ширина носа / ширина скул ×100' },
{ id:'browTilt', ru:'Eyebrow Tilt', u:'deg', iM:[5,13], iF:[11,19],
  p:[10,5,2.5,0,-2.5,-5],
  sp:['abs',[[[5,13]],[[13,18]],[[18,23]],[[0,5],[23,INF]],[[-5,0]],[[-INF,-5]]]],
  sf:['abs',[[[11,19]],[[19,24]],[[24,29]],[[3,11],[29,INF]],[[-3,3]],[[-INF,-3]]]],
  v:'F', m:'A', d:'наклон брови к виску', alt:[6.5,11] },
{ id:'medialCanthi', ru:'Medial Canthal Angle', u:'deg', iM:[18,24],
  p:[7.5,3.75,1.88,0,-1.88,-3.75], sp:['dev',[3,6,10,16]], v:'F', m:'A',
  d:'внутренний угол глаза: острый и симметричный' },
{ id:'bitemporal', ru:'Bitemporal Width', u:'%', iM:[84,95], iF:[79,92],
  p:[7.5,3.75,1.88,0,-1.88,-3.75], sp:['dev',[3,5,8,13]], v:'F', m:'A',
  d:'ширина висков / ширина скул ×100', alt:[85,92] },
{ id:'nostrilComm', ru:'Nostril–Commisure Proportion', u:'%', iM:[31,33.5],
  p:[5,2.5,1.25,0,-1.25,-2.5], sp:['dev',[1.5,3,5,8]], v:'F', m:'A',
  d:'nostril→угол рта / высота нижней трети ×100' }
];

/* ─────────────────────── HARM · 12 ДОП ─────────────────────── */
function derived(w){ return [w,r2(w*0.9),r2(w*0.5),r2(w*0.3),r2(-w*0.3),r2(-w*0.6)]; }
var HARM_EXTRA = [
{ id:'eyeSpacing', ru:'Eye Spacing (one-eye test)', u:'x', iM:[0.95,1.05],
  p:[12.20,10.98,6.59,3.66,-10.98,-65.88], sp:['dev',[0.03,0.08,0.13,0.20]], v:'F', m:'A',
  d:'межкантусное / ширина одного глаза' },
{ id:'lipRatio', ru:'Lower : Upper Lip', u:'x', iM:[1.4,2.0],
  p:[5,2.5,1.25,0,-1.25,-2.5], sp:['dev',[0.2,0.4,0.6,0.8]], v:'F', m:'A',
  d:'высота нижней губы / верхней' },
{ id:'iaaJfa', ru:'IAA − JFA deviation', u:'deg', iM:[0,5],
  p:[7.5,3.75,1.88,0,-1.88,-3.75],
  sp:['abs',[[[0,5]],[[5,10]],[[10,15]],[[15,18]],[[18,20]],[[20,INF]]]], v:'F', m:'A',
  d:'разница угла крыла носа и угла челюсти' },
{ id:'iaa', ru:'Ipsilateral Alar Angle', u:'deg', iM:[84,95], iF:[86,97],
  p:derived(7.5), sp:['dev',[2,5,8,12]], v:'F', m:'A', der:1, d:'угол крыла носа (DERIVED)' },
{ id:'pflBizygo', ru:'PFL : Bizygomatic', u:'%', iM:[19.5,21.5],
  p:derived(10), sp:['dev',[1.5,3,5,8]], v:'F', m:'A', der:1, d:'длина глазной щели / скулы (DERIVED)' },
{ id:'eme', ru:'EME (Eye–Mouth–Eye)', u:'deg', iM:[45,49],
  p:derived(10), sp:['dev',[3,6,10,16]], v:'F', m:'A', der:1, d:'угол зрачки → центр рта (DERIVED)' },
{ id:'lowerFull', ru:'Lower / Full Face', u:'%', iM:[67,71],
  p:derived(12), sp:['dev',[3,6,10,16]], v:'F', m:'A', der:1, d:'glabella→chin / hairline→chin (DERIVED)' },
{ id:'fifths', ru:'Facial Fifths', u:'%', iM:[0,3],
  p:derived(12), sp:['dev',[2,4,7,11]], v:'F', m:'A', der:1, d:'отклонение одной из 5 ширин (DERIVED)' },
{ id:'noseHW', ru:'Nose H : W', u:'x', iM:[1.44,1.52],
  p:derived(7), sp:['dev',[0.06,0.12,0.20,0.32]], v:'F', m:'A', der:1, d:'glabella→alar / ширина носа (DERIVED)' },
{ id:'mouthBigonial', ru:'Mouth : Bigonial', u:'%', iM:[40,48],
  p:derived(10), sp:['dev',[6,12,20,32]], v:'F', m:'A', der:1, d:'ширина рта / гонионы (DERIVED)' },
{ id:'foreheadRatio', ru:'Forehead Length Ratio', u:'x', iM:[0.45,0.52],
  p:derived(7.5), sp:['dev',[0.05,0.11,0.18,0.28]], v:'F', m:'A', der:1, d:'bitemporal / hairline→glabella (DERIVED)' },
{ id:'upperLower', ru:'Upper : Lower Face', u:'x', iM:[0.90,1.00],
  p:derived(10), sp:['dev',[0.075,0.15,0.25,0.40]], v:'F', m:'A', der:1, d:'высота верхнего лица / нижнего (DERIVED)' }
];

/* ─────────────────────── MISC · 50 ─────────────────────── */
var MISC_GROUPS = [
['skin','Кожа',[
  { id:'skinClear', ru:'Чистота кожи (акне)', p:[50,25,10,5,0,-10,-20,-30], as:1, d:'нет акне и воспалений' },
  { id:'pigment', ru:'Гиперпигментация', p:[30,10,5,2,0,-5,-10,-30], as:1, d:'ровный тон, без пятен' },
  { id:'moles', ru:'Родинки', p:[10,7,5,3,1,0,-5,-10], d:'нет крупных/отвлекающих' },
  { id:'skinTex', ru:'Текстура кожи', p:[15,10,5,3,1,0,-2,-5], as:1, d:'гладкая, поры незаметны' },
  { id:'scars', ru:'Рубцы постакне', p:[15,10,5,3,1,0,-2,-5], as:1, d:'нет атрофических рубцов' },
  { id:'wrinkles', ru:'Складки и морщины', p:[40,20,10,5,2,0,-5,-15], as:1, d:'нет заломов и статики' }
]],
['eyes','Зона глаз',[
  { id:'uee', ru:'Upper Eyelid (UEE)', p:[35,20,10,5,3,0,-5,-15], d:'нет видимого верхнего века, без нависания' },
  { id:'leeShape', ru:'Форма нижнего века', p:[20,10,5,3,1,0,-3,-8], d:'прямое/слегка изогнутое, без провиса' },
  { id:'scleraShow', ru:'Sclera Show', p:[15,5,3,1,0,-5,-10,-15], as:1, d:'нет белой полосы под радужкой' },
  { id:'lashes', ru:'Ресницы', p:[15,8,4,2,0,-2,-4], d:'густые, тёмные, длинные' },
  { id:'brows', ru:'Брови (густота)', p:[30,18,9,5,2,0,-5,-15], as:1, d:'густые, длинные, тёмные' },
  { id:'periorb', ru:'Периорбит. потемнение', p:[25,10,5,0,-5,-10,-30,-50], as:1, d:'нет темноты вокруг глаз' },
  { id:'underEye', ru:'Круги под глазами', p:[15,8,4,2,0,-3,-5,-15], as:1, d:'нет кругов/мешков' },
  { id:'lee', ru:'LEE', p:[15,10,5,2,0,-5,-8], d:'нет обнажения нижнего века' },
  { id:'eyeColor', ru:'Цвет глаз', p:[10,7,5], d:'светлый' },
  { id:'scleraTri', ru:'Scleral Triangles', p:[8,4,2,1,0,-5,-10,-15], d:'равные треугольники склеры' },
  { id:'medCanthus', ru:'Medial Canthus (форма)', p:[10,5,2,0,-1], d:'опущенный, длинный, не тонкий' },
  { id:'pfl', ru:'PFL (длина щели)', p:[20,10,5,3,0,-5,-10,-15], as:1, d:'27 мм+ по iris-методу' },
  { id:'scleraCol', ru:'Цвет склеры', p:[8,4,2,0], as:1, d:'белая, без желтизны/красноты' },
  { id:'unibrow', ru:'Монобровь', p:[5,3,1,-2,-5,-10,-15,-30], as:1, d:'нет сращения' }
]],
['colour','Колорит',[
  { id:'skinTone', ru:'Тон кожи', p:[30,10,5,3,0], as:1, d:'загар, Fitzpatrick II – низ IV' },
  { id:'lipColor', ru:'Цвет губ', p:[15,10,5,3,0,-3], as:1, d:'красно-розовый' },
  { id:'lashVis', ru:'Видимость ресниц', p:[15,8,4,2,0], d:'контрастные, заметные' },
  { id:'eyeColor2', ru:'Цвет глаз (контраст)', p:[20,10,5], d:'светлый, контрастный' },
  { id:'hairColor', ru:'Цвет волос', p:[25,10,5,0], d:'тёмный' },
  { id:'browColor', ru:'Цвет бровей', p:[20,10,5,0], d:'тёмный' },
  { id:'scleraWhite', ru:'Белизна склеры', p:[10,5,0], as:1, d:'чисто белая' }
]],
['lower','Нижняя треть',[
  { id:'gonions', ru:'Gonions (flare)', p:[40,20,10,5,3,0,-5], d:'развёрнутые, читаемые' },
  { id:'chinShape', ru:'Форма подбородка', p:[30,15,8,4,2,0,-5], d:'квадратный' },
  { id:'chinWidth', ru:'Ширина подбородка', p:[25,13,7,3,0,-5], d:'широкий' },
  { id:'ramusMisc', ru:'Ramus length', p:[35,20,10,5,3,0,-5], d:'высокий' },
  { id:'mandLen', ru:'Длина мандибулы', p:[30,15,8,4,2,0,-5], d:'длинная и прямая' },
  { id:'mandShape', ru:'Форма мандибулы', p:[10,5,3,1,0,-3], d:'прямая, минимальный antegonial notch' }
]],
['lips','Губы',[
  { id:'lipWidth', ru:'Ширина губ', p:[25,12,6,3,1,0,-5], d:'широкие' },
  { id:'philtrumLen', ru:'Длина фильтрума', p:[20,10,5,3,1,0,-5], d:'короткий, не избыточный' },
  { id:'philtrumRidge', ru:'Гребни фильтрума', p:[10,5,2,0,-3], d:'выраженные' },
  { id:'lipFull', ru:'Полнота губ', p:[15,8,4,2,1,0,-5], d:'полные' },
  { id:'lipHealth', ru:'Здоровье губ', p:[15,8,4,2,1,0,-5], d:'без трещин и сухости' },
  { id:'commissures', ru:'Комиссуры', p:[10,5,2,0,-3], d:'слегка приподняты' },
  { id:'cupid', ru:'Лук Купидона', p:[10,5,2,0,-3], d:'выраженный' },
  { id:'lipSeal', ru:'Lip Seal', p:[5,3,1,0,-3], d:'ровный, по vermillion border' }
]],
['nose','Нос',[
  { id:'alarWidth', ru:'Alar Width', p:[15,8,4,2,1,0,-5], d:'не широкий' },
  { id:'bulbosity', ru:'Бульбозность', p:[20,10,5,3,1,0,-5], d:'низкая' },
  { id:'nasalTip', ru:'Кончик носа', p:[25,12,6,3,1,0,-5], d:'определённый, не опущен' },
  { id:'nostrilShow', ru:'Nostril Show', p:[20,10,5,3,1,0,-5], d:'минимальный' },
  { id:'nostrilFlare', ru:'Nostril Flare', p:[10,5,2,0,-3], d:'нет разлёта' },
  { id:'dorsum', ru:'Dorsum', p:[5,3,1,0,-3], d:'прямая спинка' },
  { id:'radix', ru:'Radix Projection', p:[15,8,4,2,1,0,-5], d:'проецирован, виден nasofrontal' }
]],
['other','Прочее',[
  { id:'ears', ru:'Уши', p:[15,8,4,0,-5,-10,-20,-40], d:'прижаты' },
  { id:'symmetry', ru:'Симметрия', p:[100,70,50,30,10,0,-10,-50], m:'A',
    sp:['abs',[[[0,2]],[[2,4]],[[4,6]],[[6,8]],[[8,11]],[[11,14]],[[14,18]],[[18,INF]]]],
    u:'%', iM:[0,2], d:'L/R асимметрия в %' }
]]
];

/* ─────────────────────── ANGU · 9 ─────────────────────── */
var ANGU = [
{ id:'mandVis', ru:'Mandible Visibility (front)', p:[24.75,21.04,17.33,13.61,9.90,6.19,3.09], d:'широкий flare, чистый контур, без жира' },
{ id:'face3d', ru:'Facial 3D-ness', p:[18.75,15.94,13.13,10.33,7.52,4.71,2.36], d:'проекция midface, глубина, поддержка орбит' },
{ id:'gonionSharp', ru:'Gonion Sharpness', p:[18.75,15.94,13.13,10.33,7.52,4.71,2.36], d:'читаемый край угла челюсти' },
{ id:'faceDepth', ru:'Facial Depth', p:[17.25,14.66,12.08,9.49,6.91,4.33,2.17], d:'передняя проекция maxilla + mandible' },
{ id:'ramusVis', ru:'Mandible & Ramus Visibility', p:[16.74,14.23,11.71,9.19,6.68,4.17,2.09], d:'высокий ramus, острый задний контур анфас' },
{ id:'ogee', ru:'Ogee Curve', p:[15.75,13.39,11.03,8.67,6.30,3.94,1.97], d:'S-кривая midface, высокая скула' },
{ id:'cheekVis', ru:'Cheekbone Visibility', p:[15.11,12.85,10.58,8.32,6.05,3.79,1.89], d:'широкие высокие малары, hollow cheeks' },
{ id:'chinAngu', ru:'Chin Angularity', p:[12.30,10.46,8.61,6.77,4.92,3.08,1.54], d:'квадратный pad, острый pogonion' },
{ id:'midFat', ru:'Lower-Midface Fat', p:[10.43,8.86,7.30,5.73,4.17,3.13,1.56], d:'минимум буккального жира' }
];

/* ─────────────────────── DIMO · 11 ─────────────────────── */
var DIMO = [
{ id:'eyeDepth', ru:'Eye Depth', p:[22.32,16.74,11.16,0,-33.48], d:'глубоко посаженные, тень орбиты' },
{ id:'browShape', ru:'Brow Ridge Shape', p:[13.44,10.08,6.72,3.36,-3.36], d:'выраженный bossing, острый край' },
{ id:'chinDimo', ru:'Chin Shape', p:[12.72,9.54,6.36,3.36,-12.72], d:'широкий квадратный, проекция вперёд' },
{ id:'buccalFat', ru:'Buccal Fat Size', p:[11.70,8.78,5.85,2.93,-2.93], d:'впадины под скулами' },
{ id:'ramusDimo', ru:'Ramus Length (front)', p:[11.53,8.65,5.77,2.88,-2.88], d:'высокий видимый ramus анфас' },
{ id:'gonionOut', ru:'Gonion Outward Growth', p:[11.04,8.28,5.52,2.76,-2.76], d:'латеральный flare, квадратный низ' },
{ id:'upperNarrow', ru:'Narrowing Upper Third', p:[9.00,6.75,4.50,2.25,-2.25], d:'верхняя треть уже средней/нижней' },
{ id:'facialHair', ru:'Facial Hair Development', p:[7.80,5.85,3.90,1.95,-1.95], d:'густая плотная щетина/борода' },
{ id:'roughSkin', ru:'Rough Skin Texture', p:[7.20,5.40,3.60,1.80,-1.80], d:'плотная зрелая мужская кожа' },
{ id:'cheekSize', ru:'Cheekbone Size', p:[6.91,5.18,3.46,1.73,-1.73], d:'крупные латеральные малары' },
{ id:'lipDimo', ru:'Lip Fullness', p:[6.34,4.75,3.17,1.58,-1.58], d:'тонкие/средние (полнота = феминно)' }
];

/* ─────────────────────────── РЕЕСТР ─────────────────────────── */
var ALL=[], BY_ID={};
function reg(m,pillar,group){
  m.pillar=pillar; m.group=group||null; m.v=m.v||'F'; m.m=m.m||'Q';
  m.u=m.u||null; m.iM=m.iM||null; m.sp=m.sp||null; m.tiers=m.p.length;
  if(BY_ID[m.id]) throw new Error('LMX: дубль id '+m.id);
  BY_ID[m.id]=m; ALL.push(m); return m;
}
HARM_CORE.forEach(function(m){ m.core=1; reg(m,'HARM','core'); });
HARM_EXTRA.forEach(function(m){ m.extra=1; reg(m,'HARM','extra'); });
MISC_GROUPS.forEach(function(g){ g[2].forEach(function(m){ m.groupRu=g[1]; reg(m,'MISC',g[0]); }); });
ANGU.forEach(function(m){ reg(m,'ANGU','angu'); });
DIMO.forEach(function(m){ reg(m,'DIMO','dimo'); });
var GROUPS_RU={};
MISC_GROUPS.forEach(function(g){ GROUPS_RU[g[0]]=g[1]; });
GROUPS_RU.core='Гармония · канон'; GROUPS_RU.extra='Гармония · доп.';
GROUPS_RU.angu='Угловатость'; GROUPS_RU.dimo='Диморфизм';

/* ─────────────────────────── ВЫБОРКИ ─────────────────────────── */
function list(pillar,opts){
  opts=opts||{};
  var view=opts.view||'F', mode=opts.mode||'any', extras=opts.extras!==false;
  return ALL.filter(function(m){
    if(pillar&&m.pillar!==pillar)return false;
    if(view==='F'&&m.v==='S')return false;
    if(mode==='A'&&m.m!=='A')return false;
    if(!extras&&m.extra)return false;
    return true;
  });
}
function idealOf(m,sex){ return (sex==='f'&&m.iF)?m.iF:m.iM; }
function specOf(m,sex){ return (sex==='f'&&m.sf)?m.sf:m.sp; }

function tierOf(m,value,sex){
  if(value==null||!isFinite(value))return null;
  var sp=specOf(m,sex); if(!sp)return null;
  if(sp[0]==='abs'){
    var tabs=sp[1];
    for(var t=0;t<tabs.length;t++){
      var rs=tabs[t];
      for(var i=0;i<rs.length;i++)
        if(value>=rs[i][0]-EPS&&value<=rs[i][1]+EPS)return Math.min(t+1,m.tiers);
    }
    return m.tiers;
  }
  if(sp[0]==='dev'){
    var band=idealOf(m,sex); if(!band)return null;
    if(value>=band[0]-EPS&&value<=band[1]+EPS)return 1;
    var d=value<band[0]?band[0]-value:value-band[1], th=sp[1];
    for(var k=0;k<th.length;k++)if(d<=th[k]+EPS)return Math.min(k+2,m.tiers);
    return m.tiers;
  }
  return null;
}
function evaluate(m,value,sex){
  var band=idealOf(m,sex), dev=null;
  if(band&&value!=null&&isFinite(value))
    dev=value<band[0]?band[0]-value:(value>band[1]?value-band[1]:0);
  var t=tierOf(m,value,sex);
  return { id:m.id, ru:m.ru, value:value, unit:m.u, ideal:band,
    deviation:dev==null?null:r2(dev), tier:t, points:t?m.p[t-1]:null, max:m.p[0] };
}
function autoTiers(geometry,opts){
  opts=opts||{}; var sex=opts.sex||'m', out={}, detail={};
  list(null,opts).forEach(function(m){
    if(m.m!=='A'||!m.sp)return;
    var v=geometry[m.id]; if(v==null)return;
    var t=tierOf(m,v,sex);
    if(t){ out[m.id]=t; detail[m.id]=evaluate(m,v,sex); }
  });
  return { tiers:out, detail:detail };
}

/* ─────────────────────────── ДОВЕРИЕ ─────────────────────────── */
function confFor(id,opts){
  if(!opts||opts.confidence===false||!opts.conf)return 1;
  var c=opts.conf[id];
  if(c==null)return 1;
  if(typeof c==='number')return clamp(c,0,1);
  if(c.src==='unsure')return 0;
  return clamp(num(c.p,1),0,1);
}
function neutralTier(m){ return Math.ceil(m.tiers/2); }

/* ─────────────────────────── ПИЛЛАР ─────────────────────────── */
function pillarStats(pillar,answers,opts){
  opts=opts||{};
  var rows=list(pillar,opts), prior=num(opts.prior,5);
  var raw=0,max=0,worst=0,used=0,missing=[];
  var imp=0,usedImp=0,confSum=0;
  rows.forEach(function(m){
    var importance=Math.max(0.0001,m.p[0]);
    imp+=importance;
    var t=answers[m.id];
    if(t==null){
      if(opts.missing==='worst'){ t=m.tiers; }
      else if(opts.missing==='mid'){ t=neutralTier(m); }
      else { missing.push(m.id); return; }
    }
    t=clamp(Math.round(t),1,m.tiers);
    var cf=confFor(m.id,opts), pts=m.p[t-1];
    var neutral=m.p[neutralTier(m)-1];
    var eff=(opts.confidence===false)?pts:neutral+(pts-neutral)*cf;
    raw+=eff; max+=m.p[0]; worst+=m.p[m.tiers-1];
    used++; confSum+=cf; usedImp+=importance*cf;
  });
  var present=used>0, span=max-worst;
  var pctBase=(present&&span>0)?clamp((raw-worst)/span*100,0,100):null;
  var coverage=imp>0?clamp(usedImp/imp,0,1):0;
  var s10Base=present?pctBase/10:prior;
  var shrink=(opts.coverageShrink===false)?1:(0.45+0.55*coverage);
  var s10=present?prior+(s10Base-prior)*shrink:prior;
  return {
    pillar:pillar, ru:PILLARS[pillar].ru, base:PILLARS[pillar].base,
    raw:r2(raw), max:r2(max), worst:r2(worst),
    pctBase:pctBase==null?null:r2(pctBase), pct:r2(s10*10), s10:r2(s10), s10Base:r2(s10Base),
    used:used, total:rows.length, missing:missing,
    coverage:r2(coverage), coveragePct:Math.round(coverage*100),
    usedImportance:r2(usedImp), importance:r2(imp),
    avgConfidence:used?r2(confSum/used):0,
    present:present, shrink:r2(shrink)
  };
}
function factorFor(s10,mode){
  var tab=mode==='raw'?PENALTY_RAW:PENALTY_FIXED;
  for(var i=0;i<tab.length;i++)if(s10>=tab[i][0])return tab[i][1];
  return tab[tab.length-1][1];
}

/* ─────────────────────────── КАЛИБРОВКА ─────────────────────────── */
function calibrateScore(raw,opts){
  opts=opts||{};
  if(opts.calibrate===false)return r2(raw);
  var anchors=(opts.calibration&&opts.calibration.anchors)||opts.calibration||CAL_ANCHORS;
  if(!Array.isArray(anchors)||anchors.length<2)anchors=CAL_ANCHORS;
  var strength=clamp(num(opts.calStrength,0.75),0,1);
  var x=clamp(raw,anchors[0][0],anchors[anchors.length-1][0]);
  var y=x;
  for(var i=0;i<anchors.length-1;i++){
    var a=anchors[i],b=anchors[i+1];
    if(x>=a[0]&&x<=b[0]){ var u=(x-a[0])/(b[0]-a[0]||1); y=a[1]+(b[1]-a[1])*u; break; }
  }
  return r2(x+(y-x)*strength);
}

/* ─────────────────────────── ФИНАЛ ─────────────────────────── */
function compute(answers,opts){
  opts=opts||{};
  var keys=['HARM','MISC','ANGU','DIMO'], stats={}, present=[];
  keys.forEach(function(k){ stats[k]=pillarStats(k,answers,opts); if(stats[k].present)present.push(k); });
  var prior=num(opts.prior,5), weights={}, score, penalty=0;
  keys.forEach(function(k){ weights[k]=0; });

  if(!present.length){
    keys.forEach(function(k){ stats[k].weight=0; stats[k].contrib=0; stats[k].factor=1; });
    return {
      score:r2(prior), rawScore:r2(prior), band:bandOf(prior), pillars:stats,
      spread:0, penalty:0, formula:opts.formula||'gudlifer', penaltyMode:opts.penalty||'fixed',
      weakest:null, strongest:null, coverage:0, total:list(null,opts).length,
      calibration:{applied:false,delta:0,strength:num(opts.calStrength,0.75)},
      reliability:{coverage:0,coveragePct:0,confidence:0,present:0,warnings:['Нет заполненных метрик — показан нейтральный скор']}
    };
  }

  var s10s=present.map(function(k){return stats[k].s10;});
  var lo=Math.min.apply(null,s10s), hi=Math.max.apply(null,s10s);
  var formula=opts.formula||'gudlifer';

  if(formula==='larry'){
    var wsum=0, wbase=0;
    present.forEach(function(k){ wbase+=(opts.weights&&opts.weights[k])||PILLARS[k].base; });
    present.forEach(function(k){
      var w=((opts.weights&&opts.weights[k])||PILLARS[k].base)/wbase;
      weights[k]=w; wsum+=stats[k].s10*w;
    });
    penalty=(hi-lo)*0.1; score=wsum-penalty;
  } else {
    var pen={}, total=0, noAdj=lo>=8.0;
    present.forEach(function(k){
      var b=(opts.weights&&opts.weights[k])||PILLARS[k].base;
      var f=noAdj?1:factorFor(stats[k].s10,opts.penalty);
      stats[k].factor=f;
      pen[k]=Math.max(0.0001,stats[k].s10)*b*f;
      total+=pen[k];
    });
    present.forEach(function(k){ weights[k]=pen[k]/total; });
    score=0; present.forEach(function(k){ score+=stats[k].s10*weights[k]; });
  }

  var totalImp=0, usedImp=0, confSum=0, usedTotal=0;
  keys.forEach(function(k){
    totalImp+=stats[k].importance; usedImp+=stats[k].usedImportance;
    confSum+=stats[k].avgConfidence*stats[k].used; usedTotal+=stats[k].used;
  });
  var globalCov=totalImp>0?clamp(usedImp/totalImp,0,1):0;
  if(opts.coverageShrink!==false) score=prior+(score-prior)*(0.85+0.15*globalCov);

  var rawScore=r2(clamp(score,1,10));
  var calibrated=opts.calibrate!==false;
  score=calibrateScore(rawScore,opts);
  score=clamp(score,1,10);

  keys.forEach(function(k){
    stats[k].weight=r2(weights[k]);
    stats[k].contrib=r2(stats[k].s10*weights[k]);
    if(!stats[k].present)stats[k].factor=1;
  });

  var weakest=present.reduce(function(a,b){return stats[a].s10<=stats[b].s10?a:b;});
  var strongest=present.reduce(function(a,b){return stats[a].s10>=stats[b].s10?a:b;});
  var warnings=[];
  if(globalCov<0.7)warnings.push('Низкое покрытие ('+Math.round(globalCov*100)+'%) — скор менее надёжен');
  if(hi-lo>3)warnings.push('Большой разброс пилларов ('+r2(hi-lo)+') — есть выраженный短板');
  var avgConf=usedTotal?confSum/usedTotal:0;
  if(avgConf<0.6)warnings.push('Низкая средняя уверенность оценок');

  return {
    score:r2(score), rawScore:rawScore, band:bandOf(score), pillars:stats,
    spread:r2(hi-lo), penalty:r2(penalty),
    formula:formula, penaltyMode:opts.penalty||'fixed',
    weakest:weakest, strongest:strongest,
    coverage:keys.reduce(function(n,k){return n+stats[k].used;},0),
    total:list(null,opts).length,
    calibration:{applied:calibrated,delta:r2(score-rawScore),strength:num(opts.calStrength,0.75)},
    reliability:{coverage:r2(globalCov),coveragePct:Math.round(globalCov*100),confidence:r2(avgConf),present:present.length,warnings:warnings}
  };
}
function bandOf(score){
  for(var i=0;i<SCALE.length;i++)if(score>=SCALE[i][0])return SCALE[i][1];
  return SCALE[SCALE.length-1][1];
}
function worstMetrics(answers,opts,n){
  var out=[];
  list(null,opts).forEach(function(m){
    var t=answers[m.id]; if(t==null)return;
    var loss=m.p[0]-m.p[t-1], cf=confFor(m.id,opts);
    if(loss>0)out.push({id:m.id,ru:m.ru,pillar:m.pillar,tier:t,loss:r2(loss),confidence:cf});
  });
  out.sort(function(a,b){return b.loss-a.loss;});
  return out.slice(0,n||5);
}
function reliability(answers,opts){
  opts=opts||{};
  var keys=['HARM','MISC','ANGU','DIMO'], stats={}, imp=0, usedImp=0, conf=0, used=0;
  keys.forEach(function(k){
    stats[k]=pillarStats(k,answers,opts);
    imp+=stats[k].importance; usedImp+=stats[k].usedImportance;
    conf+=stats[k].avgConfidence*stats[k].used; used+=stats[k].used;
  });
  var cov=imp>0?usedImp/imp:0;
  return {coverage:r2(cov),coveragePct:Math.round(cov*100),confidence:used?r2(conf/used):0,pillars:stats};
}

/* ─────────────────────────── САМОПРОВЕРКА ─────────────────────────── */
function selftest(){
  var res={}, ok=true;
  ['HARM','MISC','ANGU','DIMO'].forEach(function(k){
    var rows=ALL.filter(function(m){return m.pillar===k&&(k!=='HARM'||m.core);});
    var mx=r2(rows.reduce(function(s,m){return s+m.p[0];},0));
    var wo=r2(rows.reduce(function(s,m){return s+m.p[m.tiers-1];},0));
    var pass=Math.abs(mx-PILLARS[k].max)<0.02&&Math.abs(wo-PILLARS[k].worst)<0.02;
    if(!pass)ok=false;
    res[k]={n:rows.length,max:mx,worst:wo,expect:[PILLARS[k].max,PILLARS[k].worst],ok:pass};
  });
  var ideal={}, mid={};
  list(null,{}).forEach(function(m){ ideal[m.id]=1; mid[m.id]=neutralTier(m); });
  var empty=compute({},{}), perfect=compute(ideal,{}), average=compute(mid,{});
  var calOk=true, prev=-1;
  for(var x=1;x<=10.001;x+=0.1){ var y=calibrateScore(x,{}); if(y<prev-0.001)calOk=false; prev=y; }
  var checks={
    emptyNeutral:empty.score>=4&&empty.score<=6&&empty.coverage===0,
    perfectHigh:perfect.score>=9&&perfect.score<=9.8,
    averageMid:average.score>=3.5&&average.score<=6.5,
    calibrationMonotone:calOk
  };
  Object.keys(checks).forEach(function(k){ if(!checks[k])ok=false; });
  res.total=ALL.length;
  res.frontalAuto=list(null,{view:'F',mode:'A'}).length;
  res.checks=checks; res.ok=ok;
  return res;
}

/* ─────────────────────────── EXPORT ─────────────────────────── */
var LMX={
  VERSION:'1.1',
  PILLARS:PILLARS, SCALE:SCALE, GROUPS_RU:GROUPS_RU, CAL_ANCHORS:CAL_ANCHORS,
  ALL:ALL, byId:BY_ID,
  list:list, idealOf:idealOf, tierOf:tierOf, evaluate:evaluate, autoTiers:autoTiers,
  pillarStats:pillarStats, factorFor:factorFor, calibrateScore:calibrateScore,
  compute:compute, bandOf:bandOf, worstMetrics:worstMetrics, reliability:reliability,
  selftest:selftest
};
root.LMX=LMX;
if(typeof module!=='undefined'&&module.exports)module.exports=LMX;

})(typeof window!=='undefined'?window:this);
