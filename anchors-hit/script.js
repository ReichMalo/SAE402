/* anchors-hit/script.js */

// --- 1. Composant de Visée (Gestion couleurs et validité) ---
AFRAME.registerComponent("hit-test-cursor", {
    schema: {
        cursor: { type: "selector" },
        ring: { type: "selector" },
    },
    init: function () {
        this.sceneEl = this.el;
        this.cursorEl = this.data.cursor;
        this.ringEl = this.data.ring;

        this.hitTestSource = null;
        this.refSpace = null;
        this.isValidPosition = false;
        this.currentError = "";

        // --- REGLAGES ---
        this.MAX_DISTANCE = 10.0;   // AUGMENTÉ : Vous pouvez viser jusqu'à 10m
        this.MAX_HEIGHT = 1.5;      // Hauteur max (2m30)
        this.MIN_POINT_DIST = 0.8;  // AUGMENTÉ : Interdit de poser à moins de 80cm d'un autre point

        // Seuil de platitude (0.6 = accepte un peu de pente, mais refuse les murs droits)
        this.FLAT_THRESHOLD = 0.6;

        this.onEnterVR = this.onEnterVR.bind(this);
        this.onXRFrame = this.onXRFrame.bind(this);
        this.sceneEl.addEventListener("enter-vr", this.onEnterVR);
    },

    onEnterVR: function () {
        const session = this.sceneEl.renderer.xr.getSession();
        if (!session) return;

        session.requestReferenceSpace("viewer").then((vs) => {
            this.viewerSpace = vs;
            session.requestReferenceSpace("local-floor").then((rs) => {
                this.refSpace = rs;
                session.requestHitTestSource({ space: this.viewerSpace }).then((src) => {
                    this.hitTestSource = src;
                    session.requestAnimationFrame(this.onXRFrame);
                });
            });
        });
    },

    onXRFrame: function (time, frame) {
        const session = frame.session;
        session.requestAnimationFrame(this.onXRFrame);

        if (!this.hitTestSource || !this.refSpace) return;

        // Cacher le curseur si terminé
        const zoneTool = this.sceneEl.components["zone-tool"];
        if (zoneTool && zoneTool.isZoneCreated) {
            this.cursorEl.setAttribute("visible", "false");
            return;
        }

        const results = frame.getHitTestResults(this.hitTestSource);
        if (results.length > 0) {
            const pose = results[0].getPose(this.refSpace);
            const pos = pose.transform.position;
            const rot = pose.transform.orientation;

            this.cursorEl.setAttribute("visible", "true");
            this.cursorEl.object3D.position.copy(pos);

            // --- VÉRIFICATIONS ---
            let error = "";

            // Convertir la position en THREE.Vector3 pour les calculs de distance
            const posVec3 = new THREE.Vector3(pos.x, pos.y, pos.z);

            // 1. Distance Joueur (Vous vouliez pouvoir aller loin)
            const camera = this.sceneEl.camera;
            if (camera && camera.position.distanceTo(posVec3) > this.MAX_DISTANCE) {
                error = "Trop loin (Max 10m)";
            }

            // 2. Hauteur
            if (pos.y > this.MAX_HEIGHT) {
                error = "Trop haut";
            }

            // 3. Mur / Pente (Anti-Mur)
            const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
            const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);

            if (normal.y < this.FLAT_THRESHOLD) {
                error = "Impossible sur un mur";
            }

            // 4. Proximité (Vous ne vouliez pas que ce soit trop proche)
            if (zoneTool && zoneTool.points.length > 0) {
                for (let i = 0; i < zoneTool.points.length; i++) {
                    if (posVec3.distanceTo(zoneTool.points[i]) < this.MIN_POINT_DIST) {
                        error = "Trop près d'un autre point !";
                        break;
                    }
                }
            }

            // --- RÉSULTAT ---
            this.currentError = error;
            if (error === "") {
                this.isValidPosition = true;
                if (this.ringEl) this.ringEl.setAttribute("color", "#00FF7F"); // VERT
            } else {
                this.isValidPosition = false;
                if (this.ringEl) this.ringEl.setAttribute("color", "#FF0000"); // ROUGE
            }

            // Garder le cercle à plat
            if (this.ringEl) this.ringEl.object3D.rotation.set(-Math.PI / 2, 0, 0);

        } else {
            this.cursorEl.setAttribute("visible", "false");
            this.isValidPosition = false;
        }
    },
});

// --- 2. Composant Zone & Cuisine ---
AFRAME.registerComponent("zone-tool", {
    schema: {
        root: { type: "selector" },
        cursor: { type: "selector" },
    },

    init: function () {
        this.points = [];
        this.markers = [];
        this.isZoneCreated = false;

        this.onSelect = this.onSelect.bind(this);
        this.resetZone = this.resetZone.bind(this);

        this.el.sceneEl.addEventListener("enter-vr", () => {
            const session = this.el.sceneEl.renderer.xr.getSession();
            if (session) session.addEventListener("select", this.onSelect);
        });

        const resetBtn = document.getElementById("reset-zone-button");
        if (resetBtn) resetBtn.addEventListener("click", this.resetZone);
        this.statusEl = document.getElementById("status");
    },

    onSelect: function () {
        if (this.isZoneCreated || !this.data.cursor.getAttribute("visible")) return;

        // Vérifier validité
        const cursorComp = this.el.sceneEl.components["hit-test-cursor"];
        if (cursorComp && !cursorComp.isValidPosition) {
            if (cursorComp.currentError) {
                this.setStatus("❌ " + cursorComp.currentError);
            }
            return;
        }

        const pos = new THREE.Vector3();
        this.data.cursor.object3D.getWorldPosition(pos);

        this.points.push(pos.clone());
        this.addMarker(pos);

        if (this.points.length === 4) {
            this.createKitchen();
        } else {
            this.setStatus(`Point ${this.points.length}/4 validé.`);
        }
    },

    addMarker: function (pos) {
        const m = document.createElement("a-sphere");
        m.setAttribute("radius", "0.03");
        m.setAttribute("color", "#00AAFF");
        m.setAttribute("position", pos);
        this.data.root.appendChild(m);
        this.markers.push(m);
    },

    createKitchen: function () {
        this.isZoneCreated = true;
        this.setStatus("Construction...");
        document.getElementById("reset-zone-button").style.display = "block";

        // 1. Calculs
        const center = new THREE.Vector3().addVectors(this.points[0], this.points[2]).multiplyScalar(0.5);
        const width = this.points[0].distanceTo(this.points[1]);
        const depth = this.points[1].distanceTo(this.points[2]);
        const vX = new THREE.Vector3().subVectors(this.points[1], this.points[0]).normalize();
        const angle = Math.atan2(vX.z, vX.x);

        // 2. Structure
        this.kitchenEntity = document.createElement("a-entity");
        this.kitchenEntity.object3D.position.copy(center);
        this.kitchenEntity.object3D.rotation.y = -angle;

        // 3. Table Solide
        const table = document.createElement("a-box");
        table.setAttribute("width", width);
        table.setAttribute("height", "0.05");
        table.setAttribute("depth", depth);
        table.setAttribute("position", "0 -0.025 0");
        table.setAttribute("color", "#444");
        table.setAttribute("opacity", "1");
        table.setAttribute("physx-body", "type: static");
        this.kitchenEntity.appendChild(table);

        this.data.root.appendChild(this.kitchenEntity);

        // 4. Objets
        setTimeout(() => {
            this.spawnItems(this.kitchenEntity, width, depth);
            this.setStatus("Cuisine prête !");
        }, 200);

        // Nettoyage
        this.markers.forEach(m => m.parent.removeChild(m));
        this.markers = [];
    },

    spawnItems: function (parent, w, d) {
        const y = 0.3;

        const html = `
      <a-entity id="frying-pan" class="interactable" gltf-model="#model-pan" 
        position="${-w*0.3} ${y} 0" scale="0.2 0.2 0.2" 
        physx-body="type: dynamic; mass: 2" item-type="pan"
        sound="src: #sizzle-sound; on: start-cooking; poolSize: 5">
      </a-entity>

      <a-entity class="interactable" gltf-model="#model-spatula" 
        position="${-w*0.4} ${y} 0.15" scale="0.4 0.4 0.4" rotation="0 90 0"
        physx-body="type: dynamic; mass: 0.5" item-type="spatula">
      </a-entity>

      <a-entity class="interactable" gltf-model="#model-bun-bottom"
        position="${-w*0.15} ${y} ${-d*0.2}" scale="0.3 0.3 0.3"
        physx-body="type: dynamic; mass: 0.5" item-type="bun" infinite-supply data-is-original="true">
      </a-entity>
      
      <a-entity class="interactable" gltf-model="#model-patty"
        position="0 ${y} ${-d*0.2}" scale="0.6 0.6 0.6"
        physx-body="type: dynamic; mass: 0.5" item-type="patty" infinite-supply data-is-original="true">
      </a-entity>

      <a-entity class="interactable" gltf-model="#model-cheese"
        position="${w*0.15} ${y} ${-d*0.2}" scale="0.6 0.6 0.6"
        physx-body="type: dynamic; mass: 0.5" item-type="cheese" infinite-supply data-is-original="true">
      </a-entity>
      
      <a-entity class="interactable" gltf-model="#model-bun-top"
        position="${w*0.3} ${y} ${-d*0.2}" scale="0.3 0.3 0.3"
        physx-body="type: dynamic; mass: 0.5" item-type="bun" infinite-supply data-is-original="true">
      </a-entity>

      <a-entity id="serving-plate" class="interactable" gltf-model="#model-plate"
        position="${w*0.2} ${y} ${d*0.15}" scale="0.4 0.4 0.4"
        physx-body="type: dynamic; mass: 1" item-type="plate" infinite-supply data-is-original="true">
      </a-entity>
      
      <a-entity class="interactable" gltf-model="#model-ketchup"
        position="${w*0.4} ${y} 0" scale="0.5 0.5 0.5"
        physx-body="type: dynamic; mass: 0.5" item-type="ketchup">
      </a-entity>

      <a-entity gltf-model="#model-trash" 
        position="${w*0.6} -0.5 0" scale="0.1 0.1 0.1"
        trash-bin 
        physx-body="type: static">
      </a-entity>
    `;

        parent.insertAdjacentHTML("beforeend", html);
    },

    setStatus: function (msg) {
        if (this.statusEl) this.statusEl.textContent = msg;
    },

    resetZone: function () {
        if (this.kitchenEntity && this.kitchenEntity.parent) {
            this.kitchenEntity.parent.removeChild(this.kitchenEntity);
        }
        this.markers.forEach(m => { if(m.parent) m.parent.removeChild(m); });
        this.markers = [];
        this.points = [];
        this.isZoneCreated = false;
        document.getElementById("reset-zone-button").style.display = "none";
        this.setStatus("Placez 4 points pour la table.");
    }
});