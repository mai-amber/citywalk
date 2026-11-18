// Local-only integration test with Meta's real WebXR emulator, never deployed.
import { XRDevice, metaQuest3 } from 'https://unpkg.com/iwer@2.8.0/build/iwer.module.js';
const device = new XRDevice(metaQuest3);
device.stereoEnabled = true;
device.installRuntime({ forceInstall: true });
const panel = document.createElement('aside');
panel.id = 'xr-test-controls';
panel.style.cssText = 'position:fixed;right:8px;top:8px;z-index:2147483647;width:200px;background:#fff;color:#153f35;padding:12px;border-radius:12px;font:13px system-ui';
const title = document.createElement('strong'); title.textContent = 'Quest emulator · local test'; panel.append(title);
const output = document.createElement('output'); output.id = 'test-result'; panel.append(output);
let yaw = 0;
const setYaw = value => { yaw = value; device.quaternion.set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)); };
function button(label, action) {
  const element = document.createElement('button'); element.textContent = label;
  element.style.cssText = 'display:block;width:100%;margin-top:8px;padding:6px;min-height:30px;font-size:12px';
  element.onclick = () => { action(); output.textContent = label; };
  panel.append(element);
}
function press(hand, name) {
  device.controllers[hand].updateButtonValue(name, 1);
  setTimeout(() => device.controllers[hand].updateButtonValue(name, 0), 120);
}
button('Look left 45°', () => setYaw(yaw + Math.PI / 4));
button('Look right 45°', () => setYaw(yaw - Math.PI / 4));
button('Right trigger', () => press('right', 'trigger'));
button('Left trigger', () => press('left', 'trigger'));
button('A button', () => press('right', 'a-button'));
button('Hold X', () => device.controllers.left.updateButtonValue('x-button', 1));
button('Release X', () => device.controllers.left.updateButtonValue('x-button', 0));
button('Recenter headset', () => device.recenter());
button('Blur session', () => device.updateVisibilityState('visible-blurred'));
button('Resume session', () => device.updateVisibilityState('visible'));
button('B · Exit VR', () => press('right', 'b-button'));
document.body.append(panel);
await import('/quest.js?v=3');
