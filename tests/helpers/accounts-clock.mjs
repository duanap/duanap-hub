// Test-process-only clock control, never an HTTP hook or a production import.
import { existsSync,readFileSync } from 'node:fs'
import path from 'node:path'
const file=process.env.HUB_TEST_ACCOUNTS_CLOCKFILE,NativeDate=Date
if(!file||process.env.HUB_ACCOUNTS_ALLOW_LOOPBACK!=='1'||path.dirname(file)!==process.env.HUB_DATA_DIR)throw new Error('Explicit isolated clock fixture required')
function clock(){if(!existsSync(file))return NativeDate.now();const value=Number(readFileSync(file,'utf8'));if(!Number.isSafeInteger(value))throw new Error('Invalid fixture clock');return value}
globalThis.Date=new Proxy(NativeDate,{
  construct(target,args){return Reflect.construct(target,args.length?args:[clock()])},
  apply(){return new NativeDate(clock()).toString()},
  get(target,name){return name==='now'?clock:Reflect.get(target,name)},
})
