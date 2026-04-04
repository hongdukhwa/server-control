/* ============================================================
   app.js - 서버 제어 PWA 메인 스크립트
   Hong Server Control Panel
   ============================================================ */

/* -------------------------------------------------------
   [1] 상수 설정 - API 주소, 토큰, 비밀번호
------------------------------------------------------- */
const TOKEN = "daniel2024!";           // Flask API 인증 토큰
const PW = "0444";                     // PWA 버튼 실행 비밀번호
const API = "https://daniel-server.iptime.org/api";  // Flask API 주소
const GH_TOKEN = 'ghp_' + 'Xu3Qx7Fr8csezATdJ7tPAmKwmvdnfS3Gg6T7';  // GitHub 토큰 (WoL용)
const GH_URL = 'https://api.github.com/repos/hongdukhwa/server-control/actions/workflows/main.yml/dispatches';


/* -------------------------------------------------------
   [2] 공통 유틸 - 비밀번호 확인, 오버레이 표시/숨김
------------------------------------------------------- */
function checkPw(action) {
  const pw = prompt('🔒 비밀번호를 입력하세요\n(' + action + ')');
  return pw === PW;
}

function showOverlay(text, sub) {
  document.getElementById('overlay-text').textContent = text || '처리중...';
  document.getElementById('overlay-sub').textContent = sub || '잠시만 기다려주세요';
  document.getElementById('overlay').classList.add('show');
}

function hideOverlay() {
  document.getElementById('overlay').classList.remove('show');
}


/* -------------------------------------------------------
   [3] 링크 버튼 활성/비활성 - 서버 오프라인시 링크 차단
------------------------------------------------------- */
function setLinksState(online) {
  document.querySelectorAll('.link-btn').forEach(el => {
    el.style.pointerEvents = online ? '' : 'none';
    el.style.opacity = online ? '' : '0.2';
  });
}


/* -------------------------------------------------------
   [4] 서버 상태 반영 - 온라인/오프라인에 따라 전체 버튼 활성/비활성
------------------------------------------------------- */
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
    ['ollama','openclaw','comfyui'].forEach(s => {
      document.getElementById(s+'-start').disabled = false;
      document.getElementById(s+'-stop').disabled = false;
    });
    document.getElementById('proj-name').disabled = false;
    document.querySelector('.btn-create').disabled = false;
    document.querySelector('.btn-del').disabled = false;
    setLinksState(true);
  } else {
    dot.className = 'status-dot offline';
    txt.textContent = '서버 중지됨';
    btnOn.disabled = false;
    btnOff.disabled = true;
    ['ollama','openclaw','comfyui'].forEach(s => {
      document.getElementById(s+'-start').disabled = true;
      document.getElementById(s+'-stop').disabled = true;
      document.getElementById(s+'-dot').className = 'svc-dot';
    });
    document.getElementById('proj-name').disabled = true;
    document.querySelector('.btn-create').disabled = true;
    document.querySelector('.btn-del').disabled = true;
    setLinksState(false);
  }
}


/* -------------------------------------------------------
   [5] 서버 상태 확인 - API /status 호출
------------------------------------------------------- */
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
    setServerState(data.status === 'online');
  } catch(e) {
    setServerState(false);
  }
}


/* -------------------------------------------------------
   [6] 서비스 상태 반영 - 온라인/오프라인에 따라 시작/종료 버튼 전환
------------------------------------------------------- */
function setSvcState(service, online) {
  const dot = document.getElementById(service + '-dot');
  const btnStart = document.getElementById(service + '-start');
  const btnStop = document.getElementById(service + '-stop');
  dot.className = 'svc-dot ' + (online ? 'online' : 'offline');
  if (btnStart) btnStart.disabled = online;
  if (btnStop) btnStop.disabled = !online;
}


/* -------------------------------------------------------
   [7] 개별 서비스 상태 확인 - API /{service}/status 호출
------------------------------------------------------- */
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

// 전체 서비스 일괄 확인
function checkAllServices() {
  serviceCheck('ollama');
  serviceCheck('openclaw');
  serviceCheck('comfyui');
}


/* -------------------------------------------------------
   [8] 서버 켜기 - GitHub Actions WoL 트리거 + 부팅 대기 폴링
------------------------------------------------------- */
let pollInterval = null, pollCount = 0;

async function powerOn() {
  if (!checkPw('서버 켜기')) return;
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


/* -------------------------------------------------------
   [9] 서버 끄기 - API /shutdown 호출
------------------------------------------------------- */
async function powerOff() {
  if (!checkPw('서버 끄기')) return;
  showOverlay('서버 종료중...', '');
  try { await fetch(API + '/shutdown?token=' + TOKEN); } catch(e) {}
  setTimeout(() => { hideOverlay(); setServerState(false); }, 4000);
}


/* -------------------------------------------------------
   [10] 서비스 시작/종료 - API /{service}/start|stop 호출
------------------------------------------------------- */
async function serviceCtrl(service, action, overlayText) {
  const actionKo = action === 'start' ? '시작' : '종료';
  if (!checkPw(service + ' ' + actionKo)) return;
  showOverlay(overlayText, '');
  try {
    await fetch(API + '/' + service + '/' + action + '?token=' + TOKEN);
    setTimeout(async () => {
      await serviceCheck(service);
      hideOverlay();
    }, 3000);
  } catch(e) {
    hideOverlay();
    alert('서버 연결 실패');
  }
}


/* -------------------------------------------------------
   [11] 프로젝트 생성 - API /create-project 호출 + GitHub 반영
------------------------------------------------------- */
async function createProject() {
  const name = document.getElementById('proj-name').value.trim();
  if (!name) return alert('이름을 입력하세요');
  if (!checkPw('프로젝트 생성')) return;
  showOverlay('프로젝트 생성중...', 'GitHub 반영 중 (약 1분)');
  try {
    const res = await fetch(API + '/create-project?token=' + TOKEN, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name})
    });
    const data = await res.json();
    if (data.status === 'ok') {
      setTimeout(() => { hideOverlay(); location.reload(); }, 60000);
    } else {
      hideOverlay();
      alert('오류: ' + JSON.stringify(data));
    }
  } catch(e) {
    hideOverlay();
    alert('서버 연결 실패');
  }
}


/* -------------------------------------------------------
   [12] 프로젝트 삭제 - API /delete-project 호출 + GitHub 반영
------------------------------------------------------- */
async function deleteProject() {
  const name = document.getElementById('proj-name').value.trim();
  if (!name) return alert('이름을 입력하세요');
  if (!checkPw('프로젝트 삭제')) return;
  if (!confirm(name + ' 를 정말 삭제하시겠습니까?')) return;
  showOverlay('프로젝트 삭제중...', 'GitHub 반영 중 (약 1분)');
  try {
    const res = await fetch(API + '/delete-project?token=' + TOKEN, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name})
    });
    const data = await res.json();
    if (data.status === 'ok') {
      setTimeout(() => { hideOverlay(); location.reload(); }, 60000);
    } else {
      hideOverlay();
      alert('오류: ' + JSON.stringify(data));
    }
  } catch(e) {
    hideOverlay();
    alert('서버 연결 실패');
  }
}


/* -------------------------------------------------------
   [13] 페이지 로드 - 서버 및 전체 서비스 상태 자동 확인
------------------------------------------------------- */
window.onload = async () => {
  await checkServerStatus();
  checkAllServices();
};
