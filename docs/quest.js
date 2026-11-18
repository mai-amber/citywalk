import * as THREE from './vendor/three.module.min.js';
import { DEG, safeReportURL } from './core.js';
import { StreetTiles } from './street-tiles.js';
import { alignHeadToStreet, headHeading, nextStreet, panoramaRotation, spherePoint, ControllerButtons, MovementGate } from './quest-controls.js';

const $ = id => document.getElementById(id);
const START = { lat: 48.8646, lng: 2.3482, radius: 150 };
const LOCAL_PREVIEW = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('preview');
const headPosition = new THREE.Vector3(), headOrientation = new THREE.Quaternion();
const buttons = new ControllerButtons(), movement = new MovementGate();
let renderer, scene, camera, rig, sky, arrows, hud, hudTexture, hudCanvas, hudContext;
let tiles, current, currentMesh, transition, session, referenceSpace;
let supported = false, ready = false, entering = false, tracked = false;
let primeInputs = true;
const heldTriggers = new Set();
let heading = 270, pitch = 0, desiredHeading = 270, needsAlignment = false;
let message = 'Opening Paris…', messageUntil = Infinity, lastHud = '', drag;
const raycaster = new THREE.Raycaster();
const sphereGeometry = buildSphere();
const arrowGeometry = buildArrow();

function buildSphere() {
  const positions = [], uvs = [], indices = [];
  for (let y = 0; y <= 48; y++) for (let x = 0; x <= 96; x++) {
    const p = spherePoint(x / 96, y / 48);
    positions.push(p.x, p.y, p.z); uvs.push(x / 96, y / 48);
  }
  for (let y = 0; y < 48; y++) for (let x = 0; x < 96; x++) {
    const i = y * 97 + x; indices.push(i, i + 1, i + 97, i + 1, i + 98, i + 97);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
function buildArrow() {
  const shape = new THREE.Shape();
  shape.moveTo(-.35, -.15); shape.lineTo(0, .12); shape.lineTo(.35, -.15);
  shape.lineTo(.35, -.29); shape.lineTo(0, -.02); shape.lineTo(-.35, -.29); shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
function say(text, duration = Infinity) {
  message = text; messageUntil = performance.now() + duration;
  $('status').textContent = text;
}
function disposePanorama(mesh) {
  if (!mesh) return;
  mesh.removeFromParent();
  const texture = mesh.material.map;
  texture?.dispose();
  if (texture?.image) texture.image.width = texture.image.height = 1;
  mesh.material.dispose();
}
function updateAttribution(metadata, extraCopyright = '') {
  $('copyright').textContent = [...new Set([metadata.copyright, extraCopyright].filter(Boolean))].join(' · ');
  const url = safeReportURL(metadata.reportProblemLink);
  $('report').hidden = !url;
  if (url) $('report').href = url;
}
function refreshArrows() {
  for (const arrow of [...arrows.children]) { arrow.material.dispose(); arrows.remove(arrow); }
  for (const link of current?.links || []) {
    if (!link.panoId || !Number.isFinite(link.heading)) continue;
    const arrow = new THREE.Mesh(arrowGeometry, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: .85 }));
    const angle = link.heading * DEG;
    arrow.position.set(Math.sin(angle) * 3, -1.1, -Math.cos(angle) * 3);
    arrow.rotation.set(-Math.PI / 2, 0, -angle);
    arrow.userData.link = link; arrow.renderOrder = 3;
    arrows.add(arrow);
  }
}
async function showPanorama(metadata, canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const mesh = new THREE.Mesh(sphereGeometry, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false, depthWrite: false, transparent: true, opacity: currentMesh ? 0 : 1 }));
  const rotation = panoramaRotation(metadata);
  mesh.rotation.set(rotation.x, rotation.y, rotation.z, 'YXZ');
  renderer.initTexture(texture);
  sky.add(mesh);
  updateAttribution(metadata, current?.copyright);
  if (currentMesh) {
    mesh.renderOrder = 1; currentMesh.renderOrder = 0;
    await new Promise(resolve => { transition = { from: currentMesh, to: mesh, started: performance.now(), resolve }; });
  }
  currentMesh = mesh; current = metadata;
  updateAttribution(metadata);
  refreshArrows();
  $('vr-view').dataset.view = metadata.panoId;
}
async function loadView(location) {
  const metadata = await tiles.metadata(location);
  const zoom = renderer.capabilities.maxTextureSize >= 8192 ? 4 : 3;
  const canvas = await tiles.image(metadata, zoom, progress => say(`Opening street… ${Math.round(progress * 100)}%`));
  await showPanorama(metadata, canvas);
}
async function move() {
  if (!ready || entering || (session && (!tracked || session.visibilityState !== 'visible'))) return;
  const link = nextStreet(current.links, heading);
  if (!link) { say('Look toward a street arrow, then press again.', 3500); return; }
  try {
    await movement.run(async () => {
      say('Opening the next street…');
      // Keep the current complete image visible and head-tracked while the next loads.
      await loadView({ panoId: link.panoId });
      say('Turn your head · Trigger or A/X to move', 3000);
    });
  } catch (error) { say(error.message, 9000); }
}
function makeHud() {
  hudCanvas = document.createElement('canvas'); hudCanvas.width = 1200; hudCanvas.height = 180;
  hudContext = hudCanvas.getContext('2d');
  hudTexture = new THREE.CanvasTexture(hudCanvas);
  hudTexture.colorSpace = THREE.SRGBColorSpace; hudTexture.generateMipmaps = false;
  hudTexture.minFilter = THREE.LinearFilter;
  hud = new THREE.Mesh(new THREE.PlaneGeometry(1.8, .27), new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  hud.renderOrder = 5; hud.visible = false; scene.add(hud);
}
function drawHud() {
  const status = performance.now() < messageUntil ? message : 'Trigger / A / X: move     B / Y: exit';
  const copyright = $('copyright').textContent;
  const key = `${status}|${copyright}`;
  if (key === lastHud) return;
  lastHud = key;
  const c = hudContext;
  c.clearRect(0, 0, 1200, 180);
  c.fillStyle = 'rgba(12,30,25,.82)'; c.beginPath(); c.roundRect(0, 0, 1200, 180, 24); c.fill();
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.font = '30px system-ui'; c.fillText(status, 600, 48, 1136);
  c.font = '27px system-ui'; c.textAlign = 'left'; c.fillText('Google Maps', 28, 100);
  c.font = '24px system-ui'; c.fillText(copyright, 28, 148, 780);
  c.textAlign = 'right'; c.fillText('Report a problem', 1172, 148);
  hudTexture.needsUpdate = true;
}
function reportHit(source, frame) {
  if (!session || !referenceSpace || !frame || !source?.targetRaySpace) return false;
  const pose = frame.getPose(source.targetRaySpace, referenceSpace);
  if (!pose) return false;
  const p = pose.transform.position, q = pose.transform.orientation;
  raycaster.ray.origin.set(p.x, p.y, p.z).applyQuaternion(rig.quaternion);
  raycaster.ray.direction.set(0, 0, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w)).applyQuaternion(rig.quaternion);
  hud.updateMatrixWorld(true);
  const hit = raycaster.intersectObject(hud)[0];
  return !!hit && hit.uv.x > .70 && hit.uv.y < .42;
}
function select(event) {
  if (!tracked || primeInputs || heldTriggers.has(event.inputSource) || session?.visibilityState !== 'visible') return;
  if (reportHit(event.inputSource, event.frame)) {
    const url = safeReportURL(current?.reportProblemLink);
    if (url) { session.end(); window.open(url, '_blank', 'noopener'); }
    return;
  }
  move();
}
function finishVR() {
  session = null; referenceSpace = null; tracked = false;
  buttons.reset(); hud.visible = false; rig.rotation.set(0, 0, 0);
  heldTriggers.clear(); primeInputs = true;
  camera.position.set(0, 0, 0); camera.rotation.set(pitch * DEG, -heading * DEG, 0, 'YXZ');
  sky.position.set(0, 0, 0); arrows.position.set(0, 0, 0);
  document.body.dataset.immersive = 'false';
  renderer.setSize(innerWidth, innerHeight);
  $('enter-vr').disabled = false; $('enter-vr').textContent = 'Enter VR';
  say('Turn your head · Trigger or A/X to move');
}
async function enterVR() {
  if (entering || !ready || !supported) return;
  entering = true; $('enter-vr').disabled = true;
  let requested;
  try {
    // The permission request is directly inside the user's click gesture.
    requested = await navigator.xr.requestSession('immersive-vr');
    session = requested; desiredHeading = heading; needsAlignment = true;
    session.addEventListener('end', finishVR, { once: true });
    session.addEventListener('selectstart', select);
    session.addEventListener('visibilitychange', () => { tracked = false; primeInputs = true; });
    await renderer.xr.setSession(session);
    referenceSpace = renderer.xr.getReferenceSpace();
    referenceSpace.addEventListener('reset', () => { desiredHeading = heading; needsAlignment = true; });
    document.body.dataset.immersive = 'true';
    hud.visible = true; buttons.reset(); primeInputs = true;
    say('Turn your head · Trigger or A/X to move', 5000);
  } catch {
    if (requested) await requested.end().catch(() => {});
    say('VR did not start. Allow VR access in Quest Browser, then try again.');
    $('enter-vr').disabled = false;
  } finally { entering = false; }
}
function frame(time, xrFrame) {
  if (xrFrame && session && referenceSpace) {
    const pose = xrFrame.getViewerPose(referenceSpace);
    tracked = !!pose && session.visibilityState === 'visible';
    if (pose) {
      const q = pose.transform.orientation, p = pose.transform.position;
      if (needsAlignment) { rig.rotation.y = alignHeadToStreet(q, desiredHeading); needsAlignment = false; }
      heading = headHeading(q, rig.rotation.y);
      headPosition.set(p.x, p.y, p.z).applyQuaternion(rig.quaternion);
      headOrientation.set(q.x, q.y, q.z, q.w).premultiply(rig.quaternion);
      // Photos have no translational depth: keep the panorama centered on the head.
      sky.position.copy(headPosition); arrows.position.copy(headPosition);
      hud.position.set(0, -.65, -2).applyQuaternion(headOrientation).add(headPosition);
      hud.quaternion.copy(headOrientation);
    }
    if (!tracked) primeInputs = true;
    else if (primeInputs) {
      // A button held while entering VR or returning from the system menu is not a new press.
      buttons.reset(); buttons.sample(session.inputSources); heldTriggers.clear();
      for (const source of session.inputSources) if (source.gamepad?.buttons[0]?.pressed) heldTriggers.add(source);
      primeInputs = false;
    } else {
      for (const source of heldTriggers) if (!source.gamepad?.buttons[0]?.pressed) heldTriggers.delete(source);
      const pressed = buttons.sample(session.inputSources);
      if (pressed.exit) session.end();
      else if (pressed.move) move();
    }
  } else if (!session) {
    camera.rotation.set(pitch * DEG, -heading * DEG, 0, 'YXZ');
  }
  if (transition) {
    const progress = Math.min(1, (performance.now() - transition.started) / 180);
    transition.to.material.opacity = progress;
    if (progress === 1) {
      const finished = transition; transition = null;
      disposePanorama(finished.from); finished.resolve();
    }
  }
  const next = nextStreet(current?.links, heading);
  for (const arrow of arrows.children) arrow.material.color.set(arrow.userData.link.panoId === next?.panoId ? '#8ce8c5' : '#ffffff');
  $('preview-move').disabled = !ready || movement.busy || !next;
  $('preview-heading').textContent = `${Math.round(heading)}°`;
  if (hud.visible) drawHud();
  renderer.render(scene, camera);
}
function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local');
  renderer.xr.setFramebufferScaleFactor(1);
  $('vr-view').append(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color('#183b33');
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, .01, 1200);
  rig = new THREE.Group(); rig.add(camera); scene.add(rig);
  sky = new THREE.Group(); arrows = new THREE.Group(); scene.add(sky, arrows);
  makeHud();
  renderer.setAnimationLoop(frame);
  renderer.domElement.addEventListener('pointerdown', event => {
    if (session) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    heading -= (event.clientX - drag.x) * .15;
    pitch = Math.max(-80, Math.min(80, pitch + (event.clientY - drag.y) * .15));
    drag.x = event.clientX; drag.y = event.clientY;
  });
  for (const name of ['pointerup', 'pointercancel']) renderer.domElement.addEventListener(name, () => { drag = null; });
  window.addEventListener('resize', () => {
    if (session) return;
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  });
  $('enter-vr').addEventListener('click', enterVR);
  $('preview-move').addEventListener('click', move);
  $('preview-controls').hidden = !LOCAL_PREVIEW;
}
async function start() {
  try {
    setup();
    supported = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
    const response = await fetch('./maps-config.json', { cache: 'no-store' });
    const config = await response.json();
    tiles = new StreetTiles(config.apiKey);
    await loadView(START);
    ready = true;
    $('enter-vr').disabled = !supported;
    $('enter-vr').textContent = supported ? 'Enter VR' : 'Open this link in Quest Browser';
    say(supported ? 'Press B/Y or the browser menu to exit VR.' : 'No headset detected. The phone view is also available.');
  } catch (error) {
    say(error.message);
    $('enter-vr').textContent = 'Try again'; $('enter-vr').disabled = false;
    $('enter-vr').onclick = () => location.reload();
  }
}
start();
