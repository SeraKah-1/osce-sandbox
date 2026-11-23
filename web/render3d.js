// Small dependency-free WebGL renderer. All scene objects use genuine 3D vertices,
// camera projection, lighting and depth-testing; no CDN/build step is required.
const rad = deg => deg*Math.PI/180;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
// Frame the same scene on portrait tablets without clipping characters offscreen.
const cameraDefaultDistance=canvas=>{const aspect=(canvas.clientWidth||900)/Math.max(1,canvas.clientHeight||650);return clamp(5.2*Math.max(1,1.16/Math.max(.4,aspect)),5.2,14);};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mulv=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((v,c,i)=>v+c*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=v=>Math.sqrt(dot(v,v));
const norm=v=>{const l=length(v)||1;return mulv(v,1/l)};
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const multiply=(a,b)=>{const o=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o};
const translate=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const scale=(x,y,z)=>[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1];
const rotX=a=>[1,0,0,0,0,Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1];
const rotY=a=>[Math.cos(a),0,-Math.sin(a),0,0,1,0,0,Math.sin(a),0,Math.cos(a),0,0,0,0,1];
const rotZ=a=>[Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1,0,0,0,0,1];
const chain=(...ms)=>ms.reduce((a,b)=>multiply(a,b),identity());
const pt=(m,p=[0,0,0])=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const strColor=(hex)=>[parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255];
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0];}
function lookAt(eye,target,up=[0,1,0]){const z=norm(sub(eye,target)),x=norm(cross(up,z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];}
function cuboid(){const vertices=[],indices=[];const faces=[[[0,0,1],[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]],[[0,0,-1],[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]],[[1,0,0],[[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]]],[[-1,0,0],[[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]]],[[0,1,0],[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]],[[0,-1,0],[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]]];for(const [n,quad] of faces){const base=vertices.length/6;for(const p of quad)vertices.push(...p,...n);indices.push(base,base+1,base+2,base,base+2,base+3)}return {vertices,indices};}
function sphere(lat=10,lon=16){const v=[],idx=[];for(let y=0;y<=lat;y++){const th=y*Math.PI/lat;for(let x=0;x<=lon;x++){const ph=x*2*Math.PI/lon,n=[Math.sin(th)*Math.cos(ph),Math.cos(th),Math.sin(th)*Math.sin(ph)];v.push(...n,...n);}}for(let y=0;y<lat;y++)for(let x=0;x<lon;x++){const a=y*(lon+1)+x,b=a+lon+1;idx.push(a,b,a+1,b,b+1,a+1)}return {vertices:v,indices:idx};}
function cylinder(N=14){const v=[],idx=[];for(let i=0;i<=N;i++){const a=2*Math.PI*i/N,x=Math.cos(a),z=Math.sin(a);v.push(x,-.5,z,x,0,z,x,.5,z,x,0,z);}for(let i=0;i<N;i++){const j=i*2;idx.push(j,j+1,j+2,j+1,j+3,j+2);}for(const y of [-.5,.5]){const b=v.length/6;v.push(0,y,0,0,Math.sign(y),0);for(let i=0;i<=N;i++){const a=2*Math.PI*i/N;v.push(Math.cos(a),y,Math.sin(a),0,Math.sign(y),0);}for(let i=0;i<N;i++){if(y>0)idx.push(b,b+i+1,b+i+2);else idx.push(b,b+i+2,b+i+1);}}return {vertices:v,indices:idx};}
function between(a,b,r){const direction=norm(sub(b,a)),axis=Math.abs(direction[2])>.92?[0,1,0]:[0,0,1];const right=norm(cross(axis,direction)),forward=norm(cross(direction,right));const center=mulv(add(a,b),.5),h=length(sub(b,a));return [right[0]*r,right[1]*r,right[2]*r,0,direction[0]*h,direction[1]*h,direction[2]*h,0,forward[0]*r,forward[1]*r,forward[2]*r,0,...center,1];}
export function characterSkeleton(e){
 const pose=e.pose||{}, root=chain(translate(...e.position),rotY(e.rotation?.[1]||0));const hip=pt(root,[0,.95,0]);
 const spine=chain(root,translate(0,.95,0),rotX(rad(pose.spine?.flexion||0)),rotY(rad(pose.spine?.rotation||0)));
 const chest=pt(spine,[0,.40,0]),neck=pt(spine,[0,.73,0]);
 const head=pt(chain(spine,translate(0,.77,0),rotX(rad(pose.neck?.flexion||0)),rotY(rad(pose.neck?.rotation||0))),[0,.15,0]);
 const J={hip,chest,neck,head},S=[{a:hip,b:chest,r:.17,part:'torso'},{a:chest,b:neck,r:.11,part:'neck'}];
 for(const side of ['right','left']){
   const sign=side==='right'?1:-1;
   const shoulderBase=chain(spine,translate(sign*.31,.30,0));
   const shoulder=pt(shoulderBase);
   const sh=pose[side+'Shoulder']||{};
   const arm=chain(shoulderBase,rotX(rad(sh.flexion||0)),rotZ(rad(sh.abduction||0)),rotY(rad(sh.rotation||0)));
   const elbow=pt(arm,[0,-.40,0]);
   const forearm=chain(arm,translate(0,-.40,0),rotX(rad(pose[side+'Elbow']?.flexion||0)),rotY(rad(pose[side+'Elbow']?.rotation||0)));
   const wrist=pt(forearm,[0,-.34,0]);const handFrame=chain(forearm,translate(0,-.34,0),rotX(rad(pose[side+'Wrist']?.flexion||0)));const hand=pt(handFrame,[0,-.09,0]);
   J[side+'Shoulder']=shoulder;J[side+'Elbow']=elbow;J[side+'Hand']=hand;J[side+'Wrist']=wrist;
   S.push({a:shoulder,b:elbow,r:.077,part:'upperarm'},{a:elbow,b:wrist,r:.06,part:'forearm'},{a:wrist,b:hand,r:.055,part:'hand'});
   const hipBase=chain(root,translate(sign*.16,.91,0));
   const thigh=chain(hipBase,rotX(rad(pose[side+'Hip']?.flexion||0)),rotZ(rad(pose[side+'Hip']?.abduction||0)));
   const hipJoint=pt(hipBase),knee=pt(thigh,[0,-.45,0]);
   const calf=chain(thigh,translate(0,-.45,0),rotX(rad(pose[side+'Knee']?.flexion||0)));
   const ankle=pt(calf,[0,-.43,0]);const footFrame=chain(calf,translate(0,-.43,0),rotX(rad(pose[side+'Ankle']?.flexion||0)));const foot=pt(footFrame,[0,-.05,.14]);
   J[side+'Hip']=hipJoint;J[side+'Knee']=knee;J[side+'Ankle']=ankle;
   S.push({a:hipJoint,b:knee,r:.10,part:'thigh'},{a:knee,b:ankle,r:.077,part:'calf'},{a:ankle,b:foot,r:.067,part:'foot'});
 }
 return {joints:J,segments:S,root,spine};
}
function attachmentPoint(j,anchor){if(anchor==='rightUpperArm')return mulv(add(j.rightShoulder,j.rightElbow),.5);if(anchor==='leftUpperArm')return mulv(add(j.leftShoulder,j.leftElbow),.5);if(anchor==='rightForearm')return mulv(add(j.rightElbow,j.rightWrist),.5);if(anchor==='leftForearm')return mulv(add(j.leftElbow,j.leftWrist),.5);return j[anchor]||j.rightHand||j.chest;}
function stateVisual(world,e,asset){const b=world.behaviors.find(v=>v.id===asset.behaviorId);return b?.visuals?.[e.status]||{};}
function compile(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
function program(gl){const vs=`attribute vec3 aPos;attribute vec3 aNormal;uniform mat4 uView,uProjection,uModel;varying vec3 vNormal;varying vec3 vWorld;void main(){vec4 world=uModel*vec4(aPos,1.);vWorld=world.xyz;vNormal=mat3(uModel)*aNormal;gl_Position=uProjection*uView*world;}`;
 const fs=`precision mediump float;uniform vec3 uColor;uniform float uAlpha;varying vec3 vNormal,vWorld;void main(){vec3 n=normalize(vNormal);float light=max(dot(n,normalize(vec3(-.5,.95,.65))),0.);float rim=max(dot(n,normalize(vec3(.5,.3,-.6))),0.);vec3 col=uColor*(.58+.40*light)+vec3(.07,.08,.09)*rim;gl_FragColor=vec4(col,uAlpha);}`;
 const p=gl.createProgram();gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
export function createRenderer(canvas,overlay,callbacks={}){
 let gl;
 try{gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'low-power'});}catch(e){callbacks.onRendererStatus?.('fallback',e.message);}
 if(!gl){callbacks.onRendererStatus?.('fallback','WebGL tidak tersedia; mode gambar sederhana aktif.');return createFallbackRenderer(canvas,overlay,callbacks);}
 let shader,attrib,uniform,M;
 function initializeGPU(){
   shader=program(gl);gl.useProgram(shader);
   attrib={position:gl.getAttribLocation(shader,'aPos'),normal:gl.getAttribLocation(shader,'aNormal')};
   uniform={model:gl.getUniformLocation(shader,'uModel'),view:gl.getUniformLocation(shader,'uView'),projection:gl.getUniformLocation(shader,'uProjection'),color:gl.getUniformLocation(shader,'uColor'),alpha:gl.getUniformLocation(shader,'uAlpha')};
   M={box:mesh(cuboid()),sphere:mesh(sphere()),cylinder:mesh(cylinder())};
   gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
 }
 function useCanvasFallback(reason){
   if(alternative)return;
   stopped=true;if(frameId)cancelAnimationFrame(frameId);if(lossTimer)clearTimeout(lossTimer);
   const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);
   const originalWorld=world,originalSelection=selected,originalJoint=activeJoint;
   alternative=createFallbackRenderer(replacement,overlay,callbacks);
   alternative.setWorld(originalWorld);alternative.setSelected(originalSelection,originalJoint);alternative.setAxis(axis);alternative.setMode(mode);
   callbacks.onRendererStatus?.('fallback',reason||'WebGL gagal; mode 2D terproyeksi aktif.');
 }

 function mesh(m){const v=gl.createBuffer(),idx=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,v);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(m.vertices),gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,idx);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(m.indices),gl.STATIC_DRAW);return {v,idx,count:m.indices.length};}
 let world=null,selected=null,activeJoint=null,axis='flexion',mode='select';let sceneJoints={},projected=[];
 let alternative=null,stopped=false,lost=false,lossTimer=null,frameId=0,readyReported=false;
 try{initializeGPU();}catch(err){useCanvasFallback('Gagal memulai WebGL: '+err.message);return alternative;}
 canvas.addEventListener('webglcontextlost',event=>{
   event.preventDefault();lost=true;
   callbacks.onRendererStatus?.('recovering','Koneksi grafis terputus. Mencoba memulihkan...');
   lossTimer=setTimeout(()=>{if(lost&&!alternative)useCanvasFallback('GPU belum pulih; mode sederhana aktif.');},1800);
 });
 canvas.addEventListener('webglcontextrestored',()=>{
   if(alternative)return;
   if(lossTimer)clearTimeout(lossTimer);
   try{initializeGPU();lost=false;callbacks.onRendererStatus?.('ready','Grafis 3D dipulihkan.');}catch(err){useCanvasFallback('Gagal mengembalikan grafis: '+err.message);}
 });
 let baseDistance=cameraDefaultDistance(canvas);
 const camera={azimuth:.65,elevation:.45,distance:baseDistance,target:[-.35,1,0]};
 window.addEventListener('resize',()=>{const next=cameraDefaultDistance(canvas);camera.distance=clamp(camera.distance*next/baseDistance,2.1,16);baseDistance=next;});
 const input={pointers:new Map(),gesture:null};
 const project=p=>{const eye=[camera.target[0]+camera.distance*Math.cos(camera.elevation)*Math.sin(camera.azimuth),camera.target[1]+camera.distance*Math.sin(camera.elevation),camera.target[2]+camera.distance*Math.cos(camera.elevation)*Math.cos(camera.azimuth)];const view=lookAt(eye,camera.target),projection=perspective(rad(47),canvas.clientWidth/Math.max(1,canvas.clientHeight),.08,100);const m=multiply(projection,view);const x=m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],y=m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],z=m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14],w=m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];return {x:(x/w*.5+.5)*canvas.clientWidth,y:(-.5*y/w+.5)*canvas.clientHeight,z:z/w,visible:w>0};};
 const draw=(kind,m,hex,alpha=1)=>{const data=M[kind]||M.box;gl.bindBuffer(gl.ARRAY_BUFFER,data.v);gl.vertexAttribPointer(attrib.position,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(attrib.normal,3,gl.FLOAT,false,24,12);gl.enableVertexAttribArray(attrib.position);gl.enableVertexAttribArray(attrib.normal);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,data.idx);gl.uniformMatrix4fv(uniform.model,false,new Float32Array(m));gl.uniform3fv(uniform.color,strColor(hex));gl.uniform1f(uniform.alpha,alpha);gl.drawElements(gl.TRIANGLES,data.count,gl.UNSIGNED_SHORT,0);};
 function getEntityPosition(e,depth=0){if(!e.attachedTo||depth>3)return e.position;const target=world.scene.entities.find(x=>x.id===e.attachedTo);if(!target)return e.position;if(target.type==='character'){const j=sceneJoints[target.id]||characterSkeleton(target).joints;return attachmentPoint(j,e.anchor||'rightHand');}const blueprint=world.assets.find(a=>a.id===target.assetId);const anchor=blueprint?.anchors?.find(a=>a.id===e.anchor);return add(getEntityPosition(target,depth+1),anchor?.position||[0,.25,0]);}
 function renderFrame(){
   if(!world)return;
   const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),dpr=Math.min(window.devicePixelRatio||1,1.7);
   if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);gl.viewport(0,0,canvas.width,canvas.height);}
   gl.clearColor(.945,.945,.940,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   const eye=[camera.target[0]+camera.distance*Math.cos(camera.elevation)*Math.sin(camera.azimuth),camera.target[1]+camera.distance*Math.sin(camera.elevation),camera.target[2]+camera.distance*Math.cos(camera.elevation)*Math.cos(camera.azimuth)];
   gl.uniformMatrix4fv(uniform.view,false,new Float32Array(lookAt(eye,camera.target)));gl.uniformMatrix4fv(uniform.projection,false,new Float32Array(perspective(rad(47),w/h,.08,100)));
   const scene=world.scene;
   draw('box',chain(translate(0,-.075,0),scale(8,.15,7)),scene.environment?.floor||'#e9eeeb');
   if(scene.environment?.grid!==false){for(let i=-7;i<=7;i++){let x=i*.5;draw('box',chain(translate(x,.005,0),scale(.008,.005,6.9)),'#dce3e0');}for(let i=-6;i<=6;i++){let z=i*.5;draw('box',chain(translate(0,.005,z),scale(7.9,.005,.008)),'#dce3e0');}}
   sceneJoints={};projected=[];
   for(const e of scene.entities.filter(e=>e.type==='character')){
     const sk=characterSkeleton(e);sceneJoints[e.id]=sk.joints;
     const isSelected=selected===e.id,patient=e.role==='patient';const base=patient?'#d8a783':'#66ad99',jointColor=patient?'#c08d72':'#579e8c';
     draw('sphere',chain(translate(...sk.joints.hip),scale(.13,.13,.13)),base);
     draw('cylinder',between(sk.joints.hip,sk.joints.chest,.108),base);
     draw('cylinder',between(sk.joints.chest,sk.joints.neck,.075),base);
     draw('cylinder',between(sk.joints.neck,sk.joints.head,.07),base);
     draw('cylinder',between(sk.joints.leftShoulder,sk.joints.rightShoulder,.075),base);
     draw('sphere',chain(translate(...sk.joints.head),scale(.168,.175,.165)),patient?'#e9c9af':'#b2dbcb');
     for(const s of sk.segments){if(s.part==='torso'||s.part==='neck')continue;draw('cylinder',between(s.a,s.b,s.r),base);}
     for(const [name,p] of Object.entries(sk.joints)){
       if(name==='chest'||name==='neck'||name==='hip'||name==='head')continue;
       if(isSelected)draw('sphere',chain(translate(...p),scale(.078,.078,.078)),jointColor);
       if(isSelected&&['Shoulder','Elbow','Hip','Knee','Wrist','Ankle'].some(k=>name.endsWith(k))){const screen=project(p);projected.push({entityId:e.id,joint:name,screen,world:p});}
     }
     if(isSelected){for(const [joint,p] of [['neck',sk.joints.neck],['spine',sk.joints.chest]])projected.push({entityId:e.id,joint,screen:project(p),world:p});}for(const p of Object.values(sk.joints))projected.push({entityId:e.id,screen:project(p),world:p});
   }
   for(const e of scene.entities.filter(e=>e.type==='asset')){
     const asset=world.assets.find(a=>a.id===e.assetId);if(!asset)continue;
     const position=getEntityPosition(e);
     const base=chain(translate(...position),rotY(e.rotation?.[1]||0),rotX(e.rotation?.[0]||0),rotZ(e.rotation?.[2]||0));
     const visual=stateVisual(world,e,asset);for(const part of asset.parts){const size=part.size.map(v=>v*(visual.scale||1));draw(part.shape,chain(base,translate(...part.position),scale(...size)),visual.color||part.color);}
     projected.push({entityId:e.id,screen:project(position),world:position});
     if(selected===e.id){draw('sphere',chain(translate(...position),scale(.105,.105,.105)),'#2cbbc0',.85);}
   }
   renderMarkers();
 }
 function render(){
   if(stopped)return;
   frameId=requestAnimationFrame(render); // Always schedule the next frame—even if scene data has not loaded yet.
   if(lost||!world||document.hidden)return;
   try{renderFrame();if(!readyReported){readyReported=true;callbacks.onRendererStatus?.('ready','3D siap');}}
   catch(err){useCanvasFallback('Renderer WebGL gagal: '+err.message);callbacks.onRendererError?.(err);}
 }
 function renderMarkers(){const markers=projected.filter(p=>p.joint&&p.screen.visible&&p.screen.z<1);let map=new Map();for(const p of markers){const id=p.entityId+'-'+p.joint;let el=overlay.querySelector(`[data-marker="${id}"]`);if(!el){el=document.createElement('div');el.className='joint-marker';el.dataset.marker=id;overlay.append(el);}el.style.transform=`translate(${p.screen.x}px,${p.screen.y}px)`;el.classList.toggle('active',activeJoint===p.joint);map.set(id,1);}for(const el of overlay.children){if(!map.has(el.dataset.marker))el.remove();}}
 function nearest(x,y){const hits=projected.filter(p=>p.screen.visible&&p.screen.z<1).map(p=>({...p,dist:Math.hypot(p.screen.x-x,p.screen.y-y)})).filter(p=>p.dist<(p.joint?34:70));hits.sort((a,b)=>a.dist-b.dist);return hits[0]||null;}
 function eventPos(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 function rollbackGesture(g){if(!g?.origin||!world||!g.entityId)return;
   const ent=world.scene.entities.find(x=>x.id===g.entityId);if(!ent)return;
   if(g.kind==='joint'&&g.joint&&ent.pose[g.joint]){ent.pose[g.joint][axis]=g.origin.angle;callbacks.onPreviewJoint?.(g.entityId,g.joint,axis,g.origin.angle);}
   if(g.kind==='entity'){ent.position=[...g.origin.position];callbacks.onPreviewPosition?.(g.entityId,ent.position);}
 }
 const selectionChange=hit=>{if(hit){selected=hit.entityId;activeJoint=hit.joint||null;callbacks.onSelect?.(selected,activeJoint);}else {selected=null;activeJoint=null;callbacks.onSelect?.(null,null);}};
 canvas.addEventListener('pointerdown',e=>{
   canvas.setPointerCapture(e.pointerId);const pos=eventPos(e);input.pointers.set(e.pointerId,pos);
   if(input.pointers.size===1){const hit=nearest(pos.x,pos.y);const drag=hit&&((hit.joint&&mode!=='move')||(mode==='move'));if(hit)selectionChange(hit);input.gesture={kind:drag?(hit.joint?'joint':'entity'):'orbit',start:pos,last:pos,entityId:hit?.entityId,joint:hit?.joint,origin:null,moved:false};if(hit?.entityId&&world){const ent=world.scene.entities.find(x=>x.id===hit.entityId);input.gesture.origin=ent?{position:[...ent.position],angle:hit.joint?(ent.pose?.[hit.joint]?.[axis]||0):0}:null;}}
   else{rollbackGesture(input.gesture);const pts=[...input.pointers.values()];input.gesture={kind:'multitouch',distance:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),center:[(pts[0].x+pts[1].x)/2,(pts[0].y+pts[1].y)/2]};}
 });
 canvas.addEventListener('pointermove',e=>{
   if(!input.pointers.has(e.pointerId))return;const p=eventPos(e);input.pointers.set(e.pointerId,p);const g=input.gesture;if(!g)return;
   if(input.pointers.size>=2){const pts=[...input.pointers.values()],d=Math.max(10,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)),c=[(pts[0].x+pts[1].x)/2,(pts[0].y+pts[1].y)/2];if(g.kind!=='multitouch'){input.gesture={kind:'multitouch',distance:d,center:c};return;}camera.distance=clamp(camera.distance*g.distance/d,2.1,16);const panScale=camera.distance*.0017;camera.target[0]-=(c[0]-g.center[0])*panScale;camera.target[2]+=(c[1]-g.center[1])*panScale;g.distance=d;g.center=c;return;}
   if(g.kind==='multitouch')return;
   const dx=p.x-g.last.x,dy=p.y-g.last.y;if(Math.hypot(p.x-g.start.x,p.y-g.start.y)>4)g.moved=true;
   if(g.kind==='orbit'){camera.azimuth-=dx*.007;camera.elevation=clamp(camera.elevation+dy*.007,-.05,1.45);}
   if(g.kind==='joint'&&world&&g.entityId&&g.joint&&g.origin){const ent=world.scene.entities.find(x=>x.id===g.entityId);if(ent?.pose[g.joint]&&Object.hasOwn(ent.pose[g.joint],axis)){let value=clamp(g.origin.angle+(p.x-g.start.x)*.68-(p.y-g.start.y)*.22,-180,180);ent.pose[g.joint][axis]=Math.round(value);callbacks.onPreviewJoint?.(g.entityId,g.joint,axis,Math.round(value));}}
   if(g.kind==='entity'&&world&&mode==='move'&&g.entityId&&g.origin){const ent=world.scene.entities.find(x=>x.id===g.entityId);if(ent&&!ent.attachedTo){const sf=camera.distance*.0024,wx=((p.x-g.start.x)*Math.cos(camera.azimuth)+(p.y-g.start.y)*Math.sin(camera.azimuth))*sf,wz=(-(p.x-g.start.x)*Math.sin(camera.azimuth)+(p.y-g.start.y)*Math.cos(camera.azimuth))*sf;ent.position=[g.origin.position[0]+wx,g.origin.position[1],g.origin.position[2]+wz];callbacks.onPreviewPosition?.(ent.id,ent.position);}}
   g.last=p;
 });
 const finish=e=>{if(!input.pointers.has(e.pointerId))return;input.pointers.delete(e.pointerId);const g=input.gesture;if(e.type==='pointercancel'){rollbackGesture(g);input.gesture=null;return;}if(!input.pointers.size){if(g?.kind==='joint'&&g.moved&&world){const ent=world.scene.entities.find(x=>x.id===g.entityId);const value=ent?.pose[g.joint]?.[axis];if(typeof value==='number')callbacks.onCommitJoint?.(g.entityId,g.joint,axis,value);}
   if(g?.kind==='entity'&&mode==='move'&&g.moved&&world){const ent=world.scene.entities.find(x=>x.id===g.entityId);if(ent)callbacks.onCommitPosition?.(g.entityId,ent.position);}
   input.gesture=null;}
   else{input.gesture=null;}
 };
 canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
 canvas.addEventListener('wheel',e=>{e.preventDefault();camera.distance=clamp(camera.distance*(e.deltaY>0?1.09:.91),2.1,16);},{passive:false});
 frameId=requestAnimationFrame(render);
 return {setWorld(v){world=v;alternative?.setWorld(v);},setSelected(id,joint=null){selected=id;activeJoint=joint;alternative?.setSelected(id,joint);},setAxis(x){axis=x;alternative?.setAxis(x);},setMode(x){mode=x;alternative?.setMode(x);},resetCamera(){if(alternative)return alternative.resetCamera();Object.assign(camera,{azimuth:.65,elevation:.45,distance:cameraDefaultDistance(canvas),target:[-.35,1,0]});},focusEntity(id){if(alternative)return alternative.focusEntity(id);if(!world)return;const e=world.scene.entities.find(x=>x.id===id);if(!e)return;camera.target=[...e.position];camera.target[1]+=.9;camera.distance=3.6;},project(p){return alternative?alternative.project(p):project(p);},getJointWorld(id,name){return alternative?alternative.getJointWorld(id,name):sceneJoints[id]?.[name]||null;},getObjectWorldPosition(id){if(alternative)return alternative.getObjectWorldPosition(id);const e=world?.scene.entities.find(x=>x.id===id);return e?getEntityPosition(e):null;},getBackend(){return alternative?'canvas2d':'webgl';},stop(){stopped=true;cancelAnimationFrame(frameId);}};
}

// Graceful projected-3D Canvas fallback for devices that disable WebGL.
// The canonical scene remains 3D (XYZ + joint transforms), but visual quality is reduced.
function createFallbackRenderer(canvas,overlay,callbacks={}){
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Browser tidak menyediakan Canvas 2D/WebGL');
 let world=null,selected=null,activeJoint=null,axis='flexion',mode='select',projected=[],jointWorld={};
 let baseDistance=cameraDefaultDistance(canvas);
 const camera={azimuth:.65,elevation:.45,distance:baseDistance,target:[-.35,1,0]};
 window.addEventListener('resize',()=>{const next=cameraDefaultDistance(canvas);camera.distance=clamp(camera.distance*next/baseDistance,2.1,16);baseDistance=next;});
 const pointers=new Map();let gesture=null;
 const project=p=>{
   const w=canvas.clientWidth||1,h=canvas.clientHeight||1;
   const eye=[camera.target[0]+camera.distance*Math.cos(camera.elevation)*Math.sin(camera.azimuth),camera.target[1]+camera.distance*Math.sin(camera.elevation),camera.target[2]+camera.distance*Math.cos(camera.elevation)*Math.cos(camera.azimuth)];
   const m=multiply(perspective(rad(47),w/h,.08,100),lookAt(eye,camera.target));const x=m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],y=m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],z=m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14],ww=m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];return {x:(x/ww*.5+.5)*w,y:(-.5*y/ww+.5)*h,z:z/ww,visible:ww>0};
 };
 function line(a,b,width,color){const pa=project(a),pb=project(b);if(!pa.visible||!pb.visible)return;ctx.beginPath();ctx.lineWidth=width;ctx.strokeStyle=color;ctx.lineCap='round';ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);ctx.stroke();}
 function circle(p,r,color,outline=null){const q=project(p);if(!q.visible)return;const pixel=clamp(r*600/camera.distance,2,70);ctx.beginPath();ctx.arc(q.x,q.y,pixel,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();if(outline){ctx.lineWidth=2;ctx.strokeStyle=outline;ctx.stroke();}}
 function box3d(matrix,size,color){const corners=[];for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5])corners.push(project(pt(matrix,[x*size[0],y*size[1],z*size[2]])));
   for(const ids of [[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]]){if(ids.some(i=>!corners[i].visible))continue;ctx.beginPath();ctx.moveTo(corners[ids[0]].x,corners[ids[0]].y);for(const i of ids.slice(1))ctx.lineTo(corners[i].x,corners[i].y);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.lineWidth=.7;ctx.strokeStyle='#465c6524';ctx.stroke();}}
 function resolveWorld(e,depth=0){if(!e.attachedTo||depth>3)return e.position;const target=world.scene.entities.find(v=>v.id===e.attachedTo);if(!target)return e.position;if(target.type==='character'){const j=jointWorld[target.id]||characterSkeleton(target).joints;return attachmentPoint(j,e.anchor||'rightHand');}const blueprint=world.assets.find(a=>a.id===target.assetId);return add(resolveWorld(target,depth+1),blueprint?.anchors?.find(a=>a.id===e.anchor)?.position||[0,.2,0]);}
 function render(){if(world){const w=canvas.clientWidth||1,h=canvas.clientHeight||1,dpr=Math.min(window.devicePixelRatio||1,1.5);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#f0f0ee';ctx.fillRect(0,0,w,h);
   // A quiet perspective floor reads as 3D without a CAD-style grid.
   const floor=[[-4,0,-3.5],[4,0,-3.5],[4,0,3.5],[-4,0,3.5]].map(project);
   if(floor.every(x=>x.visible)){ctx.beginPath();ctx.moveTo(floor[0].x,floor[0].y);floor.slice(1).forEach(v=>ctx.lineTo(v.x,v.y));ctx.closePath();ctx.fillStyle=world.scene.environment?.floor||'#e9eeeb';ctx.fill();}
   if(world.scene.environment?.grid){ctx.globalAlpha=.3;for(let i=-8;i<=8;i++){line([i*.5,0,-3.5],[i*.5,0,3.5],.7,'#c9d8d2');line([-4,0,i*.4],[4,0,i*.4],.7,'#c9d8d2');}ctx.globalAlpha=1;}
   projected=[];jointWorld={};const entities=world.scene.entities;
   for(const e of entities.filter(e=>e.type==='character')){const sk=characterSkeleton(e);jointWorld[e.id]=sk.joints;const clr=e.role==='doctor'?'#62aa96':'#dca887',detail=e.role==='doctor'?'#4b8e7c':'#c18d73';
     for(const s of sk.segments){if(['torso','neck'].includes(s.part))continue;line(s.a,s.b,clamp(s.r*990/camera.distance,9,32),clr);}
     line(sk.joints.hip,sk.joints.chest,clamp(96/camera.distance,13,28),clr);
     line(sk.joints.chest,sk.joints.neck,clamp(68/camera.distance,9,19),clr);
     line(sk.joints.neck,sk.joints.head,clamp(70/camera.distance,9,19),clr);
     line(sk.joints.leftShoulder,sk.joints.rightShoulder,clamp(80/camera.distance,10,22),clr);
     circle(sk.joints.hip,.13,clr);circle(sk.joints.head,.20,e.role==='doctor'?'#b2dbcb':'#e9c9af',detail);
     for(const [j,p] of Object.entries(sk.joints)){
       if(['head','hip','chest','neck'].includes(j))continue;if(selected===e.id)circle(p,.038,detail);
       if(selected===e.id&&['Shoulder','Elbow','Hip','Knee','Wrist','Ankle'].some(part=>j.endsWith(part)))projected.push({entityId:e.id,joint:j,screen:project(p)});
     }
     if(selected===e.id){projected.push({entityId:e.id,joint:'neck',screen:project(sk.joints.neck)});projected.push({entityId:e.id,joint:'spine',screen:project(sk.joints.chest)});}
     for(const p of Object.values(sk.joints))projected.push({entityId:e.id,screen:project(p)});
   }
   for(const e of entities.filter(e=>e.type==='asset')){const asset=world.assets.find(a=>a.id===e.assetId);if(!asset)continue;const p=resolveWorld(e);const matrix=chain(translate(...p),rotY(e.rotation?.[1]||0));const visual=stateVisual(world,e,asset);for(const part of asset.parts){const at=pt(matrix,part.position),size=part.size.map(x=>x*(visual.scale||1)),clr=visual.color||part.color;if(part.shape==='box'){box3d(chain(matrix,translate(...part.position)),size,clr);}else if(part.shape==='sphere'){circle(at,Math.max(...size)*.55,clr);}else{line(pt(chain(matrix,translate(...part.position)),[0,-size[1]/2,0]),pt(chain(matrix,translate(...part.position)),[0,size[1]/2,0]),clamp(size[0]*180/camera.distance,3,28),clr);}}
     projected.push({entityId:e.id,screen:project(p)});if(selected===e.id)circle(p,.11,'#51d3c5','#187c88');
   }
   const known=new Set();for(const v of projected.filter(x=>x.joint&&x.screen.visible)){const id=v.entityId+'-'+v.joint;known.add(id);let el=[...overlay.children].find(el=>el.dataset.marker===id);if(!el){el=document.createElement('div');el.className='joint-marker';el.dataset.marker=id;overlay.append(el);}el.style.transform=`translate(${v.screen.x}px,${v.screen.y}px)`;el.classList.toggle('active',v.joint===activeJoint);}for(const el of [...overlay.children])if(!known.has(el.dataset.marker))el.remove();
 }
 requestAnimationFrame(render);}
 function rollback(g){if(!g||!world)return;const e=world.scene.entities.find(x=>x.id===g.hit?.entityId);if(!e)return;
   if(g.kind==='joint'&&g.hit?.joint&&e.pose?.[g.hit.joint]&&Number.isFinite(g.angle))e.pose[g.hit.joint][axis]=g.angle;
   if(g.kind==='move'&&g.position)e.position=[...g.position];
 }
 const evtP=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}};
 canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);const p=evtP(e);pointers.set(e.pointerId,p);if(pointers.size>1){rollback(gesture);const ps=[...pointers.values()];gesture={kind:'multi',dist:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),center:[(ps[0].x+ps[1].x)/2,(ps[0].y+ps[1].y)/2]};return;}
   const hit=projected.map(v=>({...v,d:Math.hypot(v.screen.x-p.x,v.screen.y-p.y)})).filter(v=>v.d<(v.joint?35:60)).sort((a,b)=>a.d-b.d)[0];if(hit){selected=hit.entityId;activeJoint=hit.joint||null;callbacks.onSelect?.(selected,activeJoint);}
   const entity=world?.scene.entities.find(x=>x.id===hit?.entityId);gesture={kind:hit&&hit.joint?'joint':hit&&mode==='move'?'move':'orbit',hit,start:p,last:p,moved:false,angle:entity?.pose[hit?.joint]?.[axis]||0,position:entity?[...entity.position]:null};
 });
 canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const p=evtP(e);pointers.set(e.pointerId,p);if(!gesture)return;if(pointers.size>1){const ps=[...pointers.values()],d=Math.max(10,Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y)),c=[(ps[0].x+ps[1].x)/2,(ps[0].y+ps[1].y)/2];if(gesture.kind!=='multi'){gesture={kind:'multi',dist:d,center:c};return;}camera.distance=clamp(camera.distance*gesture.dist/d,2.1,16);gesture.dist=d;camera.target[0]-=(c[0]-gesture.center[0])*camera.distance*.0017;camera.target[2]+=(c[1]-gesture.center[1])*camera.distance*.0017;gesture.center=c;return;}
   const g=gesture;g.moved=g.moved||Math.hypot(p.x-g.start.x,p.y-g.start.y)>4;if(g.kind==='orbit'){camera.azimuth-=(p.x-g.last.x)*.007;camera.elevation=clamp(camera.elevation+(p.y-g.last.y)*.007,-.05,1.45);}else if(g.kind==='joint'){const h=g.hit;const entity=world.scene.entities.find(x=>x.id===h.entityId);if(entity?.pose[h.joint]&&Object.hasOwn(entity.pose[h.joint],axis))entity.pose[h.joint][axis]=Math.round(clamp(g.angle+(p.x-g.start.x)*.68-(p.y-g.start.y)*.22,-180,180));}else if(g.kind==='move'){const entity=world.scene.entities.find(x=>x.id===g.hit.entityId);if(entity&&!entity.attachedTo){const sf=camera.distance*.0024;entity.position=[g.position[0]+((p.x-g.start.x)*Math.cos(camera.azimuth)+(p.y-g.start.y)*Math.sin(camera.azimuth))*sf,g.position[1],g.position[2]+(-(p.x-g.start.x)*Math.sin(camera.azimuth)+(p.y-g.start.y)*Math.cos(camera.azimuth))*sf];}}g.last=p;
 });
 const finish=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);const g=gesture;if(e.type==='pointercancel'){rollback(g);gesture=null;return;}if(!pointers.size&&g?.moved){if(g.kind==='joint'){const h=g.hit,entity=world.scene.entities.find(x=>x.id===h.entityId),a=entity?.pose[h.joint]?.[axis];if(typeof a==='number')callbacks.onCommitJoint?.(h.entityId,h.joint,axis,a);}else if(g.kind==='move'){const entity=world.scene.entities.find(x=>x.id===g.hit.entityId);if(entity)callbacks.onCommitPosition?.(entity.id,entity.position);}}gesture=null;};
 canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);canvas.addEventListener('wheel',e=>{e.preventDefault();camera.distance=clamp(camera.distance*(e.deltaY>0?1.09:.91),2.1,16);},{passive:false});
 requestAnimationFrame(render);
 return {setWorld(v){world=v;},setSelected(id,joint=null){selected=id;activeJoint=joint;},setAxis(v){axis=v;},setMode(v){mode=v;},resetCamera(){Object.assign(camera,{azimuth:.65,elevation:.45,distance:cameraDefaultDistance(canvas),target:[-.35,1,0]});},focusEntity(id){const e=world?.scene.entities.find(x=>x.id===id);if(!e)return;camera.target=add(e.position,[0,.9,0]);camera.distance=3.5;},project,getJointWorld(id,name){return jointWorld[id]?.[name]||null;},getObjectWorldPosition(id){const e=world?.scene.entities.find(x=>x.id===id);return e?resolveWorld(e):null;},getBackend(){return 'canvas2d';},stop(){/* fallback loop uses visibility throttling */}};
}
