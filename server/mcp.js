import {widgetHTML} from './widget.js';
import {rpc as dispatch} from './mcp-protocol.js';
export {toolsList} from './mcp-protocol.js';
export function rpc(studio,body){return dispatch(studio,body,widgetHTML);}
