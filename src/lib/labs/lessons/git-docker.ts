import { lesson as l, type Lesson } from "./types";

export const gitDockerLessons: Record<number, Lesson> = {
  21: l(
    "Un dépôt bare héberge l’historique et les références Git sans arbre de travail. C’est un bon point de partage pour plusieurs clones.",
    "/opt/cluster.git est un dépôt bare sur ststor01.",
    "Sur une forge, la création d’un dépôt distant prépare ce rôle. Sur un poste de travail, git init sans --bare ajoute l’arbre de travail.",
    "N’édite pas directement les objets Git du dépôt partagé. Fais tes modifications dans un clone.",
  ),
  22: l(
    "Le clone crée une copie locale de l’historique, extrait la branche par défaut et renseigne généralement le remote origin.",
    "Le sous-dossier beta apparaît dans /usr/src/kodekloudrepos et contient le dépôt cloné.",
    "Suppose que tu veux l’appeler beta-local. Sur Git, ajoute ce nom en dernier argument de git clone.",
    "Place-toi dans le bon dossier parent et contrôle la source avant de cloner.",
  ),
  23: l(
    "Un fork sur la forge copie le projet dans un espace où tu peux publier tes propres branches. Un clone crée la copie de travail sur ton poste.",
    "La forge simulée associe un fork de sarah/story-blog au compte jon.",
    "Sur une vraie instance Gitea, le bouton Fork propose le même flux. Un clone local seul ne crée aucun fork sur la forge.",
    "Garde le dépôt original comme remote upstream si tu dois récupérer ses mises à jour. Réserve les mots de passe affichés au lab.",
  ),
  24: l(
    "Une branche est une référence vers un commit. La créer ajoute ce pointeur à partir du commit courant et permet ensuite d’avancer séparément.",
    "La branche xfusioncorp_apps existe et, juste après sa création, pointe sur le même commit que master.",
    "git switch -c xfusioncorp_apps exprime la même intention pour les versions récentes de Git.",
    "Contrôle le commit de départ et donne à la branche un nom lié au travail prévu.",
  ),
  25: l(
    "La zone d’index sélectionne le contenu du commit. Le merge intègre ensuite ce commit dans master, et push publie la branche.",
    "index.html apparaît dans le commit de devops et dans l’historique de master sur origin.",
    "Une pull request peut remplacer la fusion directe et ajouter une revue. Si master a avancé, un merge peut créer un commit de fusion ou nécessiter une résolution.",
    "Contrôle git status puis git diff --staged sur un vrai dépôt avant de committer.",
  ),
  26: l(
    "Un remote donne un nom court à une destination. Ajouter dev_cluster permet d’envoyer la même branche vers un autre dépôt.",
    "git remote -v affiche dev_cluster, et la référence master existe dans le deuxième dépôt.",
    "git remote set-url change l’adresse d’un alias existant. Ici on conserve origin et on ajoute un autre alias.",
    "Vérifie l’URL exacte et la branche cible avant de publier sur un remote supplémentaire.",
  ),
  27: l(
    "revert crée un nouveau commit qui inverse les changements du commit ciblé. L’historique partagé reste lisible.",
    "L’historique contient le commit initial puis un commit qui annule son effet.",
    "Pour une modification locale encore non publiée, d’autres outils comme reset peuvent s’appliquer selon l’intention.",
    "Sur une branche partagée, privilégie revert. Examine le diff du commit à annuler et vérifie les conflits éventuels.",
  ),
  28: l(
    "cherry-pick rejoue le changement d’un commit sélectionné sur la branche courante. Il ne fusionne pas toute la branche source.",
    "master reçoit le changement de la pointe de feature, puis origin reçoit la branche mise à jour.",
    "Tu peux fournir un identifiant de commit relevé dans git log au lieu de feature. C’est plus précis si la branche source continue d’avancer.",
    "Vérifie les dépendances du commit choisi. Un changement isolé peut supposer des fichiers introduits par des commits antérieurs.",
  ),
  29: l(
    "La pull request est une proposition entre deux branches. La publication de la branche, la demande de revue et la fusion sont des actions différentes.",
    "La demande vise master, désigne sarah comme relectrice et finit fusionnée dans la forge simulée.",
    "Sur une forge réelle, ouvre et relis la demande dans l’interface. L’identifiant 1 correspond seulement à cette session de lab.",
    "Décris le but du changement et les tests réalisés. Utilise une branche et des comptes de test pour l’exercice.",
  ),
  30: l(
    "reset --hard déplace la branche et remet l’index ainsi que les fichiers suivis à l’état du commit choisi. Un push forcé propage cette réécriture.",
    "master est revenu trois commits en arrière localement et sur le dépôt distant simulé.",
    "Sur une branche partagée, revert est souvent préférable. Si une réécriture est approuvée sur un dépôt réel, git push --force-with-lease offre un contrôle supplémentaire.",
    "Crée une référence de sauvegarde avant un reset destructif et confirme la branche, le remote et le commit cible.",
  ),
  31: l(
    "Le stash met provisoirement de côté des changements. apply réintroduit ceux d’une entrée sans enlever cette entrée de la liste.",
    "Les modifications du deuxième stash ont été intégrées à un commit et publiées.",
    "git stash pop tente d’appliquer l’entrée puis de la retirer en cas de réussite. apply te laisse vérifier avant de supprimer l’entrée.",
    "Lis git stash list avant de choisir un index. Vérifie les changements avant git add ., qui prépare les modifications du dossier courant.",
  ),
  32: l(
    "Le rebase rejoue les commits de feature sur la pointe actuelle de master. Les commits rejoués reçoivent de nouveaux identifiants.",
    "La nouvelle pointe de feature descend de master, et le dépôt distant contient cette version réécrite.",
    "Un merge intègre master sans réécrire les commits de feature. Sur une branche personnelle déjà publiée, une réécriture coordonnée peut utiliser --force-with-lease.",
    "Évite le rebase d’une branche utilisée par d’autres sans coordination. Confirme la branche active avant de lancer l’opération.",
  ),
  33: l(
    "Git laisse un conflit quand les deux historiques changent la même zone. Le fichier doit contenir la décision de fusion avant que l’index marque le conflit résolu.",
    "story-index.txt conserve les contributions Local et Remote. La fusion se retrouve ensuite sur le dépôt distant.",
    "Un éditeur de fusion peut comparer les versions. git merge --abort permet de revenir au point de départ si tu veux abandonner la fusion.",
    "Relis le fichier final à la recherche de marqueurs de conflit et lance les tests avant le commit.",
    {
      "story-index.txt":
        "Le fichier résolu garde l’en-tête Stories et les deux lignes utiles. Supprime les lignes de séparation générées par Git.",
    },
  ),
  34: l(
    "Un hook est un script déclenché par Git. post-update tourne côté dépôt receveur après la mise à jour des références.",
    "Le push sur master déclenche le hook et le tag release sur le dépôt distant.",
    "Sur une forge hébergée, une règle CI sur un push de branche est souvent plus adaptée qu’un accès direct aux hooks du serveur.",
    "Teste les hooks sur un dépôt isolé. En production, préfère souvent des tags de version immuables à un tag déplacé.",
    {
      "/home/thor/project.git/hooks/post-update":
        "Le shebang choisit sh. Le script inspecte le premier argument, une référence reçue. || lance git tag quand le test « différent de master » échoue. -f permet de déplacer le tag release.",
    },
  ),
  35: l(
    "Le dépôt de paquets indique à yum où trouver Docker. Le paquet moteur, le plugin Compose et le service systemd jouent chacun un rôle.",
    "docker version montre un client capable de joindre le moteur Docker.",
    "Sur une autre distribution, suis le guide officiel de son gestionnaire de paquets. Docker rootless peut convenir à certains usages.",
    "Utilise un dépôt de confiance et limite l’accès au socket Docker. L’accès au moteur donne souvent des droits élevés sur l’hôte.",
  ),
  36: l(
    "Une image est le modèle utilisé au lancement. Le conteneur est l’instance qui s’exécute à partir de cette image.",
    "docker ps liste nginx_1 en cours d’exécution avec l’image nginx:alpine.",
    "Lance sans -d pour voir la sortie dans le terminal. Si le processus s’arrête, docker ps -a et docker logs sont de bons points de départ.",
    "Attribue un nom descriptif au conteneur. En production, fixe une version ou un digest d’image.",
  ),
  37: l(
    "docker cp transfère des fichiers entre l’hôte et le système de fichiers d’un conteneur. docker exec permet de vérifier le résultat dedans.",
    "ls /opt exécuté dans ubuntu_latest affiche nautilus.txt.gpg.",
    "Un montage de volume ou un COPY de Dockerfile est préférable quand les données doivent être disponibles à chaque création de conteneur.",
    "Distingue le chemin hôte du chemin conteneur. Une copie manuelle n’est pas réappliquée automatiquement à un nouveau conteneur.",
  ),
  38: l(
    "pull récupère l’image. tag ajoute une référence lisible qui désigne cette même image locale.",
    "La liste d’images contient busybox:musl et busybox:local avec le même ID.",
    "Tu peux tirer une image par digest pour fixer exactement le contenu. Le tag local ne publie rien tant que tu ne fais pas de push.",
    "Vérifie le registre et la provenance avant d’exécuter une image.",
  ),
  39: l(
    "docker commit capture les changements du système de fichiers du conteneur en une nouvelle image.",
    "docker images affiche beta:datacenter. Le conteneur d’origine reste distinct de la nouvelle image.",
    "Un Dockerfile décrit les opérations et permet à une autre personne de reproduire la construction.",
    "Évite de capturer des secrets dans l’image. Le contenu des volumes montés est exclu d’un commit Docker.",
  ),
  40: l(
    "L’exécution interactive de bash te place dans le conteneur. Les paquets et la configuration modifiés ici concernent cette instance.",
    "Apache est installé et démarré dans kkloud, avec le port 6300 configuré dans le conteneur.",
    "docker exec kkloud COMMANDE suffit pour une action simple. Un Dockerfile sert pour des changements réutilisables.",
    "Regarde l’invite ou exécute hostname avant d’installer un paquet pour éviter de modifier l’hôte par erreur.",
  ),
  41: l(
    "Le Dockerfile décrit l’image. docker build exécute ses instructions en utilisant un dossier comme contexte de construction.",
    "L’image apache-app existe et embarque Apache configuré sur le port 5003.",
    "Avec docker build -f chemin/Dockerfile, tu peux désigner un fichier sous un autre nom. Le dernier argument reste le contexte.",
    "EXPOSE documente le port du conteneur. Pour publier ce port, il faut aussi un mapping à l’exécution.",
    {
      "/opt/docker/Dockerfile":
        "FROM fixe la base. RUN installe Apache et modifie son port. EXPOSE annonce 5003. CMD utilise -D FOREGROUND pour garder Apache au premier plan, ce qui maintient le conteneur actif.",
    },
  ),
  42: l(
    "Le pilote réseau détermine comment les conteneurs communiquent. macvlan peut leur donner une présence distincte sur le réseau de niveau 2.",
    "docker network inspect montre le réseau ecommerce, son pilote macvlan et le sous-réseau configuré.",
    "Un bridge est plus simple pour des services sur un seul hôte. Sur un vrai réseau macvlan, précise généralement l’interface parent selon l’infrastructure.",
    "Choisis une plage qui ne chevauche pas les adresses existantes et valide le besoin avec l’administrateur réseau.",
  ),
  43: l(
    "Le conteneur écoute sur 80. Docker traduit les connexions au port 6300 de l’hôte vers le port 80 du conteneur.",
    "curl vers localhost:6300, depuis stapp01, reçoit la page de Nginx.",
    "Sur un système réel, -p 127.0.0.1:6300:80 limite la publication à la boucle locale.",
    "Vérifie si le service doit être accessible hors hôte. Confirme que le port publié est libre.",
  ),
  44: l(
    "Compose traduit un fichier YAML en services, conteneurs, réseaux et éventuels volumes. La configuration reste réutilisable.",
    "Le service web démarre et le port 8080 de l’hôte est associé au port 80 d’Apache.",
    "Dans le répertoire d’un fichier Compose reconnu automatiquement, docker compose up -d peut suffire.",
    "Sur un vrai projet, docker compose config aide à valider le fichier avant lancement.",
    {
      "/opt/docker/docker-compose.yml":
        "services.web décrit le conteneur. image désigne HTTPD, container_name fixe son nom, et ports mappe 8080 sur l’hôte vers 80 dans le conteneur.",
    },
  ),
  45: l(
    "Lire le Dockerfile avant de le modifier permet d’identifier la faute qui empêche le build interprété. FROM est l’instruction qui choisit l’image de base.",
    "La construction réussit et produit une image nommée fixed.",
    "Sur Docker, relance le build après une correction minimale et lis la première erreur si un autre problème subsiste.",
    "Commence par corriger la syntaxe. Ne multiplie pas les changements avant d’avoir isolé la cause.",
    {
      "/opt/docker/Dockerfile":
        "FROM nginx:alpine remplace l’instruction invalide. EXPOSE 80 documente le port attendu par l’image.",
    },
  ),
  46: l(
    "Web et base sont deux services distincts. Compose leur fournit un réseau et ne publie que le port utile pour le test web.",
    "Le service web répond sur 3000 et la base tourne dans son conteneur.",
    "Une vraie application peut joindre db par son nom de service sur le réseau Compose, sans publier le port MySQL.",
    "En production, stocke les données sur un volume et fournis le secret de la base par un mécanisme prévu à cet effet.",
    {
      "/opt/finance/docker-compose.yml":
        "web publie 3000 vers Apache sur 80. db utilise mysql:8. MYSQL_ROOT_PASSWORD initialise MySQL dans le lab. Le même fichier crée les deux services.",
    },
  ),
  47: l(
    "La construction prépare les dépendances Python. À l’exécution, le mapping du port rend l’application Flask accessible depuis l’hôte.",
    "Le service Flask tourne dans pythonapp et répond sur le port hôte 8095.",
    "Tu peux lancer un processus Flask localement pour isoler un problème d’application, puis tester le conteneur séparément.",
    "Sépare la copie des dépendances du code pour profiter du cache. En production, utilise un serveur WSGI adapté.",
    {
      "/python_app/Dockerfile":
        "WORKDIR fixe /app. COPY et pip install -r installent d’abord les dépendances de requirements.txt. CMD lance app.py et EXPOSE annonce le port 5000.",
    },
  ),
};
