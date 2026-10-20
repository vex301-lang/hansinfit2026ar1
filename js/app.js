/* Camera boot is independent of remote tracking libraries. */
(function(){
'use strict';
const VERSION='HANSIN 3D v3.0.0',$=id=>document.getElementById(id);
const text=(id,s)=>{if($(id).textContent!==s)$(id).textContent=s;};
const say=(key,extra='')=>text('status',K[key]+extra);
const video=$('video'),canvas=$('scene'),faceCanvas=document.createElement('canvas');faceCanvas.width=256;faceCanvas.height=320;
const fx=faceCanvas.getContext('2d'),mask=document.createElement('canvas');mask.width=256;mask.height=320;
const mx=mask.getContext('2d');mx.save();mx.translate(128,160);mx.scale(1,1.25);const grad=mx.createRadialGradient(0,0,112,0,0,126);grad.addColorStop(0,'#fff');grad.addColorStop(1,'rgba(255,255,255,0)');mx.fillStyle=grad;mx.fillRect(-128,-128,256,256);mx.restore();
const log=[];const note=s=>{log.push(new Date().toLocaleTimeString()+' '+s);if(log.length>18)log.shift();text('log',log.join('\n'));};
let renderer=null,avatar=null,stream=null,opening=false,epoch=0,front=true,mode='idle',pose=null,poseLoading=false,poseState='idle',posePromise=null;
let lastResult=null,lastSeen=0,lastTime=0,lastDraw=0,lastInfer=0,lastVideo=-1,viewAngle=0,size=1,trackX=0,faceCrop=null,faceUpdated=0;
let faceOn=true,paused=false,frames=0,fps=0,fpsStart=performance.now(),lastGoodLegs=0,autoSize=1,renderFailed=false;
const CDN=['https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21','https://unpkg.com/@mediapipe/tasks-vision@0.10.21'];
const MODEL='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
function named(name,msg=name){const e=new Error(msg);e.name=name;return e;}
function timeout(p,ms,name,onLate){let expired=false,t;const watched=Promise.resolve(p).then(v=>{if(expired&&onLate)onLate(v);return v;});return Promise.race([watched,new Promise((_,reject)=>{t=setTimeout(()=>{expired=true;reject(named(name));},ms);})]).finally(()=>clearTimeout(t));}
function banner(s){$('warning').hidden=!s;text('warning',s||'');}
function controls(){
 $('start').disabled=opening;text('start',opening?K.opening:stream?K.restart:K.start);
 $('stop').disabled=!stream&&!opening;$('flip').disabled=!stream||opening;$('retry').disabled=poseLoading||!stream;$('snapshot').disabled=!renderer||renderFailed;
 text('modeTag',mode==='live'?K.live:mode==='demo'?K.demoTag:K.readyTag);$('pip').hidden=!stream||!$('preview').checked;text('pause',paused?K.resume:K.pause);
 const states={idle:K.modelIdle,loading:K.modelLoading,ready:K.modelReady,error:K.modelFail};text('modelStatus',states[poseState]);
 $('cameraDot').classList.toggle('on',!!stream);$('trackingDot').classList.toggle('on',poseState==='ready'&&performance.now()-lastSeen<900);
}
function clearFace(){faceCrop=null;lastResult=null;fx.clearRect(0,0,256,320);if(avatar){avatar.liveFace=false;renderer.updateTexture(avatar.faceTex,faceCanvas);}}
function stop(silent=false){epoch++;opening=false;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;mode='idle';paused=false;clearFace();if(avatar)avatar.reset();trackX=0;autoSize=1;lastSeen=0;lastVideo=-1;controls();if(!silent)say('stopped');}
const errors={NotAllowedError:'denied',SecurityError:'denied',NotFoundError:'noCamera',NotReadableError:'busyCamera',InsecureContext:'secure',Unsupported:'unsupported',PermissionTimeout:'permissionTimeout',VideoTimeout:'videoTimeout'};
async function start(){
 if(opening)return;stop(true);const id=epoch;opening=true;banner('');say('permission');controls();
 let incoming=null,timer=setTimeout(()=>{if(opening&&id===epoch)say('permissionWait');},8000);
 try{
  if(!window.isSecureContext)throw named('InsecureContext');if(!navigator.mediaDevices?.getUserMedia)throw named('Unsupported');
  incoming=await timeout(navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:front?'user':'environment'},width:{ideal:640},height:{ideal:800},frameRate:{ideal:24,max:30}}}),40000,'PermissionTimeout',s=>s.getTracks().forEach(t=>t.stop()));
  if(id!==epoch){incoming.getTracks().forEach(t=>t.stop());return;}stream=incoming;video.srcObject=stream;video.muted=true;await timeout(video.play(),14000,'VideoTimeout');
  await new Promise((resolve,reject)=>{const end=performance.now()+12000;function check(){if(id!==epoch||video.videoWidth>0&&video.readyState>=2)resolve();else if(performance.now()>end)reject(named('VideoTimeout'));else setTimeout(check,80);}check();});
  if(id!==epoch)return;mode='live';paused=false;lastVideo=-1;video.style.transform=front?'scaleX(-1)':'none';for(const t of stream.getTracks())t.onended=()=>{if(id===epoch){stop();banner(K.cameraEnded);}};
  say('cameraRunning');note('camera '+video.videoWidth+'x'+video.videoHeight);loadPose();
 }catch(e){if(id!==epoch)return;if(incoming)incoming.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;clearFace();mode='idle';say('cameraError');banner(K[errors[e.name]||'unknown']+' ['+e.name+']');note('camera: '+e.name+' '+e.message);}
 finally{clearTimeout(timer);if(id===epoch){opening=false;controls();}}
}
async function loadPose(force=false){
 if(pose&&!force)return;if(poseLoading)return posePromise;poseLoading=true;poseState='loading';controls();note('tracking: load');
 posePromise=(async()=>{try{
  if(force&&pose){try{pose.close();}catch(_){}pose=null;}
  let api,vision,lastErr;for(const base of CDN){try{api=await timeout(import(base+'/vision_bundle.mjs'),14000,'LibraryTimeout');vision=await timeout(api.FilesetResolver.forVisionTasks(base+'/wasm'),10000,'WasmTimeout');note('tracking library ready');break;}catch(e){lastErr=e;api=null;vision=null;note('tracking source failed: '+e.name);}}
  if(!api||!vision)throw lastErr||new Error('TrackingLibraryUnavailable');const abort=new AbortController(),tm=setTimeout(()=>abort.abort(),45000);let bytes;
  try{const res=await fetch(MODEL,{signal:abort.signal,credentials:'omit'});if(!res.ok)throw new Error('ModelHTTP'+res.status);bytes=new Uint8Array(await res.arrayBuffer());}finally{clearTimeout(tm);}
  const created=await timeout(api.PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetBuffer:bytes,delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.45,minPosePresenceConfidence:.45,minTrackingConfidence:.45,outputSegmentationMasks:false}),30000,'InitTimeout',v=>{try{v.close();}catch(_){}});
  pose=created;poseState='ready';lastInfer=0;lastVideo=-1;banner('');note('tracking: ready');
 }catch(e){poseState='error';banner(K.modelFailedNotice);note('tracking: '+e.name+' '+e.message);}
 finally{poseLoading=false;posePromise=null;controls();}})();return posePromise;
}
function good(l,i,c=.48){return !!l?.[i]&&(l[i].visibility??1)>c&&Number.isFinite(l[i].x)&&Number.isFinite(l[i].y);}
const seenJoint={};
function processPose(res,stamp){
 const l=res.landmarks?.[0],w=res.worldLandmarks?.[0];if(!l||!good(l,11)||!good(l,12)){if(stamp-lastSeen>850){avatar.reset();clearFace();say('searching');controls();}return;}
 lastSeen=stamp;lastResult=l;
 const raw=i=>w?.[i]&&Number.isFinite(w[i].z)?[w[i].x*(front?-1:1),-w[i].y,-w[i].z*.75]:[l[i].x*(front?-1:1),-l[i].y*(video.videoHeight/video.videoWidth),-(l[i].z||0)*.65];
 const ids=front?[[11,13,15,23,25,27],[12,14,16,24,26,28]]:[[12,14,16,24,26,28],[11,13,15,23,25,27]];
 for(let k=0;k<2;k++){const name=k===0?'left':'right',[s,e,h,p,n,a]=ids[k];for(const [key,i,j]of [[name+'Upper',s,e],[name+'Fore',e,h],[name+'Thigh',p,n],[name+'Shin',n,a]]){if(good(l,i)&&good(l,j)){let d=G3.unit(G3.sub(raw(j),raw(i)));if(key.includes('Thigh')||key.includes('Shin')){if(d[1]>.15)d=G3.unit([d[0],-.15,d[2]]);lastGoodLegs=stamp;}avatar.target[key]=d;seenJoint[key]=stamp;}else if(stamp-(seenJoint[key]||0)>700){avatar.target[key]=key.includes('Upper')?[k===0?-.18:.18,-.98,0]:[0,-1,0];}}}
 if(stamp-lastGoodLegs>700){avatar.target.leftThigh=[-.035,-.999,0];avatar.target.rightThigh=[.035,-.999,0];avatar.target.leftShin=[0,-1,0];avatar.target.rightShin=[0,-1,0];}
 const a=raw(ids[0][0]),b=raw(ids[1][0]),axis=G3.sub(b,a);avatar.targetYaw=G3.clamp(Math.atan2(-axis[2],Math.max(.02,axis[0])),-.8,.8);avatar.targetLean=G3.clamp(Math.atan2(axis[1],Math.hypot(axis[0],axis[2])),-.18,.18);
 const cx=(l[11].x+l[12].x)/2,dx=(front?1-cx:cx)-.5;trackX+=(G3.clamp(dx*1.1,-.28,.28)-trackX)*.18;
 if(good(l,27)&&good(l,28)&&good(l,0)){const occupy=Math.max(l[27].y,l[28].y)-Math.max(0,l[0].y-.10),wanted=G3.clamp(occupy/.72,.84,1.06);autoSize+=(wanted-autoSize)*.035;}
 const eyes=[l[2],l[5]];if(eyes.every(v=>v&&Number.isFinite(v.x))){const ey=Math.abs(eyes[0].x-eyes[1].x);avatar.faceRoll=G3.clamp((eyes[0].y-eyes[1].y)/Math.max(.05,ey)*.18,-.15,.15)*(front?-1:1);}avatar.faceYaw=-avatar.yaw*.7;
 if(faceOn&&good(l,0)&&good(l,2,.35)&&good(l,5,.35))updateFace(l,stamp);else avatar.liveFace=false;
 say(good(l,27)&&good(l,28)?'tracking':'upperOnly');controls();
}
function updateFace(l,stamp){
 if(stamp-faceUpdated<80)return;faceUpdated=stamp;const W=video.videoWidth,H=video.videoHeight;
 const earDist=good(l,7,.3)&&good(l,8,.3)?Math.hypot((l[7].x-l[8].x)*W,(l[7].y-l[8].y)*H):0,eyeDist=Math.hypot((l[2].x-l[5].x)*W,(l[2].y-l[5].y)*H);
 const fw=G3.clamp(Math.max(earDist*1.32,eyeDist*2.8),32,W*.62),fh=fw*1.25,ecx=(l[2].x+l[5].x)*W/2,ecy=(l[2].y+l[5].y)*H/2;
 const now=[ecx,ecy+fw*.12,fw,fh];faceCrop=faceCrop?G3.mix(faceCrop,now,.26):now;const [x,y,w,h]=faceCrop;
 fx.clearRect(0,0,256,320);fx.save();if(front){fx.translate(256,0);fx.scale(-1,1);}fx.drawImage(video,x-w/2,y-h/2,w,h,0,0,256,320);fx.restore();fx.globalCompositeOperation='destination-in';fx.drawImage(mask,0,0);fx.globalCompositeOperation='source-over';avatar.setFace(faceCanvas,true);
}
function setDemo(){stop(true);mode='demo';paused=false;if(avatar)avatar.reset();banner('');controls();say('demo');}
function resize(){if(!renderer)return;const b=$('stage').getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,1.5),w=Math.min(1000,Math.round(b.width*dpr)),h=Math.round(w*b.height/b.width);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}}
function draw(stamp){
 if(!renderer||renderFailed)return;const dt=lastTime?Math.min(.1,(stamp-lastTime)/1000):.033;lastTime=stamp;
 if(!paused){if(mode==='live'&&pose&&video.readyState>=2&&stamp-lastInfer>120&&video.currentTime!==lastVideo){lastInfer=stamp;lastVideo=video.currentTime;try{processPose(pose.detectForVideo(video,stamp),stamp);}catch(e){try{pose.close();}catch(_){}pose=null;poseState='error';banner(K.modelFailedNotice);note('inference: '+e.name+' '+e.message);controls();}}
 if(mode==='live'&&stamp-lastSeen>1100){avatar.reset();if(avatar.liveFace)clearFace();}avatar.animate(stamp/1000,mode,dt);}
 resize();const aspect=canvas.width/canvas.height,distance=Math.max(4.1,2.50/aspect);renderer.begin([0,1.27,distance],[0,1.04,0]);avatar.render(viewAngle,size*(mode==='live'?autoSize:1),mode==='live'?trackX:0);
 frames++;if(stamp-fpsStart>1200){fps=Math.round(frames*1000/(stamp-fpsStart));text('fps',fps+' FPS');frames=0;fpsStart=stamp;}
}
function loop(stamp){requestAnimationFrame(loop);if(document.hidden||stamp-lastDraw<32)return;lastDraw=stamp;try{draw(stamp);}catch(e){renderFailed=true;banner(K.renderFailed);note('render: '+e.name+' '+e.message);controls();}}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),20000);}
async function snapshot(){try{draw(performance.now());const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height+100;const x=c.getContext('2d');x.fillStyle='#edf3ef';x.fillRect(0,0,c.width,c.height);x.drawImage(canvas,0,0);x.fillStyle='#17382f';x.font='600 22px sans-serif';x.textAlign='center';x.fillText(K.photoTitle,c.width/2,c.height-58);x.fillStyle='#667d73';x.font='15px sans-serif';x.fillText(K.photoCaption,c.width/2,c.height-25);const blob=await new Promise(r=>c.toBlob(r,'image/png'));if(!blob)throw Error('PNG');download(blob,'hansin-3d-spring.png');text('saveStatus',K.saved);}catch(e){text('saveStatus',K.saveFailed);note('save: '+e.message);}}
// Bind camera controls before WebGL initialization. No blocking remote import.
$('start').addEventListener('click',start);$('stop').addEventListener('click',()=>stop());$('flip').addEventListener('click',()=>{front=!front;start();});$('retry').addEventListener('click',()=>loadPose(true));
$('demo').addEventListener('click',setDemo);$('pause').addEventListener('click',()=>{paused=!paused;controls();});$('snapshot').addEventListener('click',snapshot);
$('front').addEventListener('click',()=>{viewAngle=0;$('angle').value=0;text('angleValue','0\u00b0');});$('angle').addEventListener('input',e=>{viewAngle=+e.target.value*Math.PI/180;text('angleValue',e.target.value+'\u00b0');});$('size').addEventListener('input',e=>{size=+e.target.value/100;text('sizeValue',e.target.value+'%');});
$('faceMode').addEventListener('change',e=>{faceOn=e.target.checked;if(!faceOn)clearFace();});$('preview').addEventListener('change',controls);
document.querySelectorAll('[data-bottom]').forEach(b=>b.addEventListener('click',()=>{if(avatar)avatar.lower=b.dataset.bottom;document.querySelectorAll('[data-bottom]').forEach(a=>{a.setAttribute('aria-pressed',String(a===b));a.classList.toggle('active',a===b);});}));
$('reset').addEventListener('click',()=>{viewAngle=0;size=1;trackX=0;autoSize=1;$('angle').value=0;$('size').value=100;text('angleValue','0\u00b0');text('sizeValue','100%');if(avatar)avatar.reset();});
$('copyLog').addEventListener('click',async()=>{const s=JSON.stringify({version:VERSION,secure:window.isSecureContext,webgl:!!renderer,mode,poseState,video:video.videoWidth+'x'+video.videoHeight,fps,agent:navigator.userAgent,log},null,2);try{await navigator.clipboard.writeText(s);text('saveStatus',K.copied);}catch(_){text('log',s);}});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();renderFailed=true;stop(true);banner(K.renderFailed);controls();});
window.addEventListener('pagehide',()=>{stop(true);if(pose){try{pose.close();}catch(_){}pose=null;poseState='idle';}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream)stop();});window.addEventListener('resize',resize);
let drag=null;canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,a:viewAngle};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag)return;viewAngle=G3.clamp(drag.a+(e.clientX-drag.x)*.009,-Math.PI,Math.PI);$('angle').value=Math.round(viewAngle*180/Math.PI);text('angleValue',Math.round(viewAngle*180/Math.PI)+'\u00b0');});for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>drag=null);
controls();try{renderer=new G3.Renderer(canvas);avatar=new SchoolAvatar(renderer,$('brandBadge'));note('WebGL: ready');resize();requestAnimationFrame(loop);say('idle');controls();}catch(e){renderFailed=true;banner(K.webglFailed);note('WebGL: '+e.message);controls();}
// Diagnostic values do not contain photos or face crops.
window.Hansin3D={getDiagnostics:()=>({version:VERSION,mode,poseState,stream:!!stream,opening,renderer:!!renderer,renderFailed,fps,drawCalls:renderer?.drawCalls||0,liveFace:avatar?.liveFace||false,lower:avatar?.lower||'pants',lastSeen,poseJoints:avatar?.poseSnapshot||{}})};
})();
