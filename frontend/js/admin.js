import {$,escapeHTML} from './utils.js';
import {getJSON,postJSON} from './api.js';
import {adminChart} from './charts.js';
let csrf='', rows=[];

function formatIST(value) {
    return new Date(value).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

const message=t=>{$('adminNotice').textContent=t;$('adminNotice').hidden=!t;};
function openPanel(token){csrf=token;$('loginPanel').hidden=true;$('adminPanel').hidden=false;refresh();}
async function refresh(){const qs=new URLSearchParams();if($('filterQ').value.trim())qs.set('q',$('filterQ').value.trim());if($('filterFrom').value)qs.set('from',$('filterFrom').value);if($('filterTo').value)qs.set('to',$('filterTo').value);
 try{const d=await getJSON('/api/admin/stats?'+qs);rows=d.records||[];$('totalLogs').textContent=d.total;$('retentionDays').textContent=`${d.retention_days} days`;$('mostSearched').textContent=d.top?.[0]?.location||'—';$('topLocations').innerHTML=(d.top||[]).map(x=>`<div class="top-location"><span>${escapeHTML(x.location)}</span><b>${x.count}</b></div>`).join('')||'<p>No opted-in searches yet.</p>';
 $('logsBody').innerHTML=rows.map(x=>`<tr><td>${escapeHTML(formatIST(x.searched_at))}</td><td>${escapeHTML(x.searched_location)}</td><td>${escapeHTML(x.ip_address)}</td><td>${escapeHTML(x.search_type)}</td><td>${escapeHTML(x.search_status)}</td></tr>`).join('')||'<tr><td colspan="5">No search records in this range.</td></tr>';
 requestAnimationFrame(()=>adminChart(d.daily||[]));message('');}catch(e){message(e.message);if(e.message==='Authentication required'){$('adminPanel').hidden=true;$('loginPanel').hidden=false;}}}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const d=await postJSON('/api/admin/login',{username:$('adminUsername').value,password:$('adminPassword').value});$('adminPassword').value='';openPanel(d.csrf_token);}catch(err){message(err.message);}});
$('logoutBtn').addEventListener('click',async()=>{try{await postJSON('/api/admin/logout',{}, {'X-CSRF-Token':csrf});csrf='';$('adminPanel').hidden=true;$('loginPanel').hidden=false;message('Signed out.');}catch(e){message(e.message);}});
$('filterForm').addEventListener('submit',e=>{e.preventDefault();refresh();});
$('purgeBtn').addEventListener('click',async()=>{if(!confirm('Delete search logs older than the configured retention period?'))return;try{const d=await postJSON('/api/admin/purge',{}, {'X-CSRF-Token':csrf});await refresh();message(`Deleted ${d.deleted} expired entries.`);}catch(e){message(e.message);}});
$('exportBtn').addEventListener('click',()=>{const cell=v=>'"'+String(v??'').replace(/^[=+@\-]/,'\'$&').replace(/"/g,'""')+'"';const lines=[['Time (UTC)','Location','IP','Type','Status'].map(cell).join(',')];rows.forEach(r=>lines.push([r.searched_at,r.searched_location,r.ip_address,r.search_type,r.search_status].map(cell).join(',')));const blob=new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='atmosphere360-search-history.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);});
getJSON('/api/admin/session').then(d=>openPanel(d.csrf_token)).catch(()=>{});
