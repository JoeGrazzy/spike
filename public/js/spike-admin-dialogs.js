// Shared modal close control: .spike-dialog-xclose is rendered by spike-dialog.js.
(()=>{'use strict';
 const ui=window.SPIKEPremiumDialog;
 if(!ui){console.error('[SPIKE] Premium dialog runtime was not loaded.');return;}
 const toast=(message,options={})=>window.spikePremiumToast?.(message,options.tone||'info',options.duration||5200);
 const alert=(message,options={})=>ui.alert(message,{title:options.title||'SPIKE Admin',kind:options.tone==='error'?'danger':options.tone||'info',confirmText:options.confirmText||'Got it'});
 window.spikeDialog={alert,toast,success:(message,options={})=>ui.alert(message,{...options,title:options.title||'Success',kind:'success'}),warning:(message,options={})=>ui.alert(message,{...options,title:options.title||'Please note',kind:'warning'}),error:(message,options={})=>ui.alert(message,{...options,title:options.title||'Something went wrong',kind:'danger'}),info:(message,options={})=>ui.alert(message,{...options,title:options.title||'SPIKE update',kind:'info'}),confirm:(message,options={})=>ui.confirm(typeof message==='string'?{...options,message}:message),prompt:(message,options={})=>ui.prompt(message,options),choose:(message,options={})=>ui.options({...options,message})};
})();
