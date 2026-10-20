import http from 'node:http'
if(process.env.HUB_GITHUB_FIXTURE!=='1')throw Error('Explicit fixture required')
let mode='normal',calls=0,privateHeaders=false,release
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:1034'),json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value))}
 if(u.pathname==='/health')return json({fixture:true})
 if(u.pathname==='/__fixture/control'){const parts=[];for await(const p of req)parts.push(p);const v=JSON.parse(Buffer.concat(parts).toString()||'{}');if(v.release){release?.();release=undefined;return json({released:true})}mode=v.mode||'normal';calls=0;privateHeaders=false;return json({ok:true})}
 if(u.pathname==='/__fixture/stats')return json({calls,privateHeaders})
 calls++;privateHeaders ||= !!(req.headers.cookie||req.headers.authorization)
 if(mode==='fail')return json({message:'rate limit'},403)
 if(mode==='redirect'){res.writeHead(302,{Location:'http://127.0.0.1:1/private'});return res.end()}
 if(mode==='hang')await new Promise(r=>setTimeout(r,6000))
 if(mode==='huge'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('['+' '.repeat(150000)+']')}
 const name=u.pathname.split('/').slice(2,4).join('/'),url='https://github.com/'+name
 if(u.pathname.endsWith('/tags'))return json([{name:'v1.2.3'}])
 if(u.pathname.endsWith('/releases'))return json(mode==='empty-release'?[]:[{draft:false,tag_name:'v1.2.3',html_url:url+'/releases/tag/v1.2.3',published_at:'2026-01-01T00:00:00Z'}])
 if(mode==='hold')await new Promise(r=>{release=r})
 return json({private:mode==='private',full_name:name,html_url:mode==='wrong-url'?'https://evil.invalid/':url,description:'公开仓库样例',stargazers_count:17,forks_count:3,pushed_at:'2026-01-02T00:00:00Z',secret:'MUST_NOT_LEAK'})
}).listen(1034,'127.0.0.1')
