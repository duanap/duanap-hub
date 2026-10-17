// Register only implemented routes. Additional tools ship through normal code deployment.
export const REGISTERED_TOOLS = [{ id: 'password', path: '/tools/password', available: true },{id:'convert',path:'/tools/convert',available:true},{id:'ip',path:'/tools/ip',available:true}] as const
export type ToolId=typeof REGISTERED_TOOLS[number]['id']
export type ToolSettings={id:ToolId;enabled:boolean;title:string;description:string;seoTitle:string;seoDescription:string;help:string}
