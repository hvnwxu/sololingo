// 음성 안내, 진동, 알림, 화면 꺼짐 방지

// ===== 모바일 보조 기능 =====

// 음성 안내 (TTS)
function speakText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR';
        utterance.rate = 1.1;
        window.speechSynthesis.speak(utterance);
    }
}

// 진동 (갤럭시 등 안드로이드 폰에서 동작)
function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (error) { /* 진동 미지원 기기 */ }
}

// alert 대신 화면 아래에 잠깐 보이는 알림
let toastTimer = null;
function showToast(message, duration = 2200) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// 운동 중 화면이 꺼지지 않게 함 (Screen Wake Lock API)
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator && !wakeLock) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
    } catch (error) {
        console.warn('화면 꺼짐 방지를 켜지 못했습니다.', error);
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
}

// 횟수 표시 (큰 숫자 + 튀는 효과)
function setRepsDisplay(value, animate = false) {
    const el = document.getElementById('current-reps');
    el.textContent = String(value);
    if (animate) {
        el.classList.remove('pop');
        void el.offsetWidth; // 애니메이션 다시 시작
        el.classList.add('pop');
    }
}
