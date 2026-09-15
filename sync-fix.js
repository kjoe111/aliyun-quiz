(()=>{
  /* v7: local-first sync + per-visit option shuffling. */
  const DATA_DIRTY='aliyun_quiz_data_dirty_v6',NAV_DIRTY='aliyun_quiz_nav_dirty_v6';
  let dataDirty=false,navDirty=false,ready=false,uploadTimer=null,uploading=false,lastSig='';
  try{dataDirty=localStorage.getItem(DATA_DIRTY)==='1';navDirty=localStorage.getItem(NAV_DIRTY)==='1'}catch(e){}
  const flag=(k,v)=>{try{localStorage.setItem(k,v?'1':'0')}catch(e){}};
  const sig=()=>`${state.mode}|${Number(state.positions?.[state.mode]??state.index??0)}`;
  const persist=async()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}try{await idbSet(state)}catch(e){}};
  const nav=()=>{const l=list(),i=Math.max(0,Math.min(Number(state.positions?.[state.mode]??state.index??0),Math.max(0,l.length-1)));return{mode:state.mode,index:i,questionId:l[i]?.id??null}};
  const applyNav=(m,i)=>{if(!MODES.includes(m))return;state.mode=m;state.positions=state.positions||structuredClone(DEF.positions);state.positions[m]=Math.max(0,Number(i)||0);state.index=state.positions[m];lastSig=sig()};

  document.addEventListener('visibilitychange',e=>{e.stopImmediatePropagation();if(document.visibilityState==='hidden'&&user&&(dataDirty||navDirty))pushNow()},true);
  window.addEventListener('online',e=>{e.stopImmediatePropagation();if(user&&(dataDirty||navDirty))schedulePush()},true);

  const originalInitCloud=initCloud;
  initCloud=async function(){try{return await originalInitCloud()}finally{ready=true;lastSig=sig()}};
  setTimeout(()=>{if(!ready){ready=true;lastSig=sig()}},2000);

  localSave=function(){if(ready){const s=sig();dataDirty=true;flag(DATA_DIRTY,true);if(lastSig&&s!==lastSig){navDirty=true;flag(NAV_DIRTY,true)}lastSig=s}try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}idbSet(state);if(ready)schedulePush()};
  schedulePush=function(){if(suppressPush||!user||(!dataDirty&&!navDirty))return;clearTimeout(uploadTimer);uploadTimer=setTimeout(()=>pushNow(),1000)};
  async function cloudRow(){const {data,error}=await sb.from('quiz_progress').select('state,nav_mode,nav_index,nav_question_id,nav_version,nav_updated_at,device_id').eq('user_id',user.id).maybeSingle();if(error)throw error;return data}
  pushNow=async function(){if(!sb||!user)return false;if(uploading){schedulePush();return false}uploading=true;const n=nav(),s=sig(),dd=dataDirty,nd=navDirty;try{status('正在上传…');const cloud=await cloudRow();const merged=cloud?.state?merge(state,cloud.state):norm(state);merged.mode=n.mode;merged.positions=merged.positions||structuredClone(DEF.positions);merged.positions[n.mode]=n.index;merged.index=n.index;const {error}=await sb.rpc('sync_quiz_progress',{p_state:merged,p_device_id:deviceId,p_nav_changed:nd||!cloud?.nav_mode,p_nav_mode:n.mode,p_nav_index:n.index,p_nav_question_id:n.questionId});if(error)throw error;if(sig()===s){if(dd){dataDirty=false;flag(DATA_DIRTY,false)}if(nd){navDirty=false;flag(NAV_DIRTY,false)}}await persist();status('已上传 · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),'ok');return true}catch(e){status('上传失败：'+e.message,'err');return false}finally{uploading=false;if(dataDirty||navDirty)schedulePush()}};
  syncNow=async function(){if(!sb||!user||syncing)return;if(dataDirty||navDirty||uploading){schedulePush();status('本机有新进度，先上传','ok');return}syncing=true;const before=sig();status('正在读取云端…');try{const cloud=await cloudRow();if(!cloud){await pushNow();return}if(sig()!==before)return;suppressPush=true;state=cloud.state?merge(state,cloud.state):norm(state);if(cloud.nav_mode!=null)applyNav(cloud.nav_mode,cloud.nav_index);await persist();suppressPush=false;document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.mode===state.mode));render();status('已读取云端 · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),'ok')}catch(e){suppressPush=false;status('同步失败：'+e.message,'err')}finally{syncing=false}};
  cloudPullAndMerge=async()=>{if(dataDirty||navDirty)schedulePush()};clearTimeout(pushTimer);clearTimeout(uploadTimer);const btn=document.getElementById('syncBtn');if(btn)btn.onclick=syncNow;

  /* ---- Option shuffle layer ----
     A displayed letter now points to an original option key. The mapping is stable
     while the current question stays on screen, and regenerated on the next visit. */
  let shownQuestionId=null,shownMap=null;
  const letters=['A','B','C','D','E','F','G','H'];
  function shuffledMap(q){
    const keys=Object.keys(q.options),arr=[...keys];
    for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}
    return arr.map((orig,i)=>({display:letters[i]||String(i+1),orig,text:q.options[orig]}));
  }
  function displayedAnswers(q){return shownMap.filter(x=>q.answer.includes(x.orig)).map(x=>x.display)}
  render=function(){
    const l=list(),m=$('main');if(!l.length){m.innerHTML='<div class="empty">这里还没有题目。</div>';stats();return}
    if(state.index>=l.length)state.index=Math.max(0,l.length-1);const q=l[state.index];
    /* render() can be called for stats/sync while the same question is visible: keep mapping. */
    if(shownQuestionId!==q.id||!shownMap){shownQuestionId=q.id;shownMap=shuffledMap(q)}
    selected=[];revealed=false;
    m.innerHTML=`<section class="card"><div class="meta"><span class="badge">${q.answer.length>1?'多选题':'单选题'}</span><span class="small">第 ${q.id} 题 · ${state.index+1}/${l.length}</span></div><div class="q">${esc(q.question)}</div><div>${shownMap.map(x=>`<button class="option" data-k="${x.display}"><span class="letter">${x.display}</span><span>${esc(x.text)}</span></button>`).join('')}</div><div id="answer" class="answer"><b>正确答案：${displayedAnswers(q).join('、')}</b><div class="exp">${q.explanation?esc(q.explanation):'原资料未提供解析。'}</div></div></section>`;
    document.querySelectorAll('.option').forEach(b=>b.onclick=()=>choose(b.dataset.k));$('fav').textContent=state.fav[q.id]?'★ 已收藏':'☆ 收藏';$('submit').textContent='提交答案';$('bar').style.width=((state.index+1)/l.length*100)+'%';stats();window.scrollTo({top:0,behavior:'smooth'})
  };
  choose=function(k){if(revealed)return;const q=list()[state.index];selected=q.answer.length===1?[k]:(selected.includes(k)?selected.filter(x=>x!==k):[...selected,k]);paint(q)};
  paint=function(q){const correct=displayedAnswers(q);document.querySelectorAll('.option').forEach(b=>{const k=b.dataset.k;b.classList.remove('selected','good','bad');if(selected.includes(k))b.classList.add('selected');if(revealed){if(correct.includes(k))b.classList.add('good');else if(selected.includes(k))b.classList.add('bad')}});$('answer')?.classList.toggle('show',revealed)};
  submit=function(){const before=list();if(!before.length)return;const q=before[state.index];if(revealed){shownQuestionId=null;shownMap=null;goNext();return}if(!selected.length){alert('请先选择答案');return}const correct=displayedAnswers(q),ok=same(selected,correct);state.answers[q.id]={selected:[...selected],correct:ok,updatedAt:Date.now()};if(ok)delete state.wrong[q.id];else{state.wrong[q.id]=true;state.errorCounts[q.id]=(+state.errorCounts[q.id]||0)+1}const after=list(),still=after.some(x=>x.id===q.id);let resume=still?state.index+1:state.index;if(after.length)resume=Math.min(resume,after.length-1);else resume=0;state.positions[state.mode]=resume;mark();revealed=true;localSave();paint(q);stats();$('submit').textContent='下一题'};
  const oldGoNext=goNext,oldGoPrev=goPrev;
  goNext=function(){shownQuestionId=null;shownMap=null;return oldGoNext()};
  goPrev=function(){shownQuestionId=null;shownMap=null;return oldGoPrev()};
})();
