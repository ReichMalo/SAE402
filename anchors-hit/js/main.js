function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function runSimulationTest() {
    console.clear();
    console.log("%c🧪 DÉBUT DU TEST DE SCORE", "color: cyan; font-weight: bold; font-size: 14px;");

    // 1. Récupérer l'instance du ScoreManager
    // On crée une entité dummy pour attacher le composant si elle n'existe pas encore
    let scoreEntity = document.querySelector('[score-manager]');
    if (!scoreEntity) {
        scoreEntity = document.createElement('a-entity');
        scoreEntity.setAttribute('score-manager', '');
        document.querySelector('a-scene').appendChild(scoreEntity);
    }

    // Attendre que A-Frame initialise le composant
    setTimeout(() => {
        const manager = scoreEntity.components['score-manager'];

        // CAS 1 : Recette Parfaite
        console.log("\n🍔 TEST 1 : Burger Parfait");
        const target1 = [{type: 'bun_bottom'}, {type: 'patty'}, {type: 'cheese'}, {type: 'bun_top'}];
        const player1 = ['bun_bottom', 'patty', 'cheese', 'bun_top'];
        manager.validateBurger(player1, target1);

        // CAS 2 : Erreur d'ingrédient
        console.log("\n🍔 TEST 2 : Erreur (Oignon au lieu de Fromage)");
        const target2 = [{type: 'bun_bottom'}, {type: 'patty'}, {type: 'cheese'}, {type: 'bun_top'}];
        const player2 = ['bun_bottom', 'patty', 'onion', 'bun_top']; // Erreur ici
        manager.validateBurger(player2, target2);

        // CAS 3 : Mauvaise taille (il manque le pain du haut)
        console.log("\n🍔 TEST 3 : Burger Incomplet");
        const target3 = [{type: 'bun_bottom'}, {type: 'patty'}, {type: 'bun_top'}];
        const player3 = ['bun_bottom', 'patty'];
        manager.validateBurger(player3, target3);

    }, 500);
}

async function initializeApp() {
    try {
        await Promise.all([
            loadScript('js/grab-controller.js'),
            loadScript('js/infinite-supply.js'),
            loadScript('js/trash-bin.js'),
            loadScript('js/game-manager.js'),
            loadScript('js/score-manager.js') // <--- NOUVEAU
        ]);

        // On attache le score-manager à la scène
        const scene = document.querySelector('a-scene');
        if (scene && !scene.hasAttribute('score-manager')) {
            scene.setAttribute('score-manager', '');
        }

        console.log("Application fully initialized.");
    } catch (error) {
        console.error('Error loading components:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}