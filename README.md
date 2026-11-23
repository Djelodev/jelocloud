# Jelo Cloud

Parcours de 100 labs DevOps en français avec un terminal simulé dans le navigateur. Le bouton **Vérifier** contrôle l’état des ressources du lab. La progression est enregistrée dans le navigateur.

## Développement local

Avec Node.js 22.12 ou supérieur et Bun, installe les dépendances puis démarre le serveur.

```sh
bun install --frozen-lockfile
bun run dev
```

Ouvre [http://localhost:8080](http://localhost:8080).

```sh
bun run test
bun run build
```

## Déploiement sur Vercel

Importe le dépôt `Djelodev/jelocloud` dans Vercel. Le fichier `vercel.json` sélectionne TanStack Start et Nitro détecte l’environnement Vercel au build. L’application ne nécessite aucune variable d’environnement pour les labs.
