import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import Database from 'better-sqlite3'

const args=new Map()
for(let i=2;i<process.argv.length;i++){const key=process.argv[i];if(key==='--confirm-restore')args.set(key,true);else if(['--data-dir','--input'].includes(key))args.set(key,process.argv[++i]);else throw Error('未知参数')}
if(!args.get('--confirm-restore')||!args.has('--data-dir')||!args.has('--input'))throw Error('用法：先停止主站，再运行 node scripts/restore-members.mjs --input PRIVATE_MEMBERS_BACKUP.sqlite --data-dir DATA_DIR --confirm-restore')
const directory=path.resolve(args.get('--data-dir')),input=path.resolve(args.get('--input')),target=path.join(directory,'members.sqlite')
const within=name=>{const file=path.resolve(directory,name),relative=path.relative(directory,file);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('账号恢复路径越界');return file}
const regular=file=>{if(existsSync(file)&&lstatSync(file).isSymbolicLink())throw Error('恢复不允许符号链接')}
const alive=pid=>{if(!Number.isInteger(pid)||pid<1)throw Error('进程锁无效');try{process.kill(pid,0);return true}catch(error){return error.code!=='ESRCH'}}
if(!existsSync(directory)||lstatSync(directory).isSymbolicLink()||!existsSync(input)||lstatSync(input).isSymbolicLink()||path.relative(directory,input)===''||!path.relative(directory,input).startsWith('..')||lstatSync(input).size>32*1024*1024)throw Error('私有备份路径无效，或备份超过32MB')
const runtime=within('.hub-runtime.lock'),maintenance=within('.hub-maintenance.lock'),lease=JSON.stringify({pid:process.pid}),staged=within('.members-restore-'+randomUUID()+'.sqlite'),rollback=within('members-rollback-'+randomUUID()+'.sqlite')
let owns=false,source,copy,replaced=false
try{
  regular(runtime);regular(maintenance);regular(target);regular(within('members.sqlite-wal'));regular(within('members.sqlite-shm'))
  if(existsSync(maintenance)){const before=readFileSync(maintenance,'utf8');if(alive(JSON.parse(before).pid)||readFileSync(maintenance,'utf8')!==before)throw Error('另一恢复任务正在运行');unlinkSync(maintenance)}
  writeFileSync(maintenance,lease,{flag:'wx',mode:0o600});owns=true
  if(existsSync(runtime)){const before=readFileSync(runtime,'utf8');if(alive(JSON.parse(before).pid)||readFileSync(runtime,'utf8')!==before)throw Error('请先停止主站应用');unlinkSync(runtime)}
  source=new Database(input,{readonly:true,fileMustExist:true})
  const required=['members','member_qq','member_blogs','member_sessions','member_flows','member_attempts'],tables=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name)
  if(Number(source.pragma('user_version',{simple:true}))!==1||required.some(name=>!tables.includes(name))||tables.some(name=>!required.includes(name))||source.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('trigger','view') LIMIT 1").get()||!(source.pragma('table_info(member_blogs)')).some(column=>column.name==='authorized')||!(source.pragma('table_info(member_sessions)')).some(column=>column.name==='verified_at')||source.pragma('integrity_check',{simple:true})!=='ok')throw Error('账号备份损坏或结构不受支持')
  await source.backup(staged);source.close();source=null
  copy=new Database(staged);copy.pragma('journal_mode=DELETE');copy.pragma('secure_delete=ON')
  copy.transaction(()=>copy.exec("DELETE FROM member_sessions;DELETE FROM member_flows;DELETE FROM member_attempts;UPDATE member_blogs SET authorized=0,payload='';"))()
  copy.exec('VACUUM');if(copy.pragma('integrity_check',{simple:true})!=='ok')throw Error('待恢复账号库未通过校验')
  copy.close();copy=null
  if(existsSync(target))renameSync(target,rollback)
  try{renameSync(staged,target);replaced=true;chmodSync(target,0o600)}catch(error){if(existsSync(rollback)&&!existsSync(target))renameSync(rollback,target);throw error}
  for(const file of ['members.sqlite-wal','members.sqlite-shm'])if(existsSync(within(file)))unlinkSync(within(file))
  process.stdout.write(JSON.stringify({restored:true,oldIdentityBackup:existsSync(rollback),sessionsRestored:false,blogTokensRestored:false,blogLinksRequireReauthorization:true})+'\n')
}catch(error){copy?.close();source?.close();if(existsSync(staged))unlinkSync(staged);throw error}
finally{if(owns&&existsSync(maintenance)&&readFileSync(maintenance,'utf8')===lease)unlinkSync(maintenance)}
