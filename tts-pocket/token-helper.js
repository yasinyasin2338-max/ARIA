const $=s=>document.querySelector(s);

async function request(path,options={}){
  const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  let data=null; try{data=await r.json()}catch{data={detail:await r.text()}}
  if(!r.ok) throw new Error(data?.detail||JSON.stringify(data));
  return data;
}

function status(msg,cls=''){$('#state').className=cls;$('#state').textContent=msg}

async function check(){
  try{
    const health=await fetch('/health').then(r=>r.json());
    if(!health.auth_enabled){status('Auth هنوز فعال نیست.','err');return}
    try{
      const me=await request('/api/auth/me');
      status(`${me.actor.email||'کاربر'} · ${me.actor.role} · ${me.workspace?.name||me.actor.workspace_id}`,'ok');
      $('#loginCard').hidden=true;$('#tokenCard').hidden=false;await loadTokens();
    }catch{
      status('برای مدیریت Token وارد شو.');$('#loginCard').hidden=false;$('#tokenCard').hidden=true;
    }
  }catch(e){status('خطا در ارتباط با Hub: '+e.message,'err')}
}

async function login(){
  $('#loginOut').textContent='...';
  try{
    await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('#email').value.trim(),password:$('#password').value})});
    $('#password').value='';$('#loginOut').textContent='ورود موفق ✓';await check();
  }catch(e){$('#loginOut').textContent='خطا: '+e.message}
}

async function createToken(){
  $('#newToken').hidden=true;
  try{
    const payload={name:$('#tokenName').value.trim()||'chatgpt-mcp',expires_days:Number($('#days').value||365)};
    const d=await request('/api/auth/api-tokens',{method:'POST',body:JSON.stringify(payload)});
    $('#newToken').hidden=false;
    $('#newToken').textContent='این Token فقط همین بار نمایش داده می‌شود. آن را در جای امن نگه دار:\n\n'+d.token;
    await loadTokens();
  }catch(e){alert('خطا: '+e.message)}
}

async function loadTokens(){
  try{
    const items=await request('/api/auth/api-tokens');
    $('#tokens').innerHTML='<h4>Tokenهای فعلی</h4>'+((items||[]).map(t=>`<div style="padding:10px 0;border-top:1px solid #27324a"><b>${escapeHtml(t.name)}</b><br><span class="muted">${escapeHtml(t.token_prefix||'')} · ${escapeHtml(t.expires_at||'بدون انقضا')}</span> <button class="danger" data-id="${escapeHtml(t.id)}">لغو</button></div>`).join('')||'<p class="muted">هنوز Tokenی ساخته نشده.</p>');
    document.querySelectorAll('button[data-id]').forEach(b=>b.onclick=()=>revoke(b.dataset.id));
  }catch(e){$('#tokens').textContent='خطا: '+e.message}
}

async function revoke(id){if(!confirm('این Token لغو شود؟'))return;try{await request('/api/auth/api-tokens/'+encodeURIComponent(id),{method:'DELETE'});await loadTokens()}catch(e){alert(e.message)}}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

$('#loginBtn').onclick=login;$('#createBtn').onclick=createToken;$('#refreshBtn').onclick=loadTokens;
check();
