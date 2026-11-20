import { OrientationInput } from './sensors.js';
import { selectForwardLink } from './core.js';
import { povFromQuaternion } from './street-view-controls.js';
import { sessionUI } from './session-ui.js';

const $ = id => document.getElementById(id);
const sensors = new OrientationInput();
const START = { lat: 48.8646, lng: 2.3482 };
const START_HEADING = 270;
let panorama, mode = 'regular', ready = false, switching = false;
let modeRequest = 0, noticeTimer, animation;
const recording = sessionUI({platform:'phone_web',canStart:()=>ready,context:()=>({
  condition:mode,view_id:panorama?.getPano()||'',heading_deg:panorama?.getPov().heading,
  pitch_deg:panorama?.getPov().pitch,roll_deg:0,zoom:panorama?.getZoom(),
  source:mode==='gyro'?'device':'view',tracking_valid:mode==='gyro'?Number(sensors.fresh):Number(ready),display_state:'sdk_managed',
})});
const log=recording.logger;
let lastSensorValid;
function recordPose() {
  if(ready&&!document.hidden) {
    const valid=mode!=='gyro'||sensors.fresh;
    if(log.active&&valid!==lastSensorValid)log.event(valid?'tracking_available':'tracking_lost');
    lastSensorValid=valid;
    const q=sensors.raw;
    log.sample(mode==='gyro'&&valid?{qx:q.x,qy:q.y,qz:q.z,qw:q.w}:{});
  }
  requestAnimationFrame(recordPose);
}
recordPose();
for(const name of ['pointerdown','pointerup','pointercancel'])$('view').addEventListener(name,event=>{
  log.event(name==='pointerdown'?'input_down':name==='pointerup'?'input_up':'input_cancel',{
    source:event.pointerType||'pointer',detail:`x_norm=${(event.clientX/innerWidth).toFixed(4)};y_norm=${(event.clientY/innerHeight).toFixed(4)}`,
  });
},true);
$('view').addEventListener('wheel',()=>log.event('zoom_input',{source:'wheel'}),{passive:true});
document.addEventListener('keydown',event=>{if(event.target.tagName!=='INPUT'&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','-'].includes(event.key))log.event('input_down',{source:'keyboard',detail:event.key});});

function notice(message, duration = 7000) {
  $('notice').textContent = message;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, duration);
}

function updateControls() {
  document.body.dataset.mode = mode;
  $('regular').setAttribute('aria-pressed', String(mode === 'regular'));
  $('gyro').setAttribute('aria-pressed', String(mode === 'gyro'));
  $('regular').disabled = $('gyro').disabled = !ready || switching;
  $('recenter').hidden = $('forward').hidden = mode !== 'gyro';
  $('hint').textContent = mode === 'regular'
    ? 'Swipe to look · Tap the street to move'
    : 'Turn your phone to look around';
  updateForward();
}

function nextLink() {
  return selectForwardLink(
    (panorama?.getLinks() || []).filter(link => link.pano),
    panorama?.getPov().heading ?? START_HEADING,
    55,
  );
}

function updateForward() {
  $('forward').disabled = !ready || !nextLink() || !sensors.fresh;
}

function regularMode() {
  const previous=mode;
  ++modeRequest;
  sensors.stop();
  cancelAnimationFrame(animation);
  switching = false;
  mode = 'regular';
  if(previous!==mode)log.event('mode_change',{detail:`from=${previous};to=${mode}`});
  // Returning to touch keeps exactly the current view.
  updateControls();
}

function trackPhone() {
  if (mode !== 'gyro') return;
  if (sensors.fresh) {
    panorama.setPov(povFromQuaternion(sensors.quaternion, panorama.getPov().heading));
  }
  updateForward();
  animation = requestAnimationFrame(trackPhone);
}

async function gyroMode() {
  if (!ready || switching || mode === 'gyro') return;
  const request = ++modeRequest;
  switching = true;
  updateControls();
  try {
    // Existing phone orientation and yaw calibration, called from the tap for iOS permission.
    await sensors.start(panorama.getPov().heading);
    if (request !== modeRequest || document.hidden) { sensors.stop(); return; }
    mode = 'gyro';
    log.event('mode_change',{detail:'from=regular;to=gyro'});
    trackPhone();
  } catch (error) {
    log.event('tracking_error',{detail:'orientation_unavailable'});
    sensors.stop();
    if (request === modeRequest) notice(error.message);
  } finally {
    if (request === modeRequest) { switching = false; updateControls(); }
  }
}

$('regular').addEventListener('click', regularMode);
$('gyro').addEventListener('click', gyroMode);
$('recenter').addEventListener('click', () => {
  if (!sensors.fresh) { notice('Motion tracking paused. Tap Regular, then Gyro to reconnect.'); return; }
  sensors.calibrate(START_HEADING);
  log.event('recenter',{source:'button'});
  notice('View centered.', 1500);
});
$('forward').addEventListener('click', () => {
  log.event('move_request',{source:'forward_button'});
  if (!ready || mode !== 'gyro' || !sensors.fresh) {log.event('move_blocked',{detail:'not_ready_or_tracking_unavailable'});return;}
  const link = nextLink();
  if (link) {log.event('navigation_requested',{target_view_id:link.pano,detail:'SDK view change is not an image-ready timestamp'});panorama.setPano(link.pano);}
  else log.event('move_blocked',{detail:'no_link'});
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (mode === 'gyro' || switching)) regularMode();
});
window.addEventListener('pagehide', regularMode);

function fail(message) {
  log.event('viewer_error',{detail:'street_view_unavailable'});
  ready = false;
  regularMode();
  $('loading').hidden = false;
  $('loading-message').textContent = message;
  $('retry').hidden = false;
}
$('retry').addEventListener('click', () => location.reload());

async function loadMaps(key) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Street View took too long to load. Check your connection and try again.')), 20000);
    window.cityWalkReady = () => { clearTimeout(timeout); resolve(); };
    window.gm_authFailure = () => {
      clearTimeout(timeout);
      fail('Street View could not connect to Google Maps. Please try again shortly.');
      reject(new Error('Google Maps authorization failed.'));
    };
    const script = document.createElement('script');
    const query = new URLSearchParams({ key, v: 'quarterly', loading: 'async', callback: 'cityWalkReady', language: 'en', region: 'FR' });
    script.src = `https://maps.googleapis.com/maps/api/js?${query}`;
    script.async = true;
    script.onerror = () => { clearTimeout(timeout); reject(new Error('Street View could not load. Check your connection and try again.')); };
    document.head.appendChild(script);
  });
}

async function start() {
  updateControls();
  if (!new URLSearchParams(location.search).has('mode') && navigator.xr) {
    const immersive = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
    if (immersive) { location.replace('./quest.html'); return; }
  }
  try {
    const response = await fetch('./maps-config.json', { cache: 'no-store' });
    const config = response.ok ? await response.json() : {};
    if (!config.apiKey) throw new Error('Street View is being connected. Please try again shortly.');
    await loadMaps(config.apiKey);
    const { StreetViewPanorama, StreetViewService, StreetViewPreference, StreetViewSource, StreetViewStatus } = await google.maps.importLibrary('streetView');
    const { data } = await new StreetViewService().getPanorama({
      location: START, radius: 150,
      preference: StreetViewPreference.NEAREST,
      sources: [StreetViewSource.OUTDOOR],
    });
    panorama = new StreetViewPanorama($('view'), {
      pano: data.location.pano,
      pov: { heading: START_HEADING, pitch: 0 },
      zoom: 1,
      clickToGo: true,
      linksControl: true,
      scrollwheel: true,
      zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
      panControl: false,
      addressControl: false,
      fullscreenControl: false,
      enableCloseButton: false,
      motionTracking: false,
      motionTrackingControl: false,
    });
    panorama.addListener('links_changed', updateForward);
    panorama.addListener('pov_changed', updateForward);
    panorama.addListener('pano_changed',()=>log.viewChanged(panorama.getPano()));
    panorama.addListener('zoom_changed',()=>log.event('zoom_change'));
    panorama.addListener('status_changed', () => {
      log.event('sdk_status',{detail:String(panorama.getStatus())});
      if (panorama.getStatus() !== StreetViewStatus.OK) notice('That view is unavailable. Try another street arrow.');
    });
    ready = true;
    recording.start();
    $('loading').hidden = true;
    updateControls();
  } catch (error) { fail(error.message || 'Street View could not load. Please try again.'); }
}

start();
