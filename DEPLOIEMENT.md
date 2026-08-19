# Tester et déployer

## 1. Tester en local

```bash
git clone <dépôt>
cd AirbusIATool
git checkout claude/certification-copilot-integration-vpw2fo
npm install          # installe les dépendances et copie le worker pdf.js dans public/
npm run dev          # http://localhost:3000
```

Chaque module a un bouton **« Charger l'exemple fictif »** : rien à fournir pour que la
démonstration se déroule.

**Parcours de démonstration en 4 minutes :**

| | Action | Ce qu'il faut regarder |
| --- | --- | --- |
| 1 | Onglet 1 → *Charger l'ACP fictif* | 24 exigences extraites d'un plan de 5 pages, avec page, section et moyens de conformité |
| 2 | Onglet 2 | 24 trames générées, MoC reprise de l'ACP, champs de jugement laissés en `[A REDIGER]` |
| 3 | Onglet 3 → charger les **deux** exemples, puis *Vérifier les renvois* | Chapitre 7.2 inexistant, titre du 4.3.2 divergent, issue citée obsolète |
| 4 | Onglet 4 → *Coversheet fictive (défauts)* | Champ Programme absent, approbateur = rédacteur, date future |
| 5 | Onglet 5 → *Charger le registre fictif* | 92 % de couverture ; cocher l'option de granularité → 96 % |

Vérifier que la logique tient :

```bash
npm test             # 103 tests, dont l'intégration sur les vrais PDF fictifs
```

## 2. Vercel

Oui, sans configuration. Vercel détecte Next.js tout seul.

```
Importer le dépôt → Framework: Next.js (auto) → Deploy
```

Aucune variable d'environnement, aucune base de données, aucun secret : l'application
n'a pas de route serveur.

**Ce qui est vrai et ce qui ne l'est pas.** Le traitement documentaire s'exécute dans le
navigateur : un PDF ouvert dans l'outil ne transite pas vers Vercel et n'y est pas
stocké. Ce que voit l'hébergeur, ce sont les requêtes de chargement de la page et de ses
fichiers — adresse IP, horodatage, navigateur — pas le contenu des documents.

En revanche, une page hébergée est servie par un tiers, et le code servi peut être modifié
par qui contrôle le déploiement. La garantie « rien ne sort du poste » repose donc sur la
confiance dans le code servi. C'est acceptable pour une démonstration sur données
fictives ; ce n'est pas l'argument à porter devant l'IT pour des documents réels.

> **Règle à tenir : le déploiement Vercel reste sur données fictives.** Il sert à montrer
> l'outil, pas à traiter des documents de programme.

## 3. Export statique — le mode à présenter à l'IT

L'application n'ayant aucune route serveur, elle se construit aussi en fichiers inertes :

```bash
npm run build:static     # produit out/ (~2,4 Mo)
npm run serve:static     # http://localhost:3210 pour vérifier
```

`out/` ne contient que du HTML, du JavaScript, du CSS et les PDF d'exemple. Il se sert
depuis n'importe quel serveur de fichiers interne, un partage réseau derrière un serveur
statique, ou une image applicative interne.

Ce mode change la nature de la conversation avec l'IT :

- **il n'y a aucun serveur applicatif**, donc aucun endroit où un document pourrait
  transiter, être journalisé ou être stocké ;
- **le contenu servi est figé et vérifiable** : on peut le relire, le hacher, le
  soumettre à validation, et il ne change pas tant qu'on ne redéploie pas ;
- **aucun appel sortant** n'est nécessaire au fonctionnement.

Le mode statique a été vérifié de bout en bout : les cinq modules produisent des
résultats identiques au mode serveur, sans erreur console (`scripts/smoke.mjs`).

## 4. Récapitulatif

| Mode | Commande | Usage |
| --- | --- | --- |
| Local | `npm run dev` | Développement, mise au point |
| Vercel | import du dépôt | Démonstration à distance, **données fictives uniquement** |
| Statique | `npm run build:static` | Le mode à instruire avec l'IT pour un usage réel |
