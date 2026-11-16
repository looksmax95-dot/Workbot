/* ============================================================================
   LOOKSSCAN · inspector.js · v1.0
   Инспектор замера: тап по любой метрике → как именно она измерялась.
   Подключение: <script src="inspector.js"></script>  (после metrics/analyzer)
   Ноль правок в index.html: мост через мягкий патч LMXAnalyzer + LMX.autoTiers.
   Без фото работает как схема метода (синтетический анфас), числа не выдумывает.
   ============================================================================ */
(function (root) {
'use strict';
if (root.LMXInspector) return;
var L = root.LMX, A = root.LMXAnalyzer;
var VERSION = '1.0';
var INF = 1e9;

/* ─────────────── utils ─────────────── */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function r2(x){return Math.round(x*100)/100}
function r1(x){return Math.round(x*10)/10}
function cl(x,a,b){return Math.max(a,Math.min(b,x))}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function vdist(a,b){return Math.abs(a.y-b.y)}
function hdist(a,b){return Math.abs(a.x-b.x)}
function mid(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
function angAt(v,p,q){var a={x:p.x-v.x,y:p.y-v.y},b={x:q.x-v.x,y:q.y-v.y};
  var na=Math.hypot(a.x,a.y),nb=Math.hypot(b.x,b.y);if(!na||!nb)return 0;
  return Math.acos(cl((a.x*b.x+a.y*b.y)/(na*nb),-1,1))*180/Math.PI}
function tiltOf(i,o){return Math.atan2(i.y-o.y,Math.abs(o.x-i.x))*180/Math.PI}
function ctr(ps){var x=0,y=0;ps.forEach(function(p){x+=p.x;y+=p.y});return{x:x/ps.length,y:y/ps.length}}
function rot(p,c,a){var co=Math.cos(a),si=Math.sin(a),x=p.x-c.x,y=p.y-c.y;
  return{x:c.x+x*co-y*si,y:c.y+x*si+y*co}}
function fmtV(v,u){if(v==null||!isFinite(v))return '—';
  return u==='%'?r2(v)+'%':u==='deg'?r1(v)+'°':u==='mm'?r1(v)+' мм':u==='px'?r1(v)+' px':r2(v)+'×'}

/* ─────────────── palette ─────────────── */
var ACCENTS=[['cyan','#2DD4FF'],['mint','#00E5C0'],['violet','#A78BFA'],['amber','#FFB627'],['magenta','#FF3D8B']];
var TIERC=['#00E5C0','#5FE3A1','#B8E04A','#FFB627','#FF8A3D','#FF4757','#D62246','#8E1230'];
function tierC(t){return TIERC[cl((t||4)-1,0,7)]}
function pillarC(p){return{HARM:'#00E5C0',MISC:'#A78BFA',ANGU:'#FFB627',DIMO:'#FF3D8B'}[p]||'#2DD4FF'}

/* ─────────────── sound ─────────────── */
var LS='looksscan.v3', AC=null, SND=true;
try{var sv=JSON.parse(localStorage.getItem(LS)||'null');if(sv&&sv.cfg&&typeof sv.cfg.sound==='boolean')SND=sv.cfg.sound}catch(e){}
function ac(){if(!AC){try{AC=new(root.AudioContext||root.webkitAudioContext)()}catch(e){}}if(AC&&AC.state==='suspended')AC.resume();return AC}
function beep(f,d,v,f2){if(!SND)return;var c=ac();if(!c)return;
  var o=c.createOscillator(),g=c.createGain(),fl=c.createBiquadFilter(),t=c.currentTime;
  o.type='sine';fl.type='lowpass';fl.frequency.value=3400;o.frequency.setValueAtTime(f,t);
  if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v||.03,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(fl);fl.connect(g);g.connect(c.destination);o.start(t);o.stop(t+d+.03)}
function sfx(k){if(k==='open')beep(560,.13,.032,880);else if(k==='nav')beep(760,.06,.026,1020);
  else if(k==='pick')beep(980,.07,.03,1320);else if(k==='off')beep(420,.1,.024,260);
  else if(k==='ok'){beep(680,.12,.032);setTimeout(function(){beep(1020,.16,.028)},80)}}
function setSound(on){SND=on;try{var s=JSON.parse(localStorage.getItem(LS)||'{}');s.cfg=s.cfg||{};s.cfg.sound=on;
  localStorage.setItem(LS,JSON.stringify(s))}catch(e){}}
function hap(){try{var T=root.Telegram&&root.Telegram.WebApp;if(T&&T.HapticFeedback)T.HapticFeedback.selectionChanged();
  else if(navigator.vibrate)navigator.vibrate(7)}catch(e){}}

/* ─────────────── landmarks / names ─────────────── */
var LMI={hairline:10,glabella:9,subnasale:2,menton:152,
  eyeLouter:33,eyeLinner:133,eyeLupper:159,eyeLlower:145,
  eyeRouter:263,eyeRinner:362,eyeRupper:386,eyeRlower:374,
  browLinner:107,browLouter:70,browLlower:55,browRinner:334,browRouter:300,browRlower:285,
  alarL:64,alarR:294,noseTip:1,mouthL:61,mouthR:291,lipUT:0,lipUB:13,lipLT:14,lipLB:17,
  zygoL:234,zygoR:454,gonionL:172,gonionR:397,temporalL:127,temporalR:356};
var IRA=[468,469,470,471,472],IRB=[473,474,475,476,477];
var OV={hairline:'hairline',zygoL:'zygoL',zygoR:'zygoR',gonionL:'gonionL',gonionR:'gonionR',
  temporalL:'temporalL',temporalR:'temporalR',neckL:'neckL',neckR:'neckR'};
var ANAT={hairline:'Trichion · линия волос',glabella:'Glabella · межбровье',subnasale:'Subnasale · база носа',
  menton:'Menton · низ подбородка',zygoL:'Zygion L · скула L',zygoR:'Zygion R · скула R',
  gonionL:'Gonion L · угол челюсти L',gonionR:'Gonion R · угол челюсти R',
  temporalL:'Temporal ridge L · висок L',temporalR:'Temporal ridge R · висок R',
  neckL:'Neck border L · шея L',neckR:'Neck border R · шея R',
  irisL:'Pupil center L · зрачок L',irisR:'Pupil center R · зрачок R',
  eyeLouter:'Exocanthion L · внешний угол L',eyeLinner:'Endocanthion L · внутренний угол L',
  eyeLupper:'Palpebrale sup. L · верх века L',eyeLlower:'Palpebrale inf. L · низ века L',
  eyeRouter:'Exocanthion R · внешний угол R',eyeRinner:'Endocanthion R · внутренний угол R',
  eyeRupper:'Palpebrale sup. R · верх века R',eyeRlower:'Palpebrale inf. R · низ века R',
  browLinner:'Medial brow L',browLouter:'Lateral brow L',browLlower:'Superciliare inf. L',
  browRinner:'Medial brow R',browRouter:'Lateral brow R',browRlower:'Superciliare inf. R',
  alarL:'Alare L · крыло носа L',alarR:'Alare R · крыло носа R',noseTip:'Pronasale · кончик носа',
  mouthL:'Cheilion L · угол рта L',mouthR:'Cheilion R · угол рта R',mouthC:'Stomion · центр рта',
  lipUT:'Labiale superius · верх губы',lipUB:'Vermilion upper · граница верха',
  lipLT:'Vermilion lower · граница низа',lipLB:'Labiale inferius · низ губы'};

/* синтетический анфас — только схема, без чисел */
var SYN=(function(){var W=420,H=540,cx=210,p={};
  function s(k,x,y){p[k]={x:cx+x,y:y}}
  s('hairline',0,58);s('glabella',0,168);s('subnasale',0,330);s('menton',0,470);
  s('zygoL',-150,232);s('zygoR',150,232);s('gonionL',-124,392);s('gonionR',124,392);
  s('temporalL',-128,140);s('temporalR',128,140);s('neckL',-104,520);s('neckR',104,520);
  s('irisL',-62,214);s('irisR',62,214);
  s('eyeLouter',-96,216);s('eyeLinner',-30,212);s('eyeLupper',-63,203);s('eyeLlower',-63,225);
  s('eyeRouter',96,216);s('eyeRinner',30,212);s('eyeRupper',63,203);s('eyeRlower',63,225);
  s('browLinner',-32,182);s('browLouter',-100,176);s('browLlower',-66,186);
  s('browRinner',32,182);s('browRouter',100,176);s('browRlower',66,186);
  s('alarL',-34,326);s('alarR',34,326);s('noseTip',0,314);
  s('mouthL',-52,384);s('mouthR',52,384);s('mouthC',0,384);
  s('lipUT',0,372);s('lipUB',0,382);s('lipLT',0,388);s('lipLB',0,404);
  return{W:W,H:H,p:p}})();

/* ─────────────── bridge ─────────────── */
var D={img:null,src:null,url:null,lm:null,ov:null,geo:null,meta:null,w:0,h:0,srcKind:null};
var ANS={};
function grabGeo(g,kind){if(!g)return;D.geo=g;if(!D.lm)D.srcKind=kind||'geometry'}
function grabRes(res,lm,ov){
  if(lm)D.lm=lm; if(ov)D.ov=ov;
  if(res&&res.geometry)D.geo=res.geometry;
  if(res&&res.meta)D.meta=res.meta;
  if(res&&res.width){D.w=res.width;D.h=res.height}
  D.srcKind='photo';
}
function loadImg(src){
  if(!src)return;
  var key=(typeof src==='string')?src:(src.name+'|'+src.size+'|'+(src.lastModified||0));
  if(D.src===key&&D.img)return;
  if(D.url){try{URL.revokeObjectURL(D.url)}catch(e){}D.url=null}
  D.src=key;D.img=null;
  var u=(typeof src==='string')?src:URL.createObjectURL(src);
  if(typeof src!=='string')D.url=u;
  var im=new Image();im.onload=function(){D.img=im;if(!D.w){D.w=im.naturalWidth;D.h=im.naturalHeight}redraw()};im.src=u;
}
function bridge(){
  if(A&&!A.__miPatched){
    A.__miPatched=true;
    var oa=A.analyze;
    if(oa)A.analyze=function(src,o){var p=oa.apply(A,arguments);
      try{loadImg(src)}catch(e){}
      return Promise.resolve(p).then(function(res){grabRes(res,res.landmarks,res.overrides);return res})};
    var or=A.recompute;
    if(or)A.recompute=function(lm,ov,o){var r=or.apply(A,arguments);grabRes(r,lm,ov);return r};
  }
  if(L&&!L.__miPatched){
    L.__miPatched=true;
    var at=L.autoTiers;
    if(at)L.autoTiers=function(g,o){var r=at.apply(L,arguments);grabGeo(g,'geometry');
      if(r&&r.tiers)Object.keys(r.tiers).forEach(function(k){ANS[k]=r.tiers[k]});return r};
    var cp=L.compute;
    if(cp)L.compute=function(ans,o){if(ans)Object.keys(ans).forEach(function(k){ANS[k]=ans[k]});return cp.apply(L,arguments)};
  }
}

/* ─────────────── points in measurement space ─────────────── */
var ALIGN=true;
function rollRad(){if(!D.lm)return 0;var a=ctr(IRA.map(function(i){return D.lm[i]}).filter(Boolean)),
  b=ctr(IRB.map(function(i){return D.lm[i]}).filter(Boolean));
  if(!a||!b||!isFinite(a.x)||!isFinite(b.x))return 0;return Math.atan2(b.y-a.y,b.x-a.x)}
function rawPts(){
  var out={};
  if(D.lm){
    Object.keys(LMI).forEach(function(k){var p=D.lm[LMI[k]];if(p)out[k]={x:p.x,y:p.y}});
    var a=ctr(IRA.map(function(i){return D.lm[i]}).filter(Boolean)),b=ctr(IRB.map(function(i){return D.lm[i]}).filter(Boolean));
    if(a&&isFinite(a.x)&&b&&isFinite(b.x)){if(a.x<b.x){out.irisL=a;out.irisR=b}else{out.irisL=b;out.irisR=a}}
    if(D.ov)Object.keys(OV).forEach(function(k){if(D.ov[k])out[OV[k]]={x:D.ov[k].x,y:D.ov[k].y}});
    if(out.mouthL&&out.mouthR)out.mouthC=mid(out.mouthL,out.mouthR);
  }else{Object.keys(SYN.p).forEach(function(k){out[k]={x:SYN.p[k].x,y:SYN.p[k].y}})}
  return out;
}
function pts(){
  var p=rawPts();
  if(D.lm&&ALIGN){var rr=rollRad();if(Math.abs(rr)>1e-4){
    var c=ctr(Object.keys(p).map(function(k){return p[k]}));
    Object.keys(p).forEach(function(k){p[k]=rot(p[k],c,-rr)})}}
  return p;
}
function meshPts(){
  if(!D.lm)return null;
  var rr=(ALIGN?rollRad():0),c=null,out=[];
  if(Math.abs(rr)>1e-4)c=ctr(D.lm.filter(Boolean));
  for(var i=0;i<D.lm.length;i+=2){var q=D.lm[i];if(!q)continue;
    out.push(c?rot(q,c,-rr):q)}
  return out;
}
function mmPerPx(){return D.meta&&D.meta.mmPerPx?D.meta.mmPerPx:null}

/* ─────────────── recipes ─────────────── */
function S_(a,b,l){return{t:'seg',a:a,b:b,l:l}}
function V_(a,b,l){return{t:'v',a:a,b:b,l:l}}
function H_(a,b,l){return{t:'h',a:a,b:b,l:l}}
function AN_(v,a,b,l){return{t:'ang',v:v,a:a,b:b,l:l}}
function TL_(i,o,l){return{t:'tilt',i:i,o:o,l:l}}
function PT_(k,l){return{t:'pt',a:k,l:l}}
var R={};
function ratio(id,num,den,mul,unit,method,extra){R[id]={kind:'ratio',num:num,den:den,mul:mul||1,unit:unit||'x',method:method,extra:extra||[]}}
function angle(id,a,method,extra){R[id]={kind:'angle',ang:a,unit:'deg',method:method,extra:extra||[]}}

ratio('jawWidth',H_('gonionL','gonionR','Bigonial width'),H_('zygoL','zygoR','Bizygomatic width'),100,'%',
  'Ширина челюсти между гонионами делится на ширину скул. Обе ширины — горизонтальные проекции, замер после выравнивания по зрачкам.');
ratio('browSet',{t:'avg2',parts:[V_('browLlower','eyeLupper','L gap'),V_('eyeLupper','eyeLlower','L eye height')]},
  {t:'avg2b',parts:[V_('browRlower','eyeRupper','R gap'),V_('eyeRupper','eyeRlower','R eye height')]},1,'x',
  'Расстояние от нижней точки брови до верхнего века, выраженное в высотах глаза. Считается по обоим глазам и усредняется. Меньше = брови ниже = маскулиннее.');
ratio('thirds',{t:'thirdsNum'},V_('hairline','menton','Full face height'),1,'%',
  'Лицо делится на три вертикальные части: hairline→glabella, glabella→subnasale, subnasale→menton. Метрика — максимальное отклонение любой трети от 33.33%.',
  [V_('hairline','glabella','Upper third'),V_('glabella','subnasale','Mid third'),V_('subnasale','menton','Lower third')]);
ratio('lowerThird',{t:'lowerDev'},V_('hairline','menton','Full face height'),1,'%',
  'Нижняя треть (subnasale→menton) как доля полной высоты лица, затем отклонение от 33.33%.',
  [V_('subnasale','menton','Lower third'),V_('hairline','glabella','Upper third'),V_('glabella','subnasale','Mid third')]);
ratio('neckWidth',H_('neckL','neckR','Neck width'),H_('gonionL','gonionR','Bigonial width'),100,'%',
  'Ширина шеи под челюстью relative к ширине гонионов. Точки шеи ставятся вручную — AI их не видит.');
ratio('fwhr',S_('zygoL','zygoR','Bizygomatic width'),V_('glabella','lipUT','Upper face height'),1,'x',
  'Ключевая метрика: евклидова ширина скул делится на строго вертикальную высоту верхнего лица (glabella → верхняя точка верхней губы).');
ratio('eyeAspect',{t:'avg',parts:[S_('eyeLouter','eyeLinner','PFL L'),S_('eyeRouter','eyeRinner','PFL R')]},
  {t:'avg',parts:[V_('eyeLupper','eyeLlower','Eye height L'),V_('eyeRupper','eyeRlower','Eye height R')]},1,'x',
  'Длина глазной щели (exocanthion→endocanthion) делится на высоту раскрытия глаза. Обе величины усредняются по двум глазам.');
ratio('jawThirds',{t:'jawDev'},V_('subnasale','menton','Lower third height'),1,'%',
  'Нижняя треть делится на три отрезка: фильтрум, высота рта, подбородок. Метрика — максимальное отклонение от 33.33% нижней трети.',
  [V_('subnasale','lipUT','Philtrum'),V_('lipUT','lipLB','Mouth block'),V_('lipLB','menton','Chin')]);
ratio('chinPhiltrum',V_('lipLB','menton','Chin height'),V_('subnasale','lipUT','Philtrum height'),1,'x',
  'Высота подбородка (низ нижней губы → menton) делится на высоту фильтрума (база носа → верх верхней губы).');
R.canthal={kind:'avg',unit:'deg',parts:[TL_('eyeLinner','eyeLouter','Tilt L'),TL_('eyeRinner','eyeRouter','Tilt R')],
  method:'Угол между горизонталью и линией внутренний→внешний угол глаза. Положительный наклон = внешний угол выше. Усредняется по двум глазам. Нейтраль (0…2°) — уже T4.'};
ratio('mouthNose',H_('mouthL','mouthR','Mouth width'),H_('alarL','alarR','Nose width'),1,'x',
  'Ширина рта между хейлионами делится на ширину носа между аларами.');
ratio('esr',S_('irisL','irisR','Interpupillary distance'),S_('zygoL','zygoR','Bizygomatic width'),100,'%',
  'Межзрачковое расстояние делится на ширину скул. Центры зрачков берутся как центроиды колец радужки MediaPipe (индексы 468–477).');
ratio('midface',S_('irisL','irisR','Interpupillary distance'),V_('glabella','lipUT','Midface height'),1,'x',
  'Межзрачковое расстояние делится на высоту среднего лица. Чем компактнее средняя зона, тем ниже значение.');
angle('jfa',AN_('menton','gonionL','gonionR','Jaw frontal angle'),
  'Угол при вершине menton между лучами на левый и правый гонион. Показывает, насколько челюсть расходится в стороны анфас.');
ratio('cheekSet',{t:'cheekNum'},V_('glabella','subnasale','Midface height'),100,'%',
  'Насколько высоко стоят скулы: вертикальная дистанция от линии скул до базы носа, как доля высоты среднего лица.',
  [H_('zygoL','zygoR','Zygion line')]);
ratio('faceLength',V_('hairline','menton','Full face height'),S_('zygoL','zygoR','Bizygomatic width'),1,'x',
  'TFWHR: полная высота лица от линии волос до подбородка делится на ширину скул.');
R.bizygo={kind:'mm',seg:S_('zygoL','zygoR','Bizygomatic width'),unit:'mm',
  method:'Абсолютная ширина скул в миллиметрах. Калибровка: средняя радужка человека ≈ 11.7 мм, MediaPipe даёт её диаметр в пикселях → мм/px. Ползунок «Калибровка радужки» в инспекторе меняет эталон.'};
ratio('noseBizygo',H_('alarL','alarR','Nose width'),S_('zygoL','zygoR','Bizygomatic width'),100,'%',
  'Ширина носа как процент от ширины скул. Идеал около 20% — то есть нос в 4 раза уже лица.');
R.browTilt={kind:'avg',unit:'deg',parts:[TL_('browLinner','browLouter','Brow tilt L'),TL_('browRinner','browRouter','Brow tilt R')],
  method:'Наклон брови от медиальной точки к латеральной, относительно горизонтали. Усредняется по двум бровям.'};
R.medialCanthi={kind:'avg',unit:'deg',parts:[AN_('eyeLinner','eyeLupper','eyeLlower','Medial angle L'),AN_('eyeRinner','eyeRupper','eyeRlower','Medial angle R')],
  method:'Угол при внутреннем уголке глаза между верхним и нижним веком. Острый и симметричный угол читается лучше.'};
ratio('bitemporal',H_('temporalL','temporalR','Bitemporal width'),S_('zygoL','zygoR','Bizygomatic width'),100,'%',
  'Ширина висков делится на ширину скул. Показывает сужение верхней трети относительно средней.');
ratio('nostrilComm',V_('subnasale','mouthC','Nostril → stomion'),V_('subnasale','menton','Lower third height'),100,'%',
  'Вертикальная дистанция от базы носа до центра рта как доля нижней трети лица.');
ratio('eyeSpacing',S_('eyeLinner','eyeRinner','Intercanthal distance'),
  {t:'avg',parts:[S_('eyeLouter','eyeLinner','PFL L'),S_('eyeRouter','eyeRinner','PFL R')]},1,'x',
  'Тест одного глаза: расстояние между внутренними уголками делится на ширину одного глаза. Идеал ≈ 1.0 — между глазами помещается ровно один глаз.');
ratio('lipRatio',V_('lipLT','lipLB','Lower lip height'),V_('lipUT','lipUB','Upper lip height'),1,'x',
  'Высота нижней губы делится на высоту верхней. Идеал 1.4–2.0: нижняя заметно полнее.');
angle('iaa',AN_('alarL','subnasale','gonionL','IAA L'),
  'Угол крыла носа: при вершине alare между лучами на базу носа и гонион той же стороны. В движке усредняется с правой стороной.',
  [AN_('alarR','subnasale','gonionR','IAA R')]);
R.iaaJfa={kind:'diff',unit:'deg',a:AN_('alarL','subnasale','gonionL','IAA'),b:AN_('menton','gonionL','gonionR','JFA'),
  method:'Модуль разницы между углом крыла носа и фронтальным углом челюсти. Линии должны быть почти параллельны — идеал 0–5°.'};
ratio('pflBizygo',{t:'avg',parts:[S_('eyeLouter','eyeLinner','PFL L'),S_('eyeRouter','eyeRinner','PFL R')]},
  S_('zygoL','zygoR','Bizygomatic width'),100,'%',
  'Длина глазной щели как процент от ширины скул. Показывает, насколько глаза крупные relative к лицу.');
angle('eme',AN_('mouthC','irisL','irisR','EME'),
  'Угол при центре рта между лучами на оба зрачка. Узкий треугольник = компактное лицо, широкий = растянутое.');
ratio('lowerFull',V_('glabella','menton','Glabella → menton'),V_('hairline','menton','Full face height'),100,'%',
  'Доля лица ниже межбровья: glabella→menton делится на полную высоту лица.');
R.fifths={kind:'fifths',unit:'%',
  method:'Лицо делится по вертикали на 5 равных ширин: скула→внешний угол→внутренний угол→внутренний угол→внешний угол→скула. Метрика — максимальное отклонение любой пятой части от ширины одного глаза.',
  extra:[H_('zygoL','eyeLouter','1st fifth'),H_('eyeLouter','eyeLinner','2nd fifth'),H_('eyeLinner','eyeRinner','3rd fifth'),
         H_('eyeRinner','eyeRouter','4th fifth'),H_('eyeRouter','zygoR','5th fifth')]};
ratio('noseHW',V_('glabella','subnasale','Nose height'),H_('alarL','alarR','Nose width'),1,'x',
  'Высота носа (glabella→база носа) делится на его ширину.');
ratio('mouthBigonial',H_('mouthL','mouthR','Mouth width'),H_('gonionL','gonionR','Bigonial width'),100,'%',
  'Ширина рта как процент от ширины челюсти между гонионами.');
ratio('foreheadRatio',V_('hairline','glabella','Forehead height'),H_('temporalL','temporalR','Bitemporal width'),1,'x',
  'Высота лба делится на ширину висков — пропорция верхнего блока лица.');
ratio('upperLower',V_('glabella','subnasale','Upper face height'),V_('subnasale','menton','Lower face height'),1,'x',
  'Высота средней зоны делится на высоту нижней. Идеал 0.9–1.0: нижняя чуть длиннее.');
R.symmetry={kind:'mirror',unit:'%',
  method:'11 парных точек левой стороны зеркалятся относительно вертикальной оси через центр зрачков и сравниваются с правыми. Считается RMS-расстояние, нормированное на ширину скул. Меньше = симметричнее.'};

/* регионы для квиз/CV метрик */
var REG={
  skin:[[205,50,117,425,280,346],'CV: стандартное отклонение яркости в патчах обеих щёк. Высокое σ = пятна, акне, неровный тон.'],
  eyes:[[33,133,159,145,263,362,386,374],'CV: яркость склеры, краснота (R−B), разница яркости щеки и подглазья, контраст ресничного края.'],
  colour:[[10,151,9,205,425,0,17],'CV: средняя яркость и насыщенность зон лба, щёк, губ, радужки. Тёмные волосы/брови и светлая склера дают контраст.'],
  lower:[[172,397,152,136,365,377,148],'CV: градиент яркости вдоль контура челюсти. Резкий перепад = читаемая кость, мягкий = сглаженный контур или жир.'],
  lips:[[61,291,0,17,13,14],'CV: насыщенность и R−B в патче губ (цвет), локальная дисперсия (трещины). Ширина и полнота берутся из геометрии.'],
  nose:[[64,294,1,2,98,327],'CV: форма и ширина аларов из геометрии, локальные градиенты для бульбозности и кончика.'],
  other:[[10,152,234,454],'Симметрия считается геометрически. Уши оцениваются визуально по эталонам.']
};
var CVG={mandVis:'lower',gonionSharp:'lower',ramusVis:'lower',chinAngu:'lower',
  cheekVis:'skin',ogee:'skin',cheekSize:'skin',midFat:'skin',buccalFat:'skin',
  face3d:'nose',faceDepth:'nose',eyeDepth:'eyes',upperNarrow:'colour',
  gonions:'lower',chinShape:'lower',chinWidth:'lower',ramusMisc:'lower',mandLen:'lower',mandShape:'lower',
  chinDimo:'lower',ramusDimo:'lower',gonionOut:'lower',facialHair:'lower',roughSkin:'skin',lipDimo:'lips',lipFull:'lips'};
var GRAD={mandVis:1,gonionSharp:1,ramusVis:1,cheekVis:1,ogee:1,midFat:1,face3d:1,faceDepth:1};
var PROF={gonial:'Угол между ветвью челюсти (ramus) и телом мандибулы. Измеряется только на профильном фото.',
  nasofrontal:'Угол между линией лба и спинкой носа в точке назион. Только профиль.',
  ramusLen:'Отношение высоты ветви челюсти к длине тела мандибулы. Только профиль.',
  browRidge:'Наклон надбровного валика относительно вертикали лба. Только профиль.'};

/* ─────────────── measure ─────────────── */
function val(part,P){
  if(!part)return null;
  switch(part.t){
    case 'seg':return P[part.a]&&P[part.b]?dist(P[part.a],P[part.b]):null;
    case 'v':return P[part.a]&&P[part.b]?vdist(P[part.a],P[part.b]):null;
    case 'h':return P[part.a]&&P[part.b]?hdist(P[part.a],P[part.b]):null;
    case 'ang':return P[part.v]&&P[part.a]&&P[part.b]?angAt(P[part.v],P[part.a],P[part.b]):null;
    case 'tilt':return P[part.i]&&P[part.o]?tiltOf(P[part.i],P[part.o]):null;
    case 'avg':case 'avg2':case 'avg2b':{
      var vs=part.parts.map(function(x){return val(x,P)}).filter(function(x){return x!=null});
      return vs.length?vs.reduce(function(a,b){return a+b},0)/vs.length:null}
    case 'thirdsNum':{
      var u=vdist(P.hairline,P.glabella),m=vdist(P.glabella,P.subnasale),l=vdist(P.subnasale,P.menton),t=u+m+l;
      if(!t)return null;return Math.max(Math.abs(u/t*100-100/3),Math.abs(m/t*100-100/3),Math.abs(l/t*100-100/3))}
    case 'lowerDev':{
      var t2=vdist(P.hairline,P.menton);if(!t2)return null;
      return Math.abs(vdist(P.subnasale,P.menton)/t2*100-100/3)}
    case 'jawDev':{
      var ph=vdist(P.subnasale,P.lipUT),mo=vdist(P.lipUT,P.lipLB),ch=vdist(P.lipLB,P.menton),s=ph+mo+ch;
      if(!s)return null;return Math.max(Math.abs(ph/s*100-100/3),Math.abs(mo/s*100-100/3),Math.abs(ch/s*100-100/3))}
    case 'cheekNum':{
      var zy=(P.zygoL.y+P.zygoR.y)/2;return Math.abs(P.subnasale.y-zy)}
  }
  return null;
}
function measure(m,P){
  var rec=R[m.id],live=D.lm||null;
  var geoV=D.geo&&D.geo[m.id]!=null?D.geo[m.id]:null;
  if(!rec)return{value:geoV,comps:[],rec:null};
  var comps=[],v=null;
  function push(part,role){
    if(!part)return;
    if(part.t==='avg'||part.t==='avg2'||part.t==='avg2b'){
      part.parts.forEach(function(x){push(x,role)});return}
    var q=val(part,P);
    comps.push({label:part.l||'',val:live?q:null,unit:(part.t==='ang'||part.t==='tilt')?'deg':'px',role:role,part:part});
  }
  if(rec.kind==='ratio'){
    push(rec.num,'num');push(rec.den,'den');
    if(rec.num.t==='avg2'&&rec.den.t==='avg2b'){
      var a1=val(rec.num.parts[0],P),a2=val(rec.num.parts[1],P),b1=val(rec.den.parts[0],P),b2=val(rec.den.parts[1],P);
      v=(a1&&a2&&b1&&b2)?((a1/a2)+(b1/b2))/2:null;
    }else{
      var n=val(rec.num,P),d=val(rec.den,P);v=(n!=null&&d)?n/d*rec.mul:null}
    (rec.extra||[]).forEach(function(x){push(x,'extra')});
  }else if(rec.kind==='angle'){push(rec.ang,'num');v=val(rec.ang,P);
    (rec.extra||[]).forEach(function(x){push(x,'extra')});
    if(rec.extra&&rec.extra.length){var vs=[v].concat(rec.extra.map(function(x){return val(x,P)})).filter(function(x){return x!=null});
      v=vs.reduce(function(a,b){return a+b},0)/vs.length}
  }else if(rec.kind==='avg'){rec.parts.forEach(function(x){push(x,'num')});
    var vs=rec.parts.map(function(x){return val(x,P)}).filter(function(x){return x!=null});
    v=vs.length?vs.reduce(function(a,b){return a+b},0)/vs.length:null;
  }else if(rec.kind==='diff'){push(rec.a,'num');push(rec.b,'den');
    var a=val(rec.a,P),b=val(rec.b,P);v=(a!=null&&b!=null)?Math.abs(a-b):null;
  }else if(rec.kind==='mm'){push(rec.seg,'num');var q=val(rec.seg,P),k=mmPerPx();v=(q!=null&&k)?q*k:null;
  }else if(rec.kind==='fifths'){(rec.extra||[]).forEach(function(x){push(x,'extra')});
    var ew=(dist(P.eyeLouter,P.eyeLinner)+dist(P.eyeRouter,P.eyeRinner))/2;
    if(ew){var ds=(rec.extra||[]).map(function(x){return Math.abs(val(x,P)-ew)/ew*100});v=Math.max.apply(null,ds)}
  }else if(rec.kind==='mirror'){
    var mx=(P.irisL.x+P.irisR.x)/2,bz=dist(P.zygoL,P.zygoR);
    var pairs=[['eyeLouter','eyeRouter'],['eyeLinner','eyeRinner'],['eyeLupper','eyeRupper'],['eyeLlower','eyeRlower'],
      ['browLouter','browRouter'],['browLinner','browRinner'],['alarL','alarR'],['mouthL','mouthR'],
      ['zygoL','zygoR'],['gonionL','gonionR'],['temporalL','temporalR']];
    var s=0,n=0;pairs.forEach(function(pr){var a=P[pr[0]],b=P[pr[1]];if(!a||!b)return;
      var mir={x:2*mx-a.x,y:a.y};s+=Math.pow(dist(mir,b),2);n++});
    v=(n&&bz)?Math.sqrt(s/n)/bz*100:null;
    comps.push({label:'Mirror pairs',val:n,unit:'px',role:'num'});
    comps.push({label:'Bizygomatic (нормировка)',val:live?bz:null,unit:'px',role:'den'});
  }
  if(geoV!=null)v=geoV;
  return{value:(live||geoV!=null)?v:null,comps:comps,rec:rec,geoUsed:geoV!=null};
}

/* ─────────────── tier bands ─────────────── */
function bands(m,sex){
  var sp=(sex==='f'&&m.sf)?m.sf:m.sp;if(!sp)return null;
  if(sp[0]==='abs')return sp[1].map(function(rs,i){return{t:i+1,rs:rs}}).slice(0,m.tiers);
  var b=L.idealOf(m,sex);if(!b)return null;
  var th=sp[1],out=[{t:1,rs:[[b[0],b[1]]]}],prev=0;
  for(var i=0;i<th.length;i++){
    var rs=[];
    if(b[0]>-1e8)rs.push([b[0]-th[i],b[0]-prev]);
    if(b[1]<1e8)rs.push([b[1]+prev,b[1]+th[i]]);
    out.push({t:i+2,rs:rs});prev=th[i];
  }
  var last=[];
  if(b[0]>-1e8)last.push([-INF,b[0]-prev]);
  if(b[1]<1e8)last.push([b[1]+prev,INF]);
  out.push({t:th.length+2,rs:last});
  return out.slice(0,m.tiers);
}
function domain(bs,m,sex,v){
  var lo=INF,hi=-INF;
  bs.forEach(function(b){b.rs.forEach(function(r){
    if(r[0]>-1e8)lo=Math.min(lo,r[0]);if(r[1]<1e8)hi=Math.max(hi,r[1])})});
  var ib=L.idealOf(m,sex);
  if(ib){if(ib[0]>-1e8)lo=Math.min(lo,ib[0]);if(ib[1]<1e8)hi=Math.max(hi,ib[1])}
  if(!isFinite(lo)||!isFinite(hi)){lo=0;hi=1}
  if(hi-lo<1e-6){hi=lo+1}
  var pad=(hi-lo)*0.12;lo-=pad;hi+=pad;
  if(ib&&ib[0]===0&&lo<0)lo=0;
  if(v!=null&&isFinite(v)){lo=Math.min(lo,v-pad);hi=Math.max(hi,v+pad)}
  return[lo,hi];
}

/* ─────────────── CSS ─────────────── */
var CSS=`
.mi-root{--sc:var(--scan,#2DD4FF);--mt:var(--mint,#00E5C0);--vi:var(--violet,#A78BFA);--am:var(--amber,#FFB627);
--mg:var(--magenta,#FF3D8B);--rd:var(--red,#FF4757);--a:#2DD4FF;
--i0:#06080C;--i1:#0A0E15;--i2:#0F141D;--i3:#151C27;--i4:#1C2534;--ln:#1D2735;--ln2:#2A3849;--ln3:#3A4C61;
--tx:#E9F1F8;--tx2:#B3C4D6;--mu:#8095AB;--fa:#566A80;
--mn:'JetBrains Mono',ui-monospace,Menlo,monospace;--dp:'Space Grotesk',system-ui,-apple-system,sans-serif;
position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;background:rgba(4,6,10,.9);
backdrop-filter:blur(14px) saturate(1.3);font-family:var(--dp);color:var(--tx);font-size:14px;line-height:1.5;
animation:miIn .3s cubic-bezier(.22,.9,.28,1)}
@keyframes miIn{from{opacity:0;transform:translateY(14px)}}
.mi-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.mi-root button{font:inherit;color:inherit;border:none;background:none;cursor:pointer}
.mi-scroll{overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--a) transparent}
.mi-scroll::-webkit-scrollbar{width:7px;height:7px}
.mi-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,.03);border-radius:99px}
.mi-scroll::-webkit-scrollbar-thumb{background:linear-gradient(180deg,var(--a),var(--mt));border-radius:99px;border:1.5px solid var(--i0)}
.mi-scroll::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,var(--mt),var(--a))}
.mi-head{flex:none;display:flex;align-items:center;gap:9px;padding:11px 13px;border-bottom:1px solid var(--ln);
background:linear-gradient(180deg,rgba(10,14,21,.98),rgba(10,14,21,.82));position:relative}
.mi-head::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:1px;
background:linear-gradient(90deg,transparent,var(--a),var(--mt),transparent);opacity:.6}
.mi-mark{width:30px;height:30px;flex:none;border-radius:9px;display:grid;place-items:center;position:relative;
background:conic-gradient(from 210deg,var(--a),var(--mt),var(--vi),var(--a))}
.mi-mark::before{content:'';position:absolute;inset:1.5px;border-radius:7.5px;background:var(--i1)}
.mi-mark svg{width:16px;height:16px;position:relative;color:var(--a)}
.mi-ht{flex:1;min-width:0}
.mi-ht .n{font-weight:700;font-size:13.5px;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mi-ht .s{font-family:var(--mn);font-size:8.5px;letter-spacing:1.6px;color:var(--fa);text-transform:uppercase}
.mi-ib{width:32px;height:32px;flex:none;border-radius:9px;border:1px solid var(--ln2);background:var(--i2);
color:var(--tx2);display:grid;place-items:center;transition:.16s}
.mi-ib:hover{border-color:var(--a);color:var(--a);box-shadow:0 0 14px -6px var(--a)}
.mi-ib:active{transform:scale(.92)}
.mi-ib:disabled{opacity:.3;cursor:not-allowed}
.mi-ib svg{width:15px;height:15px}
.mi-ib.off{color:var(--fa)}
.mi-body{flex:1;display:flex;min-height:0}
.mi-left{flex:none;width:min(46%,430px);display:flex;flex-direction:column;border-right:1px solid var(--ln);min-height:0}
.mi-right{flex:1;min-width:0;padding:13px;display:flex;flex-direction:column;gap:11px}
.mi-stage{position:relative;flex:none;height:clamp(190px,34vh,340px);background:#000;overflow:hidden;touch-action:none;border-bottom:1px solid var(--ln)}
.mi-stage canvas{width:100%;height:100%;display:block;touch-action:none}
.mi-hud{position:absolute;left:8px;top:8px;display:flex;gap:5px;flex-wrap:wrap;pointer-events:none;z-index:2}
.mi-hud2{position:absolute;right:8px;top:8px;pointer-events:none;z-index:2}
.mi-tip{position:absolute;left:8px;right:8px;bottom:8px;z-index:2;pointer-events:none;font-family:var(--mn);font-size:9px;
color:var(--tx2);background:rgba(6,8,12,.82);border:1px solid var(--ln2);border-radius:8px;padding:5px 8px;line-height:1.4}
.mi-tag{font-family:var(--mn);font-size:8.5px;padding:3px 7px;border-radius:6px;border:1px solid var(--ln2);
color:var(--mu);white-space:nowrap;letter-spacing:.4px;background:rgba(6,8,12,.7)}
.mi-tag.a{color:var(--a);border-color:color-mix(in srgb,var(--a) 40%,transparent)}
.mi-tag.m{color:var(--mt);border-color:rgba(0,229,192,.4)}
.mi-tag.w{color:var(--am);border-color:rgba(255,182,39,.4)}
.mi-rail{flex:1;min-height:0;padding:2px 12px 10px;background:var(--i1)}
.mi-rl{font-family:var(--mn);font-size:8px;letter-spacing:1.8px;text-transform:uppercase;color:var(--fa);
padding:9px 0 5px;position:sticky;top:0;background:var(--i1);z-index:3}
.mi-ctl{display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px dashed rgba(42,56,73,.5)}
.mi-ctl:last-child{border-bottom:none}
.mi-ctl .nm{flex:1;min-width:0;font-size:11.5px;color:var(--tx2)}
.mi-ctl .vv{font-family:var(--mn);font-size:10px;color:var(--a);min-width:44px;text-align:right}
.mi-root input[type=range]{-webkit-appearance:none;appearance:none;width:92px;height:4px;border-radius:99px;outline:none;
background:linear-gradient(90deg,var(--a),var(--mt));cursor:pointer;flex:none}
.mi-root input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;
background:#fff;border:3px solid var(--a);box-shadow:0 0 9px color-mix(in srgb,var(--a) 70%,transparent);cursor:pointer}
.mi-root input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid var(--a)}
.mi-sw{width:36px;height:20px;border-radius:99px;background:var(--i4);border:1px solid var(--ln2);position:relative;cursor:pointer;flex:none;transition:.2s}
.mi-sw::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--fa);transition:.22s cubic-bezier(.3,1.5,.5,1)}
.mi-sw.on{background:color-mix(in srgb,var(--mt) 16%,transparent);border-color:rgba(0,229,192,.45)}
.mi-sw.on::after{left:18px;background:var(--mt);box-shadow:0 0 9px var(--mt)}
.mi-seg{display:flex;background:var(--i0);border:1px solid var(--ln2);border-radius:8px;padding:2px;gap:2px;flex:none}
.mi-seg button{font-family:var(--mn);font-size:9px;padding:5px 7px;border-radius:6px;color:var(--mu);transition:.15s;white-space:nowrap}
.mi-seg button.on{background:var(--i4);color:var(--a)}
.mi-dots{display:flex;gap:4px}
.mi-dot{width:17px;height:17px;border-radius:5px;border:2px solid transparent;cursor:pointer;transition:.15s}
.mi-dot:hover{transform:scale(1.15)}
.mi-dot.on{border-color:#fff;box-shadow:0 0 0 2px var(--i0),0 0 10px currentColor}
.mi-card{background:linear-gradient(168deg,var(--i2),var(--i1));border:1px solid var(--ln);border-radius:15px;overflow:hidden}
.mi-ch{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--ln);
background:linear-gradient(90deg,color-mix(in srgb,var(--a) 7%,transparent),transparent 70%)}
.mi-ch h3{font-family:var(--mn);font-size:9px;letter-spacing:1.8px;text-transform:uppercase;color:var(--tx2);font-weight:700}
.mi-ch .bar{width:2.5px;height:12px;border-radius:2px;background:linear-gradient(180deg,var(--a),var(--mt))}
.mi-cb{padding:12px}
.mi-sp{flex:1}
.mi-btn{border:1px solid var(--ln2);background:var(--i3);color:var(--tx2);border-radius:10px;padding:8px 12px;
font-size:11.5px;font-weight:600;transition:.15s;display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap}
.mi-btn:hover{border-color:var(--a);color:var(--a)}
.mi-btn:active{transform:scale(.96)}
.mi-btn svg{width:13px;height:13px;flex:none}
.mi-btn.pri{background:linear-gradient(120deg,var(--mt),var(--a));border-color:transparent;color:#04121A}
.mi-btn.pri:hover{color:#04121A;filter:brightness(1.08)}
.mi-btn:disabled{opacity:.35;cursor:not-allowed}
.mi-g2{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.mi-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.mi-hero{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
.mi-big{font-family:var(--mn);font-size:34px;font-weight:700;letter-spacing:-1.6px;line-height:1;color:var(--a)}
.mi-big small{font-size:15px;letter-spacing:0;color:var(--mu);margin-left:2px}
.mi-kv{font-family:var(--mn);font-size:10px;color:var(--fa)}
.mi-kv b{color:var(--tx2);font-weight:500}
.mi-eq{font-family:var(--mn);font-size:11.5px;line-height:1.9;color:var(--tx2);word-break:break-word}
.mi-eq .num{color:var(--mt)}.mi-eq .den{color:var(--am)}.mi-eq .op{color:var(--fa)}
.mi-eq .res{color:var(--a);font-weight:700}
.mi-frac{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;margin:0 5px}
.mi-frac .t{border-bottom:1.5px solid var(--ln3);padding:0 6px 2px;color:var(--mt)}
.mi-frac .b{padding:2px 6px 0;color:var(--am)}
.mi-scale{position:relative;height:30px;border-radius:8px;overflow:hidden;background:var(--i0);border:1px solid var(--ln2)}
.mi-scale i{position:absolute;top:0;bottom:0;display:block;opacity:.85}
.mi-scale .mk{position:absolute;top:-3px;bottom:-3px;width:2px;background:#fff;box-shadow:0 0 10px #fff;z-index:3}
.mi-scale .mk::before{content:'';position:absolute;top:0;left:-4px;border:5px solid transparent;border-top-color:#fff}
.mi-ticks{display:flex;justify-content:space-between;font-family:var(--mn);font-size:8.5px;color:var(--fa);margin-top:4px}
.mi-legend{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
.mi-lc{font-family:var(--mn);font-size:8.5px;padding:3px 6px;border-radius:5px;color:#04121A;font-weight:700}
.mi-lc.dk{color:#fff}
.mi-ladder{display:flex;flex-direction:column;gap:5px}
.mi-lr{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:9px;background:var(--i1);border:1px solid var(--ln);font-size:11.5px}
.mi-lr.on{border-color:currentColor;background:color-mix(in srgb,currentColor 8%,var(--i1))}
.mi-lr .lt{font-family:var(--mn);font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;color:#04121A;flex:none}
.mi-lr .lt.dk{color:#fff}
.mi-lr .lp{font-family:var(--mn);font-size:10.5px;margin-left:auto}
.mi-trow{display:flex;gap:4px;flex-wrap:wrap}
.mi-tb{flex:1;min-width:38px;border:1px solid var(--ln2);background:var(--i0);color:var(--mu);border-radius:9px;
padding:8px 3px;font-family:var(--mn);font-size:10px;font-weight:700;text-align:center;transition:.14s}
.mi-tb:hover{border-color:var(--ln3);color:var(--tx2)}
.mi-tb.on{color:#04121A;border-color:transparent}
.mi-tb.on.dk{color:#fff}
.mi-tb small{display:block;font-size:7.5px;opacity:.72;font-weight:500;margin-top:1px}
.mi-note{display:flex;gap:8px;align-items:flex-start;font-size:11.5px;line-height:1.6;color:var(--tx2);
padding:10px 11px;border-radius:11px;background:color-mix(in srgb,var(--a) 7%,transparent);border:1px solid color-mix(in srgb,var(--a) 22%,transparent)}
.mi-note svg{width:14px;height:14px;flex:none;margin-top:2px;color:var(--a)}
.mi-note.w{background:rgba(255,182,39,.08);border-color:rgba(255,182,39,.25)}
.mi-note.w svg{color:var(--am)}
.mi-pl{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed rgba(42,56,73,.5);font-size:11.3px}
.mi-pl:last-child{border-bottom:none}
.mi-pl .pd{width:9px;height:9px;border-radius:50%;flex:none;box-shadow:0 0 8px currentColor}
.mi-pl .pn{flex:1;min-width:0;color:var(--tx2)}
.mi-pl .pv{font-family:var(--mn);font-size:9.5px;color:var(--fa);white-space:nowrap}
.mi-search{width:100%;background:var(--i0);border:1px solid var(--ln2);color:var(--tx);border-radius:10px;
padding:9px 11px;font-family:var(--mn);font-size:11.5px;outline:none}
.mi-search:focus{border-color:var(--a);box-shadow:0 0 0 3px color-mix(in srgb,var(--a) 14%,transparent)}
.mi-chips{display:flex;gap:5px;flex-wrap:wrap;margin:9px 0}
.mi-chip{border:1px solid var(--ln2);background:var(--i2);color:var(--mu);border-radius:99px;padding:5px 10px;
font-family:var(--mn);font-size:9.5px;transition:.15s}
.mi-chip.on{background:color-mix(in srgb,var(--a) 14%,transparent);border-color:var(--a);color:var(--a)}
.mi-list{display:flex;flex-direction:column;gap:5px}
.mi-li{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:11px;background:var(--i1);
border:1px solid var(--ln);cursor:pointer;transition:.15s;text-align:left;width:100%}
.mi-li:hover{border-color:var(--ln3);transform:translateX(2px)}
.mi-li .lb{width:3px;height:22px;border-radius:2px;flex:none}
.mi-li .ln2{flex:1;min-width:0;font-size:12px;font-weight:600}
.mi-li .ln2 small{display:block;font-weight:400;font-size:9.5px;color:var(--fa);font-family:var(--mn);margin-top:1px}
.mi-li .lv{font-family:var(--mn);font-size:10.5px;color:var(--a);white-space:nowrap}
.mi-empty{padding:28px 14px;text-align:center;color:var(--fa);font-size:12px}
.mi-toasts{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:210;display:flex;flex-direction:column;
gap:7px;align-items:center;width:min(400px,calc(100% - 26px));pointer-events:none}
.mi-toast{pointer-events:auto;display:flex;align-items:center;gap:9px;padding:10px 12px;border-radius:11px;
background:rgba(21,28,39,.97);border:1px solid var(--ln2);font-size:11.5px;color:var(--tx);
box-shadow:0 18px 44px -18px #000;animation:miIn .26s;font-family:var(--dp)}
.mi-hit{width:24px;height:24px;flex:none;border-radius:7px;border:1px solid var(--ln2,#2A3849);
background:rgba(45,212,255,.1);color:#2DD4FF;display:grid;place-items:center;cursor:pointer;transition:.15s;padding:0}
.mi-hit:hover{background:rgba(45,212,255,.24);transform:scale(1.1)}
.mi-hit svg{width:12px;height:12px}
.mi-clickable{cursor:pointer}
.mi-clickable:hover{color:#2DD4FF}
@media(max-width:860px){
.mi-body{flex-direction:column}
.mi-left{width:100%;border-right:none;border-bottom:1px solid var(--ln);flex:none;max-height:64vh}
.mi-stage{height:clamp(170px,30vh,260px)}
.mi-rail{max-height:26vh}
.mi-right{flex:1;min-height:0}
.mi-big{font-size:29px}
}
@media(prefers-reduced-motion:reduce){.mi-root *{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;
var styleEl=null;
function css(){if(styleEl)return;styleEl=document.createElement('style');styleEl.id='mi-css';styleEl.textContent=CSS;document.head.appendChild(styleEl)}

/* ─────────────── icons ─────────────── */
function ic(d,w){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(w||2)+'" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>'}
var I={x:'<path d="M18 6L6 18M6 6l12 12"/>',prev:'<path d="M15 6l-6 6 6 6"/>',next:'<path d="M9 6l6 6-6 6"/>',
  ruler:'<path d="M3 8h18v8H3z"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.2v.01"/>',
  warn:'<path d="M10.3 3.9L2.5 17.4A2 2 0 004.2 20.4h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 16.5v.01"/>',
  down:'<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  reset:'<path d="M3 12a9 9 0 019-9 9 9 0 016.4 2.6L21 8"/><path d="M21 3v5h-5"/>',
  snd:'<path d="M11 5L6.5 9H3v6h3.5L11 19z"/><path d="M15.5 8.5a5 5 0 010 7"/>',
  mute:'<path d="M11 5L6.5 9H3v6h3.5L11 19z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  list:'<path d="M4 6h16M4 12h16M4 18h10"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'};

/* ─────────────── state ─────────────── */
var V={zoom:1,px:0,py:0,pt:6,lw:2.2,lab:100,photo:100,exp:100,con:100,
  mesh:true,guides:true,pulse:true,units:'px',layer:'all',accent:'#2DD4FF',iris:11.7};
var DEF=JSON.parse(JSON.stringify(V));
var el=null,ctrl=null,ro=null,raf=0,need=true,cur=null,mode='detail',q='',filt='all',t0=0,sex='m';
var NAME2ID={};
function buildNames(){if(!L)return;NAME2ID={};L.ALL.forEach(function(m){NAME2ID[m.ru.toLowerCase()]=m.id})}
function order(){return L?L.list(null,{view:'any',mode:'any',extras:true}):[]}
function toast(msg){
  var box=el&&el.querySelector('.mi-toasts');if(!box)return;
  var d=document.createElement('div');d.className='mi-toast';d.textContent=msg;box.appendChild(d);
  setTimeout(function(){d.style.transition='.24s';d.style.opacity='0';d.style.transform='translateY(8px)';
    setTimeout(function(){d.remove()},250)},2100);
}
function redraw(){need=true}

/* ─────────────── canvas ─────────────── */
var cv=null,ctx=null,W=0,H=0,dpr=1;
function size(){
  if(!cv)return;var r=cv.getBoundingClientRect();W=r.width;H=r.height;
  dpr=Math.min(2,root.devicePixelRatio||1);
  cv.width=Math.max(1,Math.round(W*dpr));cv.height=Math.max(1,Math.round(H*dpr));redraw();
}
function dims(){return D.lm?{w:D.w||1,h:D.h||1}:{w:SYN.W,h:SYN.H}}
function baseK(){var d=dims();return Math.min(W/d.w,H/d.h)*0.9}
function T(p){var d=dims(),k=baseK()*V.zoom;
  return{x:(p.x-d.w/2)*k+W/2+V.px,y:(p.y-d.h/2)*k+H/2+V.py}}
function inv(x,y){var d=dims(),k=baseK()*V.zoom;
  return{x:(x-W/2-V.px)/k+d.w/2,y:(y-H/2-V.py)/k+d.h/2}}
function label(x,y,txt,col,size,align){
  if(V.lab<=0)return;
  ctx.save();ctx.globalAlpha=V.lab/100;
  ctx.font='700 '+(size||10)+'px JetBrains Mono, monospace';
  ctx.textAlign=align||'center';ctx.textBaseline='middle';
  var w=ctx.measureText(txt).width;
  var bx=align==='left'?x-3:align==='right'?x-w-3:x-w/2-3;
  ctx.fillStyle='rgba(6,8,12,.82)';
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(bx,y-8,w+6,16,4);else ctx.rect(bx,y-8,w+6,16);
  ctx.fill();
  ctx.fillStyle=col;ctx.fillText(txt,x,y);ctx.restore();
}
function dot(p,col,r){
  var s=T(p);ctx.beginPath();ctx.arc(s.x,s.y,r||V.pt,0,6.284);
  ctx.fillStyle=col;ctx.fill();ctx.lineWidth=1.6;ctx.strokeStyle='rgba(255,255,255,.9)';ctx.stroke();
}
function line(a,b,col,dash,w){
  var A_=T(a),B_=T(b);ctx.save();ctx.beginPath();ctx.moveTo(A_.x,A_.y);ctx.lineTo(B_.x,B_.y);
  ctx.strokeStyle=col;ctx.lineWidth=w||V.lw;ctx.setLineDash(dash||[]);
  ctx.shadowColor=col;ctx.shadowBlur=8;ctx.stroke();ctx.restore();
}
function arc(v,a,b,col,txt){
  var Vv=T(v),Aa=T(a),Bb=T(b);
  var a1=Math.atan2(Aa.y-Vv.y,Aa.x-Vv.x),a2=Math.atan2(Bb.y-Vv.y,Bb.x-Vv.x);
  var d=a2-a1;while(d>Math.PI)d-=6.283;while(d<-Math.PI)d+=6.283;
  var r=Math.min(46,Math.max(18,Math.min(Math.hypot(Aa.x-Vv.x,Aa.y-Vv.y),Math.hypot(Bb.x-Vv.x,Bb.y-Vv.y))*0.42));
  ctx.save();ctx.beginPath();ctx.arc(Vv.x,Vv.y,r,a1,a1+d,d<0);
  ctx.strokeStyle=col;ctx.lineWidth=V.lw;ctx.shadowColor=col;ctx.shadowBlur=9;ctx.stroke();ctx.restore();
  var bm=a1+d/2;
  label(Vv.x+Math.cos(bm)*(r+15),Vv.y+Math.sin(bm)*(r+15),txt,col,10);
}
function drawPrim(part,P,col,role){
  if(!part)return;
  if(V.layer==='num'&&role!=='num')return;
  if(V.layer==='den'&&role!=='den')return;
  var k=mmPerPx(),mm=V.units==='mm'&&k;
  function len(q){return mm?fmtV(q*k,'mm'):fmtV(q,'px')}
  switch(part.t){
    case 'seg':case 'v':case 'h':{
      var a=P[part.a],b=P[part.b];if(!a||!b)break;
      var p1=a,p2=b;
      if(part.t==='v'){p1={x:a.x,y:a.y};p2={x:a.x,y:b.y}}
      if(part.t==='h'){p1={x:a.x,y:a.y};p2={x:b.x,y:a.y}}
      line(p1,p2,col,part.t==='seg'?[]:[5,4]);
      dot(a,col,V.pt*.8);dot(b,col,V.pt*.8);
      if(part.t!=='seg'){line(a,p1,col,[2,4],1);line(b,p2,col,[2,4],1)}
      var m=mid(T(p1),T(p2));
      var q=part.t==='seg'?dist(a,b):part.t==='v'?vdist(a,b):hdist(a,b);
      label(m.x,m.y-13,(part.l?part.l+' · ':'')+len(q),col,9.5);
      break}
    case 'ang':{
      var v=P[part.v],a=P[part.a],b=P[part.b];if(!v||!a||!b)break;
      line(v,a,col,[],V.lw*.85);line(v,b,col,[],V.lw*.85);
      dot(v,col,V.pt);dot(a,col,V.pt*.7);dot(b,col,V.pt*.7);
      arc(v,a,b,col,r1(angAt(v,a,b))+'°');break}
    case 'tilt':{
      var i=P[part.i],o=P[part.o];if(!i||!o)break;
      var far={x:o.x+(o.x>i.x?26:-26),y:i.y};
      line(i,far,'rgba(128,149,171,.75)',[4,4],1.2);
      line(i,o,col);dot(i,col,V.pt*.8);dot(o,col,V.pt*.8);
      arc(i,far,o,col,r1(tiltOf(i,o))+'°');break}
    case 'pt':{var a=P[part.a];if(a){dot(a,col,V.pt);label(T(a).x,T(a).y-15,part.l||part.a,col,9)}break}
  }
}
function schematic(){
  var P=SYN.p,d=dims();
  var tl=T({x:0,y:0}),br=T({x:d.w,y:d.h});
  ctx.save();ctx.globalAlpha=V.photo/100;
  var g=ctx.createLinearGradient(tl.x,tl.y,br.x,br.y);
  g.addColorStop(0,'#141B26');g.addColorStop(1,'#0B1017');
  ctx.fillStyle=g;ctx.fillRect(tl.x,tl.y,br.x-tl.x,br.y-tl.y);
  ctx.globalAlpha=(V.photo/100)*.9;
  function path(ks,close){ctx.beginPath();ks.forEach(function(k,i){var s=T(P[k]);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y)});
    if(close)ctx.closePath()}
  path(['hairline','temporalR','zygoR','gonionR','menton','gonionL','zygoL','temporalL'],true);
  ctx.fillStyle='rgba(58,50,68,.55)';ctx.fill();
  ctx.strokeStyle='rgba(45,212,255,.3)';ctx.lineWidth=1.2;ctx.stroke();
  ['eyeL','eyeR'].forEach(function(e){
    var a=T(P[e+'outer']),b=T(P[e+'inner']),u=T(P[e+'upper']),l=T(P[e+'lower']);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(u.x,u.y-4,b.x,b.y);
    ctx.quadraticCurveTo(l.x,l.y+4,a.x,a.y);ctx.fillStyle='rgba(237,232,228,.5)';ctx.fill();
    var ir=T(P[e==='eyeL'?'irisL':'irisR']);
    ctx.beginPath();ctx.arc(ir.x,ir.y,Math.abs(b.x-a.x)*.17,0,6.284);ctx.fillStyle='rgba(78,124,140,.85)';ctx.fill()});
  var bl=T(P.browLinner),bo=T(P.browLouter),br2=T(P.browRinner),bro=T(P.browRouter);
  ctx.strokeStyle='rgba(30,22,36,.9)';ctx.lineWidth=Math.max(2,V.lw*1.6);
  ctx.beginPath();ctx.moveTo(bl.x,bl.y);ctx.lineTo(bo.x,bo.y);ctx.moveTo(br2.x,br2.y);ctx.lineTo(bro.x,bro.y);ctx.stroke();
  var ml=T(P.mouthL),mr=T(P.mouthR),lu=T(P.lipUT),ll=T(P.lipLB);
  ctx.beginPath();ctx.moveTo(ml.x,ml.y);ctx.quadraticCurveTo(lu.x,lu.y-3,mr.x,mr.y);
  ctx.quadraticCurveTo(ll.x,ll.y+3,ml.x,ml.y);ctx.fillStyle='rgba(142,66,87,.75)';ctx.fill();
  var al=T(P.alarL),ar=T(P.alarR),nt=T(P.noseTip);
  ctx.beginPath();ctx.moveTo(al.x,al.y);ctx.quadraticCurveTo(nt.x,nt.y-6,ar.x,ar.y);
  ctx.strokeStyle='rgba(20,14,26,.7)';ctx.lineWidth=Math.max(1.5,V.lw);ctx.stroke();
  ctx.restore();
}
function draw(ts){
  if(!ctx)return;
  if(!t0)t0=ts||0;
  var time=((ts||0)-t0)/1000;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  var bg=ctx.createRadialGradient(W/2,H*.4,10,W/2,H*.4,Math.max(W,H));
  bg.addColorStop(0,'#0A0F16');bg.addColorStop(1,'#04060A');
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  var d=dims(),k=baseK()*V.zoom,rr=(D.lm&&ALIGN)?-rollRad():0;
  if(D.img){
    ctx.save();
    ctx.translate(W/2+V.px,H/2+V.py);ctx.scale(k,k);ctx.rotate(rr);ctx.translate(-d.w/2,-d.h/2);
    ctx.filter='brightness('+(V.exp/100)+') contrast('+(V.con/100)+')';
    ctx.globalAlpha=V.photo/100;ctx.drawImage(D.img,0,0,d.w,d.h);ctx.restore();
  }else{schematic()}
  var P=pts();
  if(V.mesh){
    var mp=meshPts();
    if(mp){ctx.fillStyle='rgba(45,212,255,.32)';
      for(var i=0;i<mp.length;i++){var s=T(mp[i]);ctx.fillRect(s.x,s.y,1.2,1.2)}}
    else{ctx.fillStyle='rgba(45,212,255,.16)';
      for(var gy=0;gy<18;gy++)for(var gx=0;gx<14;gx++){
        var xx=d.w*.18+gx*(d.w*.64/13),yy=d.h*.1+gy*(d.h*.8/17);
        var nx=(xx-d.w/2)/(d.w*.42),ny=(yy-d.h*.48)/(d.h*.46);
        if(nx*nx+ny*ny>1)continue;var s2=T({x:xx,y:yy});ctx.fillRect(s2.x,s2.y,1.2,1.2)}}
  }
  if(V.guides){
    var zl=P.zygoL,zr=P.zygoR;
    if(zl&&zr){
      var lo=Math.min(zl.x,zr.x)-d.w*.12,hi=Math.max(zl.x,zr.x)+d.w*.12;
      ['hairline','glabella','subnasale','menton'].forEach(function(kk){
        if(!P[kk])return;var a=T({x:lo,y:P[kk].y}),b=T({x:hi,y:P[kk].y});
        ctx.save();ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
        ctx.strokeStyle='rgba(0,229,192,.26)';ctx.lineWidth=1;ctx.setLineDash([4,5]);ctx.stroke();ctx.restore()});
      var mx=(P.irisL.x+P.irisR.x)/2;
      var t1=T({x:mx,y:P.hairline.y}),t2=T({x:mx,y:P.menton.y});
      ctx.save();ctx.beginPath();ctx.moveTo(t1.x,t1.y);ctx.lineTo(t2.x,t2.y);
      ctx.strokeStyle='rgba(255,61,139,.3)';ctx.lineWidth=1;ctx.setLineDash([2,5]);ctx.stroke();ctx.restore();
    }
  }
  var m=cur?L.byId[cur]:null,rec=m?R[m.id]:null;
  var acc=V.accent;
  if(m&&rec){
    if(rec.kind==='mirror'){
      var mx2=(P.irisL.x+P.irisR.x)/2;
      var pairs=[['eyeLouter','eyeRouter'],['eyeLinner','eyeRinner'],['eyeLupper','eyeRupper'],['eyeLlower','eyeRlower'],
        ['browLouter','browRouter'],['browLinner','browRinner'],['alarL','alarR'],['mouthL','mouthR'],
        ['zygoL','zygoR'],['gonionL','gonionR'],['temporalL','temporalR']];
      pairs.forEach(function(pr){var a=P[pr[0]],b=P[pr[1]];if(!a||!b)return;
        var mir={x:2*mx2-a.x,y:a.y};
        dot(a,'#A78BFA',V.pt*.7);dot(b,acc,V.pt*.7);dot(mir,'rgba(167,139,250,.5)',V.pt*.5);
        line(mir,b,'rgba(255,182,39,.8)',[3,3],1.3)});
      var a1=T({x:mx2,y:P.hairline.y-20}),a2=T({x:mx2,y:P.menton.y+20});
      ctx.save();ctx.beginPath();ctx.moveTo(a1.x,a1.y);ctx.lineTo(a2.x,a2.y);
      ctx.strokeStyle='#FF3D8B';ctx.lineWidth=V.lw;ctx.shadowColor='#FF3D8B';ctx.shadowBlur=10;ctx.stroke();ctx.restore();
      label(a1.x,a1.y-12,'mirror axis','#FF3D8B',9.5);
    }else{
      if(rec.num)drawPrim(rec.num,P,'#00E5C0','num');
      if(rec.den)drawPrim(rec.den,P,'#FFB627','den');
      if(rec.ang)drawPrim(rec.ang,P,acc,'num');
      if(rec.seg)drawPrim(rec.seg,P,acc,'num');
      if(rec.a)drawPrim(rec.a,P,'#00E5C0','num');
      if(rec.b)drawPrim(rec.b,P,'#FFB627','den');
      if(rec.parts)rec.parts.forEach(function(x){drawPrim(x,P,acc,'num')});
      (rec.extra||[]).forEach(function(x){drawPrim(x,P,'rgba(167,139,250,.95)','extra')});
    }
  }else if(m){
    var ids=regIds(m),bx=boxOf(ids,P);
    if(bx){
      var p1=T({x:bx.cx-bx.w/2,y:bx.cy-bx.h/2}),p2=T({x:bx.cx+bx.w/2,y:bx.cy+bx.h/2});
      ctx.save();ctx.strokeStyle=acc;ctx.lineWidth=V.lw;ctx.setLineDash([7,5]);
      ctx.shadowColor=acc;ctx.shadowBlur=10;
      ctx.strokeRect(p1.x,p1.y,p2.x-p1.x,p2.y-p1.y);ctx.restore();
      ctx.save();ctx.globalAlpha=.1;ctx.fillStyle=acc;
      ctx.fillRect(p1.x,p1.y,p2.x-p1.x,p2.y-p1.y);ctx.restore();
      ids.forEach(function(i){var nm=lmName(i);if(nm&&P[nm])dot(P[nm],acc,V.pt*.6)});
      label((p1.x+p2.x)/2,p1.y-13,'зона оценки · '+ids.length+' точек',acc,9.5);
    }
  }
  if(V.pulse){
    var sy=(Math.sin(time*.62)*.5+.5)*H;
    var gg=ctx.createLinearGradient(0,sy-18,0,sy+18);
    gg.addColorStop(0,'rgba(0,229,192,0)');gg.addColorStop(.5,'rgba(0,229,192,.16)');gg.addColorStop(1,'rgba(0,229,192,0)');
    ctx.fillStyle=gg;ctx.fillRect(0,sy-18,W,32);
    ctx.save();ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(W,sy);
    ctx.strokeStyle='rgba(0,229,192,.5)';ctx.lineWidth=1;ctx.stroke();ctx.restore();
  }
  if(!D.lm){label(W/2,H-16,'СХЕМА МЕТОДА · без фото','#8095AB',9)}
}
function lmName(i){var out=null;Object.keys(LMI).forEach(function(k){if(LMI[k]===i)out=k});return out}
function regIds(m){
  if(m.v==='S')return[9,2,152,172,397];
  var g=CVG[m.id]||m.group;var r=REG[g];return r?r[0]:[10,152,234,454];
}
function boxOf(ids,P){
  var xs=[],ys=[];ids.forEach(function(i){var n=lmName(i);
    if(n&&P[n]){xs.push(P[n].x);ys.push(P[n].y)}});
  if(!xs.length){var d=dims();return{cx:d.w/2,cy:d.h*.45,w:d.w*.5,h:d.h*.4}}
  var x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs),y0=Math.min.apply(null,ys),y1=Math.max.apply(null,ys);
  var s=Math.max(x1-x0,y1-y0)*1.5;
  return{cx:(x0+x1)/2,cy:(y0+y1)/2,w:s,h:s};
}
function loop(ts){if(!el)return;if(need||V.pulse){need=false;draw(ts)}raf=requestAnimationFrame(loop)}

/* ─────────────── info panels ─────────────── */
function usedPoints(m){
  var rec=R[m.id],set={};
  function add(part){if(!part)return;
    if(part.parts){part.parts.forEach(add);return}
    ['a','b','v','i','o'].forEach(function(k){if(part[k]&&typeof part[k]==='string')set[part[k]]=1})}
  if(rec){add(rec.num);add(rec.den);add(rec.ang);add(rec.seg);add(rec.a);add(rec.b);
    if(rec.parts)rec.parts.forEach(add);(rec.extra||[]).forEach(add);
    if(rec.kind==='mirror')['irisL','irisR','eyeLouter','eyeRouter','eyeLinner','eyeRinner','zygoL','zygoR','gonionL','gonionR','alarL','alarR','mouthL','mouthR','browLinner','browRinner','temporalL','temporalR'].forEach(function(k){set[k]=1});
  }else{regIds(m).forEach(function(i){var n=lmName(i);if(n)set[n]=1})}
  return Object.keys(set);
}
function eqHtml(m,ms){
  var rec=ms.rec;if(!rec)return '<div class="mi-eq">'+esc(m.d||'Визуальная оценка по эталонам тиров.')+'</div>';
  var P=pts(),mm=V.units==='mm'&&mmPerPx(),k=mmPerPx();
  function lv(q){return mm&&k?fmtV(q*k,'mm'):fmtV(q,'px')}
  function nm(part){
    if(!part)return '—';
    if(part.t==='avg'||part.t==='avg2'||part.t==='avg2b')return 'avg('+part.parts.map(function(x){return x.l}).join(', ')+')';
    return part.l||part.t;
  }
  function nv(part){var q=val(part,P);return (D.lm&&q!=null)?lv(q):'—'}
  var val_=ms.value,unit=m.u||rec.unit;
  if(rec.kind==='ratio'){
    var n=rec.num.t==='avg2'?null:val(rec.num,P),d=rec.den.t==='avg2b'?null:val(rec.den,P);
    var frac='<span class="mi-frac"><span class="t">'+(n!=null&&D.lm?lv(n):nm(rec.num))+'</span><span class="b">'+(d!=null&&D.lm?lv(d):nm(rec.den))+'</span></span>';
    return '<div class="mi-eq"><span class="op">'+esc(m.ru)+' =</span> '+frac+
      (rec.mul===100?' <span class="op">× 100</span>':'')+
      ' <span class="op">=</span> <span class="res">'+fmtV(val_,unit)+'</span></div>'+
      '<div class="mi-eq" style="font-size:10.5px;color:var(--fa);margin-top:6px">'+
      '<span class="num">'+esc(nm(rec.num))+'</span> <span class="op">÷</span> <span class="den">'+esc(nm(rec.den))+'</span></div>';
  }
  if(rec.kind==='angle'||rec.kind==='avg'||rec.kind==='diff'){
    return '<div class="mi-eq"><span class="op">'+esc(m.ru)+' =</span> <span class="res">'+fmtV(val_,'deg')+'</span>'+
      (rec.kind==='avg'?' <span class="op">(среднее по '+rec.parts.length+' замерам)</span>':'')+
      (rec.kind==='diff'?' <span class="op">= |IAA − JFA|</span>':'')+'</div>';
  }
  if(rec.kind==='mm'){
    var q=val(rec.seg,P);
    return '<div class="mi-eq"><span class="op">width =</span> <span class="num">'+(D.lm?fmtV(q,'px'):'—')+'</span>'+
      ' <span class="op">×</span> <span class="den">'+(k?r2(k)+' мм/px':'нет калибровки')+'</span>'+
      ' <span class="op">=</span> <span class="res">'+fmtV(val_,'mm')+'</span></div>';
  }
  if(rec.kind==='mirror')return '<div class="mi-eq"><span class="op">asymmetry =</span> RMS(mirror L → R) <span class="op">÷</span> bizygomatic <span class="op">× 100 =</span> <span class="res">'+fmtV(val_,'%')+'</span></div>';
  if(rec.kind==='fifths')return '<div class="mi-eq"><span class="op">fifths dev =</span> max |fifth − eye width| <span class="op">÷</span> eye width <span class="op">× 100 =</span> <span class="res">'+fmtV(val_,'%')+'</span></div>';
  return '<div class="mi-eq"><span class="res">'+fmtV(val_,unit)+'</span></div>';
}
function scaleHtml(m,v){
  var bs=bands(m,sex);if(!bs)return '';
  var dm=domain(bs,m,sex,v),span=dm[1]-dm[0];
  var segs='';
  bs.forEach(function(b){b.rs.forEach(function(r){
    var a=cl(Math.max(r[0],dm[0]),dm[0],dm[1]),b2=cl(Math.min(r[1],dm[1]),dm[0],dm[1]);
    if(b2<=a)return;
    segs+='<i style="left:'+((a-dm[0])/span*100)+'%;width:'+((b2-a)/span*100)+'%;background:'+tierC(b.t)+'"></i>';
  })});
  var mk=(v!=null&&isFinite(v))?'<span class="mk" style="left:'+cl((v-dm[0])/span*100,0,100)+'%"></span>':'';
  var leg=bs.map(function(b){return '<span class="mi-lc'+(b.t>=6?' dk':'')+'" style="background:'+tierC(b.t)+'">T'+b.t+'</span>'}).join('');
  var ib=L.idealOf(m,sex);
  return '<div class="mi-scale">'+segs+mk+'</div>'+
    '<div class="mi-ticks"><span>'+r2(dm[0])+'</span><span>'+(ib?r2((ib[0]+ib[1])/2):'')+'</span><span>'+r2(dm[1])+'</span></div>'+
    '<div class="mi-legend">'+leg+'</div>';
}
function ladderHtml(m,t){
  var bs=bands(m,sex);
  var rows='';
  for(var i=1;i<=m.tiers;i++){
    var txt='';
    if(bs&&bs[i-1]){
      txt=bs[i-1].rs.map(function(r){
        var a=r[0]<=-1e8?'−∞':r2(r[0]),b=r[1]>=1e8?'∞':r2(r[1]);return a+' … '+b}).join('  ·  ');
    }else txt=i===1?'идеал':i===m.tiers?'максимальный флейл':'промежуточный тир';
    rows+='<div class="mi-lr'+(t===i?' on':'')+'" style="color:'+tierC(i)+'">'+
      '<span class="lt'+(i>=6?' dk':'')+'" style="background:'+tierC(i)+'">T'+i+'</span>'+
      '<span style="color:var(--tx2);font-family:var(--mn);font-size:10px">'+esc(txt)+'</span>'+
      '<span class="lp" style="color:'+(m.p[i-1]>=0?'var(--mt)':'var(--rd)')+'">'+(m.p[i-1]>0?'+':'')+r2(m.p[i-1])+'</span></div>';
  }
  return '<div class="mi-ladder">'+rows+'</div>';
}
function methodText(m){
  if(PROF[m.id])return PROF[m.id];
  if(R[m.id])return R[m.id].method;
  var g=CVG[m.id]||m.group,r=REG[g];
  var base=r?r[1]:'Визуальная оценка: сравни свой фрагмент с эталонами тиров.';
  if(GRAD[m.id])base+=' Значение строится на сумме локальных градиентов яркости (перепад света на кости).';
  return base;
}
function srcBadge(m){
  if(PROF[m.id])return '<span class="mi-tag w">ПРОФИЛЬ · нужно 2-е фото</span>';
  if(R[m.id])return '<span class="mi-tag m">AUTO · геометрия</span>';
  if(m.as)return '<span class="mi-tag a">CV + подтверждение</span>';
  return '<span class="mi-tag">QUIZ · эталоны</span>';
}
function currentTier(id,hint){
  if(hint)return hint;
  var b=document.querySelector('#view .tb.on[data-m="'+id+'"]');
  if(b)return +b.dataset.t;
  return ANS[id]||null;
}
function renderDetail(hint){
  var m=L.byId[cur];if(!m)return;
  var P=pts(),ms=measure(m,P),t=currentTier(cur,hint);
  var v=ms.value,ib=L.idealOf(m,sex),dev=null;
  if(ib&&v!=null)dev=v<ib[0]?ib[0]-v:(v>ib[1]?v-ib[1]:0);
  var loss=t?r2(m.p[0]-m.p[t-1]):null;
  var right=el.querySelector('.mi-right');
  var used=usedPoints(m),mm=mmPerPx();
  var pl=used.map(function(k,i){
    var p=P[k];var col=i%3===0?'#00E5C0':i%3===1?'#2DD4FF':'#A78BFA';
    var co=p?(V.units==='mm'&&mm?r1(p.x*mm)+', '+r1(p.y*mm)+' мм':Math.round(p.x)+', '+Math.round(p.y)+' px'):'—';
    return '<div class="mi-pl"><span class="pd" style="background:'+col+';color:'+col+'"></span>'+
      '<span class="pn">'+esc(ANAT[k]||k)+'</span><span class="pv">'+co+'</span></div>'}).join('');
  var tbtn='';
  for(var i=1;i<=m.tiers;i++){
    tbtn+='<button class="mi-tb'+(t===i?' on':'')+(i>=6?' dk':'')+'" data-t="'+i+'"'+(t===i?' style="background:'+tierC(i)+'"':'')+'>'+
      'T'+i+'<small>'+(m.p[i-1]>0?'+':'')+r2(m.p[i-1])+'</small></button>';
  }
  var canSet=!!document.querySelector('#view .tb[data-m="'+cur+'"]');
  right.innerHTML=
    '<div class="mi-card"><div class="mi-ch"><span class="bar"></span><h3>Замер</h3><span class="mi-sp"></span>'+srcBadge(m)+'</div><div class="mi-cb">'+
      '<div class="mi-hero"><div class="mi-big">'+(v!=null?r2(v):'—')+'<small>'+(m.u==='%'?'%':m.u==='deg'?'°':m.u==='mm'?'мм':m.u?'×':'')+'</small></div>'+
      '<div style="flex:1;min-width:120px"><div class="mi-kv">идеал <b>'+(ib?r2(ib[0])+' … '+r2(ib[1]):'визуально')+'</b></div>'+
      '<div class="mi-kv">отклонение <b>'+(dev!=null?r2(dev):'—')+'</b></div>'+
      '<div class="mi-kv">тир <b style="color:'+(t?tierC(t):'var(--fa)')+'">'+(t?'T'+t:'не выбран')+'</b>'+
      (loss!=null?' · потеря <b style="color:var(--rd)">−'+loss+'</b>':'')+'</div></div></div>'+
      '<div style="margin-top:11px">'+eqHtml(m,ms)+'</div>'+
      (ms.geoUsed?'<div class="mi-kv" style="margin-top:7px">значение取自 движка расчёта · компоненты показаны в исходных координатах</div>':'')+
    '</div></div>'+
    (bands(m,sex)?'<div class="mi-card"><div class="mi-ch"><span class="bar"></span><h3>Тир-шкала</h3><span class="mi-sp"></span>'+
      '<span class="mi-tag">'+(v!=null?'маркер = твой замер':'нет замера')+'</span></div><div class="mi-cb">'+scaleHtml(m,v)+
      '<div style="margin-top:11px">'+ladderHtml(m,t)+'</div></div></div>'
      :'<div class="mi-card"><div class="mi-ch"><span class="bar"></span><h3>Тиры и баллы</h3></div><div class="mi-cb">'+ladderHtml(m,t)+'</div></div>')+
    '<div class="mi-card"><div class="mi-ch"><span class="bar"></span><h3>Как измерялась</h3></div><div class="mi-cb">'+
      '<div class="mi-note">'+ic(I.info)+'<div>'+esc(methodText(m))+'</div></div>'+
      (D.lm?'<div class="mi-note'+(ALIGN?'':' w')+'" style="margin-top:8px">'+ic(ALIGN?I.target:I.warn)+
        '<div>'+(ALIGN?'Замер выполняется после выравнивания по линии зрачков: roll '+r1(rollRad()*180/Math.PI)+'°. Фото и точки повёрнуты вместе.':'Выравнивание выключено — компоненты в исходных координатах фото, значения могут отличаться от расчётных.')+'</div></div>'
        :'<div class="mi-note w" style="margin-top:8px">'+ic(I.warn)+'<div>Фото не загружено — показана схема метода. Числа не подставляются, чтобы не выдумывать замер.</div></div>')+
      '<div style="margin-top:11px">'+pl+'</div>'+
    '</div></div>'+
    '<div class="mi-card"><div class="mi-ch"><span class="bar"></span><h3>Твой тир</h3><span class="mi-sp"></span>'+
      '<span class="mi-tag'+(canSet?' m':'')+'">'+(canSet?'применится сразу':'открой экран оценки')+'</span></div><div class="mi-cb">'+
      '<div class="mi-trow">'+tbtn+'</div>'+
      '<div class="mi-kv" style="margin-top:8px">'+(canSet?'Тап меняет тир в основном приложении и пересчитывает скор.':'Метрика сейчас не на экране оценки — тир можно изменить там, где она отображается.')+'</div>'+
    '</div></div>'+
    '<div class="mi-g3"><button class="mi-btn" id="miReset">'+ic(I.reset)+'Сброс вида</button>'+
    '<button class="mi-btn" id="miPng">'+ic(I.down)+'PNG</button>'+
    '<button class="mi-btn pri" id="miCopy">'+ic(I.copy)+'Разбор</button></div>';
  right.scrollTop=0;
  right.querySelectorAll('.mi-tb').forEach(function(b){
    b.onclick=function(){
      var tt=+this.dataset.t;
      var target=document.querySelector('#view .tb[data-m="'+cur+'"][data-t="'+tt+'"]');
      ANS[cur]=tt;
      if(target){target.click();sfx('pick');hap();toast('Тир T'+tt+' применён');}
      else{sfx('off');toast('Метрика не на экране оценки');}
      try{root.dispatchEvent(new CustomEvent('lmx:tier',{detail:{id:cur,tier:tt}}))}catch(e){}
      renderDetail(tt);redraw();
    };
  });
  el.querySelector('#miReset').onclick=function(){V=JSON.parse(JSON.stringify(DEF));V.accent=accSaved;syncRail();redraw();sfx('ok');toast('Вид сброшен')};
  el.querySelector('#miPng').onclick=exportPng;
  el.querySelector('#miCopy').onclick=copyText;
}
function renderBrowse(){
  var right=el.querySelector('.mi-right');
  var all=order();
  var list=all.filter(function(m){
    if(filt!=='all'&&m.pillar!==filt)return false;
    if(q&&(m.ru+' '+(m.d||'')+' '+m.id).toLowerCase().indexOf(q)<0)return false;
    return true;
  });
  right.innerHTML=
    '<div class="mi-card"><div class="mi-ch"><span class="bar"></span><h3>Все метрики</h3><span class="mi-sp"></span>'+
    '<span class="mi-tag a">'+list.length+' / '+all.length+'</span></div><div class="mi-cb">'+
    '<input class="mi-search" id="miQ" placeholder="поиск: fwhr, canthal, скулы…" value="'+esc(q)+'">'+
    '<div class="mi-chips">'+[['all','Все'],['HARM','HARM'],['MISC','MISC'],['ANGU','ANGU'],['DIMO','DIMO']].map(function(x){
      return '<button class="mi-chip'+(filt===x[0]?' on':'')+'" data-f="'+x[0]+'">'+x[1]+'</button>'}).join('')+'</div>'+
    '<div class="mi-list">'+(list.length?list.map(function(m){
      var t=ANS[m.id]||null,v=D.geo&&D.geo[m.id]!=null?D.geo[m.id]:null;
      return '<button class="mi-li" data-open="'+m.id+'"><span class="lb" style="background:'+pillarC(m.pillar)+'"></span>'+
        '<span class="ln2">'+esc(m.ru)+'<small>'+m.pillar+' · '+m.id+(m.v==='S'?' · профиль':'')+'</small></span>'+
        '<span class="lv">'+(v!=null?fmtV(v,m.u):(t?'T'+t:'—'))+'</span></button>'}).join('')
      :'<div class="mi-empty">Ничего не найдено</div>')+'</div></div></div>';
  var qi=right.querySelector('#miQ');
  qi.oninput=function(){q=this.value.toLowerCase().trim();var p=this.selectionStart;renderBrowse();
    var n=el.querySelector('#miQ');n.focus();n.setSelectionRange(p,p)};
  right.querySelectorAll('[data-f]').forEach(function(b){b.onclick=function(){filt=this.dataset.f;sfx('nav');renderBrowse()}});
  right.querySelectorAll('[data-open]').forEach(function(b){b.onclick=function(){open(this.dataset.open)}});
}
function syncHead(){
  var m=cur?L.byId[cur]:null;
  el.querySelector('.mi-ht .n').textContent=m?m.ru:'Инспектор метрик';
  el.querySelector('.mi-ht .s').textContent=m?(m.pillar+' · '+m.id+' · '+(m.tiers)+' тиров'):'108 метрик · как это считается';
  var ord=order(),i=ord.findIndex(function(x){return x.id===cur});
  el.querySelector('#miPrev').disabled=!(mode==='detail'&&i>0);
  el.querySelector('#miNext').disabled=!(mode==='detail'&&i>=0&&i<ord.length-1);
  var sb=el.querySelector('#miSnd');sb.innerHTML=ic(SND?I.snd:I.mute,2.1);sb.classList.toggle('off',!SND);
}
function syncRail(){
  ['zoom','pt','lw','lab','photo','exp','con','iris'].forEach(function(k){
    var r=el.querySelector('#r_'+k);if(!r)return;r.value=V[k];
    var vv=el.querySelector('#v_'+k);if(vv)vv.textContent=labTxt(k,V[k]);
  });
  ['mesh','guides','pulse'].forEach(function(k){var s=el.querySelector('#s_'+k);if(s)s.classList.toggle('on',V[k])});
  el.querySelectorAll('[data-u]').forEach(function(b){b.classList.toggle('on',b.dataset.u===V.units)});
  el.querySelectorAll('[data-l]').forEach(function(b){b.classList.toggle('on',b.dataset.l===V.layer)});
  el.querySelectorAll('.mi-dot').forEach(function(d){d.classList.toggle('on',d.dataset.a===V.accent)});
  el.style.setProperty('--a',V.accent);
  var z=el.querySelector('#miZoomTag');if(z)z.textContent=V.zoom.toFixed(1)+'×';
}
function labTxt(k,v){
  if(k==='zoom')return v.toFixed(1)+'×';
  if(k==='pt')return v+' px';
  if(k==='lw')return v.toFixed(1)+' px';
  if(k==='iris')return v.toFixed(1)+' мм';
  return v+'%';
}
var accSaved='#2DD4FF';
function railHtml(){
  function rng(k,nm,min,max,step){
    return '<div class="mi-ctl"><span class="nm">'+nm+'</span><input type="range" id="r_'+k+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+V[k]+'"><span class="vv" id="v_'+k+'">'+labTxt(k,V[k])+'</span></div>'}
  function sw(k,nm){return '<div class="mi-ctl"><span class="nm">'+nm+'</span><div class="mi-sw'+(V[k]?' on':'')+'" id="s_'+k+'"></div></div>'}
  return '<div class="mi-rl">Визуализация · применяется мгновенно</div>'+
    rng('zoom','Масштаб',0.6,5,.1)+
    rng('pt','Размер точек',3,14,1)+
    rng('lw','Толщина линий',1,6,.2)+
    rng('lab','Подписи',0,100,5)+
    rng('photo','Видимость фото',0,100,5)+
    rng('exp','Экспозиция',40,180,5)+
    rng('con','Контраст',50,200,5)+
    rng('iris','Калибровка радужки',9,14,.1)+
    sw('mesh','Сетка 478 точек')+
    sw('guides','Направляющие трети')+
    sw('pulse','Скан-линия')+
    '<div class="mi-ctl"><span class="nm">Единицы</span><div class="mi-seg">'+
      '<button data-u="px" class="'+(V.units==='px'?'on':'')+'">px</button>'+
      '<button data-u="mm" class="'+(V.units==='mm'?'on':'')+'">мм</button></div></div>'+
    '<div class="mi-ctl"><span class="nm">Слой замера</span><div class="mi-seg">'+
      '<button data-l="all" class="'+(V.layer==='all'?'on':'')+'">всё</button>'+
      '<button data-l="num" class="'+(V.layer==='num'?'on':'')+'">числ.</button>'+
      '<button data-l="den" class="'+(V.layer==='den'?'on':'')+'">знам.</button></div></div>'+
    '<div class="mi-ctl"><span class="nm">Выравнивание по зрачкам</span><div class="mi-sw'+(ALIGN?' on':'')+'" id="s_align"></div></div>'+
    '<div class="mi-ctl"><span class="nm">Акцент</span><div class="mi-dots">'+
      ACCENTS.map(function(a){return '<span class="mi-dot'+(V.accent===a[1]?' on':'')+'" data-a="'+a[1]+'" style="background:'+a[1]+';color:'+a[1]+'"></span>'}).join('')+
    '</div></div>';
}
function bindRail(){
  ['zoom','pt','lw','lab','photo','exp','con','iris'].forEach(function(k){
    var r=el.querySelector('#r_'+k);if(!r)return;
    r.oninput=function(){V[k]=+this.value;el.querySelector('#v_'+k).textContent=labTxt(k,V[k]);
      if(k==='zoom')el.querySelector('#miZoomTag').textContent=V.zoom.toFixed(1)+'×';
      if(k==='iris'&&A){A.IRIS_MM=V[k]}
      redraw();if(mode==='detail'&&(k==='units'||k==='iris'))renderDetail();};
  });
  ['mesh','guides','pulse'].forEach(function(k){
    var s=el.querySelector('#s_'+k);if(!s)return;
    s.onclick=function(){V[k]=!V[k];this.classList.toggle('on',V[k]);sfx('nav');redraw()};
  });
  var sa=el.querySelector('#s_align');
  if(sa)sa.onclick=function(){ALIGN=!ALIGN;this.classList.toggle('on',ALIGN);sfx('nav');redraw();if(mode==='detail')renderDetail()};
  el.querySelectorAll('[data-u]').forEach(function(b){b.onclick=function(){V.units=this.dataset.u;sfx('nav');syncRail();redraw();if(mode==='detail')renderDetail()}});
  el.querySelectorAll('[data-l]').forEach(function(b){b.onclick=function(){V.layer=this.dataset.l;sfx('nav');syncRail();redraw()}});
  el.querySelectorAll('.mi-dot').forEach(function(d){d.onclick=function(){V.accent=this.dataset.a;accSaved=V.accent;sfx('pick');syncRail();redraw()}});
}

/* ─────────────── export ─────────────── */
function exportPng(){
  var m=cur?L.byId[cur]:null;
  var out=document.createElement('canvas');
  var w=cv.width,h=cv.height+Math.round(74*dpr);
  out.width=w;out.height=h;
  var c=out.getContext('2d');
  c.fillStyle='#06080C';c.fillRect(0,0,w,h);
  c.drawImage(cv,0,0);
  c.setTransform(dpr,0,0,dpr,0,0);
  var yy=cv.height/dpr+16;
  c.fillStyle='#E9F1F8';c.font='700 15px Space Grotesk, sans-serif';
  c.fillText(m?m.ru:'LOOKSSCAN',14,yy);
  var ms=m?measure(m,pts()):null;
  c.fillStyle=V.accent;c.font='700 13px JetBrains Mono, monospace';
  c.fillText(m&&ms?(fmtV(ms.value,m.u)+'   ·   идеал '+(L.idealOf(m,sex)?r2(L.idealOf(m,sex)[0])+'…'+r2(L.idealOf(m,sex)[1]):'—')):'',14,yy+22);
  c.fillStyle='#566A80';c.font='400 10px JetBrains Mono, monospace';
  c.fillText('LOOKSSCAN · инспектор замера · '+(D.lm?'реальное фото':'схема метода'),14,yy+40);
  var a=document.createElement('a');a.download='looksscan-'+(cur||'metric')+'.png';
  a.href=out.toDataURL('image/png');a.click();sfx('ok');toast('PNG сохранён');
}
function copyText(){
  var m=L.byId[cur];if(!m)return;
  var ms=measure(m,pts()),t=currentTier(cur),ib=L.idealOf(m,sex);
  var lines=['LOOKSSCAN · '+m.ru,'id: '+m.id+' · пиллар '+m.pillar,
    'значение: '+fmtV(ms.value,m.u),'идеал: '+(ib?r2(ib[0])+' … '+r2(ib[1]):'визуально'),
    'тир: '+(t?'T'+t+' ('+r2(m.p[t-1])+' pts)':'не выбран'),'','КАК ИЗМЕРЯЕТСЯ:',methodText(m)];
  if(ms.comps.length){lines.push('','КОМПОНЕНТЫ:');
    ms.comps.forEach(function(c){lines.push('  '+(c.role==='num'?'↑ ':'↓ ')+c.label+': '+fmtV(c.val,c.unit))})}
  lines.push('','ТОЧКИ:');usedPoints(m).forEach(function(k){lines.push('  '+k+' — '+(ANAT[k]||k))});
  var txt=lines.join('\n');
  function fb(){var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');toast('Разбор скопирован')}catch(e){toast('Не удалось скопировать')}ta.remove()}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(function(){sfx('ok');toast('Разбор скопирован')}).catch(fb);else fb();
}

/* ─────────────── open / close ─────────────── */
function open(id,hint){
  if(!L){return}
  css();bridge();buildNames();
  try{var s=JSON.parse(localStorage.getItem(LS)||'null');if(s&&s.cfg&&s.cfg.sex)sex=s.cfg.sex}catch(e){}
  if(!el){
    el=document.createElement('div');el.className='mi-root';el.setAttribute('role','dialog');
    el.setAttribute('aria-modal','true');el.style.setProperty('--a',V.accent);
    el.innerHTML=
      '<div class="mi-head"><div class="mi-mark">'+ic(I.ruler,2)+'</div>'+
      '<div class="mi-ht"><div class="n">—</div><div class="s">инспектор</div></div>'+
      '<button class="mi-ib" id="miList" aria-label="Все метрики">'+ic(I.list)+'</button>'+
      '<button class="mi-ib" id="miPrev" aria-label="Предыдущая">'+ic(I.prev,2.4)+'</button>'+
      '<button class="mi-ib" id="miNext" aria-label="Следующая">'+ic(I.next,2.4)+'</button>'+
      '<button class="mi-ib" id="miSnd" aria-label="Звук">'+ic(I.snd,2.1)+'</button>'+
      '<button class="mi-ib" id="miX" aria-label="Закрыть">'+ic(I.x,2.3)+'</button></div>'+
      '<div class="mi-body"><div class="mi-left">'+
        '<div class="mi-stage"><canvas id="miCv"></canvas>'+
        '<div class="mi-hud"><span class="mi-tag a" id="miSrcTag">—</span><span class="mi-tag m" id="miValTag">—</span></div>'+
        '<div class="mi-hud2"><span class="mi-tag" id="miZoomTag">1.0×</span></div>'+
        '<div class="mi-tip" id="miTip">Тяни — панорама · колесо / щипок — зум · двойной тап — сброс</div></div>'+
        '<div class="mi-rail mi-scroll" id="miRail">'+railHtml+'</div>'+
      '</div><div class="mi-right mi-scroll"></div></div><div class="mi-toasts"></div>';
    document.body.appendChild(el);
    ctrl=new AbortController();
    var sg={signal:ctrl.signal};
    cv=el.querySelector('#miCv');ctx=cv.getContext('2d');
    bindRail();
    el.querySelector('#miX').onclick=close;
    el.querySelector('#miList').onclick=function(){mode=mode==='browse'?'detail':'browse';sfx('nav');
      if(mode==='browse')renderBrowse();else renderDetail();syncHead()};
    el.querySelector('#miSnd').onclick=function(){setSound(!SND);syncHead();if(SND)sfx('ok')};
    el.querySelector('#miPrev').onclick=function(){step(-1)};
    el.querySelector('#miNext').onclick=function(){step(1)};
    ro=new ResizeObserver(size);ro.observe(el.querySelector('.mi-stage'));
    root.addEventListener('resize',size,sg);
    bindStage(sg);
    document.addEventListener('keydown',keys,sg);
    t0=0;raf=requestAnimationFrame(loop);
    sfx('open');
  }
  mode=id?'detail':'browse';
  cur=id||cur||(order()[0]&&order()[0].id);
  if(id&&ANS[id]==null&&hint)ANS[id]=hint;
  syncHead();syncRail();size();
  if(mode==='detail')renderDetail(hint);else renderBrowse();
  updateHud();redraw();
  var x=el.querySelector('#miX');if(x)x.focus();
}
function updateHud(){
  if(!el)return;
  var st=el.querySelector('#miSrcTag'),vt=el.querySelector('#miValTag');
  st.textContent=D.lm?'фото · 478 точек':(D.geo?'геометрия без фото':'схема метода');
  st.className='mi-tag '+(D.lm?'m':'w');
  var m=cur?L.byId[cur]:null;
  if(m){var ms=measure(m,pts());vt.textContent=fmtV(ms.value,m.u);vt.className='mi-tag a'}
  else{vt.textContent=order().length+' метрик';vt.className='mi-tag'}
}
function step(d){
  var ord=order(),i=ord.findIndex(function(x){return x.id===cur});
  if(i<0)i=0;var j=cl(i+d,0,ord.length-1);
  if(j===i)return;cur=ord[j].id;mode='detail';sfx('nav');hap();
  syncHead();renderDetail();updateHud();redraw();
}
function keys(e){
  if(!el)return;
  if(e.key==='Escape'){e.preventDefault();close();return}
  if(e.key==='ArrowRight'){step(1);return}
  if(e.key==='ArrowLeft'){step(-1);return}
  if(/^[1-8]$/.test(e.key)&&mode==='detail'&&cur){
    var m=L.byId[cur],t=+e.key;if(m&&t<=m.tiers){
      var tg=document.querySelector('#view .tb[data-m="'+cur+'"][data-t="'+t+'"]');
      ANS[cur]=t;if(tg)tg.click();sfx('pick');hap();renderDetail(t);redraw()}
    return}
  if(e.key==='Tab'){
    var f=el.querySelectorAll('button,input,[tabindex]');
    if(!f.length)return;
    var first=f[0],last=f[f.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
}
function bindStage(sg){
  var pan=false,last=null,pinch=0,dk=false;
  cv.addEventListener('pointerdown',function(e){
    e.preventDefault();try{cv.setPointerCapture(e.pointerId)}catch(x){}
    pan=true;last={x:e.clientX,y:e.clientY};dk=true;cv.style.cursor='grabbing';
  },sg);
  cv.addEventListener('pointermove',function(e){
    if(!pan||!last)return;
    V.px+=e.clientX-last.x;V.py+=e.clientY-last.y;last={x:e.clientX,y:e.clientY};redraw();
  },sg);
  function up(){pan=false;last=null;dk=false;cv.style.cursor=''}
  cv.addEventListener('pointerup',up,sg);cv.addEventListener('pointercancel',up,sg);
  cv.addEventListener('wheel',function(e){e.preventDefault();
    V.zoom=cl(V.zoom+(e.deltaY<0?.16:-.16),.6,5);syncRail();redraw()},{passive:false,signal:ctrl.signal});
  cv.addEventListener('dblclick',function(){V.zoom=1;V.px=0;V.py=0;syncRail();redraw();sfx('nav')},sg);
  cv.addEventListener('touchstart',function(e){if(e.touches.length===2){
    pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);pan=false}},{passive:true,signal:ctrl.signal});
  cv.addEventListener('touchmove',function(e){
    if(e.touches.length===2&&pinch){
      var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      V.zoom=cl(V.zoom*(d/pinch),.6,5);pinch=d;syncRail();redraw();e.preventDefault()}
  },{passive:false,signal:ctrl.signal});
  cv.addEventListener('touchend',function(){pinch=0},{passive:true,signal:ctrl.signal});
}
function close(){
  if(!el)return;
  sfx('off');
  if(raf)cancelAnimationFrame(raf);raf=0;
  if(ro){try{ro.disconnect()}catch(e){}ro=null}
  if(ctrl){try{ctrl.abort()}catch(e){}ctrl=null}
  el.remove();el=null;cv=null;ctx=null;
}

/* ─────────────── auto-wire ─────────────── */
function idFrom(node){
  var mc=node.closest('.mc[data-id]');if(mc)return mc.dataset.id;
  var bd=node.closest('.bdr');
  if(bd){var n=bd.querySelector('.bn2');if(n){
    var txt=n.textContent.replace(/пропуск/i,'').trim().toLowerCase();if(NAME2ID[txt])return NAME2ID[txt]}}
  var fl=node.closest('.flaw');
  if(fl){var f=fl.querySelector('.fn');if(f&&NAME2ID[f.textContent.trim().toLowerCase()])return NAME2ID[f.textContent.trim().toLowerCase()]}
  var fc=node.closest('.focus');
  if(fc){var h=fc.querySelector('.fh h3');if(h&&NAME2ID[h.textContent.trim().toLowerCase()])return NAME2ID[h.textContent.trim().toLowerCase()]}
  return null;
}
function tierFrom(node,id){
  var row=node.closest('.bdr')||node.closest('.flaw')||node.closest('.mc')||node.closest('.focus');
  if(row){var b=row.querySelector('.tbg')||row.querySelector('.tb.on');
    if(b){var t=(b.textContent||'').match(/T(\d)/);if(t)return +t[1];if(b.dataset&&b.dataset.t)return +b.dataset.t}}
  return ANS[id]||null;
}
var HIT='<button class="mi-hit" data-mi-hit="1" aria-label="Как измерялась метрика">'+
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M11 8.5v5M8.5 11h5"/></svg></button>';
var mo=null;
function decorate(){
  if(!L)return;
  var v=document.querySelector('#view');if(!v)return;
  v.querySelectorAll('.mc').forEach(function(c){
    var h=c.querySelector('.mh');
    if(h&&!h.querySelector('[data-mi-hit]')){h.insertAdjacentHTML('beforeend',HIT)}
    var n=c.querySelector('.mn');if(n)n.classList.add('mi-clickable');
    var th=c.querySelector('.thumb');if(th)th.classList.add('mi-clickable');
  });
  v.querySelectorAll('.bdr').forEach(function(r){
    if(!r.querySelector('[data-mi-hit]'))r.insertAdjacentHTML('beforeend',HIT);
    var n=r.querySelector('.bn2');if(n)n.classList.add('mi-clickable');
  });
  v.querySelectorAll('.flaw').forEach(function(r){
    if(!r.querySelector('[data-mi-hit]'))r.insertAdjacentHTML('beforeend',HIT);
    var n=r.querySelector('.fn');if(n)n.classList.add('mi-clickable');
  });
  var fc=v.querySelector('.focus .fh');
  if(fc&&!fc.querySelector('[data-mi-hit]')){
    fc.style.position='relative';
    var d=document.createElement('div');d.innerHTML=HIT;
    var b=d.firstChild;b.style.position='absolute';b.style.right='12px';b.style.top='12px';
    fc.appendChild(b);
    var h=fc.querySelector('h3');if(h)h.classList.add('mi-clickable');
  }
}
function wire(){
  if(!L)return;
  buildNames();bridge();
  document.addEventListener('click',function(e){
    if(el&&el.contains(e.target))return;
    var hit=e.target.closest('[data-mi-hit]');
    var zone=e.target.closest('.mn,.thumb,.mv,.bn2,.fn,.focus .fh h3');
    if(!hit&&!zone)return;
    if(e.target.closest('.tb,[data-ref]'))return;
    var host=hit||zone;
    var id=idFrom(host);if(!id)return;
    e.preventDefault();e.stopPropagation();
    hap();open(id,tierFrom(host,id));
  },true);
  var tb=document.querySelector('.top');
  if(tb&&!tb.querySelector('#miTopBtn')){
    var b=document.createElement('button');
    b.className='ib';b.id='miTopBtn';b.setAttribute('aria-label','Инспектор метрик');
    b.title='Как измеряются метрики';
    b.innerHTML=ic(I.ruler,2);
    b.onclick=function(){hap();open(null)};
    var sb=tb.querySelector('#setBtn');
    if(sb)tb.insertBefore(b,sb);else tb.appendChild(b);
  }
  decorate();
  var v=document.querySelector('#view')||document.body;
  mo=new MutationObserver(function(){
    if(mo.__busy)return;mo.__busy=true;
    try{decorate();if(el){updateHud();redraw()}}finally{mo.__busy=false}
  });
  mo.observe(v,{childList:true,subtree:true});
}

/* ─────────────── selftest ─────────────── */
function selftest(){
  var ok=!!L,recipes=0,covered=[];
  if(L){
    L.ALL.forEach(function(m){if(R[m.id]){recipes++;covered.push(m.id)}});
    var autos=L.list(null,{view:'F',mode:'A'}).filter(function(m){return m.sp});
    var missing=autos.filter(function(m){return !R[m.id]}).map(function(m){return m.id});
    var P=pts(),vals={};
    covered.forEach(function(id){var m=L.byId[id];var r=measure(m,P);vals[id]=r.value});
    var bs=bands(L.byId.fwhr,'m'),dm=bs?domain(bs,L.byId.fwhr,'m',1.97):null;
    return{ok:ok&&missing.length===0,version:VERSION,metrics:L.ALL.length,recipes:recipes,
      autoWithoutRecipe:missing,syntheticPoints:Object.keys(SYN.p).length,
      fwhrBands:bs?bs.length:0,fwhrDomain:dm,sampleValues:vals,
      bridge:{analyzer:!!(A&&A.__miPatched),metrics:!!L.__miPatched},
      wired:!!document.querySelector('#miTopBtn')};
  }
  return{ok:false,version:VERSION,reason:'LMX not loaded'};
}

/* ─────────────── boot ─────────────── */
var API={VERSION:VERSION,open:open,close:close,selftest:selftest,
  refresh:function(){if(el){updateHud();if(mode==='detail')renderDetail();else renderBrowse();redraw()}},
  data:function(){return D},recipes:R};
root.LMXInspector=API;
function boot(){css();bridge();wire()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
setTimeout(function(){bridge();wire()},1200);

})(typeof window!=='undefined'?window:this);
