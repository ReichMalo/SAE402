AFRAME.registerComponent('trash-bin', {
    schema: {
        radius: { type: 'number', default: 0.5 },
        destroyDelay: { type: 'number', default: 500 }
    },

    init: function() {
        this.trashPosition = new THREE.Vector3();
        this._createDetectionZone();
        console.log('🗑️ Trash bin initialized with radius:', this.data.radius);
    },

    tick: function() {
        if (!this.el.object3D) return;

        this.el.object3D.getWorldPosition(this.trashPosition);

        const interactables = document.querySelectorAll('.interactable');

        interactables.forEach(el => {
            // Skip the trash bin itself
            if (el.hasAttribute('trash-bin')) return;

            // Skip original items (sources) - never destroy these
            if (el.dataset.isOriginal === 'true') return;

            // Only destroy clones of infinite-supply items
            // Check if this is a clone AND its original has infinite-supply
            const itemType = el.getAttribute('item-type');
            const originalSelector = `[item-type="${itemType}"][infinite-supply]`;
            const hasInfiniteSupplyOriginal = document.querySelector(originalSelector);

            if (!hasInfiniteSupplyOriginal) return;

            const itemPos = new THREE.Vector3();
            if (el.object3D) {
                el.object3D.getWorldPosition(itemPos);
                const distance = this.trashPosition.distanceTo(itemPos);

                if (distance < this.data.radius) {
                    console.log('🎯 Clone of unlimited item in trash range:', itemType, 'Distance:', distance.toFixed(2));
                    this._destroyItem(el);
                }
            }
        });
    },

    _createDetectionZone: function() {
        const detectionZone = document.createElement('a-ring');
        detectionZone.setAttribute('geometry', {
            radiusInner: this.data.radius - 0.1,
            radiusOuter: this.data.radius,
            thetaLength: 360
        });
        detectionZone.setAttribute('material', {
            color: '#ff6b6b',
            opacity: 0.3,
            transparent: true
        });
        detectionZone.setAttribute('position', '0 0.1 0');
        detectionZone.setAttribute('rotation', '-90 0 0');
        this.el.appendChild(detectionZone);
    },

    _destroyItem: function(el) {
        const itemType = el.getAttribute('item-type');
        console.log('🗑️ Destroying item:', itemType);

        if (el.object3D) {
            el.setAttribute('animation', {
                property: 'scale',
                to: '0.01 0.01 0.01',
                dur: this.data.destroyDelay,
                easing: 'easeInQuad'
            });
        }

        setTimeout(() => {
            if (el.parentNode) {
                console.log('💥 Item destroyed:', itemType);
                el.parentNode.removeChild(el);
            }
        }, this.data.destroyDelay);
    }
});

