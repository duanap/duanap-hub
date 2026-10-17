import {convertDocument,type ConversionMode} from '@/lib/document-conversion'
// Document processing is isolated from the page and cannot fetch document URLs.
globalThis.fetch=async()=>{throw Error('文档转换不访问网络')}
self.onmessage=async(event:MessageEvent<{mode:ConversionMode;text:string;buffer?:ArrayBuffer}>)=>{if(!event.data||typeof event.data.mode!=='string'||typeof event.data.text!=='string')return;try{const result=await convertDocument(event.data.mode,event.data.text,event.data.buffer);self.postMessage({result})}catch(error){self.postMessage({error:error instanceof Error?error.message:'转换失败，请检查文件'})}}
self.postMessage({ready:true})
