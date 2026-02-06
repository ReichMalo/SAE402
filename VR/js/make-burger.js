AFRAME.registerComponent("xr-debug-hud", {
  schema: {
    maxLines: { type: "int", default: 12 },
    width: { type: "number", default: 1.2 },
    fontSize: { type: "number", default: 0.06 },
  },

  init: function () {
    let el = this.el;

    this.panel = document.createElement("a-plane");
    this.panel.setAttribute("width", this.data.width);
    this.panel.setAttribute("height", 0.55);
    this.panel.setAttribute(
      "material",
      "color: #000; opacity: 0.45; transparent: true",
    );
    this.panel.setAttribute("position", "0 -0.25 -0.75");

    this.text = document.createElement("a-text");
    this.text.setAttribute("value", "HUD ready");
    this.text.setAttribute("align", "left");
    this.text.setAttribute("baseline", "top");
    this.text.setAttribute("wrap-count", "40");
    this.text.setAttribute("width", this.data.width - 0.08);
    this.text.setAttribute(
      "position",
      -this.data.width / 2 + 0.04 + " " + 0.25 + " 0.01",
    );
    this.text.setAttribute("color", "#00ff99");

    this.panel.appendChild(this.text);
    el.appendChild(this.panel);

    this.lines = [];

    let self = this;
    window.XRDebug = {
      log: function () {
        self._push("LOG", arguments);
      },
      warn: function () {
        self._push("WARN", arguments);
      },
      error: function () {
        self._push("ERR", arguments);
      },
      set: function (str) {
        self._set(str);
      },
    };
  },

  _set: function (str) {
    this.lines = [String(str)];
    this._render();
  },

  _push: function (prefix, args) {
    let cleaned = [];
    for (let i = 0; i < args.length; i++) {
      let a = args[i];
      if (typeof a === "string") {
        cleaned.push(a);
        continue;
      }
      if (a instanceof Error) {
        cleaned.push(a.message);
        continue;
      }
      if (typeof a === "object") {
        try {
          cleaned.push(JSON.stringify(a));
        } catch (e) {
          cleaned.push(String(a));
        }
        continue;
      }
      cleaned.push(String(a));
    }

    let msg = cleaned.join(" ").trim();
    if (!msg) return;

    this.lines.push("[" + prefix + "] " + msg);
    if (this.lines.length > this.data.maxLines) this.lines.shift();
    this._render();
  },

  _render: function () {
    this.text.setAttribute("value", this.lines.join("\n"));
  },
});

AFRAME.registerComponent("plate-target", {
  schema: {
    checkMs: { type: "int", default: 150 },
  },

  _expectedIngredients: ["bunBottom", "patty", "cheese", "tomato", "bunTop"],

  init: function () {
    let self = this;
    this._lastCheck = 0;
    this._items = [];
    this._itemsMap = {};
    this._orderComplete = false;
    this._grouped = false;
    this._stableSince = null;
    this._movementEpsilonSq = 0.0001;
    this._burgerEntities = [];
    this._lastPositions = new Map();
    this._expectedMap = {};
    this._zoneBox = new THREE.Box3();
    this._zoneCenter = new THREE.Vector3();
    this._zoneSize = new THREE.Vector3(0.35, 0.35, 0.35);
    this._tempBox = new THREE.Box3();
    this._tempList = [];
    this._tempMap = {};
    this._tempPos = new THREE.Vector3();
    this._zoneYOffset = 0.23;
    this._readyToSubmit = false;
    this._readyShown = false;

    for (let i = 0; i < this._expectedIngredients.length; i++) {
      this._expectedMap[this._expectedIngredients[i]] = true;
    }

    this._onModelLoaded = () => self._createTargetBox();
    this.el.addEventListener("model-loaded", this._onModelLoaded);

    if (this.el.hasLoaded) {
      this._createTargetBox();
    }
  },

  _createTargetBox: function () {
    if (this._boxReady) return;
    this._boxReady = true;
  },

  tick: function (time) {
    if (this._grouped) return;
    if (!this._boxReady || !this.el.sceneEl) return;
    if (time - this._lastCheck < this.data.checkMs) return;
    this._lastCheck = time;

    if (!this.el.object3D) return;
    this.el.object3D.getWorldPosition(this._zoneCenter);
    this._zoneCenter.y += this._zoneYOffset;
    this._zoneBox.setFromCenterAndSize(this._zoneCenter, this._zoneSize);

    this._tempList.length = 0;
    this._tempMap = {};
    let closestByType = {};

    let interactables = this.el.sceneEl.querySelectorAll(".interactable");
    for (let i = 0; i < interactables.length; i++) {
      let ent = interactables[i];
      if (ent === this.el) continue;
      if (!ent.object3D) continue;

      this._tempBox.setFromObject(ent.object3D);
      if (!this._zoneBox.intersectsBox(this._tempBox)) continue;

      let rawId = ent.getAttribute("id");
      let label = rawId
        ? rawId.replace(/-clone-.+$/, "")
        : ent.getAttribute("item-type");
      if (!label) label = ent.tagName.toLowerCase();
      this._tempList.push(label);
      this._tempMap[label] = true;

      if (this._expectedMap[label]) {
        ent.dataset.plateLabel = label;
        ent.object3D.getWorldPosition(this._tempPos);
        let dist = this._tempPos.distanceTo(this._zoneCenter);
        if (!closestByType[label] || dist < closestByType[label].dist) {
          closestByType[label] = { el: ent, dist: dist };
        }
      }
    }

    let listChanged = this._hasListChanged(this._tempMap);
    this._items = this._tempList.slice();
    this._itemsMap = this._cloneMap(this._tempMap);

    let nextBurgerEntities = [];
    for (let k = 0; k < this._expectedIngredients.length; k++) {
      let expected = this._expectedIngredients[k];
      if (closestByType[expected]) {
        nextBurgerEntities.push(closestByType[expected].el);
      }
    }
    this._setBurgerEntities(nextBurgerEntities);

    this._checkOrderCompletion(time);
    if (!this._orderComplete) {
      this._readyToSubmit = false;
      this._readyShown = false;
      if (listChanged) this._updateDebug();
      return;
    }

    const v = this.validateBurgerNow();
    if (!v.ok) {
      this._readyToSubmit = false;
      this._readyShown = false;
      if (listChanged) this._updateDebug();
      return;
    }

    if (this._isBurgerStable(time)) {
      this._readyToSubmit = true;

      if (!this._readyShown) {
        window.XRDebug?.log?.("BURGER IS READY:", v.current);
        this._readyShown = true;
        
        // Auto-submit the burger after a brief delay to ensure stability
        setTimeout(() => {
          this.submitBurger();
        }, 500);
      }
    } else {
      this._readyToSubmit = false;
      this._readyShown = false;
    }

    if (listChanged) this._updateDebug();
  },

  _updateDebug: function () {
    if (!this._items.length) {
      window.XRDebug?.set?.("Plate zone: empty");
      console.log("Plate zone: empty");
    } else {
      let msg = "Plate zone:\n- " + this._items.join("\n- ");
      if (this._orderComplete) msg += "\n\n✓ ORDER IS DONE!";
      window.XRDebug?.set?.(msg);
      console.log(
        "Plate zone:",
        this._items,
        this._orderComplete ? "- ORDER IS DONE!" : "",
      );
    }
  },

  _checkOrderCompletion: function (time) {
    let found = 0;
    for (let i = 0; i < this._expectedIngredients.length; i++) {
      if (this._itemsMap[this._expectedIngredients[i]]) {
        found++;
      }
    }

    let wasComplete = this._orderComplete;
    this._orderComplete = found === this._expectedIngredients.length;

    if (this._orderComplete && !wasComplete) {
      window.XRDebug?.log?.("All ingredients in zone!");
    }

    if (!this._orderComplete) {
      this._stableSince = null;
      this._lastPositions = new Map();
    }
  },

  _isBurgerStable: function (time) {
    if (this._burgerEntities.length !== this._expectedIngredients.length) {
      this._stableSince = null;
      this._lastPositions = new Map();
      return false;
    }

    if (this.el?.dataset?.isGrabbed === "true") {
      this._stableSince = null;
      this._lastPositions = new Map();
      return false;
    }

    let moving = false;
    let nextPositions = new Map();

    for (let i = 0; i < this._burgerEntities.length; i++) {
      let ent = this._burgerEntities[i];
      if (!ent?.object3D) {
        moving = true;
        continue;
      }
      if (ent.dataset?.isGrabbed === "true") {
        moving = true;
        continue;
      }
      let pos = new THREE.Vector3();
      ent.object3D.getWorldPosition(pos);
      nextPositions.set(ent, pos);

      let last = this._lastPositions.get(ent);
      if (last && pos.distanceToSquared(last) > this._movementEpsilonSq) {
        moving = true;
      }
    }

    this._lastPositions = nextPositions;

    if (moving) {
      this._stableSince = null;
      return false;
    }

    if (!this._stableSince) {
      this._stableSince = time;
      return false;
    }

    return time - this._stableSince >= 3000;
  },

  _setBurgerEntities: function (nextList) {
    let changed = this._burgerEntities.length !== nextList.length;
    if (!changed) {
      for (let i = 0; i < nextList.length; i++) {
        if (this._burgerEntities[i] !== nextList[i]) {
          changed = true;
          break;
        }
      }
    }

    this._burgerEntities = nextList;

    if (changed) {
      this._stableSince = null;
      this._lastPositions = new Map();
    }
  },

  _hasListChanged: function (nextMap) {
    let key;
    for (key in nextMap) {
      if (!this._itemsMap[key]) return true;
    }
    for (key in this._itemsMap) {
      if (!nextMap[key]) return true;
    }
    return false;
  },

  _cloneMap: function (map) {
    let out = {};
    let key;
    for (key in map) out[key] = true;
    return out;
  },
  validateBurgerNow: function () {
    if (
      !this._burgerEntities ||
      this._burgerEntities.length !== this._expectedIngredients.length
    ) {
      return { ok: false, reason: "missing ingredients" };
    }

    const items = this._burgerEntities.slice().filter(Boolean);
    const tmp = new THREE.Vector3();
    items.sort((a, b) => {
      a.object3D.getWorldPosition(tmp);
      const ay = tmp.y;
      b.object3D.getWorldPosition(tmp);
      const by = tmp.y;
      return ay - by;
    });

    const current = items.map((ent) => {
      const rawId = ent.getAttribute("id");
      return rawId
        ? rawId.replace(/-clone-.+$/, "")
        : ent.getAttribute("item-type") || "";
    });

    const expected = this._expectedIngredients.slice();

    for (let i = 0; i < expected.length; i++) {
      if (current[i] !== expected[i]) {
        return { ok: false, reason: `wrong order at ${i}`, current, expected };
      }
    }

    return { ok: true, current, expected };
  },
  consumeBurger: function () {
    const ents = (this._burgerEntities || []).slice();
    for (const e of ents) {
      if (e && e.parentNode) e.parentNode.removeChild(e);
    }

    this._burgerEntities = [];
    this._items = [];
    this._itemsMap = {};
    this._orderComplete = false;
    this._stableSince = null;
    this._lastPositions = new Map();
    this._readyToSubmit = false;
    this._readyShown = false;

    window.XRDebug?.set?.("Plate zone: empty");
  },

  submitBurger: function () {
    if (!this._readyToSubmit) {
      window.XRDebug?.log?.("Burger not ready yet!");
      return;
    }

    // Mapper les IDs aux noms du système
    const idToName = {
      "bunBottom": "bun_bottom",
      "bunTop": "bun_top",
      "patty": "patty",
      "cheese": "cheese",
      "tomato": "tomato",
      "onion": "onion"
    };

    // Récupérer la validation actualisée
    const validation = this.validateBurgerNow();
    if (!validation.ok) {
      window.XRDebug?.log?.("Invalid burger order!");
      return;
    }

    // Convertir les IDs actuels en noms du système
    const playerIngredients = validation.current.map(rawId => {
      const name = idToName[rawId];
      if (!name) {
        console.warn("Unknown ingredient ID:", rawId);
        return rawId.toLowerCase();
      }
      return name;
    });

    console.log("Player burger:", playerIngredients);

    // Chercher une TV avec recipe-display
    const activeOrders = document.querySelectorAll('.active-order');
    let matched = false;

    for (const tvEl of activeOrders) {
      const recipeDisplay = tvEl.components && tvEl.components['recipe-display'];
      if (!recipeDisplay) continue;

      const targetRecipe = recipeDisplay.getRecipe();
      const targetIngredients = targetRecipe.map(item => item.type);

      console.log("Target recipe:", targetIngredients);

      // Utiliser la fonction unifiée de comparaison
      if (window.ScoreManager) {
        const comparison = window.ScoreManager.compareRecipes(playerIngredients, targetIngredients);
        
        if (comparison.matched) {
          window.XRDebug?.log?.("✓ BURGER MATCHES RECIPE PERFECTLY!");
          
          // Valider et calculer les points
          window.ScoreManager.validateOrder(playerIngredients, tvEl);
          
          // Consommer le burger
          this.consumeBurger();
          matched = true;
          break;
        } else {
          window.XRDebug?.log?.(`❌ Recipe mismatch: ${comparison.reason}`);
        }
      }
    }

    if (!matched) {
      window.XRDebug?.log?.("❌ No matching recipe found");
    }
  },

  remove: function () {
    this.el.removeEventListener("model-loaded", this._onModelLoaded);
  },
});
