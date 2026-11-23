// Analytic, length-preserving 3D two-bone IK. No camera, DOM or network calls.
// Angles are authored in the existing rig's local joint axes (degrees).
const EPS=1e-7;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rad=d=>d*Math.PI/180,deg=r=>r*180/Math.PI;
export const add3=(a,b)=>a.map((n,i)=>n+b[i]);
export const sub3=(a,b)=>a.map((n,i)=>n-b[i]);
export const scale3=(a,n)=>a.map(v=>v*n);
export const dot3=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
export const len3=a=>Math.hypot(...a);
export const unit3=a=>scale3(a,1/(len3(a)||1));
export const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const rx=(v,a)=>[v[0],v[1]*Math.cos(a)-v[2]*Math.sin(a),v[1]*Math.sin(a)+v[2]*Math.cos(a)];
const rz=(v,a)=>[v[0]*Math.cos(a)-v[1]*Math.sin(a),v[0]*Math.sin(a)+v[1]*Math.cos(a),v[2]];
// Column-major matrix; base carries the parent rotation and translation.
const forward=(m,v)=>[m[0]*v[0]+m[4]*v[1]+m[8]*v[2],m[1]*v[0]+m[5]*v[1]+m[9]*v[2],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]];
const inverse=(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[4]*v[0]+m[5]*v[1]+m[6]*v[2],m[8]*v[0]+m[9]*v[1]+m[10]*v[2]];
const finite3=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const angleNear=(angle,old)=>{let x=angle;while(x-old>180)x-=360;while(x-old< -180)x+=360;return x;};
const range={shoulder:{flexion:[-150,170],abduction:[-165,165]},hip:{flexion:[-135,95],abduction:[-75,75]}};
const limit=(v,[a,b])=>clamp(v,a,b);
export function limbSpec(entity,side,limb,skeleton){
 const sk=skeleton(entity),arm=limb==='arm';
 const root=side+(arm?'Shoulder':'Hip'),mid=side+(arm?'Elbow':'Knee'),end=side+(arm?'Wrist':'Ankle');
 const j=sk.joints;return {sk,root,mid,end,base:arm?sk.spine:sk.root,
  A:j[root],B:j[mid],C:j[end],l1:len3(sub3(j[mid],j[root])),l2:len3(sub3(j[end],j[mid]))};
}
export function choosePole(spec){
 const axis=unit3(sub3(spec.C,spec.A));
 const old=sub3(spec.B,spec.A);let pole=sub3(old,scale3(axis,dot3(old,axis)));
 if(len3(pole)<.035){
  // Positive local Z makes the default elbow/knee bend forward with +flexion.
  pole=forward(spec.base,[0,0,1]);pole=sub3(pole,scale3(axis,dot3(pole,axis)));
 }
 if(len3(pole)<EPS){pole=cross3(axis,[1,0,0]);if(len3(pole)<EPS)pole=cross3(axis,[0,1,0]);}
 return unit3(pole);
}
function shoulderFromDirection(entity,spec,desired){
 const upper=unit3(inverse(spec.base,desired));const key=spec.root;
 const current=entity.pose[key];const oldFlex=current.flexion||0,oldAbd=current.abduction||0;
 const alpha=deg(Math.asin(clamp(upper[0],-1,1)));
 const phi=deg(Math.atan2(-upper[2],-upper[1]));
 // Both Euler branches represent the same upper-bone direction. Prefer the
 // current one to avoid sudden flips at overhead poses.
 const candidates=[[alpha,phi],[alpha>=0?180-alpha:-180-alpha,phi+180]];
 const domain=key.endsWith('Shoulder')?range.shoulder:range.hip;
 const ranked=candidates.map(([a,f])=>{
  a=angleNear(a,oldAbd);f=angleNear(f,oldFlex);
  const ca=limit(a,domain.abduction),cf=limit(f,domain.flexion);
  return {a:ca,f:cf,score:Math.abs(a-ca)*10+Math.abs(f-cf)*10+Math.abs(ca-oldAbd)*.02+Math.abs(cf-oldFlex)*.02};
 }).sort((a,b)=>a.score-b.score);
 current.abduction=ranked[0].a;current.flexion=ranked[0].f;
 return current;
}
export function solveTwoBone3D({entity,side,limb,target,skeleton,pole,targetPoint='end'}){
 if(!finite3(target)||!['left','right'].includes(side)||!['arm','leg'].includes(limb))throw Error('Target IK tidak valid');
 const spec=limbSpec(entity,side,limb,skeleton);
 if(!spec.l1||!spec.l2)throw Error('Rig karakter tidak valid');
 let direction=sub3(target,spec.A),d=len3(direction);
 if(d<EPS)direction=unit3(sub3(spec.C,spec.A));else direction=scale3(direction,1/d);
 if(len3(direction)<EPS)direction=[0,-1,0];
 const constrained=targetPoint==='middle'?spec.l1:clamp(d,Math.abs(spec.l1-spec.l2)+.003,spec.l1+spec.l2-.001);
 let elbow;
 if(targetPoint==='middle')elbow=add3(spec.A,scale3(direction,constrained));
 else{
  const axial=(spec.l1**2-spec.l2**2+constrained**2)/(2*constrained);
  const radial=Math.sqrt(Math.max(0,spec.l1**2-axial**2));
  let p=pole||choosePole(spec);p=sub3(p,scale3(direction,dot3(p,direction)));
  if(len3(p)<EPS){p=cross3(direction,[0,0,1]);if(len3(p)<EPS)p=cross3(direction,[1,0,0]);}
  elbow=add3(add3(spec.A,scale3(direction,axial)),scale3(unit3(p),radial));
 }
 const upper=unit3(sub3(elbow,spec.A));
 const rotation=shoulderFromDirection(entity,spec,upper);
 if(targetPoint!=='middle'){
  const final=add3(spec.A,scale3(direction,constrained));
  const lower=unit3(sub3(final,elbow));
  const baseLower=inverse(spec.base,lower);
  const temp=rz(rx(baseLower,-rad(rotation.flexion)),-rad(rotation.abduction));
  const transverse=Math.hypot(temp[0],temp[2]);
  let twist=transverse>EPS?deg(Math.atan2(-temp[0],-temp[2])):(rotation.rotation||0);
  twist=angleNear(twist,rotation.rotation||0);
  rotation.rotation=limit(twist,[-180,180]);
  const mid=entity.pose[spec.mid];
  mid.flexion=limit(deg(Math.atan2(transverse,-temp[1])),[-8,155]);
  if(Object.hasOwn(mid,'rotation'))mid.rotation=0;
 }
 const result=skeleton(entity).joints[targetPoint==='middle'?spec.mid:spec.end];
 return {error:len3(sub3(result,target)),reached:result,constrained:d>spec.l1+spec.l2||d<Math.abs(spec.l1-spec.l2),
  changes:[[spec.root,'flexion'],[spec.root,'abduction'],[spec.root,'rotation'],[spec.mid,'flexion'],[spec.mid,'rotation']]
  .filter(([j,a])=>Number.isFinite(entity.pose[j]?.[a])).map(([joint,axis])=>({joint,axis,angle:Math.round(entity.pose[joint][axis]*100)/100}))};
}

// Screen to world ray, matching the renderer's perspective camera.
export function screenRay({pointer,camera,width,height}){
 const w=Math.max(width||1,1),h=Math.max(height||1,1),az=camera.azimuth,el=camera.elevation;
 const eye=add3(camera.target,scale3([Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az)],camera.distance));
 const front=unit3(sub3(camera.target,eye));const right=unit3(cross3(front,[0,1,0]));const up=cross3(right,front);
 const ratio=Math.tan(47*Math.PI/360),nx=(pointer.x/w*2-1)*ratio*w/h,ny=(1-pointer.y/h*2)*ratio;
 return {origin:eye,direction:unit3(add3(front,add3(scale3(right,nx),scale3(up,ny)))),front};
}
export function intersectRayPlane(ray,planePoint,planeNormal){
 const n=unit3(planeNormal);const denom=dot3(ray.direction,n);
 if(Math.abs(denom)<1e-5)return null;
 const t=dot3(sub3(planePoint,ray.origin),n)/denom;
 return t>=0&&Number.isFinite(t)?add3(ray.origin,scale3(ray.direction,t)):null;
}
export function projectedDragTarget({initial,current,worldPoint,camera,width,height,normal}){
 const start=screenRay({pointer:initial,camera,width,height}),now=screenRay({pointer:current,camera,width,height});
 const planeNormal=normal||start.front;
 const p0=intersectRayPlane(start,worldPoint,planeNormal),p1=intersectRayPlane(now,worldPoint,planeNormal);
 return p0&&p1?add3(worldPoint,sub3(p1,p0)):[...worldPoint];
}
