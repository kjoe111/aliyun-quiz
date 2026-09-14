(()=>{
  const DIRTY_KEY='aliyun_quiz_cloud_dirty_v2';
  let localDirty=false;
  let trackingReady=false;
  try{localDirty=localStorage.getItem(DIRTY_KEY)==='1';}catch(e){}

  const setDirty=v=>{localDirty=!!v;try{localStorage.setItem(DIRTY_KEY,localDirty?'1':'0')}catch(e){}};
  const persistLocal=async()=>{
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}
    try{await idbSet(state)}catch(e){}
  };

  const originalInitCloud=initCloud;
  initCloud=async function(){
    try{return await originalInitCloud();}
    finally{trackingReady=true;}
  };

  localSave=function(){
    // 首次加载/刷新只是在恢复本机缓存，不应被判定为“本机新修改”。
    // 只有初始化完成后的真实用户操作才标记 dirty。
    if(trackingReady)setDirty(true);
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}
    idbSet(state);
    if(trackingReady)schedulePush();
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
        // 没有本机新修改：云端完整覆盖导航状态，刷新/同步后直接跟随另一设备最新进度。
        // 有本机新修改：才做安全合并，避免丢失刚刚离线产生的答题/收藏等数据。
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
})();
