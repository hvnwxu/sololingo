// 공용 상태 값 (XP, 레벨, 운동 진행, 카메라)

let currentXP = 0;
let currentLevel = 1;
let completedSteps = 0;
let selectedStepIndex = null;
let streakDays = 0;
let completedQuests = [];
let activityDates = [];
let completionModes = {};
let formHistory = [];        // 자세 판정 기록 (운동 1번 = 1칸, 나중에 '기록 분석 → 다음 운동 추천'에 쓸 데이터)
let questDate = getLocalDateKey();

// 카메라 & AI
let pose = null;
let poseReady = false;
let poseFrameInFlight = false;
let cameraStream = null;
let frameLoopId = null;
let facingMode = 'user';     // 'user' = 전면, 'environment' = 후면
let cameraSession = 0;       // 오래된 카메라 시작 요청을 무시하기 위한 번호
let wakeLock = null;

let completionTimeout = null;
let isCompletingSet = false;
let countReps = 0;
let currentSet = 1;
let totalSets = 3;
let restTimeConfig = 30;
let motionState = 'UP';

let isResting = false;
let restInterval = null;
let restTimeLeft = 0;
let plankTimer = null;

// 시작 단계: 'waiting'(뒤로 물러나는 중) → 'countdown'(3, 2, 1) → 'go'(이때부터 횟수를 셈)
let startPhase = 'go';

// AI 모델: 정확한 모델(1)로 시작하고, 폰이 느리면 자동으로 가벼운 모델(0)로 바꿈
let poseComplexity = loadComplexity();
let fpsWindowStart = 0;
let fpsFrames = 0;
let fpsChecked = false;
