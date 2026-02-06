/* VR/js/score-manager.js */

// Flag global pour éviter les doublons
window.ScoreboardCreated = false;

AFRAME.registerComponent('score-manager', {
    schema: {
        totalScore: { type: 'number', default: 0 }
    },

    init: function() {
        console.log('🏆 Score Manager prêt avec Panneau Géant');
        window.ScoreManager = this;

        // Variables pour l'animation
        this.displayedScore = 0;
        this.targetScore = 0;

        // Création du visuel (une seule fois globalement)
        if (!window.ScoreboardCreated) {
            this.createGlobalScoreboard();
            window.ScoreboardCreated = true;
        }

        // Démarrer la boucle d'animation du score
        this.startScoreAnimationLoop();
    },

    createGlobalScoreboard: function() {
        const scene = this.el.sceneEl;

        // Vérifier si le panneau existe déjà
        if (document.getElementById('global-scoreboard')) return;

        // 1. Conteneur principal (placé haut sur le mur du fond)
        const container = document.createElement('a-entity');
        container.id = 'global-scoreboard';
        container.setAttribute('position', '0 3.5 -4');
        container.setAttribute('rotation', '10 0 0'); // Légèrement incliné vers le bas
        scene.appendChild(container);

        // 2. Fond du panneau (Style LED sombre)
        const bg = document.createElement('a-box');
        bg.setAttribute('width', 3);
        bg.setAttribute('height', 0.8);
        bg.setAttribute('depth', 0.1);
        bg.setAttribute('color', '#111');
        bg.setAttribute('material', 'metalness: 0.8; roughness: 0.2');
        container.appendChild(bg);

        // 3. Bordure brillante
        const border = document.createElement('a-box');
        border.setAttribute('width', 3.1);
        border.setAttribute('height', 0.9);
        border.setAttribute('depth', 0.05);
        border.setAttribute('color', '#333');
        border.setAttribute('position', '0 0 -0.05');
        container.appendChild(border);

        // 4. Titre "SCORE"
        const title = document.createElement('a-text');
        title.setAttribute('value', 'SCORE TOTAL');
        title.setAttribute('align', 'center');
        title.setAttribute('position', '0 0.25 0.06');
        title.setAttribute('width', 4);
        title.setAttribute('color', '#aaa');
        container.appendChild(title);

        // 5. Le Score (Grand et Lumineux)
        this.scoreTextElement = document.createElement('a-text');
        this.scoreTextElement.id = 'score-display';
        this.scoreTextElement.setAttribute('value', '0000');
        this.scoreTextElement.setAttribute('align', 'center');
        this.scoreTextElement.setAttribute('position', '0 -0.1 0.06');
        this.scoreTextElement.setAttribute('width', 12); // Très grand
        this.scoreTextElement.setAttribute('color', '#f1c40f'); // Or / Jaune
        this.scoreTextElement.setAttribute('font', 'mozillavr');
        container.appendChild(this.scoreTextElement);
        
        // Stocker la référence globalement pour les mises à jour
        window.ScoreDisplayElement = this.scoreTextElement;
    },

    startScoreAnimationLoop: function() {
        // Met à jour l'affichage 30 fois par seconde pour un effet fluide
        setInterval(() => {
            if (this.displayedScore < this.targetScore) {
                // On augmente le score affiché
                const diff = this.targetScore - this.displayedScore;
                // Plus la différence est grande, plus ça monte vite
                const increment = Math.ceil(diff / 10);
                this.displayedScore += increment;
                this.updateDisplay();
            }
        }, 33);
    },

    updateDisplay: function() {
        const scoreEl = window.ScoreDisplayElement || this.scoreTextElement;
        if (scoreEl) {
            // Formatage "0000" (ex: 50 devient "0050")
            const formatted = this.displayedScore.toString().padStart(4, '0');
            scoreEl.setAttribute('value', formatted);
        }
    },

    validateOrder: function(playerIngredients, orderEntity) {
        const recipeDisplay = orderEntity.components['recipe-display'];
        if (!recipeDisplay) return { matched: false, score: 0 };

        const targetRecipe = recipeDisplay.getRecipe();
        const targetIngredients = targetRecipe.map(item => item.type);

        // Comparaison de la recette
        let score = 0;
        let isPerfect = true;
        let maxLength = Math.max(playerIngredients.length, targetIngredients.length);

        for (let i = 0; i < maxLength; i++) {
            const expected = targetIngredients[i];
            const actual = playerIngredients[i];

            if (expected === actual) {
                score += 20;
            } else if (expected && actual && expected !== actual) {
                score -= 5;
                isPerfect = false;
            } else {
                isPerfect = false;
            }
        }

        if (isPerfect && playerIngredients.length === targetIngredients.length) {
            score += 50;
        }
        if (score < 0) score = 0;

        // Mise à jour de la cible (l'animation rattrapera ce chiffre)
        this.targetScore += score;

        // Feedback local sur la TV
        recipeDisplay.showResult(score, isPerfect);

        return { 
            matched: isPerfect, 
            score: score, 
            targetIngredients: targetIngredients 
        };
    },

    compareRecipes: function(playerIngredients, targetIngredients) {
        if (playerIngredients.length !== targetIngredients.length) {
            return { matched: false, reason: "wrong_length" };
        }

        for (let i = 0; i < playerIngredients.length; i++) {
            if (playerIngredients[i] !== targetIngredients[i]) {
                return { matched: false, reason: "wrong_order", position: i };
            }
        }

        return { matched: true, reason: "perfect_match" };
    }
});