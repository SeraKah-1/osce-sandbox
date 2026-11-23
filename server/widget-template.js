export const WIDGET_URI='ui://osce-playground/studio.html';
// One source of truth for UI: the website and ChatGPT MCP App share the same HTML,
// stylesheet, renderer, interaction logic and feedback system.
export function renderWidget(index, stylesheet, renderer, app){
 const css=stylesheet.replace(/<\/style/gi,'<\\/style');
 const graphics=renderer.replaceAll('export function ','function ');
 const ui=app.replace(/^import \{createRenderer\} from '\.\/render3d\.js';\s*/,'');
 const js=("window.__OSCE_EMBEDDED__=true;\n"+graphics+'\n'+ui).replace(/<\/script/gi,'<\\/script');
 return index.replace(/<link rel="stylesheet" href="\/styles\.css">/,()=>'<style>'+css+'</style>')
   .replace(/<link rel="manifest" href="\/manifest\.webmanifest">/,'')
   .replace(/<link rel="icon"[^>]*>/,'')
   .replace(/<script type="module" src="\/app\.js"><\/script>/,()=>'<script>'+js+'</script>');
}
