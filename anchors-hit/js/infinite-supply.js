AFRAME.registerComponent('infinite-supply', {
    schema: {
        delay: { type: 'number', default: 50 }
    },

    init: function() {
        console.log('✅ infinite-supply init:', this.el.getAttribute('item-type'));

        this.originalPosition = this.el.getAttribute('position');
        this.originalRotation = this.el.getAttribute('rotation');
        this.originalScale = this.el.getAttribute('scale');
        this.originalModel = this.el.getAttribute('gltf-model');
        this.itemType = this.el.getAttribute('item-type');
        this.originalPhysxBody = this.el.getAttribute('physx-body');

        this.originalWorldPos = new THREE.Vector3();
        if (this.el.object3D) {
            this.el.object3D.getWorldPosition(this.originalWorldPos);
        }
        this.el.dataset.isOriginal = 'true';

        this.el.addEventListener('dropped', () => {
            console.log('🎧 Received dropped event for', this.itemType);
            this.respawn();
        });
    },

    respawn: function() {
        setTimeout(() => {
            this.el.setAttribute('position', this.originalPosition);
            this.el.setAttribute('rotation', this.originalRotation);
            this.el.setAttribute('scale', this.originalScale);
            // Preserve physics body
            if (this.originalPhysxBody) {
                this.el.setAttribute('physx-body', this.originalPhysxBody);
            }
            console.log('🔄 Original reset to starting position');
        }, this.data.delay);
    }
});

