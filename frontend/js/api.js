export async function getJSON(url, options={}){
 const c=new AbortController();const timeout=setTimeout(()=>c.abort(),15000);
 try{const r=await fetch(url,{...options,signal:options.signal||c.signal,credentials:'same-origin'});let data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||`Request failed (${r.status})`);return data;}
 catch(e){if(e.name==='AbortError')throw Error('Request timed out. Check your internet connection.');throw e;}
 finally{clearTimeout(timeout);}
}
export const params=(lat,lon)=>`lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
export const postJSON=(url,data,extra={})=>getJSON(url,{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(data)});
