// 음성 안내, 진동, 알림, 화면 꺼짐 방지

// ===== 모바일 보조 기능 =====

// 음성 안내 (TTS)
// priority: SPEAK.COACH(자세 안내) < SPEAK.COUNT(횟수) < SPEAK.IMPORTANT(세트 시작·완료, 카운트다운)
// - 같거나 더 중요한 말은 지금 말을 끊고 바로 말함 (횟수가 밀리지 않게)
// - 덜 중요한 말은 중요한 말을 끊지 않음: 횟수는 뒤에 이어서, 자세 안내는 건너뜀
let speakingPriority = 0;
function speakText(text, priority = SPEAK.COUNT) {
    if (!('speechSynthesis' in window) || !voiceAllows(priority)) return;
    const synth = window.speechSynthesis;
    const busy = synth.speaking || synth.pending;
    if (busy && priority < speakingPriority) {
        if (priority === SPEAK.COACH) return;
    } else if (busy) {
        synth.cancel(); // 말하는 중일 때만 끊음 (안드로이드는 cancel 직후 다음 음성이 늦게 나옴)
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.1;
    utterance.onstart = () => { speakingPriority = priority; };
    utterance.onend = utterance.onerror = () => { if (!synth.speaking) speakingPriority = 0; };
    speakingPriority = Math.max(busy ? speakingPriority : 0, priority);
    synth.speak(utterance);
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
