// cutscene.js — the story cutscenes: "After Hours" (before Level 1), "Watching" (between Level 2 and
// Level 3, where Dr. Voss feeds the Wardens Sam's personal data), "The Choice" (before Level 5: the
// player decides whether Sam runs or uploads the evidence) and "Broadcast" (the ending, after Level 5),
// plus the level title cards.
//
// Pixel art drawn in code on a 320×180 canvas and scaled up without smoothing, so there are no image
// files to load. Music and sound effects are synthesized with the Web Audio API.
//
//   import { playCutscene, cutsceneActive } from "./cutscene.js";
//   await playCutscene();                    // "After Hours"; resolves when it ends or is skipped
//   await playCutscene({ scene: "core" });   // "Watching", before Level 3
//   const picks = await playCutscene({ scene: "decision" }); // e.g. ["escape", "rewind", "upload"]
//   await playCutscene({ scene: "finale" });  // "Broadcast", after Level 5
//
// While it plays it covers the screen and swallows every key, so the maze underneath can't move.
// Placeholder names to change: "Sam Reyes", "Dr. Voss", "Sub-Level 7" (search this file for them).
// Each shot in SHOTS has: dur (seconds), lines (dialogue: [start, end, speaker, text]), ev (sound cues)
// and draw(t), which paints the frame for time t within the shot.

import { followVolume, sound } from "./sound-settings.js";

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
'.':'000000000000010',':':'000010000010000','-':'000000111000000','_':'000000000000111','/':'001001010100100','>':'100010001010100','!':'010010010000010','?':'110001010000010','%':'101001010100101','#':'101111101111101','[':'110100100100110',']':'011001001001011','=':'000111000111000',',':'000000000010100','*':'000101010101000','+':'000010111010000','(':'010100100100010',"'":'010010000000000',')':'010001001001010',' ':'000000000000000'};
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
{name:'The ride',note:'Interior at 2× zoom. Floors count down past the lobby and keep going.',dur:7.5,music:t=>t<5?'muzak':'pre1',
 ev:[[5,'lurch'],[6.2,'lurch']],lines:[[5.3,7.5,'SAM','Huh? I pressed Lobby. Why are we still going down?']],
 draw(t){
  let disp=t<4.2?String(Math.max(1,14-Math.floor(t/.3))):t<5?'L':t<6.2?'B1':'B2';
  const expr=t>=5.2?'worried':(t>2&&t<3.4)?'sleepy':'neutral';
  drawCar(t,{disp,expr,shake:t>=5?.6:0,dark:t>=6.2&&t<6.4?.4:0});
 }},
{name:'Shaft cutaway',note:'Vertical tracking shot down the shaft, past B1 and into floors that aren\'t on any plan.',dur:6,fi:.2,fo:.3,music:()=>'pre1',
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
{name:'Wrong floor',note:'Interior. Red glitch lighting, shake, the display settles on B7.',dur:5.5,fo:.3,music:()=>'pre1',
 ev:[[0,'glitch'],[1.2,'glitch'],[2.4,'glitch'],[4,'lowding']],lines:[[.4,3.8,'SAM','B7?! This building only goes down to B1...']],
 draw(t){
  const G2=['B?','B#','B%','--','B7','8?','B/','??'];
  const disp=t<3.5?G2[Math.floor(hash(Math.floor(t*12))*G2.length)]:'B7';
  const fl=hash(Math.floor(t*10))>.6;
  drawCar(t,{disp,dispCol:'#ff2e3e',expr:'shock',red:true,redA:.18+(fl?.12:0),shake:1.4*(1-seg(t,3.5,5)),lightOff:fl,dark:fl?.25:0});
 }},
{name:'Sub-Level 7',top:true,note:'Slow tracking shot past server racks and five dormant Wardens. Dr. Voss works with his back turned.',dur:11.2,fi:.3,music:()=>'pre1',
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
{name:'The screen',note:'Full-frame insert of the training pipeline: private records going into the Wardens with no consent.',dur:8,music:()=>'pre2',
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
{name:'Reaction',note:'Extreme close-up. Monitor glow on Sam\'s face, data scrolling in his eyes.',dur:4.6,music:()=>'pre2',
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
{name:'Dr. Voss',note:'Extreme close-up, lit from below by the monitors. Glasses glint, then the smile.',dur:7.2,music:t=>t<.15?null:'pre3',
 ev:[[.15,'boom'],[.9,'glint'],[4.4,'glint']],
 lines:[[.3,3.5,'DR. VOSS','You weren\'t supposed to see that.'],[3.7,7.2,'DR. VOSS','My Wardens need real data to predict people. No one can ever know where it came from.']],
 draw(t){vossFace(t);}},
{name:'Override',note:'Insert on the red button. Alarm, pods open, Wardens wake. Cut to Warden POV: minimax tree and predicted routes.',dur:10,music:t=>t<1.4?null:'pre4',
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
{name:'Run',note:'Tracking chase. Each Warden\'s eye follows Sam as he sprints past, then it steps out and gives chase.',dur:6.5,music:t=>t<4.6?'pre4':null,
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
  // The Wardens' proving ground: lab wall, charging alcoves with dormant Wardens, hazard skirting.
  R(0,0,W,22,'#15171c');for(let x=10;x<W;x+=70){R(x,20,34,2,'#e8f0ff');A(x-12,22,58,60,'#dfe9ff',.07);}
  R(0,22,W,118,'#b9bec5');for(let x=0;x<W;x+=40)R(x,22,1,108,'#a3a9b1');
  R(0,28,W,3,'#0e1013');for(let x=4;x<W;x+=9)R(x,29,4,1,(x/9|0)%6===2?'#ffb020':'#5fe3ff');
  txt('PROVING GROUND 3',16,38,'#7f8690');
  for(let ox=84;ox<W;ox+=74){
    R(ox,46,58,90,'#1b1e24');R(ox,46,58,2,'#f2c230');R(ox,46,2,90,'#f2c230');R(ox+56,46,2,90,'#f2c230');
    R(ox+6,52,46,3,'#0b3b38');R(ox+6,52,Math.round(46*(.4+.15*((ox/74)|0))),3,'#3fd0c9');
    warden(ox+29,132,{eye:0,t,look:0,step:0});
    R(ox+40,98,12,2,'#0b0c0e');R(ox+50,98,2,34,'#0b0c0e');
    txt(`W-0${((ox-84)/74|0)+3}`,ox+18,58,'#f2c230');}
  R(0,130,W,6,'#16181c');for(let x=-6;x<W;x+=10){R(x,130,4,6,'#f2c230');R(x+2,132,4,2,'#f2c230');}
  R(0,136,W,4,'#5d636c');
  R(VENT.x-2,VENT.y-2,VENT.w+4,VENT.h+2,'#8b8f99');R(VENT.x,VENT.y,VENT.w,VENT.h,'#07080b');
  R(0,140,W,40,'#262a30');R(0,146,W,1,'#c9a227');R(0,176,W,1,'#c9a227');for(let x=12;x<W;x+=32){R(x-2,161,5,1,'#5a5232');R(x,159,1,5,'#5a5232');}
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
  txt('CAM 14  /  THE CORE  /  TEST FLOOR 3',14,16,C);
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
{name:'Camera',note:'Security camera on the Wardens\' test floor: a vent grate pops off, Sam crawls out, glances at the camera, gets tagged.',dur:8,fi:.6,top:true,music:()=>'creep1',
 ev:[[0,'camclick'],[1,'clank'],...evEvery('softstep',4.3,5.4,.3),[4.6,'beep'],[5.4,'radar']],
 lines:[[5.5,7.9,'SAM','...Is that camera following me?']],
 draw(t){cctv(t,0,0,W,H,true);}},
{name:'Pull back',note:'The feed shrinks onto a monitor in Dr. Voss\'s control room. The Warden console powers up.',dur:6,music:()=>'creep2',
 ev:[[4.4,'boot']],
 lines:[[.8,5.6,'DR. VOSS','There you are, Sam. Right on schedule.']],
 draw(t){
  const k=ease(seg(t,0,2.6));
  controlRoom(t,{screenOn:seg(t,4.4,5.6)});
  doctor(62,138,{dir:1,pose:t>3?'type':'idle',frame:Math.floor(t*7),glint:t>2.8&&t<3.3});
  cctv(8+t,lerp(0,10,k),lerp(0,16,k),lerp(W,108,k),lerp(H,62,k),k<.02);
  if(t>4.8){txt(typed('WARDEN TRAINING CONSOLE',t,4.8,30),130,19,'#3fd0c9');}
 }},
{name:'Feeding the Wardens',note:'Voss types Sam\'s personal data into the Wardens. Each fact raises the prediction confidence and narrows where they expect Sam to go.',dur:20,music:()=>'creep2',
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
{name:'Upgrade',note:'Warden POV: the model updates; two Wardens wake up and deploy to the Core as a team.',dur:7.5,music:t=>t<1?null:'creep3',
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

/* ---------- "The Choice": after the Archive, before Level 5 ---------- */
// Sam has the proof. The building locks down, and Dr. Voss tells him he already knows what Sam will do.
// The player chooses: save himself (run down to the street) or upload the evidence (climb to the roof).
// Running is exactly what the Wardens predicted, so that branch ends with Sam caught and a rewind back to
// the choice. Climbing is the move they didn't expect, and it builds up to Level 5, the Uplink.
let CHOICE_T=0; // seconds the current choice has been on screen (keeps the frame alive while it waits)
function arrow(x,y,up,c){if(up){for(let i=0;i<4;i++)R(x-i,y+i,1+i*2,1,c);R(x-1,y+4,3,6,c);}else{R(x-1,y,3,6,c);for(let i=0;i<4;i++)R(x-3+i,y+6+i,7-i*2,1,c);}}
function drive(x,y,t){R(x,y,7,4,'#2a2f3a');R(x,y,7,1,'#4a5262');R(x+5,y+2,1,1,Math.floor(t*4)%2?'#3dff8a':'#1a6b3e');A(x-2,y-2,11,8,'#3dff8a',.12);}
function rain(t,x0,y0,w,h,n=50,c='#9fb4d8'){for(let i=0;i<n;i++){const x=x0+hash(i)*w,y=y0+((hash(i*3)*h+t*160)%h);line(x,y,x-1,Math.min(y0+h-1,y+5),c);}}
function alarmWash(t,k=1){A(0,0,W,H,'#ff1030',k*(.07+.07*Math.sin(t*7)));}
// Floor 88 at night: the executive suite from Level 4, rain on the glass, the city below.
function floor88(t,{alarm=0}={}){
  R(0,0,W,H,'#070912');
  ctx.save();ctx.beginPath();ctx.rect(16,12,288,112);ctx.clip();
  for(let y=12;y<124;y+=4)R(16,y,288,4,y<60?'#0c1226':'#111a33');
  skyline(-30,128,'#0e1424','#ffd696');rain(t,16,12,288,112,60);
  ctx.restore();
  for(let x=16;x<=304;x+=72)R(x-2,12,4,112,'#05060a');R(14,10,292,3,'#05060a');R(14,123,292,3,'#c9a85c');
  R(0,126,W,54,'#14110d');R(0,126,W,2,'#c9a85c');for(let x=0;x<W;x+=40)A(x,128,20,52,'#ffffff',.015);
  R(176,116,104,6,'#3b2b1d');R(176,116,104,1,'#5a4330');R(180,122,6,30,'#2a1f16');R(270,122,6,30,'#2a1f16'); // the desk
  R(244,106,22,10,'#1a1d24');A(244,106,22,10,'#3fd0c9',.3);R(250,116,10,1,'#0b0c10'); // the terminal Sam used
  R(192,104,2,12,'#c9a85c');R(188,102,10,3,'#c9a85c');A(176,104,30,14,'#ffd696',.1);  // a desk lamp
  logo(48,146,'#2a2418',2);
  if(alarm>0){alarmWash(t,alarm);const bx=W/2,on=Math.floor(t*3)%2;R(bx-4,2,8,4,on?'#ff3b4a':'#5a1018');if(on)A(bx-40,0,80,40,'#ff3b4a',.12*alarm);}
}
// A wall screen with Dr. Voss's face on it (drawn into the offscreen canvas, then shown with scanlines).
function vossScreen(t,x,y,w,h){
  drawOff(()=>vossFace(t));
  R(x-4,y-4,w+8,h+8,'#0b0c10');R(x-4,y-4,w+8,1,'#3a4150');
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(off,0,0,W,H,x,y,w,h);ctx.restore();
  A(x,y,w,h,'#3fd0c9',.08);for(let yy=y;yy<y+h;yy+=2)A(x,yy,w,1,'#000000',.22);
  if(hash(Math.floor(t*10))>.9)A(x,y+hash(Math.floor(t*10)+1)*h,w,3,'#ffffff',.25);
}
// The stairwell landing on 88: the street exit down to the left, the roof up to the right.
function stairwell(t,{sam=true,expr='worried',rewind=0}={}){
  R(0,0,W,H,'#25282f');for(let x=0;x<W;x+=32)R(x,0,1,H,'#2c3038');for(let y=6;y<H;y+=16)R(0,y,W,1,'#2c3038');
  R(0,92,W,6,'#c9a227');R(0,94,W,2,'#7d6514'); // a painted safety stripe
  txtO('88',140,30,'#3a3f48',5,'#1b1d22');
  // Down-left flight (to the street) and up-right flight (to the roof).
  for(let k=0;k<8;k++){const x=118-(k+1)*13,y=140+k*6;R(x,y,13,H-y,'#3e424b');R(x,y,13,1,'#6b717c');}
  for(let k=0;k<9;k++){const x=202+k*13,y=134-k*6;R(x,y,13,H-y,'#454a54');R(x,y,13,1,'#767c88');}
  R(118,140,84,40,'#3a3e47');R(118,140,84,1,'#6b717c'); // the landing
  line(118,120,14,168,'#c9a227');line(202,114,320,60,'#c9a227');
  for(let k=0;k<6;k++){R(112-k*17,123+k*8,1,17,'#8a7a3a');R(208+k*19,108-k*9,1,20,'#8a7a3a');}
  // Signs.
  R(20,40,72,26,'#0d3b22');R(20,40,72,1,'#1d6b40');txtC('STREET EXIT',56,45,'#7dffb0');arrow(56,52,false,'#7dffb0');
  R(228,40,76,26,'#3b0d14');R(228,40,76,1,'#6b1d26');txtC('ROOF / UPLINK',266,45,'#ffb3ba');arrow(266,52,true,'#ffb3ba');
  const tt=t+CHOICE_T,on=Math.floor(tt*2)%2;R(156,12,8,4,on?'#ff3b4a':'#4a1218');if(on)A(130,6,60,30,'#ff3b4a',.12);
  A(0,0,W,H,'#ff1030',.05+.04*Math.sin(tt*6));
  if(sam){empFront(160,140,{expr});drive(165,124,tt);}
  if(rewind>0){for(let y=0;y<H;y+=3)A(0,y,W,1,'#ffffff',.06*rewind);const ty=(tt*200)%H;A(0,ty,W,6,'#ffffff',.25*rewind);A(0,(ty+70)%H,W,3,'#ffffff',.2*rewind);}
}
// Side view of the stairwell shaft, following Sam down (or up) the flights.
const FH=34;
function shaftRun(t,{up=false,rate=2.4,floor0=88,floorAt=null}){
  const p=t*rate,k=Math.floor(p),f=p-k,dirY=up?-1:1;
  const sx=k%2?lerp(232,88,f):lerp(88,232,f),sy=(k+f)*FH*dirY,cy=sy-104;
  R(0,0,W,H,'#202329');for(let x=0;x<W;x+=32)R(x,0,1,H,'#272b32');
  for(let j=k-4;j<=k+4;j++){
    const y0=j*FH*dirY-cy,y1=(j+1)*FH*dirY-cy,a=j%2?232:88,b=j%2?88:232;
    for(let s=0;s<12;s++){const x=lerp(a,b,s/12),y=lerp(y0,y1,s/12),xs=Math.min(x,lerp(a,b,(s+1)/12));R(xs,y,12,4,'#4a4f59');R(xs,y,12,1,'#7a808c');}
    line(a,y0-14,b,y1-14,'#c9a227');
    const ly=y0;R(a===88?60:232,ly,28,4,'#4a4f59');
    if(j%2===0){const fl=floorAt?floorAt(j,k):floor0-(j/2)*dirY;txtO(String(fl),a===88?44:262,ly-24,'#5d636e',2,'#15171b');}
  }
  emp(sx,sy-cy+0,{dir:(k%2?-1:1),pose:'run',frame:Math.floor(t*14)});
  drive(sx+(k%2?-8:2),sy-cy-16,t);
}
// The lobby: glass doors to the street on the right, pillars, the Clearpath logo.
function lobby(t,{locked=0}){
  R(0,0,W,H,'#0b0d12');R(0,0,W,24,'#07080b');for(let x=20;x<W;x+=60){R(x,22,30,2,'#e8f0ff');A(x-10,24,50,50,'#dfe9ff',.04);}
  R(0,24,W,118,'#141821');logo(110,70,'#2a3240',4);txtC('CLEARPATH',110,98,'#2a3240',2);
  for(const px of[52,170]){R(px,24,18,118,'#1c212c');R(px,24,2,118,'#262c38');}
  // The doors and the street outside.
  R(222,30,94,112,'#05070c');ctx.save();ctx.beginPath();ctx.rect(224,32,90,110);ctx.clip();
  R(224,32,90,110,'#0a1020');skyline(150,120,'#101624','#ffd696');R(224,120,90,22,'#151a22');R(286,60,2,60,'#3a4150');A(270,60,34,60,'#ffd696',.12);rain(t,224,32,90,110,30,'#5d6e8c');
  ctx.restore();R(268,30,2,112,'#0b0d12');R(222,30,94,2,'#0b0d12');
  if(locked>0){A(222,30,94,112,'#ff1030',.18*locked);for(const x of[240,286]){R(x,82,14,8,'#3b0d14');R(x+5,84,4,4,Math.floor(t*4)%2?'#ff3b4a':'#6b1018');}txtC('LOCKED',269,70,'#ff4656');}
  R(0,142,W,38,'#1a1e27');for(let x=0;x<W;x+=24){R(x,142,1,38,'#232836');}R(0,142,W,1,'#3a4150');A(0,150,W,30,'#5ab0ff',.03);
}
// The roof at night: rain, the city far below, the uplink tower with its terminal.
function rooftop(t,{door=1}={}){
  R(0,0,W,H,'#05060d');for(let y=0;y<120;y+=6)R(0,y,W,6,y<40?'#05060d':y<80?'#070a16':'#0a0e1e');
  for(let i=0;i<50;i++){const x=hash(i)*W,y=hash(i*7)*90;if(hash(i+Math.floor(t*3))>.25)R(x,y,1,1,'#8891a6');}
  skyline(-60,150,'#0b0f1a','#ffd696');A(0,120,W,30,'#5ab0ff',.05);
  // The uplink tower.
  const tx=252;R(tx-2,40,4,108,'#4a5262');for(let y=48;y<148;y+=12){line(tx-10,y,tx+10,y+12,'#3a4150');line(tx+10,y,tx-10,y+12,'#3a4150');}
  R(tx-14,52,10,3,'#5d6678');ctx.fillStyle='#5d6678';ctx.beginPath();ctx.arc(tx-12,46,9,Math.PI*.6,Math.PI*1.6);ctx.fill();
  if(Math.floor(t*1.5)%2){R(tx-3,35,6,5,'#ff3b4a');A(tx-8,30,16,15,'#ff3b4a',.3);}
  R(tx+12,128,20,20,'#1c212c');R(tx+14,130,16,9,'#0b2b2a');A(tx+14,130,16,9,'#3fd0c9',.4+.2*Math.sin(t*4));txt('UP',tx+17,132,'#3fd0c9');
  // Roof deck and parapet.
  R(0,148,W,32,'#1a1d26');R(0,148,W,2,'#3a4150');for(let x=0;x<W;x+=40)A(x+6,160,22,3,'#5ab0ff',.08+.05*Math.sin(t*2+x));
  // The stair door Sam comes out of.
  R(8,96,44,52,'#2a2e38');R(8,96,44,3,'#3a4150');R(18,108,24,40,'#0b0c10');
  R(18,108,Math.round(24*(1-door)),40,'#4a5262');if(door>0)A(18,108,24,40,'#ffd696',.18*door);
  txtC('ROOF',30,100,'#8891a6');
  rain(t,0,0,W,H,70,'#6b7da0');
}
function wardenPOV(t,lines,{big='',bigAt=99,col='#ff3b4a',sub=null}={}){
  R(0,0,W,H,'#14040a');for(let y=0;y<H;y+=2)A(0,y,W,1,'#000000',.25);
  const C=col,CD='#8a1a24';
  for(const[x,y,dx,dy]of[[8,12,1,1],[311,12,-1,1],[8,167,1,-1],[311,167,-1,-1]]){line(x,y,x+10*dx,y,C);line(x,y,x,y+10*dy,C);}
  lines.forEach(([s,at,c],i)=>{if(t>=at)txt(typed(s,t,at,40),18,22+i*10,c||C);});
  if(sub)sub(t);
  if(t>bigAt){txtO(typed(big,t,bigAt,22),Math.round(160-tw(big,2)/2),150,C,2);}
  if(Math.floor(t*2)%2)R(298,16,5,5,C);
}

// The choice on the landing (and again after a rewind).
function stairShot(again){return{name:again?'The stairwell, again':'The stairwell',note:'The landing on 88: STREET EXIT down, ROOF / UPLINK up. The player decides.',dur:again?6.6:7.2,music:()=>'decide',
  ev:again?[[0,'radar']]:[[.2,'slam']],
  lines:again?[[.2,3.2,'SAM','They knew I\'d run. They planned for it.'],[3.3,6.4,'SAM','So what\'s the one thing they don\'t expect?']]
             :[[.3,3.4,'SAM','If I run now, I get out. But no one ever sees the proof.'],[3.5,7,'SAM','If I go up to the uplink... the Wardens will be waiting.']],
  draw(t){stairwell(t,{expr:again?'neutral':'worried',rewind:again?1-seg(t,0,.8):0});},
  choice:{prompt:'What should Sam do?',options:[
    {key:'escape',label:'Save yourself',sub:'Run down to the street. You get out, but the proof stays hidden.',then:()=>escapeShots(again)},
    {key:'upload',label:'Upload the evidence',sub:'Climb to the roof uplink and expose Clearpath. The Wardens will be waiting.',then:()=>uploadShots(again)}]}};}

function escapeShots(again){const pct=again?97:94;return[
{name:'Down',note:'Sam races down the stairwell, floors counting down.',dur:6,fi:.2,music:()=>'flee',
 ev:[...evEvery('runstep',.2,5.8,.13)],
 lines:[[.6,3.2,'SAM','Don\'t stop. Don\'t look back.']],
 draw(t){const n=Math.round(lerp(88,1,ease(seg(t,.3,5.6))));shaftRun(t,{rate:2.6,floorAt:(j,k)=>Math.max(1,n-Math.round((j-k)/2))});
  R(262,14,50,20,'#05060a');txt('FLOOR',268,17,'#8891a6');txt(String(n).padStart(2,'0'),286,24,'#7dffb0',1);}},
{name:'Lobby',note:'The lobby doors lock as Sam reaches them. Wardens step out from behind the pillars. Dr. Voss was already waiting.',dur:7.4,top:true,music:t=>t<2.3?'flee':'trap',
 ev:[...evEvery('runstep',0,2.2,.13),[2.3,'lock'],[2.4,'slam'],[3.4,'boot'],[3.7,'boot'],[4,'boot'],[4.6,'stomp']],
 lines:[[2.6,3.8,'SAM','Locked?!'],[4.4,7.3,'DR. VOSS','Hello, Sam. Right on time.']],
 draw(t){lobby(t,{locked:seg(t,2.3,2.6)});
  const x=t<2.2?lerp(-12,214,t/2.2):214-Math.min(6,(t-2.2)*30);
  const wo=[[61,3.4],[179,3.7],[128,4]];
  wo.forEach(([wx,at])=>{if(t<at)return;const k=seg(t,at,at+.5);warden(Math.round(wx+(wx<120?-12:12)*(1-k)),160,{eye:1,t,look:wx<x?1:-1,step:Math.floor(t*4)});});
  if(t>3.9){const vx=lerp(-14,26,seg(t,3.9,5.2));doctor(Math.round(vx),160,{dir:1,pose:t>5.4?'point':'idle',glint:t>5.6&&t<6,grin:t>5.8});}
  emp(Math.round(x),160,{dir:t>4.2?-1:1,pose:t<2.2?'run':'recoil',frame:Math.floor(t*14),shock:t>2.2});
  if(t<2.2)drive(Math.round(x)+2,144,t);
  if(t>2.3)alarmWash(t,.8);}},
{name:'Predicted',note:'Dr. Voss, close up: he never chased Sam. He only waited where the data said Sam would go.',dur:9.6,music:()=>'trap',
 ev:[[.1,'boom'],[.9,'glint'],[4.4,'glint']],
 lines:[[.3,3.6,'DR. VOSS','You always take the stairs. And when you\'re scared, you run.'],[3.8,6.8,'DR. VOSS','I didn\'t have to chase you. I only had to wait where you\'d go.'],
        [6.9,9.5,'DR. VOSS',again?`Twice now. ${pct} percent. You're very easy to read.`:`${pct} percent, Sam. The data was right about you.`]],
 draw(t){vossFace(t);}},
{name:'Contained',note:'Warden POV: the prediction matches what Sam did. Subject contained, evidence recovered.',dur:7,music:()=>'trap',
 ev:[[.2,'boot'],...evEvery('radar',.6,6,.6),[4.6,'sting']],lines:[],
 draw(t){wardenPOV(t,[[`PREDICTION: SUBJECT FLEES DOWNSTAIRS   ${pct}%`,.3],['OBSERVED:   SUBJECT FLED DOWNSTAIRS',1.3],['RESULT:     CORRECT',2.2,'#ffb347'],['SUBJECT CONTAINED.  EVIDENCE RECOVERED.',3.1]],
   {big:'HE DID WHAT WE PREDICTED.',bigAt:4.6,sub:(t)=>{const gx=160,gy=128;emp(gx,gy,{dir:1,pose:'recoil',shock:true});warden(gx-34,gy,{eye:1,t,look:1,step:0});warden(gx+34,gy,{eye:1,t,look:-1,step:1});
     if(t>3.1){A(gx-50,gy-44,100,46,'#ff3b4a',.08);for(const[px,py,dx,dy]of[[gx-50,gy-44,1,1],[gx+50,gy-44,-1,1],[gx-50,gy+2,1,-1],[gx+50,gy+2,-1,-1]]){line(px,py,px+5*dx,py,'#ff3b4a');line(px,py,px,py+5*dy,'#ff3b4a');}}}});}},
{name:'Caught',note:'Caught: the lesson, then the player can rewind to the stairwell and choose again.',dur:6.4,fi:.4,nobars:true,music:()=>'trap',
 ev:[[.3,'hit']],lines:[],
 draw(t){R(0,0,W,H,'#050608');
  ctx.globalAlpha=seg(t,.2,.8);txtC('CAUGHT.',160,34,'#ff4656',4);
  ctx.globalAlpha=seg(t,1.2,1.8);txtC('YOU DID EXACTLY WHAT THE DATA SAID YOU WOULD.',160,66,'#d9dfeb');
  ctx.globalAlpha=seg(t,2.2,2.8);txtC('THE PROOF NEVER LEFT THE BUILDING.',160,78,'#8891a6');
  ctx.globalAlpha=seg(t,3.2,3.8);txtC('A PREDICTABLE CHOICE IS EASY TO BEAT.',160,96,'#ffb347');
  ctx.globalAlpha=1;},
 choice:{prompt:'They predicted Sam would run. Go back and choose again?',options:[{key:'rewind',label:'Rewind',sub:'Back to the stairwell on Floor 88.',then:()=>[
   {name:'Rewind',note:'VHS-style rewind back to the landing.',dur:1.8,nobars:false,music:()=>null,ev:[[0,'rewind']],lines:[],
    draw(t){shaftRun(1.8-t,{rate:6,floor0:88});for(let y=0;y<H;y+=3)A(0,y,W,1,'#ffffff',.08);A(0,(t*400)%H,W,8,'#ffffff',.3);txtO('<< REWIND',16,16,'#ffffff',2);}},
   stairShot(true)]}]}},
];}

function uploadShots(again){return[
{name:'Up',note:'Sam climbs toward the roof. Over the PA, Voss is caught off guard; the Wardens\' prediction flips to WRONG.',dur:7.4,fi:.2,music:()=>'rise1',
 ev:[...evEvery('runstep',.2,7,.15),[3.2,'glitch'],[3.3,'sting']],
 lines:[[.6,2.8,'SAM','Up. They won\'t expect up.'],[3.4,7.2,'DR. VOSS','The roof? That\'s... not what you were supposed to do.']],
 draw(t){shaftRun(t,{up:true,rate:1,floorAt:j=>j<0?'':j<6?88+j/2:j===6?'ROOF':''});
  const k=seg(t,3.2,3.6);A(10,14,148,30,'#14040a',.85);R(10,14,148,1,'#ff3b4a');
  txt(again?'PREDICTION: FLEES DOWNSTAIRS  97%':'PREDICTION: FLEES DOWNSTAIRS  94%',14,18,'#ff3b4a');
  if(t>3.2){const s='RESULT: WRONG  ( SUBJECT WENT UP )';txt(typed(s,t,3.3,40),14,30,Math.floor(t*4)%2?'#ffb347':'#ff3b4a');if(k<1)A(10,14,148,30,'#ffffff',.5*(1-k));}}},
{name:'Rooftop',note:'Rain on the roof. Sam bursts out of the stair door and sees the uplink. Wardens climb over the parapet.',dur:10,top:true,music:t=>t<5?'rise1':'rise2',
 ev:[[.4,'slam'],[.5,'wind'],...evEvery('runstep',.6,3,.13),[5,'boot'],[5.3,'boot'],[5.6,'boot'],...evEvery('stomp',6,9.5,.5)],
 lines:[[1.6,4.8,'SAM','There. The uplink. One upload and everyone sees the truth.'],[5.6,9.8,'DR. VOSS','Clever. But my Wardens learn, Sam. Every time they catch you, they get better.']],
 draw(t){const door=seg(t,.3,.6);rooftop(t,{door});
  const x=t<.6?30:Math.min(120,lerp(30,120,seg(t,.6,3)));
  [[176,5],[214,5.3],[298,5.6]].forEach(([wx,at])=>{if(t<at)return;const k=ease(seg(t,at,at+1));warden(wx,Math.round(lerp(196,150,k)),{eye:1,t,look:-1,step:Math.floor(t*3)});});
  emp(Math.round(x),150,{dir:1,pose:t<.6?'idle':t<3?'run':'idle',frame:Math.floor(t*14),shock:t>5.2&&t<6.4});
  drive(Math.round(x)+3,134,t);
  if(t>6.2&&t<9.8){const sp=Math.floor(t*2)%2;R(140,104,30,16,'#0b0c10');A(140,104,30,16,'#3fd0c9',.2);txtC('PA',155,108,sp?'#ff4656':'#8891a6');}
 }},
{name:'Learning',note:'Warden POV: the Wardens switch to learning mode. Every catch becomes training data.',dur:7,music:()=>'rise2',
 ev:[[.2,'boot'],...evEvery('data',1,5,.4),[4.8,'sting']],lines:[],
 draw(t){wardenPOV(t,[['SUBJECT BEHAVIOUR: UNEXPECTED',.3,'#ffb347'],['SWITCHING TO LEARNING MODE',1.2],['EVERY CATCH = NEW TRAINING DATA',2.1],['RECORD HIS ROUTE.  WAIT ON IT NEXT TIME.',3]],
   {big:'WE LEARN FROM EVERY CATCH.',bigAt:4.8,sub:(t)=>{const n=Math.floor(seg(t,1,4.6)*24);for(let i=0;i<n;i++){const x=40+(i%12)*20,y=76+Math.floor(i/12)*16;R(x,y,12,10,'#3a0d14');R(x+1,y+1,10,8,i%3?'#ff3b4a':'#ffb347');}}});}},
{name:'Level card',note:'Hand-off into Level 5.',dur:5.6,fi:.4,nobars:true,music:()=>null,
 ev:[[.3,'end']],lines:[],
 draw(t){R(0,0,W,H,'#050608');
  ctx.globalAlpha=seg(t,.2,1);txtC('LEVEL 5',160,44,'#8891a6',2);txtC('THE UPLINK',160,60,'#ff4656',3);
  ctx.globalAlpha=seg(t,1.3,2.1);txtC('GET THE EVIDENCE TO THE UPLINK.',160,96,'#d9dfeb');txtC('THEY LEARN FROM EVERY CATCH. DON\'T REPEAT YOURSELF.',160,106,'#ffb347');
  ctx.globalAlpha=1;if(t>2.6){const on=Math.floor(t*2)%2;R(157,130,6,5,on?'#ff3b4a':'#3a1015');if(on)A(152,125,16,15,'#ff3b4a',.25);}}},
];}

const DECISION_SHOTS=[
{name:'Floor 88',note:'The executive suite at night. Sam has both evidence drives. The lockdown alarm starts.',dur:7.6,fi:.6,music:t=>t<3.2?null:'decide',
 ev:[[.6,'data'],...evEvery('alarm',3.2,7.4,.7),[3.2,'lock']],
 lines:[[.6,3,'SAM','Got it. Both drives. Every file they stole.'],[3.6,7.4,'SAM','Lockdown. Now I just have to get it out of here.']],
 draw(t){floor88(t,{alarm:seg(t,3.2,3.6)});
  const reach=t<3.2;emp(150,150,{dir:1,pose:reach?'reach':'idle',shock:t>3.2&&t<4.2});
  if(reach)drive(157,128,t);else drive(152,140,t);}},
{name:'Wall screen',note:'Every screen on the floor switches to Dr. Voss.',dur:8.4,music:()=>'decide',
 ev:[[.2,'glitch'],[.4,'boot']],
 lines:[[.6,3.4,'DR. VOSS','Impressive, Sam. But the building is sealed.'],[3.5,8.3,'DR. VOSS','Down to the street, or up to the roof. Either way, I already know which you\'ll pick.']],
 draw(t){floor88(t,{alarm:1});A(0,0,W,H,'#000000',.45);vossScreen(t+.2,70,20,180,101);
  emp(40,150,{dir:1,pose:'idle',shock:true});drive(42,140,t);
  R(70,121,180,10,'#3b0d14');txtC('LOCKDOWN  /  ALL EXITS MONITORED',160,124,'#ff4656');}},
stairShot(false),
];

/* ---------- "Broadcast": the finale, after Level 5 ---------- */
// Sam uploads the evidence and the whole world sees it. The Wardens corner him at the edge of the roof,
// 99% sure of the catch, and then help comes from the one place they never looked: Pip, Clearpath's
// cheerful mascot robot from the TV ad, who runs the window-cleaning rig on the tower. The Wardens have
// no data on Pip, and the outside wall isn't a route in their model, so they can't predict either one.
// Pip lowers Sam down the side of the building to the police waiting below. A news montage shuts
// Clearpath down and Dr. Voss is arrested; then Sam tells his story on a live talk show, and fade to black.
const PIPC={white:'#ffffff',shade:'#dbe7ea',visor:'#0b2f3a',teal:'#3fd0c9',line:'#9fb3b8'};
function pip(x,y,o={}){ // the same Pip as the prologue's ad (prologue.js), in the cutscenes' pixel style
  const t=o.t||0;y+=Math.round(Math.sin(t*3)*1.5);
  R(x-7,y-9,14,18,PIPC.white);R(x-8,y-7,16,14,PIPC.white);R(x-8,y+4,16,3,PIPC.shade);R(x-7,y+7,14,2,PIPC.shade);
  R(x-6,y-6,12,7,PIPC.visor);R(x-5,y-7,10,1,PIPC.visor);
  const ec=o.red?'#ff2e3e':PIPC.teal,blink=!RM&&(t%3.1)<.12;
  if(blink){R(x-4,y-3,3,1,ec);R(x+1,y-3,3,1,ec);}else{R(x-4,y-4,3,3,ec);R(x+1,y-4,3,3,ec);R(x-4,y-4,1,1,'#d6fffb');R(x+1,y-4,1,1,'#d6fffb');}
  R(x,y-12,1,3,PIPC.line);R(x-1,y-14,3,2,ec);
  const w=o.wave?Math.round(Math.sin(t*10)*2):0;
  R(x-10,y-1,2,5,PIPC.white);R(x+8,y-4+w,2,5,PIPC.white);R(x-1,y+3,2,2,PIPC.teal);
  A(x-10,y-12,20,24,'#bff6ff',.08);
}
const COP={uni:'#22305a',uniD:'#151e3a',skin:'#c68a5e',skinD:'#9c6a46',cap:'#141a2e',badge:'#f2c230',shoe:'#0b0b0e'};
function cop(cx,gy,o={}){
  const d=o.dir||1,f=o.frame||0,run=o.pose==='run',walk=o.pose==='walk'||run;const P=(x,y,w,h,c)=>R(d>0?cx+x:cx-x-w,gy+y,w,h,c);
  const ph=walk?(run?[0,1,2,1,0,-1,-2,-1][f%8]:[0,1,0,-1][f%4]):0,bob=walk&&f%2?-1:0;
  P(0-ph*2,-10+bob,3,8,COP.uniD);P(0-ph*2,-2,4,2,COP.shoe);
  P(-2+ph*2,-10+bob,3,8,COP.uni);P(-2+ph*2,-2,4,2,COP.shoe);
  P(-3,-20+bob,8,11,COP.uni);P(-3,-20+bob,1,11,COP.uniD);P(-3,-11+bob,8,1,'#0b0e18');P(2,-18+bob,2,2,COP.badge);P(-1,-15+bob,1,2,'#3a4a7a');
  P(0,-21+bob,2,1,COP.skinD);P(-2,-28+bob,7,7,COP.skin);P(3,-25+bob,1,2,'#1a1a1a');P(3,-22+bob,2,1,COP.skinD);
  P(-3,-30+bob,8,3,COP.cap);P(2,-28+bob,5,1,COP.cap);P(0,-30+bob,2,1,COP.badge);
  if(o.hold){P(1,-18+bob,6,2,COP.uni);P(7,-18+bob,2,2,COP.skin);}
  else{const a=walk?ph:0;P(0+a,-19+bob,2,7,COP.uni);P(0+a,-12+bob,2,1,COP.skin);}
}
// Dr. Voss with his hands cuffed behind him.
function vossCuffed(cx,gy,o={}){doctor(cx,gy,{...o,pose:'idle'});const d=o.dir||1;R(d>0?cx-4:cx+1,gy-13,4,1,'#c9ccd2');R(d>0?cx-4:cx+1,gy-12,1,1,'#c9ccd2');}
function policeCar(x,gy,t,dir=1){
  const P=(px,py,w,h,c)=>R(dir>0?x+px:x-px-w,gy+py,w,h,c);
  P(-24,-12,48,8,'#e8ecf2');P(-24,-6,48,2,'#151a26');P(-14,-18,24,6,'#e8ecf2');P(-12,-17,9,4,'#3a4a6a');P(-1,-17,9,4,'#3a4a6a');
  P(-24,-12,48,1,'#ffffff');txt('POLICE',dir>0?x-5:x-9,gy-11,'#e8ecf2');
  P(-18,-4,8,4,'#0b0b0e');P(10,-4,8,4,'#0b0b0e');P(-16,-3,4,2,'#5d636e');P(12,-3,4,2,'#5d636e');
  const ph=Math.floor(t*6)%2;P(-6,-21,6,3,ph?'#ff2e3e':'#5a1018');P(0,-21,6,3,ph?'#1d3a8a':'#3d7bff');
  A(x-30,gy-36,60,30,ph?'#ff2e3e':'#3d7bff',.12);
}
function newsVan(x,gy,t){R(x,gy-26,44,20,'#e8ecf2');R(x,gy-26,44,2,'#ffffff');R(x+30,gy-20,12,7,'#3a4a6a');R(x+2,gy-18,22,7,'#b3141b');txt('CH 9 NEWS',x+3,gy-17,'#ffffff');
  R(x+4,gy-6,8,4,'#0b0b0e');R(x+30,gy-6,8,4,'#0b0b0e');R(x+10,gy-36,2,10,'#8891a6');ctx.fillStyle='#c9d1e0';ctx.beginPath();ctx.arc(x+11,gy-38,6,Math.PI,Math.PI*2);ctx.fill();}
function crowd(x0,x1,gy,t,seed=0){for(let x=x0,i=0;x<x1;x+=9,i++){const h=hash(i+seed),y=gy+Math.round(h*4);
  R(x,y-12,8,14,'#0c0e14');R(x+1,y-19,6,7,'#0c0e14');if(h>.35){const px=x+(h>.6?6:0),py=y-24+Math.round(Math.sin(t*2+i)*1);R(px,py,3,4,'#bfe6ff');A(px-2,py-2,7,8,'#bfe6ff',.18);
    if(hash(i*7+Math.floor(t*5)+seed)>.97)A(px-6,py-6,15,16,'#ffffff',.6);}}}
// The window-cleaning gondola, hanging on two cables from (x, topY).
function gondola(x,y,topY){
  line(x-12,topY,x-12,y-12,'#9fa6b3');line(x+12,topY,x+12,y-12,'#9fa6b3');
  R(x-16,y-1,32,3,'#8a93a3');R(x-16,y+2,32,1,'#4a5262');R(x-16,y-12,32,2,'#c9a227');R(x-16,y-12,2,12,'#8a93a3');R(x+14,y-12,2,12,'#8a93a3');
  for(let k=-11;k<14;k+=6)R(x+k,y-10,1,9,'#5d6678');R(x-6,y-7,14,2,'#2a7a6a');txt('PIP',x-5,y-7,'#d6fffb');
}
// The right edge of the roof: the low parapet, the drop to the street and the rig's arm over it.
function roofEdge(t){
  R(290,150,30,30,'#070a16');for(let i=0;i<6;i++)if(hash(i+7)>.4)R(292+i*5,156+hash(i)*20,1,2,'#ffd696');
  R(286,140,6,10,'#3a4150');R(286,140,6,1,'#5d6678');
  R(278,92,3,56,'#5d6678');R(278,92,42,3,'#5d6678');line(279,94,296,111,'#4a5262');
}
function hangingCables(){line(292,95,292,180,'#9fa6b3');line(316,95,316,180,'#9fa6b3');}
function uplinkScreen(t,p){
  R(0,0,W,H,'#05060d');rain(t,0,0,W,H,40,'#33405c');
  R(36,12,248,132,'#1c212c');R(36,12,248,2,'#3a4150');R(42,18,236,120,'#03100f');A(42,18,236,120,'#3fd0c9',.06);
  txt('CLEARPATH UPLINK  //  PUBLIC BROADCAST',48,23,'#3fd0c9');line(48,30,272,30,'#1d4a47');
  const files=['EMPLOYEE_HR_RECORDS.DB','CUSTOMER_MEDICAL.CSV','PRIVATE_MESSAGES.ZIP','WARDEN_TRAINING_LOG.TXT','DR_VOSS_EMAILS.ZIP','CONSENT FORMS: NONE FOUND'];
  files.forEach((f,i)=>{const done=p>=(i+1)/7;txt((done?'[X] ':'[ ] ')+f,48,36+i*9,done?(i===5?'#ff4656':'#7dffb0'):'#2d5753');});
  R(48,94,224,8,'#0b2b2a');R(48,94,Math.round(224*p),8,p>=1?'#7dffb0':'#3fd0c9');txt(`${Math.round(p*100)}%`,250,105,'#8fb5b0');
  txt(`SENDING TO ${Math.round(p*2114).toLocaleString('en-US')} NEWSROOMS IN ${Math.round(p*96)} COUNTRIES`,48,105,'#8fb5b0');
  if(p>=1){const on=Math.floor(t*4)%2;txtO('UPLOAD COMPLETE',Math.round(160-tw('UPLOAD COMPLETE',2)/2),118,on?'#7dffb0':'#d6fffb',2,'#03100f');}
  const k=p<1?Math.sin(t*14)>0?1:0:0;R(196,146+k,30,12,EMP.skin);R(196,146+k,30,2,EMP.skinD);R(188,152+k,10,20,EMP.shirt);R(226,147+k,4,6,EMP.skin);
}
function tvNews(t,x,y,w,h){R(x-3,y-3,w+6,h+6,'#1a1d24');R(x,y,w,h,'#132042');
  R(x+w/2-10,y+14,20,20,'#d9a27a');R(x+w/2-11,y+12,22,6,'#2a1a10');R(x+w/2-16,y+34,32,h-34,'#2b3550');R(x+w/2-2,y+34,4,10,'#f2f2f2');
  R(x+w-30,y+8,24,16,'#05070c');txt('LIVE',x+w-26,y+13,'#ff4656');
  R(x,y+h-22,w,12,'#b3141b');txt('BREAKING',x+3,y+h-19,'#ffffff');R(x,y+h-10,w,10,'#05070c');
  ctx.save();ctx.beginPath();ctx.rect(x,y+h-10,w,10);ctx.clip();const s='CLEARPATH TRAINED ITS WARDENS ON STOLEN PRIVATE DATA  *  NO CONSENT ON FILE  *  ';txt(s+s,x+w-((t*40)%tw(s+'  ')),y+h-7,'#ffffff');ctx.restore();}
function phoneFeed(t,x,y){R(x,y,66,96,'#0b0c10');R(x+3,y+6,60,84,'#f2f4f8');R(x+27,y+2,12,2,'#2a2e38');
  txt('#CLEARPATHFILES',x+4,y+9,'#3d7bff');
  for(let i=0;i<3;i++){const py=y+19+i*24;R(x+5,py,56,20,'#ffffff');R(x+5,py,56,1,'#dbe0ea');R(x+7,py+3,6,6,['#ff9f43','#5ab0ff','#2bd36a'][i]);R(x+15,py+3,30,2,'#8891a6');R(x+15,py+7,40,2,'#c9d1e0');R(x+15,py+11,28,2,'#c9d1e0');
    const likes=Math.floor(Math.max(0,t-1)*(i+1)*9000+i*1300);txt(`${likes>999?Math.floor(likes/1000)+'K':likes}`,x+42,py+14,'#ff4656');}}
function billboard(t,x,y,w,h){R(x-4,y-4,w+8,h+60,'#0d1220');for(let k=0;k<5;k++)R(x-4,y+h+4+k*10,w+8,1,'#151b2c');
  R(x,y,w,h,'#05070c');A(x,y,w,h,'#ff4656',.08+.04*Math.sin(t*5));
  txt('> LOAD PRIVATE_MESSAGES',x+4,y+6,'#39f5c4');txt('> LOAD HOME ADDRESSES',x+4,y+14,'#39f5c4');txt('> CONSENT ON FILE: NONE',x+4,y+24,'#ff4656');
  if(Math.floor(t*2)%2)txtO('#CLEARPATHFILES',x+4,y+h-12,'#ffffff',1,'#000');}
// The tower's outside wall with the camera riding down it: `off` is how far down we've come, so the
// windows (and the neighbouring buildings) slide UP the screen as the gondola drops.
function facade(off){R(0,0,W,H,'#070912');skyline(-80,250-off*.14,'#0b0f1a','#ffd696');
  R(40,0,250,H,'#0d1220');for(let row=Math.floor(off/14);row*14-off<H;row++){const y=row*14-off;for(let x=46;x<284;x+=16){const lit=hash(row*31+x)>.55;R(x,y,12,9,lit?'#2a3352':'#121a2e');if(lit)A(x,y,12,9,'#ffd696',.18);}}
  for(let x=44;x<290;x+=16)R(x,0,2,H,'#070912');
  for(let i=0;i<10;i++){const x=20+hash(i)*280,y=H-((off*1.6+hash(i*5)*H*3)%(H+40));A(x,y,1,22,'#c9d6ff',.18);}} // wind streaks rushing past, upward
function newsFrame(t,cap,sub){
  R(0,128,W,34,'#0b0e18');A(0,128,W,34,'#000000',.2);R(0,128,W,1,'#ff4656');
  R(0,130,58,14,'#b3141b');txt('BREAKING',6,135,'#ffffff');txt(cap,64,132,'#ffffff',2);txt(sub,64,149,'#c9d1e0');
  R(0,162,W,9,'#b3141b');ctx.save();ctx.beginPath();ctx.rect(0,162,W,9);ctx.clip();const s='THE CLEARPATH FILES  *  CLEARPATH SHUT DOWN  *  DR. VOSS ARRESTED  *  STOLEN DATA DELETED  *  ';txt(s+s,W-((t*50)%tw(s+'  ')),164,'#ffffff');ctx.restore();
  R(286,12,28,9,'#05070c');txt('CH 9',291,14,'#ffffff');
}
function towerExterior(t,dark){R(0,0,W,H,'#070912');skyline(0,150,'#0b0f1a','#ffd696');
  R(110,12,100,144,'#0d1220');for(let r=0;r<16;r++)for(let c=0;c<7;c++){const off=dark>0&&r<dark;R(116+c*13,32+r*7,9,4,off?'#0a0e18':hash(r*9+c)>.4?'#ffd696':'#1a2238');}
  const logoOn=dark<16||(dark<18&&Math.floor(t*12)%2);logo(160,22,logoOn?'#3fd0c9':'#1a2a2c',2);A(140,12,40,20,'#3fd0c9',logoOn?.12:0);
  R(0,150,W,30,'#15181f');R(96,136,128,4,'#f2c230');for(let x=100;x<220;x+=16)R(x,136,6,4,'#0b0b0e');txtC('POLICE LINE',160,130,'#f2c230');
  A(0,0,W,H,Math.floor(t*6)%2?'#ff2e3e':'#3d7bff',.06);}
// The talk show: a late-night studio, the host at her desk, Sam in the guest chair, Pip beside him.
const HOST={skin:'#d9a27a',skinD:'#b07e5a',hair:'#20140e',blazer:'#b3263a',blazerD:'#7a1a28'};
function hostAtDesk(cx,y,t,talking){
  R(cx-6,y-16,12,16,HOST.blazer);R(cx-6,y-16,2,16,HOST.blazerD);R(cx-1,y-16,4,5,'#f2f2f2');
  R(cx-2,y-18,4,2,HOST.skinD);R(cx-4,y-25,8,8,HOST.skin);R(cx-5,y-27,10,3,HOST.hair);R(cx-5,y-25,3,9,HOST.hair);
  R(cx+2,y-22,1,2,'#1a1a1a');const m=talking&&Math.floor(t*8)%2;R(cx+2,y-19,2,m?2:1,m?'#5a2a2a':HOST.skinD);R(cx-2,y-20,1,1,'#f2c230');
  R(cx+4,y-6,5,2,HOST.blazer);R(cx+8,y-7,4,4,'#f2f2f2');}
function samSeated(cx,gy,t,talking){
  const P=(x,y,w,h,c)=>R(cx-x-w,gy+y,w,h,c),B='#2b3550';
  R(cx+2,gy-25,5,17,'#7a2a3a');R(cx-9,gy-11,16,5,'#8a3242');R(cx-8,gy-6,2,6,'#3a141c');R(cx+4,gy-6,2,6,'#3a141c');
  P(6,-2,4,2,EMP.shoe);P(6,-8,3,6,EMP.pants);P(-1,-12,9,4,EMP.pants);
  P(-3,-22,7,11,B);P(0,-22,2,8,EMP.shirt);P(1,-21,1,6,EMP.tie);P(0,-23,2,1,EMP.skinD);
  P(-2,-30,7,7,EMP.skin);P(-2,-31,7,2,EMP.hair);P(-3,-30,3,4,EMP.hair);P(3,-27,1,2,'#1a1a1a');
  const m=talking&&Math.floor(t*8)%2;P(3,-24,2,m?2:1,m?'#5a2a2a':'#8a4a3a');
  const g=talking?Math.round(Math.sin(t*5)*2):0;P(0,-19,2,6,B);P(1,-13+Math.min(0,g),5,2,B);P(6,-13+Math.min(0,g),2,2,EMP.skin);
}
function studio(t){
  R(0,0,W,120,'#120e2e');for(let y=0;y<120;y+=8)A(0,y,W,8,'#2a1d5a',y/400);
  skyline(-30,118,'#231a52','#ffd696');for(let i=0;i<30;i++)R(hash(i)*W,hash(i*5)*60,1,1,'#c9c0ff');
  txtO('TONIGHT',112,16,'#ff4fa3',2,'#120e2e');txtO('LIVE',178,16,'#ffd166',2,'#120e2e');A(104,10,116,18,'#ff4fa3',.08+.03*Math.sin(t*3));
  for(const sx of[40,160,280]){ctx.fillStyle='#fff6d8';ctx.globalAlpha=.06;ctx.beginPath();ctx.moveTo(sx-4,0);ctx.lineTo(sx+4,0);ctx.lineTo(sx+40,124);ctx.lineTo(sx-40,124);ctx.fill();ctx.globalAlpha=1;}
  R(0,120,W,44,'#2a1d3d');A(0,120,W,4,'#ff4fa3',.15);for(let x=0;x<W;x+=32)A(x,124,16,40,'#ffffff',.02);
  R(10,12,30,10,'#b3141b');R(13,15,4,4,Math.floor(t*2)%2?'#ffffff':'#ff8a94');txt('LIVE',20,15,'#ffffff');
}
function studioDesk(){R(30,104,92,30,'#5a3a24');R(30,104,92,3,'#7a5234');R(36,110,80,20,'#4a2e1c');txtC('TONIGHT LIVE',76,117,'#ffd166');}
function audience(t,clap){for(let x=-4,i=0;x<W;x+=14,i++){const b=clap?Math.round(Math.abs(Math.sin(t*9+i))*2):0;R(x,164-b-((i%2)*3),12,20,'#07060f');R(x+2,157-b-((i%2)*3),8,8,'#07060f');}}
function samTalk(t,talking){
  cam(0,0,4);
  R(0,0,80,45,'#18123c');for(let i=0;i<14;i++)A(hash(i)*80,hash(i*3)*30,3,3,['#ff4fa3','#ffd166','#7f6bff'][i%3],.25);
  R(24,0,32,6,EMP.hair);R(23,2,3,12,EMP.hair);R(54,2,3,12,EMP.hair);R(23,13,3,6,EMP.skinD);R(54,13,3,6,EMP.skinD);
  R(26,4,28,26,EMP.skin);R(28,4,10,3,EMP.hair);R(44,4,8,2,EMP.hair);
  R(34,30,12,4,EMP.skinD);R(14,33,52,12,'#2b3550');line(30,33,36,44,'#1c2438');line(50,33,44,44,'#1c2438');R(34,33,12,4,'#f2f2f2');R(38,34,4,11,EMP.tie);
  R(29,10,8,2,EMP.hair);R(43,10,8,2,EMP.hair);
  const bl=(t%4.3)<.12;if(bl){R(29,15,8,1,'#1a1a1a');R(43,15,8,1,'#1a1a1a');}else{R(29,13,8,5,'#f2f2f2');R(43,13,8,5,'#f2f2f2');R(32,14,3,3,'#3b2416');R(46,14,3,3,'#3b2416');R(32,14,1,1,'#ffffff');R(46,14,1,1,'#ffffff');}
  R(39,17,3,5,EMP.skinD);
  const m=talking&&Math.floor(t*7)%3;if(m){R(35,23,10,3,'#4a1f22');R(36,23,8,1,'#efe9e0');}else{R(35,24,10,1,'#7a3a2a');R(34,23,1,1,'#7a3a2a');R(45,23,1,1,'#7a3a2a');}
  A(26,4,5,26,'#ffd696',.14);A(49,4,5,26,'#ff4fa3',.1);
  home();
}

const FINALE_SHOTS=[
{name:'Upload',note:'Close on the uplink terminal: the files go out to the world.',dur:6.8,fi:.5,music:t=>t<4.4?'rise2':'triumph',
 ev:[[.3,'key'],[.6,'key'],[.9,'key'],...evEvery('data',1.2,4.3,.45),[4.4,'boom'],[4.5,'ding']],
 lines:[[.3,2.8,'SAM','Come on... come on...'],[4.8,6.7,'SAM','It\'s out. Everyone can see it now.']],
 draw(t){uplinkScreen(t,ease(seg(t,.6,4.4)));}},
{name:'The world sees',note:'TV news, a phone feed and a city billboard all show the Clearpath Files.',dur:7.4,music:()=>'triumph',
 ev:[[.2,'sting'],[1.6,'data'],[3,'data']],
 lines:[[.5,3.6,'NEWS','Breaking tonight: leaked files show Clearpath trained its security robots on stolen private data.'],[3.8,7.2,'NEWS','The files are spreading around the world. No one whose data was used was ever asked.']],
 draw(t){R(0,0,W,H,'#070912');skyline(0,170,'#0b0f1a','#ffd696');
  const k=i=>ease(seg(t,i*1.3,i*1.3+.6));
  ctx.save();ctx.translate(0,Math.round((1-k(0))*-140));tvNews(t,10,22,102,76);ctx.restore();
  ctx.save();ctx.translate(0,Math.round((1-k(1))*160));phoneFeed(t,126,18);ctx.restore();
  ctx.save();ctx.translate(Math.round((1-k(2))*160),0);billboard(t,210,24,104,44);crowd(204,320,166,t,3);ctx.restore();
  if(t>4.4)txtO(typed('THE WHOLE WORLD IS WATCHING.',t,4.4,24),Math.round(160-tw('THE WHOLE WORLD IS WATCHING.',2)/2),124,'#ffd166',2);}},
{name:'Cornered',note:'Back on the roof: three Wardens close in on Sam at the edge. Dr. Voss steps out of the stair door.',dur:9.4,top:true,music:()=>'trap',
 ev:[...evEvery('stomp',.6,7.4,.45),[2,'slam'],[2.2,'wind']],
 lines:[[.6,2.8,'SAM','It\'s already out there, Voss. Every file.'],[3.2,6.4,'DR. VOSS','Then you are the only thing left on this roof that I still control.'],[6.6,9.2,'DR. VOSS','Wardens. Contain him.']],
 draw(t){rooftop(t,{door:seg(t,1.8,2.1)});roofEdge(t);hangingCables();
  if(t>2.1){const vx=lerp(30,94,seg(t,2.3,4.4));doctor(Math.round(vx),150,{dir:1,pose:t>6.6?'point':'idle',glint:t>3&&t<3.3,grin:t>4.6});}
  [[-20,186],[14,214],[46,242]].forEach(([a,b],i)=>{const x=lerp(a,b,ease(seg(t,.4,7.6)));warden(Math.round(x),150+(i%2)*3,{eye:1,t,look:1,step:Math.floor(t*3)+i});});
  emp(Math.round(lerp(266,280,seg(t,.4,3))),150,{dir:-1,pose:'idle',shock:t>6.6});drive(Math.round(lerp(266,280,seg(t,.4,3)))-9,134,t);
  A(0,0,W,H,'#ff1030',.04+.03*Math.sin(t*4));}},
{name:'No way out',note:'Warden POV: no safe moves left. Capture in one move, 99% sure.',dur:5.6,music:()=>'trap',
 ev:[[.1,'boot'],...evEvery('radar',.5,5,.5),[3.6,'sting']],lines:[],
 draw(t){wardenPOV(t,[['SUBJECT: S.REYES  /  POSITION: ROOF EDGE',.2],['SAFE MOVES LEFT: 0',1],['CAPTURE IN: 1 MOVE',1.7],['CONFIDENCE: 99%',2.4,'#ffb347']],
  {big:'NOWHERE LEFT TO GO.',bigAt:3.6,sub:(t)=>{const cx=236,cy=76;R(cx-1,cy-1,3,3,'#5ab0ff');[[-26,-14],[26,-14],[-26,14],[26,14]].forEach(([dx,dy],i)=>{if(t<.8+i*.25)return;line(cx,cy,cx+dx,cy+dy,'#8a1a24');const x=cx+dx,y=cy+dy;line(x-2,y-2,x+2,y+2,'#ff3b4a');line(x-2,y+2,x+2,y-2,'#ff3b4a');});}});}},
{name:'Pip',note:'The window-cleaning gondola rises over the edge behind Sam. Pip, Clearpath\'s own mascot robot, is driving it.',dur:10.4,top:true,music:t=>t<1.4?'trap':'rise1',
 ev:[[1.2,'motor'],[1.9,'motor'],[2.8,'clank'],[3,'ding'],[8,'clank']],
 lines:[[2.9,5.4,'PIP','Hi, Sam! I saw the news. Need a lift?'],[5.5,6.8,'SAM','Pip?! You work for Clearpath!'],[6.9,10.2,'PIP','I clean the windows. And the Wardens have never studied me. Hop in!']],
 draw(t){rooftop(t,{door:1});roofEdge(t);
  doctor(94,150,{dir:1,pose:t<2.8?'point':'idle',glint:t>3.2&&t<3.5});
  const stun=t>2.8;
  [186,214,242].forEach((x,i)=>{const fwd=Math.round(seg(t,.2,1.2)*6);warden(x+fwd,150+(i%2)*3,{eye:stun?(Math.floor(t*7+i)%3?1:.2):1,t,look:stun?(Math.floor(t*2+i)%2?1:-1):1,step:0});
    if(stun&&t<8)txt('?',x+fwd-1,108+(i%2)*3,'#ffb347');});
  const gy=t<1.2?200:Math.round(lerp(200,150,ease(seg(t,1.2,2.8))))+(t>9.4?Math.round((t-9.4)*30):0);
  if(t>1.2){ctx.fillStyle='#fff6c8';ctx.globalAlpha=.1;ctx.beginPath();ctx.moveTo(306,gy-20);ctx.lineTo(270,0);ctx.lineTo(320,0);ctx.fill();ctx.globalAlpha=1;}
  const jump=seg(t,8,8.7),sx=Math.round(lerp(280,298,jump)),sy=Math.round(lerp(150,gy,jump)-Math.sin(jump*Math.PI)*12);
  if(t<=1.2)hangingCables();
  if(jump>=1){emp(sx,sy,{dir:-1,pose:'idle'});drive(sx-9,sy-16,t);}
  if(t>1.2){pip(312,gy-18,{t,wave:t>2.8&&t<5.5});gondola(304,gy,95);}
  if(jump<1){emp(sx,sy,{dir:jump>0?1:-1,pose:jump>0?'run':'idle',shock:t>2.8&&t<5.5,frame:Math.floor(t*14)});drive(jump>0?sx+2:sx-9,sy-16,t);}
  R(286,140,6,10,'#3a4150');}},
{name:'Unknown',note:'Warden POV: an unknown agent with no training data, on a route that isn\'t in their model. The prediction fails.',dur:6.2,music:()=>'rise1',
 ev:[[.1,'glitch'],[1.2,'glitch'],[2.4,'glitch'],[4,'sting']],lines:[],
 draw(t){wardenPOV(t,[['UNKNOWN AGENT: PIP-07 (WINDOW CLEANING)',.2,'#ffb347'],['TRAINING DATA ON AGENT: NONE',1],['ROUTE: OUTSIDE WALL  /  NOT IN MODEL',1.8],['PREDICTION: ???  ???  ???',2.6,'#ffb347']],
  {big:'IT WAS NEVER IN OUR DATA.',bigAt:4,sub:(t)=>{const g=Math.floor(t*10)%3===0?2:0;pip(240+g,96,{t,red:Math.floor(t*4)%2===0});for(const[x,y,dx,dy]of[[218,74,1,1],[262,74,-1,1],[218,120,1,-1],[262,120,-1,-1]]){line(x,y,x+4*dx,y,'#ffb347');line(x,y,x,y+4*dy,'#ffb347');}txt('???',234,124,'#ffb347');
   if(Math.floor(t*8)%4===0)A(0,hash(Math.floor(t*8))*H,W,6,'#ffffff',.2);}});}},
{name:'Down the wall',note:'Pip lowers the gondola down the outside of the tower. Up top, Voss and the Wardens can only watch.',dur:8.6,music:()=>'rise2',
 ev:[[.2,'motor'],[1.1,'motor'],[2,'motor'],[3,'motor'],[4,'motor'],[5,'motor'],[6,'motor'],[7,'motor']],
 lines:[[.2,2.2,'DR. VOSS','No! Stop them!'],[2.6,6.4,'PIP','Wardens only predict what they\'ve seen before. Nobody ever showed them me!']],
 draw(t){const off=t*60;facade(off);
  // The roof edge they just left, with Voss and two Wardens looking down, sliding up and out of frame.
  const ry=Math.round(66-off);if(ry>-10){R(30,0,270,Math.max(0,ry),'#05060d');R(30,ry,270,6,'#3a4150');doctor(150,ry,{dir:1,pose:'point'});warden(110,ry,{eye:1,t,look:1,step:0});warden(200,ry,{eye:1,t,look:-1,step:1});}
  if(t>7){const gy=Math.round(lerp(H+30,124,seg(t,7,8.6)));R(0,gy,W,H,'#16181e');R(0,gy,W,3,'#2a2e38');A(0,gy-30,W,30,Math.floor(t*6)%2?'#ff2e3e':'#3d7bff',.12);} // the street coming up to meet them
  emp(152,110,{dir:1,pose:'idle'});drive(154,94,t);pip(170,92,{t,wave:t>2.6&&t<6.4});gondola(160,110,-10);
  const fl=Math.max(1,Math.round(lerp(88,1,seg(t,.6,8.4))));R(268,14,44,22,'#05060a');txt('FLOOR',274,17,'#8891a6');txt(String(fl).padStart(2,'0'),280,25,'#ffd166',1);}},
{name:'Street',note:'The street below: police cars, news vans, a crowd with phones up. Sam hands the drives to an officer; police run into the building.',dur:8.4,top:true,music:()=>'triumph',
 ev:[[.2,'siren'],[1.2,'clank'],[2.4,'siren'],[4.6,'siren'],[4.8,'flash'],[5.4,'flash'],[6.8,'siren']],
 lines:[[1.6,4.4,'SAM','Officer! It\'s all on these drives. Every file.'],[4.6,8.2,'OFFICER','We saw it on the news, Sam. So did every officer in the city.']],
 draw(t){R(0,0,W,H,'#070912');skyline(60,150,'#0b0f1a','#ffd696');
  R(0,0,150,150,'#0d1220');for(let y=6;y<104;y+=12)for(let x=6;x<146;x+=16)R(x,y,12,8,hash(x*3+y)>.5?'#2a3352':'#121a2e');
  R(94,108,44,42,'#1c2438');R(98,112,36,38,'#0a1020');A(98,112,36,38,'#ffd696',.1);R(115,112,2,38,'#1c2438');txtC('CLEARPATH',116,102,'#3fd0c9');
  R(0,150,W,6,'#2a2e38');R(0,156,W,24,'#16181e');for(let x=0;x<W;x+=24)R(x,166,12,1,'#5d636e');
  gondola(40,150,-10);pip(54,132,{t});
  policeCar(200,174,t,-1);policeCar(276,176,t+.3,-1);newsVan(296,168,t);
  const sx=t<1.2?36:Math.min(118,lerp(36,118,seg(t,1.2,3.2)));
  const handed=t>5;
  emp(Math.round(sx),150,{dir:1,pose:t>1.2&&t<3.2?'walk':handed?'idle':'reach',frame:Math.floor(t*8)});if(!handed)drive(Math.round(sx)+(t>3.2?8:2),t>3.2?130:134,t);
  const cx=Math.round(lerp(176,140,seg(t,1,2.6)));cop(cx,150,{dir:-1,pose:t>1&&t<2.6?'walk':'idle',hold:handed,frame:Math.floor(t*8)});if(handed)drive(cx-10,131,t);
  [[0,5.4],[1,5.8]].forEach(([i,at])=>{if(t<at)return;const x=Math.round(330-(t-at)*90);if(x>112)cop(x,150+i*2,{dir:-1,pose:'run',frame:Math.floor(t*14)+i});});
  crowd(150,330,182,t,1);
  A(0,0,W,H,Math.floor(t*6)%2?'#ff2e3e':'#3d7bff',.05);}},
{name:'Lights out',note:'Montage: the Clearpath tower goes dark behind police tape.',dur:4.8,fi:.2,fo:.15,music:()=>'triumph',
 ev:[[.1,'camclick'],[1.4,'powerdown'],[2.6,'powerdown']],lines:[],
 draw(t){towerExterior(t,Math.floor(seg(t,1.2,2.6)*17)+(t>2.6?1:0));newsFrame(t,'CLEARPATH SHUT DOWN','REGULATORS CLOSE THE COMPANY OVER THE LEAKED FILES');}},
{name:'Wardens off',note:'Montage: every Warden powers down, one by one.',dur:4.8,fi:.15,fo:.15,music:()=>'triumph',
 ev:[[.1,'camclick'],...[0,1,2,3,4].map(i=>[.6+i*.45,'powerdown'])],lines:[],
 draw(t){R(0,0,W,H,'#0e1117');R(0,0,W,16,'#15171c');for(let x=10;x<W;x+=70)R(x,14,34,2,'#e8f0ff');
  for(let i=0;i<5;i++){const x=34+i*63;R(x-26,34,52,90,'#1b1e24');R(x-26,34,52,2,'#f2c230');warden(x,122,{eye:1-seg(t,.6+i*.45,.8+i*.45),t,look:0,step:0});}
  R(0,122,W,10,'#262a30');newsFrame(t,'WARDENS SHUT OFF','EVERY WARDEN IS POWERED DOWN FOR GOOD');}},
{name:'Arrest',note:'Montage: Dr. Voss is led out in handcuffs past the cameras.',dur:4.8,fi:.15,fo:.15,music:()=>'triumph',
 ev:[[.1,'camclick'],[.8,'flash'],[1.5,'flash'],[2.1,'flash'],[2.9,'flash'],[3.6,'flash']],lines:[],
 draw(t){R(0,0,W,H,'#0b0d14');R(0,0,W,120,'#141822');for(let x=20;x<W;x+=60){R(x,20,24,100,'#1c212c');R(x,20,24,2,'#3a4150');}
  R(0,120,W,8,'#2a2e38');policeCar(276,128,t,-1);
  const x=Math.round(lerp(40,196,t/4.8)),f=Math.floor(t*6);cop(x-14,124,{dir:1,pose:'walk',frame:f});vossCuffed(x,124,{dir:1,glint:t>2&&t<2.3});cop(x+15,124,{dir:1,pose:'walk',frame:f+2});
  crowd(-4,330,136,t,5);for(const at of[.8,1.5,2.1,2.9,3.6])if(t>at&&t<at+.12)A(0,0,W,H,'#ffffff',.35);
  newsFrame(t,'DR. VOSS ARRESTED','CHARGED WITH USING PRIVATE DATA WITHOUT CONSENT');}},
{name:'Deleted',note:'Montage: a court orders every stolen file deleted. The counter runs to zero.',dur:4.8,fi:.15,fo:.25,music:()=>'triumph',
 ev:[[.1,'camclick'],...evEvery('data',.6,3,.3),[3.1,'ding']],lines:[],
 draw(t){R(0,0,W,H,'#05070c');R(40,16,240,104,'#0b111a');R(40,16,240,1,'#3fd0c9');
  txt('PRIVATE RECORDS TAKEN WITHOUT CONSENT',50,24,'#3fd0c9');txt('4,812 PEOPLE  /  1.2M ROWS  /  88 GB',50,34,'#8fb5b0');
  const p=ease(seg(t,.5,3));R(50,52,220,10,'#0b2b2a');R(50,52,Math.round(220*p),10,'#ff4656');txt(p<1?'DELETING...':'DONE',50,66,'#ffb347');
  txt(`FILES REMAINING: ${Math.round((1-p)*4812).toLocaleString('en-US')}`,50,80,p<1?'#d9dfeb':'#7dffb0',2);
  if(t>3.2)txt('EVERY PERSON IS TOLD WHAT WAS TAKEN.',50,100,'#d9dfeb');
  newsFrame(t,'STOLEN DATA DELETED','A COURT ORDERS EVERY FILE ERASED');}},
{name:'Talk show',note:'Months later: Sam (and Pip) on a live late-night talk show. Applause.',dur:15,fi:.8,music:()=>'talk',
 ev:[[.2,'fanfare'],[.3,'applauseLong'],[8.3,'applause'],[14.5,'applause']],
 lines:[[1,4.2,'HOST','Please welcome the man who outsmarted the Wardens... Sam Reyes!'],[4.4,6.2,'SAM','Thanks! And this is Pip.'],[6.3,8.2,'PIP','Hi! I clean windows!'],
        [8.6,11.2,'HOST','So how do you beat a machine that knows what you\'ll do next?'],[11.4,14.8,'SAM','You do the one thing it never saw coming. And it helps to have a friend it never saw coming.']],
 draw(t){studio(t);studioDesk();
  const hostTalk=(t>1&&t<4.2)||(t>8.6&&t<11.2),samTalkNow=(t>4.4&&t<6.2)||(t>11.4&&t<14.8);
  R(146,126,96,6,'#3a2a52');R(146,126,96,1,'#ff4fa3');// the guest riser
  hostAtDesk(66,104,t,hostTalk);samSeated(204,126,t,samTalkNow);pip(234,100,{t,wave:t>6.3&&t<8.2});
  audience(t,t<2.6||(t>8.3&&t<9.8)||t>14.6);}},
{name:'Close-up',note:'Sam, close, under the studio lights. His message, then a slow fade to black.',dur:17,fo:3.6,music:t=>t<13.4?'talk':null,
 ev:[[13.5,'applauseLong']],
 lines:[[3.4,6.8,'SAM','The Wardens weren\'t magic. They were trained on my life: my badge swipes, my habits, even what I do when I\'m scared.'],
        [6.9,9.2,'SAM','And nobody ever asked me if that was OK.'],[9.3,11.8,'SAM','If an AI is going to learn from you, you deserve to be asked first.'],[11.9,13.4,'SAM','Your data is yours. Make them ask.']],
 draw(t){const talk=(t>3.4&&t<6.8)||(t>6.9&&t<9.2)||(t>9.3&&t<11.8)||(t>11.9&&t<13.4);samTalk(t,talk);
  if(t>.3&&t<3.3){const k=ease(seg(t,.3,.8))*(1-seg(t,2.9,3.3));R(14,138,Math.round(220*k),26,'#120e2e');R(14,138,3,26,'#ff4fa3');if(k>.9){txt('SAM REYES',22,142,'#ffffff',2);txt('WHISTLEBLOWER  /  THE CLEARPATH FILES',22,155,'#c9c0ff');}}
  R(10,12,30,10,'#b3141b');txt('LIVE',20,15,'#ffffff');R(13,15,4,4,'#ffffff');}},
{name:'Black',note:'Fade to black.',dur:2.6,nobars:true,music:()=>null,ev:[],lines:[],draw(){R(0,0,W,H,'#000000');}},
];

/* ---------- Level cards: a short title card before each level ---------- */
// Played between levels (and when a level is picked from the menu): the level's number and name, where
// you are in the story, the new idea, and what's hunting you, over a small animated picture of the place.
const CARD={
  basement:{accent:'#ffb347',bg:'#120b07',tag:['TRAPPED UNDER CLEARPATH.','ONE WARDEN. IT NEVER STOPS CHASING.'],art(t){
    for(let y=10;y<150;y+=8)for(let x=180+((y/8)%2)*6;x<W;x+=12){R(x,y,11,7,'#3a1f16');A(x,y,11,1,'#ffffff',.04);}
    R(180,150,W-180,30,'#1a1310');
    const a=Math.sin(t*1.7)*.35,bx=262+Math.sin(a)*48,by=10+Math.cos(a)*48;line(262,10,bx,by,'#5a4a3a');
    for(let r=40;r>4;r-=6)A(bx-r,by-r,r*2,r*2,'#ffcf7a',.03);R(bx-3,by,6,7,'#ffe6a8');
    A(bx-40,150,80,30,'#ffcf7a',.12);
    warden(220,152,{eye:1,t,look:1,step:Math.floor(t*3)});}},
  'server-halls':{accent:'#5ab0ff',bg:'#060a12',tag:['THE SERVER FLOOR, AFTER HOURS.','THIS WARDEN PREDICTS WHERE YOU WILL BE.'],art(t){
    for(let i=0;i<4;i++){const x=184+i*34;R(x,24,28,126,'#121a26');R(x,24,28,2,'#2a3a52');
      for(let y=30;y<146;y+=6){R(x+3,y,22,4,'#0b111a');if(hash(i*97+y+Math.floor(t*4+i))>.55)R(x+4+((y*7)%16),y+1,2,2,hash(y+i)>.8?'#ff4656':'#3dff8a');}}
    A(180,140,W-180,40,'#5ab0ff',.06);R(300,12,12,6,'#2a3442');if(Math.floor(t*2)%2)R(302,14,3,3,'#ff3b4a');
    warden(268,160,{eye:1,t,look:-1,step:0});}},
  core:{accent:'#f2c230',bg:'#0b0c10',tag:['THE PROVING GROUND.','TWO WARDENS NOW PLAN AS ONE TEAM.'],art(t){
    R(180,140,W-180,40,'#20232a');for(let x=180;x<W;x+=10){R(x,140,5,4,'#f2c230');}
    for(const [x,e] of [[214,seg(t,.5,.7)],[258,seg(t,1,1.2)],[300,0]]){R(x-16,150,32,4,'#3a3f48');warden(x,148,{eye:e,t,look:0,step:0});}
    const sx=180+((t*60)%140);A(sx,20,3,120,'#bfe6ff',.25);}},
  executive:{accent:'#c9a85c',bg:'#07080c',tag:['FLOOR 88. THE CHIEFS KEEP THE PROOF HERE.','THEY KNOW WHAT YOU CAME FOR.','AND A RULE-BOUND DRONE GUARDS THE DOOR.'],art(t){
    R(180,10,W-180,150,'#0d1424');
    for(let i=0;i<9;i++){const bh=40+hash(i)*70,x=184+i*15;R(x,160-bh,13,bh,'#151b2c');for(let y=166-bh;y<156;y+=6)if(hash(i*13+y)>.55)R(x+3,y,2,2,'#ffd696');}
    for(let i=0;i<40;i++){const x=180+hash(i)*140,y=(hash(i*3)*150+t*90)%150+10;line(x,y,x+1,y+6,'#9fb4d8',0);}
    for(let x=180;x<W;x+=46)R(x,10,3,150,'#05060a');R(180,10,W-180,4,'#05060a');R(180,156,W-180,4,'#c9a85c');
    txtO('88',282,24,'#c9a85c',2,'#05060a');}},
  uplink:{accent:'#ff4656',bg:'#05060d',tag:['THE ROOF. THE WORLD IS ONE UPLOAD AWAY.','THESE WARDENS LEARN FROM YOUR DATA.'],art(t){
    for(let i=0;i<60;i++){const x=180+hash(i)*140,y=hash(i*7)*120;R(x,y,1,1,hash(i+Math.floor(t*3))>.2?'#d9dfeb':'#4a5060');}
    for(let i=0;i<10;i++){const bh=20+hash(i*5)*40,x=180+i*14;R(x,170-bh,12,bh,'#0c0f1a');}
    R(250,40,4,110,'#4a5262');for(let y=50;y<150;y+=12){line(242,y,262,y+12,'#3a4150');line(262,y,242,y+12,'#3a4150');}
    if(Math.floor(t*1.5)%2){R(249,36,6,5,'#ff3b4a');A(244,31,16,15,'#ff3b4a',.3);}
    A(300,0,10,150,'#3fd0c9',.15+.08*Math.sin(t*4));R(296,150,18,10,'#3a4150');}},
};
const cardText=(s)=>String(s).toUpperCase().replace(/·/g,'-').replace(/[^A-Z0-9 .:\-_/>!?%#\[\]=,*+()']/g,'');
// Split text into lines no wider than maxW pixels (3x5 font).
function wrapLines(text,maxW){const out=[];let cur='';for(const w of text.split(' ')){const next=cur?`${cur} ${w}`:w;if(tw(next)>maxW&&cur){out.push(cur);cur=w;}else cur=next;}if(cur)out.push(cur);return out;}
function cardScene(lv){
  const c=CARD[lv.style]??CARD.basement;
  return {shots:[{name:'Level card',note:`Level ${lv.id}: ${lv.name}`,dur:5.4,fi:.35,fo:.45,nobars:true,music:()=>null,
    ev:[[.15,'boot'],[1.2,'cardchime']],lines:[],draw(t){
      R(0,0,W,H,c.bg);c.art(t);
      for(let x=0;x<200;x+=2)A(x,0,2,H,'#000000',.7*(1-x/200));
      const k=ease(seg(t,.15,.9));
      ctx.globalAlpha=seg(t,.15,.6);txt(`LEVEL ${lv.id} OF ${lv.of}`,lerp(-60,16,k),34,'#8891a6');ctx.globalAlpha=1;
      const name=cardText(lv.name),sc=tw(name,3)<=176?3:2;
      txtO(typed(name,t,.5,16),16,46,c.accent,sc,'#000000');
      R(16,48+5*sc+4,Math.round(lerp(0,160,ease(seg(t,1,1.7)))),2,c.accent);
      const y0=48+5*sc+14;
      ctx.globalAlpha=seg(t,1.3,1.9);c.tag.forEach((l,i)=>txt(l,16,y0+i*9,'#d9dfeb'));
      const y1=y0+c.tag.length*9+8; // below however many story lines the card has
      ctx.globalAlpha=seg(t,2.1,2.7);txt('NEW IDEA',16,y1,c.accent);txt(cardText(lv.concept),16,y1+9,'#ffffff');
      ctx.globalAlpha=seg(t,2.7,3.3);wrapLines(cardText(lv.enemies),176).forEach((l,i)=>txt(l,16,y1+25+i*9,'#8891a6'));
      ctx.globalAlpha=1;
      if(t>3.4&&Math.floor(t*2)%2)txt('PRESS ANY KEY',16,166,'#5d6578');
    }}],
    label:`Level ${lv.id}: ${lv.name}`,canvasLabel:`Title card: Level ${lv.id}, ${lv.name}. ${lv.concept}.`,start:'Continue',skip:'Skip ›',poster:3.6};
}

/* ---------- the scenes ---------- */
const SCENES={
  afterHours:{shots:SHOTS,label:'Opening cutscene',canvasLabel:'Pixel-art cutscene: an employee finds Clearpath\'s secret Warden lab',start:'Start the story',skip:'Skip intro ›',poster:2.9},
  finale:{shots:FINALE_SHOTS,label:'Final cutscene: Broadcast',canvasLabel:'Pixel-art cutscene: Sam uploads the evidence, escapes the roof with help from Pip, Clearpath is shut down, Dr. Voss is arrested, and Sam tells his story on a live talk show',start:'Watch the ending',skip:'Skip ›',poster:5.5},
  decision:{shots:DECISION_SHOTS,label:'Cutscene: the choice before the Uplink',canvasLabel:'Pixel-art cutscene: Sam has the evidence and must choose between escaping to the street or climbing to the roof uplink',start:'Continue the story',skip:'Skip ›',poster:3.8},
  core:{shots:CORE_SHOTS,label:'Cutscene: Dr. Voss feeds the Wardens more data',canvasLabel:'Pixel-art cutscene: a security camera watches Sam climb out of a vent into the Core, while Dr. Voss feeds the Wardens his personal data and their prediction confidence rises',start:'Continue the story',skip:'Skip ›',poster:5.6},
};

/* ---------- audio ---------- */
let AC=null,master=null,musicBus=null,sfxBus=null,scoreBus=null,bus=null,rev=null,echoIn=null,NB=null,soundOn=true,unfollow=[];
const TRIM={music:9,effects:4.5}; // levels against the rest of the game (see sound-settings.js)
const SCORE=.36; // the orchestral score's level within the music (measured against the level music: a little louder at its peaks)
const mf=m=>440*Math.pow(2,(m-69)/12);
function impulseResponse(sec,decay){const n=Math.floor(AC.sampleRate*sec),b=AC.createBuffer(2,n,AC.sampleRate);for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,decay);}return b;}
function ensureAudio(){try{if(!AC){AC=new(window.AudioContext||window.webkitAudioContext)();
  // A soft clipper as a safety net for the biggest hits: tanh leaves normal levels alone (no makeup gain).
  const pre=AC.createGain();pre.gain.value=.5;const clip=AC.createWaveShaper(),cv=new Float32Array(1024);for(let i=0;i<1024;i++)cv[i]=Math.tanh((i/511.5-1)*2);clip.curve=cv;
  master=AC.createGain();master.gain.value=.4;master.connect(pre).connect(clip).connect(AC.destination);
  // Music and effects on their own buses, so the player's music and effects volumes apply.
  musicBus=AC.createGain();musicBus.connect(master);sfxBus=AC.createGain();sfxBus.connect(master);bus=sfxBus;
  scoreBus=AC.createGain();scoreBus.gain.value=SCORE;scoreBus.connect(musicBus);
  // A hall reverb and a dark echo for the score (the orchestra needs a room).
  rev=AC.createConvolver();rev.buffer=impulseResponse(3,2.4);const rv=AC.createGain();rv.gain.value=.5;rev.connect(rv).connect(scoreBus);
  echoIn=AC.createDelay(2);echoIn.delayTime.value=.375;const fb=AC.createGain();fb.gain.value=.42;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2200;
  echoIn.connect(lp).connect(fb).connect(echoIn);const eo=AC.createGain();eo.gain.value=.5;lp.connect(eo).connect(scoreBus);eo.connect(rev);
  unfollow=[followVolume(AC,musicBus,'music',TRIM.music),followVolume(AC,sfxBus,'effects',TRIM.effects)];}if(AC.state==='suspended')AC.resume();}catch(e){AC=null;}}
function tone(f,d,type,v,slide=0,delay=0){if(!AC||!soundOn)return;const t=AC.currentTime+delay,o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.setValueAtTime(f,t);
  if(slide)o.frequency.linearRampToValueAtTime(Math.max(20,f+slide),t+d);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g).connect(bus);o.start(t);o.stop(t+d+.03);}
function noise(d,v,ff,ft='lowpass',delay=0){if(!AC||!soundOn)return;if(!NB){NB=AC.createBuffer(1,AC.sampleRate,AC.sampleRate);const a=NB.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;}
  const t=AC.currentTime+delay,s=AC.createBufferSource(),fl=AC.createBiquadFilter(),g=AC.createGain();s.buffer=NB;fl.type=ft;fl.frequency.value=ff;
  g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+Math.min(d,.95));s.connect(fl).connect(g).connect(bus);s.start(t,Math.random()*.02);s.stop(t+Math.min(d,.95)+.03);}
// A studio audience, modelled on the team's reference recording: a dense wash of hundreds of hands (most
// of the energy between 400 Hz and 4 kHz, nothing deep, little above 8 kHz) that swells in over half a
// second and holds, with cheering on top: falsetto "woo"s around 600-1000 Hz that slide up and fall away,
// and the odd whistle. The clapping is rendered once into a looping buffer (each clap a few milliseconds of
// band-limited noise), so it costs almost nothing to play.
let CLAPS=null;
function clapBuffer(){
  if(CLAPS)return CLAPS;const sr=AC.sampleRate,n=Math.floor(sr*3),b=AC.createBuffer(2,n,sr);
  for(let c=0;c<2;c++){const d=b.getChannelData(c);
    for(let k=0;k<1100;k++){const len=Math.floor(sr*(.006+Math.random()*.01)),at=Math.floor(Math.random()*(n-len)),amp=.3+Math.random()*.5,f=.035+Math.random()*.11;
      let lp=0,prev=0;for(let i=0;i<len;i++){lp+=f*((Math.random()*2-1)-lp);const v=lp-prev;prev=lp;d[at+i]+=v*amp*Math.exp(-i/(len*.3))*Math.min(1,i/8);}}}
  return CLAPS=b;}
function crowdCheer(dur,cheers){
  if(!AC||!soundOn)return;const t=AC.currentTime;
  const src=AC.createBufferSource();src.buffer=clapBuffer();src.loop=true;
  const hp=AC.createBiquadFilter();hp.type='highpass';hp.frequency.value=300;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2400;const lp2=AC.createBiquadFilter();lp2.type='lowpass';lp2.frequency.value=4200;
  const pk=AC.createBiquadFilter();pk.type='peaking';pk.frequency.value=1100;pk.Q.value=.7;pk.gain.value=6;
  const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(3,t+.5);g.gain.setValueAtTime(3,t+dur-1.1);g.gain.linearRampToValueAtTime(0,t+dur);
  src.connect(hp).connect(lp).connect(lp2).connect(pk).connect(g).connect(bus);src.start(t,Math.random()*2);src.stop(t+dur+.05);
  for(let i=0;i<cheers;i++){const at=t+.2+Math.random()*Math.max(.3,dur-1.6);
    if(Math.random()<.22){ // a whistle
      const o=AC.createOscillator(),wg=AC.createGain(),f=2300+Math.random()*700;o.type='sine';o.frequency.setValueAtTime(f,at);o.frequency.linearRampToValueAtTime(f*1.25,at+.15);o.frequency.linearRampToValueAtTime(f*1.18,at+.5);o.frequency.linearRampToValueAtTime(f*.9,at+.7);
      wg.gain.setValueAtTime(0,at);wg.gain.linearRampToValueAtTime(.035,at+.05);wg.gain.setValueAtTime(.035,at+.55);wg.gain.linearRampToValueAtTime(0,at+.72);o.connect(wg).connect(bus);o.start(at);o.stop(at+.75);continue;}
    // a "woo": a falsetto voice that rises, wavers and falls off
    const f=560+Math.random()*420,len=.7+Math.random()*.9,o=AC.createOscillator(),vib=AC.createOscillator(),vd=AC.createGain();
    o.type='sawtooth';o.frequency.setValueAtTime(f*.8,at);o.frequency.linearRampToValueAtTime(f*1.08,at+len*.3);o.frequency.linearRampToValueAtTime(f,at+len*.7);o.frequency.linearRampToValueAtTime(f*.72,at+len);
    vib.frequency.value=5+Math.random()*2;vd.gain.value=f*.012;vib.connect(vd).connect(o.frequency);
    const v1=AC.createBiquadFilter();v1.type='lowpass';v1.frequency.value=f*2.2;v1.Q.value=1.5;const v2=AC.createBiquadFilter();v2.type='bandpass';v2.frequency.value=f*1.05;v2.Q.value=1.2;
    const vg=AC.createGain(),pk2=.04+Math.random()*.028;vg.gain.setValueAtTime(0,at);vg.gain.linearRampToValueAtTime(pk2,at+.08);vg.gain.setValueAtTime(pk2,at+len*.6);vg.gain.linearRampToValueAtTime(0,at+len);
    o.connect(v1).connect(v2).connect(vg).connect(bus);vib.start(at);o.start(at);vib.stop(at+len+.05);o.stop(at+len+.05);}
}
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
  tick:()=>noise(.015,.06,5200,'highpass'),tock:()=>noise(.015,.04,3200,'highpass'),
  lock:()=>{tone(150,.35,'square',.06,-30);noise(.1,.15,1200,'bandpass');},
  rewind:()=>{tone(1800,.9,'sawtooth',.03,-1500);noise(.9,.05,3000,'bandpass');},
  wind:()=>noise(.95,.06,500,'bandpass'),
  boom:()=>{tone(70,1.2,'sine',.35,-40);noise(.5,.25,300);},
  motor:()=>{tone(55,.9,'sawtooth',.035,8);noise(.9,.03,260);},
  siren:()=>{tone(640,.55,'sine',.045,300);tone(940,.55,'sine',.045,-300,.55);tone(640,.55,'sine',.045,300,1.1);},
  flash:()=>{noise(.05,.14,4000,'highpass');tone(3200,.25,'sine',.02,-1800,.03);},
  powerdown:()=>{tone(420,.8,'sawtooth',.04,-360);tone(210,.9,'square',.025,-170);},
  applause:()=>crowdCheer(2.8,2),applauseLong:()=>crowdCheer(4.8,5),
  fanfare:()=>{for(const[d,ch]of[[0,[55,59,62,67]],[.28,[55,59,62,67]],[.56,[57,60,64,69]],[.84,[59,62,67,71]]])for(const n of ch)tone(mf(n),d<.8?.24:1.2,'sawtooth',.022,0,d);},
  cardchime:()=>{[69,76,81].forEach((n,i)=>tone(mf(n),1.4,'triangle',.05,0,i*.09));tone(mf(88),1.8,'sine',.025,0,.3);},
};

// ---------- The score's instruments (all synthesized) ----------
// Each takes a delay in seconds, so a theme can place notes between its steps. They play into the
// music bus, with optional sends to the hall reverb and the echo.
function out(node,{verb=.3,dub=0}={}){node.connect(bus===musicBus?scoreBus:bus);if(verb){const g=AC.createGain();g.gain.value=verb;node.connect(g).connect(rev);}if(dub){const g=AC.createGain();g.gain.value=dub;node.connect(g).connect(echoIn);}}
function envG(t,a,v,hold,rel){const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.setValueAtTime(v,t+a+hold);g.gain.linearRampToValueAtTime(0,t+a+hold+rel);return g;}
function osc(type,f,t,end,det=0){const o=AC.createOscillator();o.type=type;o.frequency.value=f;o.detune.value=det;o.start(t);o.stop(end);return o;}
const INS={
  // Staccato strings: three detuned saws, bright attack, short. The ostinato.
  stac(n,v,dl=0){if(!AC||!soundOn)return;const t=AC.currentTime+dl,f=mf(n),lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(3200,t);lp.frequency.exponentialRampToValueAtTime(900,t+.14);
    const g=envG(t,.006,v,.04,.12);for(const d of[-9,0,9])osc('sawtooth',f,t,t+.3,d).connect(lp);lp.connect(g);out(g,{verb:.35});},
  // Sustained strings / brass-like section: slow attack, gentle vibrato.
  str(n,dur,v,dl=0,{attack=.25,bright=1800}={}){if(!AC||!soundOn)return;const t=AC.currentTime+dl,f=mf(n),lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=bright;
    const vib=AC.createOscillator();vib.frequency.value=5.2;const vd=AC.createGain();vd.gain.value=9;vib.connect(vd);vib.start(t);vib.stop(t+dur+1);
    const g=envG(t,attack,v,Math.max(0,dur-attack),.6);for(const d of[-7,7]){const o=osc('sawtooth',f,t,t+dur+1,d);vd.connect(o.detune);o.connect(lp);}lp.connect(g);out(g,{verb:.5});},
  // Choir "aah": saws through vowel formants, slow swell.
  choir(notes,dur,v,dl=0,vowel='a'){if(!AC||!soundOn)return;const t=AC.currentTime+dl,F=vowel==='o'?[[450,1],[800,.6],[2830,.15]]:[[730,1],[1090,.55],[2440,.2]];
    const sum=AC.createGain();for(const n of notes)for(const d of[-12,0,12]){const o=osc('sawtooth',mf(n),t,t+dur+1.5,d);const lv=AC.createGain();lv.gain.value=.33;o.connect(lv).connect(sum);}
    const g=envG(t,Math.min(.8,dur*.4),v,Math.max(0,dur*.6),.9);for(const[fq,a]of F){const bp=AC.createBiquadFilter();bp.type='bandpass';bp.frequency.value=fq;bp.Q.value=6;const ag=AC.createGain();ag.gain.value=a*2.2;sum.connect(bp).connect(ag).connect(g);}
    out(g,{verb:.7});},
  // Timpani: a pitched thud with a falling skin and a short noise attack.
  timp(n,v,dl=0){if(!AC||!soundOn)return;const t=AC.currentTime+dl,f=mf(n),o=osc('sine',f*1.5,t,t+1.4);o.frequency.exponentialRampToValueAtTime(f,t+.06);
    const g=AC.createGain();g.gain.setValueAtTime(v*.6,t);g.gain.exponentialRampToValueAtTime(.0005,t+.7);o.connect(g);out(g,{verb:.45});
    const s=AC.createBufferSource();if(!NB)noise(.01,0,100);s.buffer=NB;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1400;const ng=AC.createGain();ng.gain.setValueAtTime(v*.9,t);ng.gain.exponentialRampToValueAtTime(.0005,t+.12);s.connect(lp).connect(ng);s.start(t);s.stop(t+.2);out(ng,{verb:.3});},
  // A huge low impact (for big reveals).
  boom(v,dl=0){if(!AC||!soundOn)return;const t=AC.currentTime+dl,o=osc('sine',90,t,t+2.6);o.frequency.exponentialRampToValueAtTime(32,t+.5);const g=AC.createGain();g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0005,t+2.4);o.connect(g);out(g,{verb:.6});},
  // Distorted power chord (root, fifth, octave): the "rock" hits.
  power(root,dur,v,dl=0){if(!AC||!soundOn)return;const t=AC.currentTime+dl,ws=AC.createWaveShaper(),cv=new Float32Array(512);for(let i=0;i<512;i++){const x=i/256-1;cv[i]=Math.tanh(x*6);}ws.curve=cv;
    const pre=AC.createGain();pre.gain.value=.6;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2400;const g=envG(t,.005,v,dur*.6,dur*.4);
    for(const[k,d]of[[0,-6],[7,6],[12,0]])osc('sawtooth',mf(root+k),t,t+dur+.2,d).connect(pre);pre.connect(ws).connect(lp).connect(g);out(g,{verb:.25});},
  // Low drone: detuned saws under a slowly breathing filter, plus a sub.
  drone(n,dur,v,dl=0){if(!AC||!soundOn)return;const t=AC.currentTime+dl,lp=AC.createBiquadFilter();lp.type='lowpass';lp.Q.value=4;lp.frequency.setValueAtTime(260,t);lp.frequency.linearRampToValueAtTime(700,t+dur*.5);lp.frequency.linearRampToValueAtTime(300,t+dur);
    const g=envG(t,dur*.3,v,dur*.4,dur*.3+.5);for(const d of[-14,14])osc('sawtooth',mf(n),t,t+dur+1,d).connect(lp);lp.connect(g);out(g,{verb:.3});},
  // A high, dissonant string cluster swelling out of nothing.
  cluster(notes,dur,v,dl=0){if(!AC||!soundOn)return;const t=AC.currentTime+dl;for(const n of notes){const g=envG(t,dur*.6,v,dur*.1,dur*.3+.6);const o=osc('triangle',mf(n),t,t+dur+1);const o2=osc('sine',mf(n),t,t+dur+1,8);o.connect(g);o2.connect(g);out(g,{verb:.8,dub:.2});}},
  // Music-box bell: a bright FM ping, into the echo.
  bell(n,v,dl=0){if(!AC||!soundOn)return;const t=AC.currentTime+dl,f=mf(n),c=osc('sine',f,t,t+2.5),m=osc('sine',f*3.5,t,t+2.5),d=AC.createGain();d.gain.setValueAtTime(f*1.8,t);d.gain.exponentialRampToValueAtTime(f*.05,t+1.2);m.connect(d).connect(c.frequency);
    const g=AC.createGain();g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0005,t+2.2);c.connect(g);out(g,{verb:.6,dub:.45});},
  // A creak / metal scrape: noise through a narrow sweeping bandpass.
  creak(v,dl=0){if(!AC||!soundOn)return;if(!NB)noise(.01,0,100);const t=AC.currentTime+dl,s=AC.createBufferSource();s.buffer=NB;s.loop=true;const bp=AC.createBiquadFilter();bp.type='bandpass';bp.Q.value=18;
    const f0=200+Math.random()*500;bp.frequency.setValueAtTime(f0,t);bp.frequency.exponentialRampToValueAtTime(f0*(1.6+Math.random()),t+.9);const g=envG(t,.2,v,.4,.5);s.connect(bp).connect(g);s.start(t);s.stop(t+1.3);out(g,{verb:.6,dub:.3});},
  // Electric piano (Rhodes-like): a sine with a soft bell attack and a gentle tremolo.
  keys(notes,dur,v,dl=0){if(!AC||!soundOn)return;const t=AC.currentTime+dl;for(const n of notes){const f=mf(n),c=osc('sine',f,t,t+dur+1.5),m=osc('sine',f,t,t+dur+1.5),d=AC.createGain();
    d.gain.setValueAtTime(f*1.2,t);d.gain.exponentialRampToValueAtTime(f*.08,t+.5);m.connect(d).connect(c.frequency);
    const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);g.gain.exponentialRampToValueAtTime(v*.35,t+.6);g.gain.exponentialRampToValueAtTime(.0005,t+dur+1.2);c.connect(g);out(g,{verb:.35,dub:.1});}},
  heart(v,dl=0,n=43){INS.timp(n,v,dl);INS.timp(n,v*.6,dl+.2);},
};

// ---------- The cutscene score ----------
// Both themes run at 152 BPM in eighth notes (one step = one eighth; 16 steps = a two-bar block), so a
// theme can hand over to the next without a seam. Everything is original and synthesized.
//
// "Precipice" (the discovery, before Level 1): E minor, rocking between Em and Am in two-bar blocks with
// C, D and B for lift. It starts as low pulsing chords as the lift drops (pre1), the string ostinato and
// a choir come in at the screen (pre2), Dr. Voss's turn lands on a boom and a soaring high string line
// over full choir (pre3), and the override is everything at once: sixteenth-note strings, timpani in
// eighths and distorted power-chord hits (pre4).
// "Creeping" (Dr. Voss feeds the Wardens, before Level 3): G minor, the bass swinging G to E-flat, a
// relentless low ostinato that creeps a semitone up and back, a music-box line on a tritone, high
// strings sliding into clusters, creaks, a heartbeat, and a G major chord where it should be minor so
// the floor never feels steady. It stays loud and never lets up; the stages only add layers.
const BPM=152,R8=BPM/30,SL=1/R8; // eighth notes per second; seconds per eighth
function chordThird(root,chord){for(const n of chord){const iv=(((n-root)%12)+12)%12;if(iv===3||iv===4)return iv;}return 3;}
const PRE_CH=[[40,[64,67,71]],[45,[64,69,72]],[40,[64,67,71]],[45,[64,69,72]],[36,[64,67,72]],[38,[66,69,74]],[40,[64,67,71]],[35,[63,66,71]]]; // Em Am Em Am C D Em B
const PRE_PAT=[0,1,2,1,0,1,3,1,0,1,2,1,0,2,3,2];
const PRE_MEL=[[[0,76,6],[6,74,2],[8,71,8]],[[0,72,6],[6,74,2],[8,76,8]],[[0,79,8],[8,78,4],[12,76,4]],[[0,81,12],[12,79,4]],
               [[0,79,6],[6,76,2],[8,84,8]],[[0,86,8],[8,83,4],[12,81,4]],[[0,83,16]],[[0,78,8],[8,75,8]]];
function pre(stage){return{rate:R8,global:true,play(i,fresh){
  const st=i%16,blk=Math.floor(i/16)%8,[root,ch]=PRE_CH[blk],head=st===0||fresh,rest=(16-st)*SL;
  const tones=[root+12,root+19,root+24,root+24+chordThird(root,ch)];
  if(head){INS.drone(root,rest+.1,stage>=3?.032:.028);INS.choir(ch,rest,stage===1?.03:stage===2?.05:.07,0,stage>=3?'a':'o');}
  // Pulsing low chords on every beat: the whole of stage 1, under everything after.
  if(st%2===0)for(const n of ch)INS.stac(n-12,stage===1?.03:.022);
  if(stage>=2)INS.stac(tones[PRE_PAT[st]],stage===2?.04:.05);
  if(stage>=4)INS.stac(tones[PRE_PAT[(st+1)%16]],.035,SL/2);
  if(st===0||(stage>=2&&st===8))INS.timp(root,stage===1?.14:.2);
  if(stage===1&&blk%2===1&&st===8)INS.cluster([ch[2]+12],1.6,.012);
  if(stage>=3){if(head&&blk%2===0)INS.boom(.34);
    for(const[s0,n,len]of PRE_MEL[blk])if(st===s0)INS.str(n,len*SL,.06,0,{attack:.08,bright:3600});}
  if(stage>=4){if([0,3,6,10,12].includes(st))INS.power(root+12,st===12?.5:.24,.045);
    if(st%2===1)INS.timp(root+7,.09);
    for(const[s0,n,len]of PRE_MEL[blk])if(st===s0)INS.str(n-12,len*SL,.04,0,{attack:.08,bright:2600});}
}};}
const CREEP_CH=[[31,[62,67,70]],[31,[62,67,70]],[27,[63,67,70]],[27,[63,67,70]],[31,[62,67,70]],[34,[62,65,70]],[27,[63,67,70]],[31,[62,67,71]]]; // Gm Gm Eb Eb Gm Bb Eb G(major!)
const CREEP_OST=[0,0,1,0,0,0,1,0,0,0,1,0,3,1,0,-1];
const CREEP_BELL=[[0,86],[3,80],[6,85],[10,79]];
function creep(stage){return{rate:R8,global:true,play(i,fresh){
  const st=i%16,blk=Math.floor(i/16)%8,[root,ch]=CREEP_CH[blk],head=st===0||fresh,rest=(16-st)*SL;
  if(head){INS.drone(root+12,rest+.1,.032);INS.choir(ch.map(n=>n-12),rest,stage===1?.035:stage===2?.05:.065,0,stage===3?'a':'o');}
  // The creeping low ostinato: G G A-flat G ... then B-flat A-flat G F-sharp, under every stage.
  INS.stac(55+CREEP_OST[st]+(root===27?-4:root===34?3:0),stage===1?.045:.052);
  if(st%4===2)INS.stac(67+CREEP_OST[(st+4)%16],.026);
  if(stage>=2){INS.stac(ch[2]+12,.012);INS.stac(ch[2]+12,.01,SL/2);} // high tremolo strings
  if(blk%2===0){const b=CREEP_BELL.find(([s0])=>s0===st);if(b)INS.bell(b[1]-(blk===4?1:0),.034);}
  if(head&&blk%2===1)INS.cluster(blk===7?[ch[2]+12,ch[2]+13]:[ch[1]+12,ch[1]+13],rest,stage===1?.014:.02);
  if(Math.random()<(stage===1?.06:.1))INS.creak(.06,Math.random()*SL);
  const beat=stage===3?2:4;if(st%beat===0)INS.heart(stage===1?.09:.11);
  if(stage===3){if(head&&blk%2===0)INS.boom(.3);if(st===0||st===6||st===8||st===14)INS.timp(root+12,.18);
    if(head)INS.str(root+12,rest,.05,0,{attack:.04,bright:1600});}
}};}
// The decision (before Level 5), in the Precipice key: a clock on every beat over a suspended chord and a
// heartbeat ("decide"), and the climb to the roof as an anthem on the Wardens' E-D-C-A-B motif ("rise").
const RISE_CH=[[40,[64,67,71]],[36,[64,67,72]],[43,[67,71,74]],[38,[66,69,74]]]; // Em C G D
const RISE_MEL=[[[0,76,4],[4,74,4],[8,72,4],[12,69,2],[14,71,2]],[[0,72,8],[8,79,8]],[[0,79,8],[8,74,8]],[[0,78,4],[4,79,4],[8,81,8]]];
function rise(stage){return{rate:R8,global:true,play(i,fresh){const st=i%16,blk=Math.floor(i/16)%4,[root,ch]=RISE_CH[blk],head=st===0||fresh,rest=(16-st)*SL;
  if(head){INS.drone(root,rest+.1,.028);INS.choir(ch,rest,stage===2?.065:.05,0,'a');}
  INS.stac([root+12,root+19,root+24,root+19][st%4],.04);
  for(const[s0,n,len]of RISE_MEL[blk])if(st===s0)INS.str(n+(stage===2?12:0),len*SL,.06,0,{attack:.05,bright:3600});
  if(stage===2)for(const[s0,n,len]of RISE_MEL[blk])if(st===s0)INS.str(n,len*SL,.04,0,{attack:.05,bright:2600});
  if(st===0||st===8)INS.timp(root,.2);if(stage===2&&st%4===2)INS.timp(root+7,.1);
  if(stage===2&&head&&blk===0)INS.boom(.3);}};}
// The ending. "Triumph": the Wardens' five-note motif (in G major: D-C-B-G-A) as a full orchestral anthem
// over G, D, Em, C, for the upload, the escape to the street and the news montage. "Talk": a warm,
// laid-back electric-piano groove for the talk show (Fmaj7, Em7, Dm7, G7 with brushed hi-hats).
const TRI_CH=[[43,[67,71,74]],[38,[66,69,74]],[40,[67,71,76]],[36,[67,72,76]]];
const TRI_MEL=[[[0,74,4],[4,72,4],[8,71,4],[12,67,2],[14,69,2]],[[0,71,8],[8,74,8]],[[0,79,8],[8,78,4],[12,76,4]],[[0,76,4],[4,74,4],[8,72,4],[12,74,4]]];
const triumph={rate:R8,global:true,play(i,fresh){const st=i%16,blk=Math.floor(i/16)%4,[root,ch]=TRI_CH[blk],head=st===0||fresh,rest=(16-st)*SL;
  if(head){INS.drone(root,rest+.1,.025);INS.choir(ch,rest,.055,0,'a');if(blk===0)INS.boom(.2);}
  INS.stac([root+12,root+19,root+24,root+19][st%4],.036);if(st%2===0)for(const n of ch)INS.stac(n-12,.015);
  for(const[s0,n,len]of TRI_MEL[blk])if(st===s0){INS.str(n+12,len*SL,.05,0,{attack:.05,bright:3800});INS.str(n,len*SL,.034,0,{attack:.05,bright:2600});}
  if(st===0||st===8)INS.timp(root,.16);if(st%4===2)INS.timp(root+7,.07);
  if(st===12&&blk===3)INS.cluster([ch[2]+12],1.2,.012);}};
const TALK_CH=[[41,[57,60,64,67]],[40,[55,59,62,67]],[38,[53,57,60,64]],[43,[53,57,59,64]]]; // Fmaj7 Em7 Dm7 G13
const talk={rate:4,global:true,play(i,fresh){const st=i%8,blk=Math.floor(i/8)%4,[root,ch]=TALK_CH[blk];
  if(st===0||fresh)INS.keys(ch,1.6,.05);if(st===3)INS.keys([ch[3]+12],.4,.035);if(st===5&&blk%2)INS.keys(ch.slice(1),.8,.03);
  if(st===0)tone(mf(root),.9,'sine',.025);if(st===4)tone(mf(root+7),.6,'sine',.018);if(st===6&&blk===3)tone(mf(root+5),.4,'sine',.015);
  noise(.03,st%2?.012:.02,7000,'highpass');if(st===2||st===6)noise(.12,.03,2600,'bandpass');}};
const MUS={
  office:{rate:4,play(i){tone(mf([57,64,60,67,64,60,62,59][i%8]+12),.22,'triangle',.04);if(i%8===0)tone(mf(45),.6,'triangle',.05);}},
  muzak:{rate:3,play(i){tone(mf([72,76,79,83,81,79,76,74][i%8]),.3,'sine',.035);if(i%4===0)tone(mf(48+[0,5,7,5][(i/4|0)%4]),.6,'sine',.05);}},
  pre1:pre(1),pre2:pre(2),pre3:pre(3),pre4:pre(4),
  creep1:creep(1),creep2:creep(2),creep3:creep(3),
  decide:{rate:R8,global:true,play(i,fresh){const st=i%16,blk=Math.floor(i/16)%2,head=st===0||fresh,rest=(16-st)*SL;
    if(st%2===0)SFX[st%4?'tock':'tick']();
    if(head){INS.drone(40,rest+.1,.032);for(const n of blk?[48,55,59,62]:[52,57,59,64])INS.str(n,rest,.024,0,{attack:.9,bright:1400});}
    if(st%4===0)INS.heart(.1,0,40);if(blk===1&&st===8)INS.cluster([83,84],1.4,.014);}},
  rise1:rise(1),rise2:rise(2),triumph,talk,
  flee:pre(4),trap:creep(3),
};
let lastKey='';
function fireEvents(a,b){if(b-a>.5)return;SH.forEach(s=>{if(s.start>b||s.start+s.dur<a)return;for(const[at,n]of s.ev){const g=s.start+at;if(g>a&&g<=b&&SFX[n])SFX[n]();}});}
// The score's themes ("global") keep their place across shot changes, so a theme flows from shot to
// shot; the older ambient themes restart with each shot. T is the cutscene's clock (it keeps running
// while a choice is on screen, so the music does too).
let lastTheme='';
function music(i,lt,T=lt){const s=SH[i],m=s.music&&s.music(lt);if(!m||!MUS[m]){lastTheme='';return;}const g=MUS[m].global,idx=Math.floor((g?T:lt)*MUS[m].rate),k=(g?'':i)+m+idx;
  if(k!==lastKey){lastKey=k;const fresh=m!==lastTheme;lastTheme=m;bus=musicBus;MUS[m].play(idx,fresh);bus=sfxBus;}}

function closeAudio() {
  unfollow.forEach((stop) => stop()); unfollow = [];
  if (!AC) return;
  const ac = AC;
  try { master.gain.setTargetAtTime(0.0001, ac.currentTime, 0.08); } catch {}
  setTimeout(() => { try { ac.close(); } catch {} }, 500);
  AC = null; master = musicBus = sfxBus = scoreBus = bus = rev = echoIn = null; NB = null; CLAPS = null;
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
 *   scene: "afterHours" (default, before Level 1), "core" (before Level 3), or "card": a level's title card,
 *   with level = { id, of, name, concept, enemies, style } (see playLevelCard).
 */
export function playCutscene({ autoStart = false, scene = "afterHours", level = null, at = 0 } = {}) {
  if (active) return Promise.resolve([]);
  const sc = scene === "card" && level ? cardScene(level) : SCENES[scene] ?? SCENES.afterHours;
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
        <div class="cs-choice" role="group" aria-label="Make a choice" hidden><p class="cs-prompt"></p><div class="cs-opts"></div><p class="cs-keys">Click a choice or press its number</p></div>
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

    let T = Math.max(0, Math.min(Number(at) || 0, TOTAL - 0.5)), playing = false, started = false, last = null, raf = 0, dlgKey = "", curShot = -1;
    // The music's clock: it keeps running while a choice waits on screen (T stops), so the score does too.
    let MT = T;
    // Choices: the shot waiting for an answer, the shots already answered, and what was picked (resolved
    // at the end so the game can log it).
    let choosing = -1;
    const answered = new Set(), picks = [];
    const choiceEl = q(".cs-choice"), promptEl = q(".cs-prompt"), optsEl = q(".cs-opts");
    lastKey = ""; lastTheme = ""; CHOICE_T = 0;
    // Mute follows the game-wide switch; the Sound button shows it.
    const showSound = () => { soundOn = sound.on; const b = q(".cs-sound"); if (b) { b.textContent = soundOn ? "Sound on" : "Sound off"; b.setAttribute("aria-pressed", String(soundOn)); } };
    const unsubSound = sound.subscribe(showSound);
    showSound();
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
      if (started && !playing && choosing < 0) { A(0, 0, W, H, "#000000", 0.45); txtC("PAUSED", 160, 86, "#d9dfeb", 2); }
      if (choosing >= 0) A(0, 0, W, H, "#000000", Math.min(0.5, CHOICE_T * 1.5));
      const ln = started && choosing < 0 ? s.lines.find((l) => lt >= l[0] && lt < l[1]) : null;
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

    function openChoice(i) {
      choosing = i; CHOICE_T = 0;
      const c = SH[i].choice;
      promptEl.textContent = c.prompt;
      optsEl.innerHTML = "";
      c.options.forEach((o, k) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "cs-opt"; b.dataset.key = o.key;
        b.innerHTML = `<span class="cs-num">${k + 1}</span><span class="cs-lab"></span><small></small>`;
        b.querySelector(".cs-lab").textContent = o.label; b.querySelector("small").textContent = o.sub ?? "";
        b.addEventListener("click", () => choose(k));
        optsEl.appendChild(b);
      });
      choiceEl.hidden = false; dlg.hidden = true; dlgKey = "";
      setTimeout(() => optsEl.firstElementChild?.focus(), 0);
    }
    function choose(k) {
      if (choosing < 0) return;
      const i = choosing, o = SH[i].choice.options[k];
      if (!o) return;
      choosing = -1; answered.add(i); picks.push(o.key);
      // The rest of the scene is whatever this answer leads to.
      SH = SH.slice(0, i + 1).concat((o.then?.() ?? []).map((s) => ({ ...s })));
      TOTAL = timeline(SH);
      T = SH[i].start + SH[i].dur;
      choiceEl.hidden = true; document.activeElement?.blur?.();
      if (T >= TOTAL) finish();
    }

    function finish() {
      if (!active) return;
      active = false;
      unsubSound();
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
      closeAudio();
      root.classList.add("cs-out");
      setTimeout(() => root.remove(), 350);
      resolve(picks);
    }

    // Capture phase on window runs before the game's own keydown listener, so stopping the event here
    // means no key reaches the maze while the cutscene is up.
    function onKey(e) {
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); finish(); return; }
      if (!started) { e.preventDefault(); begin(); return; }
      if (choosing >= 0) {
        const n = Number(e.key);
        if (n >= 1 && n <= SH[choosing].choice.options.length) { e.preventDefault(); choose(n - 1); }
        else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
          e.preventDefault();
          const bs = [...optsEl.children], at = bs.indexOf(document.activeElement), d = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
          bs[(at + d + bs.length) % bs.length]?.focus();
        }
        return; // Enter and Space press the focused option (the button's own default action)
      }
      if (scene === "card") { e.preventDefault(); if (T > 0.5 && !e.repeat) finish(); return; } // any key moves on (not the key that opened it)
      if (e.key === " ") { e.preventDefault(); playing = !playing; last = null; }
      else if (e.key === "Enter" && T >= TOTAL - SH[SH.length - 1].dur) { e.preventDefault(); finish(); }
    }
    window.addEventListener("keydown", onKey, true);

    startBtn.addEventListener("click", begin);
    if (scene === "card") q("canvas").addEventListener("click", () => { if (T > 0.5) finish(); });
    q(".cs-skip").addEventListener("click", finish);
    q(".cs-sound").addEventListener("click", (e) => {
      sound.toggleMute(); // the same mute as the sound panel in the corner
      if (sound.on) ensureAudio();
    });
    if (autoStart) begin(); else startBtn.focus();

    function frame(nowMs) {
      if (!active) return;
      if (playing) {
        const dt = last == null ? 0 : Math.min(0.1, (nowMs - last) / 1000);
        last = nowMs;
        MT += dt;
        if (choosing >= 0) CHOICE_T += dt;
        else {
          const prev = T;
          T = Math.min(TOTAL, T + dt);
          // A shot with a choice holds on its last frame until the player answers.
          const c = SH.findIndex((s, k) => s.choice && !answered.has(k) && s.start + s.dur > prev - 1e-6 && s.start + s.dur <= T + 1e-6);
          if (c >= 0) { T = SH[c].start + SH[c].dur - 1e-4; fireEvents(prev, T); openChoice(c); }
          else fireEvents(prev, T);
          if (T >= TOTAL) { render(TOTAL); finish(); return; }
        }
      }
      const lt = render(started ? T : sc.poster); // before starting, show a still as a poster
      if (playing && soundOn) music(curShot, lt, MT);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}

/**
 * The title card before a level (about 5 seconds; any key skips it).
 * @param {{ id: number, of: number, name: string, concept: string, enemies: string, style: string }} level
 */
export function playLevelCard(level) { return playCutscene({ autoStart: true, scene: "card", level }); }
