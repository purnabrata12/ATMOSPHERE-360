import {hour, weekday, temp, currentIndex} from './utils.js';
const instances=new Map();
function draw(id,type,labels,values,opts={}){
  const canvas=document.getElementById(id); if(!canvas||!window.Chart) return;
  instances.get(id)?.destroy();
  const secondary=opts.secondary||null;
  const color=opts.color||'#2478ef';
  const datasets=[{label:opts.label||'Value',data:values,borderColor:color,backgroundColor:type==='bar'?color+'a9':color+'15',fill:type!=='bar',borderWidth:2.6,tension:.37,pointRadius:opts.pointRadius??2,pointHoverRadius:5,borderRadius:5}];
  if(secondary){datasets.push({label:secondary.label,data:secondary.values,borderColor:'#eeae48',backgroundColor:'#eeae4819',borderWidth:2.5,tension:.3,fill:false,pointRadius:3});}
  instances.set(id,new Chart(canvas,{type,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:!!secondary,labels:{boxWidth:12,color:'#8297ad',font:{size:11}}},tooltip:{backgroundColor:'#0c2c4b',padding:12,displayColors:true}},scales:{x:{ticks:{color:'#8b9aae',maxTicksLimit:opts.ticks||9,maxRotation:0,font:{size:10}},grid:{display:false},border:{display:false}},y:{beginAtZero:!!opts.zero,ticks:{color:'#8b9aae',font:{size:10},callback:(v)=>`${v}${opts.suffix||''}`},grid:{color:'rgba(135,157,187,.15)'},border:{display:false}}}}}));
}
export function weatherCharts(w,unit){
 const h=w.hourly||{}, d=w.daily||{}, i=currentIndex(w), slice=(name,n=24)=>(h[name]||[]).slice(i,i+n);
 const labels=slice('time',24).map(hour);
 draw('todayChart','line',labels,slice('temperature_2m').map(v=>temp(v,unit)),{label:`Temperature °${unit}`,suffix:'°',ticks:7});
 draw('hourlyChart','line',slice('time',48).map(hour),slice('temperature_2m',48).map(v=>temp(v,unit)),{label:`Temperature °${unit}`,suffix:'°',ticks:12});
 draw('precipChart','bar',slice('time',48).map(hour),slice('precipitation_probability',48),{label:'Rain chance (%)',color:'#25aed0',suffix:'%',zero:true,ticks:12});
 draw('windChart','line',slice('time',48).map(hour),slice('wind_speed_10m',48),{label:'Wind (km/h)',color:'#35ac9c',suffix:'',zero:true,ticks:12});
 draw('dailyChart','line',(d.time||[]).slice(0,10).map(t=>weekday(t)),(d.temperature_2m_max||[]).slice(0,10).map(v=>temp(v,unit)),{label:`High °${unit}`,suffix:'°',secondary:{label:`Low °${unit}`,values:(d.temperature_2m_min||[]).slice(0,10).map(v=>temp(v,unit))}});
}
export function minuteChart(points){draw('minuteChart','bar',points.map(x=>hour(x.time)),points.map(x=>x.rain),{label:'Precipitation (mm / 15 min)',color:'#23a8d6',zero:true,ticks:8});}
export function airChart(a){const h=a?.hourly||{},index=Math.max(0,(h.time||[]).findIndex(t=>t>=(a.current?.time||'').slice(0,13)));draw('airChart','line',(h.time||[]).slice(index,index+48).map(hour),(h.us_aqi||[]).slice(index,index+48),{label:'US AQI',color:'#34b982',zero:true,ticks:10});}
export function adminChart(d){draw('adminChart','bar',d.map(x=>x.date.slice(5)),d.map(x=>x.count),{label:'Opted-in searches',color:'#1468ed',zero:true,ticks:8});}
