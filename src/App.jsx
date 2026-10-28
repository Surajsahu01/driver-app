import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const API = (import.meta.env.VITE_API_URL || `${location.protocol}//${location.hostname}:3000`).replace(/\/+$/, '');
const RADIUS = Number(import.meta.env.VITE_ALERT_RADIUS_KM || 5);
const INTERVAL = Number(import.meta.env.VITE_CHECK_INTERVAL_MS || 15000);
const keyOf = a => String(a.id ?? `${a.poleId}-${a.time}`);
const ago = t => { const s = Math.max(0, Math.round((Date.now()-new Date(t).getTime())/1000)); return s<60?'Just now':`${Math.round(s/60)} min ago`; };

export default function App() {
  const [gps,setGps]=useState(null), [gpsState,setGpsState]=useState('Waiting for GPS permission');
  const [status,setStatus]=useState('loading'), [message,setMessage]=useState('Allow location access to check nearby animal alerts.');
  const [alerts,setAlerts]=useState([]), [lastCheck,setLastCheck]=useState(null);
  const [notifications,setNotifications]=useState('default'), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const latest=useRef(null), spoken=useRef(new Set()), checking=useRef(false), watch=useRef(null);

  const notify = useCallback((title,body) => {
    if ('Notification' in window && Notification.permission==='granted') {
      try { new Notification(title,{body,tag:'animal-road-safety'}); } catch {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(body); utterance.lang='en-IN'; utterance.rate=.94;
      window.speechSynthesis.speak(utterance);
    }
  },[]);

  const checkDanger=useCallback(async (forceGps=false) => {
    if(checking.current) return;
    checking.current=true; setBusy(true); setError('');
    try {
      let coords=latest.current;
      if(forceGps || !coords) {
        if(!navigator.geolocation) throw new Error('This browser does not support GPS location.');
        coords=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(
          p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:Math.round(p.coords.accuracy)}),
          e=>reject(new Error(e.code===1?'Location permission denied. Allow location access in browser settings.':e.code===2?'GPS location is unavailable. Check phone location services.':'GPS request timed out. Try again.')),
          {enableHighAccuracy:true,timeout:12000,maximumAge:5000}));
        latest.current=coords; setGps(coords); setGpsState('Location active');
      }
      const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),10000);
      let response;
      try { response=await fetch(`${API}/api/check-danger`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...coords,radiusKm:RADIUS}),signal:controller.signal}); }
      finally { clearTimeout(timer); }
      if(!response.ok) throw new Error(`Safety server returned HTTP ${response.status}.`);
      const data=await response.json(); const list=[...(data.alerts||[])].sort((a,b)=>a.distanceKm-b.distanceKm);
      setAlerts(list); setStatus(data.danger?'danger':'safe'); setMessage(data.message|| (data.danger?'Animal alert detected nearby.':'No active emergency alert nearby.'));
      setLastCheck(new Date());
      const fresh=list.filter(a=>!spoken.current.has(keyOf(a)));
      if(data.danger && fresh.length) { fresh.forEach(a=>spoken.current.add(keyOf(a))); const a=fresh[0]; notify('Animal road-safety warning',`Animal alert approximately ${a.distanceKm} kilometres away. Reduce speed safely and stay alert.`); }
    } catch(e) {
      setStatus('error'); setMessage(e.name==='AbortError'?'The safety server took too long to respond.':e.message.includes('Failed to fetch')?'Cannot connect to safety server. Check the API URL, network, and server CORS settings.':e.message);
      setError(e.message); setAlerts([]);
    } finally { checking.current=false; setBusy(false); }
  },[notify]);

  const enableLocation=useCallback(async()=>{
    setError('');
    if(!navigator.geolocation){setGpsState('GPS unsupported');setError('This browser does not support GPS location.');return;}
    setGpsState('Requesting permission…');
    navigator.geolocation.getCurrentPosition(p=>{
      const c={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:Math.round(p.coords.accuracy)};
      latest.current=c;setGps(c);setGpsState('Location active');checkDanger(false);
      if(watch.current!==null) navigator.geolocation.clearWatch(watch.current);
      watch.current=navigator.geolocation.watchPosition(pos=>{
        const next={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:Math.round(pos.coords.accuracy)};
        latest.current=next;setGps(next);setGpsState('Location active');
      },e=>setGpsState(e.code===1?'Location permission denied':'GPS signal temporarily unavailable'),{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
    },e=>{setGpsState('Location unavailable');setError(e.code===1?'Location permission denied. Allow it in browser site settings.':e.code===2?'GPS location unavailable. Enable phone location services.':'GPS request timed out.');},{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
  },[checkDanger]);

  const enableNotifications=async()=>{
    if(!('Notification' in window)){setNotifications('unsupported');return;}
    const result=await Notification.requestPermission();setNotifications(result);
    if(result==='granted') new Notification('Animal Alert notifications enabled',{body:'This browser can now show safety alerts while the page is open.'});
  };

  useEffect(()=>{
    if('Notification' in window) setNotifications(Notification.permission); else setNotifications('unsupported');
    const timer=setInterval(()=>{ if(latest.current) checkDanger(false); },INTERVAL);
    const socket=io(API,{transports:['websocket','polling'],reconnection:true});
    ['animal-alert','alert-updated','alert-deleted','alerts-bulk-updated'].forEach(evt=>socket.on(evt,()=>{if(latest.current)checkDanger(false)}));
    const visibility=()=>{if(!document.hidden && latest.current)checkDanger(false)};
    document.addEventListener('visibilitychange',visibility);
    return ()=>{clearInterval(timer);socket.close();document.removeEventListener('visibilitychange',visibility);if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);};
  },[checkDanger]);

  const danger=status==='danger';
  return <div className="app-shell">
    <header className="app-header">
      <div className="brand-mark">A</div>
      <div className="brand-copy"><strong>Animal Alert</strong><span>Driver safety</span></div>
      <div className={`connection ${status==='error'?'offline':''}`}><i />{status==='error'?'Offline':'Live'}</div>
    </header>

    <main className="mobile-main">
      <section className={`safety-card ${status}`}>
        <div className="status-heading"><span className="status-symbol">{danger?'!':status==='safe'?'✓':status==='error'?'!':'…'}</span><span className="status-label">{danger?'WARNING':status==='safe'?'ALL CLEAR':status==='error'?'CONNECTION ISSUE':'CHECKING'}</span></div>
        <h1>{danger?'Animal alert nearby':status==='safe'?'No nearby alerts':status==='error'?'Safety check failed':'Check your safety'}</h1>
        <p>{message}</p>
        {danger&&<div className="warning-tip">Slow down safely. Stay alert and watch the road.</div>}
        <button className="main-button" onClick={()=>checkDanger(true)} disabled={busy}>{busy?'Checking…':'Check safety now'}</button>
      </section>

      <section className="simple-card">
        <div className="section-title"><div><span className="section-kicker">PHONE LOCATION</span><h2>GPS location</h2></div><span className={`state-tag ${gps?'active':''}`}>{gps?'Active':'Off'}</span></div>
        <div className="location-detail"><span className="location-icon">⌖</span><div><strong>{gps?'Location detected':'Location not enabled'}</strong><span>{gps?`Accuracy about ±${gps.accuracy} m`:gpsState}</span>{gps&&<small>{gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</small>}</div></div>
        <button className="secondary-button" onClick={enableLocation}>{gps?'Refresh location':'Enable phone GPS'}</button>
        {gps&&<a className="map-link" href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`} target="_blank" rel="noreferrer">Open my location in Maps</a>}
      </section>

      <section className="simple-card notification-card">
        <div className="section-title"><div><span className="section-kicker">SOUND & NOTIFICATIONS</span><h2>Safety alerts</h2></div><span className={`state-tag ${notifications==='granted'?'active':''}`}>{notifications==='granted'?'On':notifications==='unsupported'?'N/A':notifications==='denied'?'Blocked':'Off'}</span></div>
        <p className="helper-text">Get a phone notification and spoken warning when a nearby animal alert is detected.</p>
        <button className="secondary-button" onClick={enableNotifications} disabled={notifications==='granted'||notifications==='unsupported'}>{notifications==='granted'?'Notifications enabled':notifications==='unsupported'?'Notifications unavailable':notifications==='denied'?'Allow in browser settings':'Enable notifications'}</button>
      </section>

      <section className="simple-card reports-card">
        <div className="section-title"><div><span className="section-kicker">SAFETY NETWORK</span><h2>Nearby reports</h2></div><span className="report-count">{alerts.length}</span></div>
        <p className="reports-subtitle">Within {RADIUS} km of your phone</p>
        {!alerts.length?<div className="empty-state"><span className="empty-check">{status==='error'?'!':'✓'}</span><strong>{status==='error'?'Reports unavailable':'No active reports nearby'}</strong><p>{status==='error'?'Check your connection and try again.':'Nearby emergency reports will appear here.'}</p></div>:<div className="alert-list">{alerts.map((a,i)=><article className="alert-row" key={keyOf(a)||i}><div className="alert-badge">!</div><div className="alert-info"><strong>{a.level==='ANIMAL_ON_ROAD_EMERGENCY'?'ANIMAL ON ROAD':'ANIMAL NEAR ROAD'}</strong><span>Pole {a.poleId||'Unknown'} · Animal #{a.animalId??'—'}</span><span>{Number(a.distanceKm).toFixed(2)} km away · {ago(a.time)}</span></div><a className="map-button" href={a.mapLink||`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer">Map</a></article>)}</div>}
      </section>

      <div className="update-info"><span>Last check: {lastCheck?lastCheck.toLocaleTimeString():'Not checked yet'}</span><span>Updates every {Math.round(INTERVAL/1000)} sec</span></div>
      {error&&<div className="error-note"><strong>Needs attention</strong><span>{error}</span><span>Server: {API}</span></div>}
      
    </main>
    
  </div>;
}
