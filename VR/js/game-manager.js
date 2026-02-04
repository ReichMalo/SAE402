const INGREDIENT_MODELS = {
    'bun_bottom': '#model-bun-top',
    'patty': '#model-patty',
    'cheese': '#model-cheese',
    'tomato': '#model-tomato',
    'onion': '#model-onion',
    'bun_top': '#model-bun-bottom'
};

const ORDER_SLOTS = [
    { x: -0.9, y: 1.65, z: -1.5 },
    { x: 0.9,  y: 1.65, z: -1.5 }
];

function generateRandomRecipe() {
    const recipe = [];
    recipe.push({ type: 'bun_bottom' });

    const steakCount = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < steakCount; i++) {
        recipe.push({ type: 'patty' });
        if (Math.random() > 0.5) recipe.push({ type: 'cheese' });
    }

    if (Math.random() > 0.6) recipe.push({ type: 'tomato' });
    if (Math.random() > 0.6) recipe.push({ type: 'onion' });

    recipe.push({ type: 'bun_top' });
    return recipe;
}

AFRAME.registerComponent('recipe-display', {
    init: function() {
        this.recipe = generateRandomRecipe();
        this.el.classList.add('active-order');
        this._buildVisuals();
    },

    _buildVisuals: function() {
        const itemsToRender = [];
        let totalContentWidth = 0;

        this.recipe.forEach((item) => {
            let scaleVal, widthSpace;

            if (item.type === 'tomato') {
                scaleVal = 0.10;
                widthSpace = 0.11;
            } else if (item.type === 'bun_bottom' || item.type === 'bun_top') {
                scaleVal = 0.18;
                widthSpace = 0.16;
            } else if (item.type === 'onion') {
                scaleVal = 0.21;
                widthSpace = 0.18;
            } else {
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

        const bg = document.createElement('a-box');
        bg.setAttribute('color', '#222');
        bg.setAttribute('opacity', '0.8');

        const bgWidth = totalContentWidth + 0.2;
        bg.setAttribute('width', bgWidth);
        bg.setAttribute('height', 0.35);
        bg.setAttribute('depth', 0.05);
        this.el.appendChild(bg);

        let currentX = -(totalContentWidth / 2);

        itemsToRender.forEach((data) => {
            const modelId = INGREDIENT_MODELS[data.type];
            if (!modelId) return;

            const part = document.createElement('a-entity');
            part.setAttribute('gltf-model', modelId);
            part.setAttribute('scale', data.scale);

            let posX = currentX + (data.width / 2);
            if (data.type === 'tomato') posX -= 0.07;

            part.setAttribute('position', `${posX} 0 0.08`);
            part.setAttribute('rotation', '20 30 0');

            this.el.appendChild(part);
            currentX += data.width;
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
            if (!document.getElementById(slotId)) {
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
            property: 'scale',
            from: '0 0 0',
            to: '1 1 1',
            dur: 600,
            easing: 'easeOutBack'
        });

        scene.appendChild(orderEl);
    }
});