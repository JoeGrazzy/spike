/* SPIKE account settings: persist supported privacy fields to the signed-in profile;
   keep device-only feed/notification preferences local and label unsupported fields. */
(() => {
  'use strict';
  if (window.__SPIKE_SETTINGS_CONTROLLER__) return;
  window.__SPIKE_SETTINGS_CONTROLLER__ = true;
  const $ = (id) => document.getElementById(id);
  const PREF_KEY = 'spike-settings-local-v1';
  const localIds = [
    'feedSensitive','feedSpoilers','feedPolitical','feedFollowingOnly','feedMutedKeywords',
    'messageTone','np_likes','np_comments','np_mentions','np_follows','np_friend_requests',
    'np_messages','np_coins','np_purchases','np_announcements','np_system'
  ];
  const defaults = {
    feedSensitive:false,feedSpoilers:true,feedPolitical:true,feedFollowingOnly:false,feedMutedKeywords:'',
    messageTone:false,np_likes:true,np_comments:true,np_mentions:true,np_follows:true,
    np_friend_requests:true,np_messages:true,np_coins:true,np_purchases:true,np_announcements:true,np_system:true
  };
  const say = (message, bad=false) => { const node=$('status'); if(node){node.textContent=message;node.style.color=bad?'#fb7185':'';} };
  const readLocal = () => { try { return {...defaults,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}; } catch (_) { return {...defaults}; } };
  const writeLocal = (prefs) => { try { localStorage.setItem(PREF_KEY,JSON.stringify(prefs)); return true; } catch (_) { return false; } };
  function setValue(id,value){const node=$(id);if(!node)return;if(node.type==='checkbox')node.checked=!!value;else node.value=String(value??'');}
  function getValue(id){const node=$(id);if(!node)return undefined;return node.type==='checkbox'?node.checked:node.value;}
  function loadLocal(){const prefs=readLocal();localIds.forEach(id=>setValue(id,prefs[id]));}
  function saveLocal(){const prefs={};localIds.forEach(id=>{prefs[id]=getValue(id)});if(!writeLocal(prefs))throw new Error('This device could not save local preferences. Check browser storage permissions.');try{localStorage.setItem('spike-setting-messageTone',prefs.messageTone?'1':'0')}catch(_){}}
  function markUnsupported(){
    for(const id of ['feedSensitive','feedSpoilers','feedPolitical']){const node=$(id);if(node){node.disabled=true;node.title='The current posts schema does not include this content label yet.';const label=node.closest('.row')?.querySelector('small');if(label)label.textContent='Not available yet — SPIKE posts do not currently store this content label.';}}
    for(const id of ['posts','media','friends']){const node=$(id);if(node){node.disabled=true;node.title='This privacy control is not supported by the current account schema yet.';const label=node.closest('.row')?.querySelector('small');if(label)label.textContent='Not available yet — this control is not connected to an account privacy setting.';}}
    const profile=$('profile');if(profile){profile.querySelectorAll('option').forEach(o=>{if(o.value==='friends')o.remove()});}
    const messages=$('messages');if(messages){messages.querySelectorAll('option').forEach(o=>{if(o.value==='friends')o.value='followers';if(o.value==='followers')o.textContent='People I follow'});}
  }
  async function boot(){
    const client=window.SPIKE_PLATFORM?.getClient?.();
    if(!client){say('Account settings could not connect to SPIKE.',true);return;}
    try{
      const session=await window.SPIKE_PLATFORM.getSession();
      if(!session?.user){location.replace('index.html');return;}
      const {data,error}=await client.from('profiles').select('id,is_private,presence_visible,message_privacy,account_status').eq('id',session.user.id).maybeSingle();
      if(error)throw error;if(!data)throw new Error('Your account profile could not be found.');
      setValue('online',data.presence_visible!==false);
      setValue('messages',data.message_privacy||'everyone');
      setValue('profile',data.is_private?'private':'public');
      loadLocal();markUnsupported();
      $('save')?.addEventListener('click',async()=>{
        const button=$('save');button.disabled=true;say('Saving your settings…');
        try{
          const visibility=getValue('profile');
          const privacy={presence_visible:!!getValue('online'),message_privacy:getValue('messages'),is_private:visibility==='private'};
          if(!['everyone','followers','nobody'].includes(privacy.message_privacy))throw new Error('Choose a valid message privacy option.');
          const update=await client.from('profiles').update(privacy).eq('id',session.user.id).select('id').maybeSingle();
          if(update.error)throw update.error;if(!update.data)throw new Error('No account settings were updated. Please sign in again.');
          saveLocal();say('Account privacy saved. Feed and notification preferences are saved on this device.');
        }catch(err){say(err.message||'Settings could not be saved.',true)}finally{button.disabled=false;}
      });
      const passwordForm=$('spikePasswordChangeForm');
      passwordForm?.addEventListener('submit',async(event)=>{
        event.preventDefault();
        const button=$('spikePasswordChangeBtn');
        const feedback=$('spikePasswordChangeStatus');
        const currentPassword=$('securityCurrentPassword')?.value||'';
        const newPassword=$('securityNewPassword')?.value||'';
        const confirmPassword=$('securityConfirmPassword')?.value||'';
        const report=(message,bad=false)=>{if(feedback){feedback.textContent=message;feedback.style.color=bad?'#fb7185':'';}};
        if(!currentPassword)return report('Enter your current password.',true);
        if(newPassword.length<8||newPassword.length>128)return report('Your new password must be between 8 and 128 characters.',true);
        if(newPassword!==confirmPassword)return report('The new passwords do not match.',true);
        if(newPassword===currentPassword)return report('Choose a password different from your current one.',true);
        if(!session.user.email)return report('This account has no email/password sign-in. Use its configured sign-in provider or password recovery.',true);
        button.disabled=true;button.textContent='Updating…';report('Verifying your current password…');
        try{
          const {error}=await client.auth.updateUser({password:newPassword,currentPassword});
          if(error)throw error;
          passwordForm.reset();report('Password updated successfully. Keep it private and do not reuse it on other sites.');
        }catch(error){
          const message=String(error?.message||'Password could not be updated.');
          report(/current.?password|password.*incorrect|invalid.*credentials/i.test(message)?'Your current password was not accepted. Check it and try again.':message,true);
        }finally{button.disabled=false;button.textContent='Update password';}
      });
      $('notify')?.addEventListener('click',async()=>{
        if(!('Notification' in window)){say('Browser notifications are not supported on this device.',true);return;}
        try{const permission=await Notification.requestPermission();say(permission==='granted'?'Browser notifications are enabled.':permission==='denied'?'Browser notifications were blocked in browser settings.':'Notification permission was not granted.',permission!=='granted');$('notify').textContent=permission==='granted'?'Enabled':'Enable';}catch(_){say('Could not request notification permission.',true)}
      });
      $('signout')?.addEventListener('click',async()=>{const b=$('signout');b.disabled=true;try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;location.replace('index.html');}catch(err){say(err.message||'Could not sign out.',true);b.disabled=false;}});
      if('Notification' in window&&Notification.permission==='granted')$('notify').textContent='Enabled';
      say('Your account privacy settings are loaded.');
    }catch(err){console.error('[SPIKE Settings]',err);say(err.message||'Settings could not load.',true);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
})();
