import {getJSON,postJSON,params} from './api.js';
import {$,num,temp,degree,escapeHTML,hour,clock,weekday,dateLabel,conditions,emoji,currentIndex,refreshIcons} from './utils.js';
import {weatherCharts,airChart,minuteChart} from './charts.js';
import {openRadar,radarLocation} from './radar.js';
import {openGlobe} from './globe.js';
const DEFAULT={name:'Dehradun',admin1:'Uttarakhand',country:'India',latitude:30.3165,longitude:78.0322,timezone:'Asia/Kolkata'};
const state={place:DEFAULT,w:null,air:null,unit:localStorage.getItem('a360-unit')==='F'?'F':'C',view:'today',consent:localStorage.getItem('a360-analytics')||null,searchResults:[],searchSeq:0,loadingSeq:0};
const safely=(fn)=>{try{fn();}catch(e){console.warn(e);}};
function status(message=''){const box=$('status');box.textContent=message;box.hidden=!message;}
function fullName(place){return [place.name,place.admin1,place.country].filter(Boolean).join(', ');}
function saveFavorite(){let f=favorites();const key=state.place.name+'-'+state.place.country;let found=f.some(v=>(v.name+'-'+v.country)===key);f=found?f.filter(v=>(v.name+'-'+v.country)!==key):[...f,state.place].slice(-12);localStorage.setItem('a360-favorites',JSON.stringify(f));updateFavorite();status(found?'Removed from saved locations.':'Location saved.');}
function favorites(){try{return JSON.parse(localStorage.getItem('a360-favorites')||'[]');}catch{return [];}}
function updateFavorite(){const found=favorites().some(v=>v.name===state.place.name&&v.country===state.place.country);$('favoriteBtn').classList.toggle('is-favorite',found);$('favoriteBtn').title=found?'Remove from favourites':'Save location';}
function updateLocationLabels(){let p=state.place;$('locationName').textContent=p.name||'Selected coordinates';$('locationRegion').textContent=[p.admin1,p.country].filter(Boolean).join(', ')||`${p.latitude.toFixed(2)}°, ${p.longitude.toFixed(2)}°`;updateFavorite();}
function updateClock(){const zone=state.w?.timezone||state.place.timezone||'UTC';try{$('localClock').textContent=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date())+' local';}catch{$('localClock').textContent='Local time unavailable';}}
function onStatusFail(section,e){console.warn(section,e);status(`${section}: ${e.message}`);}

async function loadPlace(place, {
  track = false,
  type = 'manual',
  switchToday = true
} = {}) {

  const id = ++state.loadingSeq;

  state.place = {
    ...place,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude)
  };

  updateLocationLabels();

  status('Updating conditions for ' +
    (place.name || 'selected coordinates') + '…');

  const coords = params(place.latitude, place.longitude);

  // Load air quality separately so weather doesn't have to wait.
  const airPromise = getJSON('/api/air?' + coords)
    .then(result => ({ ok: true, data: result.air }))
    .catch(() => ({ ok: false, data: null }));

  let weather;

  try {
    const response = await getJSON('/api/weather?' + coords);

    weather = response.forecast;

    if (!weather || !weather.current) {
      throw new Error('Incomplete weather information.');
    }

  } catch (error) {

    if (id !== state.loadingSeq) return false;

    onStatusFail('Weather forecast unavailable', error);

    if (type === 'globe') {
      $('globeStatus').textContent =
        'Unable to fetch weather. Please try another location.';
    }

    if (track) {
      postJSON('/api/track', {
        search_type: type,
        searched_location: fullName(place),
        search_status: 'failure'
      }).catch(() => {});
    }

    return false;
  }

  if (id !== state.loadingSeq) return false;

  state.w = weather;
  state.air = null;

  status('');

  updateLocationLabels();
  renderWeather();
  renderAir();
  updateClock();

  if (type === 'globe') {
    $('globeStatus').textContent =
      `Forecast loaded for ${fullName(state.place)}`;
  }

  if (switchToday) {
    showView('today');
  } else {
    renderCurrentView();
  }

  if (track && ['manual', 'globe'].includes(type)) {
    postJSON('/api/track', {
      search_type: type,
      searched_location: fullName(place),
      latitude: place.latitude,
      longitude: place.longitude,
      search_status: 'success'
    }).catch(() => {});
  }

  radarLocation(place.latitude, place.longitude, weather.current);

  airPromise.then(result => {

    if (id !== state.loadingSeq) return;

    state.air = result.data;
    renderAir();

    if (state.view === 'air' && state.air) {
      requestAnimationFrame(() => airChart(state.air));
    }

    if (!result.ok) {
      status('Weather loaded. Air quality is temporarily unavailable.');
    }
  });

  return true;
}

function renderWeather(){const w=state.w,c=w.current||{},h=w.hourly||{},d=w.daily||{},i=currentIndex(w),u=state.unit;
 $('currentTemp').textContent=temp(c.temperature_2m,u);$('heroDegree').textContent=`°${u}`;
 $('conditionText').textContent=conditions(c.weather_code);$('feelsTemp').textContent=`Feels like ${degree(c.apparent_temperature,u)}`;
 $('mainWeatherIcon').textContent=emoji(c.weather_code,c.is_day);$('todayHigh').textContent=degree(d.temperature_2m_max?.[0],u);$('todayLow').textContent=degree(d.temperature_2m_min?.[0],u);
 $('rainChance').textContent=d.precipitation_probability_max?.[0]==null?'—':`${num(d.precipitation_probability_max[0])}%`;
 $('heroDate').textContent=weekday(d.time?.[0]||new Date().toISOString().slice(0,10),false).toUpperCase();
 $('heroDescription').textContent=`${conditions(c.weather_code)} today. Winds ${num(c.wind_speed_10m)} km/h.`;
 $('heroCard').dataset.weather=(!c.is_day)?'night':([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(c.weather_code)?'rain':([2,3,45,48].includes(c.weather_code)?'cloud':'clear'));
 const metrics=[['droplets','HUMIDITY',`${num(c.relative_humidity_2m)}%`],['wind','WIND',`${num(c.wind_speed_10m)} km/h`],['gauge','PRESSURE',`${num(c.pressure_msl)} hPa`],['eye','VISIBILITY',h.visibility?.[i]==null?'—':`${num(h.visibility[i]/1000,1)} km`],['cloud','CLOUD COVER',`${num(c.cloud_cover)}%`],['sun','UV INDEX',num(h.uv_index?.[i],1)],['thermometer','DEW POINT',degree(h.dew_point_2m?.[i],u)],['navigation','WIND DIRECTION',c.wind_direction_10m==null?'—':`${num(c.wind_direction_10m)}°`],['cloud-rain','PRECIPITATION',c.precipitation==null?'—':`${num(c.precipitation,1)} mm`]];
 $('todayMetrics').innerHTML=metrics.map(([ic,name,val])=>`<div class="metric"><div class="metric-icon"><i data-lucide="${ic}"></i></div><strong>${escapeHTML(val)}</strong><small>${name}</small></div>`).join('');
 $('sunrise').textContent=clock(d.sunrise?.[0]);$('sunset').textContent=clock(d.sunset?.[0]);
 if(d.sunrise?.[0]&&d.sunset?.[0]){let diff=(new Date(d.sunset[0]).getTime()-new Date(d.sunrise[0]).getTime())/60000;$('daylight').textContent=Number.isFinite(diff)?`${Math.floor(diff/60)}h ${Math.round(diff%60)}m of forecast daylight`:'Sunrise and sunset are local times.';}
 $('todayDays').innerHTML=(d.time||[]).slice(0,5).map((date,j)=>`<div class="mini-day"><small>${j===0?'Today':weekday(date)}</small><div class="weather-emoji">${emoji(d.weather_code?.[j])}</div><b>${temp(d.temperature_2m_max?.[j],u)}° <span>${temp(d.temperature_2m_min?.[j],u)}°</span></b></div>`).join('');
 $('updatedTime').textContent=`Updated ${hour(c.time)} · ${w.timezone_abbreviation||w.timezone||'local'}`;
 renderHourly();renderDaily();renderMonthly();renderMinutes();renderHealth();refreshIcons();requestAnimationFrame(()=>weatherCharts(w,u));
}
function renderHourly(){const w=state.w,h=w.hourly||{},i=currentIndex(w),u=state.unit;
 $('tempAxisUnit').textContent=`°${u}`;
 $('hourlyCards').innerHTML=(h.time||[]).slice(i,i+48).map((t,j)=>{const k=i+j;return `<div class="hour-card"><small>${j===0?'Now':hour(t)}</small><div class="weather-emoji">${emoji(h.weather_code?.[k],h.is_day?.[k])}</div><strong>${temp(h.temperature_2m?.[k],u)}°</strong><span class="rain">☂ ${num(h.precipitation_probability?.[k])}%</span><small>Wind ${num(h.wind_speed_10m?.[k])} km/h</small></div>`;}).join('');}
function renderDaily(){const d=state.w.daily||{},u=state.unit, highs=(d.temperature_2m_max||[]).slice(0,10),lows=(d.temperature_2m_min||[]).slice(0,10),lo=Math.min(...lows),hi=Math.max(...highs),span=Math.max(hi-lo,1);
 $('dailyList').innerHTML=(d.time||[]).slice(0,10).map((t,j)=>`<button type="button" class="day-row ${j===0?'active':''}" data-day="${j}"><strong>${j===0?'Today':weekday(t)}</strong><span class="weather-emoji">${emoji(d.weather_code?.[j])}</span><b>${temp(highs[j],u)}° <span>${temp(lows[j],u)}°</span></b><div class="temperature-track"><i style="margin-left:${Math.max(0,(lows[j]-lo)/span*55)}%;width:${Math.max(12,(highs[j]-lows[j])/span*90)}%"></i></div><span>☂ ${num(d.precipitation_probability_max?.[j])}%</span><span>${num(d.wind_speed_10m_max?.[j])} km/h</span></button>`).join('');
 $('dailyList').querySelectorAll('[data-day]').forEach(button=>button.addEventListener('click',()=>selectDay(Number(button.dataset.day))));selectDay(0);
}
function selectDay(i){const d=state.w.daily||{};$('dailyList').querySelectorAll('[data-day]').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.day)===i));$('dayDetails').innerHTML=`<strong>${escapeHTML(dateLabel(d.time?.[i]))} · ${escapeHTML(conditions(d.weather_code?.[i]))}</strong><br>High ${degree(d.temperature_2m_max?.[i],state.unit)} · Low ${degree(d.temperature_2m_min?.[i],state.unit)} · Rain chance ${num(d.precipitation_probability_max?.[i])}% · Total precipitation ${num(d.precipitation_sum?.[i],1)} mm · Maximum wind ${num(d.wind_speed_10m_max?.[i])} km/h · UV maximum ${num(d.uv_index_max?.[i],1)}.`;}
function renderMonthly(){const d=state.w.daily||{};const dates=d.time||[];if(!dates.length)return;const start=new Date(`${dates[0]}T12:00:00Z`);const gridStart=new Date(start);gridStart.setUTCDate(gridStart.getUTCDate()-gridStart.getUTCDay());const end=new Date(start);end.setUTCDate(end.getUTCDate()+34);$('monthTitle').textContent=`${dateLabel(dates[0])} – ${dateLabel(end.toISOString().slice(0,10))}`;
 const lookup=new Map(dates.map((x,i)=>[x,i]));$('monthlyGrid').innerHTML=Array.from({length:42},(_,offset)=>{const x=new Date(gridStart);x.setUTCDate(x.getUTCDate()+offset);const key=x.toISOString().slice(0,10);const i=lookup.get(key);const available=i!==undefined;const past=x<start;return `<div class="month-day ${key===dates[0]?'is-today':''} ${!available?'outside':''}"><span class="month-number">${x.getUTCDate()}</span>${available?`<span class="weather-emoji">${emoji(d.weather_code?.[i])}</span><b>${temp(d.temperature_2m_max?.[i],state.unit)}° / ${temp(d.temperature_2m_min?.[i],state.unit)}°</b>`:`<span class="weather-emoji">${past?'·':'—'}</span><small>${past?'Earlier date':'No forecast'}</small>`}</div>`;}).join('');}
function renderMinutes(){const w=state.w,m=w.minutely_15||{},now=w.current?.time||'',idx=(m.time||[]).findIndex(t=>t>=now.slice(0,16));let points=[];let note='Model-based 15-minute precipitation estimates (not live rainfall observation).';if(idx>=0){points=(m.time||[]).slice(idx,idx+4).map((time,j)=>({time,rain:m.precipitation?.[idx+j]})).filter(v=>v.rain!=null);}
 if(!points.length){const h=w.hourly||{},i=currentIndex(w);points=(h.time||[]).slice(i,i+1).map((time,j)=>({time,rain:h.precipitation?.[i+j]}));note='15-minute resolution is unavailable for this location. Showing the next available hourly model estimate instead.';}
 $('minuteNotice').textContent=note;
 $('minuteCards').innerHTML=points.map(p=>`<div class="minute-card"><span>${hour(p.time)}</span><strong>${num(p.rain,2)}</strong><small>mm of precipitation</small></div>`).join('')||'<p>Short-term precipitation data is unavailable here.</p>';
 requestAnimationFrame(()=>minuteChart(points));}
function renderAir(){const a=state.air;if(!a){$('aqiNumber').textContent='—';$('aqiLabel').textContent='Unavailable';$('aqiMessage').textContent='No air quality result from the data provider.';$('pollutants').innerHTML='<p>Air-quality measurements not currently available.</p>';return;}
 const c=a.current||{},aqi=c.us_aqi;let stateName='Unavailable',msg='Air quality data not available.',color='#72869c';
 if(aqi!=null){if(aqi<=50){stateName='Good';msg='Air quality is satisfactory under the US AQI classification.';color='#2eac75';}else if(aqi<=100){stateName='Moderate';msg='Air quality is acceptable for most people.';color='#d5ad2d';}else if(aqi<=150){stateName='Unhealthy for sensitive groups';msg='Sensitive individuals should consult local air-quality guidance.';color='#ed9c40';}else if(aqi<=200){stateName='Unhealthy';msg='Consider reducing prolonged outdoor exertion.';color='#d9545a';}else if(aqi<=300){stateName='Very unhealthy';msg='Check local public-health advice before outdoor activities.';color='#9258af';}else{stateName='Hazardous';msg='Follow official local air-quality advisories.';color='#782447';}}
 $('aqiNumber').textContent=num(aqi);$('aqiNumber').style.color=color;$('aqiLabel').textContent=stateName;$('aqiMessage').textContent=msg;
 $('pollutants').innerHTML=[['PM2.5','pm2_5'],['PM10','pm10'],['Ozone','ozone'],['Nitrogen dioxide','nitrogen_dioxide'],['European AQI','european_aqi']].map(([label,key])=>`<div class="pollutant"><small>${label}</small><strong>${num(c[key],1)}</strong><span>${key==='european_aqi'?'European AQI units':'µg/m³'}</span></div>`).join('');
 requestAnimationFrame(()=>airChart(a));}
function renderHealth(){const w=state.w,c=w.current||{},d=w.daily||{},h=w.hourly||{},i=currentIndex(w),uv=h.uv_index?.[i],rain=d.precipitation_probability_max?.[0],wind=c.wind_speed_10m,t=c.temperature_2m;
 $('healthSummary').textContent=conditions(c.weather_code)+' · '+degree(t,state.unit);
 const cards=[['sun','UV awareness',uv==null?'Unavailable':uv>=8?'Very high UV':uv>=6?'High UV':uv>=3?'Moderate UV':'Lower UV',uv==null?'Check the local UV forecast.':uv>=6?'Seek shade and use appropriate sun protection during peak hours.':'Continue using appropriate sun protection.'],['cloud-rain','Rain planning',rain==null?'Unavailable':rain>=60?'Rain likely':rain>=30?'Possible showers':'Lower rain chance',rain==null?'Rain estimate not available.':rain>=30?'Consider taking an umbrella or waterproof layer.':'Check again before leaving; conditions can change.'],['wind','Wind awareness',wind==null?'Unavailable':wind>=35?'Windy conditions':wind>=18?'Breezy':'Lighter winds',wind>=35?'Take extra care with loose outdoor items.':'Review local conditions before cycling or outdoor events.'],['footprints','Walking & running','Weather-based guide',t==null?'Check current weather first.':t>32?'Warm conditions: consider comfortable timing and hydration.':rain>=60?'Rain is forecast: check surface conditions before setting out.':'Check visibility, temperature and local advisories before leaving.'],['bike','Cycling','Weather-based guide',wind>=35?'Strong winds may make cycling less comfortable.':rain>=60?'Rain is possible; review road and visibility conditions.':'Review wind and traffic conditions along your route.'],['sunrise','Daylight planner','Sunrise / sunset',`${clock(d.sunrise?.[0])} sunrise · ${clock(d.sunset?.[0])} sunset. Times are local to this location.`]];
 $('healthList').innerHTML=cards.map(([ic,title,badge,desc])=>`<article class="activity-item"><i data-lucide="${ic}"></i><h3>${escapeHTML(title)}</h3><b>${escapeHTML(badge)}</b><p>${escapeHTML(desc)}</p></article>`).join('');refreshIcons();}
function renderCurrentView(){const id=state.view;if(!state.w)return;if(id==='radar')openRadar(state.place.latitude,state.place.longitude,state.w.current);if(id==='globe')openGlobe();if(id==='air'&&state.air)requestAnimationFrame(()=>airChart(state.air));if(id==='minute')renderMinutes();if(['today','hourly','daily'].includes(id))requestAnimationFrame(()=>weatherCharts(state.w,state.unit));}
function showView(id){if(!$('view-'+id))return;state.view=id;document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!=='view-'+id);document.querySelectorAll('.nav-link').forEach(v=>v.classList.toggle('active',v.dataset.view===id));history.replaceState(null,'',`#${id}`);renderCurrentView();window.scrollTo({top:0,behavior:'smooth'});}
let suggestTimer=null;
function showSuggestions(results){state.searchResults=results;$('suggestions').hidden=!results.length;$('suggestions').innerHTML=results.map((p,i)=>`<button type="button" role="option" data-place="${i}"><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML([p.admin1,p.country].filter(Boolean).join(', '))}</small></button>`).join('');$('suggestions').querySelectorAll('[data-place]').forEach(b=>b.addEventListener('click',()=>choose(state.searchResults[Number(b.dataset.place)])));}
function choose(place){$('searchInput').value='';$('suggestions').hidden=true;loadPlace(place,{track:true,type:'manual'});}
function setupSearch(){const form=$('searchForm'),input=$('searchInput');input.addEventListener('focus',()=>{if(!input.value.trim()){showSuggestions(favorites().slice().reverse());}});input.addEventListener('input',()=>{clearTimeout(suggestTimer);const q=input.value.trim();if(q.length<2){showSuggestions(q?'':favorites().slice().reverse());return;}const id=++state.searchSeq;suggestTimer=setTimeout(async()=>{try{const results=await getJSON('/api/geocode?q='+encodeURIComponent(q));if(id===state.searchSeq&&input.value.trim()===q)showSuggestions(results.results||[]);}catch(e){status(e.message);}},270);});form.addEventListener('submit',async(e)=>{e.preventDefault();const q=input.value.trim();if(!q)return;let first=state.searchResults[0];if(!first||!q.toLowerCase().includes(first.name.toLowerCase())){try{let d=await getJSON('/api/geocode?q='+encodeURIComponent(q));first=d.results?.[0];}catch(err){status(err.message);return;}}if(!first){status('No matching city found. Add a region or country and try again.');return;}choose(first);});document.addEventListener('click',e=>{if(!form.contains(e.target))$('suggestions').hidden=true;});}

async function pickGlobePoint(detail) {

  const point = {
    name: `${detail.lat.toFixed(2)}°, ${detail.lon.toFixed(2)}°`,
    latitude: detail.lat,
    longitude: detail.lon,
    country: '',
    admin1: ''
  };

  // First load weather using the selected coordinates.
  const ok = await loadPlace(point, {
    track: true,
    type: detail.type === 'globe' ? 'globe' : 'manual'
  });

  if (!ok) return;

  const selectedRequest = state.loadingSeq;

  // Identify the city separately, after weather has loaded.
  try {

    const r = await getJSON(
      '/api/reverse?' + params(detail.lat, detail.lon)
    );

    if (selectedRequest !== state.loadingSeq) return;

    state.place = {
      ...state.place,
      name: r.name || point.name,
      admin1: r.region || '',
      country: r.country || ''
    };

    updateLocationLabels();

    $('globeStatus').textContent =
      `Forecast loaded for ${fullName(state.place)}`;

  } catch (error) {
    console.info(
      'Location name unavailable; weather is already loaded.',
      error.message
    );
  }
}

function setupPrivacy(){if(!state.consent)$('privacyBanner').hidden=false;else postJSON('/api/consent',{choice:state.consent}).catch(()=>{});
 async function choice(v){try{await postJSON('/api/consent',{choice:v});state.consent=v;localStorage.setItem('a360-analytics',v);$('privacyBanner').hidden=true;$('privacyDialog').close();status(v==='yes'?'Optional consent-based search logging enabled for deliberate searches.':'Optional analytics disabled.');}catch(e){status(e.message);}}
 $('privacyAccept').onclick=()=>choice('yes');$('privacyDecline').onclick=()=>choice('no');$('privacyEnable').onclick=()=>choice('yes');$('privacyDisable').onclick=()=>choice('no');$('privacyOpen').onclick=()=>$('privacyDialog').showModal();}
function setupButtons(){document.querySelectorAll('[data-view],[data-go]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view||b.dataset.go)));
 $('unitBtn').addEventListener('click',()=>{state.unit=state.unit==='C'?'F':'C';localStorage.setItem('a360-unit',state.unit);$('unitBtn').innerHTML=state.unit==='C'?'°C <span> / °F</span>':'°F <span> / °C</span>';if(state.w){renderWeather();renderAir();renderCurrentView();}});
 if(state.unit==='F')$('unitBtn').innerHTML='°F <span> / °C</span>';
 $('themeBtn').addEventListener('click',()=>{document.body.classList.toggle('dark');localStorage.setItem('a360-theme',document.body.classList.contains('dark')?'dark':'light');});if(localStorage.getItem('a360-theme')==='dark')document.body.classList.add('dark');
 $('favoriteBtn').addEventListener('click',saveFavorite);
 $('geoBtn').addEventListener('click',()=>{if(!navigator.geolocation){status('Geolocation is not available in this browser.');return;}status('Waiting for browser location permission…');navigator.geolocation.getCurrentPosition(async({coords})=>{let p={name:'Current location',admin1:'',country:'',latitude:coords.latitude,longitude:coords.longitude};try{let r=await getJSON('/api/reverse?'+params(coords.latitude,coords.longitude));p.name=r.name;p.admin1=r.region;p.country=r.country;}catch{}loadPlace(p,{track:false});},(e)=>status('Location not available ('+e.message+'). You can search manually instead.'),{enableHighAccuracy:false,timeout:10000,maximumAge:300000});});
 window.addEventListener('weather-location',e=>pickGlobePoint(e.detail));}
setupSearch();setupButtons();setupPrivacy();showView(['today','hourly','daily','radar','minute','monthly','air','health','globe'].includes(location.hash.slice(1))?location.hash.slice(1):'today');updateLocationLabels();loadPlace(DEFAULT,{track:false,switchToday:false});setInterval(updateClock,30000);
