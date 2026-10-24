// 운동 창, 세트·휴식 진행, 단계 완료

let guideVisible = false;

function showPlacementGuide(speak = true) {
    if (selectedStepIndex === null) return;
    const ex = exercises[selectedStepIndex];
    const key = placementByType[ex.type] || 'front';
    const guide = placementGuides[key];
    document.getElementById('pg-figure').innerHTML = PLACEMENT_SVG[key]
        + (guide.caption ? `<div class="pg-caption">${guide.caption}</div>` : '');
    document.getElementById('pg-title').textContent = guide.title;
    const list = document.getElementById('pg-lines');
    list.replaceChildren();
    guide.lines.forEach(line => {
        const li = document.createElement('li');
        li.textContent = line;
        list.appendChild(li);
    });
    document.getElementById('place-guide').style.display = 'flex';
    guideVisible = true;
    stopPlankTimer(false);
    cancelCountdown();
    setStageView('preview');
    if (speak) speakText(guide.speech, SPEAK.IMPORTANT);
}

function hidePlacementGuide() {
    document.getElementById('place-guide').style.display = 'none';
    guideVisible = false;
    resetRecognitionState();
    unlockAudio(); // 화면을 누른 지금 소리를 켜 둬야 나중에 효과음이 나옴
    if (selectedStepIndex !== null) {
        const ex = exercises[selectedStepIndex];
        if (ex.type === 'burpee') {
            startPhase = 'go';
            speakText('시작!', SPEAK.IMPORTANT);
        } else {
            enterWaiting(true); // 물러날 시간을 주고, 몸이 보이면 3, 2, 1 후에 셈 (coach.js)
        }
    }
}

function handleSetCompletion() {
    if (selectedStepIndex === null || isResting || isCompletingSet) return;
    isCompletingSet = true;
    vibrate([120, 60, 120]);
    if (currentSet < totalSets) {
        speakText('세트 완료! 휴식을 취하세요.', SPEAK.IMPORTANT);
        startRestPhase();
    } else {
        speakText('축하합니다! 모든 세트를 마쳤습니다.', SPEAK.IMPORTANT);
        completionTimeout = setTimeout(() => {
            completionTimeout = null;
            finishCurrentStep(false);
        }, 300);
    }
}

function startRestPhase() {
    if (restInterval) clearInterval(restInterval);
    isResting = true;
    restTimeLeft = restTimeConfig;
    document.getElementById('rest-countdown').textContent = String(restTimeLeft);
    document.getElementById('rest-overlay').style.display = 'flex';

    restInterval = setInterval(() => {
        restTimeLeft--;
        document.getElementById('rest-countdown').textContent = String(Math.max(0, restTimeLeft));
        if (restTimeLeft === 3) speakText('3초 전', SPEAK.IMPORTANT);
        if (restTimeLeft <= 0) endRestPhase();
    }, 1000);
}

// 건너뛰기는 폰 앞에서 누르므로, 다시 물러날 시간을 주고 카운트다운 후에 셈
function skipRest() {
    endRestPhase();
    const ex = exercises[selectedStepIndex];
    if (ex && ex.type !== 'burpee') enterWaiting(true);
}

function endRestPhase() {
    if (!isResting) return;
    if (restInterval) { clearInterval(restInterval); restInterval = null; }
    isResting = false;
    isCompletingSet = false;
    document.getElementById('rest-overlay').style.display = 'none';

    currentSet++;
    countReps = 0;
    resetRecognitionState();
    document.getElementById('current-set').textContent = String(currentSet);
    setRepsDisplay(0);
    document.getElementById('ai-status').textContent = `${currentSet}세트 시작!`;
    speakText(`${currentSet}세트 시작!`, SPEAK.IMPORTANT);
    vibrate(200);
    setStageView('focus');
}

function openExerciseModal(index) {
    if (!Number.isInteger(index) || index < 0 || index >= exercises.length) return;
    if (index > completedSteps) {
        showToast('🔒 이전 단계를 먼저 클리어해주세요!');
        return;
    }

    stopWorkoutResources();
    selectedStepIndex = index;
    countReps = 0;
    currentSet = 1;
    resetRecognitionState();
    isResting = false;
    isCompletingSet = false;
    startPhase = 'waiting';
    unlockAudio();
    updateVoiceButton();

    const ex = exercises[index];
    const goal = document.getElementById('goal-select').value;
    const level = document.getElementById('level-select').value;
    const config = (difficultyConfig[goal] || difficultyConfig.diet)[level] || difficultyConfig.diet.beginner;

    totalSets = config.sets;
    restTimeConfig = config.rest;

    document.getElementById('modal-title').textContent = ex.name;
    const instructionList = document.createElement('ol');
    instructionList.className = 'instruction-list';
    ex.instructions.forEach(instruction => {
        const item = document.createElement('li');
        item.textContent = instruction;
        instructionList.appendChild(item);
    });
    document.getElementById('modal-desc').replaceChildren(instructionList);
    document.getElementById('modal-sets').textContent = String(totalSets);
    document.getElementById('modal-reps').textContent = String(config.reps);
    document.getElementById('modal-rest').textContent = String(restTimeConfig);
    document.getElementById('current-set').textContent = '1';
    setRepsDisplay(0);
    document.getElementById('unit-label').textContent = ex.type === 'plank' ? '초' : '회';
    document.getElementById('rest-overlay').style.display = 'none';
    document.getElementById('workout-modal').style.display = 'flex';
    document.getElementById('flip-btn').style.visibility = ex.type === 'burpee' ? 'hidden' : 'visible';

    // 안드로이드 '뒤로 가기'를 누르면 앱이 꺼지지 않고 운동 창만 닫히게 함
    if (!(history.state && history.state.sololingoModal)) {
        history.pushState({ sololingoModal: true }, '');
    }

    // 음성 안내는 사용자가 화면을 누른 순간에 먼저 한 번 말해야 폰에서 허용됨
    showPlacementGuide(true); // 화면을 누른 순간에 말해야 폰에서 음성이 허용됨
    requestWakeLock();

    const canvas = document.getElementById('output-canvas');
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);

    if (ex.type === 'burpee') {
        stopCamera();
        document.getElementById('ai-status').textContent = '자동 자세 인식 미지원 · 수동 완료 가능';
        return;
    }

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        document.getElementById('ai-status').textContent =
            '카메라는 HTTPS 주소에서만 켜집니다. (수동 진행 가능)';
        return;
    }

    // 지난번에 복구를 포기했다면 운동을 다시 열 때 처음부터 다시 시도
    if (poseErrorCount > 3) {
        poseErrorCount = 0;
        poseRecovering = false;
        if (pose) { try { pose.close(); } catch (error) { /* 무시 */ } pose = null; }
    }
    try {
        ensurePose();
    } catch (error) {
        console.warn(error);
        document.getElementById('ai-status').textContent = `${error.message} (수동 완료 가능)`;
        return;
    }
    beginCamera(index);
}

function stopWorkoutResources() {
    stopPlankTimer(false);
    cancelCountdown();
    setStageView('preview');
    if (restInterval) { clearInterval(restInterval); restInterval = null; }
    if (completionTimeout) { clearTimeout(completionTimeout); completionTimeout = null; }
    isResting = false;
    isCompletingSet = false;
    document.getElementById('rest-overlay').style.display = 'none';
    stopCamera();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// 원래 코드에서 호출만 하고 정의되지 않았던 함수 (닫기 버튼·뒤로가기·앱 전환 시 사용)
function closeWorkoutModal() {
    const modal = document.getElementById('workout-modal');
    const wasOpen = modal.style.display === 'flex';
    stopWorkoutResources();
    modal.style.display = 'none';
    document.getElementById('place-guide').style.display = 'none';
    guideVisible = false;
    selectedStepIndex = null;
    releaseWakeLock();
    if (wasOpen && history.state && history.state.sololingoModal) {
        ignoreNextPop = true; // 우리가 직접 보낸 '뒤로 가기'는 무시 (바로 다시 연 창이 닫히지 않게)
        history.back();
    }
}
let ignoreNextPop = false;

window.addEventListener('popstate', () => {
    if (ignoreNextPop) {
        ignoreNextPop = false;
        // 그 사이에 운동 창을 다시 열었다면 뒤로 가기 기록을 다시 만들어 둠
        if (document.getElementById('workout-modal').style.display === 'flex') {
            history.pushState({ sololingoModal: true }, '');
        }
        return;
    }
    if (document.getElementById('workout-modal').style.display === 'flex') closeWorkoutModal();
});

function finishCurrentStep(isManual = false) {
    const finishedIndex = selectedStepIndex;
    if (finishedIndex === null) return;
    closeWorkoutModal();

    if (finishedIndex === completedSteps) {
        completionModes[String(finishedIndex)] = isManual ? 'manual' : 'ai';
        completedSteps++;
        recordWorkoutActivity();
        addXP(20);
        checkBadges();
        saveProgress();
        renderPath();

        if (completedSteps === exercises.length) {
            setTimeout(() => { showDietModal(true); renderDietCard(); }, 500);
        }
    }
}
