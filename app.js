/* ============================================================
   app.js - 서버 제어 PWA 메인 스크립트
   Hong Server Control Panel
   ============================================================ */

const API = "https://honglab.store/api";
// Power-on uses the owner's GitHub login; never embed personal access tokens.
const OWNER_GITHUB_NEW_ISSUE = 'https://github.com/hongdukhwa/server-control/issues/new';

const TOKEN = "daniel2024!";



async function checkPw(action) {
  const pw = prompt('🔒 비밀번호를 입력하세요\n(' + action + ')');
  if (!pw) return false;
  try {
    const res = await fetch(API + '/verify?pw=' + pw + '&token=' + TOKEN, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return data.valid === true;
  } catch(e) {
    return false;
  }
}

function showOverlay(text, sub) {
  document.getElementById('overlay-text').textContent = text || '처리중...';
  document.getElementById('overlay-sub').textContent = sub || '잠시만 기다려주세요';
  document.getElementById('overlay').classList.add('show');
}

function hideOverlay() {
  document.getElementById('overlay').classList.remove('show');
}

function setLinksState(online) {
  document.querySelectorAll('.link-btn').forEach(el => {
    el.style.pointerEvents = online ? '' : 'none';
    el.style.opacity = online ? '' : '0.2';
  });
}

function setServerState(online) {
  const dot = document.getElementById('server-dot');
  const txt = document.getElementById('server-status-text');
  const btnOn = document.getElementById('btn-server-on');
  const btnOff = document.getElementById('btn-server-off');

  if (online) {
    dot.className = 'status-dot online';
    txt.textContent = '서버 작동중 ✓';
    btnOn.disabled = true;
    btnOff.disabled = false;
    document.getElementById('nginx-start').disabled = false;
    document.querySelectorAll('.svc-chk').forEach(btn => btn.disabled = false);
    ['ollama','hermes','fooocus','fooocus_ui','comfyui','openwebui','apache'].forEach(s => {
      document.getElementById(s+'-start').disabled = false;
      document.getElementById(s+'-stop').disabled = false;
    });
    
    
    setLinksState(true);
  } else {
    dot.className = 'status-dot offline';
    txt.textContent = '서버 중지됨';
    btnOn.disabled = false;
    btnOff.disabled = true;
    document.getElementById('nginx-start').disabled = true;
    document.getElementById('nginx-dot').className = 'svc-dot';
    document.querySelectorAll('.svc-chk').forEach(btn => btn.disabled = true);
    ['ollama','hermes','fooocus','fooocus_ui','comfyui','openwebui','apache'].forEach(s => {
      document.getElementById(s+'-start').disabled = true;
      document.getElementById(s+'-stop').disabled = true;
      document.getElementById(s+'-dot').className = 'svc-dot';
    });
    
    
    setLinksState(false);
  }
}


async function updateVram() {
  try {
    const res = await fetch(API + '/vram', { signal: AbortSignal.timeout(3000) });
    const d = await res.json();
    const gb = v => (v/1024).toFixed(1) + 'GB';
    document.getElementById('vram-total').textContent = '전체 ' + gb(d.total);
    document.getElementById('vram-used').textContent = '사용 ' + gb(d.used);
    document.getElementById('vram-free').textContent = '잔여 ' + gb(d.free);
  } catch(e) {}
}

async function checkServerStatus() {
  const dot = document.getElementById('server-dot');
  const txt = document.getElementById('server-status-text');
  dot.className = 'status-dot checking';
  txt.textContent = '확인중...';
  document.getElementById('btn-server-on').disabled = true;
  document.getElementById('btn-server-off').disabled = true;
  try {
    const res = await fetch(API + '/status', { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const online = data.status === 'online';
    setServerState(online);
    if (online) checkAllServices();
  } catch(e) {
    setServerState(false);
  }
}

function setSvcState(service, online) {
  const dot = document.getElementById(service + '-dot');
  const btnStart = document.getElementById(service + '-start');
  const btnStop = document.getElementById(service + '-stop');
  dot.className = 'svc-dot ' + (online ? 'online' : 'offline');
  if (btnStart) btnStart.disabled = online;
  if (btnStop) btnStop.disabled = !online;
}

async function serviceCheck(service) {
  const dot = document.getElementById(service + '-dot');
  dot.className = 'svc-dot checking';
  try {
    const res = await fetch(API + '/' + service + '/status', { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    setSvcState(service, data.status === 'online');
  } catch(e) {
    setSvcState(service, false);
  }
}

function checkAllServices() {
  serviceCheck('nginx');
  serviceCheck('ollama');
  serviceCheck('hermes');
  serviceCheck('fooocus');
  serviceCheck('fooocus_ui');
  serviceCheck('comfyui');
  serviceCheck('openwebui');
  serviceCheck('kokoro');
  serviceCheck('apache');
  updateVram();
}

let pollInterval = null, pollCount = 0;

function powerOn() {
  // GitHub itself authenticates the owner. No token, PIN, or GitHub API credentials
  // are ever sent to the browser. Submit the prefilled Issue to dispatch WOL.
  const title = '[WOL] Linux-Server';
  const body = 'Owner-requested Linux Wake-on-LAN. Trigger existing fixed GitHub Actions WOL workflow.';
  const url = OWNER_GITHUB_NEW_ISSUE + '?title=' + encodeURIComponent(title) +
    '&body=' + encodeURIComponent(body);
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (popup === null) {
    alert('GitHub 창을 열 수 없습니다. 팝업 차단 설정을 확인해 주세요.');
  }
}

async function powerOff() {
  const ok = await checkPw('서버 끄기');
  if (!ok) return;
  showOverlay('서버 종료중...', '');
  try { await fetch(API + '/shutdown?token=' + TOKEN); } catch(e) {}
  setTimeout(() => { hideOverlay(); setServerState(false); }, 4000);
}

/* ollama 종료 - hermes 먼저 종료 후 ollama 종료 */
async function ollamaStop() {
  if (!await checkPw('Ollama 종료')) return;
  showOverlay('Ollama 종료중...', 'hermes 먼저 종료 후 Ollama 종료');
  try {
    // hermes 상태 확인
    const res = await fetch(API + '/hermes/status', { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    if (data.status === 'online') {
      // hermes 먼저 종료
      await fetch(API + '/hermes/stop?token=' + TOKEN);
      await new Promise(r => setTimeout(r, 3000));
      setSvcState('hermes', false);
    }
  } catch(e) {}
  // openwebui 종료
  try { await fetch(API + '/openwebui/stop?token=' + TOKEN); } catch(e) {}
  setSvcState('openwebui', false);
  // ollama 종료
  try {
    await fetch(API + '/ollama/stop?token=' + TOKEN);
    setTimeout(async () => {
      await serviceCheck('ollama');
      hideOverlay();
    }, 3000);
  } catch(e) {
    hideOverlay();
    alert('서버 연결 실패');
  }
}

async function serviceCtrl(service, action, overlayText) {
  const actionKo = action === 'start' ? '시작' : '종료';
  if (!await checkPw(service + ' ' + actionKo)) return;
  const delay = (service === 'fooocus' || service === 'fooocus_ui') ? 30000 : 3000;
  const subText = (service === 'fooocus' || service === 'fooocus_ui') ? '약 30초 소요됩니다...' : '잠시만 기다려주세요';
  showOverlay(overlayText, subText);
  try {
    await fetch(API + '/' + service + '/' + action + '?token=' + TOKEN);
    setTimeout(async () => {
      await serviceCheck(service);
      await updateVram();
      hideOverlay();
    }, delay);
  } catch(e) {
    hideOverlay();
    alert('서버 연결 실패');
  }
}



function openWebUI() {
  window.open("http://192.168.0.20:3000", "_blank");
}

function openProjects() {
  window.open("https://honglab.store/project/project.html", "_blank");
}

window.onload = async () => {
  await checkServerStatus();
};
