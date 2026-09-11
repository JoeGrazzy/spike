if("serviceWorker" in navigator){
const install=()=>navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(()=>{});
if("requestIdleCallback" in window) requestIdleCallback(install,{timeout:2500});
else setTimeout(install,1500);
}
