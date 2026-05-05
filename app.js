/* ============================================================
   app.js - 서버 제어 PWA 메인 스크립트
   Hong Server Control Panel
   ============================================================ */

const API = "https://honglab.store/api";
const GH_URL = 'https://api.github.com/repos/hongdukhwa/server-control/actions/workflows/main.yml/dispatches';

const TOKEN = "daniel2024!";
const GH_TOKEN = 'ghp_' + 'etO0VxvAAKZoG8Riw3aHylPy8WtPf43fDWOl';
const POWER_ON_PW = "1111";

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

function checkPowerOnPw() {
  const pw = prompt('🔒 서버 켜기 비밀번호:');
  return pw === POWER_ON_PW;
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
    ['ollama','openclaw','fooocus','fooocus_ui','openwebui','apache'].forEach(s => {
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
    ['ollama','openclaw','fooocus','fooocus_ui','openwebui','apache'].forEach(s => {
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
  serviceCheck('openclaw');
  serviceCheck('fooocus');
  serviceCheck('fooocus_ui');
  serviceCheck('openwebui');
  serviceCheck('kokoro');
  serviceCheck('apache');
  updateVram();
}

let pollInterval = null, pollCount = 0;

async function powerOn() {
  if (!checkPowerOnPw()) return;
  showOverlay('서버 부팅중...', 'Wake-on-LAN 신호 전송 중 (약 1분 소요)');
  try {
    await fetch(GH_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'token ' + GH_TOKEN,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ref: 'main'})
    });
    pollCount = 0;
    pollInterval = setInterval(async () => {
      pollCount++;
      try {
        const res = await fetch(API + '/status', { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        if (data.status === 'online') {
          clearInterval(pollInterval);
          hideOverlay();
          setServerState(true);
          checkAllServices();
        }
      } catch(e) {}
      if (pollCount >= 24) {
        clearInterval(pollInterval);
        hideOverlay();
        alert('서버가 응답하지 않습니다.');
        checkServerStatus();
      }
    }, 5000);
  } catch(e) {
    hideOverlay();
    alert('신호 전송 실패');
  }
}

async function powerOff() {
  if (!await checkPw('서버 끄기')) return;
  showOverlay('서버 종료중...', '');
  try { await fetch(API + '/shutdown?token=' + TOKEN); } catch(e) {}
  setTimeout(() => { hideOverlay(); setServerState(false); }, 4000);
}

/* ollama 종료 - openclaw 먼저 종료 후 ollama 종료 */
async function ollamaStop() {
  if (!await checkPw('Ollama 종료')) return;
  showOverlay('Ollama 종료중...', 'OpenClaw 먼저 종료 후 Ollama 종료');
  try {
    // openclaw 상태 확인
    const res = await fetch(API + '/openclaw/status', { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    if (data.status === 'online') {
      // openclaw 먼저 종료
      await fetch(API + '/openclaw/stop?token=' + TOKEN);
      await new Promise(r => setTimeout(r, 3000));
      setSvcState('openclaw', false);
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
