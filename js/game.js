// XP·레벨, 퀘스트, 배지

function updateQuestButtons() {
    disableQuestBtn('quest-btn-1');
    disableQuestBtn('quest-btn-2');
    if (!completedQuests.includes('quest_1')) enableQuestBtn('quest-btn-1');
    if (!completedQuests.includes('quest_2')) enableQuestBtn('quest-btn-2');
}

function ensureDailyQuestsCurrent() {
    const today = getLocalDateKey();
    if (questDate !== today) {
        questDate = today;
        completedQuests = [];
        updateQuestButtons();
        saveProgress();
    }
}

function enableQuestBtn(btnId) {
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.disabled = false;
        btn.innerText = '완료';
    }
}

function renderBadges() {
    const container = document.getElementById('badges-list');
    container.replaceChildren();
    badges.forEach(badge => {
        const el = document.createElement('div');
        el.className = `badge ${badge.unlocked ? 'unlocked' : ''}`;
        const title = document.createElement('div');
        title.textContent = badge.name;
        const description = document.createElement('div');
        description.style.fontSize = '0.75rem';
        description.textContent = badge.desc;
        el.append(title, description);
        container.appendChild(el);
    });
}

function checkBadges(announce = true) {
    badges.forEach(badge => {
        if (!badge.unlocked && badge.check()) {
            badge.unlocked = true;
            if (announce) {
                speakText('축하합니다! 새로운 업적을 해금했습니다.');
                showToast(`🏆 새로운 업적 해금! [${badge.name}]`, 3000);
                vibrate([80, 40, 80, 40, 160]);
            }
        }
    });
    renderBadges();
    saveProgress();
}

function addXP(amount) {
    const safeAmount = safeInteger(amount, 0, 0, 10000);
    currentXP += safeAmount;
    while (currentXP >= 100) {
        currentLevel++;
        currentXP -= 100;
        speakText('레벨 업!');
        showToast(`🎉 레벨업! Lv.${currentLevel}`, 3000);
    }
    streakDays = calculateStreakDays();
    checkBadges();
    saveProgress();
    updateUI();
}

function completeQuest(btn, questId, xp) {
    ensureDailyQuestsCurrent();
    const rewards = { quest_1: 20, quest_2: 10 };
    if (!Object.prototype.hasOwnProperty.call(rewards, questId)) return;
    if (completedQuests.includes(questId)) return;
    questDate = getLocalDateKey();
    completedQuests.push(questId);
    disableQuestBtn(btn);
    addXP(rewards[questId]);
    vibrate(40);
}

function disableQuestBtn(btnId) {
    const btn = typeof btnId === 'string' ? document.getElementById(btnId) : btnId;
    if (btn) {
        btn.disabled = true;
        btn.innerText = '완료됨';
    }
}
