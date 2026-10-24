// 앱 설치 버튼, 서비스 워커 등록

// ===== 홈 화면 설치 (PWA) =====
let deferredInstallPrompt = null;
function setupInstallButton() {
    const btn = document.getElementById('install-btn');
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredInstallPrompt = event;
        btn.style.display = 'block';
    });
    btn.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice.catch(() => null);
        deferredInstallPrompt = null;
        btn.style.display = 'none';
    });
    window.addEventListener('appinstalled', () => {
        btn.style.display = 'none';
        showToast('📲 홈 화면에 설치되었습니다!');
    });
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').catch(error => console.warn('서비스 워커 등록 실패', error));
    }
}
