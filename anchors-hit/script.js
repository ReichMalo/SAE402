AFRAME.registerComponent("hit-test-cursor", {
  schema: {
    cursor: { type: "selector" }, // #cursor
    ring: { type: "selector" }, // #cursorRing
  },

  init: function () {
    this.sceneEl = this.el;
    this.cursorEl = this.data.cursor;
    this.ringEl = this.data.ring;

    this.session = null;
    this.refSpace = null;
    this.viewerSpace = null;
    this.hitTestSource = null;

    this.onEnterVR = this.onEnterVR.bind(this);
    this.onExitVR = this.onExitVR.bind(this);
    this.onXRFrame = this.onXRFrame.bind(this);

    this.sceneEl.addEventListener("enter-vr", this.onEnterVR);
    this.sceneEl.addEventListener("exit-vr", this.onExitVR);

    if (this.cursorEl) this.cursorEl.setAttribute("visible", "false");
  },

  remove: function () {
    this.sceneEl.removeEventListener("enter-vr", this.onEnterVR);
    this.sceneEl.removeEventListener("exit-vr", this.onExitVR);
  },

  onEnterVR: function () {
    var session = this.sceneEl.renderer.xr.getSession();
    if (!session) return;

    this.session = session;

    var self = this;

    session.requestReferenceSpace("viewer").then(function (vs) {
      self.viewerSpace = vs;

      session.requestReferenceSpace("local-floor").then(function (rs) {
        self.refSpace = rs;

        session
          .requestHitTestSource({ space: self.viewerSpace })
          .then(function (src) {
            self.hitTestSource = src;
            if (self.cursorEl) self.cursorEl.setAttribute("visible", "false");
            session.requestAnimationFrame(self.onXRFrame);
          });
      });
    });
  },

  onExitVR: function () {
    if (this.hitTestSource) {
      this.hitTestSource.cancel();
      this.hitTestSource = null;
    }

    this.session = null;
    this.refSpace = null;
    this.viewerSpace = null;

    if (this.cursorEl) this.cursorEl.setAttribute("visible", "false");
  },

  onXRFrame: function (time, frame) {
    frame.session.requestAnimationFrame(this.onXRFrame);

    if (!this.hitTestSource) return;
    if (!this.refSpace) return;
    if (!this.cursorEl) return;

    // Перевіряємо чи зона вже створена
    var zoneTool = this.sceneEl.components["zone-tool"];
    if (zoneTool && zoneTool.polyEl) {
      // Зона створена - курсор не показуємо
      this.cursorEl.setAttribute("visible", "false");
      return;
    }

    var results = frame.getHitTestResults(this.hitTestSource);
    if (!results || results.length === 0) {
      this.cursorEl.setAttribute("visible", "false");
      return;
    }

    var pose = results[0].getPose(this.refSpace);
    if (!pose) {
      this.cursorEl.setAttribute("visible", "false");
      return;
    }

    var p = pose.transform.position;

    this.cursorEl.setAttribute("visible", "true");
    this.cursorEl.object3D.position.set(p.x, p.y, p.z);

    // Keep ring horizontal (floor)
    if (this.ringEl) {
      this.ringEl.setAttribute("rotation", "-90 0 0");
    }
  },
});

/* -----------------------------------------
  Zone tool: 4 points -> oriented rectangle
------------------------------------------ */
AFRAME.registerComponent("zone-tool", {
  schema: {
    root: { type: "selector" }, // #anchor-root
    cursor: { type: "selector" }, // #cursor
    min: { type: "int", default: 4 },
    max: { type: "int", default: 4 },
  },

  init: function () {
    this.sceneEl = this.el;
    this.rootEl = this.data.root;
    this.cursorEl = this.data.cursor;

    this.session = null;

    this.points = []; // THREE.Vector3
    this.markers = []; // a-sphere
    this.planeEl = null;

    this.polyEl = null; // a-entity with custom mesh

    this.onEnterVR = this.onEnterVR.bind(this);
    this.onExitVR = this.onExitVR.bind(this);
    this.onSelect = this.onSelect.bind(this);
    this.onSqueeze = this.onSqueeze.bind(this);

    this.sceneEl.addEventListener("enter-vr", this.onEnterVR);
    this.sceneEl.addEventListener("exit-vr", this.onExitVR);

    // Buttons
    this.resetBtn = document.getElementById("reset-zone-button");
    this.finishBtn = document.getElementById("finish-zone-button");
    this.statusEl = document.getElementById("status");

    if (this.resetBtn) {
      this.resetBtn.addEventListener("click", () => this.resetZone());
    }
    this.resetZone();
  },

  remove: function () {
    this.sceneEl.removeEventListener("enter-vr", this.onEnterVR);
    this.sceneEl.removeEventListener("exit-vr", this.onExitVR);

    if (this.session) {
      this.session.removeEventListener("select", this.onSelect);
    }
  },

  onEnterVR: function () {
    if (this.sceneEl.is("ar-mode") === false) return;

    const session = this.sceneEl.renderer?.xr?.getSession();
    if (!session) return;

    this.session = session;
    session.addEventListener("select", this.onSelect);
    session.addEventListener("squeeze", this.onSqueeze);

    this.setStatus("AR started. Place points with trigger.");
  },

  onExitVR: function () {
    if (this.session) {
      this.session.removeEventListener("select", this.onSelect);
      this.session.removeEventListener("squeeze", this.onSqueeze);
    }
    this.session = null;
    this.resetZone();
    this.setStatus("Exited AR.");
  },

  onSelect: function () {
    if (!this.cursorEl) return;

    // якщо вже 4 точки — більше не додаємо
    if (this.points.length >= this.data.max) {
      this.setStatus(
        `Zone already created (${this.data.max} points). Press Grip button to Reset.`,
      );
      return;
    }

    const p = this.cursorEl.object3D.position;
    const v = new THREE.Vector3(p.x, p.y, p.z);

    this.points.push(v);
    this.addMarker(v);

    const needed = this.data.min; // тут це 4

    // якщо точок < 4 — просто підказка
    if (this.points.length < needed) {
      this.setStatus(
        `Point ${this.points.length}/4 added. Place ${needed - this.points.length} more.`,
      );
      return;
    }

    // ✅ якщо це 4-та точка — будуємо полігон автоматично
    this.setStatus("Point 4/4 added. Creating zone...");
    this.buildPolygon();
  },

  onSqueeze: function () {
    // Grip button - reset zone
    this.resetZone();
    this.setStatus("Zone reset. Place 4 new points.");
  },

  addMarker: function (v) {
    if (!this.rootEl) return;

    const m = document.createElement("a-sphere");
    m.setAttribute("radius", "0.03");
    m.setAttribute("color", "#00c8ff");
    m.setAttribute("position", `${v.x} ${v.y + 0.01} ${v.z}`);

    this.rootEl.appendChild(m);
    this.markers.push(m);
  },

  removeMarkers: function () {
    if (!this.rootEl) return;
    for (const m of this.markers) this.rootEl.removeChild(m);
    this.markers = [];
  },

  removePolygon: function () {
    if (!this.rootEl) return;
    if (!this.polyEl) return;

    // remove three.js mesh safely
    this.polyEl.removeObject3D("mesh");
    this.rootEl.removeChild(this.polyEl);
    this.polyEl = null;
  },

  hideCursor: function () {
    if (!this.cursorEl) return;
    this.cursorEl.setAttribute("visible", "false");
  },

  showCursor: function () {
    if (!this.cursorEl) return;
    this.cursorEl.setAttribute("visible", "true");
  },

  resetZone: function () {
    this.points = [];
    this.removeMarkers();
    this.removePolygon();
    this.showCursor();
    this.setStatus("Reset. Tap to place new points.");
  },

  buildPolygon: function () {
    if (!this.rootEl) return;
    if (this.points.length !== 4) {
      this.setStatus(`Need exactly 4 points. Currently: ${this.points.length}`);
      return;
    }

    // Replace old polygon if exists
    this.removePolygon();

    // Create manual geometry for quadrilateral
    const geom = new THREE.BufferGeometry();

    // 4 точки -> 2 трикутники (0-1-2, 0-2-3)
    const vertices = new Float32Array([
      // Трикутник 1: точки 0, 1, 2
      this.points[0].x,
      this.points[0].y,
      this.points[0].z,
      this.points[1].x,
      this.points[1].y,
      this.points[1].z,
      this.points[2].x,
      this.points[2].y,
      this.points[2].z,

      // Трикутник 2: точки 0, 2, 3
      this.points[0].x,
      this.points[0].y,
      this.points[0].z,
      this.points[2].x,
      this.points[2].y,
      this.points[2].z,
      this.points[3].x,
      this.points[3].y,
      this.points[3].z,
    ]);

    geom.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geom.computeVertexNormals();

    // Material (напівпрозора сіра)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x808080,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geom, mat);

    const e = document.createElement("a-entity");
    e.setObject3D("mesh", mesh);

    this.rootEl.appendChild(e);
    this.polyEl = e;

    // Приховуємо курсор після створення зони
    this.hideCursor();

    this.setStatus(`Zone created with 4 points. Press Grip to reset zone.`);
  },

  setStatus: function (msg) {
    if (this.statusEl) this.statusEl.textContent = msg;
  },
});
