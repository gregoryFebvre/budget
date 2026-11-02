# Budget

Application de gestion budgétaire personnelle, **100 % dans le navigateur** : React, Vite, TypeScript strict.
Aucun serveur, aucun compte, aucune base distante, aucun appel à une API externe, aucun suivi d'utilisation.

- Tableau annuel (revenus, dépenses fixes, dépenses ponctuelles, épargne) avec saisie directe dans les cellules.
- **Pointage bancaire** mensuel et ligne **« Reste à provisionner »** recalculée instantanément.
- Plusieurs années, copie de structure, gestion des éléments, catégories transversales et familles.
- Sauvegarde / import JSON (remplacement ou fusion déterministe).
- Statistiques et graphiques comparant les années.

> **Confidentialité : ce dépôt est public, vos données ne le sont pas.** Le code ne contient aucune donnée budgétaire.
> Vos montants restent dans le `localStorage` de votre navigateur. Ne versionnez jamais un fichier de sauvegarde.

## Prérequis

- **Node.js ≥ 22.22** (ou 24.15+) et npm. (Vite seul accepte Node 20.19+, mais les tests utilisent `jsdom` qui exige Node 22.22+.)
- Git, pour le déploiement.

## Commandes

```bash
npm install            # installer les dépendances
npm run dev            # développement : http://localhost:5173
npm test               # tests (Vitest + React Testing Library)
npm run test:watch     # tests en continu
npm run typecheck      # vérification TypeScript strict
npm run check:privacy  # contrôle de confidentialité avant publication
npm run build          # build de production dans dist/
npm run preview        # prévisualiser le build : http://localhost:4173/budget/
```

`npm run build` vérifie d'abord les types. Le build est configuré pour être servi sous `/budget/` ; pour un autre chemin :
`BASE_PATH=/mon-depot/ npm run build` (le chemin doit commencer et finir par `/`) ; relancez `npm run preview` avec la
même variable (`BASE_PATH=/mon-depot/ npm run preview`) pour que la prévisualisation serve les mêmes chemins.

## Déploiement sur GitHub Pages

1. Créez un dépôt GitHub **public** (par exemple `budget`).
2. Vérifiez qu'aucune donnée personnelle ne sera publiée : `npm run check:privacy`.
3. Poussez le code (la branche doit s'appeler `main`) :
   ```bash
   git remote add origin https://github.com/<utilisateur>/budget.git
   git push -u origin main
   ```
4. Sur GitHub : **Settings → Pages → Build and deployment → Source : « GitHub Actions »**.
5. Le workflow `.github/workflows/deploy.yml` s'exécute à chaque push : installation figée (`npm ci`), contrôle de
   confidentialité, typecheck, tests, build avec `BASE_PATH=/<nom-du-dépôt>/`, puis publication. Sur une pull request,
   seuls les contrôles tournent (pas de déploiement).
6. L'application est disponible sur `https://<utilisateur>.github.io/<nom-du-dépôt>/`.

Le workflow ne publie que le dossier `dist/` produit à partir du code source : il ne peut contenir ni sauvegarde JSON ni
fichier Excel, car ceux-ci sont exclus par `.gitignore` **et** refusés par `npm run check:privacy` (exécuté deux fois : sur
le code, puis sur le bundle produit).

## Organisation du code

```
src/
  domain/    types, constantes, calculs, mutations, statistiques, démo FICTIVE — aucun React, aucun stockage
  schema/    validation Zod, migrations de version, contrôles d'intégrité
  storage/   localStorage : lecture validée, écriture vérifiée, copie de secours
  backup/    export JSON, lecture/validation d'import, fusion déterministe
  store/     état de l'application (Zustand) et orchestration de la persistance
  ui/        composants React (tableau, gestion, statistiques, import, paramètres)
  tests/     tests unitaires et d'interface (données fictives uniquement)
scripts/     check-privacy.mjs
```

Les calculs métier sont des fonctions pures dans `src/domain`, testables sans interface.

## Modèle de données (schéma v1)

Documenté dans `src/domain/types.ts`. Principes :

| Concept | Rôle |
|---|---|
| **Famille** | 4 familles fixes : `revenus`, `depenses_fixes`, `depenses_ponctuelles`, `epargne` (seul le libellé est modifiable). |
| **Catégorie** | Transversale (peut regrouper des éléments de plusieurs familles), archivable, ordonnée. |
| **Élément** | Une ligne du tableau, avec un **identifiant stable** : renommer ou reclasser ne perd pas l'historique. |
| **Année** | Sa **structure** (éléments présents) et ses **valeurs** (montants + pointage). |
| **Cellule** | `{ amount, checked? }`. Cellule absente = non renseigné ; `amount: 0` = zéro saisi explicitement. |

- Les montants sont des **entiers en centimes** (aucune erreur d'arrondi).
- Rien de calculé n'est stocké : totaux, soldes et « reste à provisionner » sont recalculés.
- Le pointage est propre à (élément, année, mois) et n'est jamais copié lors de la création d'une année.

### Règles de calcul

- Soldes successifs : `après fixes = revenus − fixes` ; `après ponctuelles = … − ponctuelles` ; `après épargne = … − épargne`.
- **Reste à provisionner** = montants renseignés **non pointés** des dépenses fixes, ponctuelles **et de l'épargne**
  (les virements d'épargne sortent du compte courant).
- **Revenus restant à percevoir** = revenus renseignés non pointés ; **solde prévisionnel** = revenus restants − reste à provisionner.
- L'épargne n'est jamais comptée comme dépense de consommation dans les statistiques.
- Statistiques : base au choix **prévu** ou **pointé** ; un pourcentage dont la référence est nulle est affiché
  « non calculable » ; un élément absent d'une année est signalé « absent » (≠ 0).

## Persistance

- Toute modification validée est écrite immédiatement dans le `localStorage` (clé `budget:data`) et **relue pour vérification**.
  L'indicateur « Enregistré » n'apparaît que si l'écriture a réussi ; sinon un bandeau d'alerte s'affiche (quota dépassé, stockage bloqué…).
- Une copie de l'état précédent est gardée (`budget:data:previous`) : si les données principales sont illisibles, elle est restaurée
  et une copie brute des données illisibles est conservée. Si tout est illisible, aucun écrasement : écran de récupération
  (téléchargement des données brutes avant tout choix).
- Un fichier de données d'une **version plus récente** est refusé ; les versions plus anciennes passent par des migrations explicites.
- Un compteur de révision détecte une modification faite dans **un autre onglet** : l'application refuse d'écraser et demande de recharger.

### Limites du stockage local

- Les données sont conservées **dans le navigateur et le profil utilisés** ; elles ne sont **pas** synchronisées entre appareils ou navigateurs.
- Elles peuvent être **perdues** si le stockage du navigateur est effacé (nettoyage, navigation privée, réinitialisation).
- Le `localStorage` **n'est pas chiffré** : une personne ayant accès au même profil de navigateur peut potentiellement les lire.
- Capacité d'environ 5 Mo selon les navigateurs (largement suffisante pour un budget, indiquée dans *Paramètres*).
- **Le fichier JSON est la seule sauvegarde externe.** L'application n'en crée aucune automatiquement : pensez à utiliser *Sauvegarder*.

## Sauvegarde et restauration (JSON)

- **Sauvegarder** télécharge `budget-backup-AAAA-MM-JJ.json` (date réelle de l'export) : toutes les années, catégories,
  éléments, montants, pointage et paramètres.
- **Importer** lit et valide le fichier (JSON, format, version, schéma, intégrité des relations, clés dangereuses), affiche un
  résumé, puis demande une confirmation. **Rien n'est modifié avant** ; en cas d'échec, les données restent intactes.
  - *Remplacement complet* : propose de télécharger d'abord vos données actuelles.
  - *Fusion* : fondée sur les identifiants stables. Ajoute ce qui manque, ignore l'identique, **liste tous les conflits**
    (montant, pointage, libellé…) ; vos valeurs sont conservées par défaut, vous pouvez préférer celles du fichier.
    Limites : la fusion n'efface jamais rien (une suppression faite d'un seul côté n'est pas propagée) ; les éléments
    sont rapprochés par identifiant, les catégories par identifiant puis par libellé.

## Sécurité et confidentialité

- Aucune requête réseau dans le code ; le build de production impose une politique CSP `connect-src 'none'`.
- Aucun analytics, aucune télémétrie, aucun service externe de sauvegarde, aucun secret dans le code.
- Les imports sont validés (Zod) et refusent les clés dangereuses (`__proto__`…) ; l'évaluation des saisies (`=105+188`)
  passe par un analyseur dédié, jamais par `eval`.
- Les jeux de démonstration et de test sont **entièrement fictifs** (libellés « (démo) »).
- `.gitignore` exclut sauvegardes, tableurs, fichiers d'environnement et répertoires générés ; `npm run check:privacy`
  refuse en plus tout JSON ayant la forme d'une sauvegarde, tout secret manifeste et tout appel réseau.

## Accessibilité

Navigation au clavier dans le tableau (flèches ; Entrée/F2 pour éditer ; Échap annule), pointage par case à cocher
accessible (jamais uniquement par la couleur), lien d'évitement, graphiques avec nom accessible et tableau de données.

## Licence

Aucune licence n'est fournie : à vous de choisir celle qui convient avant de publier le dépôt.
