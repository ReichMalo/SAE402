AFRAME.registerComponent('grab-controller', {
    init: function () {
        this.grabbedEl = null;

        const onSelectStart = (evt) => {
            let targetEl = null;

            if (evt.type === 'triggerdown') {
                const intersections = this.el.components.raycaster.intersections;
                if (intersections.length > 0) targetEl = intersections[0].el;
            } else if (evt.detail && evt.detail.intersectedEl) {
                targetEl = evt.detail.intersectedEl;
            }

            if (targetEl && targetEl.classList.contains('interactable')) {
                if (targetEl.hasAttribute('infinite-supply')) {
                    const clone = targetEl.cloneNode(true);
                    targetEl.parentNode.appendChild(clone);
                    targetEl.removeAttribute('infinite-supply');
                    targetEl.removeAttribute('id');
                    this.grab(targetEl);
                } else {
                    this.grab(targetEl);
                }
            }
        };

        const onSelectEnd = () => {
            if (this.grabbedEl) this.drop();
        };

        this.el.addEventListener('triggerdown', onSelectStart);
        this.el.addEventListener('mousedown', onSelectStart);
        this.el.addEventListener('triggerup', onSelectEnd);
        this.el.addEventListener('mouseup', onSelectEnd);
    },

    grab: function (el) {
        this.grabbedEl = el;
        this.el.appendChild(this.grabbedEl);
        this.grabbedEl.setAttribute('position', '0 0 -0.2');
        this.grabbedEl.setAttribute('rotation', '0 0 0');
        console.log("Grabbed:", el.getAttribute('item-type'));
    },

    drop: function () {
        const sceneEl = document.querySelector('a-scene');
        const worldPos = new THREE.Vector3();
        const worldRot = new THREE.Quaternion();

        this.grabbedEl.object3D.getWorldPosition(worldPos);
        this.grabbedEl.object3D.getWorldQuaternion(worldRot);

        sceneEl.appendChild(this.grabbedEl);
        this.grabbedEl.setAttribute('position', worldPos);
        this.grabbedEl.object3D.quaternion.copy(worldRot);

        const trash = document.querySelector('#trash');
        if (trash) {
            const trashPos = new THREE.Vector3();
            trash.object3D.getWorldPosition(trashPos);
            if (worldPos.distanceTo(trashPos) < 0.3) {
                this.grabbedEl.remove();
                this.grabbedEl = null;
                console.log("Trash used");
                return;
            }
        }

        const pan = document.querySelector('#frying-pan');
        const grill = document.querySelector('#grill');
        let cookingSource = null;

        if (pan) {
            const panPos = new THREE.Vector3();
            pan.object3D.getWorldPosition(panPos);
            if (worldPos.distanceTo(panPos) < 0.3) cookingSource = pan;
        }
        if (!cookingSource && grill) {
            const grillPos = new THREE.Vector3();
            grill.object3D.getWorldPosition(grillPos);
            if (worldPos.distanceTo(grillPos) < 0.3) cookingSource = grill;
        }

        if (cookingSource && this.grabbedEl.getAttribute('item-type') === 'patty') {
            this.grabbedEl.emit('start-cooking');
        }

        this.checkStacking(this.grabbedEl, worldPos);
        this.grabbedEl = null;
        console.log("Dropped");
    },

    checkStacking: function (droppedEl, dropPos) {
        const stackables = document.querySelectorAll('[stackable]:not([infinite-supply])');
        let target = null;
        let minDistance = 0.15;

        stackables.forEach((item) => {
            if (item !== droppedEl) {
                const itemPos = new THREE.Vector3();
                item.object3D.getWorldPosition(itemPos);
                const dist = dropPos.distanceTo(itemPos);
                if (dist < minDistance) {
                    target = item;
                    minDistance = dist;
                }
            }
        });

        if (target) {
            const targetPos = target.getAttribute('position');
            const randomRot = Math.random() * 20 - 10;
            droppedEl.setAttribute('position', {
                x: targetPos.x,
                y: targetPos.y + 0.04,
                z: targetPos.z
            });
            droppedEl.setAttribute('rotation', `0 ${randomRot} 0`);
        }
    }
});

AFRAME.registerComponent('cookable', {
    schema: {
        cookedColor: { type: 'color', default: '#5C4033' },
        duration: { type: 'number', default: 5000 }
    },
    init: function() {
        this.isCooking = false;
        this.el.addEventListener('start-cooking', () => {
            if (this.isCooking) return;
            this.isCooking = true;
            this.el.setAttribute('animation', {
                property: 'material.color',
                to: this.data.cookedColor,
                dur: this.data.duration,
                easing: 'linear'
            });
            this.el.components.sound?.playSound();
            this.el.setAttribute('particle-system', {
                preset: 'dust', color: '#FFFFFF', particleCount: 20, size: 0.2, opacity: 0.5
            });
            setTimeout(() => {
                this.el.removeAttribute('particle-system');
                console.log("Cooked");
            }, this.data.duration);
        });
    }
});

AFRAME.registerComponent('stackable', {});
AFRAME.registerComponent('infinite-supply', {});