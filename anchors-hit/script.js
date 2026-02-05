// Composant pour placer le curseur sur les surfaces réelles
AFRAME.registerComponent("hit-test-cursor", {
    schema: {
        cursor: { type: "selector" },
        ring: { type: "selector" },
    },
    init: function () {
        this.sceneEl = this.el;
        this.cursorEl = this.data.cursor;
        this.ringEl = this.data.ring;
        this.session = null;
        this.hitTestSource = null;
        this.refSpace = null;
        this.viewerSpace = null;

        this.onEnterVR = this.onEnterVR.bind(this);
        this.onExitVR = this.onExitVR.bind(this);
        this.onXRFrame = this.onXRFrame.bind(this);

        this.sceneEl.addEventListener("enter-vr", this.onEnterVR);
        this.sceneEl.addEventListener("exit-vr", this.onExitVR);
    },
    onEnterVR: function () {
        const session = this.sceneEl.renderer.xr.getSession();
        if (!session) return;
        this.session = session;
        const self = this;

        session.requestReferenceSpace("viewer").then((vs) => {
            self.viewerSpace = vs;
            session.requestReferenceSpace("local-floor").then((rs) => {
                self.refSpace = rs;
                session.requestHitTestSource({ space: self.viewerSpace }).then((src) => {
                    self.hitTestSource = src;
                    session.requestAnimationFrame(self.onXRFrame);
                });
            });
        });
    },
    onExitVR: function () {
        this.hitTestSource = null;
        this.session = null;
        if (this.cursorEl) this.cursorEl.setAttribute("visible", "false");
    },
    onXRFrame: function (time, frame) {
        const session = frame.session;
        session.requestAnimationFrame(this.onXRFrame);

        if (!this.hitTestSource || !this.refSpace) return;

        // Si la zone est déjà créée, on cache le curseur
        const zoneTool = this.sceneEl.components["zone-tool"];
        if (zoneTool && zoneTool.isZoneCreated) {
            this.cursorEl.setAttribute("visible", "false");
            return;
        }

        const results = frame.getHitTestResults(this.hitTestSource);
        if (results.length > 0) {
            const pose = results[0].getPose(this.refSpace);
            this.cursorEl.setAttribute("visible", "true");
            this.cursorEl.object3D.position.copy(pose.transform.position);
            if (this.ringEl) this.ringEl.setAttribute("rotation", "-90 0 0");
        } else {
            this.cursorEl.setAttribute("visible", "false");
        }
    },
});

// Composant Principal : Gestion de la Zone et Apparition de la Cuisine
AFRAME.registerComponent("zone-tool", {
    schema: {
        root: { type: "selector" },
        cursor: { type: "selector" },
    },

    init: function () {
        this.points = [];
        this.markers = [];
        this.isZoneCreated = false;
        this.kitchenEntity = null;

        this.onSelect = this.onSelect.bind(this);
        this.resetZone = this.resetZone.bind(this);

        this.el.sceneEl.addEventListener("enter-vr", () => {
            const session = this.el.sceneEl.renderer.xr.getSession();
            if (session) session.addEventListener("select", this.onSelect);
        });

        // Bouton de reset
        const resetBtn = document.getElementById("reset-zone-button");
        if (resetBtn) resetBtn.addEventListener("click", this.resetZone);

        this.statusEl = document.getElementById("status");
    },

    onSelect: function () {
        if (this.isZoneCreated || !this.data.cursor.getAttribute("visible")) return;

        const pos = new THREE.Vector3();
        this.data.cursor.object3D.getWorldPosition(pos);

        // Ajouter un point
        this.points.push(pos.clone());
        this.addMarker(pos);

        const count = this.points.length;
        this.setStatus(`Point ${count}/4 défini.`);

        if (count === 4) {
            this.createKitchen();
        }
    },

    addMarker: function (pos) {
        const m = document.createElement("a-sphere");
        m.setAttribute("radius", "0.02");
        m.setAttribute("color", "red");
        m.setAttribute("position", pos);
        this.data.root.appendChild(m);
        this.markers.push(m);
    },

    createKitchen: function () {
        this.isZoneCreated = true;
        this.setStatus("Zone créée ! Chargement de la cuisine...");

        // Afficher bouton reset
        document.getElementById("reset-zone-button").style.display = "block";

        // 1. Calculer le centre (Centroïde)
        const center = new THREE.Vector3();
        this.points.forEach(p => center.add(p));
        center.divideScalar(4);

        // 2. Calculer la largeur et profondeur approximatives
        // On assume que p0->p1 est la largeur et p1->p2 est la profondeur
        const width = this.points[0].distanceTo(this.points[1]);
        const depth = this.points[1].distanceTo(this.points[2]);

        // 3. Calculer l'orientation
        // On veut que la cuisine fasse face au joueur, on aligne sur le vecteur p0->p1
        const v1 = new THREE.Vector3().subVectors(this.points[1], this.points[0]).normalize();
        const angle = Math.atan2(v1.z, v1.x); // Rotation Y basique

        // 4. Créer l'entité racine de la cuisine
        this.kitchenEntity = document.createElement("a-entity");
        this.kitchenEntity.object3D.position.copy(center);
        // On pivote pour s'aligner avec les points tracés
        this.kitchenEntity.object3D.rotation.y = -angle;

        // 5. Créer la surface physique (Table invisible ou semi-transparente)
        // On le place un peu plus bas pour que les objets posés soient bien "sur" les points
        const tableBody = document.createElement("a-box");
        tableBody.setAttribute("width", width);
        tableBody.setAttribute("height", "0.05"); // épaisseur fine
        tableBody.setAttribute("depth", depth);
        tableBody.setAttribute("position", "0 -0.025 0");
        tableBody.setAttribute("material", "color: #333; opacity: 0.8; transparent: true");
        tableBody.setAttribute("physx-body", "type: static"); // Le sol est statique
        this.kitchenEntity.appendChild(tableBody);

        // 6. Ajouter les éléments de la cuisine (Décalage relatif au centre)
        // Note : On met Y à environ 0.1 pour qu'ils tombent sur la table
        this.spawnKitchenItems(this.kitchenEntity, width, depth);

        this.data.root.appendChild(this.kitchenEntity);

        // Nettoyer les marqueurs rouges
        this.markers.forEach(m => m.parent.removeChild(m));
        this.markers = [];
    },

    spawnKitchenItems: function (parent, tableW, tableD) {
        // On définit des positions relatives proportionnelles à la taille de la zone tracée
        // Exemple : La poêle à gauche, les ingrédients au milieu, l'assiette à droite.

        const htmlContent = `
      <a-entity
          id="frying-pan"
          class="interactable"
          gltf-model="#model-pan"
          position="${-tableW * 0.3} 0.1 0"
          scale="0.2 0.2 0.2"
          physx-body="type: dynamic; mass: 0.5"
          item-type="pan"
          sound="src: #sizzle-sound; on: start-cooking; poolSize: 5"
      ></a-entity>
      
      <a-entity
          class="interactable"
          gltf-model="#model-spatula"
          position="${-tableW * 0.4} 0.1 ${tableD * 0.2}"
          scale="0.4 0.4 0.4"
          rotation="0 90 0"
          physx-body="type: dynamic; mass: 0.1"
          item-type="spatula"
      ></a-entity>

      <a-entity
          id="serving-plate"
          class="interactable"
          gltf-model="#model-plate"
          position="${tableW * 0.3} 0.1 0"
          scale="0.4 0.4 0.4"
          physx-body="type: dynamic; mass: 0.3"
          item-type="plate"
          infinite-supply
          data-is-original="true"
      ></a-entity>

      <a-entity
          class="interactable"
          gltf-model="#model-bun-bottom"
          position="0 0.1 ${-tableD * 0.2}"
          scale="0.3 0.3 0.3"
          physx-body="type: dynamic; mass: 0.2"
          item-type="bun"
          infinite-supply
          data-is-original="true"
      ></a-entity>

      <a-entity
          class="interactable"
          gltf-model="#model-bun-top"
          position="${tableW * 0.1} 0.1 ${-tableD * 0.2}"
          scale="0.3 0.3 0.3"
          physx-body="type: dynamic; mass: 0.2"
          item-type="bun"
          infinite-supply
          data-is-original="true"
      ></a-entity>

      <a-entity
          class="interactable"
          gltf-model="#model-patty"
          position="${-tableW * 0.1} 0.1 ${-tableD * 0.2}"
          scale="0.6 0.6 0.6"
          physx-body="type: dynamic; mass: 0.3"
          item-type="patty"
          infinite-supply
          data-is-original="true"
      ></a-entity>

      <a-entity
          class="interactable"
          gltf-model="#model-cheese"
          position="0 0.1 ${tableD * 0.2}"
          scale="0.6 0.6 0.6"
          physx-body="type: dynamic; mass: 0.1"
          item-type="cheese"
          infinite-supply
          data-is-original="true"
      ></a-entity>
      
      <a-entity
          gltf-model="#model-trash"
          position="${tableW * 0.6} -0.5 0" 
          scale="0.1 0.1 0.1"
          trash-bin
          physx-body="type: static"
      ></a-entity>
    `;

        // Injection du HTML
        parent.insertAdjacentHTML('beforeend', htmlContent);
    },

    resetZone: function () {
        this.points = [];
        this.isZoneCreated = false;
        this.markers.forEach(m => { if(m.parent) m.parent.removeChild(m); });
        this.markers = [];

        if (this.kitchenEntity && this.kitchenEntity.parent) {
            this.kitchenEntity.parent.removeChild(this.kitchenEntity);
        }
        this.kitchenEntity = null;

        document.getElementById("reset-zone-button").style.display = "none";
        this.setStatus("Reset effectué. Placez 4 nouveaux points.");
    },

    setStatus: function (msg) {
        if (this.statusEl) this.statusEl.textContent = msg;
    }
});