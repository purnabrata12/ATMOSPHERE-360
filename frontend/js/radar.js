import {getJSON} from './api.js';
import {$,num,refreshIcons} from './utils.js';
let map=null, radar=null, localMarker=null, frames=[], active=0, host='', timer=null, position={lat:30.3165,lon:78.0322}, current=null;
export async function openRadar(lat,lon,conditions){
 position={lat,lon};current=conditions;
 if(!window.L){$('radarNotice').textContent='Map library could not load. Check your connection and reload.';return;}
 if(!map){map=L.map('radarMap',{center:[lat,lon],zoom:5,maxZoom:7,preferCanvas:true});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:7,attribution:'© OpenStreetMap contributors'}).addTo(map);
 map.on('click',e=>window.dispatchEvent(new CustomEvent('weather-location',{detail:{lat:e.latlng.lat,lon:e.latlng.lng,type:'manual'}})));
 $('layerSelect').addEventListener('change',showLayer);
 $('radarSlider').addEventListener('input',e=>{active=+e.target.value;drawFrame();});
 $('radarPlay').addEventListener('click',()=>timer?stop():play());
 try{const result=await getJSON('/api/radar');frames=result.frames||[];host=result.host;
 $('radarSlider').max=String(Math.max(frames.length-1,0));active=frames.length-1;$('radarSlider').value=String(active);
 $('radarFrameCount').textContent=`${frames.length} past frames`;
 $('radarNotice').textContent='RainViewer: historical radar where coverage exists, not a future forecast. Zoom is limited to level 7 by the radar provider.';
 }catch(e){$('radarNotice').textContent='Radar currently unavailable: '+e.message;}
 }
 map.setView([lat,lon],Math.min(map.getZoom(),7));setTimeout(()=>map?.invalidateSize(),80);showLayer();
}
export function radarLocation(lat,lon,c){position={lat,lon};current=c;if(map){map.setView([lat,lon]);showLayer();}}
function drawFrame(){if(radar){map.removeLayer(radar);radar=null;}if($('layerSelect').value!=='radar'||!frames.length)return;
 const f=frames[active];radar=L.tileLayer(`${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,{opacity:.7,maxNativeZoom:7,maxZoom:7,updateWhenIdle:true,attribution:'Radar © RainViewer'}).addTo(map);
 $('radarTimestamp').textContent='Radar frame: '+new Date(f.time*1000).toLocaleString();$('radarSlider').value=String(active);
}
function showLayer(){if(!map)return;stop();if(radar){map.removeLayer(radar);radar=null;}if(localMarker){map.removeLayer(localMarker);localMarker=null;}
 const layer=$('layerSelect').value;
 if(layer==='radar'){drawFrame();$('radarSlider').disabled=!frames.length;$('radarPlay').disabled=!frames.length;return;}
 $('radarSlider').disabled=true;$('radarPlay').disabled=true;
 const m={temperature:['Temperature',current?.temperature_2m==null?'No data':`${num(current.temperature_2m)} °C`],cloud:['Cloud cover',current?.cloud_cover==null?'No data':`${num(current.cloud_cover)}%`],wind:['Wind speed',current?.wind_speed_10m==null?'No data':`${num(current.wind_speed_10m)} km/h`]}[layer];
 localMarker=L.circleMarker([position.lat,position.lon],{radius:12,color:'#fff',weight:3,fillColor:'#197bed',fillOpacity:.95}).addTo(map).bindPopup(`<strong>${m[0]}:</strong> ${m[1]}<br><small>Selected-location forecast; not a global raster.</small>`).openPopup();
 $('radarTimestamp').textContent='Selected location · latest model conditions';$('radarNotice').textContent='This layer marks the currently selected location only. It does not represent a global heatmap.';
}
function play(){if(!frames.length||$('layerSelect').value!=='radar')return;timer=setInterval(()=>{active=(active+1)%frames.length;drawFrame();},900);$('radarPlay').textContent='Ⅱ';}
function stop(){if(timer){clearInterval(timer);timer=null;}$('radarPlay').innerHTML='<i data-lucide="play"></i>';refreshIcons();}
