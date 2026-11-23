// Optional local MCP JSON-RPC transport: one request per input line.
// Stdio and HTTPS use the exact same session isolation and durable environment library.
// This newline transport is useful for simple desktop test clients, NOT a substitute
// for HTTP MCP or a framed Content-Length transport expected by older clients.
import readline from 'node:readline';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SessionWorlds} from './sessions.js';
import {EnvironmentLibrary} from './environments.js';
import {SceneError} from './core.js';
import {rpc} from './mcp.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=process.env.ENVIRONMENT_DATA_DIR||path.join(root,'data','environments');
const library=new EnvironmentLibrary({directory});
const worlds=new SessionWorlds();
function resolveStudio(id,createForOpen){
  if(!id){
    if(createForOpen)return worlds.get(worlds.create().sessionId);
    throw new SceneError('sessionId wajib ditentukan. Buka studio dahulu.','SESSION_REQUIRED',400);
  }
  return worlds.get(id);
}
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on('line',line=>{
  let response;
  try{response=rpc(resolveStudio,JSON.parse(line),{worlds,library});}
  catch(e){response={jsonrpc:'2.0',id:null,error:{code:-32700,message:e.message}};}
  if(response!==null)process.stdout.write(JSON.stringify(response)+'\n');
});
