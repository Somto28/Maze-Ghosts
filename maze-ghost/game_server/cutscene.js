// cutscene.js — the story cutscenes: "After Hours" (before Level 1) and "Watching" (between
// Level 2 and Level 3, where Dr. Voss feeds the Wardens Sam's personal data).
//
// Pixel art drawn in code on a 320×180 canvas and scaled up without smoothing, so there are no image
// files to load. Music and sound effects are synthesized with the Web Audio API.
//
//   import { playCutscene, cutsceneActive } from "./cutscene.js";
//   await playCutscene();                    // "After Hours"; resolves when it ends or is skipped
//   await playCutscene({ scene: "core" });   // "Watching", before Level 3
//
// While it plays it covers the screen and swallows every key, so the maze underneath can't move.
// Placeholder names to change: "Sam Reyes", "Dr. Voss", "Sub-Level 7" (search this file for them).
// Each shot in SHOTS has: dur (seconds), lines (dialogue: [start, end, speaker, text]), ev (sound cues)
// and draw(t), which paints the frame for time t within the shot.

let ctx = null;
const W = 320, H = 180;
const RM = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ---------- utils ---------- */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const seg=(t,a,b)=>clamp((t-a)/(b-a),0,1);
const lerp=(a,b,k)=>a+(b-a)*k;
const ease=k=>k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
const hash=n=>{const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s);};
function R(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function A(x,y,w,h,c,a){if(a<=0)return;ctx.globalAlpha=Math.min(1,a);R(x,y,w,h,c);ctx.globalAlpha=1;}
function line(x0,y0,x1,y1,c,dash=0,off=0){x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let e=dx+dy,i=0;off=Math.floor(Math.abs(off));ctx.fillStyle=c;
  for(;;){if(!dash||((i+off)%(dash*2))<dash)ctx.fillRect(x0,y0,1,1);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx}if(e2<=dx){e+=dx;y0+=sy}i++;}}
function cam(x,y,z=1,sx=0,sy=0){ctx.setTransform(z,0,0,z,Math.round(-Math.round(x)*z+sx),Math.round(-Math.round(y)*z+sy));}
function home(){ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;}
function shk(a,t){if(RM||a<=0)return[0,0];const k=Math.floor(t*40);return[(hash(k)-.5)*2*a,(hash(k+3)-.5)*2*a];}

/* ---------- 3x5 bitmap font ---------- */
const G={A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',O:'010101101101010',P:'110101110100100',Q:'010101101110011',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111',
'0':'111101101101111','1':'010110010010111','2':'110001010100111','3':'110001010001110','4':'101101111001001','5':'111100110001110','6':'011100111101111','7':'111001010010010','8':'111101111101111','9':'111101111001110',
'.':'000000000000010',':':'000010000010000','-':'000000111000000','_':'000000000000111','/':'001001010100100','>':'100010001010100','!':'010010010000010','?':'110001010000010','%':'101001010100101','#':'101111101111101','[':'110100100100110',']':'011001001001011','=':'000111000111000',',':'000000000010100','*':'000101010101000','+':'000010111010000','(':'010100100100010',')':'010001001001010',' ':'000000000000000'};
function txt(s,x,y,c,sc=1){s=String(s).toUpperCase();ctx.fillStyle=c;let cx=Math.round(x);y=Math.round(y);
  for(const ch of s){const g=G[ch];if(g)for(let i=0;i<15;i++)if(g[i]==='1')ctx.fillRect(cx+(i%3)*sc,y+Math.floor(i/3)*sc,sc,sc);cx+=4*sc;}}
const tw=(s,sc=1)=>String(s).length*4*sc-sc;
function txtC(s,cx,y,c,sc=1){txt(s,Math.round(cx-tw(s,sc)/2),y,c,sc);}
function txtO(s,x,y,c,sc=1,o='#000'){for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]])txt(s,x+dx,y+dy,o,sc);txt(s,x,y,c,sc);}
const typed=(s,t,at,cps=40)=>s.slice(0,Math.max(0,Math.floor((t-at)*cps)));

/* ---------- palettes ---------- */
const EMP={skin:'#e3a978',skinD:'#b97c55',hair:'#3b2416',shirt:'#9cc3e6',shirtD:'#6b93ba',tie:'#c0392b',pants:'#2b3046',pantsD:'#1b1e2c',shoe:'#0f0f12',bag:'#7a4b2a',bagD:'#55331c',badge:'#f2f2f2'};
const DOC={coat:'#d4d9e1',coatD:'#98a0ad',skin:'#d1ad93',skinD:'#a5836d',hair:'#8d8f94',pants:'#1d1f26',shoe:'#0b0b0e',glass:'#bfe6ff',glove:'#2c2f36',tie:'#5b1f6b'};

/* ---------- characters ---------- */
function emp(cx,gy,o={}){
  const d=o.dir||1,f=Math.max(0,o.frame||0),pose=o.pose||'idle';
  const P=(x,y,w,h,c)=>R(d>0?cx+x:cx-x-w,gy+y,w,h,c);
  let bob=0,lA=0,lB=0,aA=0,aB=0,ln=0;
  if(pose==='walk'){const ph=[0,1,0,-1][f%4];lA=ph*2;lB=-ph*2;aA=-ph;aB=ph;bob=(f%2)?-1:0;}
  else if(pose==='sneak'){const ph=[0,1,0,-1][f%4];lA=ph*2;lB=-ph*2;aA=1;aB=1;bob=1;ln=1;}
  else if(pose==='run'){const ph=[0,1,2,1,0,-1,-2,-1][f%8];lA=ph*2;lB=-ph*2;aA=(-ph*1.5)|0;aB=(ph*1.5)|0;bob=(f%2)?-1:0;ln=1;}
  else if(pose==='recoil'){ln=-1;}
  const y=bob;
  P(0,-10+y,3,5,EMP.pantsD);P(0+lB,-5,3,3,EMP.pantsD);P(0+lB,-2,4,2,EMP.shoe);
  P(-1+ln,-18+y,2,5,EMP.shirtD);P(-1+ln+aB,-13+y,2,3,EMP.shirtD);P(-1+ln+aB,-10+y,2,1,EMP.skinD);
  P(-6+ln,-15+y,3,6,EMP.bag);P(-6+ln,-15+y,3,1,EMP.bagD);
  P(-2,-10+y,3,5,EMP.pants);P(-2+lA,-5,3,3,EMP.pants);P(-2+lA,-2,4,2,EMP.shoe);
  P(-3+ln,-19+y,7,9,EMP.shirt);P(-3+ln,-19+y,1,9,EMP.shirtD);P(0+ln,-19+y,3,1,'#dfe9f3');P(1+ln,-18+y,1,5,EMP.tie);
  for(let i=0;i<7;i++)P(3-i+ln,-19+i+y,1,1,EMP.bagD);
  P(3+ln,-15+y,1,2,EMP.badge);P(-3+ln,-10+y,7,1,'#14151c');
  P(0+ln,-20+y,2,1,EMP.skinD);
  P(-2+ln,-27+y,7,7,EMP.skin);P(-2+ln,-28+y,7,2,EMP.hair);P(-3+ln,-27+y,3,4,EMP.hair);P(-3+ln,-23+y,1,1,EMP.hair);
  P(0+ln,-24+y,1,2,EMP.skinD);P(5+ln,-24+y,1,1,EMP.skin);
  if(o.shock||pose==='recoil'){P(2+ln,-26+y,2,2,'#ffffff');P(3+ln,-25+y,1,1,'#111');P(3+ln,-22+y,2,2,'#5a2a2a');}
  else{P(3+ln,-25+y,1,2,'#1a1a1a');P(3+ln,-22+y,2,1,EMP.skinD);}
  if(pose==='reach'){P(1+ln,-18+y,6,2,EMP.shirt);P(7+ln,-18+y,2,2,EMP.skin);}
  else if(pose==='recoil'){P(0+ln,-18+y,2,4,EMP.shirt);P(1+ln,-15+y,3,2,EMP.shirt);P(4+ln,-16+y,2,2,EMP.skin);}
  else{P(0+ln,-18+y,2,5,EMP.shirt);P(0+ln+aA,-13+y,2,3,EMP.shirt);P(0+ln+aA,-10+y,2,1,EMP.skin);}
}
function empFront(cx,gy,o={}){
  const ex=o.expr||'neutral';const P=(x,y,w,h,c)=>R(cx+x,gy+y,w,h,c);
  P(-4,-10,3,8,EMP.pants);P(1,-10,3,8,EMP.pants);P(-5,-2,4,2,EMP.shoe);P(1,-2,4,2,EMP.shoe);
  P(-7,-18,2,8,EMP.shirtD);P(-7,-10,2,2,EMP.skin);P(5,-18,2,8,EMP.shirtD);P(5,-10,2,2,EMP.skin);
  P(-5,-19,10,9,EMP.shirt);P(-5,-19,1,9,EMP.shirtD);P(4,-19,1,9,EMP.shirtD);
  P(-2,-19,4,1,'#dfe9f3');P(-1,-18,2,6,EMP.tie);
  for(let i=0;i<8;i++)P(3-i,-19+i,1,1,EMP.bagD);
  P(1,-15,2,3,EMP.badge);P(-5,-10,10,1,'#14151c');
  P(-1,-20,2,1,EMP.skinD);
  P(-4,-28,8,8,EMP.skin);P(-4,-29,8,3,EMP.hair);P(-5,-28,1,4,EMP.hair);P(4,-28,1,4,EMP.hair);
  P(-5,-25,1,2,EMP.skinD);P(4,-25,1,2,EMP.skinD);
  if(ex==='sleepy'){P(-3,-24,2,1,'#1a1a1a');P(1,-24,2,1,'#1a1a1a');P(-1,-22,2,2,'#5a2a2a');}
  else if(ex==='shock'){P(-3,-26,2,2,'#fff');P(1,-26,2,2,'#fff');P(-3,-25,1,1,'#111');P(2,-25,1,1,'#111');P(-1,-22,2,2,'#5a2a2a');P(-3,-27,2,1,EMP.hair);P(1,-27,2,1,EMP.hair);}
  else if(ex==='worried'){P(-3,-25,1,2,'#1a1a1a');P(2,-25,1,2,'#1a1a1a');P(-3,-26,2,1,EMP.hair);P(1,-26,2,1,EMP.hair);P(-1,-22,3,1,EMP.skinD);}
  else{P(-3,-25,1,2,'#1a1a1a');P(2,-25,1,2,'#1a1a1a');P(-1,-22,2,1,EMP.skinD);}
}
function doctor(cx,gy,o={}){
  const d=o.dir||1,pose=o.pose||'idle',f=o.frame||0;const P=(x,y,w,h,c)=>R(d>0?cx+x:cx-x-w,gy+y,w,h,c);
  P(-2,-9,3,7,DOC.pants);P(1,-9,3,7,'#15171d');P(-2,-2,4,2,DOC.shoe);P(1,-2,4,2,DOC.shoe);
  P(-3,-21,2,9,DOC.coatD);P(-3,-12,2,2,DOC.glove);
  P(-4,-22,9,15,DOC.coat);P(-4,-22,2,15,DOC.coatD);P(2,-15,1,8,DOC.coatD);P(-4,-8,9,1,DOC.coatD);
  P(2,-22,3,1,'#f4f6f8');P(3,-21,1,5,DOC.tie);P(-1,-19,1,2,'#3fd0c9');
  P(0,-23,3,1,DOC.skinD);
  P(-1,-31,7,8,DOC.skin);P(0,-31,4,1,'#e6c9b4');P(-2,-29,2,4,DOC.hair);P(-1,-25,1,1,DOC.hair);
  P(0,-27,1,2,DOC.skinD);P(3,-29,3,1,'#6c6e74');
  P(3,-28,3,2,o.glint?'#ffffff':DOC.glass);P(2,-28,1,1,'#222');
  P(6,-27,1,2,DOC.skin);
  P(3,-25,3,1,o.grin?'#e8e2d8':DOC.skinD);P(3,-24,3,1,'#b8957f');
  if(pose==='type'){const k=f%2;P(0,-21,2,6,DOC.coat);P(1,-16,7,2,DOC.coat);P(8,-16+k,2,2,DOC.glove);}
  else if(pose==='point'){P(1,-20,8,2,DOC.coat);P(9,-20,2,2,DOC.glove);}
  else{P(0,-21,2,9,DOC.coat);P(0,-12,2,2,DOC.glove);}
  if(o.glint){P(5,-31,1,1,'#fff');P(7,-29,1,1,'#fff');P(6,-30,1,1,'#fff');P(8,-30,1,1,'#bfe6ff');}
}
function warden(cx,gy,o={}){
  const e=o.eye||0,look=o.look||0,st=o.step||0,t=o.t||0;const P=(x,y,w,h,c)=>R(cx+x,gy+y,w,h,c);
  const y=-(st%2);
  P(-9,-6,7,6,'#151920');P(2,-6,7,6,'#151920');P(-9,-4+(st%2),7,1,'#262c38');P(2,-4+((st+1)%2),7,1,'#262c38');
  P(-6,-10+y,12,4,'#20252f');
  P(-13,-23+y,3,10,'#2c323e');P(10,-23+y,3,10,'#2c323e');
  P(-14,-13+y,2,3,'#555e6e');P(-12,-13+y,2,2,'#555e6e');P(12,-13+y,2,3,'#555e6e');P(10,-13+y,2,2,'#555e6e');
  P(-10,-25+y,20,15,'#3a4150');P(-10,-25+y,20,2,'#55607a');P(-10,-12+y,20,2,'#262b36');P(-10,-25+y,2,15,'#2c323e');P(8,-25+y,2,15,'#2c323e');
  P(-6,-19+y,12,2,e>.5?'#ff3b4a':'#1f6f6b');P(-6,-15+y,12,1,'#262b36');P(-6,-17+y,12,1,'#2f3542');
  P(-2,-27+y,4,2,'#20252f');
  P(-8,-36+y,16,9,'#3a4150');P(-8,-36+y,16,1,'#5b6578');
  P(-6,-34+y,12,5,'#06080b');
  const ex=Math.round(look*3+(e>.5?Math.sin(t*2+cx):0));
  const ec=e>.5?'#ff2e3e':(e>.05?'#6a1a22':'#1a1d24');
  P(-2+ex,-33+y,4,2,ec);
  if(e>.5){P(-1+ex,-33+y,2,1,'#ffb0b6');A(cx-7+ex,gy-37+y,14,9,'#ff2e3e',.2*e);}
  P(5,-40+y,1,4,'#4a5262');P(5,-41+y,1,1,(e>.5&&Math.floor(t*3)%2)?'#ff3b4a':'#2a2f3a');
}
function logo(cx,cy,c,s){const q=(x,y,w,h)=>R(cx+x*s,cy+y*s,w*s,h*s,c);
  q(-2,-4,5,1);q(-2,4,5,1);q(-4,-2,1,5);q(4,-2,1,5);q(-3,-3,1,1);q(3,-3,1,1);q(-3,3,1,1);q(3,3,1,1);
  for(let i=-2;i<=1;i++)q(i,-i,1,1);q(1,-2,2,1);q(2,-2,1,2);}

/* ---------- skyline ---------- */
const SKY=[];{let x=-90,i=0;while(x<720){const w=14+Math.floor(hash(i)*22),h=20+Math.floor(hash(i+50)*50);SKY.push({x,w,h,i});x+=w+1+Math.floor(hash(i+9)*4);i++;}}
function skyline(ox,baseY,cB,cW){for(const b of SKY){const x=b.x+ox;R(x,baseY-b.h,b.w,b.h,cB);
  for(let wy=baseY-b.h+3;wy<baseY-2;wy+=4)for(let wx=x+2;wx<x+b.w-2;wx+=3){const k=hash(b.i*31+(wx-x)*7+wy*13);if(k>.74)R(wx,wy,1,2,k>.94?'#ffe9a8':cW);}}}

/* ---------- elevator ---------- */
function drawElevator(cx,gy,o={}){
  const x0=cx-22,y0=gy-54,op=o.open||0;
  if(!o.doorsOnly){
    R(x0-4,y0-6,52,60,'#3d475f');R(x0-4,y0-6,52,1,'#58637f');R(x0-2,y0-4,48,58,'#2a3147');
    if(op>0){const red=o.red;R(x0,y0,44,54,red?'#4a1e26':'#cbbf98');R(x0,y0,44,3,red?'#ff4656':'#fff4d6');R(x0+4,y0+30,36,1,red?'#2c1418':'#9a9070');
      R(x0,y0+46,44,8,red?'#2c1418':'#6d6656');A(x0-6,gy,56,8,red?'#ff4656':'#ffe2a0',.14*op);}
    R(cx-10,y0-15,20,8,'#08080b');R(cx-11,y0-16,22,1,'#58637f');
    if(o.num!=null)txtC(String(o.num),cx+2,y0-13,o.numCol||'#ffb347');
    if(o.arrow!=null){const c=o.arrow?'#ffb347':'#3a3220';R(cx-8,y0-11,3,1,c);R(cx-7,y0-12,1,1,c);}
  }
  const half=Math.round(22*(1-op));
  if(half>0){R(x0,y0,half,54,'#7d889e');R(x0+44-half,y0,half,54,'#7d889e');R(x0+half-1,y0,1,54,'#5d6779');R(x0+44-half,y0,1,54,'#5d6779');
    for(let yy=y0+4;yy<y0+54;yy+=6){A(x0,yy,half,1,'#ffffff',.07);A(x0+44-half,yy,half,1,'#ffffff',.07);}}
}

/* ---------- hallway (floor 14) ---------- */
const HALL_W=560,LIGHTS=[36,136,236,336,436];
function drawHall(cx,t,o={}){
  R(0,0,HALL_W,22,'#11152a');R(0,20,HALL_W,2,'#1c2240');
  R(0,22,HALL_W,110,'#29304d');for(let x=0;x<HALL_W;x+=48)R(x,22,1,82,'#232a44');
  R(0,103,HALL_W,1,'#3b4568');R(0,104,HALL_W,28,'#232a45');R(0,130,HALL_W,2,'#181d33');
  for(const wd of[{x:96,w:124},{x:248,w:96}]){
    R(wd.x-2,32,wd.w+4,62,'#10142a');
    ctx.save();ctx.beginPath();ctx.rect(wd.x,34,wd.w,58);ctx.clip();
    R(wd.x,34,wd.w,58,'#0b1026');A(wd.x,66,wd.w,26,'#2a3266',.45);
    const mx=Math.round(190+cx*.9);R(mx,42,6,6,'#e4dfc4');R(mx-1,43,8,4,'#e4dfc4');
    skyline(Math.round(cx*.65),92,'#161c3c','#c79a4a');
    ctx.restore();
    for(let m=wd.x+31;m<wd.x+wd.w;m+=31)R(m,34,2,58,'#10142a');
    R(wd.x,62,wd.w,1,'#10142a');A(wd.x,34,wd.w,2,'#7f8fc8',.22);
  }
  // office door
  const dO=o.doorOpen||0;R(24,78,34,54,'#171c33');R(27,81,28,51,'#0d1020');
  if(dO>0){A(27,81,28,51,'#ffe2a0',.35*dO);A(18,132,46,10,'#ffe2a0',.1*dO);}
  const dw=Math.max(3,Math.round(28*(1-dO*.85)));R(27,81,dw,51,'#46526f');R(27,81,dw,1,'#5b6889');
  if(dw>9){R(31,86,dw-8,12,'#9fd4ff');A(31,86,dw-8,12,'#ffffff',.12);R(27+dw-4,106,2,2,'#c9cfdb');}
  R(30,70,22,7,'#3b4566');txt('1407',33,71,'#c9d3ea');
  // poster
  R(360,42,36,50,'#0e1224');R(362,44,32,46,'#123a40');logo(378,56,'#3fd0c9',1);txtC('PREDICT',378,70,'#bff7f2');txtC('TOMORROW',378,77,'#bff7f2');R(366,85,24,1,'#3fd0c9');
  // water cooler
  R(226,110,12,22,'#bcc7d8');R(226,110,12,1,'#dbe3ef');R(228,94,8,16,'#5fa8e6');A(228,94,3,16,'#ffffff',.2);R(230,116,4,2,'#3a4458');
  // plant
  R(406,118,14,14,'#5e4034');R(405,118,16,2,'#7a5444');
  for(const[x,y,h]of[[412,100,18],[409,104,14],[416,103,15],[406,108,10],[419,107,11]])R(x,y,2,h,hash(x)>.5?'#2f6b4a':'#3f8a5e');
  // elevator + panel
  drawElevator(470,132,{open:o.open||0,num:o.num,arrow:o.arrow});
  R(500,100,8,16,'#4c5772');R(500,100,8,1,'#6b7694');R(501,104,6,6,'#8b95aa');R(502,105,4,4,o.btn?'#ffb347':'#1d2230');
  if(o.btn)A(496,100,16,14,'#ffb347',.22);
  // floor
  R(0,132,HALL_W,48,'#1a2035');for(const yy of[138,146,158,174])R(0,yy,HALL_W,1,'#20273f');
  A(96,134,124,6,'#4b5aa0',.06);A(248,134,96,6,'#4b5aa0',.06);
  // lights
  LIGHTS.forEach((lx,i)=>{let on=1;if(o.flick===i)on=hash(Math.floor(t*14))>.45?1:0;
    R(lx,20,28,2,on?'#e6eeff':'#3d4462');if(on){A(lx-8,22,44,8,'#bcd2ff',.07);A(lx-14,22,56,30,'#9fb6ff',.04);A(lx,133,28,2,'#9fb6ff',.18);}
    else A(lx-40,0,108,180,'#000000',.25);});
  A(0,0,HALL_W,180,'#060914',.12);
}

/* ---------- elevator interior ---------- */
function drawCar(t,o){
  const[sx,sy]=shk(o.shake||0,t);ctx.setTransform(2,0,0,2,Math.round(sx),Math.round(sy));
  R(-6,-6,172,102,'#6b7586');R(-6,-6,14,102,'#5b6474');R(152,-6,14,102,'#5b6474');
  for(let i=0;i<4;i++){R(10+i*36,18,32,52,'#768194');R(10+i*36,18,32,1,'#8b96a8');}
  R(8,54,144,2,'#c9ced8');R(20,56,2,4,'#9aa1ad');R(138,56,2,4,'#9aa1ad');
  const lc=o.red?'#ff4656':'#fff4d6';R(50,0,60,3,o.lightOff?'#3a3a3a':lc);if(!o.lightOff)A(36,3,88,22,lc,.08);
  R(-6,72,172,24,'#3a3f4a');R(-6,72,172,1,'#4b515e');
  R(64,4,32,11,'#120808');R(63,3,34,1,'#9aa1ad');txtC(o.disp,80,7,o.dispCol||'#ff4d3a');
  R(136,26,12,30,'#a7afbd');R(136,26,12,1,'#c9ced8');
  for(let r=0;r<6;r++)for(let c=0;c<2;c++){const lit=(r===5&&c===0);R(138+c*5,29+r*4,3,2,lit?'#ffb347':'#5c6474');}
  empFront(80,76,{expr:o.expr});
  if(o.red)A(-6,-6,172,102,'#ff1e2e',o.redA||0);
  if(o.dark)A(-6,-6,172,102,'#000000',o.dark);
  home();
}

/* ---------- basement / Sub-Level 7 ---------- */
const BASE_W=640,PODS=[250,296,342,388,434];
function drawBase(cx,t,o={}){
  R(0,0,BASE_W,132,'#0b0f15');
  for(let r=0;r<8;r++){const y=24+r*13;R(0,y,BASE_W,1,'#10151e');for(let x=(r%2)*14;x<BASE_W;x+=28)R(x,y,1,13,'#10151e');}
  R(0,0,BASE_W,10,'#06080c');R(0,10,BASE_W,4,'#1a212c');R(0,11,BASE_W,1,'#2a3341');R(0,17,BASE_W,2,'#202734');
  for(const px of[120,228,480])R(px,14,3,22,'#1a212c');
  for(const bx of[180,360,520]){const on=o.alarm&&Math.sin(t*9+bx)>0;R(bx,14,6,4,on?'#ff3b4a':'#3a1015');if(on)A(bx-34,18,74,114,'#ff2e3e',.1);}
  // tunnel
  R(4,80,34,52,'#000000');for(let i=0;i<10;i++)R(2+i*4,76,4,4,i%2?'#111111':'#c99a2e');R(2,80,2,52,'#c99a2e');R(38,80,2,52,'#c99a2e');txt('TUNNEL',9,68,'#5d6579');
  // elevator
  drawElevator(82,132,{open:o.elevOpen==null?1:o.elevOpen,red:true,num:'B7',numCol:'#ff4656'});
  // racks
  for(let i=0;i<3;i++){const x=128+i*30;R(x,58,26,74,'#10151e');R(x,58,26,1,'#1f2735');
    for(let r=0;r<9;r++){const y=62+r*7;R(x+2,y,22,5,'#0b0f16');for(let k=0;k<4;k++){const on=hash(i*100+r*10+k+Math.floor(t*(2+k)))>.45;R(x+3+k*3,y+2,1,1,on?(k===3?'#ffb347':'#39f5c4'):'#16301f');}}}
  // pods
  PODS.forEach((px,i)=>{
    R(px-18,62,36,70,'#121821');R(px-18,62,36,2,'#2a3444');R(px-16,66,32,64,'#070a0e');A(px-16,66,32,64,'#3fd0c9',.04);
    R(px-9,54,19,7,'#0e131b');txtC('W-0'+(i+1),px+1,55,'#4d5a6e');
    if(!(o.wOut&&o.wOut[i]))warden(px,128,{eye:o.eyes?o.eyes[i]:0,t,look:o.look?o.look[i]:0});
    const go=o.podOpen||0,gh=Math.round(64*(1-go));
    if(gh>0){A(px-16,66,32,gh,'#7fe9e3',.08);R(px-16,66+gh-1,32,1,'#3fd0c9');A(px-12,68,2,Math.max(0,gh-4),'#ffffff',.08);}
    R(px-18,130,36,2,(o.eyes&&o.eyes[i]>.5)?'#ff3b4a':'#1f6f6b');
  });
  // station
  R(558,38,76,48,'#161c26');R(560,40,72,44,'#071513');
  for(let r=0;r<8;r++){const y=43+r*4,len=Math.floor(hash(r*7+Math.floor(t*5+r*.3))*58)+6;R(564,y,len,1,r===5?'#ff4656':'#39f5c4');}
  if(Math.floor(t*2)%2)txt('CONFIDENTIAL',572,77,'#ff4656');
  R(534,62,22,16,'#161c26');R(536,64,18,12,'#071513');for(let r=0;r<3;r++)R(538,66+r*3,Math.floor(hash(r+Math.floor(t*3))*12)+2,1,'#39f5c4');
  A(500,30,140,102,'#39f5c4',.05);
  // floor
  R(0,132,BASE_W,48,'#090c11');R(0,132,BASE_W,1,'#1a212c');for(let x=0;x<BASE_W;x+=20)R(x,140,1,40,'#0d1118');R(0,150,BASE_W,1,'#0d1118');
  for(let x=110;x<560;x+=2)R(x,166+Math.round(Math.sin(x*.06)*2),2,1,'#151b24');
  A(520,133,120,12,'#39f5c4',.06);
  // desk (front plane)
  R(574,138,44,3,'#1c232e');R(576,141,2,15,'#141a22');R(614,141,2,15,'#141a22');R(578,136,12,2,'#2b3442');
}
function can(x,down,t){if(!down){R(x-2,150,4,6,'#9a2c2c');R(x-2,150,4,1,'#c9c9c9');}else{R(x-3,152,6,4,'#9a2c2c');R(x-3,152,1,4,'#c9c9c9');}}

/* ---------- close-ups ---------- */
function samFace(t){
  cam(0,0,4);
  R(0,0,80,45,'#061115');A(58,0,22,45,'#39f5c4',.07);
  R(24,0,32,6,EMP.hair);R(23,2,3,12,EMP.hair);R(54,2,3,12,EMP.hair);
  R(23,13,3,6,EMP.skinD);R(54,13,3,6,EMP.skinD);
  R(26,4,28,26,EMP.skin);R(28,4,10,3,EMP.hair);R(44,4,8,2,EMP.hair);
  R(34,30,12,4,EMP.skinD);R(18,33,44,12,EMP.shirt);R(34,33,12,3,'#dfe9f3');R(38,34,4,11,EMP.tie);
  const s=seg(t,.3,.7),by=10-Math.round(s*2);R(29,by,8,2,EMP.hair);R(43,by,8,2,EMP.hair);
  R(29,13,8,5,'#f2f2f2');R(43,13,8,5,'#f2f2f2');
  const ps=s>.5?2:3,jx=s>.5?Math.round(Math.sin(t*25)*.6):0;R(32+jx,14,ps,ps,'#1a1a1a');R(46+jx,14,ps,ps,'#1a1a1a');
  R(30,14,1,1,'#39f5c4');R(44,14,1,1,'#39f5c4');
  R(39,17,3,5,EMP.skinD);
  if(s>.5){R(35,23,10,4,'#4a1f22');R(36,23,8,1,'#efe9e0');}else R(36,24,8,1,'#a8694a');
  if(t>1.6){const sy=8+Math.min(10,(t-1.6)*5);R(53,sy,2,3,'#9fe7ff');R(53,sy,1,1,'#ffffff');}
  A(26,4,28,26,'#39f5c4',.14);
  for(let k=0;k<5;k++){const yy=4+((k*9+Math.floor(t*14))%26);A(28,yy,24,1,'#39f5c4',.14);}
  A(0,0,12,45,'#000000',.45);A(68,0,12,45,'#000000',.45);
  home();
}
function vossFace(t){
  cam(0,0,4);
  R(0,0,80,45,'#07090e');A(2,4,18,12,'#39f5c4',.12);A(60,6,18,14,'#39f5c4',.1);
  R(23,15,3,5,DOC.skinD);R(54,15,3,5,DOC.skinD);
  R(26,3,28,27,DOC.skin);R(28,2,24,1,DOC.skin);R(31,1,18,1,DOC.skin);R(32,2,10,1,'#e8cbb6');
  R(26,9,2,8,DOC.hair);R(52,9,2,8,DOC.hair);R(25,11,1,5,DOC.hair);R(54,11,1,5,DOC.hair);A(26,20,4,8,'#000000',.15);A(50,20,4,8,'#000000',.15);
  A(26,1,28,9,'#000000',.3);
  R(33,29,14,3,DOC.skinD);
  R(14,31,52,14,DOC.coat);R(14,31,52,1,'#f4f6f8');line(30,31,36,44,DOC.coatD);line(50,31,44,44,DOC.coatD);R(34,30,12,4,'#e8ecef');R(38,31,4,14,DOC.tie);
  line(29,10,37,13,'#5d5f66');line(29,11,37,14,'#5d5f66');line(51,10,43,13,'#5d5f66');line(51,11,43,14,'#5d5f66');
  R(28,13,11,7,'#1c1c22');R(41,13,11,7,'#1c1c22');R(39,15,2,1,'#1c1c22');
  R(29,14,9,5,'#a9dbe9');R(42,14,9,5,'#a9dbe9');R(29,14,2,1,'#ffffff');R(42,14,2,1,'#ffffff');
  for(const[a,b]of[[.9,1.4],[4.4,4.9]]){if(t>=a&&t<b){const g=Math.round(seg(t,a,b)*16)-3;
    for(const lx of[29,42])for(let k=0;k<5;k++){const px=lx+g-k;if(px>=lx&&px<lx+8)R(px,14+k,2,1,'#ffffff');}
    if(seg(t,a,b)>.4&&seg(t,a,b)<.7){R(52,11,1,5,'#ffffff');R(50,13,5,1,'#ffffff');}}}
  R(39,18,3,7,DOC.skinD);R(38,24,5,1,'#8f6b55');
  if(t>2.1){R(34,26,12,1,'#e8e2d8');R(33,27,14,1,'#4a2a24');R(32,26,1,1,'#4a2a24');R(47,26,1,1,'#4a2a24');}
  else R(34,27,12,1,'#5a3328');
  A(27,24,26,6,'#3a2e2a',.25);
  A(26,18,28,12,'#39f5c4',.16);
  A(0,0,12,45,'#000000',.5);A(68,0,12,45,'#000000',.5);
  home();
}

/* ---------- shots ---------- */
const LOG=[
 ['> CONNECTING TO CLEARPATH ARCHIVE... OK','#39f5c4'],
 ['> LOAD EMPLOYEE_HR_RECORDS.DB   4,812 FILES','#39f5c4'],
 ['> LOAD CUSTOMER_MEDICAL.CSV     1.2M ROWS','#39f5c4'],
 ['> LOAD PRIVATE_MESSAGES.ZIP     88 GB','#39f5c4'],
 ['> LOAD HOME_ADDRESSES + GPS LOGS','#39f5c4'],
 ['> CONSENT ON FILE: NONE','#ff4656'],
 ['> LEGAL REVIEW: SKIPPED','#ff4656'],
 ['> FEEDING WARDEN PREDICTION MODEL...','#ffb347'],
];
function evEvery(name,a,b,step){const out=[];for(let t=a;t<b-1e-6;t+=step)out.push([+t.toFixed(3),name]);return out;}
const HALL={t0:1.2,x0:40,sp:46,x1:494};HALL.tA=HALL.t0+(HALL.x1-HALL.x0)/HALL.sp;
const S4={t0:1.4,x0:82,x1:470,sp:42};S4.tA=S4.t0+(S4.x1-S4.x0)/S4.sp;
const RUN={t0:.3,x0:470,sp:100};

const SHOTS=[
{name:'Establishing',note:'Static wide on the Clearpath tower. Title and timestamp.',dur:5,fi:.8,fo:.4,nobars:true,music:()=>'office',
 ev:[],lines:[],
 draw(t){
  R(0,0,W,H,'#05060c');
  for(let i=0;i<60;i++){const x=Math.floor(hash(i)*W),y=Math.floor(hash(i+99)*120)+12;R(x,y,1,1,hash(i+Math.floor(t*3+i))>.85?'#8a95c8':'#2e3660');}
  R(266,24,6,8,'#d9d4b8');R(265,25,8,6,'#d9d4b8');R(268,23,6,8,'#05060c');
  skyline(Math.round(-30-t*2),180,'#0c1022','#4d3f24');
  R(144,92,34,88,'#131936');R(144,92,34,1,'#2a3360');R(144,92,1,88,'#1c2347');R(160,78,2,14,'#2a3360');R(160,77,2,1,(Math.floor(t*1.5)%2)?'#ff3b4a':'#4a1a20');
  logo(161,100,'#3fd0c9',1);
  for(let fy=108;fy<178;fy+=5)for(let fx=148;fx<176;fx+=4){const lit=fx===152&&fy===118;R(fx,fy,2,2,lit?'#ffcf6b':(hash(fx*3+fy)>.9?'#3a3a52':'#1a2040'));}
  A(149,115,8,8,'#ffcf6b',.14);
  ctx.globalAlpha=seg(t,.4,1.4);logo(160,18,'#3fd0c9',2);txtC('CLEARPATH INDUSTRIES',160,34,'#e6f7f6',2);
  ctx.globalAlpha=seg(t,1.2,2);txtC('WE SEE WHAT COMES NEXT.',160,50,'#3fd0c9');ctx.globalAlpha=1;
  const loc=typed('TOWER B  /  FLOOR 14  /  11:47 PM',t,2.4,22);txt(loc,14,160,'#ffb347');
  if(t>2.4&&Math.floor(t*3)%2)R(14+tw(loc)+3,160,3,5,'#ffb347');
 }},
{name:'Hallway',top:true,note:'Side-scrolling tracking shot. Parallax skyline, one flickering light, foreground pillar for depth.',dur:12.2,fi:.4,fo:.3,music:()=>'office',
 ev:[...evEvery('step',HALL.t0,HALL.tA,.25),[6.3,'buzz'],[7.4,'buzz']],
 lines:[[1.4,5.6,'SAM','Midnight again. At least the Warden demo is finally ready.'],[7.2,10.8,'SAM','...Those lights have been flickering all week.']],
 draw(t){
  const{t0,x0,sp,x1,tA}=HALL,walking=t>t0&&t<tA,x=t<=t0?x0:Math.min(x1,x0+(t-t0)*sp),cx=clamp(x-130,0,HALL_W-W);
  cam(cx,0);
  drawHall(cx,t,{flick:(t>6.2&&t<9)?3:-1,doorOpen:1-seg(t,1.9,2.4),open:0,num:3,arrow:false});
  emp(x,156,{dir:1,pose:walking?'walk':'idle',frame:Math.floor((t-t0)*8)});
  home();const fx=Math.round(430-cx*1.35);R(fx,0,12,180,'#04060c');R(fx+12,0,1,180,'#141a30');
 }},
{name:'Call button',note:'Locked-off wide. Insert close-up on the press, then the doors open.',dur:8.4,music:()=>'office',
 ev:[[1.5,'beep'],[4.8,'ding'],[4.9,'doors'],...evEvery('step',6,7,.25),[7.4,'doors']],lines:[],
 draw(t){
  if(t>=1&&t<2.3){
   R(0,0,W,H,'#29304d');for(let x=0;x<W;x+=48)R(x,0,1,H,'#232a44');
   R(100,36,120,116,'#3a4460');R(104,40,112,108,'#4c5772');R(104,40,112,2,'#6b7694');
   for(const[x,y]of[[110,46],[206,46],[110,140],[206,140]])R(x,y,3,3,'#2a3147');
   txtC('CALL',160,56,'#c9d3ea',2);
   const pr=t>=1.5;R(138,74,48,48,'#8b95aa');R(134,78,56,40,'#8b95aa');R(142,78,40,40,pr?'#ffb347':'#1d2230');R(138,82,48,32,pr?'#ffb347':'#1d2230');
   if(pr){A(126,66,72,64,'#ffb347',.18);R(146,82,10,2,'#ffe1a8');}
   const ac=pr?'#7a4a10':'#4a5470';for(let i=0;i<8;i++)R(162-i,90+i,i*2+1,1,ac);
   const fx=t<1.85?lerp(320,170,ease(seg(t,1.05,1.45))):lerp(170,320,ease(seg(t,1.85,2.25)));
   R(fx,94,40,10,EMP.skin);R(fx,94,40,2,'#f0c39b');R(fx-2,96,3,6,EMP.skin);R(fx+1,94,4,3,'#f5d7bf');
   R(fx+30,86,40,26,EMP.skin);R(fx+30,110,40,2,EMP.skinD);R(fx+36,104,22,8,EMP.skinD);R(fx+66,80,70,40,EMP.shirt);R(fx+66,80,4,40,EMP.shirtD);
   return;
  }
  cam(240,0);
  const num=t<2.5?3:Math.min(14,3+Math.floor((t-2.5)/.2)),open=ease(seg(t,4.9,5.8))*(1-ease(seg(t,7.4,8.2)));
  drawHall(240,t,{doorOpen:0,open,num,arrow:t>=4.8,btn:t>=1.5&&t<5.8});
  if(t<6){const reach=(t>=.6&&t<1)||(t>=2.3&&t<2.5);emp(494,156,{dir:1,pose:reach?'reach':'idle'});}
  else if(t<7){const k=seg(t,6,7);emp(lerp(494,470,k),lerp(156,131,k),{dir:-1,pose:'walk',frame:Math.floor((t-6)*8)});}
  else empFront(470,131,{expr:'neutral'});
  if(t>=7)drawElevator(470,132,{open,doorsOnly:true});
  home();
 }},
{name:'The ride',note:'Interior at 2× zoom. Floors count down past the lobby and keep going.',dur:7.5,music:t=>t<5?'muzak':'tense',
 ev:[[5,'lurch'],[6.2,'lurch']],lines:[[5.3,7.5,'SAM','Huh? I pressed Lobby. Why are we still going down?']],
 draw(t){
  let disp=t<4.2?String(Math.max(1,14-Math.floor(t/.3))):t<5?'L':t<6.2?'B1':'B2';
  const expr=t>=5.2?'worried':(t>2&&t<3.4)?'sleepy':'neutral';
  drawCar(t,{disp,expr,shake:t>=5?.6:0,dark:t>=6.2&&t<6.4?.4:0});
 }},
{name:'Shaft cutaway',note:'Vertical tracking shot down the shaft, past B1 and into floors that aren\'t on any plan.',dur:6,fi:.2,fo:.3,music:()=>'tense',
 ev:[...evEvery('rumble',0,5.6,.55)],lines:[],
 draw(t){
  const carY=lerp(150,548,ease(seg(t,.2,5.6))),camY=clamp(carY-70,0,460),[sx,sy]=shk(.5,t);cam(0,camY,1,sx,sy);
  R(0,0,320,212,'#0f1322');
  const FL=[{y:20,l:'FLOOR 3'},{y:68,l:'FLOOR 2'},{y:116,l:'LOBBY'},{y:164,l:'B1 PARKING'}];
  FL.forEach((f,i)=>{R(0,f.y+44,320,4,'#3a4058');
    if(i<2){for(const dx of[24,74,206,256]){R(dx,f.y+34,30,3,'#232a44');R(dx+2,f.y+37,2,7,'#1b2136');R(dx+26,f.y+37,2,7,'#1b2136');R(dx+10,f.y+26,8,8,'#1b2240');A(dx+11,f.y+27,6,6,'#5f7fc8',.15);}}
    if(i===2){R(40,f.y+30,50,14,'#1d2a3a');logo(65,f.y+36,'#3fd0c9',1);R(220,f.y+22,4,22,'#2f6b4a');R(216,f.y+40,12,4,'#5e4034');}
    if(i===3){for(const dx of[22,80,200,258]){R(dx,f.y+32,36,8,'#1b2033');R(dx+6,f.y+28,22,5,'#1b2033');R(dx+4,f.y+39,6,4,'#0b0d14');R(dx+26,f.y+39,6,4,'#0b0d14');}}
    txt(f.l,8,f.y+4,'#5d6579');});
  R(0,212,320,320,'#1e1712');
  for(let k=0;k<13;k++)for(let x=0;x<320;x+=8)R(x,222+k*24+Math.round(Math.sin(x*.05+k)*3),8,3,'#2a1f18');
  for(let i=0;i<40;i++){const x=Math.floor(hash(i+300)*320),y=220+Math.floor(hash(i+400)*300);R(x,y,3,2,'#3a2d24');}
  R(0,300,320,5,'#3b3f46');R(0,300,320,1,'#575c66');R(0,410,320,3,'#3b3f46');
  txt('NO PUBLIC FLOORS BELOW B1',196,226,'#5d4b3d');
  R(0,532,320,108,'#0a0608');A(0,532,320,108,'#ff2e3e',.06+.04*Math.sin(t*6));
  for(let i=0;i<6;i++){const x=24+i*16;R(x,578,8,12,'#151a22');R(x+2,580,4,1,'#5a1a20');}
  R(226,560,30,20,'#0a1a19');A(222,556,38,28,'#39f5c4',.12);
  txt('SUB-LEVEL 7',196,540,'#ff4656');txt('RESTRICTED',196,548,'#8a2a33');
  R(136,212,4,380,'#2b2b31');R(180,212,4,380,'#2b2b31');
  R(140,0,40,592,'#090b12');R(142,0,1,592,'#2a3040');R(177,0,1,592,'#2a3040');R(140,588,40,4,'#2b2b31');
  R(159,0,1,carY,'#55607a');R(161,0,1,carY,'#55607a');
  R(146,carY,28,34,'#8d97a8');const red=t>3.8&&Math.floor(t*8)%2;R(149,carY+3,22,28,red?'#7a2a33':'#cbbf98');
  R(158,carY+12,4,4,EMP.skin);R(158,carY+11,4,1,EMP.hair);R(157,carY+16,6,8,EMP.shirt);R(158,carY+24,4,6,EMP.pants);
  A(144,carY-46,1,40,'#ffffff',.08);A(176,carY-30,1,26,'#ffffff',.08);
  home();txt('DEPTH',270,14,'#8891a6');txt('-'+Math.max(0,Math.round((carY-150)/3.2))+'M',270,22,'#ffb347');
 }},
{name:'Wrong floor',note:'Interior. Red glitch lighting, shake, the display settles on B7.',dur:5.5,fo:.3,music:()=>'tense',
 ev:[[0,'glitch'],[1.2,'glitch'],[2.4,'glitch'],[4,'lowding']],lines:[[.4,3.8,'SAM','B7?! This building only goes down to B1...']],
 draw(t){
  const G2=['B?','B#','B%','--','B7','8?','B/','??'];
  const disp=t<3.5?G2[Math.floor(hash(Math.floor(t*12))*G2.length)]:'B7';
  const fl=hash(Math.floor(t*10))>.6;
  drawCar(t,{disp,dispCol:'#ff2e3e',expr:'shock',red:true,redA:.18+(fl?.12:0),shake:1.4*(1-seg(t,3.5,5)),lightOff:fl,dark:fl?.25:0});
 }},
{name:'Sub-Level 7',top:true,note:'Slow tracking shot past server racks and five dormant Wardens. Dr. Voss works with his back turned.',dur:11.2,fi:.3,music:()=>'tense',
 ev:[[.2,'doors'],...evEvery('softstep',S4.t0,S4.tA,.36),...evEvery('key',0,11,.17)],
 lines:[[1.8,4.8,'SAM','Hello...? Is anyone down here?'],[6.2,10.4,'SAM','The Warden robots from the demo... why are there so many?']],
 draw(t){
  const{t0,x0,x1,sp,tA}=S4,walking=t>t0&&t<tA,x=t<=t0?x0:Math.min(x1,x0+(t-t0)*sp),y=lerp(131,156,seg(t,t0,t0+.6)),cx=clamp(x-150,0,BASE_W-W);
  cam(cx,0);const op=ease(seg(t,.2,1));
  drawBase(cx,t,{elevOpen:op,eyes:[0,0,0,0,0]});
  can(452,false,t);
  doctor(566,156,{dir:1,pose:'type',frame:Math.floor(t*7)});
  if(t<t0){empFront(82,131,{expr:'worried'});drawElevator(82,132,{open:op,doorsOnly:true});}
  else emp(x,y,{dir:1,pose:walking?'sneak':'idle',frame:Math.floor((t-t0)*6)});
  home();const fx=Math.round(380-cx*1.4);R(fx,0,8,180,'#020305');R(fx+8,0,1,180,'#0f141c');
  A(0,0,24,180,'#000000',.35);A(296,0,24,180,'#000000',.35);
 }},
{name:'The screen',note:'Full-frame insert of the training pipeline: private records going into the Wardens with no consent.',dur:8,music:()=>'tense',
 ev:(()=>{const e=[];LOG.forEach((l,i)=>{const at=.5+i*.75;for(let k=0;k<l[0].length;k+=3)e.push([+(at+k/40).toFixed(3),'key']);});e.push([4.8,'radar'],[5.6,'radar']);return e;})(),lines:[],
 draw(t){
  R(0,0,W,H,'#05070a');R(10,8,300,154,'#1a1f29');R(12,10,296,150,'#041512');
  R(12,10,296,12,'#0b3b33');txt('WARDEN_NET // TRAINING PIPELINE',18,14,'#39f5c4');txt('DR.VOSS',268,14,'#7fd8cc');
  LOG.forEach((l,i)=>{const at=.5+i*.75;if(t<at)return;txt(typed(l[0],t,at,40),18,30+i*10,l[1]);});
  const pct=Math.round(40+47*seg(t,5.6,7.6));
  if(t>5.4){txt('UPLOADING TO WARDENS  '+pct+'%',18,124,'#ffb347');R(18,132,200,8,'#0b3b33');R(19,133,Math.round(198*pct/100),6,'#ffb347');}
  R(232,28,72,72,'#06201c');txt('PROFILES',236,31,'#7fd8cc');
  for(let i=0;i<3;i++){const y=40+i*19;if(t<1.2+i*.4)continue;R(236,y,10,10,['#d6a77f','#b98563','#8a5e43'][i]);R(236,y,10,3,['#3b2416','#1a1a1a','#5a3a20'][i]);
    txt('ID '+['0417','2208','3391'][i],249,y,'#bff7f2');txt('NEXT: '+['HOME','GYM','WORK'][i],249,y+6,'#39f5c4');}
  if(t>4.6&&Math.floor(t*3)%2){R(232,106,72,22,'#ff4656');R(233,107,70,20,'#190508');txtC('CONFIDENTIAL',268,110,'#ff4656');txtC('DO NOT SHARE',268,118,'#ff8a94');}
  for(let y=10;y<160;y+=2)A(12,y,296,1,'#000000',.18);
  A(12,10,296,150,'#39f5c4',.03+.02*Math.sin(t*20));
  A(0,0,W,10,'#000000',.4);A(0,160,W,20,'#000000',.4);
 }},
{name:'Reaction',note:'Extreme close-up. Monitor glow on Sam\'s face, data scrolling in his eyes.',dur:4.6,music:()=>null,
 ev:[[.15,'sting']],lines:[[.6,4.6,'SAM','That\'s private data. Our customers\'. Ours. Nobody agreed to this!']],
 draw(t){samFace(t);}},
{name:'Clank',top:true,note:'Wide. Sam backs into a can and gives himself away. Voss stops typing and turns.',dur:6,music:()=>null,
 ev:[[.9,'softstep'],[1.25,'softstep'],[1.5,'clank'],[2.6,'sting'],[3,'glint'],...evEvery('key',0,1.7,.17)],
 lines:[[3.6,6,'DR. VOSS','...Working late, Mr. Reyes?']],
 draw(t){
  const[sx,sy]=shk(t>1.5&&t<1.8?1:0,t);cam(320,0,1,sx,sy);
  drawBase(320,t,{});
  const kicked=t>=1.5,cX=kicked?452-46*ease(seg(t,1.5,2.4)):452,bounce=kicked&&t<2.4?-Math.abs(Math.sin((t-1.5)*12))*3*(1-seg(t,1.5,2.4)):0;
  ctx.save();ctx.translate(0,Math.round(bounce));can(cX,kicked,t);ctx.restore();
  const turned=t>=2.6;
  doctor(566,156,{dir:turned?-1:1,pose:t<1.7?'type':'idle',frame:Math.floor(t*7),glint:t>3&&t<3.6});
  const sxp=t<.8?470:lerp(470,458,seg(t,.8,1.5));
  emp(sxp,156,{dir:1,pose:t<.8?'idle':t<1.5?'walk':'recoil',frame:Math.floor(t*6)});
  if(t>1.6&&t<2.6)txtO('!',sxp+1,124,'#ffb347');
  if(t>1.5&&t<2.6){const p=seg(t,1.5,1.62);txtO('CLANK',cX-20,130-Math.round(p*6),'#ffb347',2);}
  home();
 }},
{name:'Dr. Voss',note:'Extreme close-up, lit from below by the monitors. Glasses glint, then the smile.',dur:7.2,music:()=>'tense',
 ev:[[.9,'glint'],[4.4,'glint']],
 lines:[[.3,3.5,'DR. VOSS','You weren\'t supposed to see that.'],[3.7,7.2,'DR. VOSS','My Wardens need real data to predict people. No one can ever know where it came from.']],
 draw(t){vossFace(t);}},
{name:'Override',note:'Insert on the red button. Alarm, pods open, Wardens wake. Cut to Warden POV: minimax tree and predicted routes.',dur:10,music:t=>t<1.4?null:'chase',
 ev:[[.75,'slam'],...evEvery('alarm',1.4,5,.7),...[0,1,2,3,4].map(i=>[2.2+i*.3,'boot']),...evEvery('radar',5,10,.5),[5,'sting']],
 lines:[[0,1.4,'DR. VOSS','Wardens. Contain him.']],
 draw(t){
  if(t<1.4){
   const[sx,sy]=shk(t>.75?2*(1-seg(t,.75,1.3)):0,t);ctx.setTransform(2,0,0,2,Math.round(sx),Math.round(sy));
   R(-4,-4,168,98,'#14181f');R(30,18,100,64,'#1c222c');for(let i=0;i<25;i++)R(30+i*4,18,2,3,i%2?'#111':'#c99a2e');
   txtC('WARDEN OVERRIDE',80,26,'#ffb347');
   const pr=t>=.75;R(62,40,36,26,'#2a303b');R(64,42,32,22,'#20252e');R(68,46+(pr?2:0),24,14,pr?'#ff3b4a':'#b3141b');R(68,46+(pr?2:0),24,2,pr?'#ff8a94':'#d6343c');
   A(62,28,36,12,'#7fe9e3',.15);R(62,28,36,1,'#7fe9e3');
   const hy=lerp(-60,26,ease(seg(t,.35,.75)));R(66,hy,28,20,DOC.glove);R(66,hy+20,7,5,DOC.glove);R(74,hy+20,7,6,DOC.glove);R(82,hy+20,7,5,DOC.glove);R(68,hy-36,24,36,DOC.coat);R(68,hy-36,3,36,DOC.coatD);
   if(pr)A(-4,-4,168,98,'#ffffff',.6*(1-seg(t,.75,1.1)));
   home();return;
  }
  if(t<5){
   const[sx,sy]=shk(.6,t);cam(200,0,1,sx,sy);
   const eyes=PODS.map((_,i)=>seg(t,2.2+i*.3,2.35+i*.3));
   drawBase(200,t,{alarm:true,podOpen:ease(seg(t,1.8,2.8)),eyes,look:[1,1,1,1,1]});
   emp(470,156,{dir:-1,pose:'recoil'});
   home();A(0,0,W,H,'#ff0020',.08+.06*Math.sin(t*9));
   return;
  }
  const lt=t-5;cam(320,0);
  drawBase(320,t,{alarm:true,podOpen:1,eyes:[1,1,1,1,1],look:[1,1,1,1,1]});
  doctor(566,156,{dir:-1,pose:'point',grin:true});
  emp(470,156,{dir:-1,pose:'recoil'});
  home();A(0,0,W,H,'#2a0006',.6);for(let y=0;y<H;y+=2)A(0,y,W,1,'#000000',.2);
  const C='#ff3b4a',CD='#8a1a24';
  const bp=Math.floor(t*4)%2?1:0,bx0=139-bp,bx1=163+bp,by0=123-bp,by1=160+bp;
  for(const[x,y,dx,dy]of[[bx0,by0,1,1],[bx1,by0,-1,1],[bx0,by1,1,-1],[bx1,by1,-1,-1]]){line(x,y,x+5*dx,y,C);line(x,y,x,y+5*dy,C);}
  txt('TARGET',140,115,C);
  const paths=[[10,160,'TUNNEL 0.71',true],[26,104,'HIDE 0.23',false],[236,136,'SURRENDER 0.06',false]];
  paths.forEach(([ex,ey,lab,best],i)=>{const k=ease(seg(lt,.5+i*.3,1.1+i*.3));if(k<=0)return;const x2=lerp(150,ex,k),y2=lerp(150,ey,k);
    line(150,150,x2,y2,best?C:CD,2,lt*8);if(best)line(150,151,x2,y2+1,C,2,lt*8);
    if(k>.95){const lx=ex<150?ex:ex-tw(lab);txt(lab,clamp(lx,4,W-tw(lab)-4),ey-8,best?C:'#c24452');}});
  const info=[['WARDEN W-03 // ONLINE',.2],['PROFILE MATCH: EMP 0417 S.REYES',1.0],['HOME, ROUTINE, HABITS: KNOWN',1.6],['SOURCE: TRAINING DATA (NO CONSENT)',2.2]];
  info.forEach(([s,at],i)=>{if(lt>=at)txt(typed(s,lt,at,45),8,14+i*8,i===3?'#ffb347':C);});
  if(lt>1.2){R(232,13,82,56,'#1a0004');line(232,13,313,13,CD);line(232,68,313,68,CD);line(232,13,232,68,CD);line(313,13,313,68,CD);
    txt('MINIMAX D=4',236,16,C);
    const root=[272,28],L1=[[250,40],[272,40],[294,40]],step=Math.floor((lt-1.2)/.35);
    L1.forEach((p,i)=>{line(root[0],root[1],p[0],p[1],i===0&&step>=1?C:CD);[-6,6].forEach((d,j)=>{const q=[p[0]+d,52];line(p[0],p[1],q[0],q[1],i===0&&j===0&&step>=2?C:CD);R(q[0]-1,q[1]-1,3,3,i===0&&j===0&&step>=2?C:CD);});R(p[0]-1,p[1]-1,3,3,i===0&&step>=1?C:CD);});
    R(root[0]-1,root[1]-1,3,3,C);if(step>=3)txt('MAX .71',236,58,'#ffb347');}
  if(lt>2.8){const s=typed('PREDICT.  PURSUE.  CONTAIN.',lt,2.8,18);txtO(s,Math.round(160-tw('PREDICT.  PURSUE.  CONTAIN.',2)/2),160,C,2);}
 }},
{name:'Run',note:'Tracking chase. Each Warden\'s eye follows Sam as he sprints past, then it steps out and gives chase.',dur:6.5,music:t=>t<4.6?'chase':null,
 ev:[...evEvery('runstep',RUN.t0,4.6,.12),...evEvery('stomp',1,4.6,.3),[5,'hit']],lines:[],
 draw(t){
  if(t>=5){const[sx,sy]=shk(2*(1-seg(t,5,5.6)),t);R(0,0,W,H,'#000000');ctx.setTransform(1,0,0,1,Math.round(sx),Math.round(sy));txtC('RUN.',160,72,'#ff3b4a',6);home();return;}
  const{t0,x0,sp}=RUN,x=t<=t0?x0:Math.max(18,x0-(t-t0)*sp),y=lerp(156,166,seg(t,0,.3)),cx=clamp(x-170,0,320),[sx,sy]=shk(.8,t);
  cam(cx,0,1,sx,sy);
  const tOut=PODS.map(px=>t0+(x0-px+10)/sp),wOut=tOut.map(a=>t>a+.2),look=PODS.map(px=>x<px?-1:1);
  drawBase(cx,t,{alarm:true,podOpen:1,eyes:[1,1,1,1,1],look,wOut});
  doctor(566,156,{dir:-1,pose:'point',grin:true});
  PODS.forEach((px,i)=>{if(!wOut[i])return;const k=t-tOut[i]-.2,wx=px-Math.max(0,k-.3)*64,gy=lerp(128,160,seg(k,0,.4));
    A(wx+2,gy-37,26,7,'#ff2e3e',.12);warden(Math.round(wx),Math.round(gy)+(i%2)*5,{eye:1,t,look:-1,step:Math.floor(t*6)+i});});
  emp(x,y,{dir:-1,pose:t<t0?'recoil':'run',frame:Math.floor(t*14)});
  home();A(0,0,W,H,'#ff0020',.06+.05*Math.sin(t*9));A(0,0,W,H,'#000000',seg(t,4.3,4.9));
 }},
{name:'Level card',note:'Hand-off into the first maze level.',dur:5.5,fi:.4,nobars:true,music:()=>null,
 ev:[[.3,'end']],lines:[],
 draw(t){
  R(0,0,W,H,'#050608');
  ctx.globalAlpha=seg(t,.2,1);txtC('LEVEL 1',160,48,'#8891a6',2);txtC('ESCAPE THE BASEMENT',160,64,'#3fd0c9',3);
  ctx.globalAlpha=seg(t,1.4,2.2);txtC('THE WARDENS PREDICT YOUR NEXT MOVE.',160,100,'#d9dfeb');txtC('MAKE THEM GUESS WRONG.',160,110,'#ffb347');
  ctx.globalAlpha=1;if(t>2.6){const on=Math.floor(t*2)%3!==0;R(150,138,6,3,on?'#ff2e3e':'#3a1015');R(164,138,6,3,on?'#ff2e3e':'#3a1015');if(on){A(146,135,14,9,'#ff2e3e',.2);A(160,135,14,9,'#ff2e3e',.2);}}
 }},
];
function timeline(shots){let acc=0;shots.forEach(s=>{s.start=acc;acc+=s.dur;});return acc;}
let SH=SHOTS,TOTAL=timeline(SHOTS); // the scene that's playing (set by playCutscene)

/* ---------- "Watching": the Core through a security camera, then Dr. Voss feeds the Wardens (before Level 3) ---------- */
// The lesson: the more the Wardens know about Sam, the sharper and more confident their prediction gets.
let off=null,offCtx=null;
function drawOff(fn){ // draw with the normal helpers, but into an offscreen canvas (the camera feed)
  if(!off){off=document.createElement('canvas');off.width=W;off.height=H;offCtx=off.getContext('2d');offCtx.imageSmoothingEnabled=false;}
  const keep=ctx;ctx=offCtx;home();R(0,0,W,H,'#000000');fn();home();ctx=keep;}
const VENT={x:26,y:118,w:30,h:22},CORE_GY=160;
// Sam's x on the feed at time t: crawls out, stands, sneaks right, stops to glance at the camera.
function samX(t){if(t<3.6)return lerp(VENT.x+4,VENT.x+44,seg(t,1.4,3.4));const mv=Math.max(0,t-4.2)-clamp(t-5.4,0,1.2);return VENT.x+44+mv*17;}
function samCrawl(x,gy,f){
  const k=f%2;
  R(x-12,gy-8,4,4,EMP.pants);R(x-15+k,gy-4,6,3,EMP.pants);R(x-16+k,gy-2,3,2,EMP.shoe);R(x-9,gy-4,3,4,EMP.pantsD);
  R(x-10,gy-10,14,6,EMP.shirt);R(x-10,gy-10,14,1,EMP.shirtD);R(x-8,gy-13,5,4,EMP.bag);
  R(x+1-k,gy-5,2,5,EMP.shirtD);R(x+1-k,gy-1,3,1,EMP.skin);
  R(x+3,gy-15,7,7,EMP.skin);R(x+3,gy-16,7,2,EMP.hair);R(x+2,gy-15,2,4,EMP.hair);R(x+8,gy-13,1,2,'#1a1a1a');}
function drawCoreHall(t){
  R(0,0,W,22,'#1b1a22');for(let x=20;x<W;x+=80){R(x,20,40,2,'#fff4dc');A(x-10,22,60,46,'#fff2d0',.08);}
  R(0,22,W,118,'#c9cbd2');
  for(let ox=74;ox<W;ox+=82){R(ox,32,70,82,'#2a2837');A(ox,32,70,82,'#bcd2ff',.12);
    R(ox+10,84,50,6,'#6b4a32');R(ox+22,72,22,12,'#15171c');R(ox+24,74,18,8,'#6d4dff');R(ox+14,90,4,24,'#4a3524');R(ox+52,90,4,24,'#4a3524');
    R(ox,32,70,2,'#e8eaef');R(ox,112,70,2,'#e8eaef');R(ox,32,2,82,'#e8eaef');R(ox+68,32,2,82,'#e8eaef');R(ox+34,32,2,82,'#d8dbe2');A(ox+8,38,18,40,'#ffffff',.12);}
  R(0,136,W,4,'#8b8f99');
  R(VENT.x-2,VENT.y-2,VENT.w+4,VENT.h+2,'#8b8f99');R(VENT.x,VENT.y,VENT.w,VENT.h,'#07080b');
  R(0,140,W,40,'#2a2733');for(let y=144;y<180;y+=6)R(0,y,W,1,'#332f3e');
  const g=t<1?0:seg(t,1,1.3); // the grate pops off and drops to the floor
  if(g<1){const gx=VENT.x+g*10,gy=VENT.y+g*20;R(gx,gy,VENT.w,VENT.h,'#9aa0aa');for(let k=3;k<VENT.w-2;k+=4)R(gx+k,gy+3,2,VENT.h-6,'#5a606b');}
  else{R(VENT.x+10,154,VENT.w,4,'#9aa0aa');for(let k=3;k<VENT.w-2;k+=4)R(VENT.x+10+k,154,2,1,'#5a606b');}
  const x=Math.round(samX(t));
  if(t>=1.4&&t<3.6){ctx.save();ctx.beginPath();ctx.rect(VENT.x,0,W,H);ctx.clip();samCrawl(x,CORE_GY,Math.floor(t*6));ctx.restore();}
  else if(t>=3.6&&x<W+12){if(t>5.4&&t<6.6)empFront(x,CORE_GY,{expr:'worried'});else emp(x,CORE_GY,{dir:1,pose:t<4.2?'idle':'sneak',frame:Math.floor(t*6)});}
}
// The camera feed, drawn grey-green, scanlined and grainy into a rectangle of the screen.
function cctv(t,rx,ry,rw,rh,full){
  drawOff(()=>drawCoreHall(t));
  ctx.save();ctx.imageSmoothingEnabled=false;
  try{ctx.filter='grayscale(0.85) contrast(1.2) brightness(0.72)';}catch(e){}
  ctx.drawImage(off,0,0,W,H,Math.round(rx),Math.round(ry),Math.round(rw),Math.round(rh));
  try{ctx.filter='none';}catch(e){}
  ctx.restore();
  A(rx,ry,rw,rh,'#7dffb0',.07);
  for(let y=Math.round(ry);y<ry+rh;y+=2)A(rx,y,rw,1,'#000000',.16);
  const n=full?180:40;for(let i=0;i<n;i++){const k=hash(i+Math.floor(t*24)*131);R(rx+k*rw,ry+hash(i*7+k)*rh,1,1,k>.5?'#e8ffe8':'#141414');}
  if(!full)return;
  const C='#e8ffe8';
  for(const[x,y,dx,dy]of[[8,12,1,1],[311,12,-1,1],[8,167,1,-1],[311,167,-1,-1]]){line(x,y,x+10*dx,y,C);line(x,y,x,y+10*dy,C);}
  txt('CAM 14  /  THE CORE  /  EXEC FLOOR',14,16,C);
  if(Math.floor(t*2)%2){R(268,16,5,5,'#ff3b4a');}txt('REC',276,16,C);
  const sec=41+Math.floor(t);txt(`23:58:${String(sec%60).padStart(2,'0')}`,14,160,C);
  if(t>1&&t<3.6&&Math.floor(t*3)%2)txt('MOTION DETECTED',120,160,'#ffb347');
  if(t>4.4){const x=Math.round(samX(t)),bx=x-10,by=CORE_GY-34,C2='#ff3b4a';
    for(const[px,py,dx,dy]of[[bx,by,1,1],[bx+22,by,-1,1],[bx,by+36,1,-1],[bx+22,by+36,-1,-1]]){line(px,py,px+4*dx,py,C2);line(px,py,px,py+4*dy,C2);}
    const lab=typed('EMP 0417  S.REYES',t,4.6,26),lx=clamp(bx,4,W-tw('EMP 0417  S.REYES')-4);txt(lab,lx,by-16,C2);
    if(t>5.4)txt('FACE MATCH 99.1%',lx,by-8,'#ffb347');}
}
const PROFILE=[ // [time in the shot, label, value, colour]
  [4.6,'EMPLOYEE ID','0417'],[6.0,'AGE','27'],[6.9,'HT / WT','5 FT 10 / 162 LB'],
  [9.0,'BADGE SWIPES','2,914 IN 2 YEARS'],[10.4,'USUAL ROUTE','STAIRWELL B'],
  [12.8,'PREFERS','STAIRS, AISLE SEATS'],[14.2,'WHEN SCARED','TURNS LEFT (83%)'],
  [16.6,'SOURCES','HR, BADGES, HEALTH PLAN','#ffb347'],[17.6,'CONSENT','NONE','#ff4656'],
];
const CONF=[23,31,36,45,58,67,76,89,93,94];       // prediction confidence after 0..9 facts
const POINTS=[3,12,19,27,2941,2968,3110,3402,4861,4861]; // data points the Wardens hold
function controlRoom(t,{screenOn=1}={}){
  R(0,0,W,H,'#07090e');A(0,0,W,90,'#1b2340',.35);
  R(8,14,112,66,'#1b1f2a');R(10,16,108,62,'#05070a'); // the camera monitor (the feed is drawn into it)
  R(56,80,16,4,'#1b1f2a');
  R(0,138,W,42,'#10131b');R(0,138,W,2,'#2a3142');
  R(72,118,40,20,'#1c2230');R(72,118,40,2,'#3a4458');for(let k=0;k<4;k++)R(77+k*8,122,6,2,'#3a4458');A(72,118,40,6,'#3fd0c9',.12+.06*Math.sin(t*5)); // the console
  R(122,12,192,128,'#1b1f2a');R(124,14,188,124,'#030609');
  if(screenOn>0){A(124,14,188,124,'#0b2b2a',screenOn*.6);A(124,14,188,1,'#3fd0c9',screenOn);}
}
function profilePanel(lt){
  const n=PROFILE.filter(([at])=>lt>=at).length,conf=CONF[n],pts=POINTS[n],T='#3fd0c9',D='#7d8d92';
  txt('WARDEN MODEL INPUT  //  SUBJECT S.REYES',130,19,T);line(130,26,306,26,'#1d4a47');
  R(130,30,22,26,'#0e1a1c');R(134,36,14,15,EMP.skin);R(134,34,14,4,EMP.hair);R(133,35,2,6,EMP.hair);R(137,42,2,2,'#1a1a1a');R(143,42,2,2,'#1a1a1a');R(132,51,18,5,EMP.shirt);A(130,30,22,26,'#3fd0c9',.12);
  PROFILE.forEach(([at,label,val,c],i)=>{if(lt<at)return;const y=30+i*7,fresh=lt-at<.5;txt(label,158,y,D);txt(typed(val,lt,at,30),212,y,c||(fresh?'#ffffff':'#d9e8ea'));if(fresh)A(156,y-1,152,7,'#3fd0c9',.15*(1-(lt-at)/.5));});
  // Confidence bar.
  const shown=Math.round(lerp(CONF[Math.max(0,n-1)],conf,seg(lt,(PROFILE[n-1]?.[0]??0),(PROFILE[n-1]?.[0]??0)+.6)));
  const bc=shown>85?'#ff3b4a':shown>60?'#ffb347':T;
  txt('PREDICTION CONFIDENCE',130,96,D);txt(`${shown}%`,306-tw(`${shown}%`,2),92,bc,2);
  R(130,104,176,5,'#0e1a1c');R(130,104,Math.round(176*shown/100),5,bc);for(let k=1;k<10;k++)R(130+k*17.6,104,1,5,'#030609');
  // Where will Sam go next? Four options; more data concentrates the guess on one.
  R(130,111,176,26,'#06100f');line(130,111,305,111,'#1d4a47');
  const left=shown/100,rest=1-left,P=[['LEFT',left,[-24,0]],['RIGHT',rest*.5,[24,0]],['UP',rest*.3,[0,-9]],['DOWN',rest*.2,[0,9]]];
  const top=P.reduce((a,b)=>b[1]>a[1]?b:a),cx=172,cy=124;
  P.forEach(([name,pr,[dx,dy]])=>{const c=pr===top[1]?(shown>60?'#ff3b4a':'#ffb347'):pr>.15?'#2f7f7a':'#1d3b39';
    line(cx,cy,cx+dx,cy+dy,c,pr<.15?2:0,lt*6);R(cx+dx-1,cy+dy-1,3,3,c);
    const lab=`${Math.round(pr*100)}%`;txt(lab,dx<0?cx+dx-tw(lab)-3:dx>0?cx+dx+4:cx+5,dy<0?cy+dy-3:dy>0?cy+dy-3:cy-2,c);});
  R(cx-2,cy-2,5,5,'#5ab0ff');
  txt('PREDICTED NEXT MOVE',214,114,D);txt(shown<40?'???':top[0],214,121,shown>60?'#ff3b4a':'#ffb347',2);
  txt(`DATA POINTS ${pts.toLocaleString('en-US')}`,214,132,T);
}
const CORE_SHOTS=[
{name:'Camera',note:'Security camera on the executive floor: a vent grate pops off, Sam crawls out, glances at the camera, gets tagged.',dur:8,fi:.6,top:true,music:()=>'tense',
 ev:[[0,'camclick'],[1,'clank'],...evEvery('softstep',4.3,5.4,.3),[4.6,'beep'],[5.4,'radar']],
 lines:[[5.5,7.9,'SAM','...Is that camera following me?']],
 draw(t){cctv(t,0,0,W,H,true);}},
{name:'Pull back',note:'The feed shrinks onto a monitor in Dr. Voss\'s control room. The Warden console powers up.',dur:6,music:()=>'tense',
 ev:[[4.4,'boot']],
 lines:[[.8,5.6,'DR. VOSS','There you are, Sam. Right on schedule.']],
 draw(t){
  const k=ease(seg(t,0,2.6));
  controlRoom(t,{screenOn:seg(t,4.4,5.6)});
  doctor(62,138,{dir:1,pose:t>3?'type':'idle',frame:Math.floor(t*7),glint:t>2.8&&t<3.3});
  cctv(8+t,lerp(0,10,k),lerp(0,16,k),lerp(W,108,k),lerp(H,62,k),k<.02);
  if(t>4.8){txt(typed('WARDEN TRAINING CONSOLE',t,4.8,30),130,19,'#3fd0c9');}
 }},
{name:'Feeding the Wardens',note:'Voss types Sam\'s personal data into the Wardens. Each fact raises the prediction confidence and narrows where they expect Sam to go.',dur:20,music:()=>'tense',
 ev:[...evEvery('key',.3,19.5,.18),...PROFILE.map(([at])=>[at,'data']),[17.6,'sting']],
 lines:[[.2,2.3,'DR. VOSS','You keep slipping past my Wardens.'],[2.4,4.3,'DR. VOSS','They just don\'t know you well enough. Yet.'],
        [4.4,6.4,'DR. VOSS','Employee ID. Age.'],[6.5,8.6,'DR. VOSS','Height and weight: how fast you can run.'],
        [8.8,10.3,'DR. VOSS','Two years of badge swipes.'],[10.4,12.6,'DR. VOSS','Every door you open. Every route you take.'],
        [12.7,14.3,'DR. VOSS','You always take the stairs.'],[14.4,16.4,'DR. VOSS','And when you\'re scared, you turn left.'],
        [16.5,18.4,'DR. VOSS','Every fact I give them makes their guess sharper.'],[18.5,20,'DR. VOSS','And they never asked you.']],
 draw(t){
  controlRoom(t);
  doctor(62,138,{dir:1,pose:'type',frame:Math.floor(t*7),glint:t>17.4&&t<17.9,grin:t>18.2});
  cctv(14+t,10,16,108,62,false);txt('CAM 14',12,18,'#e8ffe8');if(Math.floor(t*2)%2)R(40,18,3,3,'#ff3b4a');
  profilePanel(t);
 }},
{name:'Upgrade',note:'Warden POV: the model updates; two Wardens wake up and deploy to the Core as a team.',dur:7.5,music:t=>t<1?null:'chase',
 ev:[[.4,'boot'],[.9,'boot'],[1.6,'sting'],...evEvery('radar',2,7,.5)],
 lines:[[.6,3.3,'DR. VOSS','Now they don\'t have to guess where you\'ll go.'],[3.4,5.4,'DR. VOSS','They\'ll already be there.']],
 draw(t){
  R(0,0,W,H,'#14040a');for(let y=0;y<H;y+=2)A(0,y,W,1,'#000000',.25);
  const C='#ff3b4a',CD='#8a1a24';
  R(60,132,200,2,CD);
  warden(118,132,{eye:seg(t,.4,.6),t,look:1,step:0});warden(202,132,{eye:seg(t,.9,1.1),t,look:-1,step:1});
  const info=[['MODEL UPDATED: SUBJECT S.REYES',.3],['PREDICTION CONFIDENCE  23%  >  94%',1.1],['DATA POINTS  3  >  4,861',1.8],['DEPLOY  W-03 + W-04  >  THE CORE',2.5],['MODE: TEAM PURSUIT',3.2]];
  info.forEach(([s,at],i)=>{if(t>=at)txt(typed(s,t,at,40),10,14+i*9,i===1?'#ffb347':C);});
  if(t>5.5){const msg='MORE DATA. SHARPER PREDICTIONS.';txtO(typed(msg,t,5.5,22),Math.round(160-tw(msg,2)/2),150,C,2);}
 }},
{name:'Level card',note:'Hand-off into Level 3.',dur:5,fi:.4,nobars:true,music:()=>null,
 ev:[[.3,'end']],lines:[],
 draw(t){
  R(0,0,W,H,'#050608');
  ctx.globalAlpha=seg(t,.2,1);txtC('LEVEL 3',160,46,'#8891a6',2);txtC('THE CORE',160,62,'#3fd0c9',3);
  ctx.globalAlpha=seg(t,1.3,2.1);txtC('THEY KNOW MORE ABOUT YOU NOW.',160,98,'#d9dfeb');txtC('TWO WARDENS. ONE PLAN. MAKE THEM GUESS WRONG.',160,108,'#ffb347');
  ctx.globalAlpha=1;
 }},
];

/* ---------- the scenes ---------- */
const SCENES={
  afterHours:{shots:SHOTS,label:'Opening cutscene',canvasLabel:'Pixel-art cutscene: an employee finds Clearpath\'s secret Warden lab',start:'Start the story',skip:'Skip intro ›',poster:2.9},
  core:{shots:CORE_SHOTS,label:'Cutscene: Dr. Voss feeds the Wardens more data',canvasLabel:'Pixel-art cutscene: a security camera watches Sam climb out of a vent into the Core, while Dr. Voss feeds the Wardens his personal data and their prediction confidence rises',start:'Continue the story',skip:'Skip ›',poster:5.6},
};

/* ---------- audio ---------- */
let AC=null,master=null,NB=null,soundOn=true;
const mf=m=>440*Math.pow(2,(m-69)/12);
function ensureAudio(){try{if(!AC){AC=new(window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=.4;master.connect(AC.destination);}if(AC.state==='suspended')AC.resume();}catch(e){AC=null;}}
function tone(f,d,type,v,slide=0,delay=0){if(!AC||!soundOn)return;const t=AC.currentTime+delay,o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.setValueAtTime(f,t);
  if(slide)o.frequency.linearRampToValueAtTime(Math.max(20,f+slide),t+d);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g).connect(master);o.start(t);o.stop(t+d+.03);}
function noise(d,v,ff,ft='lowpass',delay=0){if(!AC||!soundOn)return;if(!NB){NB=AC.createBuffer(1,AC.sampleRate,AC.sampleRate);const a=NB.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;}
  const t=AC.currentTime+delay,s=AC.createBufferSource(),fl=AC.createBiquadFilter(),g=AC.createGain();s.buffer=NB;fl.type=ft;fl.frequency.value=ff;
  g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+Math.min(d,.95));s.connect(fl).connect(g).connect(master);s.start(t,Math.random()*.02);s.stop(t+Math.min(d,.95)+.03);}
const SFX={
  step:()=>noise(.035,.12,700),softstep:()=>noise(.03,.05,450),runstep:()=>noise(.03,.14,900),
  beep:()=>tone(988,.09,'square',.1),ding:()=>{tone(1319,.6,'sine',.18);tone(1047,.8,'sine',.14,0,.18);},
  lowding:()=>{tone(330,.9,'sine',.2,-40);tone(262,1.1,'sine',.16,-40,.2);},
  doors:()=>noise(.7,.05,300),buzz:()=>tone(120,.45,'sawtooth',.04),
  lurch:()=>{tone(70,.7,'sawtooth',.14,-35);noise(.4,.12,200);},rumble:()=>noise(.6,.07,140),
  glitch:()=>{if(!AC)return;for(let i=0;i<5;i++)tone(200+hash(i+AC.currentTime)*900,.05,'square',.05,0,i*.06);},
  key:()=>noise(.02,.04,3500,'highpass'),
  clank:()=>{tone(640,.12,'square',.12,-300);tone(420,.18,'square',.1,-200,.08);noise(.15,.2,2500,'bandpass');},
  sting:()=>[45,48,51,54].forEach((n,i)=>tone(mf(n),1.6,'sawtooth',.04,0,i*.02)),
  glint:()=>tone(2637,.18,'sine',.05),
  slam:()=>{noise(.25,.35,500);tone(60,.4,'square',.2,-30);},
  boot:()=>tone(180,.3,'square',.07,700),
  alarm:()=>{tone(660,.33,'square',.05,220);tone(880,.33,'square',.05,-220,.35);},
  radar:()=>tone(1760,.06,'sine',.07),stomp:()=>tone(90,.12,'square',.08,-40),
  hit:()=>{noise(.6,.3,800);tone(55,1.2,'sawtooth',.18,-20);},
  data:()=>{tone(1568,.06,'square',.06);tone(2093,.08,'square',.05,0,.07);},
  camclick:()=>{noise(.04,.12,2500,'highpass');tone(1200,.03,'square',.04);},
  end:()=>[57,60,64].forEach((n,i)=>tone(mf(n),2.4,'triangle',.06,0,i*.12)),
};
const MUS={
  office:{rate:4,play(i){tone(mf([57,64,60,67,64,60,62,59][i%8]+12),.22,'triangle',.04);if(i%8===0)tone(mf(45),.6,'triangle',.05);}},
  muzak:{rate:3,play(i){tone(mf([72,76,79,83,81,79,76,74][i%8]),.3,'sine',.035);if(i%4===0)tone(mf(48+[0,5,7,5][(i/4|0)%4]),.6,'sine',.05);}},
  tense:{rate:2,play(i){tone(mf(i%2?34:33),.45,'square',.03);if(i%8===7)tone(mf(70),.6,'sine',.02,-60);}},
  chase:{rate:8,play(i){tone(mf([33,33,45,33,36,33,45,38][i%8]),.1,'sawtooth',.05);if(i%2===0)noise(.03,.035,6000,'highpass');}},
};
let lastKey='';
function fireEvents(a,b){if(b-a>.5)return;SH.forEach(s=>{if(s.start>b||s.start+s.dur<a)return;for(const[at,n]of s.ev){const g=s.start+at;if(g>a&&g<=b&&SFX[n])SFX[n]();}});}
function music(i,lt){const s=SH[i],m=s.music&&s.music(lt);if(!m||!MUS[m])return;const idx=Math.floor(lt*MUS[m].rate),k=i+m+idx;if(k!==lastKey){lastKey=k;MUS[m].play(idx);}}

function closeAudio() {
  if (!AC) return;
  const ac = AC;
  try { master.gain.setTargetAtTime(0.0001, ac.currentTime, 0.08); } catch {}
  setTimeout(() => { try { ac.close(); } catch {} }, 500);
  AC = null; master = null; NB = null;
}

/* ---------- player ---------- */
let active = false;

/** True while the cutscene is on screen (the 3D view pauses its rendering meanwhile). */
export const cutsceneActive = () => active;

/**
 * Show a story cutscene full-screen. Resolves when it ends or is skipped.
 * @param {{ autoStart?: boolean, scene?: keyof typeof SCENES }} [options]
 *   autoStart: begin right away. Use it only when the player has just clicked or pressed a key
 *   (browsers block sound until then); otherwise it waits on a start button.
 *   scene: "afterHours" (default, before Level 1) or "core" (before Level 3).
 */
export function playCutscene({ autoStart = false, scene = "afterHours" } = {}) {
  if (active) return Promise.resolve();
  const sc = SCENES[scene] ?? SCENES.afterHours;
  SH = sc.shots;
  TOTAL = timeline(SH);
  active = true;
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "cutscene";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", sc.label);
    root.innerHTML = `
      <div class="cs-stage">
        <canvas width="320" height="180" aria-label="${sc.canvasLabel}"></canvas>
        <div class="cs-dlg" hidden><span class="cs-who"></span><span class="cs-line"></span></div>
        <button class="cs-start" type="button"><span class="cs-tri" aria-hidden="true"></span><span>${sc.start}</span><small>Click or press any key · sound on</small></button>
      </div>
      <div class="cs-bar">
        <button type="button" class="cs-btn cs-sound" aria-pressed="true">Sound on</button>
        <span class="cs-hint">Space pause · Esc skip</span>
        <button type="button" class="cs-btn cs-skip">${sc.skip}</button>
      </div>`;
    document.body.appendChild(root);

    const q = (sel) => root.querySelector(sel);
    const canvas = q("canvas"), dlg = q(".cs-dlg"), who = q(".cs-who"), lineEl = q(".cs-line"), startBtn = q(".cs-start");
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    let T = 0, playing = false, started = false, last = null, raf = 0, dlgKey = "", curShot = -1;
    soundOn = true;
    lastKey = "";
    const shotAt = (t) => { for (let i = SH.length - 1; i >= 0; i--) if (t >= SH[i].start) return i; return 0; };

    function render(t) {
      const i = shotAt(Math.min(t, TOTAL - 1e-4)), s = SH[i], lt = Math.min(t, TOTAL - 1e-4) - s.start;
      home(); R(0, 0, W, H, "#000000");
      s.draw(lt); home();
      let f = 0;
      if (s.fi) f = Math.max(f, 1 - lt / s.fi);
      if (s.fo) f = Math.max(f, 1 - (s.dur - lt) / s.fo);
      if (f > 0) A(0, 0, W, H, "#000000", f);
      if (!s.nobars) { R(0, 0, W, 9, "#000000"); R(0, 171, W, 9, "#000000"); }
      if (started && !playing) { A(0, 0, W, H, "#000000", 0.45); txtC("PAUSED", 160, 86, "#d9dfeb", 2); }
      const ln = started ? s.lines.find((l) => lt >= l[0] && lt < l[1]) : null;
      const text = ln ? typed(ln[3], lt, ln[0], 38) : "";
      const key = ln ? `${i}|${ln[2]}|${text}` : "";
      if (key !== dlgKey) {
        dlgKey = key;
        dlg.hidden = !ln; dlg.classList.toggle("cs-top", !!s.top);
        if (ln) { dlg.classList.toggle("cs-villain", ln[2].startsWith("DR")); who.textContent = ln[2]; lineEl.textContent = text; }
      }
      curShot = i;
      return lt;
    }

    function begin() {
      if (started) return;
      started = true;
      startBtn.hidden = true;
      ensureAudio();
      playing = true;
      last = null;
    }

    function finish() {
      if (!active) return;
      active = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
      closeAudio();
      root.classList.add("cs-out");
      setTimeout(() => root.remove(), 350);
      resolve();
    }

    // Capture phase on window runs before the game's own keydown listener, so stopping the event here
    // means no key reaches the maze while the cutscene is up.
    function onKey(e) {
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); finish(); return; }
      if (!started) { e.preventDefault(); begin(); return; }
      if (e.key === " ") { e.preventDefault(); playing = !playing; last = null; }
      else if (e.key === "Enter" && T >= TOTAL - SH[SH.length - 1].dur) { e.preventDefault(); finish(); }
    }
    window.addEventListener("keydown", onKey, true);

    startBtn.addEventListener("click", begin);
    q(".cs-skip").addEventListener("click", finish);
    q(".cs-sound").addEventListener("click", (e) => {
      soundOn = !soundOn;
      e.currentTarget.textContent = soundOn ? "Sound on" : "Sound off";
      e.currentTarget.setAttribute("aria-pressed", String(soundOn));
      if (soundOn) ensureAudio();
    });
    if (autoStart) begin(); else startBtn.focus();

    function frame(nowMs) {
      if (!active) return;
      if (playing) {
        const dt = last == null ? 0 : Math.min(0.1, (nowMs - last) / 1000);
        last = nowMs;
        const prev = T;
        T = Math.min(TOTAL, T + dt);
        fireEvents(prev, T);
        if (T >= TOTAL) { render(TOTAL); finish(); return; }
      }
      const lt = render(started ? T : sc.poster); // before starting, show a still as a poster
      if (playing && soundOn) music(curShot, lt);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}
