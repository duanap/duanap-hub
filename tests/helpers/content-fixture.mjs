import http from 'node:http'
if(process.env.HUB_CONTENT_FIXTURE!=='1')throw Error('Explicit loopback fixture required')
let mode='normal',calls=0,privateHeaders=false,release
const origin='http://127.0.0.1:1033'
const article=(id,category,date='2026-01-01T00:00:00')=>({id,status:'publish',link:origin+'/'+id+'.html',title:{rendered:'文章 '+id+' &amp; <b>标题</b>'},excerpt:{rendered:'<p>公开摘要 '+id+' &hellip;</p><script>DO_NOT_RENDER_SCRIPT</script>',protected:false},date_gmt:date,categories:[category],featured_media:11})
http.createServer(async(req,res)=>{
  const url=new URL(req.url,origin),json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value))}
  if(url.pathname==='/health')return json({fixture:true})
  if(url.pathname==='/__fixture/control'){
    const chunks=[];for await(const part of req)chunks.push(part);const p=JSON.parse(Buffer.concat(chunks).toString()||'{}')
    if(p.release){release?.();release=undefined;return json({released:true})}
    mode=p.mode||'normal';calls=0;privateHeaders=false;return json({ok:true})
  }
  if(url.pathname==='/__fixture/stats')return json({calls,privateHeaders,mode})
  if(!url.pathname.startsWith('/wp-json/wp/v2/'))return json({error:'not_found'},404)
  calls++;privateHeaders ||= !!(req.headers.cookie||req.headers.authorization)
  if(mode==='unavailable')return json({error:'offline'},503)
  if(mode==='redirect'){res.writeHead(302,{Location:'http://127.0.0.1:1/private'});return res.end()}
  if(mode==='oversize'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('['+' '.repeat(600_000)+']')}
  if(mode==='hang')await new Promise(resolve=>setTimeout(resolve,5000))
  if(url.pathname.endsWith('/posts')){
    if(mode==='hold')await new Promise(resolve=>{release=resolve})
    if(mode==='malformed')return json({unexpected:true})
    if(mode==='empty')return json([])
    const first=article(1,3),second=article(2,4,'2026-02-01T00:00:00')
    if(mode==='bad-link')first.link='javascript:alert(1)'
    if(mode==='bad-date')first.date_gmt='2026-02-30T00:00:00'
    if(mode==='many-categories')first.categories=Array.from({length:101},(_,i)=>i+1)
    return json([first,second,{...article(3,3),excerpt:{rendered:'PROTECTED_MUST_NOT_LEAK',protected:true}},{...article(4,3),status:'draft',title:{rendered:'DRAFT_MUST_NOT_LEAK'}},{...article(5,3,'2099-01-01T00:00:00'),title:{rendered:'FUTURE_MUST_NOT_LEAK'}}])
  }
  if(url.pathname.endsWith('/categories'))return json([{id:3,name:'技术 &amp; 实践',link:origin+'/tech'},{id:4,name:'生活',link:origin+'/life'}])
  return json([{id:11,source_url:origin+'/wp-content/uploads/test.png',media_details:{sizes:{medium:{source_url:origin+'/wp-content/uploads/medium.png'}}}}])
}).listen(1033,'127.0.0.1')
