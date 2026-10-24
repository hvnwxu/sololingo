// 카메라, MediaPipe 모델 준비·오류 복구

function explainCameraError(error) {
    const name = error?.name || 'UnknownError';
    const message = error?.message || '브라우저에서 상세 오류를 제공하지 않았습니다.';
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        return '카메라 권한을 사용할 수 없는 실행 환경입니다. HTTPS 주소(예: GitHub Pages)로 접속해 주세요.';
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        return '카메라 권한이 차단되었습니다. 주소창 왼쪽 아이콘 → 권한에서 카메라를 허용해 주세요.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return '사용 가능한 카메라를 찾지 못했습니다.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
        return '다른 앱이 카메라를 사용 중입니다. 다른 앱을 닫고 다시 시도해 주세요.';
    }
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
        return '이 카메라 설정을 지원하지 않습니다. 🔄 전환을 눌러 다른 카메라를 사용해 보세요.';
    }
    return `카메라 오류 (${name}): ${message}`;
}

// ===== AI 자세 인식 준비 (처음 운동을 시작할 때 한 번만) =====
function ensurePose() {
    if (pose) return pose;
    if (typeof Pose !== 'function') throw new Error('MediaPipe 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    pose = new Pose({ locateFile: (file) => `${POSE_CDN}/${file}` });
    pose.setOptions({ modelComplexity: poseComplexity, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    pose.onResults(onPoseResults);
    return pose;
}

// ===== 카메라 (MediaPipe camera_utils 대신 직접 제어) =====
async function startCamera(index) {
    const session = ++cameraSession;
    stopCamera(false);

    const videoElement = document.getElementById('webcam-video');
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            facingMode: facingMode,
            // 카메라 센서 원래 비율(4:3)로 요청 → 16:9보다 위아래가 덜 잘려서 더 넓게 찍힘
            // (AI 입력은 256px이라 해상도는 640이면 충분하고 더 빠름)
            width: { ideal: 640 },
            height: { ideal: 480 }
        }
    });

    // 광각(줌 아웃)을 지원하는 카메라라면 가장 넓게 설정
    try {
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.zoom && Number.isFinite(caps.zoom.min)) {
            await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
        }
    } catch (error) { /* 줌 미지원 카메라 */ }

    // 카메라를 켜는 사이에 다른 운동으로 바뀌었거나 창을 닫았다면 바로 끔
    if (session !== cameraSession || selectedStepIndex !== index) {
        stream.getTracks().forEach(track => track.stop());
        return false;
    }

    cameraStream = stream;
    videoElement.srcObject = stream;
    await videoElement.play();
    document.getElementById('output-canvas').classList.toggle('mirror', facingMode === 'user');
    runFrameLoop(session);
    return true;
}

function runFrameLoop(session) {
    const videoElement = document.getElementById('webcam-video');
    const step = async () => {
        if (session !== cameraSession) return;
        frameLoopId = requestAnimationFrame(step);
        if (!pose || poseRecovering || videoElement.readyState < 2 || selectedStepIndex === null || isResting || poseFrameInFlight) return;
        poseFrameInFlight = true;
        try {
            await pose.send({ image: videoElement });
            if (!poseReady) {
                poseReady = true;
                poseErrorCount = 0;
            } else {
                checkSpeed();
            }
        } catch (error) {
            console.warn('자세 인식 중 오류가 발생했습니다.', error);
            recoverPose(error);
        } finally {
            poseFrameInFlight = false;
        }
    };
    frameLoopId = requestAnimationFrame(step);
}

// 처음 4초 동안 초당 몇 번 인식하는지 재서, 너무 느리면 가벼운 모델로 전환
function checkSpeed() {
    if (fpsChecked || poseComplexity === 0 || !pose) return;
    const now = performance.now();
    if (!fpsWindowStart) { fpsWindowStart = now; fpsFrames = 0; return; }
    fpsFrames++;
    if (now - fpsWindowStart < 4000) return;
    fpsChecked = true;
    const fps = fpsFrames * 1000 / (now - fpsWindowStart);
    if (fps < 9) {
        useLightModel();
        rebuildPose();
        showToast('폰 속도에 맞춰 가벼운 AI 모드로 바꿨어요');
    }
}

function useLightModel() {
    poseComplexity = 0;
    fpsChecked = true;
    try { localStorage.setItem(COMPLEXITY_KEY, '0'); } catch (error) { /* 무시 */ }
}

// AI를 완전히 새로 만듦 (실행 중에 설정을 바꾸면 오류가 나는 기기가 있어서)
let poseRecovering = false;
let poseErrorCount = 0;
function rebuildPose(delay = 300) {
    poseRecovering = true;
    const old = pose;
    pose = null;
    poseReady = false;
    if (old) { try { old.close(); } catch (error) { /* 이미 닫힘 */ } }
    setTimeout(() => {
        try { ensurePose(); } catch (error) { console.warn(error); }
        poseRecovering = false;
    }, delay);
}

// 자세 인식 중 오류가 나면: 가벼운 모델로 바꿔 최대 3번 다시 시도
function recoverPose(error) {
    poseErrorCount++;
    const detail = (error && (error.message || error.name)) ? String(error.message || error.name).slice(0, 60) : '알 수 없는 오류';
    const status = document.getElementById('ai-status');
    if (poseErrorCount <= 3) {
        useLightModel();
        rebuildPose(500 * poseErrorCount);
        if (selectedStepIndex !== null) status.textContent = `AI 다시 준비 중... (${poseErrorCount}/3)`;
    } else if (selectedStepIndex !== null) {
        poseRecovering = true; // 더 시도하지 않음
        status.textContent = `자세 인식 오류: ${detail} (수동 완료 가능)`;
    }
}

function stopCamera(invalidate = true) {
    if (invalidate) cameraSession++;
    if (frameLoopId) { cancelAnimationFrame(frameLoopId); frameLoopId = null; }
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    const videoElement = document.getElementById('webcam-video');
    if (videoElement) videoElement.srcObject = null;
}

function flipCamera() {
    if (selectedStepIndex === null) return;
    const ex = exercises[selectedStepIndex];
    if (!ex || ex.type === 'burpee') return;
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    showToast(facingMode === 'user' ? '전면 카메라' : '후면 카메라');
    beginCamera(selectedStepIndex);
}

function beginCamera(index) {
    const ex = exercises[index];
    document.getElementById('ai-status').textContent = poseReady ? '카메라 켜는 중...' : 'AI 모델 불러오는 중... (처음 한 번은 조금 걸려요)';
    startCamera(index).then(started => {
        if (!started || selectedStepIndex !== index) return;
        document.getElementById('ai-status').textContent = `${ex.name} 준비 완료! 2m 뒤로 물러나세요`;
    }).catch(error => {
        console.warn('카메라를 시작하지 못했습니다.', error);
        if (selectedStepIndex === index) {
            document.getElementById('ai-status').textContent = `${explainCameraError(error)} (수동 진행 가능)`;
        }
    });
}

// 폰을 돌리면 카메라 방향을 다시 맞추기 위해 카메라를 다시 켬
let orientationTimer = null;
function handleOrientationChange() {
    clearTimeout(orientationTimer);
    orientationTimer = setTimeout(() => {
        if (selectedStepIndex === null || !cameraStream) return;
        const ex = exercises[selectedStepIndex];
        if (ex && ex.type !== 'burpee') {
            smoothed = {}; // 허벅지 기준값도 여기 들어 있어서 같이 초기화됨
            beginCamera(selectedStepIndex);
        }
    }, 400);
}
if (screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change', handleOrientationChange);
} else {
    window.addEventListener('orientationchange', handleOrientationChange);
}
