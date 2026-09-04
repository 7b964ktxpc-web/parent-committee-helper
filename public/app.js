(() => {
  const STORAGE_KEY = 'pch.profile.v1';
  const HISTORY_KEY = 'pch.history.v1';
  const defaultProfile = { userName:'', assistantName:'Саша', groupName:'', kindergarten:'', role:'Родитель', style:['простой','уверенный','дружелюбный'], extraContext:'' };

  function loadProfile(){try{const raw=localStorage.getItem(STORAGE_KEY);return raw?{...defaultProfile,...JSON.parse(raw)}:{...defaultProfile};}catch{return {...defaultProfile};}}
  function saveProfile(p){localStorage.setItem(STORAGE_KEY,JSON.stringify(p));}
  function loadHistory(){try{const raw=localStorage.getItem(HISTORY_KEY);const a=raw?JSON.parse(raw):[];return Array.isArray(a)?a:[];}catch{return [];}}
  function saveHistory(a){localStorage.setItem(HISTORY_KEY,JSON.stringify(a.slice(-200)));}

  let profile=loadProfile(), history=loadHistory(), lastModel='';
  const onboardingEl=document.getElementById('onboarding'), chatEl=document.getElementById('chat-screen'), settingsEl=document.getElementById('settings'), messagesEl=document.getElementById('messages'), inputEl=document.getElementById('input'), sendBtn=document.getElementById('send'), assistantTitle=document.getElementById('assistantTitle'), modelStatus=document.getElementById('modelStatus'), openSettingsBtn=document.getElementById('openSettings'), toastEl=document.getElementById('toast'), quickActionsEl=document.getElementById('quickActions');

  function updateModelStatus(model){
    if(model) lastModel=model;
    const label=lastModel==='aliceai-llm'?'Alice AI LLM':lastModel==='aliceai-llm-flash'?'Alice AI LLM Flash':'AI готов к работе';
    modelStatus.textContent=`Помощник родительского комитета · ${label}`;
  }
  function applyProfileToUI(){
    document.getElementById('set_userName').value=profile.userName||''; document.getElementById('set_groupName').value=profile.groupName||''; document.getElementById('set_kindergarten').value=profile.kindergarten||''; document.getElementById('set_role').value=profile.role||'Родитель'; document.getElementById('set_assistantName').value=profile.assistantName||''; document.getElementById('set_extraContext').value=profile.extraContext||''; renderStyleChips('set_style',profile.style||[]); assistantTitle.textContent=profile.assistantName||'Помощник'; updateModelStatus();
  }
  function showChat(){onboardingEl.classList.add('hidden');chatEl.classList.remove('hidden');settingsEl.classList.add('hidden');assistantTitle.textContent=profile.assistantName||'Помощник';updateModelStatus();renderHistory();requestAnimationFrame(()=>inputEl.focus());}
  function showOnboarding(){onboardingEl.classList.remove('hidden');chatEl.classList.add('hidden');document.getElementById('ob_userName').value=profile.userName||'';document.getElementById('ob_assistantName').value=profile.assistantName||'Саша';document.getElementById('ob_groupName').value=profile.groupName||'';document.getElementById('ob_kindergarten').value=profile.kindergarten||'';document.getElementById('ob_role').value=profile.role||'Родитель';document.getElementById('ob_extraContext').value=profile.extraContext||'';renderStyleChips('ob_style',profile.style?.length?profile.style:['простой','уверенный','дружелюбный']);}
  function isFirstRun(){return !localStorage.getItem(STORAGE_KEY);}
  function renderStyleChips(id,selected){document.getElementById(id).querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',selected.includes(c.dataset.val)));}
  function setupChipGroup(id,onChange){document.getElementById(id).addEventListener('click',e=>{const chip=e.target.closest('.chip');if(!chip)return;chip.classList.toggle('active');onChange(Array.from(document.getElementById(id).querySelectorAll('.chip.active')).map(c=>c.dataset.val));});}
  let obStyle=profile.style?.length?profile.style:['простой','уверенный','дружелюбный'], setStyle=profile.style||[];
  setupChipGroup('ob_style',v=>obStyle=v); setupChipGroup('set_style',v=>setStyle=v);

  document.getElementById('ob_save').addEventListener('click',()=>{profile={...profile,userName:document.getElementById('ob_userName').value.trim(),assistantName:document.getElementById('ob_assistantName').value.trim()||'Саша',groupName:document.getElementById('ob_groupName').value.trim(),kindergarten:document.getElementById('ob_kindergarten').value.trim(),role:document.getElementById('ob_role').value,style:obStyle.length?obStyle:['простой','уверенный','дружелюбный'],extraContext:document.getElementById('ob_extraContext').value.trim()};saveProfile(profile);history=[];saveHistory(history);showChat();});
  function openSettings(){applyProfileToUI();settingsEl.classList.remove('hidden');document.body.style.overflow='hidden';}
  function closeSettings(){settingsEl.classList.add('hidden');document.body.style.overflow='';}
  openSettingsBtn.addEventListener('click',openSettings); settingsEl.addEventListener('click',e=>{if(e.target.dataset.close!==undefined)closeSettings();});
  document.getElementById('saveSettings').addEventListener('click',()=>{profile={...profile,userName:document.getElementById('set_userName').value.trim(),assistantName:document.getElementById('set_assistantName').value.trim()||'Саша',groupName:document.getElementById('set_groupName').value.trim(),kindergarten:document.getElementById('set_kindergarten').value.trim(),role:document.getElementById('set_role').value,style:setStyle.length?setStyle:['простой','уверенный','дружелюбный'],extraContext:document.getElementById('set_extraContext').value.trim()};saveProfile(profile);assistantTitle.textContent=profile.assistantName||'Помощник';closeSettings();showToast('Настройки сохранены');});
  document.getElementById('resetSettings').addEventListener('click',()=>{if(!confirm('Сбросить все настройки и переписку?'))return;localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(HISTORY_KEY);profile={...defaultProfile};history=[];lastModel='';closeSettings();showOnboarding();});
  document.getElementById('clearHistory').addEventListener('click',()=>{if(!confirm('Очистить переписку?'))return;history=[];saveHistory(history);renderHistory();showToast('Переписка очищена');});

  function autosize(){inputEl.style.height='auto';inputEl.style.height=Math.min(inputEl.scrollHeight,140)+'px';}
  inputEl.addEventListener('input',autosize); inputEl.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendMessage();}}); sendBtn.addEventListener('click',sendMessage);
  quickActionsEl.addEventListener('click',e=>{const btn=e.target.closest('.qa');if(!btn)return;const text=btn.dataset.text||btn.textContent.trim();inputEl.value=inputEl.value?(inputEl.value+' '+text.trim()):text.trim();autosize();inputEl.focus();inputEl.selectionStart=inputEl.selectionEnd=inputEl.value.length;});

  function renderHistory(){messagesEl.innerHTML='';if(!history.length){const empty=document.createElement('div');empty.className='empty-state';empty.innerHTML='<div class="big">💬</div><h2>Привет! Я рядом.</h2><p>Напиши, что случилось — помогу сформулировать ответ или сообщение в чат.</p>';messagesEl.appendChild(empty);return;}history.forEach(m=>appendMessage(m.role,m.content,false));scrollToBottom();}
  function appendMessage(role,content,animate=true){const empty=messagesEl.querySelector('.empty-state');if(empty)empty.remove();const row=document.createElement('div');row.className=`msg-row ${role==='user'?'user':'bot'}`;const bubble=document.createElement('div');bubble.className=`bubble ${role==='user'?'user':'bot'}`;row.appendChild(bubble);messagesEl.appendChild(row);if(role==='user')bubble.textContent=content;else if(animate&&content==='__typing__')bubble.innerHTML='<span class="typing"><span></span><span></span><span></span></span>';else{bubble.textContent=content;const actions=document.createElement('div');actions.className='bubble-actions';const btn=document.createElement('button');btn.className='copy-btn';btn.type='button';btn.textContent='Копировать';btn.addEventListener('click',()=>copyText(content,btn));actions.appendChild(btn);bubble.appendChild(actions);}scrollToBottom();return row;}
  function scrollToBottom(){requestAnimationFrame(()=>messagesEl.scrollTop=messagesEl.scrollHeight);}
  async function copyText(text,btn){try{await navigator.clipboard.writeText(text);if(btn){const o=btn.textContent;btn.textContent='Скопировано ✓';btn.classList.add('copied');setTimeout(()=>{btn.textContent=o;btn.classList.remove('copied');},1500);}}catch{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');showToast('Скопировано ✓');}catch{showToast('Не удалось скопировать');}document.body.removeChild(ta);}}
  function showToast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(showToast._t);showToast._t=setTimeout(()=>toastEl.classList.remove('show'),1800);}

  let busy=false;
  async function sendMessage(){if(busy)return;const text=inputEl.value.trim();if(!text)return;inputEl.value='';autosize();history.push({role:'user',content:text});saveHistory(history);appendMessage('user',text);busy=true;sendBtn.disabled=true;const typingRow=appendMessage('assistant','__typing__',true);updateModelStatus();try{const resp=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,messages:history.map(m=>({role:m.role==='assistant'?'assistant':m.role,content:m.content}))})});let data={};try{data=await resp.json();}catch{}if(!resp.ok){const err=data.error||('HTTP '+resp.status);if(err==='AI_NOT_CONFIGURED')throw new Error('AI_NOT_CONFIGURED');throw new Error(err);}const reply=(data.reply||'').trim()||'Что-то не получилось ответить. Попробуй ещё раз.';updateModelStatus(data.model);typingRow.remove();history.push({role:'assistant',content:reply});saveHistory(history);appendMessage('assistant',reply);}catch(e){console.error(e);typingRow.remove();const errMsg=e.message==='AI_NOT_CONFIGURED'?'AI пока не подключён. Добавь ключи Yandex AI Studio в настройки окружения — и я сразу заработаю.':'Не удалось получить ответ. Проверь соединение и попробуй ещё раз.';history.push({role:'assistant',content:errMsg});saveHistory(history);appendMessage('assistant',errMsg);}finally{busy=false;sendBtn.disabled=false;inputEl.focus();}}

  if(isFirstRun())showOnboarding();else showChat();
})();
