(()=>{
  /* v6: local-first. Background/lock/unlock can NEVER pull navigation. */
  const DATA_DIRTY='aliyun_quiz_data_dirty_v6',NAV_DIRTY='aliyun_quiz_nav_dirty_v6';
  let dataDirty=false,navDirty=false,ready=false,uploadTimer=null,uploading=false,lastSig='';
  try{dataDirty=localStorage.getItem(DATA_DIRTY)==='1';navDirty=localStorage.getItem(NAV_DIRTY)==='1'}catch(e){}
  const flag=(k,v)=>{try{localStorage.setItem(k,v?'1':'0')}catch(e){}};
  const sig=()=>`${state.mode}|${Number(state.positions?.[state.mode]??state.index??0)}`;
  const persist=async()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}try{await idbSet(state)}catch(e){}};
  const nav=()=>{const l=list(),i=Math.max(0,Math.min(Number(state.positions?.[state.mode]??state.index??0),Math.max(0,l.length-1)));return{mode:state.mode,index:i,questionId:l[i]?.id??null}};
  const applyNav=(m,i)=>{if(!MODES.includes(m))return;state.mode=m;state.positions=state.positions||structuredClone(DEF.positions);state.positions[m]=Math.max(0,Number(i)||0);state.index=state.positions[m];lastSig=sig()};

  /* IMPORTANT: legacy index.html already registered a visibilitychange pull listener.
     Capture phase stops that old listener before it can run on phone unlock. */
  document.addEventListener('visibilitychange',e=>{
    e.stopImmediatePropagation();
    if(document.visibilityState==='hidden'&&user&&(dataDirty||navDirty))pushNow();
  },true);
  window.addEventListener('online',e=>{e.stopImmediatePropagation();if(user&&(dataDirty||navDirty))schedulePush()},true);

  const originalInitCloud=initCloud;
  initCloud=async function(){try{return await originalInitCloud()}finally{ready=true;lastSig=sig()}};
  setTimeout(()=>{if(!ready){ready=true;lastSig=sig()}},2000);

  localSave=function(){
    if(ready){const s=sig();dataDirty=true;flag(DATA_DIRTY,true);if(lastSig&&s!==lastSig){navDirty=true;flag(NAV_DIRTY,true)}lastSig=s}
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}idbSet(state);if(ready)schedulePush();
  };
  schedulePush=function(){if(suppressPush||!user||(!dataDirty&&!navDirty))return;clearTimeout(uploadTimer);uploadTimer=setTimeout(()=>pushNow(),1000)};
  async function cloudRow(){const {data,error}=await sb.from('quiz_progress').select('state,nav_mode,nav_index,nav_question_id,nav_version,nav_updated_at,device_id').eq('user_id',user.id).maybeSingle();if(error)throw error;return data}

  pushNow=async function(){
    if(!sb||!user)return false;if(uploading){schedulePush();return false}uploading=true;
    const n=nav(),s=sig(),dd=dataDirty,nd=navDirty;
    try{status('正在上传…');const cloud=await cloudRow();const merged=cloud?.state?merge(state,cloud.state):norm(state);merged.mode=n.mode;merged.positions=merged.positions||structuredClone(DEF.positions);merged.positions[n.mode]=n.index;merged.index=n.index;
      const {error}=await sb.rpc('sync_quiz_progress',{p_state:merged,p_device_id:deviceId,p_nav_changed:nd||!cloud?.nav_mode,p_nav_mode:n.mode,p_nav_index:n.index,p_nav_question_id:n.questionId});if(error)throw error;
      if(sig()===s){if(dd){dataDirty=false;flag(DATA_DIRTY,false)}if(nd){navDirty=false;flag(NAV_DIRTY,false)}}await persist();status('已上传 · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),'ok');return true
    }catch(e){status('上传失败：'+e.message,'err');return false}finally{uploading=false;if(dataDirty||navDirty)schedulePush()}
  };

  /* Manual/startup pull only. Never called by lock/unlock. */
  syncNow=async function(){
    if(!sb||!user||syncing)return;if(dataDirty||navDirty||uploading){schedulePush();status('本机有新进度，先上传','ok');return}
    syncing=true;const before=sig();status('正在读取云端…');
    try{const cloud=await cloudRow();if(!cloud){await pushNow();return}if(sig()!==before)return;suppressPush=true;state=cloud.state?merge(state,cloud.state):norm(state);if(cloud.nav_mode!=null)applyNav(cloud.nav_mode,cloud.nav_index);await persist();suppressPush=false;document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.mode===state.mode));render();status('已读取云端 · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),'ok')}
    catch(e){suppressPush=false;status('同步失败：'+e.message,'err')}finally{syncing=false}
  };
  cloudPullAndMerge=async()=>{if(dataDirty||navDirty)schedulePush()};clearTimeout(pushTimer);clearTimeout(uploadTimer);
  const btn=document.getElementById('syncBtn');if(btn)btn.onclick=syncNow;
})();
