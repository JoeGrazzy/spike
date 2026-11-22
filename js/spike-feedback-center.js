/* SPIKE feedback compatibility shim.
 * Toast rendering is owned by spike-dialog.js so every page shares one polished design.
 */
(()=>{
  'use strict';
  if(typeof window.spikePremiumToast==='function')window.spikeFeedbackPreview=window.spikePremiumToast;
})();
