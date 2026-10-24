// 자세 판정: 각도 계산, 흔들림 보정, 운동별 횟수 세기

let smoothed = {};           // 각도 흔들림을 줄이기 위한 평균값
let thighRef = 0;            // 서 있을 때 허벅지 길이 (스쿼트 기준값)
let plankLastGood = 0;
let shallowDip = false;      // 내려가다 말고 다시 올라왔는지 ("조금 더 깊이" 안내용)

function resetRecognitionState() {
    smoothed = {};
    thighRef = 0;
    plankLastGood = 0;
    shallowDip = false;
    motionState = 'UP';
}

// 운동별로 시작(카운트다운)에 필요한 관절이 보이는지
function requiredJointsVisible(type, J, vis) {
    if (type === 'pushup') return [J.shoulder, J.elbow, J.wrist].every(vis);
    if (type === 'plank') return vis(J.shoulder) && vis(J.hip) && (vis(J.knee) || vis(J.ankle));
    return vis(J.shoulder) && vis(J.hip) && vis(J.knee);
}

// 최근 값과 섞어서 한 프레임의 튀는 값을 줄임
function smooth(key, value, alpha = 0.45) {
    const prev = smoothed[key];
    const next = prev === undefined ? value : prev * (1 - alpha) + value * alpha;
    smoothed[key] = next;
    return next;
}

function calculateAngle(p1, p2, p3) {
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
}

function isLandmarkVisible(point, threshold = VISIBILITY) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const visibility = point.visibility ?? 1;
    return Number.isFinite(visibility) && visibility >= threshold;
}

function landmarkSideScore(landmarks, indices) {
    return indices.reduce((score, index) => {
        const point = landmarks[index];
        return score + (point && Number.isFinite(point.visibility) ? point.visibility : 0);
    }, 0);
}

function stopPlankTimer(resetCount = false) {
    if (plankTimer) {
        clearInterval(plankTimer);
        plankTimer = null;
    }
    if (resetCount) {
        countReps = 0;
        setRepsDisplay(0);
    }
}

function drawSkeleton(ctx, landmarks, width, height) {
    const connections = [
        [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
        [11, 23], [12, 24], [23, 24],
        [23, 25], [25, 27], [24, 26], [26, 28]
    ];

    // 화면 크기에 맞춰 선 굵기 조절 (고해상도 폰에서도 잘 보이게)
    const scale = Math.max(1, Math.min(width, height) / 360);
    ctx.strokeStyle = '#58cc02';
    ctx.lineWidth = 4 * scale;

    connections.forEach(([i, j]) => {
        const p1 = landmarks[i], p2 = landmarks[j];
        if (isLandmarkVisible(p1) && isLandmarkVisible(p2)) {
            ctx.beginPath();
            ctx.moveTo(p1.x * width, p1.y * height);
            ctx.lineTo(p2.x * width, p2.y * height);
            ctx.stroke();
        }
    });

    [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(i => {
        const point = landmarks[i];
        if (isLandmarkVisible(point)) {
            ctx.beginPath();
            ctx.arc(point.x * width, point.y * height, 6 * scale, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffc800';
            ctx.fill();
        }
    });
}

function onPoseResults(results) {
    if (isResting || selectedStepIndex === null) return;

    const canvasElement = document.getElementById('output-canvas');
    const canvasCtx = canvasElement?.getContext('2d');
    if (!canvasElement || !canvasCtx || !results?.image) return;
    if (canvasElement.width !== results.image.width) canvasElement.width = results.image.width;
    if (canvasElement.height !== results.image.height) canvasElement.height = results.image.height;

    // 카메라 영상과 뼈대를 같은 canvas에 그려서 위치가 항상 일치하게 함
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    const currentEx = exercises[selectedStepIndex];
    if (!currentEx) return;

    const W = canvasElement.width, H = canvasElement.height;
    const status = document.getElementById('ai-status');

    if (!results.poseLandmarks) {
        if (guideVisible) return;
        if (startPhase !== 'go') {
            updateStartPhase(false);
            return;
        }
        if (currentEx.type === 'plank') pausePlankIfStale();
        else motionState = 'UP';
        status.textContent = currentEx.type === 'burpee'
            ? '수동 완료만 지원되는 운동입니다.'
            : '사람이 보이지 않아요. 화면 안으로 들어와 주세요';
        if (coachHint('lost', '몸이 안 보여요. 화면 안으로 들어와 주세요.')) setStageView('preview', true);
        return;
    }

    const landmarks = results.poseLandmarks;
    drawSkeleton(canvasCtx, landmarks, W, H);

    // 안내 화면이 떠 있는 동안에는 미리보기만 하고 세지 않음
    if (guideVisible) {
        status.textContent = '화면에 내 몸이 보이면 시작하기를 눌러주세요';
        return;
    }

    if (currentEx.type === 'burpee') {
        status.textContent = '자동 인식 미지원 · 수동 완료 가능';
        return;
    }

    // 0~1 비율 좌표를 실제 픽셀 좌표로 바꿔서 각도를 계산 (화면 비율 때문에 각도가 틀어지지 않게)
    const P = landmarks.map(p => ({ x: p.x * W, y: p.y * H, visibility: p.visibility }));
    const vis = index => isLandmarkVisible(landmarks[index]);

    const targetReps = safeInteger(
        Number.parseInt(document.getElementById('modal-reps').textContent, 10), 1, 1, 1000
    );

    // 카메라에 더 잘 보이는 쪽(왼쪽/오른쪽) 몸을 사용
    const LEFT = { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 };
    const RIGHT = { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 };
    const scoreKeys = currentEx.type === 'pushup' ? ['shoulder', 'elbow', 'wrist']
        : currentEx.type === 'plank' ? ['shoulder', 'hip', 'knee', 'elbow']
        : ['hip', 'knee', 'ankle'];
    const useRight = landmarkSideScore(landmarks, scoreKeys.map(k => RIGHT[k])) >= landmarkSideScore(landmarks, scoreKeys.map(k => LEFT[k]));
    const J = useRight ? RIGHT : LEFT;

    // '시작하기'를 누른 뒤 물러나는 동안은 세지 않고, 몸이 보이면 3, 2, 1 카운트다운 (coach.js)
    if (startPhase !== 'go') {
        updateStartPhase(requiredJointsVisible(currentEx.type, J, vis));
        return;
    }

    if (currentEx.type === 'squat' || currentEx.type === 'lunge') {
        // 엉덩이와 무릎만 보이면 인식 가능 (발목은 있으면 더 정확)
        if (!vis(J.hip) || !vis(J.knee)) {
            motionState = 'UP';
            status.textContent = '엉덩이와 무릎이 화면에 보이게 해주세요';
            if (coachHint('joints', '엉덩이와 무릎이 화면에 보이게 해 주세요.')) setStageView('preview', true);
            return;
        }
        coachHint(null);
        setStageView('focus');
        // 허벅지의 세로 길이: 서 있으면 길고, 앉으면 짧아짐 (정면·측면 모두 동작)
        // 몸통 길이로 나눠서, 카메라에서 멀어지거나 가까워져도 값이 변하지 않게 함
        const thigh = Math.max(0, P[J.knee].y - P[J.hip].y);
        const torso = vis(J.shoulder) ? Math.hypot(P[J.shoulder].x - P[J.hip].x, P[J.shoulder].y - P[J.hip].y) : 0;
        let ratio;
        if (torso > 0) {
            const thighNorm = thigh / torso;
            thighRef = Math.max(thighNorm, thighRef * 0.998); // 서 있을 때 값을 기억 (천천히 갱신)
            ratio = smooth('thigh', thighRef > 0 ? thighNorm / thighRef : 1);
        } else {
            // 어깨가 안 보이면 허벅지 길이만으로 판단 (이때는 너무 앞뒤로 움직이지 않기)
            smoothed.rawRef = Math.max(thigh, (smoothed.rawRef || 0) * 0.998);
            ratio = smooth('thigh', smoothed.rawRef > 0 ? thigh / smoothed.rawRef : 1);
        }

        let isDown;
        let isUp;
        let bent; // 눈에 띄게 굽히긴 했는지 (덜 앉음 판정용)
        if (vis(J.ankle)) {
            const kneeAngle = smooth('knee', calculateAngle(P[J.hip], P[J.knee], P[J.ankle]));
            isDown = kneeAngle < 115 || ratio < 0.5;
            isUp = kneeAngle > 150 && ratio > 0.75;
            bent = kneeAngle < SHALLOW_KNEE || ratio < SHALLOW_RATIO;
        } else {
            isDown = ratio < 0.55;
            isUp = ratio > 0.8;
            bent = ratio < SHALLOW_RATIO;
        }

        if (isDown && motionState === 'UP') {
            motionState = 'DOWN';
            shallowDip = false;
            status.textContent = '⬇️ 내려가는 중';
        } else if (isUp && motionState === 'DOWN') {
            motionState = 'UP';
            incrementRep(targetReps);
        } else if (motionState === 'UP') {
            // 굽혔다가 '앉음'까지 못 가고 다시 일어서면 → 세지 않고 "더 깊이" 안내
            if (bent) shallowDip = true;
            else if (isUp && shallowDip) {
                shallowDip = false;
                coachNow('shallow', currentEx.type === 'squat' ? '조금 더 깊이 앉아 주세요.' : '조금 더 깊이 내려가 주세요.');
            }
            status.textContent = vis(J.ankle) ? '좋아요! 앉았다 일어나세요' : '좋아요! 발이 안 보여도 셀 수 있어요';
        }
    } else if (currentEx.type === 'pushup') {
        if (![J.shoulder, J.elbow, J.wrist].every(vis)) {
            motionState = 'UP';
            status.textContent = '어깨·팔꿈치·손목이 보이도록 폰을 몸 옆에 두세요';
            if (coachHint('joints', '어깨, 팔꿈치, 손목이 보이게 해 주세요.')) setStageView('preview', true);
            return;
        }
        const angle = smooth('elbow', calculateAngle(P[J.shoulder], P[J.elbow], P[J.wrist]));

        // 몸 일직선 확인: 엉덩이와 무릎(없으면 발목)이 보일 때만
        const lower = vis(J.knee) ? J.knee : (vis(J.ankle) ? J.ankle : null);
        const bodyBent = vis(J.hip) && lower !== null
            && smooth('line', calculateAngle(P[J.shoulder], P[J.hip], P[lower])) < BODY_LINE_MIN;
        const lineWarn = coachHint(bodyBent ? 'line' : null, '엉덩이를 펴서 몸을 일직선으로 만들어 주세요.');
        setStageView('focus', lineWarn);

        if (angle < 100 && motionState === 'UP') {
            motionState = 'DOWN';
            shallowDip = false;
            status.textContent = '⬇️ 팔을 굽히는 중';
        } else if (angle > 145 && motionState === 'DOWN') {
            motionState = 'UP';
            incrementRep(targetReps);
        } else if (motionState === 'UP') {
            if (angle < SHALLOW_ELBOW) shallowDip = true;
            else if (angle > 145 && shallowDip) {
                shallowDip = false;
                coachNow('shallow', '조금 더 깊이 내려가 주세요.');
            }
        }
    } else if (currentEx.type === 'plank') {
        const now = performance.now();
        let problem = '';
        let speech = '';

        // 발목이 안 보이면 무릎을 대신 사용 → 어깨~무릎까지만 보여도 인식
        const lower = vis(J.ankle) ? J.ankle : (vis(J.knee) ? J.knee : null);
        const jointsMissing = !vis(J.shoulder) || !vis(J.hip) || lower === null;
        if (jointsMissing) {
            problem = '어깨·엉덩이·무릎이 보이게 해주세요';
            speech = '어깨, 엉덩이, 무릎이 보이게 해 주세요.';
        } else {
            const bodyAngle = smooth('body', calculateAngle(P[J.shoulder], P[J.hip], P[lower]));

            // 서 있는 자세와 구분: 엎드리면 팔이 몸통과 거의 직각이 됨
            // (폰을 어느 방향으로 눕혀도 동작하도록 화면 방향과 무관한 방법 사용)
            let isLying;
            if (vis(J.elbow)) {
                isLying = calculateAngle(P[J.hip], P[J.shoulder], P[J.elbow]) >= 45;
            } else {
                isLying = Math.abs(P[J.shoulder].x - P[J.hip].x) > Math.abs(P[J.shoulder].y - P[J.hip].y);
            }

            if (!isLying) {
                problem = '엎드려서 팔꿈치나 손으로 몸을 받쳐주세요';
                speech = '엎드려서 팔꿈치나 손으로 몸을 받쳐 주세요.';
            } else if (bodyAngle < BODY_LINE_MIN) {
                problem = '⚠️ 엉덩이를 어깨·다리와 일직선으로 맞춰주세요';
                speech = '엉덩이를 어깨, 다리와 일직선으로 맞춰 주세요.';
            }
        }

        if (!problem) {
            coachHint(null);
            setStageView('focus');
        } else if (coachHint(problem, speech)) {
            setStageView(jointsMissing ? 'preview' : 'focus', true);
        }

        if (!problem) {
            plankLastGood = now;
            status.textContent = '🔥 자세 유지 중!';
            if (!plankTimer) startPlankTimer(targetReps);
        } else if (now - plankLastGood > PLANK_GRACE_MS) {
            // 잠깐 흔들린 건 봐주고, 1초 넘게 무너지면 '일시정지' (0초로 초기화하지 않음)
            stopPlankTimer(false);
            status.textContent = `${problem} (일시정지)`;
        }
    }
}

function pausePlankIfStale() {
    if (performance.now() - plankLastGood > PLANK_GRACE_MS) stopPlankTimer(false);
}

function startPlankTimer(targetReps) {
    const timerStep = selectedStepIndex;
    const timerSet = currentSet;
    plankTimer = setInterval(() => {
        if (selectedStepIndex !== timerStep || currentSet !== timerSet || isResting || !document.getElementById('workout-modal').style.display.includes('flex')) {
            stopPlankTimer(false);
            return;
        }
        countReps = Math.min(targetReps, countReps + 1);
        setRepsDisplay(countReps, true);
        const left = targetReps - countReps;
        if (left > 0 && left <= 3) { speakText(String(left)); beep('tick'); }
        else if (left === 10 && targetReps > 15) speakText('10초 남았어요');
        else if (countReps % 5 === 0) { speakText(`${countReps}초`); vibrate(60); }
        if (countReps >= targetReps) {
            stopPlankTimer(false);
            handleSetCompletion();
        }
    }, 1000);
}

function incrementRep(targetReps) {
    if (selectedStepIndex === null || isResting || isCompletingSet) return;
    countReps = Math.min(targetReps, countReps + 1);
    setRepsDisplay(countReps, true);
    document.getElementById('ai-status').textContent = `인식 완료 (${countReps}/${targetReps})`;
    flashRep();
    beep('rep');
    const left = targetReps - countReps;
    let say = `${countReps}`;
    if (left === 1) say += ', 마지막 하나!';
    else if (left === 5 && targetReps >= 10) say += ', 다섯 개 남았어요';
    speakText(say);
    vibrate(60);

    if (countReps >= targetReps) handleSetCompletion();
}
