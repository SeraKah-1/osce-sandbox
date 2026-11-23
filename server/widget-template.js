export const WIDGET_URI='ui://osce-playground/studio.html';
const unexport=source=>source.replaceAll('export function ','function ').replaceAll('export const ','const ');
// The web editor and MCP App share one renderer, touch engine and solver.
// Independent IIFEs prevent internal const collisions in a single inline script.
export function renderWidget(assets){
 const index=assets['index.html'];
 const css=assets['styles.css'].replace(/<\/style/gi,'<\\/style');
 const assembly=`const __assembly=(()=>{${unexport(assets['assembly.js'])}\nreturn {partMatrix,assemblyRoot,mechanismHandle,mechanismNextValue,transformPoint};})();`;
 const ik=`const __ik3d=(()=>{${unexport(assets['ik3d.js'])}\nreturn {solveTwoBone3D,limbSpec,choosePole,screenRay,projectedDragTarget,intersectRayPlane,add3,sub3};})();`;
 const placement=`const __placement=(()=>{${unexport(assets['placement.js'])}\nreturn {placementCandidate,characterPlacementCandidate,affordancesFor,reflowSupported};})();`;
 const touchSource=unexport(assets['touch-pose.js']).replace(/^import .*?;\s*/gm,'');
 const touch=`const {installDirectTouch}=(()=>{const {solveTwoBone3D,limbSpec,choosePole,screenRay,projectedDragTarget,intersectRayPlane,add3,sub3}=__ik3d;const {placementCandidate,characterPlacementCandidate,affordancesFor,reflowSupported}=__placement;const {mechanismHandle,mechanismNextValue}=__assembly;\n${touchSource}\nreturn {installDirectTouch};})();`;
 const graphics='const {partMatrix,assemblyRoot,mechanismHandle,transformPoint}=__assembly;\n'+unexport(assets['render3d.js']).replace(/^import .*?;\s*/gm,'');
 const ui=assets['app.js'].replace(/^import \{createRenderer\} from '\.\/render3d\.js';\s*/,'');
 const js=("window.__OSCE_EMBEDDED__=true;\n"+assembly+'\n'+ik+'\n'+placement+'\n'+touch+'\n'+graphics+'\n'+ui).replace(/<\/script/gi,'<\\/script');
 return index.replace(/<link rel="stylesheet" href="\/styles\.css">/,()=>'<style>'+css+'</style>')
  .replace(/<link rel="manifest" href="\/manifest\.webmanifest">/,'')
  .replace(/<link rel="icon"[^>]*>/,'')
  .replace(/<script type="module" src="\/app\.js"><\/script>/,()=>'<script>'+js+'</script>');
}
