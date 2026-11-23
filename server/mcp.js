import crypto from 'node:crypto';
import {WIDGET_URI,widgetHTML} from './widget.js';
import {SceneError} from './core.js';
import {toolsList,callSceneTool as call,environmentMutations,normalizeSceneArgs} from './mcp-protocol.js';
export {toolsList};
export function rpc(resolveStudio,body,services={}){
  if(!body||body.jsonrpc!=='2.0'||!body.method)return {jsonrpc:'2.0',id:body?.id??null,error:{code:-32600,message:'Invalid JSON-RPC request'}};
  const {id,method,params={}}=body;
  if(id===undefined)return null; // notification
  try{
    if(method==='initialize')return {jsonrpc:'2.0',id,result:{protocolVersion:'2025-11-25',capabilities:{tools:{listChanged:false},resources:{listChanged:false}},serverInfo:{name:'osce-sandbox-studio',version:'0.9.0'},instructions:'Create persistent AI-built environments with create_environment. Their edits through MCP auto-save to a durable named library; use list_environments, get_environment, load_environment and delete_environment. User gestures remain temporary and never auto-save. Require explicit sessionId for all world tool calls other than open_studio; never use a global session fallback. Read current scene and revision before edits. Preview large batches. Articulated tools use validated declarative geometry/behavior, never arbitrary code. This is a sandbox, not a medically validated physiological simulation.'}};
    if(method==='ping')return {jsonrpc:'2.0',id,result:{}};
    if(method==='tools/list')return {jsonrpc:'2.0',id,result:{tools:toolsList}};
    if(method==='resources/list')return {jsonrpc:'2.0',id,result:{resources:[{uri:WIDGET_URI,name:'OSCE Sandbox Studio',title:'Interactive 3D OSCE Sandbox',mimeType:'text/html;profile=mcp-app'}]}};
    if(method==='resources/read'){if(params.uri!==WIDGET_URI)return {jsonrpc:'2.0',id,error:{code:-32602,message:'Unknown UI resource'}};return {jsonrpc:'2.0',id,result:{contents:[{uri:WIDGET_URI,mimeType:'text/html;profile=mcp-app',text:widgetHTML(),_meta:{ui:{prefersBorder:false}}}]}};}
    if(method==='prompts/list')return {jsonrpc:'2.0',id,result:{prompts:[]}};
    if(method==='tools/call'){
      const args=params.arguments||{},name=params.name;
      const library=services.library;
      const needLibrary=()=>{if(!library)throw new SceneError('Persistent environment service unavailable','STORAGE_UNAVAILABLE',503);return library;};
      let value;
      if(name==='list_environments')value={environments:needLibrary().list()};
      else if(name==='get_environment')value=needLibrary().get(args.environmentId,{withSnapshot:true});
      else if(name==='rename_environment'){
        const saved=needLibrary().rename(args.environmentId,args.name);
        for(const item of services.worlds?.sessions?.values()||[])if(item.studio.environmentId===args.environmentId)item.studio.environmentRevision=saved.revision;
        value={environment:saved,saved:true};
      }
      else if(name==='undo_environment'||name==='redo_environment'){
        const saved=needLibrary().history(args.environmentId,name==='undo_environment'?'undo':'redo');
        value=args.sessionId?needLibrary().attach(resolveStudio(args.sessionId,false),saved.id):{environment:saved,saved:true};
      }
      else if(name==='delete_environment'){
        value=needLibrary().delete(args.environmentId,{confirmed:args.confirmed});
        for(const item of services.worlds?.sessions?.values()||[]){if(item.studio.environmentId===args.environmentId){item.studio.environmentId=null;item.studio.environmentRevision=null;item.studio.scene.revision++;item.studio.emit({label:'environment_deleted',revision:item.studio.scene.revision});}}
      }
      else if(name==='create_environment'){
        const saved=needLibrary().create({name:args.name,operations:args.operations||[]});
        if(args.sessionId){const live=resolveStudio(args.sessionId,false);value=library.attach(live,saved.id);}
        else value={environment:saved,saved:true};
      }
      else if(name==='load_environment'){
        const live=resolveStudio(args.sessionId, !args.sessionId);
        value=needLibrary().attach(live,args.environmentId);
      }
      else{
        const live=typeof resolveStudio==='function'?resolveStudio(args.sessionId,name==='open_studio'):resolveStudio;
        if(name==='open_studio'&&args.environmentId){value=needLibrary().attach(live,args.environmentId);}
        else if(library&&args.saveToEnvironment!==false&&environmentMutations.has(name)){
          const normalized=normalizeSceneArgs(args);
          value=library.mutate(live,(candidate,source)=>call(candidate,name,name==='apply_scene_operations'&&source==='baseline'?{...normalized,baseRevision:candidate.scene.revision}:normalized));
        }else value=call(live,name,args);
      }
      return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:typeof value==='object'&&value!==null&&!Array.isArray(value)?value:{result:value},isError:false,_meta:['open_studio','load_environment'].includes(params.name)?{ui:{resourceUri:WIDGET_URI}}:undefined}};
    }
    return {jsonrpc:'2.0',id,error:{code:-32601,message:`Method '${method}' not found`}};
  }catch(e){return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify({error:e.message,code:e.code||'INTERNAL_ERROR'})}],isError:true}};}
}
