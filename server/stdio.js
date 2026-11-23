// Dependency-free MCP stdio adapter for a LOCAL ChatGPT/desktop MCP client.
// Reads one JSON-RPC message per line and prints one response per line.
import readline from 'node:readline';
import path from 'node:path';
import {makeStudio} from './core.js';
import {rpc} from './mcp.js';
const store=makeStudio(process.env.STUDIO_DATA||path.resolve('data','studio.json'));
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on('line',line=>{try{const output=rpc(store,JSON.parse(line));if(output)process.stdout.write(JSON.stringify(output)+'\n');}catch(e){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:e.message}})+'\n');}});
