'use strict';

const origin = location.origin;
const $ = (s) => document.querySelector(s);
const labels = {
  github: 'GitHub', google: 'Google', microsoft: 'Microsoft', slack: 'Slack',
  notion: 'Notion', dropbox: 'Dropbox', atlassian: 'Atlassian'
};
const setupLinks = {
  github: 'https://github.com/settings/applications/new',
  google: 'https://console.cloud.google.com/apis/credentials',
  microsoft: 'https://entra.microsoft.com/',
  slack: 'https://api.slack.com/apps',
  notion: 'https://app.notion.com/developers/connections',
  dropbox: 'https://www.dropbox.com/developers/apps/create',
  atlassian: 'https://developer.atlassian.com/console/myapps/'
};
const fields = {
  github: ['Application name: Universal AI Tool Hub', 'Homepage URL: '+origin, 'Authorization callback URL: '+origin+'/api/oauth/github/callback', 'Scopes: read:user, user:email'],
  google: ['Application type: Web application', 'Authorized JavaScript origin: '+origin, 'Authorized redirect URI: '+origin+'/api/oauth/google/callback', 'Scopes: openid, email, profile, Gmail readonly, Drive metadata readonly, Calendar readonly'],
  microsoft: ['App registration → Platform: Web', 'Redirect URI: '+origin+'/api/oauth/microsoft/callback', 'Delegated Microsoft Graph permissions: User.Read, Mail.Read, Files.Read, Calendars.Read', 'OAuth/OIDC scopes: offline_access, openid, profile, email'],
  slack: ['Workspace: Yasin.aris.sayeh', 'OAuth Redirect URL: '+origin+'/api/oauth/slack/callback', 'Bot Token Scopes: channels:read, users:read', 'No message-write scope is required by the current Hub Slack tool'],
  notion: ['Authentication method: OAuth', 'Redirect URI: '+origin+'/api/oauth/notion/callback', 'Minimum capabilities: Read content; No user information', 'Select only pages/databases Hub should read'],
  dropbox: ['API: Scoped access', 'Access type: Full Dropbox', 'App name: Universal AI Tool Hub', 'OAuth 2 Redirect URI: '+origin+'/api/oauth/dropbox/callback', 'Permissions: account_info.read, files.metadata.read, files.content.read, sharing.read', 'Hub requests token_access_type=offline for refresh tokens'],
  atlassian: ['OAuth 2.0 (3LO)', 'Callback URL: '+origin+'/api/oauth/atlassian/callback', 'Scopes: read:jira-work, read:jira-user, read:space:confluence, offline_access', 'Audience: api.atlassian.com; prompt=consent']
};
let catalog = {};

function esc(v){return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function notice(text,bad=false){const el=$('#setupMessage');el.textContent=text;el.className='notice '+(bad?'error':'ok');el.hidden=false;requestAnimationFrame(()=>el.scrollIntoView({behavior:'smooth',block:'center'}));}
async function api(path,opts={}){
  const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  let body=null;try{body=await r.json()}catch{}
  if(!r.ok){if(r.status===401){location.href='/';throw new Error('ابتدا وارد Hub شو.');}throw new Error(body?.detail||body?.error||`HTTP ${r.status}`);}
  return body;
}
function slackManifestUrl(){
  const manifest={display_information:{name:'Universal AI Tool Hub',description:'Read-only Slack connector for Universal AI Tool Hub'},features:{bot_user:{display_name:'Universal AI Tool Hub',always_online:false}},oauth_config:{redirect_urls:[origin+'/api/oauth/slack/callback'],scopes:{bot:['channels:read','users:read']}},settings:{org_deploy_enabled:false,socket_mode_enabled:false,token_rotation_enabled:false}};
  return 'https://api.slack.com/apps?new_app=1&manifest_json='+encodeURIComponent(JSON.stringify(manifest));
}
async function load(){
  $('#base').textContent=origin;
  try{
    await api('/api/auth/me');
    const [apps,connections]=await Promise.all([api('/api/oauth-apps'),api('/api/connections/catalog')]);
    catalog=Object.fromEntries((connections||[]).map(x=>[x.key,x]));
    render(apps||[]);
  }catch(e){notice(e.message||String(e),true);}
}
function render(apps){
  const root=$('#cards');root.innerHTML='';
  for(const app of apps){
    const key=app.key;if(!labels[key])continue;
    const configured=!!app.configured;
    const connected=(catalog[key]?.status==='CONNECTED');
    const card=document.createElement('section');card.className='card';
    const setupUrl=key==='slack'?slackManifestUrl():setupLinks[key];
    const setupLabel=key==='slack'?'ساخت Slack App با تنظیمات آماده':'باز کردن Developer Console';
    const status=connected?'CONNECTED ✓':configured?'CREDENTIALS SAVED':'NOT CONFIGURED';
    card.innerHTML=`<div class="provider-head"><h2>${esc(labels[key])}</h2><span class="status ${connected?'ok':configured?'warn':''}">${status}</span></div>
      <div class="muted">Callback URL</div><div class="cb">${esc(origin+'/api/oauth/'+key+'/callback')}</div>
      <div class="row"><a class="btn ${key==='slack'?'':'secondary'}" target="_blank" rel="noopener" href="${esc(setupUrl)}">${esc(setupLabel)}</a><button class="copy secondary">کپی تنظیمات</button></div>
      <div class="details">${(fields[key]||[]).map(x=>`<div class="step">• ${esc(x)}</div>`).join('')}</div>
      <div class="credential-box">
        <div class="field"><label>Client ID</label><input class="client-id" autocomplete="off" inputmode="text" placeholder="Client ID"></div>
        <div class="field"><label>Client Secret</label><input class="client-secret" type="password" autocomplete="new-password" placeholder="Client Secret (فقط برای Vault)"></div>
        <div class="row"><button class="save">ذخیره امن</button><button class="save-connect">ذخیره امن و اتصال</button><button class="connect secondary" ${configured?'':'disabled'}>اتصال با Credential ذخیره‌شده</button></div>
      </div>`;
    card.querySelector('.copy').onclick=async e=>{await navigator.clipboard.writeText((fields[key]||[]).join('\n'));const b=e.currentTarget,old=b.textContent;b.textContent='کپی شد ✓';setTimeout(()=>b.textContent=old,1200);};
    card.querySelector('.save').onclick=()=>saveConfig(key,card,false);
    card.querySelector('.save-connect').onclick=()=>saveConfig(key,card,true);
    card.querySelector('.connect').onclick=()=>connect(key);
    root.appendChild(card);
  }
}
async function saveConfig(key,card,thenConnect){
  const client_id=card.querySelector('.client-id').value.trim();
  const client_secret=card.querySelector('.client-secret').value.trim();
  if(!client_id||!client_secret){notice('برای '+labels[key]+' هر دو مقدار Client ID و Client Secret لازم است.',true);return;}
  try{
    notice('در حال ذخیره امن '+labels[key]+'...');
    const saved=await api(`/api/oauth/${encodeURIComponent(key)}/app-config`,{method:'PUT',body:JSON.stringify({client_id,client_secret})});
    card.querySelector('.client-secret').value='';
    if(!saved?.configured)throw new Error('Credential ذخیره شد اما Provider configured نشد.');
    notice(labels[key]+' با موفقیت داخل Vault ذخیره شد ✓');
    if(thenConnect){setTimeout(()=>connect(key),250);}else{await load();}
  }catch(e){notice(e.message||String(e),true);}
}
function connect(key){notice('در حال انتقال امن به '+labels[key]+'...');location.assign(`/api/oauth/${encodeURIComponent(key)}/start?browser=1`);}

document.addEventListener('DOMContentLoaded',load);
