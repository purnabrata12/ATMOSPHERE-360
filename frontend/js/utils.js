export const $ = (id) => document.getElementById(id);
export const num = (v, digits=0) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits);
export const temp = (v, unit='C') => v == null ? '—' : Math.round(unit === 'F' ? Number(v) * 9/5 + 32 : Number(v));
export const degree = (v, unit='C') => `${temp(v, unit)}°${unit}`;
export const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const hour = (iso) => { if(!iso) return '—'; const t=String(iso).slice(11,16).split(':'); let h=Number(t[0]);return `${h%12||12}${Number(t[1])?':'+t[1]:''} ${h>=12?'PM':'AM'}`; };
export const clock = (iso) => String(iso||'').slice(11,16) || '—';
export const weekday = (d,short=true) => new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:short?'short':'long'});
export const dateLabel = (d) => new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'});
export const conditions = (code=0) => {
  const n=Number(code);
  if(n===0)return 'Clear skies'; if(n===1)return 'Mainly clear';if(n===2)return 'Partly cloudy';if(n===3)return 'Overcast';
  if([45,48].includes(n))return 'Foggy';if([51,53,55,56,57].includes(n))return 'Drizzle';
  if([61,63,65,66,67].includes(n))return 'Rain';if([71,73,75,77,85,86].includes(n))return 'Snow';
  if([80,81,82].includes(n))return 'Rain showers';if([95,96,99].includes(n))return 'Thunderstorm';
  return 'Variable conditions';
};
export const emoji = (code=0, day=1) => {
  const n=Number(code);
  if(n===0)return day?'☀️':'🌙';if(n===1)return day?'🌤️':'🌙';if(n===2)return '⛅';if(n===3)return '☁️';
  if([45,48].includes(n))return '🌫️';if([51,53,55,56,57].includes(n))return '🌦️';
  if([61,63,65,66,67].includes(n))return '🌧️';if([71,73,75,77,85,86].includes(n))return '🌨️';
  if([80,81,82].includes(n))return '🌦️';if([95,96,99].includes(n))return '⛈️';return '🌤️';
};
export const currentIndex = (weather) => { const h=weather?.hourly?.time||[];const now=weather?.current?.time||'';let i=h.findIndex((t)=>t>=now.slice(0,13));return i<0?0:i;};
export function refreshIcons(){window.lucide?.createIcons?.();}
