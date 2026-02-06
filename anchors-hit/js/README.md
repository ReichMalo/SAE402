# 📁 Structure du projet - VR Burger Workshop

## Organisation des fichiers

```
VR/
├── index.html                  # Fichier principal HTML
├── js/
│   ├── components.js           # Point d'entrée (charge tous les composants)
│   ├── grab-controller.js      # Gestion de la saisie des objets (VR/Desktop)
│   ├── infinite-supply.js      # Objets originaux qui créent des clones
│   ├── stackable.js            # Marqueur pour objets empilables
│   └── trash-bin.js            # Système de destruction d'objets
└── assets/
    └── (tous vos modèles 3D et sons)
```

## 📄 Description des composants

### 1. **components.js**
- Point d'entrée principal
- Affiche les logs de chargement
- À importer en premier dans `index.html`

### 2. **grab-controller.js**
- Gère la saisie et le relâchement des objets
- Compatible Desktop (souris) et VR (contrôleurs)
- Détecte les objets "originaux" et crée des clones automatiquement
- Empêche la duplication des clones

**Fonctionnalités:**
- ✅ Clic/Trigger pour saisir
- ✅ Raycasting multi-plateforme
- ✅ Clonage automatique des objets `infinite-supply`
- ✅ Drop avec contraintes de distance et hauteur

### 3. **infinite-supply.js**
- Marque les objets comme "originaux"
- Les originaux restent fixes et créent des clones
- Repositionne automatiquement si déplacé

**Usage:**
```html
<a-entity class="interactable" 
          gltf-model="assets/tomato.glb" 
          item-type="tomato" 
          infinite-supply 
          stackable>
</a-entity>
```

### 4. **stackable.js**
- Marqueur pour objets empilables
- Prêt pour future logique d'empilement

### 5. **trash-bin.js**
- Détruit les objets jetés dans la poubelle
- Détection par rayon (configurable)
- Animation de disparition
- Protège les objets originaux

**Usage:**
```html
<a-entity gltf-model="assets/trash.glb" 
          trash-bin="radius: 0.3; destroyDelay: 500">
</a-entity>
```

**Propriétés:**
- `radius`: Rayon de détection (défaut: 0.3)
- `destroyDelay`: Délai avant destruction en ms (défaut: 500)

## 🔧 Comment ajouter une nouvelle fonctionnalité

### Exemple: Ajouter un composant "cooking"

1. **Créer `js/cooking.js`:**
```javascript
AFRAME.registerComponent('cooking', {
    schema: {
        cookTime: { type: 'number', default: 5000 }
    },
    
    init: function() {
        console.log('🍳 Cooking component initialized');
        // Votre logique ici
    },
    
    // Vos méthodes
});
```

2. **L'ajouter dans `index.html`:**
```html
<script src="js/cooking.js"></script>
```

3. **Mettre à jour `components.js`:**
```javascript
console.log('  - cooking: Système de cuisson');
```

4. **Utiliser dans une entité:**
```html
<a-entity gltf-model="assets/pan.glb" 
          cooking="cookTime: 10000">
</a-entity>
```

## 🎯 Avantages de cette structure

- ✅ **Modulaire**: Chaque composant dans son propre fichier
- ✅ **Maintenable**: Facile de trouver et modifier du code
- ✅ **Réutilisable**: Les composants peuvent être utilisés indépendamment
- ✅ **Extensible**: Ajoutez de nouveaux fichiers sans toucher aux existants
- ✅ **Debuggable**: Logs clairs pour chaque composant

## 🚀 Prochaines étapes possibles

- [ ] Composant `cooking` pour la cuisson des steaks
- [ ] Composant `burger-assembly` pour valider les burgers
- [ ] Composant `scoring` pour le système de points
- [ ] Composant `timer` pour les défis chronométrés
- [ ] Composant `sauce-dispenser` pour ketchup/moutarde
- [ ] Composant `physics` pour collision réaliste

## 📝 Notes importantes

- **Ordre de chargement**: Toujours charger A-Frame en premier, puis vos composants
- **Objets originaux**: Utilisez `infinite-supply` pour les ingrédients fixes
- **Objets destructibles**: N'utilisez PAS `infinite-supply` sur les clones
- **Poubelle**: Ne mettez pas `class="interactable"` sur la poubelle

