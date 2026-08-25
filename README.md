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
| 1. Plan de certification | Structurer l'information d'un ACP / OCP de plusieurs centaines de pages | Liste des exigences citées (CS-25, AMC, SC, CRI, ESF) avec page, section et moyens de conformité — export CSV |
| 2. Trames de coversheets | Mettre en place la trame à partir des exigences EASA citées | Une trame par exigence, en-tête pré-rempli, MoC reprise de l'ACP, documents de substantiation attendus — export Markdown |
| 3. Cohérence des renvois | Vérifier qu'un chapitre cité correspond bien au contenu | Contrôle de chaque renvoi contre la structure réelle du PDF fourni : chapitre inexistant, titre divergent, issue obsolète |
| 4. Contrôle des en-têtes | Compléter et vérifier les données des premières lignes | Champs manquants, format de référence, date, ATA, programme, codes MoC, séparation rédacteur / approbateur |
| 5. Recoupement ACP ↔ coversheets | Croiser les exigences de l'ACP avec les coversheets émises | Exigences non couvertes, coversheets hors plan, doublons, MoC divergents, taux de couverture — export CSV |

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

`smoke-legacy.mjs` supprime `Promise.withResolvers` avant tout chargement de script
pour simuler un iPhone antérieur à iOS 17.4, et vérifie que la lecture de PDF fonctionne
quand même. C'est ce qui manquait quand le build par défaut de pdf.js a été livré : il
appelle cette API sans repli et le chargement échouait sur ces appareils.

### Pourquoi le build « legacy » de pdf.js

`lib/pdf.ts` charge `pdfjs-dist/legacy/build/pdf.mjs`, et `scripts/copy-pdf-worker.mjs`
copie le worker legacy correspondant. Un polyfill posé dans le thread principal ne suffit
pas : **le worker pdf.js s'exécute dans un scope séparé** qu'il n'atteint pas. Seul le
build legacy, transpilé et polyfillé des deux côtés, corrige le problème — vérifié en
reproduisant la panne puis en la levant.

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
