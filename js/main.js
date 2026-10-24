// 앱 시작

function init() {
    loadProgress();
    checkBadges(false);
    updateUI();
    setupSelectMenus();
    setupInstallButton();
    registerServiceWorker();
}

window.onload = init;
