// 화면 테마(라이트/다크): 직접 고른 적이 없으면 기기 설정을 따름
// <head>에서 먼저 불러와서, 화면이 그려지기 전에 테마가 적용되게 함 (깜빡임 방지)

const THEME_KEY = 'sololingo_theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function loadTheme() {
    try {
        const saved = localStorage.getItem(THEME_KEY);
        return saved === 'light' || saved === 'dark' ? saved : null;
    } catch (error) {
        return null;
    }
}

function currentTheme() {
    return document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light');
}

function applyTheme(theme) {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    updateThemeUI();
}

// 상단 버튼 모양과 브라우저 상단 바 색을 현재 테마에 맞춤
function updateThemeUI() {
    const dark = currentTheme() === 'dark';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#111a23' : '#58cc02';
    const btn = document.getElementById('theme-btn');
    if (btn) {
        btn.textContent = dark ? '☀️' : '🌙';
        btn.setAttribute('aria-label', dark ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기');
    }
}

function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch (error) { /* 저장 안 돼도 이번 화면에는 적용 */ }
    applyTheme(next);
}

applyTheme(loadTheme());
if (darkQuery.addEventListener) darkQuery.addEventListener('change', updateThemeUI);
else if (darkQuery.addListener) darkQuery.addListener(updateThemeUI);
document.addEventListener('DOMContentLoaded', updateThemeUI);
