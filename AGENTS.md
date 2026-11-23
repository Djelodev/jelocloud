# Jelo Cloud

- Le contenu pédagogique se trouve dans `src/lib/labs.ts`. Les scénarios, solutions et contrôles par jour se trouvent dans `src/lib/labs/`.
- Le moteur dans `src/lib/engine/` simule des hôtes isolés dans le navigateur. Le bouton **Vérifier** contrôle l’état des ressources sur les hôtes cibles.
- La progression est dans le localStorage du navigateur.
- L’application utilise TanStack Start et Nitro. Le déploiement se fait depuis GitHub vers Vercel.
- Laisse TanStack Start générer `src/routeTree.gen.ts`.
