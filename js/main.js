// 앱 시작

function init() {
    loadProgress();
    checkBadges(false);
    updateUI();
    setupInstallButton();
    registerServiceWorker();
}

window.onload = init;
