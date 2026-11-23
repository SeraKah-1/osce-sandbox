import {WIDGET_URI} from './widget-template.js';
import {SceneError} from './studio.js';
const obj = (properties={}, required=[]) => ({type:'object',properties,required,additionalProperties:false});
const str = (description='') => ({type:'string',description});
const integer = (description='') => ({type:'integer',description});
const vec = {type:'array',items:{type:'number'},minItems:3,maxItems:3,description:'[x,y,z] koordinat dunia dalam meter (atau radian untuk rotasi)'};
export const toolsList = [
  {name:'open_studio',description:'Open the fully interactive 3D OSCE Playground directly in ChatGPT. Starts a temporary session, or opens the supplied session from the tablet. Use its session ID for subsequent calls.',inputSchema:obj(),_meta:{ui:{resourceUri:WIDGET_URI},'openai/outputTemplate':WIDGET_URI}},
  {name:'get_world_state',description:'Read the complete current OSCE scene, including entity IDs, joint poses, assets, behaviors and revision. Call before editing.',inputSchema:obj()},
  {name:'get_asset_catalog',description:'List available built-in and AI-created equipment asset blueprints.',inputSchema:obj()},
  {name:'list_templates',description:'List OSCE scenario templates and pose presets.',inputSchema:obj()},
  {name:'apply_scene_operations',description:'Atomically modify the world: spawn_asset, spawn_character, move_entity, rotate_entity, set_joint, apply_pose, attach, detach, trigger_action, set_scenario, set_scenario_details, complete_step, uncomplete_step, set_environment, rename_scene, delete_entity. Use the freshest baseRevision to prevent overwrite; all operations validate before commit.',inputSchema:obj({baseRevision:integer('Scene revision read from get_world_state'),operations:{type:'array',items:{type:'object',additionalProperties:true},minItems:1,maxItems:50}},['baseRevision','operations'])},
  {name:'preview_scene_operations',description:'Validate a proposed batch and return an accurate temporary scene diff (added, removed, modified) without mutating persistent state. Use before major AI edits; apply separately at the same baseRevision.',inputSchema:obj({baseRevision:integer('Revision read from get_world_state'),operations:{type:'array',items:{type:'object',additionalProperties:true},minItems:1,maxItems:50}},['baseRevision','operations'])},
  {name:'create_asset',description:'Create a reusable procedural 3D equipment blueprint from box/sphere/cylinder parts; no code execution. Supply an ID, name, parts and optional anchor/behaviorId.',inputSchema:obj({id:str('Unique kebab-case ID'),name:str('Readable name'),category:str(),description:str(),parts:{type:'array',items:obj({shape:{type:'string',enum:['box','sphere','cylinder']},position:vec,size:vec,color:str('Hex #RRGGBB')},['shape','position','size','color'])},anchors:{type:'array',items:obj({id:str(),position:vec},['id','position'])},behaviorId:str('Existing behavior ID; create_behavior first')},['id','name','parts'])},
  {name:'create_behavior',description:'Create a reusable safe finite-state behavior for an instrument: declared states, transitions, optional effects (attach/detach/move) and visuals per state (color/scale). Never arbitrary JS.',inputSchema:obj({id:str(),name:str(),states:{type:'array',items:{type:'string'}},initial:str(),transitions:{type:'array',items:obj({from:str(),action:str(),to:str(),label:str(),effects:{type:'array',items:{type:'object',additionalProperties:true}}},['from','action','to','label'])},visuals:{type:'object',additionalProperties:true}},['id','name','states','initial','transitions'])},
  {name:'update_asset',description:'Revise a custom-created 3D asset (built-ins immutable); increments blueprint version.',inputSchema:obj({id:str(),changes:{type:'object',additionalProperties:true}},['id','changes'])},
  {name:'update_behavior',description:'Revise a custom-created behavior; increments version.',inputSchema:obj({id:str(),changes:{type:'object',additionalProperties:true}},['id','changes'])},
  {name:'test_behavior',description:'Simulate an action sequence without modifying the world. Returns state history or validation error.',inputSchema:obj({behaviorId:str(),actions:{type:'array',items:{type:'string'}}},['behaviorId','actions'])},
  {name:'validate_asset',description:'Validate a new 3D equipment blueprint without saving it.',inputSchema:obj({asset:{type:'object',additionalProperties:true}},['asset'])},
  {name:'validate_behavior',description:'Validate an equipment behavior state machine without saving.',inputSchema:obj({behavior:{type:'object',additionalProperties:true}},['behavior'])},
  {name:'undo_scene',description:'Undo the last scene update. This modifies the current scene.',inputSchema:obj()},
  {name:'redo_scene',description:'Redo a previously undone scene update.',inputSchema:obj()},
  {name:'get_execution_log',description:'Read recent successful changes and revisions.',inputSchema:obj()},
  {name:'reset_world',description:'Destructive reset of scene to initial setup. Requires explicit confirmation flag.',inputSchema:obj({confirmed:{type:'boolean'}},['confirmed'])}
];
const readOnlyTools=new Set(['open_studio','get_world_state','get_asset_catalog','list_templates','preview_scene_operations','test_behavior','validate_asset','validate_behavior','get_execution_log']);
const additiveTools=new Set(['create_asset','create_behavior']);
for (const tool of toolsList) {
  tool.inputSchema.properties.sessionId=str('Active temporary session ID from open_studio or the tablet. Omit on open_studio to begin a fresh session.');
  if(tool.name!=='open_studio')tool.inputSchema.required.push('sessionId');
  const readOnly=readOnlyTools.has(tool.name);
  tool.annotations={readOnlyHint:readOnly,openWorldHint:false,...(readOnly?{}:{destructiveHint:!additiveTools.has(tool.name)})};
}
function call(studio,name,args={}){
  switch(name){
    case 'open_studio':return {sessionId:studio.sessionId,...studio.snapshot(),studioVersion:'0.6.0',widgetResource:WIDGET_URI};
    case 'get_world_state':return {sessionId:studio.sessionId,...studio.snapshot()};
    case 'get_asset_catalog':return {assets:studio.assets,behaviors:studio.behaviors};
    case 'list_templates':return {templates:studio.snapshot().templates,poses:studio.snapshot().poses};
    case 'preview_scene_operations':return studio.preview(args.operations,args.baseRevision);
    case 'apply_scene_operations':return studio.apply(args.operations,args.baseRevision);
    case 'create_asset':return studio.createAsset(args);
    case 'create_behavior':return studio.createBehavior(args);
    case 'update_asset':return studio.updateAsset(args.id,args.changes);
    case 'update_behavior':return studio.updateBehavior(args.id,args.changes);
    case 'test_behavior':return studio.validateBehaviorTest(args.behaviorId,args.actions);
    case 'validate_asset':return studio.validateAssetDraft(args.asset);
    case 'validate_behavior':return studio.validateBehaviorDraft(args.behavior);
    case 'undo_scene':return studio.historyMove('undo');
    case 'redo_scene':return studio.historyMove('redo');
    case 'get_execution_log':return studio.log;
    case 'reset_world':if(args.confirmed!==true)throw new SceneError('Reset butuh confirmed=true');return studio.reset();
    default:throw new SceneError('Unknown tool: '+name,'NOT_FOUND');
  }
}
export function rpc(resolveStudio,body,widgetHTML){
  if(!body||body.jsonrpc!=='2.0'||!body.method)return {jsonrpc:'2.0',id:body?.id??null,error:{code:-32600,message:'Invalid JSON-RPC request'}};
  const {id,method,params={}}=body;
  if(id===undefined)return null; // notification
  try{
    if(method==='server/discover')return {jsonrpc:'2.0',id,result:{supportedVersions:['2026-07-28'],capabilities:{tools:{},resources:{}},serverInfo:{name:'osce-sandbox-studio',version:'0.6.0'}}};
    if(method==='initialize')return {jsonrpc:'2.0',id,result:{protocolVersion:['2025-03-26','2025-06-18','2025-11-25'].includes(params.protocolVersion)?params.protocolVersion:'2025-11-25',capabilities:{tools:{listChanged:false},resources:{listChanged:false}},serverInfo:{name:'osce-sandbox-studio',version:'0.6.0'},instructions:'Tablet-first OSCE sandbox. You can create/edit equipment geometry and finite-state behavior without writing arbitrary code. Read world state first, preview major changes with preview_scene_operations, then commit using the current baseRevision. Clinical output is demonstrative, not validated clinical simulation.'}};
    if(method==='ping')return {jsonrpc:'2.0',id,result:{}};
    if(method==='tools/list')return {jsonrpc:'2.0',id,result:{tools:toolsList}};
    if(method==='resources/list')return {jsonrpc:'2.0',id,result:{resources:[{uri:WIDGET_URI,name:'OSCE Sandbox Studio',title:'Interactive 3D OSCE Sandbox',mimeType:'text/html;profile=mcp-app'}]}};
    if(method==='resources/read'){if(![WIDGET_URI,'ui://osce-sandbox-studio/interactive.html'].includes(params.uri))return {jsonrpc:'2.0',id,error:{code:-32602,message:'Unknown UI resource'}};return {jsonrpc:'2.0',id,result:{contents:[{uri:params.uri,mimeType:'text/html;profile=mcp-app',text:widgetHTML(),_meta:{ui:{prefersBorder:false}}}]}};}
    if(method==='prompts/list')return {jsonrpc:'2.0',id,result:{prompts:[]}};
    if(method==='tools/call'){
      const args=params.arguments||{};
      const studio=typeof resolveStudio==='function'?resolveStudio(args.sessionId,params.name==='open_studio'):resolveStudio;
      const value=call(studio,params.name,args);
      return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:typeof value==='object'&&value!==null&&!Array.isArray(value)?value:{result:value},isError:false,_meta:params.name==='open_studio'?{ui:{resourceUri:WIDGET_URI}}:undefined}};
    }
    return {jsonrpc:'2.0',id,error:{code:-32601,message:`Method '${method}' not found`}};
  }catch(e){return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify({error:e.message,code:e.code||'INTERNAL_ERROR'})}],isError:true}};}
}
