import {$} from './utils.js';
let globe=null;
export function openGlobe(){
 const box=$('globeContainer');if(!box)return;
 if(!window.Globe){box.textContent='3D globe library could not load. Use the 2D weather map or search a city instead.';$('globeStatus').textContent='2D fallback available';return;}
 if(globe){resize();return;}
 globe=Globe({animateIn:true})(box)
 .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
 .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
 .backgroundColor('rgba(0,0,0,0)').showAtmosphere(true).atmosphereColor('#50b2ee').atmosphereAltitude(.18)
 .onGlobeClick(({lat,lng})=>{
   $('globeStatus').textContent=`Selected ${lat.toFixed(2)}°, ${lng.toFixed(2)}° · loading weather…`;
   globe.controls().autoRotate=false;
   window.dispatchEvent(new CustomEvent('weather-location',{detail:{lat,lon:lng,type:'globe'}}));
 });

const controls = globe.controls();

// Prevent extreme zoom into the Earth.
const radius = typeof globe.getGlobeRadius === 'function'
  ? globe.getGlobeRadius()
  : 100;


controls.enableZoom = true;

// Allow zooming much closer to countries and states.
controls.minDistance = radius * 1.15;

// Maximum zoom-out distance.
controls.maxDistance = radius * 9;

// Smooth navigation.
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.zoomSpeed = 0.65;


// Enable smoother globe movement.
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// Automatic rotation.
controls.autoRotate = true;
controls.autoRotateSpeed = 0.24;

// Set the initial globe view.
globe.pointOfView({
  lat: 22,
  lng: 80,
  altitude: 1.7
}, 1100);

 resize();window.addEventListener('resize',resize);
}
function resize(){if(!globe)return;const box=$('globeContainer');globe.width(box.clientWidth);globe.height(box.clientHeight);}
