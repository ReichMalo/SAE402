function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function initializeApp() {
    try {
        await Promise.all([
            loadScript('js/grab-controller.js'),
            loadScript('js/infinite-supply.js'),
            loadScript('js/trash-bin.js')
        ]);
    } catch (error) {
        console.error('Error loading components:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

