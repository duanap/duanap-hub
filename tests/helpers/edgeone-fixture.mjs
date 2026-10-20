import http from 'node:http'
import {createHash,createHmac} from 'node:crypto'
if(process.env.HUB_EDGEONE_FIXTURE!=='1')throw Error('Explicit fixture required')
let mode='normal',calls=0,valid=true,held=[]
const hash=v=>createHash('sha256').update(v).digest('hex'),hmac=(k,v)=>createHmac('sha256',k).update(v).digest()
http.createServer(async(req,res)=>{
 const json=(v,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(v))}
 if(req.url==='/health')return json({fixture:true})
 if(req.url==='/__fixture/stats')return json({calls,valid})
 const parts=[];for await(const p of req)parts.push(p);const body=Buffer.concat(parts).toString(),value=JSON.parse(body||'{}')
 if(req.url==='/__fixture/control'){if(value.release){held.splice(0).forEach(f=>f());return json({released:true})}mode=value.mode||'normal';calls=0;valid=true;return json({ok:true})}
 calls++
 const timestamp=req.headers['x-tc-timestamp'],date=new Date(Number(timestamp)*1000).toISOString().slice(0,10),scope=date+'/teo/tc3_request',canonical=['POST','/','','content-type:application/json\nhost:teo.tencentcloudapi.com\n','content-type;host',hash(body)].join('\n'),signature=createHmac('sha256',hmac(hmac(hmac('TC3fixture-secret-MUST_NOT_LEAK',date),'teo'),'tc3_request')).update(['TC3-HMAC-SHA256',timestamp,scope,hash(canonical)].join('\n')).digest('hex')
 valid&&=req.headers.authorization===`TC3-HMAC-SHA256 Credential=fixture-id/${scope}, SignedHeaders=content-type;host, Signature=${signature}`&&req.headers['x-tc-action']==='DescribeTimingL7AnalysisData'&&value.ZoneIds?.length===1&&value.ZoneIds[0]==='zone-fixture'&&value.Filters?.some(f=>f.Key==='domain'&&f.Operator==='equals'&&f.Value.every(d=>['duanap.cn','www.duanap.cn','blog.duanap.cn'].includes(d)))&&!req.headers.cookie
 if(!valid)return json({Response:{Error:{Code:'AuthFailure.SignatureFailure',Message:'MUST_NOT_LEAK'}}})
 if(mode==='hold')await new Promise(r=>held.push(r))
 if(mode==='hang')await new Promise(r=>setTimeout(r,6500))
 if(mode==='deny')return json({Response:{Error:{Code:'UnauthorizedOperation',Message:'MUST_NOT_LEAK'}}})
 if(mode==='redirect'){res.writeHead(302,{Location:'http://127.0.0.1:1/secret'});return res.end()}
 if(mode==='huge'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(' '.repeat(260000))}
 if(mode==='empty')return json({Response:{TotalCount:0,Data:[]}})
 const mitigation=value.Filters.find(f=>f.Key==='mitigatedByWebSecurity').Value,cache=value.Filters.find(f=>f.Key==='cacheType')?.Value
 const sum=mitigation.length===1&&mitigation[0]==='yes'?0:cache?.length===1?40:cache?50:100
 const metrics=value.MetricNames.map(name=>({MetricName:name,Sum:mode==='invalid'?-1:name==='l7Flow_outFlux'?1000000:sum,Detail:[{Timestamp:Date.parse(value.StartTime)/1000,Value:name==='l7Flow_outFlux'?1000000:sum}]}))
 json({Response:{TotalCount:1,Data:[{TypeKey:'MUST_NOT_LEAK',TypeValue:metrics}],RequestId:'MUST_NOT_LEAK'}})
}).listen(1035,'127.0.0.1')
