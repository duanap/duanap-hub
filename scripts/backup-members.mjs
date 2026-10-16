import { chmodSync, copyFileSync, existsSync, lstatSync, unlinkSync, constants } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import Database from 'better-sqlite3'

const args=new Map()
for(let i=2;i<process.argv.length;i++){const key=process.argv[i];if(['--data-dir','--output'].includes(key))args.set(key,process.argv[++i]);else throw Error('未知参数')}
if(!args.has('--data-dir')||!args.has('--output'))throw Error('用法：node scripts/backup-members.mjs --data-dir DATA_DIR --output PRIVATE_MEMBERS_BACKUP.sqlite')
const directory=path.resolve(args.get('--data-dir')),source=path.join(directory,'members.sqlite'),output=path.resolve(args.get('--output')),parent=path.dirname(output)
const inside=(root,value)=>{const relative=path.relative(root,value);return relative===''||(!relative.startsWith('..')&&!path.isAbsolute(relative))}
if(!existsSync(directory)||lstatSync(directory).isSymbolicLink()||inside(directory,output)||!existsSync(source)||lstatSync(source).isSymbolicLink()||!existsSync(parent)||lstatSync(parent).isSymbolicLink()||existsSync(output))throw Error('账号库备份路径无效或目标已存在')
const temporary=path.join(parent,'.members-backup-'+randomUUID()+'.sqlite')
let sourceDb,copy
try{
  sourceDb=new Database(source,{readonly:true,fileMustExist:true});await sourceDb.backup(temporary);sourceDb.close();sourceDb=null
  copy=new Database(temporary)
  if(Number(copy.pragma('user_version',{simple:true}))!==1)throw Error('账号库版本不受支持')
  const required=['members','member_qq','member_blogs','member_sessions','member_flows','member_attempts'],tables=(copy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()).map(row=>row.name)
  if(required.some(name=>!tables.includes(name))||tables.some(name=>!required.includes(name))||copy.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('trigger','view') LIMIT 1").get()||!(copy.pragma('table_info(member_blogs)')).some(column=>column.name==='authorized')||!(copy.pragma('table_info(member_sessions)')).some(column=>column.name==='verified_at'))throw Error('账号库结构不完整或包含未知表')
  if(lstatSync(source).size>32*1024*1024)throw Error('账号库超过32MB备份上限')
  const integrity=copy.pragma('integrity_check',{simple:true});if(integrity!=='ok')throw Error('账号库完整性检查失败')
  copy.pragma('journal_mode=DELETE');copy.pragma('secure_delete=ON')
  copy.transaction(()=>{copy.exec("DELETE FROM member_sessions;DELETE FROM member_flows;DELETE FROM member_attempts;UPDATE member_blogs SET authorized=0,payload='';")})()
  copy.exec('VACUUM')
  if(copy.pragma('integrity_check',{simple:true})!=='ok')throw Error('清理后的账号库检查失败')
  copy.close();copy=null
  chmodSync(temporary,0o600);copyFileSync(temporary,output,constants.COPYFILE_EXCL);unlinkSync(temporary);chmodSync(output,0o600)
  process.stdout.write(JSON.stringify({created:true,privateFile:output,sessionsIncluded:false,blogTokensIncluded:false,accountsIncluded:true})+'\n')
}catch(error){copy?.close();sourceDb?.close();if(existsSync(temporary))unlinkSync(temporary);throw error}
