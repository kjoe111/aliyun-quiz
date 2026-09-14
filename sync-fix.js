(()=>{
  const DIRTY_KEY='aliyun_quiz_cloud_dirty_v1';
  let localDirty=false;
  try{localDirty=localStorage.getItem(DIRTY_KEY)==='1';}catch(e){}

  const setDirty=v=>{localDirty=!!v;try{localStorage.setItem(DIRTY_KEY,localDirty?'1':'0')}catch(e){}};
  const persistLocal=async()=>{
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}
    try{await idbSet(state)}catch(e){}
  };

  localSave=function(){
    setDirty(true);
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}
    idbSet(state);
    schedulePush();
  };

  schedulePush=function(){
    if(suppressPush||!user||!localDirty)return;
    clearTimeout(pushTimer);
    pushTimer=setTimeout(pushNow,700);
  };

  pushNow=async function(){
    if(!sb||!user)return false;
    try{
      status('正在上传…');
      const {error}=await sb.from('quiz_progress').upsert({user_id:user.id,state,device_id:deviceId},{onConflict:'user_id'});
      if(error)throw error;
      setDirty(false);
      status('已同步 · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),'ok');
      return true;
    }catch(e){
      status('上传失败：'+e.message,'err');
      return false;
    }
  };

  syncNow=async function(){
    if(!sb||!user||syncing)return;
    syncing=true;
    status('正在同步…');
    try{
      const {data,error}=await sb.from('quiz_progress').select('state,updated_at,device_id').eq('user_id',user.id).maybeSingle();
      if(error)throw error;

      if(data?.state){
        suppressPush=true;
        // 本机没有未上传修改时，云端是导航位置和当前模式的唯一真源。
        // 这样旧手机停在第5题时，不会再把电脑已同步的第30题覆盖掉。
        state=localDirty?merge(state,data.state):norm(data.state);
        await persistLocal();
        suppressPush=false;
        document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.mode===state.mode));
        render();
      }

      if(localDirty||!data?.state){
        await pushNow();
      }else{
        status('已从云端更新 · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),'ok');
      }
    }catch(e){
      suppressPush=false;
      status('同步失败：'+e.message,'err');
    }finally{
      syncing=false;
    }
  };

  clearTimeout(pushTimer);
  const btn=document.getElementById('syncBtn');
  if(btn)btn.onclick=syncNow;

  // 补丁加载后，如果当前已经登录，立即拉一次云端状态。
  setTimeout(()=>{if(user)syncNow()},0);
})();
