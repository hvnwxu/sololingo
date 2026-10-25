// 자세 판정: 각도 계산, 흔들림 보정, 운동별 횟수 세기

let smoothed = {};           // 각도 흔들림을 줄이기 위한 평균값
let plankLastGood = 0;
let shallowDip = false;      // 내려가다 말고 다시 올라왔는지 ("조금 더 깊이" 안내용)
let downSince = 0;           // '앉음' 상태가 시작된 시각 (DOWN_HOLD_MS 동안 계속돼야 인정)
let lastRepAt = 0;           // 마지막으로 횟수를 센 시각 (REP_MIN_MS 안에 또 세지 않음)

function resetRecognitionState() {
    smoothed = {};
    plankLastGood = 0;
    shallowDip = false;
    downSince = 0;
    lastRepAt = 0;
    formRep = null;
    motionState = 'UP';
}

// ===== 자세 판정 (스쿼트·런지) =====
// 1회 동작 동안 값을 기록했다가 → 1회가 끝나면(횟수를 셀 때) 규칙으로 판정
let formRep = null;     // 지금 하고 있는 1회의 기록 (서 있을 때부터 다시 일어설 때까지)
let formSets = [];      // 세트별 판정 결과 (마지막 칸이 지금 세트, 자세 판정이 없는 운동이면 빈 목록)
let formSpokenAt = {};  // 지적별로 마지막으로 말한 회차 (같은 말을 매번 하지 않게)
let formLineIndex = {}; // 지적별로 다음에 말할 문장 번호 (문장을 돌아가며 말함)
let formLastSpoken = null; // 바로 전 회에 말로 지적한 것 (다음 회에 고치면 칭찬)

// issues: 지적별 횟수, checked: 그 규칙으로 판정할 수 있었던 횟수 (예: 정면이면 상체 기울기는 판정 못 함)
function newFormStats(type) {
    const zeros = () => Object.fromEntries(Object.keys(FORM_ISSUES[type]).map(key => [key, 0]));
    return { type, reps: 0, good: 0, checked: zeros(), issues: zeros() };
}

// 운동 창을 열 때 전체 초기화, 새 세트를 시작할 때는 세트 칸만 하나 추가
function resetFormStats(all) {
    if (all) {
        formSets = [];
        formSpokenAt = {};
        formLineIndex = {};
    }
    formLastSpoken = null;
    formRep = null;
    const type = exercises[selectedStepIndex]?.type;
    if (FORM_RULES[type]) formSets.push(newFormStats(type));
}

// 매 프레임: 1회 동안 가장 깊이 굽힌 값, 가장 많이 숙인 값, 무릎이 가장 많이 모인 값을 기억
function recordFormFrame(P, J, vis, ratio, kneeAngle, kneeIn) {
    if (!formRep) {
        formRep = { minRatio: Infinity, minKnee: Infinity, kneeFrames: 0, maxLean: -Infinity, leanFrames: 0, maxKneeIn: -Infinity, kneeInFrames: 0 };
    }
    formRep.minRatio = Math.min(formRep.minRatio, ratio);
    if (kneeAngle !== null) {
        formRep.minKnee = Math.min(formRep.minKnee, kneeAngle);
        formRep.kneeFrames++;
    }
    const lean = torsoLean(P, J, vis);
    if (lean !== null) {
        formRep.maxLean = Math.max(formRep.maxLean, lean);
        formRep.leanFrames++;
    }
    if (kneeIn !== null) {
        formRep.maxKneeIn = Math.max(formRep.maxKneeIn, kneeIn);
        formRep.kneeInFrames++;
    }
}

// 정면인지: 양쪽 어깨 사이가 몸통 길이에 비해 넓으면 정면, 좁으면 옆모습
// 반대쪽 어깨는 몸에 가려져도 MediaPipe가 위치를 추정해 주므로 visibility는 보지 않음
function isFrontView(P, J) {
    const torso = Math.hypot(P[J.shoulder].x - P[J.hip].x, P[J.shoulder].y - P[J.hip].y);
    return torso > 0 && Math.abs(P[11].x - P[12].x) / torso >= SIDE_VIEW_MAX;
}

// 상체(엉덩이→어깨)가 수직에서 기운 각도. 옆모습이 아니면 null
// 정면에서는 앞으로 숙여도 화면에서는 상체가 짧아 보일 뿐 기울어 보이지 않아서 판정할 수 없음
function torsoLean(P, J, vis) {
    if (!vis(J.shoulder) || !vis(J.hip) || isFrontView(P, J)) return null;
    const dx = P[J.shoulder].x - P[J.hip].x;
    const dy = P[J.shoulder].y - P[J.hip].y;
    return smooth('lean', Math.atan2(Math.abs(dx), -dy) * 180 / Math.PI); // 0° = 똑바로 섬
}

// 앞 무릎이 안쪽(몸 가운데 쪽)으로 모인 정도. 정면이 아니면 null
// 엉덩이와 발목을 이은 선에서 무릎이 안쪽으로 벗어난 거리 ÷ 엉덩이 너비 (0 = 일직선, 클수록 안으로 모임)
// 엉덩이 너비로 나눠서 카메라와의 거리가 바뀌어도 값이 같음
function kneeInward(P, S, J, vis) {
    if (![S.hip, S.knee, S.ankle, 23, 24].every(vis) || !isFrontView(P, J)) return null;
    const hip = P[S.hip], knee = P[S.knee], ankle = P[S.ankle];
    const hipWidth = Math.abs(P[23].x - P[24].x);
    if (hipWidth <= 0 || ankle.y - hip.y <= 0) return null;
    const lineX = hip.x + (ankle.x - hip.x) * (knee.y - hip.y) / (ankle.y - hip.y); // 무릎 높이에서 엉덩이-발목 선의 x
    const inward = Math.sign((P[23].x + P[24].x) / 2 - hip.x); // 몸 가운데 쪽 방향 (+1 / -1)
    return smooth('kneeIn', (knee.x - lineX) * inward / hipWidth);
}

// 1회가 끝났을 때 규칙으로 판정 → 지적할 것 목록 (빈 목록 = 좋은 자세)
function judgeFormRep() {
    const rep = formRep;
    formRep = null;
    const stats = formSets[formSets.length - 1];
    if (!rep || !stats) return [];
    const rules = FORM_RULES[stats.type];

    // 규칙마다: true = 지적, false = 괜찮음, null = 판정 못 함 (관절이 충분히 안 보였거나 방향이 안 맞음)
    const results = {
        lean: rep.leanFrames >= FORM_MIN_FRAMES ? rep.maxLean > rules.leanMax : null,
        kneeIn: rep.kneeInFrames >= FORM_MIN_FRAMES ? rep.maxKneeIn > rules.kneeInMax : null,
        // 무릎 각도(발목이 보일 때)나 허벅지 비율 중 하나라도 충분히 깊으면 OK
        shallow: !(rep.kneeFrames >= FORM_MIN_FRAMES && rep.minKnee < rules.depthKnee) && !(rep.minRatio < rules.depthRatio)
    };
    const issues = Object.keys(FORM_ISSUES[stats.type]).filter(key => {
        if (results[key] === null) return false;
        stats.checked[key]++;
        return results[key];
    });

    stats.reps++;
    if (!issues.length) stats.good++;
    issues.forEach(key => { stats.issues[key]++; });
    return issues;
}

// 화면에는 매번 보여 주고, 말할 문장이 있으면 돌려줌
// - 같은 지적은 FORM_SPEAK_EVERY회에 한 번만, 문장은 돌아가며 바꿔 말함
// - 바로 전 회에 지적한 걸 이번에 고쳤으면 칭찬
function formFeedback(issues) {
    const stats = formSets[formSets.length - 1];
    if (!stats) return '';
    const texts = FORM_ISSUES[stats.type];
    showFormBadge(issues.map(key => texts[key].short));
    if (!voiceAllows(SPEAK.COACH)) return '';
    const fixed = formLastSpoken && !issues.includes(formLastSpoken);
    formLastSpoken = null;
    if (fixed && !issues.length) return pickFormLine('praise', FORM_PRAISE);

    const repNo = sumFormStats(formSets).reps;
    const key = issues.find(k => repNo - (formSpokenAt[k] ?? -Infinity) >= FORM_SPEAK_EVERY);
    if (!key) return '';
    formSpokenAt[key] = repNo;
    formLastSpoken = key;
    return pickFormLine(key, texts[key].speeches);
}

function pickFormLine(key, lines) {
    const index = formLineIndex[key] || 0;
    formLineIndex[key] = (index + 1) % lines.length;
    return lines[index];
}

function sumFormStats(list) {
    if (!list.length) return null;
    return list.reduce((total, stats) => {
        total.reps += stats.reps;
        total.good += stats.good;
        Object.keys(total.issues).forEach(key => {
            total.issues[key] += stats.issues[key];
            total.checked[key] += stats.checked[key];
        });
        return total;
    }, newFormStats(list[0].type));
}

// 예: "10회 중 좋은 자세 7회 · 깊이 부족 2회 · 상체 숙임 1회"
function formSummaryText(stats) {
    if (!stats || !stats.reps) return '';
    const parts = [`${stats.reps}회 중 좋은 자세 ${stats.good}회`];
    Object.entries(FORM_ISSUES[stats.type]).forEach(([key, issue]) => {
        if (stats.issues[key]) parts.push(`${issue.label} ${stats.issues[key]}회`);
    });
    return parts.join(' · ');
}

// 운동을 마칠 때 기록용으로 정리 (판정한 횟수가 없으면 null)
function takeFormReport(type) {
    const sets = formSets.filter(stats => stats.type === type && stats.reps > 0);
    if (!sets.length) return null;
    return { type, sets, total: sumFormStats(sets) };
}

// 몸 크기 (카메라와의 거리에 비례): 몸통 길이와 '어깨 너비 ÷ SHOULDER_SCALE' 중 큰 값
// - 몸통 길이만 쓰면 정면에서 상체를 숙일 때 몸통이 짧아 보여서 덜 앉은 것처럼 계산됨
// - 어깨 너비는 숙여도 그대로라서 정면에서는 이 값이 쓰이고, 옆모습에서는 어깨 너비가 0에 가까워 몸통 길이가 쓰임
// - 매 프레임 새로 재므로 카메라에 다가가거나 물러나도 비율이 그대로
function bodyScale(P, S) {
    const torso = Math.hypot(P[S.shoulder].x - P[S.hip].x, P[S.shoulder].y - P[S.hip].y);
    const shoulderWidth = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y);
    return Math.max(torso, shoulderWidth / SHOULDER_SCALE);
}

// 한쪽 다리가 얼마나 굽었는지: { ratio: 허벅지 세로 길이 비율(서 있을 때 1, 앉을수록 작아짐), kneeAngle(발목이 안 보이면 null) }
// 허벅지의 세로 길이는 서 있으면 길고 앉으면 짧아짐 (정면·측면 모두 동작)
// - 3D 좌표(world)가 있으면: 허벅지 세로 길이 ÷ 허벅지 실제 길이 (= 허벅지가 얼마나 서 있는지)
//   화면 좌표로 재면 정면에서 앉을 때 무릎이 카메라 쪽으로 나오면서 원근 때문에 허벅지가 길어 보여서,
//   폰에 가까울수록(1.5m 이내) 70°까지 앉아도 안 셌음. 3D 좌표는 미터 단위라 거리·원근·상체 숙임과 무관
// - 3D 좌표가 없으면: 화면에서 잰 허벅지 세로 길이 ÷ 몸 크기
// 어깨가 안 보이면 null (너무 가까운지 판단할 수 없고, 예전에 카메라에 다가갔다 물러나면 앉은 걸로 잘못 셌음)
// tag: 다리마다 기준값·평균값을 따로 기억하기 위한 이름 ('L' / 'R')
// front: 정면이면 무릎 각도도 3D로 잼 (정면에서는 화면상 무릎 각도가 앉아도 거의 안 줄어듦)
function legBend(P, S, vis, tag, world, front) {
    if (!vis(S.hip) || !vis(S.knee) || !vis(S.shoulder)) return null;
    const use3d = isWorldPoint(world?.[S.hip]) && isWorldPoint(world?.[S.knee]);
    let raw;
    if (use3d) {
        const hip = world[S.hip], knee = world[S.knee];
        const length = Math.hypot(knee.x - hip.x, knee.y - hip.y, knee.z - hip.z);
        if (length <= 0) return null;
        raw = Math.abs(knee.y - hip.y) / length;
    } else {
        const scale = bodyScale(P, S);
        if (scale <= 0) return null;
        raw = Math.max(0, P[S.knee].y - P[S.hip].y) / scale;
    }
    // 평균을 먼저 내고 기준(서 있을 때 값)과 비교 → 한 프레임 튀는 값이 기준값에 남지 않음
    // 3D/화면 방식은 값의 단위가 달라서 따로 기억
    const key = (use3d ? '3d' : '') + tag;
    const thighNorm = smooth('thigh' + key, raw);
    const ref = Math.max(thighNorm, (smoothed['ref' + key] || 0) * 0.998); // 서 있을 때 값을 기억 (천천히 갱신)
    smoothed['ref' + key] = ref;
    const ratio = ref > 0 ? thighNorm / ref : 1;

    let kneeAngle = null;
    if (vis(S.ankle)) {
        const ankle3d = front && use3d && isWorldPoint(world[S.ankle]);
        const angle = ankle3d
            ? calculateAngle3D(world[S.hip], world[S.knee], world[S.ankle])
            : calculateAngle(P[S.hip], P[S.knee], P[S.ankle]);
        kneeAngle = smooth('knee' + (ankle3d ? '3d' : '') + tag, angle);
    }
    return { ratio, kneeAngle };
}

function isWorldPoint(p) {
    return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

function calculateAngle3D(p1, p2, p3) {
    const a = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
    const b = { x: p3.x - p2.x, y: p3.y - p2.y, z: p3.z - p2.z };
    const lengths = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
    if (lengths <= 0) return 180;
    const cos = (a.x * b.x + a.y * b.y + a.z * b.z) / lengths;
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
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
    // 화면 밖(가장자리 포함) 관절은 MediaPipe가 위치를 추측한 값이라 visibility가 높아도 믿지 않음
    // (폰에 다가가면 무릎·발목이 화면 아래로 나가는데, 추측한 위치로 계산하면 숙이기만 해도 스쿼트로 셌음)
    const m = FRAME_MARGIN;
    if (point.x < m || point.x > 1 - m || point.y < m || point.y > 1 - m) return false;
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
        const isLunge = currentEx.type === 'lunge';

        // 폰에 너무 가까우면(약 1m 안) 세지 않음
        // 가까이서는 원근 때문에 몸 비율이 크게 틀어짐: 폰을 보려고 숙이면 어깨가 카메라에 가까워져 2배로 커 보이고,
        // 그만큼 허벅지가 짧아 보여서 앉은 걸로 셌음 (화면 짧은 쪽 길이로 나눠서 폰 방향과 상관없이 같은 기준)
        if (vis(J.shoulder) && vis(J.hip) && bodyScale(P, J) / Math.min(W, H) > TOO_CLOSE_SCALE) {
            motionState = 'UP';
            downSince = 0;
            formRep = null;
            status.textContent = '너무 가까워요. 뒤로 물러나 주세요';
            if (coachHint('close', '너무 가까워요. 뒤로 물러나 주세요.')) setStageView('preview', true);
            return;
        }

        const world = results.poseWorldLandmarks; // MediaPipe가 추정한 3D 좌표 (미터, 엉덩이 가운데가 원점)
        const front = isFrontView(P, J);

        // 두 다리를 다 봄
        // - 스쿼트: 덜 굽힌 다리 기준 → 두 다리를 같이 굽혀야 셈 (걷거나 발을 고쳐 디딜 때 한쪽만 굽는 건 안 셈)
        // - 런지: 더 굽힌 다리(앞다리) 기준 (뒷다리는 무릎을 바닥까지 내려도 허벅지가 세로로 길게 남아서)
        const legs = [[LEFT, 'L'], [RIGHT, 'R']]
            .map(([S, tag]) => { const bend = legBend(P, S, vis, tag, world, front); return bend && { S, ...bend }; })
            .filter(Boolean);

        // 어깨·엉덩이·무릎이 보여야 인식 (발목은 있으면 더 정확)
        if (!legs.length) {
            motionState = 'UP';
            downSince = 0;
            formRep = null; // 중간에 안 보였던 1회는 판정하지 않음
            status.textContent = '어깨부터 무릎까지 화면에 보이게 해주세요';
            if (coachHint('joints', '어깨부터 무릎까지 화면에 보이게 해 주세요.')) setStageView('preview', true);
            return;
        }
        coachHint(null);
        setStageView('focus');

        const pick = isLunge ? Math.min : Math.max;
        const ratio = pick(...legs.map(leg => leg.ratio));
        const knees = legs.map(leg => leg.kneeAngle).filter(angle => angle !== null);
        // 스쿼트는 보이는 다리 모두 무릎 각도를 잴 수 있을 때만 사용
        // (한쪽 발목이 가려지면 굽힌 다리 각도만 남아서 '두 다리를 다 굽혀야 셈'이 깨짐 → 이때는 허벅지 비율로 판정)
        const kneeAngle = knees.length && (isLunge || knees.length === legs.length) ? pick(...knees) : null;

        let isDown;
        let isUp;
        let bent; // 눈에 띄게 굽히긴 했는지 (덜 앉음 판정용)
        if (kneeAngle !== null) {
            isDown = kneeAngle < (isLunge ? LUNGE_DOWN_KNEE : SQUAT_DOWN_KNEE) || ratio < (isLunge ? LUNGE_DOWN_RATIO : SQUAT_DOWN_RATIO);
            isUp = kneeAngle > 150 && ratio > 0.75;
            bent = kneeAngle < (isLunge ? LUNGE_SHALLOW_KNEE : SHALLOW_KNEE) || ratio < (isLunge ? LUNGE_SHALLOW_RATIO : SHALLOW_RATIO);
        } else {
            isDown = ratio < (isLunge ? LUNGE_DOWN_RATIO : SQUAT_DOWN_RATIO) + 0.05;
            isUp = ratio > 0.8;
            bent = ratio < (isLunge ? LUNGE_SHALLOW_RATIO : SHALLOW_RATIO);
        }
        // 스쿼트: 엉덩이가 실제로 내려가야 '앉음' (서 있을 때 엉덩이 높이에서 몸 크기의 SQUAT_HIP_DROP배 이상)
        // 상체를 숙이고 팔을 휘두르면 팔이 무릎을 가려 다리가 굽은 것처럼 잘못 잡혀도 셌는데,
        // 이때 엉덩이 높이는 거의 그대로라 이 조건으로 걸러짐
        if (!isLunge) {
            const hipY = smooth('hipY', legs.reduce((sum, leg) => sum + P[leg.S.hip].y, 0) / legs.length);
            // 완전히 서 있을 때만 엉덩이 높이를 기억 (isUp으로 하면 내려가기 시작한 뒤에도 기준이 따라 내려가서 덜 내려간 걸로 계산됨)
            if (ratio > STAND_RATIO || smoothed.hipStand === undefined) smooth('hipStand', hipY, 0.3);
            const hipDrop = (hipY - smoothed.hipStand) / bodyScale(P, legs[0].S);
            isDown = isDown && hipDrop > SQUAT_HIP_DROP;
        }
        // '앉음'은 DOWN_HOLD_MS 넘게 계속돼야 인정 (한두 프레임 튀는 값 무시)
        const now = performance.now();
        if (!isDown) downSince = 0;
        else if (!downSince) downSince = now;
        const downHeld = isDown && now - downSince >= DOWN_HOLD_MS;

        // 다 일어선 동안은 기록을 새로 시작 → 기록 = 마지막으로 서 있던 때부터 1회가 끝날 때까지
        if (motionState === 'UP' && isUp) formRep = null;
        // 런지: 앞다리(더 굽힌 다리)를 굽힌 동안 무릎이 안쪽으로 모이는지
        const frontLeg = isLunge ? legs.reduce((a, b) => (a.ratio <= b.ratio ? a : b)) : null;
        const kneeIn = frontLeg && bent ? kneeInward(P, frontLeg.S, J, vis) : null;
        recordFormFrame(P, J, vis, ratio, kneeAngle, kneeIn);

        if (downHeld && motionState === 'UP') {
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
            status.textContent = kneeAngle !== null ? '좋아요! 앉았다 일어나세요' : '좋아요! 발이 안 보여도 셀 수 있어요';
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
    // 직전 횟수에서 REP_MIN_MS 안이면 같은 1회가 흔들려서 두 번 잡힌 것으로 보고 무시
    const now = performance.now();
    if (now - lastRepAt < REP_MIN_MS) return;
    lastRepAt = now;
    countReps = Math.min(targetReps, countReps + 1);
    setRepsDisplay(countReps, true);
    document.getElementById('ai-status').textContent = `인식 완료 (${countReps}/${targetReps})`;
    flashRep();
    beep('rep');
    const left = targetReps - countReps;
    let say = `${countReps}`;
    if (left === 1) say += ', 마지막 하나!';
    else if (left === 5 && targetReps >= 10) say += ', 다섯 개 남았어요';
    // 자세 지적은 횟수 뒤에 이어서 말함 (따로 말하면 횟수 음성에 묻혀서 건너뛰어짐)
    if (FORM_RULES[exercises[selectedStepIndex].type]) {
        const tip = formFeedback(judgeFormRep());
        if (tip) say += `, ${tip}`;
    }
    speakText(say);
    vibrate(60);

    if (countReps >= targetReps) handleSetCompletion();
}
