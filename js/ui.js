// 코스·프로필·식단 화면, 탭 전환

// 운동 기록 복사 기능
function copyAssessmentReport() {
    const goal = document.getElementById('goal-select').selectedOptions[0].text;
    const level = document.getElementById('level-select').selectedOptions[0].text;
    const today = new Date().toLocaleDateString('ko-KR');

    const aiCount = Object.values(completionModes).filter(mode => mode === 'ai').length;
    const manualCount = Object.values(completionModes).filter(mode => mode === 'manual').length;
    const unknownCount = Math.max(0, completedSteps - aiCount - manualCount);
    const reportText = `[ SOLOLINGO 운동 기록 ]\n- 일자: ${today}\n- 운동 목표: ${goal} (${level})\n- 레벨: Lv.${currentLevel}\n- 완료한 운동: ${completedSteps}/${exercises.length} 단계\n- AI 인식 완료: ${aiCount}단계\n- 수동 완료: ${manualCount}단계\n- 완료 방식 미기록(이전 저장 데이터): ${unknownCount}단계\n- 연속 운동 일수: ${calculateStreakDays()}일\n- 현재 XP: ${currentXP} XP\n---------------------------------------\n※ 이 기록은 이 기기에 저장된 앱 진행 상황을 요약한 것으로, 외부 인증을 거친 기록은 아닙니다.`;

    // 안드로이드에서는 공유 창(카톡 등)으로 바로 보낼 수 있게 함
    if (navigator.share) {
        navigator.share({ title: 'SOLOLINGO 운동 기록', text: reportText }).catch(() => {});
        return;
    }
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        alert(`클립보드를 사용할 수 없습니다. 아래 기록을 직접 복사해 주세요.\n\n${reportText}`);
        return;
    }
    navigator.clipboard.writeText(reportText).then(() => {
        showToast("운동 기록이 클립보드에 복사되었습니다!");
    }).catch(() => alert(`복사에 실패했습니다. 아래 기록을 직접 복사해 주세요.\n\n${reportText}`));
}

function updateUI() {
    streakDays = calculateStreakDays();
    document.getElementById('xp-fill').style.width = `${Math.min(100, currentXP)}%`;
    document.getElementById('xp-text').innerText = `${currentXP} / 100 XP`;
    document.getElementById('profile-level').innerText = `Lv. ${currentLevel} ${currentLevel >= 3 ? '운동 마스터' : '초보 코치'}`;
    document.getElementById('stat-completed').innerText = completedSteps;
    document.getElementById('stat-streak').innerText = `${streakDays}일`;
    renderPath();
    renderBadges();
    renderDietCard();
}

function renderPath() {
    const pathContainer = document.getElementById('workout-path');
    pathContainer.replaceChildren();

    exercises.forEach((ex, idx) => {
        const node = document.createElement('div');
        node.className = 'step-node';
        node.setAttribute('role', 'button');
        if (idx < completedSteps) {
            node.classList.add('completed');
            node.textContent = '✓';
        } else if (idx === completedSteps) {
            node.classList.add('active');
            node.textContent = String(idx + 1);
        } else {
            node.textContent = String(idx + 1);
        }

        const label = document.createElement('div');
        label.className = 'step-label';
        label.textContent = ex.name;
        node.appendChild(label);

        node.addEventListener('click', () => openExerciseModal(idx));
        pathContainer.appendChild(node);
    });

    // 코스 마지막: 식단 보상 (모든 운동 완료 후 언제든 열람)
    const reward = document.createElement('div');
    reward.className = `step-node reward ${isDietUnlocked() ? '' : 'locked'}`;
    reward.setAttribute('role', 'button');
    reward.textContent = '🥗';
    const rewardLabel = document.createElement('div');
    rewardLabel.className = 'step-label';
    rewardLabel.textContent = '식단 가이드';
    reward.appendChild(rewardLabel);
    reward.addEventListener('click', () => {
        if (isDietUnlocked()) showDietModal(false);
        else showToast(`🔒 운동 ${exercises.length}개를 모두 끝내면 열려요 (${completedSteps}/${exercises.length})`);
    });
    pathContainer.appendChild(reward);
}

function isDietUnlocked() { return completedSteps >= exercises.length; }

// 프로필 탭의 식단 카드
let dietViewGoal = null;
function renderDietCard() {
    const card = document.getElementById('diet-card');
    if (!card) return;
    card.replaceChildren();
    if (!isDietUnlocked()) {
        card.className = 'diet-card locked';
        card.textContent = `🔒 운동 ${exercises.length}개를 모두 끝내면 열려요 (${completedSteps}/${exercises.length})`;
        return;
    }
    card.className = 'diet-card';
    const goal = dietViewGoal || document.getElementById('goal-select').value;
    const tabs = document.createElement('div');
    tabs.className = 'diet-tabs';
    const goalNames = { diet: '다이어트', muscle: '몸 만들기', profile: '바디프로필' };
    Object.keys(dietConfig).forEach(key => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `diet-tab ${key === goal ? 'active' : ''}`;
        tab.textContent = goalNames[key];
        tab.addEventListener('click', () => { dietViewGoal = key; renderDietCard(); });
        tabs.appendChild(tab);
    });
    card.append(tabs, buildDietSection(goal));
}

function buildDietSection(goal) {
    const diet = dietConfig[goal] || dietConfig.diet;
    const section = document.createElement('div');
    section.className = 'diet-section';
    const title = document.createElement('h4');
    title.textContent = diet.title;
    const list = document.createElement('ul');
    list.style.marginTop = '8px';
    list.style.paddingLeft = '20px';
    diet.items.forEach(itemText => {
        const item = document.createElement('li');
        item.textContent = itemText;
        list.appendChild(item);
    });
    section.append(title, list);
    return section;
}

function showDietModal(celebrate = true) {
    const goal = document.getElementById('goal-select').value;
    document.getElementById('diet-celebrate').style.display = celebrate ? 'block' : 'none';
    document.getElementById('diet-info').replaceChildren(buildDietSection(goal));
    document.getElementById('diet-modal').style.display = 'flex';
}

function closeDietModal() { document.getElementById('diet-modal').style.display = 'none'; }

function updateWorkoutPlan() { dietViewGoal = null; renderPath(); renderDietCard(); }

document.addEventListener('visibilitychange', () => {
    if (document.hidden && selectedStepIndex !== null) closeWorkoutModal();
    if (!document.hidden) {
        ensureDailyQuestsCurrent();
        updateUI();
    }
});

function switchTab(tabName, btnElement) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(`tab-${tabName}`).classList.add('active');
    if (btnElement) btnElement.classList.add('active');
    window.scrollTo(0, 0);
}

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (selectedStepIndex !== null) closeWorkoutModal();
    const dietModal = document.getElementById('diet-modal');
    if (dietModal && dietModal.style.display === 'flex') closeDietModal();
});
