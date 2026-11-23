import test from 'node:test';import assert from 'node:assert/strict';
import {widgetHTML} from '../server/widget.js';
import {toolsList} from '../server/mcp.js';
import {EnvironmentLibrary} from '../server/environments.js';
test('embedded 3D view exports both rotation marker and direct-touch handler',()=>{
 const html=widgetHTML();assert.match(html,/const \{installDirectTouch,rotationHandle\}=/);
 assert.match(html,/function rotationHandle\(/);
 assert.match(html,/className='rotation-marker'/);
 assert.match(html,/getRotationSelection:/);
 assert.ok(html.includes('Environment dari GPT'));
});
test('MCP declares persistent environment creation, deletion, reading and durable history',()=>{
 for(const name of ['create_environment','list_environments','get_environment','load_environment','rename_environment','delete_environment','undo_environment','redo_environment'])
  assert.ok(toolsList.some(t=>t.name===name),name);
});
