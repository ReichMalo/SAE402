const INGREDIENT_MODELS = {
    'bun_bottom': '#model-bun-top',
    'patty': '#model-patty',
    'cheese': '#model-cheese',
    'tomato': '#model-tomato',
    'onion': '#model-onion',
    'bun_top': '#model-bun-bottom'
};

const DISPLAY_NAMES = {
    'bun_bottom': 'Bottom bun',
    'bun_top': 'Top bun',
    'patty': 'Patty',
    'cheese': 'Cheese',
    'tomato': 'Tomato',
    'onion': 'Onion'
};

const ORDER_SLOTS = [
    { x: -0.9, y: 1.65, z: -1.5 },
    { x: 0.9,  y: 1.65, z: -1.5 }
];

const TV_CONFIG = {
    width: 1.6,
    height: 0.9,
    depth: 0.5,
    screenWidth: 1.4,
    screenGlow: '#2c3e50'
};

function generateRandomRecipe() {
    const innerIngredients = [];

    const steakCount = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < steakCount; i++) {
        innerIngredients.push({ type: 'patty' });
        if (Math.random() > 0.5) innerIngredients.push({ type: 'cheese' });
    }

    if (Math.random() > 0.6) innerIngredients.push({ type: 'tomato' });
    if (Math.random() > 0.6) innerIngredients.push({ type: 'onion' });

    while (innerIngredients.length < 2) {
        const fillers = ['cheese', 'tomato', 'onion'];
        const randomFiller = fillers[Math.floor(Math.random() * fillers.length)];
        innerIngredients.push({ type: randomFiller });
    }

    const recipe = [];
    recipe.push({ type: 'bun_bottom' });
    innerIngredients.forEach(item => recipe.push(item));
    recipe.push({ type: 'bun_top' });

    return recipe;
}

AFRAME.registerComponent('recipe-display', {
    init: function() {
        this.recipe = generateRandomRecipe();
        this.el.classList.add('active-order');
        this._buildTVDesign();
        this._fillScreenContent();
    },

    _buildTVDesign: function() {
        const frame = document.createElement('a-box');
        frame.setAttribute('color', '#2c2c2c');
        frame.setAttribute('width', TV_CONFIG.width);
        frame.setAttribute('height', TV_CONFIG.height);
        frame.setAttribute('depth', TV_CONFIG.depth);
        this.el.appendChild(frame);

        const screenZ = (TV_CONFIG.depth / 2) + 0.01;
        const screen = document.createElement('a-plane');
        screen.setAttribute('color', TV_CONFIG.screenGlow);
        screen.setAttribute('width', TV_CONFIG.width - 0.15);
        screen.setAttribute('height', TV_CONFIG.height - 0.15);
        screen.setAttribute('position', `0 0 ${screenZ}`);
        screen.setAttribute('shader', 'flat');
        this.el.appendChild(screen);

        const ceilingMount = document.createElement('a-cylinder');
        ceilingMount.setAttribute('color', '#111');
        ceilingMount.setAttribute('height', 3); // Longue tige vers le haut
        ceilingMount.setAttribute('radius', 0.04);
        ceilingMount.setAttribute('position', `0 ${TV_CONFIG.height / 2 + 1.5} 0`);
        this.el.appendChild(ceilingMount);
        const mountBase = document.createElement('a-cylinder');
        mountBase.setAttribute('color', '#444');
        mountBase.setAttribute('height', 0.1);
        mountBase.setAttribute('radius', 0.1);
        mountBase.setAttribute('position', `0 ${TV_CONFIG.height / 2 + 0.05} 0`);
        this.el.appendChild(mountBase);

        // 4. Hitbox
        this.hitbox = document.createElement('a-box');
        this.hitbox.classList.add('interactable');
        this.hitbox.setAttribute('width', TV_CONFIG.width);
        this.hitbox.setAttribute('height', TV_CONFIG.height);
        this.hitbox.setAttribute('depth', 0.2);
        this.hitbox.setAttribute('position', `0 0 ${screenZ + 0.1}`);
        this.hitbox.setAttribute('visible', 'false');
        this.el.appendChild(this.hitbox);
    },

    _fillScreenContent: function() {
        const screenZ = (TV_CONFIG.depth / 2) + 0.05;
        const contentGroup = document.createElement('a-entity');
        contentGroup.setAttribute('position', `0 0 ${screenZ}`);
        this.el.appendChild(contentGroup);

        const itemsToRender = [];
        let totalContentWidth = 0;

        this.recipe.forEach((item) => {
            let scaleVal, widthSpace;

            if (item.type === 'tomato') {
                scaleVal = 0.10;
                widthSpace = 0.11;
            }
            else if (item.type === 'bun_bottom' || item.type === 'bun_top') {
                scaleVal = 0.18;
                widthSpace = 0.16;
            }
            else if (item.type === 'onion') {
                scaleVal = 0.21;
                widthSpace = 0.18;
            }
            else {
                scaleVal = 0.28;
                widthSpace = 0.24;
            }

            itemsToRender.push({
                type: item.type,
                scale: `${scaleVal} ${scaleVal} ${scaleVal}`,
                width: widthSpace
            });

            totalContentWidth += widthSpace;
        });

        const maxAvailableWidth = TV_CONFIG.screenWidth - 0.2;
        let globalScale = 1;

        if (totalContentWidth > maxAvailableWidth) {
            globalScale = maxAvailableWidth / totalContentWidth;
            contentGroup.setAttribute('scale', `${globalScale} ${globalScale} ${globalScale}`);
        }

        let currentX = -(totalContentWidth / 2);

        itemsToRender.forEach((data) => {
            const modelId = INGREDIENT_MODELS[data.type];
            if (!modelId) return;

            const part = document.createElement('a-entity');
            part.setAttribute('gltf-model', modelId);
            part.setAttribute('scale', data.scale);

            let posX = currentX + (data.width / 2);
            if (data.type === 'tomato') posX -= 0.07;

            part.setAttribute('position', `${posX} 0 0`);
            part.setAttribute('rotation', '20 30 0');
            contentGroup.appendChild(part);

            currentX += data.width;
        });

        const tooltipText = this.recipe.map(i => DISPLAY_NAMES[i.type] || i.type).join('\n');

        const tooltip = document.createElement('a-text');
        tooltip.setAttribute('value', tooltipText);
        tooltip.setAttribute('align', 'center');
        tooltip.setAttribute('position', `0 -0.35 ${screenZ + 0.02}`);
        tooltip.setAttribute('scale', '0.25 0.25 0.25');
        tooltip.setAttribute('line-height', '50');
        tooltip.setAttribute('color', '#FFF');
        tooltip.setAttribute('visible', 'false');

        this.el.appendChild(tooltip);

        this.hitbox.addEventListener('mouseenter', () => { tooltip.setAttribute('visible', 'true'); });
        this.hitbox.addEventListener('mouseleave', () => { tooltip.setAttribute('visible', 'false'); });
        this.hitbox.addEventListener('click', () => {
            const isVisible = tooltip.getAttribute('visible') === 'true';
            tooltip.setAttribute('visible', !isVisible);
        });
    }
});

AFRAME.registerComponent('order-manager', {
    schema: {
        interval: { type: 'number', default: 18000 },
        maxOrders: { type: 'number', default: 2 }
    },

    init: function() {
        this.timer = 0;
        this.spawnOneOrder();
    },

    tick: function(time, timeDelta) {
        this.timer += timeDelta;
        if (this.timer >= this.data.interval) {
            this.spawnOneOrder();
            this.timer = 0;
        }
    },

    spawnOneOrder: function() {
        const currentOrders = this.el.sceneEl.querySelectorAll('[recipe-display]').length;
        if (currentOrders >= this.data.maxOrders) return;

        for (let i = 0; i < ORDER_SLOTS.length; i++) {
            const slot = ORDER_SLOTS[i];
            const slotId = `order-slot-${i}`;
            const existingOrder = document.getElementById(slotId);

            if (!existingOrder) {
                this.createOrderAt(slot, slotId);
                break;
            }
        }
    },

    createOrderAt: function(position, id) {
        const scene = this.el.sceneEl;
        const orderEl = document.createElement('a-entity');
        orderEl.setAttribute('id', id);
        orderEl.setAttribute('position', position);
        orderEl.setAttribute('recipe-display', '');

        orderEl.setAttribute('animation', {
            property: 'position',
            from: `${position.x} ${position.y + 2} ${position.z}`,
            to: `${position.x} ${position.y} ${position.z}`,
            dur: 1000,
            easing: 'easeOutBounce'
        });

        scene.appendChild(orderEl);
    }
});