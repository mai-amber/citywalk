// Local test only: synthetic device readings verify gyro logging without claiming a hardware test.
let alpha=0;
const button=document.createElement('button');button.textContent='Simulate 45° device turn';
button.style.cssText='position:fixed;top:120px;right:8px;z-index:99;padding:12px;background:white;color:black';
button.onclick=()=>{alpha+=45;};document.body.append(button);
setInterval(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha,beta:90,gamma:0})),50);
await import('/app.js?v=4');
