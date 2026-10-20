/* Minimal local WebGL renderer. No external 3D engine and no API key. */
const G3 = (() => {
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const add=(a,b)=>a.map((x,i)=>x+b[i]);
  const sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const mul=(a,s)=>a.map(x=>x*s);
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const length=a=>Math.hypot(...a);
  const unit=(a,f=[0,-1,0])=>length(a)>1e-7?mul(a,1/length(a)):f.slice();
  const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
  const I=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  function mm(a,b){const c=new Float32Array(16);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)c[col*4+row]+=a[k*4+row]*b[col*4+k];return c;}
  function T(x,y,z){const m=I();m[12]=x;m[13]=y;m[14]=z;return m;}
  function S(x,y=x,z=x){const m=I();m[0]=x;m[5]=y;m[10]=z;return m;}
  function RX(a){const m=I(),c=Math.cos(a),s=Math.sin(a);m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m;}
  function RY(a){const m=I(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;}
  function RZ(a){const m=I(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m;}
  function point(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
  function dir(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2],m[1]*p[0]+m[5]*p[1]+m[9]*p[2],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]];}
  function normal(m){const a=[m[0],m[1],m[2]],b=[m[4],m[5],m[6]],c=[m[8],m[9],m[10]];const d=dot(a,cross(b,c));if(Math.abs(d)<1e-10)return new Float32Array([1,0,0,0,1,0,0,0,1]);return new Float32Array([...mul(cross(b,c),1/d),...mul(cross(c,a),1/d),...mul(cross(a,b),1/d)]);}
  function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),d=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*d,-1,0,0,2*near*far*d,0]);}
  function lookAt(eye,target,up=[0,1,0]){const z=unit(sub(eye,target)),x=unit(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  function uvGrid(rows,cols,fn){const v=[],idx=[];for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){const [p,n,uv]=fn(i/cols,j/rows);v.push(...p,...n,...(uv||[i/cols,1-j/rows]));}for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const k=j*(cols+1)+i;idx.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1);}return {v:new Float32Array(v),i:new Uint16Array(idx)};}
  function sphere(rows=20,cols=32,end=Math.PI){return uvGrid(rows,cols,(u,v)=>{const t=u*Math.PI*2,p=v*end,n=[Math.sin(p)*Math.cos(t),Math.cos(p),Math.sin(p)*Math.sin(t)];return [n,n,[u,1-v]];});}
  function tube(points,radii,cols=14){const v=[],idx=[];let lastN=null;for(let j=0;j<points.length;j++){const tan=unit(sub(points[Math.min(j+1,points.length-1)],points[Math.max(0,j-1)]));let n=unit(cross(tan,Math.abs(tan[2])<.90?[0,0,1]:[1,0,0]),[1,0,0]);if(lastN&&dot(n,lastN)<0)n=mul(n,-1);lastN=n;const b=unit(cross(tan,n));const r=typeof radii==='number'?radii:radii[j];for(let i=0;i<=cols;i++){const a=i/cols*2*Math.PI,nn=add(mul(n,Math.cos(a)),mul(b,Math.sin(a)));v.push(...add(points[j],mul(nn,r)),...nn,i/cols,j/(points.length-1));}}for(let j=0;j<points.length-1;j++)for(let i=0;i<cols;i++){const k=j*(cols+1)+i;idx.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1);}return {v:new Float32Array(v),i:new Uint16Array(idx)};}
  function patch(points,uvs){const v=[],idx=[];for(let i=0;i<points.length;i++)v.push(...points[i],0,0,1,...(uvs?uvs[i]:[0,0]));for(let i=1;i<points.length-1;i++)idx.push(0,i,i+1);return {v:new Float32Array(v),i:new Uint16Array(idx)};}
  function plane(){return patch([[-.5,-.5,0],[.5,-.5,0],[.5,.5,0],[-.5,.5,0]],[[0,0],[1,0],[1,1],[0,1]]);}
  class Renderer {
    constructor(canvas){
      this.canvas=canvas;
      const gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
      if(!gl)throw new Error('WebGLUnavailable');this.gl=gl;this.meshCount=0;
      const vs=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec2 aUV;uniform mat4 uModel,uVP;uniform mat3 uNormal;varying vec3 vNormal,vWorld;varying vec2 vUV;void main(){vec4 w=uModel*vec4(aPosition,1.0);vWorld=w.xyz;vNormal=normalize(uNormal*aNormal);vUV=aUV;gl_Position=uVP*w;}`;
      const fs=`precision mediump float;varying vec3 vNormal,vWorld;varying vec2 vUV;uniform vec3 uColor,uEye;uniform float uOpacity,uTexture,uUnlit,uGloss;uniform sampler2D uMap;void main(){vec4 tx=texture2D(uMap,vUV);vec4 base=vec4(uColor,uOpacity)*mix(vec4(1.0),tx,uTexture);if(base.a<0.012)discard;vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;vec3 l=normalize(vec3(-0.8,1.4,2.0));vec3 f=normalize(vec3(1.2,0.4,1.4));float key=max(dot(n,l),0.0);float fill=max(dot(n,f),0.0);float hemi=0.11*(n.y+1.0);vec3 eye=normalize(uEye-vWorld);float spec=pow(max(dot(n,normalize(l+eye)),0.0),36.0)*uGloss;vec3 lit=base.rgb*(0.48+hemi+0.44*key+0.14*fill)+vec3(spec);gl_FragColor=vec4(mix(lit,base.rgb,uUnlit),base.a);}`;
      const compile=(type,s)=>{const sh=gl.createShader(type);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh));return sh;};
      const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));this.program=p;gl.useProgram(p);
      this.loc={};for(const k of ['aPosition','aNormal','aUV'])this.loc[k]=gl.getAttribLocation(p,k);for(const k of ['uModel','uVP','uNormal','uColor','uEye','uOpacity','uTexture','uUnlit','uGloss','uMap'])this.loc[k]=gl.getUniformLocation(p,k);
      this.white=this.texture();gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,0);
    }
    mesh(data,dynamic=false){const gl=this.gl,m={vbo:gl.createBuffer(),ibo:gl.createBuffer(),count:data.i.length,bytes:data.v.byteLength,dynamic};gl.bindBuffer(gl.ARRAY_BUFFER,m.vbo);gl.bufferData(gl.ARRAY_BUFFER,data.v,dynamic?gl.DYNAMIC_DRAW:gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.i,gl.STATIC_DRAW);this.meshCount++;return m;}
    update(m,data){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,m.vbo);if(m.bytes===data.v.byteLength)gl.bufferSubData(gl.ARRAY_BUFFER,0,data.v);else{gl.bufferData(gl.ARRAY_BUFFER,data.v,gl.DYNAMIC_DRAW);m.bytes=data.v.byteLength;}if(m.count!==data.i.length){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.i,gl.DYNAMIC_DRAW);m.count=data.i.length;}}
    texture(source){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));if(source)this.updateTexture(t,source);return t;}
    updateTexture(t,source){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);}
    begin(eye,target){const gl=this.gl,w=this.canvas.width,h=this.canvas.height;gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);const vp=mm(perspective(.56,w/h,.05,100),lookAt(eye,target));gl.uniformMatrix4fv(this.loc.uVP,false,vp);gl.uniform3fv(this.loc.uEye,eye);this.drawCalls=0;}
    draw(mesh,model,color,opt={}){const gl=this.gl,L=this.loc;gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vbo);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ibo);for(const [k,size,off]of [['aPosition',3,0],['aNormal',3,12],['aUV',2,24]]){gl.enableVertexAttribArray(L[k]);gl.vertexAttribPointer(L[k],size,gl.FLOAT,false,32,off);}gl.uniformMatrix4fv(L.uModel,false,model);gl.uniformMatrix3fv(L.uNormal,false,normal(model));gl.uniform3fv(L.uColor,typeof color==='string'?rgb(color):color);gl.uniform1f(L.uOpacity,opt.opacity??1);gl.uniform1f(L.uTexture,opt.texture?1:0);gl.uniform1f(L.uUnlit,opt.unlit?1:0);gl.uniform1f(L.uGloss,opt.gloss||0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,opt.texture||this.white);gl.uniform1i(L.uMap,0);gl.depthMask(opt.depthWrite!==false);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0);gl.depthMask(true);this.drawCalls++;}
  }
  return {clamp,add,sub,mul,dot,cross,length,unit,mix,I,mm,T,S,RX,RY,RZ,point,dir,normal,rgb,uvGrid,sphere,tube,patch,plane,Renderer};
})();
