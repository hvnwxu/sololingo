// 설정값: 운동 목록, 난이도별 세트·횟수, 배지, 식단, 인식 기준값

const COMPLEXITY_KEY = 'sololingo_model_complexity';

const POSE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404';

// 인식 안정화용 값
const VISIBILITY = 0.5;      // 관절이 '보인다'고 판단하는 기준 (0~1)
const FRAME_MARGIN = 0.03;   // 화면 가장자리에서 이 비율 안쪽에 있어야 '보인다'고 판단 (화면 밖 관절은 추측값)
const PLANK_GRACE_MS = 1000; // 플랭크 자세가 이 시간 이상 무너져야 타이머를 멈춤

// 2m 밖에서도 알 수 있게 하는 안내 (음성·효과음·화면 색)
const SPEAK = { COACH: 1, COUNT: 2, IMPORTANT: 3 }; // 음성 우선순위 (utils.js의 speakText)
const VOICE_KEY = 'sololingo_voice_mode';
const VOICE_MODES = [
    { id: 'all', icon: '🔊', label: '음성: 횟수 + 자세 안내' },
    { id: 'count', icon: '🔢', label: '음성: 횟수만' },
    { id: 'off', icon: '🔇', label: '소리 끔' }
];
const READY_HOLD_MS = 1000;   // 몸이 이 시간 동안 계속 보이면 카운트다운 시작
const COUNTDOWN_LAST_MS = 600; // 카운트다운 '1' 다음 '시작!'까지 (3→2→1은 1초 간격)
const COACH_HOLD_MS = 1500;   // 문제가 이 시간 넘게 계속될 때만 말로 안내 (잠깐 흔들린 건 무시)
const COACH_REPEAT_MS = 5000; // 같은 안내는 이 간격보다 자주 말하지 않음
const SQUAT_DOWN_KNEE = 130;  // 스쿼트: 무릎 각도가 이보다 작으면 '앉음' (115° → 130°: 바닥까지 앉아야 세져서 완화)
const SQUAT_DOWN_RATIO = 0.6; // 스쿼트: 허벅지 비율이 이보다 작으면 '앉음' (0.5 → 0.65 → 0.6: 3D 좌표로 바꾼 뒤 가끔 쉽게 세져서, 허벅지 기울기 49° → 53°. 발목이 안 보이면 +0.05)
const SQUAT_HIP_DROP = 0.2;   // 스쿼트: 엉덩이가 서 있을 때보다 몸 크기의 이 배수 이상 내려가야 '앉음' (약 11cm, 반쯤 앉으면 약 0.3)
const STAND_RATIO = 0.9;      // 허벅지 비율이 이보다 크면 '완전히 서 있음' → 이때의 엉덩이 높이를 기준으로 기억
const SHALLOW_RATIO = 0.75;   // 스쿼트: 허벅지 비율이 이만큼 줄었는데 '앉음'까지 못 가면 "더 깊이"
const SHALLOW_KNEE = 145;     // 스쿼트: 무릎 각도 기준 (발목이 보일 때)
const LUNGE_DOWN_RATIO = 0.68;    // 런지: 앞다리 허벅지 비율이 이보다 작으면 '내려감' (0.6 → 0.68: 허벅지 기울기 53° → 47°)
const LUNGE_DOWN_KNEE = 132;      // 런지: 앞다리 무릎 각도가 이보다 작으면 '내려감' (125° → 132°)
const LUNGE_SHALLOW_RATIO = 0.77; // 런지: "더 깊이" 안내 기준 (내려감 기준보다 위에 있어야 해서 같이 올림)
const LUNGE_SHALLOW_KNEE = 145;
const PUSHUP_DOWN_ELBOW = 108; // 푸쉬업: 팔꿈치 각도가 이보다 작으면 '내려감' (100° → 108°: 너무 어려워서 완화)
const PUSHUP_UP_ELBOW = 138;   // 푸쉬업: 팔꿈치 각도가 이보다 크면 '올라옴' → 1회 (145° → 138°)
const SHALLOW_ELBOW = 125;    // 푸쉬업: 팔꿈치가 이만큼 굽었는데 '내려감'까지 못 가면 "더 깊이"
const BODY_LINE_MIN = 145;    // 플랭크: 처짐/들림 방향을 모를 때(손목·팔꿈치 안 보임) 어깨-엉덩이-다리 각도가 이보다 작으면 몸이 꺾인 것
// 푸쉬업·플랭크 실시간 경고(플랭크는 타이머 멈춤): 몸이 이 각도보다 더 꺾이면
// 처짐은 들림보다 훨씬 작게 꺾여 보여서(엉덩이가 바닥 쪽으로 내려갈 수 있는 폭이 작고, MediaPipe 엉덩이 관절은 골반 가운데라
// 허리가 휘어도 덜 움직임) 기준을 따로 둠. 같은 35°로 했더니 처짐은 전혀 못 잡았음
const LINE_SAG_ALERT = 22;
const LINE_PIKE_ALERT = 35;   // 푸쉬업 들림 실시간 경고
const PLANK_PIKE_STOP = 50;   // 플랭크 들림: 이보다 꺾이면 타이머 멈춤 (35° → 50°: 너무 예민해서 완화)
const PLANK_MIN_HIP_HEIGHT = 0.12; // 플랭크: 엉덩이가 바닥(손목·팔꿈치와 발목을 이은 선)에서 몸통 길이의 이 배수보다 낮으면 타이머 멈춤 (엎드려 있기 약 0.1 이하, 팔꿈치 플랭크 약 0.2~0.4)
const PUSHUP_MIN_HIP_HEIGHT = 0.3; // 푸쉬업: 팔을 다 폈을 때 엉덩이가 바닥(손목)에서 팔 길이의 이 배수보다 낮으면 안 셈 (엉덩이를 바닥에 대고 상체만 드는 동작)

// 횟수 오작동 방지
const SHOULDER_SCALE = 0.6;   // 몸 크기 = max(몸통 길이, 어깨 너비 ÷ 이 값) → 정면에서 숙이거나 카메라와 거리가 바뀌어도 비율 유지
const DOWN_HOLD_MS = 150;     // '앉음'이 이 시간 넘게 계속돼야 인정 (한두 프레임 튀는 값 무시)
const REP_MIN_MS = 700;       // 직전 횟수에서 이 시간 안에는 또 세지 않음 (한 번 했는데 두 번 세는 것 방지)
const TOO_CLOSE_SCALE = 0.6;  // 몸 크기 ÷ 화면 짧은 쪽 길이가 이보다 크면 너무 가까움 → 세지 않음 (약 1m, 2m에서는 약 0.27)

// 자세 판정: 1회가 끝날 때마다 규칙으로 판정 (자세가 나빠도 횟수는 셈)
// ⚠️ 처음 정한 값. 직접 운동하면서 조정하고, 바꾼 이유는 PLAN.md 조정 기록표에 남기기
// 깊이: 1회 중 가장 작은 무릎 각도나 허벅지 비율 중 하나라도 기준보다 작으면 OK (횟수 세는 기준과 같은 방식)
//   정면에서는 엉덩이가 무릎 바로 위로 내려와서 화면상 무릎 각도가 거의 안 줄어듦 → 허벅지 비율로 판정됨
// leanMax: 상체(엉덩이→어깨)가 수직에서 이 각도보다 더 기울면 "상체 숙임" (옆모습일 때만)
//   런지는 상체를 세운 채로 내려가는 운동이라 스쿼트보다 엄격하게
// kneeInMax: 앞 무릎이 엉덩이-발목 선에서 안쪽으로 벗어난 거리 ÷ 엉덩이 너비가 이보다 크면 "무릎 모임" (정면일 때만)
// pushup: depthElbow = 1회 중 가장 작은 팔꿈치 각도가 이보다 크면 "깊이 부족",
//   sagMax / pikeMax = 어깨-엉덩이-무릎이 180°에서 이 각도보다 더 꺾이면 "허리 처짐"(바닥 쪽) / "엉덩이 들림"(반대쪽)
//   처짐은 들림보다 작게 꺾여 보여서 기준을 낮게 (20°로 같게 했을 때 처짐을 못 잡았음)
const FORM_RULES = {
    squat: { depthKnee: 110, depthRatio: 0.5, leanMax: 50 },  // 횟수는 130° / 0.65부터 셈
    lunge: { depthKnee: 105, depthRatio: 0.45, leanMax: 30, kneeInMax: 0.5 }, // 횟수는 132° / 0.68부터 셈
    pushup: { depthElbow: 98, sagMax: 12, pikeMax: 20 }, // 횟수는 108°부터 셈 (깊이 90° → 98° 완화), 실시간 경고는 LINE_SAG_ALERT / LINE_PIKE_ALERT
    plank: { sagMax: 12, pikeMax: 35 } // 1초마다 판정. 이보다 꺾이면 음성 안내(타이머는 계속), LINE_SAG_ALERT / PLANK_PIKE_STOP 넘으면 타이머 멈춤 (들림 20° → 35° 완화)
};
const SIDE_VIEW_MAX = 0.35;    // 어깨 너비 ÷ 몸통 길이가 이보다 작으면 옆모습, 크거나 같으면 정면
const FORM_MIN_FRAMES = 3;     // 1회 동안 관절이 이 프레임 수 이상 보였을 때만 판정 (확실하지 않으면 지적 안 함)
const FORM_SPEAK_EVERY = 3;    // 같은 지적은 이 횟수에 한 번만 말함 (화면에는 매번 표시)
const FORM_BADGE_MS = 1800;    // 1회 판정 결과를 화면에 보여 주는 시간
// 운동별 지적. 순서 = 말하는 우선순위 (한 번에 하나만 말함: 다치기 쉬운 것부터)
// speeches: 같은 말만 반복하면 지루해서 돌아가며 말함 (첫 번째 문장은 리포트 팁에도 사용)
// unchecked: 1번도 판정하지 못했을 때 리포트에 보여 줄 안내
const FORM_ISSUES = {
    squat: {
        lean: {
            label: '상체 숙임', short: '허리를 세워요',
            speeches: ['허리를 세워주세요', '가슴을 펴고 앞을 보세요', '상체가 너무 숙여졌어요', '엉덩이를 뒤로 빼면서 가슴은 들어주세요'],
            unchecked: '정면에서 찍으면 상체 기울기는 확인하지 못해요. 옆모습으로 서면 함께 확인해요.'
        },
        shallow: {
            label: '깊이 부족', short: '더 깊이 앉아요',
            speeches: ['조금 더 깊이 앉아보세요', '무릎을 더 굽혀주세요', '허벅지가 바닥과 평행해질 때까지 내려가요', '의자에 앉는다고 생각해 보세요']
        }
    },
    lunge: {
        kneeIn: {
            label: '무릎 모임', short: '무릎을 바깥으로',
            speeches: ['무릎이 안쪽으로 모이지 않게 해주세요', '무릎을 발끝 방향으로 밀어주세요', '앞 무릎이 안으로 꺾였어요', '무릎과 발끝을 같은 방향으로 맞춰요'],
            unchecked: '옆모습에서는 무릎이 안쪽으로 모이는지 확인하지 못해요. 정면에서 하면 함께 확인해요.'
        },
        lean: {
            label: '상체 숙임', short: '상체를 세워요',
            speeches: ['상체를 똑바로 세워주세요', '가슴을 펴고 정면을 보세요', '몸이 앞으로 쏠렸어요', '머리부터 엉덩이까지 일자로 세워요'],
            unchecked: '정면에서 찍으면 상체 기울기는 확인하지 못해요. 옆모습으로 서면 함께 확인해요.'
        },
        shallow: {
            label: '깊이 부족', short: '더 깊이 내려가요',
            speeches: ['조금 더 깊이 내려가 보세요', '앞 무릎을 90도까지 굽혀주세요', '뒷무릎이 바닥에 닿을 듯이 내려가요', '천천히 끝까지 내려가 보세요']
        }
    },
    pushup: {
        sag: {
            label: '허리 처짐', short: '엉덩이를 올려요',
            speeches: ['엉덩이가 처졌어요, 배에 힘을 주세요', '몸을 일직선으로 만들어 주세요', '허리가 내려갔어요, 엉덩이를 살짝 올려요', '복근에 힘을 주고 버텨요'],
            unchecked: '엉덩이와 무릎(또는 발목)까지 화면에 보이면 몸이 일직선인지도 확인해요.'
        },
        pike: {
            label: '엉덩이 들림', short: '엉덩이를 내려요',
            speeches: ['엉덩이가 너무 올라갔어요', '엉덩이를 내려서 일직선으로 맞춰요', '머리부터 발끝까지 일자로 만들어요', '엉덩이를 어깨 높이로 내려요'],
            unchecked: '엉덩이와 무릎(또는 발목)까지 화면에 보이면 몸이 일직선인지도 확인해요.'
        },
        shallow: {
            label: '깊이 부족', short: '더 내려가요',
            speeches: ['조금 더 깊이 내려가 보세요', '가슴이 바닥에 닿을 듯이 내려가요', '팔꿈치를 90도까지 굽혀주세요', '천천히 끝까지 내려가 보세요']
        }
    },
    plank: {
        sag: {
            label: '허리 처짐', short: '엉덩이를 올려요',
            speeches: ['엉덩이가 살짝 처졌어요', '배에 힘을 주고 버텨요', '엉덩이를 살짝 올려 일직선으로 맞춰요', '허리가 내려가지 않게 복근에 힘을 줘요'],
            unchecked: '팔꿈치나 손목까지 화면에 보이면 엉덩이가 처졌는지 들렸는지도 구분해요.'
        },
        pike: {
            label: '엉덩이 들림', short: '엉덩이를 내려요',
            speeches: ['엉덩이를 조금 내리세요', '엉덩이가 살짝 올라갔어요', '어깨부터 발끝까지 일직선으로 맞춰요', '엉덩이를 어깨 높이로 내려요'],
            unchecked: '팔꿈치나 손목까지 화면에 보이면 엉덩이가 처졌는지 들렸는지도 구분해요.'
        }
    }
};
// 지적받은 다음 회에 좋은 자세로 고치면 칭찬 (고친 걸 알려 줘야 계속 신경 씀)
const FORM_PRAISE = ['좋아요, 바로 그거예요', '훨씬 좋아졌어요', '완벽해요, 그 느낌 그대로', '자세가 좋아졌어요'];

// 시작 전 '뒤로 물러나기' 안내 (폰 위치 종류별: placementByType)
const WAIT_GUIDE = {
    front: { icon: '🚶', text: '뒤로 물러나 몸 전체가 보이게 서 주세요', speech: '뒤로 물러나서, 몸 전체가 화면에 보이게 서 주세요.', remind: '아직 몸이 다 안 보여요. 조금 더 뒤로 가 주세요.' },
    side: { icon: '🙆', text: '폰 옆에서 운동 자세를 잡아 주세요', speech: '폰 옆에서 운동 자세를 잡아 주세요. 몸이 보이면 시작할게요.', remind: '아직 몸이 다 안 보여요. 폰 위치를 맞춰 주세요.' }
};

const exercises = [
    { name: "스쿼트", type: "squat", instructions: ["폰을 세로로 세워 약 2m 앞에 둡니다.", "발까지 안 보여도 괜찮아요. 어깨부터 무릎까지 보이면 셉니다.", "무릎을 굽혀 앉았다가 다시 일어섭니다.", "1회마다 앉은 깊이를 확인해요. 옆모습으로 서면 상체 기울기도 확인해요."] },
    { name: "런지", type: "lunge", instructions: ["폰을 세로로 세워 약 2m 앞에 둡니다. 어깨부터 무릎까지 보이면 됩니다.", "한쪽 발을 앞으로 내딛습니다.", "자세가 안정적인 범위에서 무릎을 굽혔다가 돌아옵니다.", "1회마다 내려간 깊이를 확인해요. 정면이면 무릎이 안쪽으로 모이는지, 옆모습이면 상체 기울기도 확인해요."] },
    { name: "푸쉬업", type: "pushup", instructions: ["폰을 가로로 눕혀 몸 옆쪽 약 1.5m 바닥에 둡니다.", "어깨·팔꿈치·손목만 보이면 셉니다.", "팔꿈치를 굽혔다가 펴며 시작 자세로 돌아옵니다.", "1회마다 내려간 깊이를 확인해요. 엉덩이와 무릎까지 보이면 몸이 일직선인지(처짐·들림)도 확인해요."] },
    { name: "플랭크", type: "plank", instructions: ["폰을 가로로 눕혀 몸 옆쪽 약 1.5m 바닥에 둡니다.", "발까지 안 보여도 괜찮아요. 어깨~무릎만 보이면 됩니다.", "어깨, 엉덩이, 무릎(발목)이 일직선이 되게 유지합니다.", "잠깐 흔들리면 시간이 멈췄다가, 자세를 되찾으면 이어서 셉니다.", "엉덩이가 처졌는지 들렸는지 나눠서 알려 드려요. 끝나면 좋은 자세로 버틴 시간을 보여 드려요."] },
    { name: "버피테스트", type: "burpee", instructions: ["현재 버전에서는 자동 자세 인식이 지원되지 않습니다.", "수동 완료를 선택할 경우 AI 인식 완료와 별도로 기록됩니다."] }
];

// 운동별 폰 위치 안내
const placementGuides = {
    front: {
        title: '📱 폰을 세로로 세워 앞에 두세요',
        caption: '옆에서 본 모습',
        lines: ['약 2m 앞, 의자나 선반 위(허리 높이)에 세워두세요.', '화면에 어깨부터 무릎까지 보이면 OK! 발은 안 보여도 돼요.', '정면이나 옆모습 모두 인식돼요.'],
        speech: '폰을 세로로 세워 2미터 앞에 두세요.'
    },
    side: {
        title: '📱 폰을 가로로 눕혀 몸 옆에 두세요',
        caption: '위에서 본 모습',
        lines: ['바닥에 가로로 세워서 몸 옆쪽 약 1.5m에 두세요.', '카메라가 내 옆모습을 보도록 해주세요.', '어깨부터 무릎까지 보이면 OK! 발은 안 보여도 돼요.'],
        speech: '폰을 가로로 눕혀 몸 옆쪽에 두세요.'
    },
    none: {
        title: '📷 카메라 없이 하는 운동이에요',
        caption: '',
        lines: ['버피테스트는 아직 자동 인식이 안 돼요.', '동작을 모두 마치면 아래 \'수동 완료\' 버튼을 눌러주세요.'],
        speech: '이 운동은 직접 완료 버튼을 눌러주세요.'
    }
};
const placementByType = { squat: 'front', lunge: 'front', pushup: 'side', plank: 'side', burpee: 'none' };

const PLACEMENT_SVG = {
    front: `<svg viewBox="0 0 260 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <line x1="10" y1="118" x2="250" y2="118" stroke="#ccc" stroke-width="3"/>
        <rect x="28" y="78" width="34" height="40" rx="3" fill="#e5e5e5"/>
        <rect x="37" y="46" width="16" height="30" rx="3" fill="#1cb0f6"/>
        <circle cx="45" cy="52" r="2.5" fill="#fff"/>
        <circle cx="205" cy="24" r="10" fill="#58cc02"/>
        <line x1="205" y1="34" x2="205" y2="72" stroke="#58cc02" stroke-width="6" stroke-linecap="round"/>
        <line x1="205" y1="44" x2="188" y2="62" stroke="#58cc02" stroke-width="5" stroke-linecap="round"/>
        <line x1="205" y1="44" x2="222" y2="62" stroke="#58cc02" stroke-width="5" stroke-linecap="round"/>
        <line x1="205" y1="72" x2="195" y2="116" stroke="#58cc02" stroke-width="6" stroke-linecap="round"/>
        <line x1="205" y1="72" x2="215" y2="116" stroke="#58cc02" stroke-width="6" stroke-linecap="round"/>
        <line x1="70" y1="100" x2="180" y2="100" stroke="#ffc800" stroke-width="3" stroke-dasharray="6 5"/>
        <polygon points="180,95 190,100 180,105" fill="#ffc800"/>
        <text x="125" y="93" text-anchor="middle" font-size="14" font-weight="bold" fill="#3c3c3c">약 2m</text>
    </svg>`,
    side: `<svg viewBox="0 0 260 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="10" y="8" width="240" height="114" rx="10" fill="#f7f7f7"/>
        <circle cx="62" cy="40" r="11" fill="#58cc02"/>
        <rect x="74" y="33" width="80" height="15" rx="7" fill="#58cc02"/>
        <rect x="152" y="35" width="70" height="11" rx="5" fill="#58cc02"/>
        <rect x="82" y="48" width="8" height="14" rx="3" fill="#58cc02"/>
        <rect x="110" y="104" width="40" height="14" rx="3" fill="#1cb0f6"/>
        <circle cx="130" cy="104" r="2.5" fill="#fff"/>
        <line x1="130" y1="98" x2="130" y2="62" stroke="#ffc800" stroke-width="3" stroke-dasharray="6 5"/>
        <polygon points="125,62 130,52 135,62" fill="#ffc800"/>
        <text x="140" y="85" font-size="14" font-weight="bold" fill="#3c3c3c">약 1.5m</text>
    </svg>`,
    none: `<svg viewBox="0 0 260 90" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="105" y="10" width="50" height="70" rx="8" fill="#e5e5e5"/>
        <circle cx="130" cy="45" r="16" fill="none" stroke="#999" stroke-width="4"/>
        <line x1="100" y1="80" x2="160" y2="10" stroke="#ff4b4b" stroke-width="5" stroke-linecap="round"/>
    </svg>`
};

const badges = [
    { id: 'first_step', name: '🥉 운동 입문자', desc: '첫 번째 운동 단계 완료', unlocked: false, check: () => completedSteps >= 1 },
    { id: 'streak_7', name: '🥈 7일 연속 운동', desc: '7일 연속 운동 달성', unlocked: false, check: () => streakDays >= 7 },
    { id: 'profile_challenger', name: '🏆 바디프로필 도전자', desc: '바디프로필 목표로 전 코스 완료', unlocked: false, check: () => completedSteps >= 5 && document.getElementById('goal-select').value === 'profile' },
    { id: 'level_master', name: '🏆 운동 마스터', desc: '레벨 3 달성', unlocked: false, check: () => currentLevel >= 3 },
    { id: 'all_clear', name: '🥇 완전 정복', desc: '모든 운동 단계 1회 이상 완료', unlocked: false, check: () => completedSteps >= 5 }
];

const difficultyConfig = {
    diet: {
        beginner: { sets: 3, reps: 10, rest: 30 },
        intermediate: { sets: 4, reps: 15, rest: 25 },
        advanced: { sets: 5, reps: 20, rest: 20 }
    },
    muscle: {
        beginner: { sets: 3, reps: 8, rest: 60 },
        intermediate: { sets: 4, reps: 12, rest: 50 },
        advanced: { sets: 5, reps: 15, rest: 45 }
    },
    profile: {
        beginner: { sets: 4, reps: 10, rest: 40 },
        intermediate: { sets: 5, reps: 15, rest: 30 },
        advanced: { sets: 6, reps: 20, rest: 20 }
    }
};

const dietConfig = {
    diet: { title: "균형 식사 예시", items: ["아침: 달걀, 과일, 곡류", "점심: 밥, 단백질 식품, 채소", "저녁: 밥 또는 곡류, 단백질 식품, 채소"] },
    muscle: { title: "운동일 식사 예시", items: ["아침: 달걀, 오트밀 또는 곡류", "점심: 밥, 단백질 식품, 채소", "저녁: 밥 또는 곡류, 단백질 식품, 채소"] },
    profile: { title: "균형 식사 예시", items: ["아침: 곡류, 단백질 식품, 과일", "점심: 밥, 단백질 식품, 채소", "저녁: 밥 또는 곡류, 단백질 식품, 채소"] }
};
