// 2m 밖에서도 알 수 있는 안내: 소리 설정, 효과음, 자세 안내 음성, 시작 카운트다운, 운동 화면 표시

// ===== 소리 설정 (🔊 횟수+자세 안내 / 🔢 횟수만 / 🔇 끔) =====
function loadVoiceMode() {
    try {
        const saved = localStorage.getItem(VOICE_KEY);
        return VOICE_MODES.some(mode => mode.id === saved) ? saved : 'all';
    } catch (error) {
        return 'all';
    }
}
let voiceMode = loadVoiceMode();

function voiceAllows(priority) {
    if (voiceMode === 'off') return false;
    if (voiceMode === 'count') return priority >= SPEAK.COUNT;
    return true;
}

function updateVoiceButton() {
    const btn = document.getElementById('voice-btn');
    const mode = VOICE_MODES.find(m => m.id === voiceMode);
    if (!btn || !mode) return;
    btn.textContent = mode.icon;
    btn.setAttribute('aria-label', mode.label);
}

function cycleVoiceMode() {
    const index = VOICE_MODES.findIndex(mode => mode.id === voiceMode);
    const next = VOICE_MODES[(index + 1) % VOICE_MODES.length];
    voiceMode = next.id;
    try { localStorage.setItem(VOICE_KEY, voiceMode); } catch (error) { /* 저장 안 돼도 이번에는 적용 */ }
    if (voiceMode === 'off' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    updateVoiceButton();
    showToast(`${next.icon} ${next.label}`);
}

// ===== 효과음 (음성보다 빨리 나서 "셌다"는 걸 바로 알 수 있음) =====
const BEEPS = { rep: [1047, 0.12], tick: [660, 0.15], go: [988, 0.35] }; // [높이(Hz), 길이(초)]
let audioCtx = null;

// 폰에서는 화면을 누른 순간에 소리를 한 번 켜 둬야 나중에 소리를 낼 수 있음
function unlockAudio() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!audioCtx && AudioCtx) audioCtx = new AudioCtx();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (error) {
        audioCtx = null;
    }
}

function beep(kind) {
    if (!audioCtx || voiceMode === 'off' || !BEEPS[kind]) return;
    const [frequency, duration] = BEEPS[kind];
    try {
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + duration);
    } catch (error) { /* 소리 미지원 기기 */ }
}

// ===== 자세·위치 안내 음성 (같은 말을 계속 반복하지 않게) =====
let hintKey = null;
let hintSince = 0;
const hintSpokenAt = {};

// 매 프레임 호출: 같은 문제가 COACH_HOLD_MS 넘게 계속되면 말하고 true를 돌려줌
// key가 null이면 '문제 없음' (기다리던 안내를 취소)
function coachHint(key, text) {
    const now = performance.now();
    if (key !== hintKey) {
        hintKey = key;
        hintSince = now;
        return false;
    }
    if (!key || now - hintSince < COACH_HOLD_MS) return false;
    coachNow(key, text);
    return true;
}

// 한 번 일어난 일(예: 덜 앉았다 일어남)은 바로 말함
function coachNow(key, text) {
    const now = performance.now();
    if (now - (hintSpokenAt[key] || 0) < COACH_REPEAT_MS) return;
    hintSpokenAt[key] = now;
    speakText(text, SPEAK.COACH);
}

function resetCoach() {
    hintKey = null;
    hintSince = 0;
}

// ===== 운동 화면 표시 =====
// mode: 'preview'(영상 위주) / 'waiting'(물러나라는 안내) / 'countdown'(3, 2, 1) / 'focus'(큰 숫자)
// warn: 주황 테두리 (몸이 안 보이거나 자세가 틀림)
let stageMode = '';
let stageWarn = false;

// 매 프레임 불려도 바뀔 때만 화면을 고침 (폰이 느려지지 않게)
function setStageView(mode, warn = false) {
    if (mode === stageMode && warn === stageWarn) return;
    stageMode = mode;
    stageWarn = warn;
    const stage = document.querySelector('.stage');
    if (!stage) return;
    stage.dataset.mode = mode;
    stage.classList.toggle('warn', warn);
}

function setStageCenter(big, small) {
    const bigEl = document.getElementById('sc-big');
    const smallEl = document.getElementById('sc-small');
    if (bigEl && bigEl.textContent !== big) bigEl.textContent = big;
    if (smallEl && smallEl.textContent !== small) smallEl.textContent = small;
}

// 1회 셀 때 화면 전체가 초록으로 번쩍
function flashRep() {
    const el = document.getElementById('rep-flash');
    if (!el) return;
    el.classList.remove('on');
    void el.offsetWidth; // 애니메이션 다시 시작
    el.classList.add('on');
}

// 1회 판정 결과를 상태 문구 아래에 잠깐 크게 표시 (✅ 좋은 자세 / ⚠️ 고칠 점)
// tips: 고칠 점의 짧은 문구 목록 (빈 목록 = 좋은 자세)
let formBadgeTimer = null;
function showFormBadge(tips) {
    const el = document.getElementById('form-badge');
    if (!el) return;
    el.textContent = tips.length ? `⚠️ ${tips.join(' · ')}` : '✅ 좋은 자세';
    el.classList.toggle('bad', tips.length > 0);
    el.classList.add('show');
    clearTimeout(formBadgeTimer);
    formBadgeTimer = setTimeout(hideFormBadge, FORM_BADGE_MS);
}

function hideFormBadge() {
    clearTimeout(formBadgeTimer);
    document.getElementById('form-badge')?.classList.remove('show');
}

// ===== 시작 카운트다운 =====
// '시작하기'를 누른 뒤 폰에서 물러나는 동안은 세지 않고, 몸이 보이면 3, 2, 1 후에 셈
let readySince = 0;
let lostSince = 0;
let countdownTimer = null;
let waitAnnounced = true;

function waitGuideFor(index) {
    const ex = exercises[index];
    return WAIT_GUIDE[(ex && placementByType[ex.type]) || 'front'] || WAIT_GUIDE.front;
}

function enterWaiting(speak = true) {
    cancelCountdown();
    resetCoach();
    startPhase = 'waiting';
    readySince = 0;
    waitAnnounced = !speak;
    // 카메라가 아직 안 켜졌으면 첫 화면이 들어올 때 안내함 (권한 거부 등 오류 문구도 덮지 않음)
    if (cameraStream) showWaiting();
}

function showWaiting() {
    const guide = waitGuideFor(selectedStepIndex);
    setStageView('waiting');
    setStageCenter(guide.icon, guide.text);
    if (waitAnnounced) return;
    waitAnnounced = true;
    document.getElementById('ai-status').textContent = '뒤로 물러나 주세요';
    hintSpokenAt.wait = performance.now(); // 첫 안내 직후에 '아직 안 보여요'를 바로 말하지 않게
    speakText(guide.speech, SPEAK.IMPORTANT);
}

// 매 프레임 호출: 시작에 필요한 관절이 보이는지(ready)에 따라 단계를 진행
function updateStartPhase(ready) {
    const now = performance.now();
    if (startPhase === 'waiting') {
        const guide = waitGuideFor(selectedStepIndex);
        showWaiting();
        if (!ready) {
            readySince = 0;
            coachHint('wait', guide.remind);
            return;
        }
        coachHint(null);
        if (!readySince) readySince = now;
        if (now - readySince >= READY_HOLD_MS) startCountdown();
        return;
    }
    if (startPhase === 'countdown') {
        if (ready) {
            lostSince = 0;
            return;
        }
        if (!lostSince) lostSince = now;
        if (now - lostSince >= READY_HOLD_MS) {
            enterWaiting(false);
            speakText('화면 밖으로 나갔어요. 다시 들어와 주세요.', SPEAK.IMPORTANT);
        }
    }
}

function startCountdown() {
    cancelCountdown();
    startPhase = 'countdown';
    resetCoach();
    setStageView('countdown');
    let n = 3;
    const tick = () => {
        countdownTimer = null;
        if (selectedStepIndex === null || startPhase !== 'countdown') return;
        if (n > 0) {
            setStageCenter(String(n), '준비');
            document.getElementById('ai-status').textContent = `${n}초 뒤 시작`;
            beep('tick');
            speakText(String(n), SPEAK.IMPORTANT);
            n--;
            // '1' 다음은 조금 빨리 시작 (음성이 화면보다 살짝 늦게 나오므로 1초를 다 기다리면 늘어지게 느껴짐)
            countdownTimer = setTimeout(tick, n > 0 ? 1000 : COUNTDOWN_LAST_MS);
            return;
        }
        startPhase = 'go';
        resetRecognitionState(); // 지금 자세를 기준으로 다시 잼 (물러나는 동안의 값은 버림)
        // 소리·번쩍·진동을 먼저 바로 내고, 음성은 그다음 (음성은 폰에 따라 늦게 나올 수 있음)
        setStageView('focus');
        flashRep();
        beep('go');
        vibrate(200);
        document.getElementById('ai-status').textContent = '시작!';
        speakText('시작!', SPEAK.IMPORTANT);
    };
    tick();
}

function cancelCountdown() {
    if (countdownTimer) {
        clearTimeout(countdownTimer);
        countdownTimer = null;
    }
    lostSince = 0;
}
