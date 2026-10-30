(function(){
PX.REG.templates = PX.REG.templates || [];
const {add}=PX;
const SK='#f1b88f', SKL='#fbd5b3', SKD='#d28f6a';
const UW='#8392bf', UWD='#66749f';
const EYE='#2b2140', LASH='#120c20', IRIS='#6a58a8', WH='#ffffff', BLUSH='#ee8a86', MOUTH='#a8545a';

const VK={front:1,'34':.88,side:.9,back:1};

function limb(s,x0,y0,x1,y1,w,main,shade){
  s.line(x0,y0,x1,y1,shade,w);
  s.line(x0-.5,y0,x1-.5,y1,main,Math.max(1,w-1.4));
}
function eye(s,x,y,w,h,dx,iw,lash){
  s.rect(x,y,w,h,WH);
  s.rect(x+dx,y,iw,h,EYE);
  if(s.big) s.rect(x+dx,y+h-1.4,iw,1.4,IRIS);
  if(s.big) s.rect(x-.3,y-.5,w+.6,1.1,LASH);
  const hx=x+dx+.2, hy=y+1.2;
  if(s.big) s.rect(hx,hy,1,1,WH);
  else { const a=Math.round(hx/2)*2, b=Math.round(hy/2)*2; s.rect(a,b,2,2,WH); }
  if(lash) s.rect(x-.3,y-1.6,w+.6,1,SKD);
}

function fig(s,o){
  const P=Object.assign({
    view:'34',hcy:9,hrx:8.6,hry:7.2,neckW:3,lean:0,hump:0,
    sy:17,sw:4.6,wy:21.5,ww:3.8,hy:25,hw:4.4,legTop:24.6,legW:3.8,footY:29.6,footRx:2.8,
    armW:3.2,handR:1.6,armLen:6.2,handOut:.4,armFwd:0,
    eyeW:4,eyeH:4.8,eyeY:-.2,mouthY:6.2,top:false,elder:false,preg:false,walk:false,
    hbx:0,tcxo:0
  },o);
  const view=P.view, k=VK[view];
  const tcx=16+(view==='34'?.6:view==='side'?-.6:0)+P.tcxo;
  const sw=P.sw*k, ww=P.ww*k, hw=P.hw*k, L=P.lean;
  const hx=16+(view==='side'?.6:0)+L+P.hbx, hc=P.hcy;
  const sy=P.sy, wy=P.wy, hy=P.hy;
  const armOff=sw+P.armW/2-.3;
  const handAt=(x,y,c1,c2)=>{ s.ell(x,y,P.handR,P.handR+.3,c1); if(c2) s.ell(x-.3,y-.2,P.handR-.7,P.handR-.3,c2); };

  // 먼 쪽 팔 (3/4)
  if(view==='34' && !P.preg){
    const x0=tcx+armOff+.3+L*.6;
    const e=P.walk?[3.2,-.3]:[P.handOut+P.armFwd,0];
    limb(s,x0,sy+1,x0+e[0],sy+1+P.armLen+e[1],P.armW*.85,SKD,SKD);
    handAt(x0+e[0],sy+1+P.armLen+e[1]+P.handR*.6,SKD);
  }
  // 다리
  const fy=P.footY, lt=P.legTop, lw=P.legW;
  if(P.walk){
    const hxA=tcx-1.6, hxB=tcx+1.2;
    limb(s,hxB-.4,lt+1,tcx-4.4,fy-1.2,lw*.95,SKD,SKD);
    s.ell(tcx-4.2,fy-.2,2.7,1.4,SKD);
    limb(s,hxA+.4,lt+1,tcx+3.4,fy-.4,lw,SK,SKD);
    s.ell(tcx+4.6,fy+.1,2.9,1.5,SK); s.rect(tcx+2,fy+.9,5,.8,SKD);
  } else if(view==='front'||view==='back'){
    const l=tcx-.3-lw, r=tcx+.3;
    [l,r].forEach(x=>{ s.rect(x,lt,lw,fy-lt+.5,SK); s.rect(x+lw-1.5,lt,1.5,fy-lt+.5,SKD);
      s.ell(x+lw/2+(x===l?-.5:.5),fy,P.footRx,1.5,SK); s.rect(x-.5,fy+.6,lw+1,.9,SKD); });
  } else if(view==='34'){
    const far=tcx+.2, near=tcx-lw+.3;
    s.rect(far,lt,lw,fy-lt+.5,SKD); s.ell(far+lw/2+1.2,fy,P.footRx,1.5,SKD);
    s.rect(near,lt,lw,fy-lt+.5,SK); s.rect(near+lw-1.4,lt,1.4,fy-lt+.5,SKD);
    s.ell(near+lw/2+1.2,fy,P.footRx,1.5,SK); s.rect(near+lw/2-P.footRx+1.2,fy+.6,P.footRx*2-1,.9,SKD);
  } else {
    const x=tcx-lw/2-.3;
    s.rect(x+.9,lt,lw*.9,fy-lt+.5,SKD); s.ell(x+.9+lw/2+1.4,fy,P.footRx,1.5,SKD);
    s.rect(x,lt,lw*.9,fy-lt+.5,SK); s.rect(x+lw*.9-1.3,lt,1.3,fy-lt+.5,SKD);
    s.ell(x+lw/2+1.4,fy,P.footRx,1.5,SK); s.rect(x-.6,fy+.6,P.footRx*2,.9,SKD);
  }
  // 몸통
  const hu=P.hump;
  const tor=(ins)=>{
    const a=[[tcx-sw+L,sy],[tcx+sw-ins+L,sy],[tcx+ww-ins+L*.5,wy],[tcx+hw-ins,hy],[tcx-hw,hy],[tcx-ww+L*.5-hu,wy]];
    if(hu) a.push([tcx-sw+L-hu-.5,sy+2.5]);
    return a;
  };
  s.poly(tor(0),SKD); s.poly(tor(view==='side'?1.2:1.8),SK);
  if(view!=='back') s.ell(tcx-1.2+L,sy+2.2,Math.max(1.2,sw-2.6),1.6,SKL);
  else { s.rect(tcx-.5+L,sy+1.5,1,wy-sy-1,SKD); }
  // 속옷
  if(P.top){
    const tw=Math.max(2,sw-.5);
    s.rect(tcx-tw+L,sy+1.2,tw*2-1.2,2.6,UWD); s.rect(tcx-tw+L,sy+1.2,tw*2-2.8,2.6,UW);
  }
  const sh=(ins)=>[[tcx-ww+L*.3-.2,wy+1.6],[tcx+ww+.2-ins,wy+1.6],[tcx+hw-ins+.2,hy+1.2],[tcx-hw-.2,hy+1.2]];
  const shorts=()=>{
    s.poly(sh(0),UWD); s.poly(sh(view==='side'?1.2:1.6),UW);
    const lx=view==='front'||view==='back'?tcx-.3-lw:view==='34'?tcx-lw+.3:tcx-lw/2-.3;
    const wd=view==='front'||view==='back'?lw*2+.6:view==='34'?lw*2-.1:lw;
    if(!P.walk){ s.rect(lx,hy+.8,wd,1.6,UWD); s.rect(lx,hy+.8,wd-1.4,1.6,UW); }
  };
  if(!P.preg) shorts();
  // 임신 배
  if(P.preg){
    s.rect(tcx-hw,hy-2.2,hw*2,2.6,UWD);
    s.ell(tcx+3.9,21.8,6.4,5.4,SKD); s.ell(tcx+3,21.2,5.2,4.5,SK);
    s.ell(tcx+1.2,18.9,2.6,1.5,SKL); s.dot(tcx+4.4,22.6,SKD);
    s.rect(tcx-hw+.5,hy+.4,hw*2,1.8,UWD); s.rect(tcx-hw+.5,hy+.4,hw*2-1.6,1.8,UW);
  }
  // 가까운 팔
  const ay=sy+1;
  if(P.preg){
    const x0=tcx-armOff+L*.5;
    limb(s,x0,ay,x0-1.6,ay+4.6,P.armW,SK,SKD);
    limb(s,x0-1.6,ay+4.6,tcx-sw+.4,hy-1.2,P.armW,SK,SKD);
    s.ell(tcx-sw+1.2,hy-.6,P.handR,P.handR,SK);
    handAt(tcx+6.8,19.4,SKD,SK);
  } else if(view==='side'){
    const x0=tcx+.2+L*.6, e=P.walk?[2.5,0]:[P.handOut+P.armFwd+.6,0];
    limb(s,x0,ay,x0+e[0],ay+P.armLen,P.armW,SK,SKD);
    handAt(x0+e[0],ay+P.armLen+P.handR*.6,SKD,SK);
  } else if(view==='front'||view==='back'){
    [-1,1].forEach(sg=>{
      const x0=tcx+sg*armOff, x1=x0+sg*P.handOut;
      limb(s,x0,ay,x1,ay+P.armLen,P.armW,sg<0?SK:SKD,SKD);
      if(sg>0) s.line(x0-.5,ay,x1-.5,ay+P.armLen,SK,P.armW-1.4);
      handAt(x1,ay+P.armLen+P.handR*.6,sg<0?SK:SKD,SK);
    });
  } else {
    const x0=tcx-armOff+L*.6, e=P.walk?[-3.6,-.4]:[-P.handOut+P.armFwd,0];
    limb(s,x0,ay,x0+e[0],ay+P.armLen+e[1],P.armW,SK,SKD);
    handAt(x0+e[0],ay+P.armLen+e[1]+P.handR*.6,SK,SKL);
  }
  // 목
  const nw=view==='side'?P.neckW+1.4:P.neckW;
  s.line(hx,hc+P.hry-1.5,tcx+L*.8,sy+1,nw,SKD);
  s.line(hx-.5,hc+P.hry-1.5,tcx+L*.8-.5,sy+1,SK,nw-1.2);
  // 머리
  const hrx=P.hrx, hry=P.hry;
  const hd=(c,dx,dy,sh)=>{ s.ell(hx+dx,hc-.6+dy,hrx-sh,hry-.4-sh,c); s.ell(hx+dx,hc+1.6+dy,hrx-1.5-sh,hry-1.5-sh,c); };
  hd(SKD,0,0,0); hd(SK,-.8,-.5,1.3);
  s.ell(hx-2.6,hc-hry+2.8,hrx*.4,1.7,SKL);
  const ew=P.eyeW, eh=P.eyeH, ey=hc+P.eyeY, el=P.elder;
  const ear=(x)=>{ s.ell(x,hc+1.5,1.4,2,SK); s.dot(x,hc+1.6,SKD); };
  if(view==='front'){
    ear(hx-hrx+.3); ear(hx+hrx-.3);
    const g=1.2;
    eye(s,hx-g-ew,ey,ew,eh,(ew-ew*.68)/2,ew*.68,el);
    eye(s,hx+g,ey,ew,eh,(ew-ew*.68)/2,ew*.68,el);
    s.ell(hx-g-ew/2-.2,ey+eh+.4,1.5,.8,BLUSH); s.ell(hx+g+ew/2+.2,ey+eh+.4,1.5,.8,BLUSH);
    s.rect(hx-1,hc+P.mouthY,2,1,MOUTH);
  } else if(view==='34'){
    const fc=hx+2.2;
    ear(hx-hrx+1.3);
    const nw=ew+.2, fw=ew-1;
    eye(s,fc-4.8,ey,nw,eh,nw-nw*.66,nw*.66,el);
    eye(s,fc+1,ey,fw,eh,fw-fw*.62,fw*.62,el);
    s.ell(fc-3,ey+eh+.4,1.5,.8,BLUSH); s.ell(fc+3.2,ey+eh+.4,1.1,.8,BLUSH);
    s.rect(fc,hc+P.mouthY,1.6,1,MOUTH);
  } else if(view==='side'){
    ear(hx-1.2);
    s.rect(hx+hrx-1.2,hc+2.8,1.6,1.4,SK);
    eye(s,hx+2.6,ey,ew-.2,eh,ew-.2-(ew-.2)*.6,(ew-.2)*.6,el);
    s.ell(hx+3.6,ey+eh+.4,1.5,.8,BLUSH);
    s.rect(hx+hrx-2.4,hc+P.mouthY,1.4,1,MOUTH);
  } else {
    ear(hx-hrx+.3); ear(hx+hrx-.3);
    s.ell(hx,hc+hry-1.6,hrx*.55,.9,SKD);
  }
  if(el && view!=='back'){ s.dot(hx+(view==='front'?-3.5:view==='34'?3.5:5),hc+P.mouthY-.5,SKD); }
}

function mk(P,left){ return s=>{ fig(s,P); if(left) s.flipX(); }; }

const STD={};
add('templates','t01_base_34','기본 틀 · 3/4','머리카락과 옷을 그려 넣어 쓰는 표준 체형의 3/4 대각선(우향) 틀',['틀','표준','3/4','대각선'],mk({view:'34'}));
add('templates','t02_base_front','기본 틀 · 정면','머리카락과 옷을 그려 넣어 쓰는 표준 체형의 정면 틀',['틀','표준','정면'],mk({view:'front'}));
add('templates','t03_base_side','기본 틀 · 옆모습','머리카락과 옷을 그려 넣어 쓰는 표준 체형의 우향 프로필 틀',['틀','표준','옆모습'],mk({view:'side'}));
add('templates','t04_base_back','기본 틀 · 뒷모습','뒤통수와 등을 그려 넣어 쓰는 표준 체형의 뒷모습 틀',['틀','표준','뒷모습'],mk({view:'back'}));
add('templates','t05_base_walk','기본 틀 · 걷기','한 발을 내딛고 팔을 흔드는 걷는 자세의 3/4 우향 틀',['틀','표준','걷기','3/4'],mk({view:'34',walk:true,lean:.8}));

add('templates','t06_male','남성 틀','어깨가 넓고 목이 굵은 남성 체형의 3/4 틀',['틀','남성','3/4'],mk({view:'34',hrx:8.4,neckW:4.4,sy:16.8,sw:6.4,wy:21.6,ww:5.2,hw:5.2,legW:4.2,armW:4,handR:1.9,armLen:6.4,footRx:3.2,eyeH:4.4}));
add('templates','t07_female','여성 틀','어깨가 좁고 허리가 잘록한 약간 작은 여성 체형의 3/4 틀',['틀','여성','3/4'],mk({view:'34',hcy:9.8,hrx:8.5,hry:7.1,neckW:2.4,sy:17.6,sw:3.7,wy:21.8,ww:2.6,hy:25.3,hw:4.5,legTop:25,legW:3.3,footY:29.8,armW:2.8,handR:1.4,armLen:6,footRx:2.5,eyeH:5,top:true}),true);
add('templates','t08_child','아이 틀','몸이 작고 머리가 아주 큰 아이 체형의 3/4 틀',['틀','아이','3/4'],mk({view:'34',hcy:11.3,hrx:9.6,hry:8.4,neckW:2.6,sy:19.6,sw:3.8,wy:23.4,ww:3.4,hy:26.4,hw:3.9,legTop:26,legW:3.2,armW:2.8,handR:1.4,armLen:4.4,footRx:2.5,eyeW:4.2,eyeH:5.6,eyeY:1.2,mouthY:6.8}));
add('templates','t09_elder','노년 틀','등이 굽고 머리가 앞으로 나온 구부정한 노년 체형의 3/4 틀',['틀','노년','구부정','3/4'],mk({view:'34',hcy:11.8,hrx:8,hry:6.6,neckW:2.8,sy:19.2,sw:4.5,wy:22.8,ww:3.8,hy:26,hw:4.2,legTop:25.6,legW:3.4,footY:29.8,armW:3,handR:1.5,armLen:6.2,armFwd:2.6,handOut:0,footRx:2.7,eyeH:3.6,eyeY:.9,lean:3.6,hump:2.2,elder:true,mouthY:5.4,tcxo:-1.2}),true);
add('templates','t10_heavy','건장한 틀','오크·전사용의 크고 넓은 건장한 체형의 3/4 틀',['틀','건장','오크','전사'],mk({view:'34',hcy:8.4,hrx:9.2,hry:7,neckW:5.6,sy:16.2,sw:8,wy:21.6,ww:6.8,hy:25.4,hw:6.4,legTop:24.8,legW:5.2,armW:5.2,handR:2.4,armLen:6.6,footRx:3.8,eyeH:4.4}),true);
add('templates','t11_small','소형 틀','드워프·난쟁이용의 키가 작고 다부진 체형의 3/4 틀',['틀','소형','드워프'],mk({view:'34',hcy:13.2,hrx:9,hry:6.8,neckW:4.4,sy:19.6,sw:6,wy:24,ww:5.6,hy:27,hw:5.4,legTop:26.6,legW:4.6,footY:29.8,armW:4.2,handR:1.9,armLen:4.6,footRx:3.3,eyeH:4.2,mouthY:5.3}));
add('templates','t12_preg','임신 체형 틀','배만 크게 둥글게 튀어나오고 한 손으로 허리를 받치는 임신 체형의 3/4 틀',['틀','임신','여성','3/4'],mk({view:'34',hcy:9.6,hrx:8.5,hry:7.1,neckW:2.5,sy:17.4,sw:3.9,wy:21.8,ww:3,hy:25.4,hw:4.4,legTop:25,legW:3.4,armW:2.8,handR:1.4,armLen:6,footRx:2.5,eyeH:4.8,top:true,preg:true,lean:-.8}));
})();
