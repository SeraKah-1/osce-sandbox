import {WIDGET_URI} from './widget-template.js';
import {SceneError} from './studio.js';
const obj = (properties={}, required=[]) => ({type:'object',properties,required,additionalProperties:false});
const str = (description='') => ({type:'string',description});
const integer = (description='') => ({type:'integer',description});
const vec = {type:'array',items:{type:'number'},minItems:3,maxItems:3,description:'[x,y,z] koordinat dunia dalam meter (atau radian untuk rotasi)'};
export const toolsList = [
  {name:'open_studio',description:'Open the fully interactive 3D OSCE Sandbox Studio directly in ChatGPT. Shows the current shared scene and controls for joints, assets, states and scenario.',inputSchema:obj({environmentId:str('Optional saved environment ID to open') }),_meta:{ui:{resourceUri:WIDGET_URI},'openai/outputTemplate':WIDGET_URI}},
  {name:'get_world_state',description:'Read the complete current OSCE scene, including entity IDs, joint poses, assets, behaviors and revision. Call before editing.',inputSchema:obj()},
  {name:'get_asset_catalog',description:'List available built-in and AI-created equipment asset blueprints.',inputSchema:obj()},
  {name:'list_templates',description:'List OSCE scenario templates and pose presets.',inputSchema:obj()},
  {name:'apply_scene_operations',description:'Atomically modify the world. place_character automatically seats/lays a puppet on an asset affordance; place_asset rests equipment on an asset surface. Supports moving/rotating all movable furnishings. Operations: spawn_asset, spawn_character, move_entity, rotate_entity, set_mechanism, place_character, place_asset, set_joint, apply_pose, attach, detach, trigger_action, set_scenario, set_scenario_details, complete_step, uncomplete_step, set_environment, rename_scene, delete_entity. Use the freshest baseRevision to prevent overwrite; all operations validate before commit.',inputSchema:obj({baseRevision:integer('Scene revision read from get_world_state'),operationId:str('Optional stable unique id for safe retries; reuse only for the exact same operation'),operations:{type:'array',items:{type:'object',additionalProperties:true},minItems:1,maxItems:50}},['baseRevision','operations'])},
  {name:'preview_scene_operations',description:'Validate a proposed batch and return an accurate temporary scene diff (added, removed, modified) without mutating persistent state. Use before major AI edits; apply separately at the same baseRevision.',inputSchema:obj({baseRevision:integer('Revision read from get_world_state'),operations:{type:'array',items:{type:'object',additionalProperties:true},minItems:1,maxItems:50}},['baseRevision','operations'])},
  {name:'create_asset',description:'Create an AI-defined articulated 3D prop with named parts, local rotations, tube paths, and optional mechanisms (hinge, dial, slider, button) linked to controllable partIds. Mechanisms have pivot/axis/ranges/initial, optional linked drives and min/max triggers. Anchors may follow moving parts. Optional learning steps validate real mechanical and spatial state (including contact, orientation, and hold duration). All validated; no arbitrary code.',inputSchema:obj({id:str('Unique kebab-case ID'),name:str('Readable name'),category:str(),description:str(),parts:{type:'array',items:obj({id:str('Required for controllable parts'),shape:{type:'string',enum:['box','sphere','cylinder','capsule','cone','torus','tube']},position:vec,rotation:vec,size:vec,color:str('Hex #RRGGBB'),points:{type:'array',minItems:2,maxItems:25,items:vec}},['shape','position','size','color'])},mechanisms:{type:'array',maxItems:24,items:obj({id:str(),label:str(),kind:{type:'string',enum:['hinge','dial','slider','button']},partIds:{type:'array',items:{type:'string'},minItems:1},parentId:str('Optional mechanism ID for nested assembly'),pivot:vec,axis:vec,min:{type:'number'},max:{type:'number'},initial:{type:'number'},triggers:obj({min:str('Behavior action at minimum'),max:str('Behavior action at maximum')}),drives:{type:'array',maxItems:12,items:obj({mechanismId:str('ID of driven mechanism'),ratio:{type:'number'},offset:{type:'number'}},['mechanismId','ratio'])}},['id','label','kind','partIds','pivot','axis','min','max','initial'])},anchors:{type:'array',items:obj({id:str(),position:vec,partId:str('Optional 3D part ID; the anchor follows its actual mechanism')},['id','position'])},behaviorId:str('Existing behavior ID; create_behavior first'),movable:{type:'boolean',description:'Whether this object can be dragged and rotated; defaults to true'},affordances:{type:'array',maxItems:12,items:obj({id:str(),kind:{type:'string',enum:['seat','bed','surface']},anchor:str('Existing anchor ID'),radius:{type:'number'},pose:{type:'string',enum:['standing','sitting','lying']},yawOffset:{type:'number'},heightOffset:{type:'number'},halfExtents:{type:'array',items:{type:'number'},minItems:2,maxItems:2}},['id','kind','anchor'])},parameters:{type:'object',description:'Up to 20 initial key-value properties, number/boolean/short text',additionalProperties:true},learning:obj({title:str('Training title'),note:str('Honest scope of the simulation'),steps:{type:'array',minItems:1,maxItems:12,items:obj({id:str(),instruction:str(),condition:{type:'object',description:'mechanism_range / distance / contact / orientation / hold. Validated by engine, no arbitrary JS.',additionalProperties:true}},['id','instruction','condition'])}},['title','steps'])},['id','name','parts'])},
  {name:'create_behavior',description:'Create an instrument finite-state behavior. Optional transition when guards (eq/gte/lte), effects (attach/detach/move/set_parameter/adjust_parameter), state-based visuals. No arbitrary JavaScript.',inputSchema:obj({id:str(),name:str(),states:{type:'array',items:{type:'string'}},initial:str(),transitions:{type:'array',items:obj({from:str(),action:str(),to:str(),label:str(),when:{type:'array',items:obj({key:str(),operator:{type:'string',enum:['eq','gte','lte']},value:{}},['key','operator','value'])},effects:{type:'array',items:{type:'object',additionalProperties:true}}},['from','action','to','label'])},visuals:{type:'object',additionalProperties:true}},['id','name','states','initial','transitions'])},
  {name:'update_asset',description:'Revise a custom-created 3D asset (built-ins immutable); increments blueprint version.',inputSchema:obj({id:str(),changes:{type:'object',additionalProperties:true}},['id','changes'])},
  {name:'update_behavior',description:'Revise a custom-created behavior; increments version.',inputSchema:obj({id:str(),changes:{type:'object',additionalProperties:true}},['id','changes'])},
  {name:'test_behavior',description:'Simulate an action sequence without modifying the world. Returns state history or validation error.',inputSchema:obj({behaviorId:str(),actions:{type:'array',items:{type:'string'}}},['behaviorId','actions'])},
  {name:'validate_asset',description:'Validate a new 3D equipment blueprint without saving it.',inputSchema:obj({asset:{type:'object',additionalProperties:true}},['asset'])},
  {name:'validate_behavior',description:'Validate an equipment behavior state machine without saving.',inputSchema:obj({behavior:{type:'object',additionalProperties:true}},['behavior'])},
  {name:'undo_scene',description:'Undo the last scene update. This modifies the shared scene.',inputSchema:obj()},
  {name:'redo_scene',description:'Redo a previously undone scene update.',inputSchema:obj()},
  {name:'get_execution_log',description:'Read recent successful changes and revisions.',inputSchema:obj()},
  {name:'create_environment',description:'Create a durable named environment (world blueprint) and automatically save it. Optional scene operations build its initial arrangement. Optionally attach it to a tablet sessionId; subsequent MCP edits on that session auto-save while manual touches remain temporary.',inputSchema:obj({name:str('Environment name'),operations:{type:'array',items:{type:'object',additionalProperties:true},maxItems:50},sessionId:str('Optional tablet session to activate this saved world')},['name'])},
  {name:'list_environments',description:'List persistent environments that ChatGPT created, including IDs, names, and saved revisions.',inputSchema:obj()},
  {name:'get_environment',description:'Read a saved environment and its complete snapshot without opening a tablet session.',inputSchema:obj({environmentId:str('Saved environment ID')},['environmentId'])},
  {name:'load_environment',description:'Load a saved environment into a tablet/ChatGPT studio session. Uses provided sessionId or creates a fresh session.',inputSchema:obj({environmentId:str('Saved environment ID'),sessionId:str('Optional existing session')},['environmentId']),_meta:{ui:{resourceUri:WIDGET_URI},'openai/outputTemplate':WIDGET_URI}},
  {name:'rename_environment',description:'Rename a persistent environment; automatically save the metadata.',inputSchema:obj({environmentId:str(),name:str()},['environmentId','name'])},
  {name:'delete_environment',description:'Permanently delete an environment and its saved scene. Requires confirmed=true; does not delete active temporary tablet scene.',inputSchema:obj({environmentId:str(),confirmed:{type:'boolean'}},['environmentId','confirmed'])},
  {name:'undo_environment',description:'Permanently undo the last saved MCP edit to a named environment. Optionally reopen that blueprint in one tablet session; manual pose adjustments in that session will reset.',inputSchema:obj({environmentId:str(),sessionId:str()},['environmentId'])},
  {name:'redo_environment',description:'Permanently redo a saved environment edit previously undone. Optionally reopen the changed blueprint in one tablet session.',inputSchema:obj({environmentId:str(),sessionId:str()},['environmentId'])},
  {name:'reset_world',description:'Destructive reset of scene to initial setup. Requires explicit confirmation flag.',inputSchema:obj({confirmed:{type:'boolean'}},['confirmed'])}
];
const readOnlyTools=new Set(['open_studio','get_world_state','get_asset_catalog','list_templates','preview_scene_operations','test_behavior','validate_asset','validate_behavior','get_execution_log','list_environments','get_environment']);
const additiveTools=new Set(['create_asset','create_behavior','create_environment']);
export const environmentMutations=new Set(['apply_scene_operations','create_asset','create_behavior','update_asset','update_behavior','reset_world']);
for (const tool of toolsList) {
  tool.inputSchema.properties.sessionId=str('Active temporary session ID from open_studio or the tablet. Omit on open_studio to begin a fresh session.');
  if(tool.name!=='open_studio'&&!tool.name.endsWith('_environment')&&tool.name!=='list_environments')tool.inputSchema.required.push('sessionId');
  if(environmentMutations.has(tool.name))tool.inputSchema.properties.saveToEnvironment={type:'boolean',description:'Default true. Set false for temporary changes made through direct controls.'};
  const readOnly=readOnlyTools.has(tool.name);
  tool.annotations={readOnlyHint:readOnly,openWorldHint:false,...(readOnly?{}:{destructiveHint:!additiveTools.has(tool.name)})};
}
export function sessionState(studio){
  return {sessionId:studio.sessionId,environmentId:studio.environmentId??null,environmentRevision:studio.environmentRevision??null,...studio.snapshot()};
}
export function normalizeSceneArgs(args,seed){
  if(!Array.isArray(args.operations))return args;
  const id=(prefix,index)=>prefix+'-'+(seed?seed.slice(0,32)+'-'+index:crypto.randomUUID().replaceAll('-',''));
  const operations=args.operations.map((op,index)=>{
    if(['spawn_asset','spawn_character'].includes(op?.type)&&!op.id)return {...op,id:id('entity',index)};
    if(op?.type==='set_scenario_details'&&op.scenario&&!op.scenario.id)return {...op,scenario:{...op.scenario,id:id('scenario',index)}};
    return op;
  });
  return {...args,operations};
}
export function callSceneTool(studio,name,args={}){
  switch(name){
    case 'open_studio':return {...sessionState(studio),studioVersion:'1.1.0',widgetResource:WIDGET_URI};
    case 'get_world_state':return sessionState(studio);
    case 'get_asset_catalog':return {assets:studio.assets,behaviors:studio.behaviors};
    case 'list_templates':return {templates:studio.snapshot().templates,poses:studio.snapshot().poses};
    case 'preview_scene_operations':return studio.preview(args.operations,args.baseRevision);
    case 'apply_scene_operations':return studio.apply(args.operations,args.baseRevision,args.operationId??null);
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
    if(method==='server/discover')return {jsonrpc:'2.0',id,result:{supportedVersions:['2026-07-28'],capabilities:{tools:{},resources:{}},serverInfo:{name:'osce-sandbox-studio',version:'1.1.0'}}};
    if(method==='initialize')return {jsonrpc:'2.0',id,result:{protocolVersion:['2025-03-26','2025-06-18','2025-11-25'].includes(params.protocolVersion)?params.protocolVersion:'2025-11-25',capabilities:{tools:{listChanged:false},resources:{listChanged:false}},serverInfo:{name:'osce-sandbox-studio',version:'1.1.0'},instructions:'Tablet-first OSCE sandbox. You can create/edit equipment geometry and finite-state behavior without writing arbitrary code. Read world state first, preview major changes with preview_scene_operations, then commit using the current baseRevision. Create, load and delete saved environments with the environment tools. Editing a loaded environment through MCP saves those edits unless saveToEnvironment is false. Clinical output is demonstrative.'}};
    if(method==='ping')return {jsonrpc:'2.0',id,result:{}};
    if(method==='tools/list')return {jsonrpc:'2.0',id,result:{tools:toolsList}};
    if(method==='resources/list')return {jsonrpc:'2.0',id,result:{resources:[{uri:WIDGET_URI,name:'OSCE Sandbox Studio',title:'Interactive 3D OSCE Sandbox',mimeType:'text/html;profile=mcp-app'}]}};
    if(method==='resources/read'){if(![WIDGET_URI,'ui://osce-sandbox-studio/interactive.html'].includes(params.uri))return {jsonrpc:'2.0',id,error:{code:-32602,message:'Unknown UI resource'}};return {jsonrpc:'2.0',id,result:{contents:[{uri:params.uri,mimeType:'text/html;profile=mcp-app',text:widgetHTML(),_meta:{ui:{prefersBorder:false}}}]}};}
    if(method==='prompts/list')return {jsonrpc:'2.0',id,result:{prompts:[]}};
    if(method==='tools/call'){
      const args=params.arguments||{};
      const studio=typeof resolveStudio==='function'?resolveStudio(args.sessionId,params.name==='open_studio'):resolveStudio;
      const value=callSceneTool(studio,params.name,args);
      return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:typeof value==='object'&&value!==null&&!Array.isArray(value)?value:{result:value},isError:false,_meta:params.name==='open_studio'?{ui:{resourceUri:WIDGET_URI}}:undefined}};
    }
    return {jsonrpc:'2.0',id,error:{code:-32601,message:`Method '${method}' not found`}};
  }catch(e){return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify({error:e.message,code:e.code||'INTERNAL_ERROR'})}],isError:true}};}
}
