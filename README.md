# Outillage des tâches de certification — ATA 27

Prototype d'assistance à la rédaction des documents de certification. Il automatise cinq
tâches chronophages à faible valeur ajoutée, **sans** rédiger le contenu technique à la
place des ingénieurs de certification.

> **Toutes les données de ce dépôt sont fictives.** Les références documentaires, les noms
> et les résultats d'analyse sont inventés pour la démonstration. Aucune donnée de
> programme réel n'y figure.

## Ce que fait l'outil

| Module | Tâche automatisée | Ce que produit l'outil |
| --- | --- | --- |
| 1. Plan de certification | Structurer l'information d'un ACP / OCP de plusieurs centaines de pages | Liste des exigences citées (CS-25, JAR-25, AMC, SC, CRI, ESF) avec page, section et moyens de conformité — export CSV |
| 2. Préparer une coversheet | Monter la coversheet d'un document de certification | On désigne le document et on coche les exigences à couvrir ; l'outil restitue la rédaction mémorisée pour chaque combinaison, `§x.x` à pointer — export Markdown |
| Paramètres | Tenir la bibliothèque de blocs types | Modèle Excel à télécharger, à compléter et à recharger : par famille de coversheet, quelles exigences vont ensemble et la rédaction qui leur correspond |
| 3. Cohérence des renvois | Vérifier qu'un chapitre cité correspond bien au contenu | Contrôle de chaque renvoi contre la structure réelle du PDF fourni : chapitre inexistant, titre divergent, issue obsolète |
| 4. Recoupement ACP ↔ coversheets | Croiser les exigences de l'ACP avec les documents qui les couvrent | Exigences non couvertes, couvertures hors plan, doublons, MoC divergents, taux de couverture — export CSV |

### Une coversheet couvre un document, pas une exigence

Le tableau de conformité de l'ACP rattache chaque exigence à un document de certification.
On écrit **une coversheet par document**, et elle rassemble toutes les exigences que ce
document traite, groupées par bloc de justification quand elles vont ensemble.

### La rédaction est restituée, jamais inventée

D'un standard au suivant, une coversheet reprend la même rédaction : seuls les paragraphes
cités changent, parce que le document joint a été réédité.

L'onglet **Paramètres** tient une bibliothèque de **blocs types** (`lib/templates.ts`) :
pour chaque famille de coversheet (SyDMP, SSA, VVS…), quelles exigences vont ensemble et
quelle rédaction leur correspond. Les endroits où un chapitre devra être pointé s'écrivent
`§x.x`.

Au moment de préparer une coversheet, l'outil confronte la sélection à cette bibliothèque
et restitue le texte correspondant. **Un bloc type ne s'applique que si toutes ses
exigences sont sélectionnées** : c'est ce qui permet à `{A, B}` et à `{A}` seule d'appeler
deux rédactions différentes. Les blocs les plus larges sont essayés d'abord, sinon `{A}`
consommerait A avant que `{A, B}` n'ait sa chance.

**Ce que l'outil ne fait pas :** désigner les paragraphes à citer. Ils dépendent du contenu
du document joint et relèvent de sa lecture par l'ingénieur. L'outil compte les `§x.x`
restants et les rappelle, sans jamais chercher à les deviner.

### Où vivent les rédactions

Elles ne sont **ni dans le dépôt, ni dans l'application**. Elles vivent dans un classeur
Excel que les équipes remplissent et rechargent à l'ouverture.

L'onglet Paramètres propose le modèle en téléchargement (`public/modele-blocs-types.xlsx`,
produit par `npm run modele`) : une notice, une feuille **Blocs types** à compléter, une
feuille d'exemples fictifs. Une ligne par bloc de justification :

| Famille de coversheet | Exigences | Moyens de conformité | Rédaction | Coversheet source |
| --- | --- | --- | --- | --- |
| SYDMP | CS 25.671(a) ; JAR 25.1301(a) | 0 | The enclosed SyDMP… §x.x… | CVS-SYDMP issue 1 |

Le classeur est lu dans le navigateur (`lib/workbook-browser.ts`) : il ne quitte pas le
poste. La lecture est **indulgente sur la forme** — ordre des colonnes libre, accents et
casse indifférents, séparateurs multiples — et **stricte sur le fond** : toute ligne
rejetée est signalée avec son numéro Excel et sa raison. Un fichier à moitié lu sans que
personne ne le sache serait pire qu'un fichier refusé.

Ce choix répond à une question de gouvernance autant que de technique. Le classeur **est
un document de certification** : il est extrait des coversheets, il a leur classification.
Il se range donc avec elles, dans le référentiel documentaire — pas dans le dépôt de code.

> **Tout ce qui est déposé dans le dépôt est servi par l'hébergeur à qui connaît
> l'adresse.** Un déploiement Vercel n'est pas protégé par défaut. Mettre des rédactions
> réelles dans le dépôt ne revient pas à les mettre dans un GitHub privé : cela revient à
> les publier.

## Positionnement

Trois choix d'architecture, qui répondent aux points de blocage habituels :

**Le moteur est déterministe, pas génératif.** Les cinq contrôles reposent sur de
l'analyse de texte et des règles explicites, couvertes par 103 tests automatisés. À
données identiques, le résultat est identique. L'IA générative n'intervient dans aucune
vérification ; sa place naturelle est en assistance ponctuelle à la reformulation, en
périphérie de l'outil et non dans son moteur.

**Le traitement est intégralement local.** Les PDF sont lus dans le navigateur via
pdf.js (`lib/pdf.ts`), le worker est servi en statique. Aucun téléversement, aucun
stockage serveur, aucun appel à un service externe. Il n'y a donc pas de donnée à rendre
accessible à une plateforme tierce pour faire fonctionner l'outil.

**L'outil ne rédige pas.** Les champs qui relèvent du jugement d'ingénierie — énoncé de
conformité, hypothèses, limitations, choix des documents de substantiation — sont laissés
vides et balisés `[A REDIGER]`. Une trame ne peut pas être émise en l'état par
inadvertance. Les contrôles sont des aides à la relecture : ils ne constituent pas une
démonstration de conformité.

## Démarrage

```bash
npm install          # installe les dépendances et copie le worker pdf.js dans public/
npm run fixtures     # (optionnel) régénère les PDF fictifs
npm run dev          # http://localhost:3000
```

Chaque module dispose d'un bouton **« Charger l'exemple fictif »** : la démonstration
fonctionne sans aucun fichier à fournir.

L'application n'a aucune route serveur, elle se construit donc aussi en fichiers inertes :

```bash
npm run build:static # produit out/, servable depuis n'importe quel serveur de fichiers
```

Voir [DEPLOIEMENT.md](DEPLOIEMENT.md) pour le parcours de démonstration, le déploiement
Vercel et le mode statique à instruire avec l'IT.

## Jeux de données fictifs

`public/fixtures/`, régénérables par `npm run fixtures` :

- `ACP-27-CER-0114_Iss3.pdf` — plan de certification, 5 pages, 24 exigences citées
- `DOC-27-SAF-0142_Iss2.pdf` — dossier de sécurité, structuré en chapitres numérotés
- `CVS-27-FCS-0001_Iss2.pdf` — coversheet comportant des défauts volontaires
- `coversheets-registry.json` — registre des coversheets émises (simule un export du
  référentiel documentaire)

Les défauts sont **introduits volontairement** pour que la démonstration montre des
détections réelles : renvoi vers un chapitre inexistant (§7.2), titre annoncé ne
correspondant pas au chapitre réel (§4.3.2), issue citée obsolète, champ *Programme*
absent, approbateur identique au rédacteur, date d'émission future, exigence du plan sans
coversheet (CS 25.703), coversheet hors plan (CS 25.1329), doublon de couverture
(CS 25.675), MoC incomplets par rapport à l'ACP (CS 25.671).

## Tests

```bash
npm test             # 103 tests : logique métier + intégration sur les PDF réels
```

`tests/integration.test.ts` rejoue la chaîne complète sur les PDF fictifs et vérifie que
**chaque défaut volontaire est bien détecté**. Si une régression casse la démonstration,
ce test tombe avant la réunion.

Deux smoke tests navigateur :

```bash
npm run build && npx next start -p 3210
npm install --no-save playwright
node scripts/smoke.mjs          # enchaînement réel des cinq modules
node scripts/smoke-legacy.mjs   # compatibilité navigateur ancien
```

```bash
node scripts/smoke-noworker.mjs  # worker pdf.js totalement indisponible
```

`smoke-legacy.mjs` supprime `Promise.withResolvers` pour simuler un moteur antérieur à
iOS 17.4. `smoke-noworker.mjs` neutralise à la fois la création de workers de type module
et le chargement réseau du fichier worker, et vérifie que la lecture de PDF aboutit quand
même.

### Repli quand le worker pdf.js ne démarre pas

pdf.js crée son worker avec `new Worker(src, { type: "module" })` — indisponible avant
Safari 15. En cas d'échec, il se rabat sur un import dynamique de l'URL du worker, annoté
`webpackIgnore` : une directive propre à webpack, dépendante du réseau, et **jamais
exercée sur un poste de bureau** où le worker dédié fonctionne toujours.

`lib/pdf.ts` teste donc réellement le support (création d'un worker minimal, attente de
son message) et, s'il manque, enregistre le module worker **embarqué dans le bundle** sous
`globalThis.pdfjsWorker`. Deux contraintes dictent ce fonctionnement :

- l'enregistrement doit précéder la première lecture — pdf.js mémorise le résultat de sa
  mise en place de worker, un enregistrement tardif serait ignoré ;
- il doit rester conditionnel — enregistrer ce module force le mode sans worker de façon
  définitive (`PDFWorker.#initialize`), ce qui figerait l'interface sur un ACP volumineux.

Le même effet mémoire impose l'ordre des étapes de `/diagnostic` : le chemin applicatif est
testé **avant** la chaîne pdf.js brute, sinon celle-ci ferait échouer celui-là.

### Page de diagnostic

`/diagnostic` teste ce que le navigateur sait faire et rejoue la lecture d'un PDF **étape
par étape** (téléchargement, worker, chargement de pdf.js, ouverture du document,
extraction, analyse), avec la pile d'appel complète en cas d'échec. Elle produit un
rapport copiable.

Elle existe parce qu'un échec sur un appareil qu'on n'a pas sous la main se diagnostique
mal à distance : un message minifié tronqué ne suffit pas à identifier la cause, et
corriger au jugé fait perdre un aller-retour à chaque fois.

### Pourquoi le build « legacy » de pdf.js

`lib/pdf.ts` charge `pdfjs-dist/legacy/build/pdf.mjs`, et `scripts/copy-pdf-worker.mjs`
copie le worker legacy correspondant. Ce build embarque les polyfills core-js
(`Promise.withResolvers`, `Object.hasOwn`, `Array.prototype.at`…) côté script comme côté
worker — un polyfill posé dans le thread principal ne suffirait pas, le worker s'exécutant
dans un scope séparé.

`package.json` déclare aussi un `browserslist` explicite (`safari >= 14`, `ios_saf >= 14`).
Sans cette cible, Next compile pour navigateurs récents uniquement et ne transpile pas la
syntaxe moderne du code applicatif.

## Organisation du code

```
lib/
  types.ts         Modèle de données, indépendant des formats de fichier
  requirements.ts  Extraction et normalisation des références réglementaires
  moc.ts           Moyens de conformité EASA MC0..MC9
  parse-acp.ts     Analyse d'un plan de certification
  coversheet.ts    Génération et rendu des trames
  coherence.ts     Structure des documents et contrôle des renvois
  headers.ts       Lecture et contrôle des en-têtes
  crosscheck.ts    Recoupement ACP / coversheets
  registry.ts      Chargement d'un registre de coversheets
  pdf.ts           Extraction PDF côté navigateur
  download.ts      Exports côté navigateur
components/        Interface : un panneau par module
scripts/           Génération des jeux fictifs, smoke test
```

Les parsers convertissent le texte extrait vers les types de `lib/types.ts` ; tout le
reste ne travaille que sur ces structures. Ajouter un format de document en entrée
n'impacte donc pas les contrôles.

## Points ouverts à arbitrer avec les équipes de certification

Ces choix sont paramétrés dans l'outil mais relèvent d'une convention de programme :

1. **Granularité de couverture.** Une coversheet émise sur `CS 25.671` couvre-t-elle
   `CS 25.671(c)(1)` ? Le recoupement expose l'option (désactivée par défaut) et signale
   séparément les couvertures obtenues par héritage.
2. **Format des références documentaires.** Le motif attendu est configurable
   (`DEFAULT_DOC_REF_PATTERN`) ; il faut le caler sur le référentiel réel.
3. **Seuils de comparaison des titres.** `SIMILARITY_OK` et `SIMILARITY_DOUBT`
   déterminent le partage entre « cohérent », « à vérifier » et « non conforme ».
4. **Champs d'en-tête obligatoires** et liste des programmes autorisés.
5. **Les AMC méritent-elles une coversheet propre**, ou sont-elles couvertes par la
   coversheet du paragraphe CS qu'elles éclairent ?
