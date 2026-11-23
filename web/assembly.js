// Data-only articulated equipment assembly. No arbitrary code is evaluated.
// All transforms use Three.js-compatible column-major matrices.
const rad=n=>n*Math.PI/180;
export const I=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export const mul=(a,b)=>{const o=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;};
export const tr=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
export const sc=(x,y,z)=>[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1];
export const rx=a=>[1,0,0,0,0,Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1];
export const ry=a=>[Math.cos(a),0,-Math.sin(a),0,0,1,0,0,-Math.sin(a),0,Math.cos(a),0,0,0,0,1];
export const rz=a=>[Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1,0,0,0,0,1];
export const chain=(...ms)=>ms.reduce((a,b)=>mul(a,b),I());
export const transformPoint=(m,p=[0,0,0])=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const norm=axis=>{const d=Math.hypot(...axis)||1;return axis.map(v=>v/d);};
export function axisRotation(axis,angle){const [x,y,z]=norm(axis),c=Math.cos(angle),s=Math.sin(angle),t=1-c;return [t*x*x+c,t*x*y+s*z,t*x*z-s*y,0,t*x*y-s*z,t*y*y+c,t*y*z+s*x,0,t*x*z+s*y,t*y*z-s*x,t*z*z+c,0,0,0,0,1];}
export function mechanismValue(asset,entity,id){const m=(asset.mechanisms||[]).find(m=>m.id===id);return entity.controls?.[id]??m?.initial??0;}
// A component can inherit another component. At most 24 definitions, cycles are rejected by the backend.
export function mechanismMatrix(asset,entity,id,stack=new Set()){
 const m=(asset.mechanisms||[]).find(x=>x.id===id);if(!m||stack.has(id))return I();
 const value=mechanismValue(asset,entity,id);const axis=m.axis||[0,1,0],pivot=m.pivot||[0,0,0];
 const action=(m.kind==='slider'||m.kind==='button')?tr(...axis.map(v=>v*value)):
   axisRotation(axis,rad(value));
 const local=chain(tr(...pivot),action,tr(...pivot.map(n=>-n)));
 if(!m.parentId)return local;
 stack.add(id);return mul(mechanismMatrix(asset,entity,m.parentId,stack),local);
}
export function partMatrix(asset,entity,part){
 const matrix=chain(tr(...part.position),rx(part.rotation?.[0]||0),ry(part.rotation?.[1]||0),rz(part.rotation?.[2]||0));
 const m=(asset.mechanisms||[]).find(m=>m.partIds.includes(part.id));
 return m?mul(mechanismMatrix(asset,entity,m.id),matrix):matrix;
}
export function assemblyRoot(entity,position=entity.position){return chain(tr(...position),ry(entity.rotation?.[1]||0),rx(entity.rotation?.[0]||0),rz(entity.rotation?.[2]||0));}
export function mechanismHandle(asset,entity,mechanism,position=entity.position){
 const first=asset.parts.find(p=>mechanism.partIds.includes(p.id));
 const local=first?transformPoint(partMatrix(asset,entity,first),[0,0,0]):transformPoint(mechanismMatrix(asset,entity,mechanism.id),mechanism.pivot);
 return transformPoint(assemblyRoot(entity,position),local);
}
export function mechanismNextValue(mechanism,current,delta){
 if(mechanism.kind==='button')return current===mechanism.max?mechanism.min:mechanism.max;
 const raw=current+delta;
 return Math.max(mechanism.min,Math.min(mechanism.max,raw));
}
