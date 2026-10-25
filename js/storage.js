// 저장·불러오기, 날짜·연속 운동 일수 계산

function loadComplexity() {
    try {
        const saved = localStorage.getItem(COMPLEXITY_KEY);
        if (saved === '0' || saved === '1') return Number(saved);
    } catch (error) { /* 저장소 사용 불가 */ }
    return 1;
}

// 날짜는 UTC가 아닌 기기 현지 날짜 기준으로 기록합니다.
function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isValidDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && getLocalDateKey(date) === value;
}

function safeInteger(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function calculateStreakDays() {
    const dates = new Set(activityDates.filter(isValidDateKey));
    const cursor = new Date();
    if (!dates.has(getLocalDateKey(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
        if (!dates.has(getLocalDateKey(cursor))) return 0;
    }
    let count = 0;
    while (dates.has(getLocalDateKey(cursor))) {
        count++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return count;
}

function recordWorkoutActivity() {
    const today = getLocalDateKey();
    if (!activityDates.includes(today)) activityDates.push(today);
    activityDates = [...new Set(activityDates.filter(isValidDateKey))].sort().slice(-400);
    streakDays = calculateStreakDays();
}

// 자세 판정 기록: { date, type, reps, good, lean, shallow } (최근 FORM_HISTORY_MAX개만 보관)
const FORM_HISTORY_MAX = 100;

function recordFormHistory(report) {
    const { total } = report;
    formHistory.push({
        date: getLocalDateKey(),
        type: report.type,
        reps: total.reps,
        good: total.good,
        lean: total.issues.lean,
        shallow: total.issues.shallow
    });
    formHistory = formHistory.slice(-FORM_HISTORY_MAX);
}

function isValidFormRecord(record) {
    if (!record || typeof record !== 'object' || !isValidDateKey(record.date)) return false;
    if (!exercises.some(ex => ex.type === record.type)) return false;
    const counts = [record.reps, record.good, record.lean, record.shallow];
    return counts.every(n => Number.isInteger(n) && n >= 0 && n <= 10000) && record.good <= record.reps;
}

// 저장 데이터는 사용자가 개발자 도구로 바꾸거나 손상시킬 수 있으므로 검증합니다.
function saveProgress() {
    const data = {
        version: 2,
        currentXP,
        currentLevel,
        completedSteps,
        unlockedBadges: badges.filter(b => b.unlocked).map(b => b.id),
        completedQuests,
        questDate,
        activityDates,
        completionModes,
        formHistory
    };
    try {
        localStorage.setItem('sololingo_save_data', JSON.stringify(data));
    } catch (error) {
        console.warn('진행 상황을 저장하지 못했습니다.', error);
    }
}

function loadProgress() {
    try {
        const saved = localStorage.getItem('sololingo_save_data');
        if (!saved) {
            questDate = getLocalDateKey();
            completedQuests = [];
            updateQuestButtons();
            return;
        }

        const data = JSON.parse(saved);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('저장 데이터 형식이 올바르지 않습니다.');

        currentXP = safeInteger(data.currentXP, 0, 0, 99);
        currentLevel = safeInteger(data.currentLevel, 1, 1, 1000000);
        completedSteps = safeInteger(data.completedSteps, 0, 0, exercises.length);
        activityDates = Array.isArray(data.activityDates)
            ? [...new Set(data.activityDates.filter(isValidDateKey))].sort().slice(-400)
            : [];

        completionModes = {};
        if (data.completionModes && typeof data.completionModes === 'object' && !Array.isArray(data.completionModes)) {
            for (let i = 0; i < completedSteps; i++) {
                const mode = data.completionModes[String(i)];
                if (mode === 'ai' || mode === 'manual') completionModes[String(i)] = mode;
            }
        }

        formHistory = Array.isArray(data.formHistory) ? data.formHistory.filter(isValidFormRecord).slice(-FORM_HISTORY_MAX) : [];

        const validBadgeIds = new Set(badges.map(b => b.id));
        const savedBadges = Array.isArray(data.unlockedBadges) ? data.unlockedBadges : [];
        badges.forEach(b => { b.unlocked = savedBadges.includes(b.id) && validBadgeIds.has(b.id); });

        const today = getLocalDateKey();
        questDate = today;
        completedQuests = data.questDate === today && Array.isArray(data.completedQuests)
            ? data.completedQuests.filter(id => id === 'quest_1' || id === 'quest_2')
            : [];
        completedQuests = [...new Set(completedQuests)];
        streakDays = calculateStreakDays();
        updateQuestButtons();
    } catch (error) {
        console.warn('저장된 진행 상황을 읽지 못해 기본값으로 시작합니다.', error);
        currentXP = 0;
        currentLevel = 1;
        completedSteps = 0;
        completedQuests = [];
        activityDates = [];
        completionModes = {};
        formHistory = [];
        streakDays = 0;
        badges.forEach(b => { b.unlocked = false; });
        questDate = getLocalDateKey();
        updateQuestButtons();
    }
}

function resetAllData() {
    if (confirm("모든 운동 기록과 레벨을 초기화하시겠습니까?")) {
        closeWorkoutModal();
        try { localStorage.removeItem('sololingo_save_data'); } catch (error) { console.warn(error); }
        location.reload();
    }
}
