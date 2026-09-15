(()=>{
  const DIRTY_KEY='aliyun_quiz_cloud_data_dirty_v3';
  const NAV_DIRTY_KEY='aliyun_quiz_cloud_nav_dirty_v3';
  let dataDirty=false,navDirty=false,trackingReady=false,lastNavSig='';
  try{dataDirty=localStorage.getItem(DIRTY_KEY)==='1';navDirty=localStorage.getItem(NAV_DIRTY_KEY)==='1'}catch(e){}

  const setDataDirty=v=>{dataDirty=!!v;try{localStorage.setItem(DIRTY_KEY,dataDirty?'1':'0')}catch(e){}};
  const setNavDirty=v=>{navDirty=!!v;try{localStorage.setItem(NAV_DIRTY_KEY,navDirty?'1':'0')}catch(e){}};
  const navSig=()=>`${state.mode}|${state.positions?.[state.mode]??state.index??0}`;
  const currentNav=()=>{const l=list(),idx=Math.max(0,Math.min(Number(state.positions?.[state.mode]??state.index??0),Math.max(0,l.length-1)));return{mode:state.mode,index:idx,questionId:l[idx]?.id??null}};
  const persistLocal=async()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}try{await idbSet(state)}catch(e){}};
  const applyNav=(mode,index)=>{if(!MODES.includes(mode))return;state.mode=mode;state.positions=state.positions||structuredClone(DEF.positions);state.positions[mode]=Math.max(0,Number(index)||0);state.index=state.positions[mode];lastNavSig=navSig();};

  const originalInitCloud=initCloud;
  initCloud=async function(){try{return await originalInitCloud()}finally{trackingReady=true;lastNavSig=navSig()}};
  setTimeout(()=>{if(!trackingReady){trackingReady=true;lastNavSig=navSig()}},1800);

  localSave=function(){
    if(trackingReady){
      const sig=navSig();
      if(lastNavSig&&sig!==lastNavSig)setNavDirty(true);
      lastNavSig=sig;
      setDataDirty(true);
    }
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}
    idbSet(state);
    if(trackingReady)schedulePush();
  };

  schedulePush=function(){if(suppressPush||!user||(!dataDirty&&!navDirty))return;clearTimeout(pushTimer);pushTimer=setTimeout(pushNow,700)};

  async function fetchCloud(){
    const {data,error}=await sb.from('quiz_progress').select('state,updated_at,device_id,nav_mode,nav_index,nav_question_id,nav_version,nav_updated_at,nav_device_id').eq('user_id',user.id).maybeSingle();
    if(error)throw error;return data;
  }

  async function writeCloud(cloud){
    // 数据先与云端合并；导航位置绝不再由 state.merge 决定。
    const localNav=currentNav();
    let merged=cloud?.state?merge(state,cloud.state):norm(state);
    if(navDirty)applyNav(localNav.mode,localNav.index);
    else if(cloud?.nav_mode!=null)applyNav(cloud.nav_mode,cloud.nav_index);
    else if(cloud?.state){const legacy=norm(cloud.state);applyNav(legacy.mode,legacy.positions?.[legacy.mode]??legacy.index??0)}
    // 将独立导航结果重新写进 state，仅为旧客户端兼容；真正权威字段是 nav_*。
    merged.mode=state.mode;merged.positions=merged.positions||structuredClone(DEF.positions);merged.positions[state.mode]=state.index;merged.index=state.index;state=norm(merged);applyNav(merged.mode,merged.index);
    const n=currentNav();
    const initializeNav=!cloud||cloud.nav_mode==null;
    const {data,error}=await sb.rpc('sync_quiz_progress',{p_state:state,p_device_id:deviceId,p_nav_changed:navDirty||initializeNav,p_nav_mode:n.mode,p_nav_index:n.index,p_nav_question_id:n.questionId});
    if(error)throw error;
    setDataDirty(false);setNavDirty(false);lastNavSig=navSig();await persistLocal();return data;
  }

  pushNow=async function(){
    if(!sb||!user)return false;
    try{status('正在上传…');const cloud=await fetchCloud();await writeCloud(cloud);status('已同步 · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),'ok');return true}
    catch(e){status('上传失败：'+e.message,'err');return false}
  };

  syncNow=async function(){
    if(!sb||!user||syncing)return;syncing=true;status('正在同步…');
    try{
      const cloud=await fetchCloud();
      suppressPush=true;
      const localNav=currentNav();
      // 内容永远安全合并，避免一次 pull 把本机尚存的答题记录整份抹掉。
      state=cloud?.state?merge(state,cloud.state):norm(state);
      if(navDirty)applyNav(localNav.mode,localNav.index);
      else if(cloud?.nav_mode!=null)applyNav(cloud.nav_mode,cloud.nav_index);
      else if(cloud?.state){const legacy=norm(cloud.state);applyNav(legacy.mode,legacy.positions?.[legacy.mode]??legacy.index??0)}
      await persistLocal();suppressPush=false;
      if(dataDirty||navDirty||!cloud||cloud.nav_mode==null)await writeCloud(cloud);
      document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.mode===state.mode));render();
      status('已从云端更新 · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),'ok');
    }catch(e){suppressPush=false;status('同步失败：'+e.message,'err')}finally{syncing=false}
  };

  // 覆盖旧的自动 pull：后台恢复/重新联网也必须走新的版本化导航协议。
  cloudPullAndMerge=syncNow;
  clearTimeout(pushTimer);
  const btn=document.getElementById('syncBtn');if(btn)btn.onclick=syncNow;
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&user)setTimeout(syncNow,120)});
  window.addEventListener('online',()=>{if(user)setTimeout(syncNow,120)});
})();
