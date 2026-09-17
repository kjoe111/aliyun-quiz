(()=>{
  /* v8: cloud syncs study DATA only. Navigation is device-local forever. */
  const DIRTY='aliyun_quiz_data_only_dirty_v8';
  let dirty=false,ready=false,uploading=false,timer=null;
  try{dirty=localStorage.getItem(DIRTY)==='1'}catch(e){}
  const flag=v=>{dirty=!!v;try{localStorage.setItem(DIRTY,dirty?'1':'0')}catch(e){}};
  const persist=async()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}try{await idbSet(state)}catch(e){}};
  const localNav=()=>({mode:state.mode,index:state.index,positions:structuredClone(state.positions||DEF.positions),randomOrder:[...(state.randomOrder||[])]});
  const restoreNav=n=>{state.mode=MODES.includes(n.mode)?n.mode:'all';state.positions={...structuredClone(DEF.positions),...(n.positions||{})};state.randomOrder=n.randomOrder||[];state.index=Number.isInteger(state.positions[state.mode])?state.positions[state.mode]:0};
  const stripNav=s=>{const x=norm(s);x.mode='all';x.index=0;x.positions=structuredClone(DEF.positions);x.randomOrder=[];x.positionUpdatedAt={};return x};
  function mergeData(local,cloud){const nav=localNav();const a=stripNav(local),b=stripNav(cloud||{}),m=merge(a,b);state=norm(m);restoreNav(nav);return state}
  function recoverSequential(){
    /* If local sequential cursor is suspiciously behind known answered data, resume at first unanswered.
       This repairs the old 41/52 cursor without pretending cloud navigation is authoritative. */
    const answered=state.answers||{};let first=0;while(first<QUESTIONS.length&&answered[QUESTIONS[first].id])first++;
    const current=Number(state.positions?.all)||0;
    if(first>current){state.positions.all=first;if(state.mode==='all')state.index=first}
  }

  /* Kill all legacy lifecycle cloud pulls before they run. */
  document.addEventListener('visibilitychange',e=>{e.stopImmediatePropagation();if(document.visibilityState==='hidden'&&user&&dirty)pushNow()},true);
  window.addEventListener('online',e=>{e.stopImmediatePropagation();if(user&&dirty)schedulePush()},true);

  const originalInitCloud=initCloud;
  initCloud=async function(){try{return await originalInitCloud()}finally{ready=true;recoverSequential();await persist();render()}};
  setTimeout(()=>{if(!ready){ready=true;recoverSequential();persist();render()}},2000);

  localSave=function(){if(ready)flag(true);try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}idbSet(state);if(ready)schedulePush()};
  schedulePush=function(){if(suppressPush||!user||!dirty)return;clearTimeout(timer);timer=setTimeout(pushNow,1000)};
  async function cloudRow(){const {data,error}=await sb.from('quiz_progress').select('state').eq('user_id',user.id).maybeSingle();if(error)throw error;return data}

  pushNow=async function(){
    if(!sb||!user||!dirty)return false;if(uploading)return false;uploading=true;
    const nav=localNav();
    try{
      status('正在上传学习记录…');const cloud=await cloudRow();mergeData(state,cloud?.state);
      /* Persist data-only cloud state. p_nav_changed=false means legacy nav columns are untouched and ignored. */
      const cloudState=stripNav(state);
      const {error}=await sb.rpc('sync_quiz_progress',{p_state:cloudState,p_device_id:deviceId,p_nav_changed:false,p_nav_mode:null,p_nav_index:null,p_nav_question_id:null});if(error)throw error;
      restoreNav(nav);flag(false);recoverSequential();await persist();status('学习记录已同步 · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),'ok');return true
    }catch(e){restoreNav(nav);status('上传失败：'+e.message,'err');return false}finally{uploading=false;if(dirty)schedulePush()}
  };

  /* Manual sync merges answers/wrong/favorites only; never mode/index/positions. */
  syncNow=async function(){
    if(!sb||!user||syncing)return;if(uploading)return;syncing=true;const nav=localNav();status('正在同步学习记录…');
    try{const cloud=await cloudRow();if(cloud?.state)mergeData(state,cloud.state);restoreNav(nav);recoverSequential();await persist();render();if(dirty)await pushNow();status('学习记录已同步，当前位置保持本机','ok')}
    catch(e){restoreNav(nav);status('同步失败：'+e.message,'err')}finally{syncing=false}
  };
  cloudPullAndMerge=async()=>{if(dirty)schedulePush()};clearTimeout(pushTimer);clearTimeout(timer);const btn=document.getElementById('syncBtn');if(btn)btn.onclick=syncNow;

  /* Option shuffle: stable during one visit, reshuffled next visit. */
  let shownQuestionId=null,shownMap=null;const letters=['A','B','C','D','E','F','G','H'];
  function shuffledMap(q){const keys=Object.keys(q.options),arr=[...keys];for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr.map((orig,i)=>({display:letters[i]||String(i+1),orig,text:q.options[orig]}))}
  function displayedAnswers(q){return shownMap.filter(x=>q.answer.includes(x.orig)).map(x=>x.display)}
  render=function(){const l=list(),m=$('main');if(!l.length){m.innerHTML='<div class="empty">这里还没有题目。</div>';stats();return}if(state.index>=l.length)state.index=Math.max(0,l.length-1);const q=l[state.index];if(shownQuestionId!==q.id||!shownMap){shownQuestionId=q.id;shownMap=shuffledMap(q)}selected=[];revealed=false;m.innerHTML=`<section class="card"><div class="meta"><span class="badge">${q.answer.length>1?'多选题':'单选题'}</span><span class="small">第 ${q.id} 题 · ${state.index+1}/${l.length}</span></div><div class="q">${esc(q.question)}</div><div>${shownMap.map(x=>`<button class="option" data-k="${x.display}"><span class="letter">${x.display}</span><span>${esc(x.text)}</span></button>`).join('')}</div><div id="answer" class="answer"><b>正确答案：${displayedAnswers(q).join('、')}</b><div class="exp">${q.explanation?esc(q.explanation):'原资料未提供解析。'}</div></div></section>`;document.querySelectorAll('.option').forEach(b=>b.onclick=()=>choose(b.dataset.k));$('fav').textContent=state.fav[q.id]?'★ 已收藏':'☆ 收藏';$('submit').textContent='提交答案';$('bar').style.width=((state.index+1)/l.length*100)+'%';stats();window.scrollTo({top:0,behavior:'smooth'})};
  choose=function(k){if(revealed)return;const q=list()[state.index];selected=q.answer.length===1?[k]:(selected.includes(k)?selected.filter(x=>x!==k):[...selected,k]);paint(q)};
  paint=function(q){const correct=displayedAnswers(q);document.querySelectorAll('.option').forEach(b=>{const k=b.dataset.k;b.classList.remove('selected','good','bad');if(selected.includes(k))b.classList.add('selected');if(revealed){if(correct.includes(k))b.classList.add('good');else if(selected.includes(k))b.classList.add('bad')}});$('answer')?.classList.toggle('show',revealed)};
  submit=function(){const before=list();if(!before.length)return;const q=before[state.index];if(revealed){shownQuestionId=null;shownMap=null;goNext();return}if(!selected.length){alert('请先选择答案');return}const correct=displayedAnswers(q),ok=same(selected,correct);state.answers[q.id]={selected:[...selected],correct:ok,updatedAt:Date.now()};if(ok)delete state.wrong[q.id];else{state.wrong[q.id]=true;state.errorCounts[q.id]=(+state.errorCounts[q.id]||0)+1}const after=list(),still=after.some(x=>x.id===q.id);let resume=still?state.index+1:state.index;if(after.length)resume=Math.min(resume,after.length-1);else resume=0;state.positions[state.mode]=resume;mark();revealed=true;localSave();paint(q);stats();$('submit').textContent='下一题'};
  const oldGoNext=goNext,oldGoPrev=goPrev;goNext=function(){shownQuestionId=null;shownMap=null;return oldGoNext()};goPrev=function(){shownQuestionId=null;shownMap=null;return oldGoPrev()};
})();
