/* Procedural 3D school uniform. Smooth sleeves/trousers are rebuilt along joints.
 * This is an approximate stylized model, not a fitted scan or fabric simulation.
 * Specification: provided PDF, page 2 (winter basic jacket/shirt/bottoms), used
 * as the spring/autumn experience by agreement; shoes/head are stylized additions.
 */
const SchoolAvatar = (()=>{
  const {clamp,add,sub,mul,dot,length,unit,mix,I,mm,T,S,RX,RY,RZ,point,dir,uvGrid,sphere,tube,patch,plane}=G3;
  const NAVY='#203152',GREEN='#287348',WHITE='#f9f8f0',SKIN='#ecc2a5',HAIR='#302829';
  function radii(y){const keys=[[0,.225,.133],[.1,.226,.136],[.24,.218,.138],[.42,.251,.151],[.53,.257,.134],[.595,.142,.102]];y=clamp(y,0,.595);for(let i=1;i<keys.length;i++)if(y<=keys[i][0]){const a=keys[i-1],b=keys[i],t=(y-a[0])/(b[0]-a[0]);return [a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}return keys[keys.length-1].slice(1);}
  function surface(x,y,o=.004){const [rx,rz]=radii(y);return [x,y,rz*Math.sqrt(Math.max(0,1-(x/rx)**2))+o];}
  function frontPatch(y0,y1,left,right,rows=15,cols=10){return uvGrid(rows,cols,(u,v)=>{const y=y0+(y1-y0)*v,x=left(v)+(right(v)-left(v))*u;return [surface(x,y),[0,0,1],[u,v]];});}
  function curve(points,steps=24){const out=[];for(let j=0;j<=steps;j++){const t=j/steps*2,k=t<=1?0:1,u=t-k,p0=points[k],p1=points[k+1],m0=k===0?sub(points[1],points[0]):mul(sub(points[2],points[0]),.5),m1=k===0?mul(sub(points[2],points[0]),.5):sub(points[2],points[1]);const a=2*u*u*u-3*u*u+1,b=u*u*u-2*u*u+u,c=-2*u*u*u+3*u*u,d=u*u*u-u*u;out.push(add(add(mul(p0,a),mul(m0,b)),add(mul(p1,c),mul(m1,d))));}return out;}
  const directions=()=>({leftUpper:[-.18,-.98,0],leftFore:[-.07,-.995,.045],rightUpper:[.18,-.98,0],rightFore:[.07,-.995,.045],leftThigh:[-.035,-.999,0],leftShin:[0,-1,0],rightThigh:[.035,-.999,0],rightShin:[0,-1,0]});
  class Avatar{
    constructor(renderer,badgeImage){
      this.r=renderer;this.dirs=directions();this.target=directions();this.yaw=0;this.lean=0;this.targetYaw=0;this.targetLean=0;this.faceRoll=0;this.faceYaw=0;this.lower='pants';this.parts=[];
      this.ball=renderer.mesh(sphere());this.quad=renderer.mesh(plane());
      this.torso=renderer.mesh(uvGrid(30,64,(u,v)=>{const y=v*.595,[rx,rz]=radii(y),a=u*2*Math.PI;return [[rx*Math.sin(a),y,rz*Math.cos(a)],unit([Math.sin(a)/rx,.035,Math.cos(a)/rz]),[u,v]];}));
      this.parts.push([renderer.mesh(frontPatch(.298,.594,v=>-.112*v,v=>.112*v)),WHITE]);
      const poly=pts=>renderer.mesh(patch(pts.map(([x,y])=>surface(x,y,.009))));
      this.parts.push([poly([[-.117,.589],[-.020,.565],[-.069,.505],[-.127,.552]]),WHITE]);
      this.parts.push([poly([[.117,.589],[.020,.565],[.069,.505],[.127,.552]]),WHITE]);
      const line=(pts,color=GREEN,r=.007)=>this.parts.push([renderer.mesh(tube(pts,r,10)),color]);
      for(const s of [-1,1]){const pts=[];for(let j=0;j<=20;j++){const t=j/20;pts.push(surface(s*.119*(1-t),.59-(.59-.293)*t,.012));}line(pts,GREEN,.008);}
      const seam=[];for(let j=0;j<=18;j++)seam.push(surface(-.012,.005+j/18*.29,.010));line(seam,GREEN,.007);
      const hem=[];for(let i=0;i<=70;i++){const a=i/70*Math.PI*2;hem.push([.226*Math.sin(a),.008,.136*Math.cos(a)]);}line(hem,GREEN,.0075);
      for(const side of [-1,1]){const x=side*.141;
        this.parts.push([renderer.mesh(frontPatch(.060,.166,()=>x-.054,()=>x+.054,7,8)),NAVY]);
        const border=[];for(const [a,b]of [[x-.054,.166],[x-.054,.065],[x-.041,.052],[x+.041,.052],[x+.054,.065],[x+.054,.166]])border.push(surface(a,b,.011));line(border,'#59647b',.0016);
        line(Array.from({length:10},(_,i)=>surface(x-.055+i/9*.110,.171,.012)),GREEN,.006);
      }
      this.parts.push([renderer.mesh(frontPatch(.356,.451,()=>.108,()=>.205,8,8)),NAVY]);
      line(Array.from({length:8},(_,i)=>surface(.105+i/7*.103,.454,.012)),GREEN,.005);
      this.badgeTex=renderer.texture(badgeImage);this.badgeReady=!!badgeImage;
      this.hair=renderer.mesh(sphere(14,36,1.83));
      const smile=[];for(let i=0;i<=18;i++){const x=-.062+i/18*.124;smile.push([x,-.061-.018*(1-(x/.062)**2),.178]);}this.smile=renderer.mesh(tube(smile,.004,8));
      this.brows=[-1,1].map(s=>renderer.mesh(tube([[s*.040,.054,.174],[s*.072,.060,.174],[s*.10,.052,.161]],.005,8)));
      this.face=renderer.mesh(uvGrid(20,18,(u,v)=>{const x=(u-.5)*.366,y=(v-.5)*.448,z=.188+.025*(1-(x/.183)**2);return [[x,y,z],[0,0,1],[u,v]];}));
      this.faceTex=renderer.texture();this.liveFace=false;
      this.limbs={};for(const name of ['leftArm','rightArm','leftLeg','rightLeg'])this.limbs[name]=renderer.mesh(tube([[0,0,0],[0,-.25,0],[0,-.5,0]],.06),true);
      this.cuff=renderer.mesh(tube([[0,0,0],[0,-.025,0]],.055),true);
      this.sock=renderer.mesh(tube([[0,0,0],[0,-.3,0]],.05),true);
      this.skirtTex=renderer.texture(this.makePlaid());
      this.skirt=renderer.mesh(uvGrid(24,96,(u,v)=>{const a=u*2*Math.PI,pleat=Math.cos(a*18)*.012*v,rx=.198+.117*v+pleat,rz=.132+.078*v+pleat;return [[rx*Math.sin(a),-.02-.43*v,rz*Math.cos(a)],unit([Math.sin(a),.16,Math.cos(a)]),[u*4,1-v]];}));
      this.shadow=renderer.texture(this.makeShadow());
      this.platform=renderer.mesh(uvGrid(1,80,(u,v)=>{const a=u*Math.PI*2;return [[Math.cos(a)*v,.002,Math.sin(a)*v],[0,1,0],[.5+Math.cos(a)*v*.5,.5+Math.sin(a)*v*.5]];}));
      this.poseSnapshot={};
    }
    makeShadow(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,2,64,64,64);g.addColorStop(0,'rgba(35,66,57,.27)');g.addColorStop(.45,'rgba(35,66,57,.16)');g.addColorStop(1,'rgba(35,66,57,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return c;}
    makePlaid(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#182b37';x.fillRect(0,0,256,256);for(let k=0;k<4;k++){const a=k*64;x.fillStyle='#244e42';x.fillRect(a+10,0,26,256);x.fillRect(0,a+10,256,26);x.fillStyle='rgba(5,20,35,.55)';x.fillRect(a+40,0,16,256);x.fillRect(0,a+40,256,16);x.fillStyle='#688269';x.fillRect(a+19,0,1.3,256);x.fillRect(0,a+19,256,1.3);x.fillStyle='#59768b';x.fillRect(a+57,0,1,256);x.fillRect(0,a+57,256,1);}return c;}
    setFace(canvas,show){this.liveFace=show;if(show)this.r.updateTexture(this.faceTex,canvas);}
    reset(){this.target=directions();this.targetYaw=0;this.targetLean=0;this.faceRoll=0;this.faceYaw=0;}
    animate(t,mode,dt){
      if(mode==='demo'){
        const d=directions(),wave=.5+.5*Math.sin(t*1.6);
        d.rightUpper=unit([.83,.27,.15]);d.rightFore=unit([.20*Math.sin(t*3.0),.97,.08]);
        d.leftUpper=unit([-.21,-.97,.02]);d.leftFore=unit([-.08,-.99,.08]);
        this.target=d;this.targetYaw=.12*Math.sin(t*.45);this.targetLean=.008*Math.sin(t);
      }
      const k=1-Math.exp(-10*Math.min(dt,.1));for(const key in this.dirs)this.dirs[key]=unit(mix(this.dirs[key],this.target[key],k));
      this.yaw+=(this.targetYaw-this.yaw)*k;this.lean+=(this.targetLean-this.lean)*k;
    }
    ballAt(parent,pos,scale,color,opt={}){this.r.draw(this.ball,mm(parent,mm(T(...pos),S(...scale))),color,opt);}
    render(viewAngle,size=1,trackX=0){
      const r=this.r,bodyRot=mm(RY(this.yaw),RZ(this.lean));
      const ends={};for(const side of [-1,1]){const key=side<0?'left':'right';const hip=point(RY(this.yaw),[side*.119,.94,0]),knee=add(hip,mul(this.dirs[key+'Thigh'],.43)),ankle=add(knee,mul(this.dirs[key+'Shin'],.395));ends[key+'Leg']=[hip,knee,ankle];}
      const floor=.065-Math.min(ends.leftLeg[2][1],ends.rightLeg[2][1]);
      const root=mm(T(trackX,0,0),mm(RY(viewAngle),mm(S(size),T(0,floor,0))));
      r.draw(this.platform,mm(T(trackX,0,0),S(.64,1,.40)),'#ffffff',{texture:this.shadow,unlit:true,depthWrite:false});
      const body=mm(root,mm(T(0,.94,0),bodyRot));
      // Leg meshes are continuous tubes through hip, knee and ankle.
      for(const side of [-1,1]){
        const key=side<0?'left':'right',[hip,knee,ankle]=ends[key+'Leg'];
        const pts=curve([hip,knee,ankle]),rr=pts.map((_,i)=>.093-(.093-.062)*i/(pts.length-1));
        r.update(this.limbs[key+'Leg'],tube(pts,rr,18));
        r.draw(this.limbs[key+'Leg'],root,this.lower==='pants'?NAVY:SKIN);
        if(this.lower==='skirt'){
          const a=add(knee,mul(unit(sub(ankle,knee)),.025)),b=add(ankle,[0,.014,0]);
          r.update(this.sock,tube([a,b],[.063,.052],18));r.draw(this.sock,root,WHITE);
        }
        const shoe=mm(root,mm(T(...add(ankle,[0,-.018,.052])),RY(this.yaw)));
        this.ballAt(shoe,[0,-.020,.030],[.084,.046,.152],'#182133',{gloss:.12});
        this.ballAt(shoe,[0,-.045,.030],[.086,.018,.155],'#dfe2df');
        this.ballAt(shoe,[0,.009,.066],[.065,.014,.075],'#263149',{gloss:.09});
      }
      this.ballAt(body,[0,-.02,0],[.203,.133,.128],NAVY);
      if(this.lower==='skirt')r.draw(this.skirt,body,'#ffffff',{texture:this.skirtTex});
      // Torso, collar, piping, pockets, two front buttons.
      r.draw(this.torso,body,NAVY);for(const [mesh,color]of this.parts)r.draw(mesh,body,color);
      for(const y of [.268,.111])this.ballAt(body,surface(.012,y,.016),[.013,.013,.006],'#c3a24a',{gloss:.13});
      if(this.badgeReady){const p=surface(.153,.404,.021);r.draw(this.quad,mm(body,mm(T(...p),mm(RY(.24),S(.075,.075,1)))),'#ffffff',{texture:this.badgeTex});}
      this.ballAt(body,[0,.637,0],[.073,.102,.070],SKIN);
      // Smooth fabric bends at elbow instead of separate rigid stickers.
      for(const side of [-1,1]){
        const key=side<0?'left':'right',s=point(mm(T(0,.94,0),bodyRot),[side*.261,.526,0]);
        const elbow=add(s,mul(this.dirs[key+'Upper'],.281)),wrist=add(elbow,mul(this.dirs[key+'Fore'],.259));
        ends[key+'Arm']=[s,elbow,wrist];const pts=curve([s,elbow,wrist]);
        const rr=pts.map((_,i)=>.094-(.094-.053)*i/(pts.length-1));r.update(this.limbs[key+'Arm'],tube(pts,rr,18));r.draw(this.limbs[key+'Arm'],root,NAVY);
        const fore=unit(sub(wrist,elbow)),end=add(wrist,mul(fore,.025));r.update(this.cuff,tube([wrist,end],[.054,.051],18));r.draw(this.cuff,root,WHITE);
        const palm=add(end,mul(fore,.050));this.ballAt(root,palm,[.048,.065,.040],SKIN);
        this.ballAt(root,add(palm,[-side*.037,.018,.029]),[.023,.031,.023],SKIN);
        for(const dy of [.036,.016])this.ballAt(root,add(wrist,[0,dy,-.050]),[.007,.007,.006],'#b39545',{gloss:.08});
      }
      const headBase=point(body,[0,.892,0]);
      const head=mm(T(...headBase),mm(RY(this.yaw+viewAngle+this.faceYaw),RZ(this.lean+this.faceRoll)));
      // headBase is already world transformed, so apply only the scaled local head.
      const hm=mm(head,S(size));
      this.ballAt(hm,[0,0,0],[.187,.228,.171],SKIN);
      this.ballAt(hm,[-.189,-.010,0],[.031,.050,.027],SKIN);this.ballAt(hm,[.189,-.010,0],[.031,.050,.027],SKIN);
      if(!this.liveFace){
        r.draw(this.hair,mm(hm,mm(T(0,.057,-.027),S(.199,.224,.183))),HAIR,{gloss:.06});
        for(let i=0;i<5;i++){const x=-.136+i*.061;this.ballAt(hm,[x,.120+(i%2)*.011,.113],[.056,.052,.066],HAIR,{gloss:.03});}
        for(const s of [-1,1]){this.ballAt(hm,[s*.070,.012,.159],[.020,.028,.012],'#25303a');this.ballAt(hm,[s*.066,.020,.169],[.005,.008,.004],WHITE);this.ballAt(hm,[s*.106,-.046,.145],[.030,.014,.006],'#eeb7a4');}
        this.ballAt(hm,[0,-.025,.177],[.019,.024,.023],SKIN);r.draw(this.smile,hm,'#8e544a');for(const b of this.brows)r.draw(b,hm,HAIR);
      }else{
        r.draw(this.face,hm,'#ffffff',{texture:this.faceTex,unlit:true});
      }
      this.poseSnapshot=ends;
    }
  }
  return Avatar;
})();
