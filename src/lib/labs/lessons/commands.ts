type CommandGuide = { action: string; options?: Record<string, string> };
export type CommandPart = { text: string; meaning: string };
const c = (action: string, options?: CommandGuide["options"]): CommandGuide =>
  options ? { action, options } : { action };

const guides: Record<string, CommandGuide> = {
  ssh: c(
    "Ouvre une session distante. Dans utilisateur@hôte, la partie gauche choisit le compte et la partie droite le serveur. Un argument comme whoami exécute seulement cette commande sur l’hôte distant.",
  ),
  "sudo su": c(
    "sudo autorise l’élévation selon les droits du compte courant. su ouvre ensuite une session en tant que root par défaut.",
    {
      "-": "Ouvre une session de connexion complète et charge l’environnement de root, dont son répertoire personnel.",
    },
  ),
  sudo: c("Exécute la commande suivante avec l’identité autorisée par sudo.", {
    "-u": "Choisit le compte Unix cible, par exemple postgres. Ce n’est pas une option du client SQL.",
  }),
  exit: c(
    "Quitte le shell courant. Depuis une session root imbriquée dans SSH, un premier exit revient au compte distant, le second ferme SSH.",
  ),
  useradd: c("Crée le compte dont le nom est le dernier argument.", {
    "-s": "Définit le shell de connexion. /sbin/nologin empêche l’ouverture d’un shell interactif.",
    "-e": "Fixe la date d’expiration du compte au format AAAA-MM-JJ. Cette option concerne le compte, pas son mot de passe.",
  }),
  grep: c(
    "Recherche le motif dans le fichier indiqué ou, sans fichier, dans ce qui arrive par le pipe. Affiche les lignes qui correspondent.",
  ),
  chage: c("Consulte ou configure les règles d’âge du mot de passe et l’expiration du compte.", {
    "-l": "Affiche les réglages du compte sans les modifier.",
  }),
  sed: c(
    "Applique une transformation au texte. La forme s/ancien/nouveau/ remplace la première correspondance de chaque ligne. ^ ancre le motif au début, .* couvre le reste et #\\? rend le commentaire initial facultatif dans l’exemple SSH.",
    {
      "-i": "Modifie le fichier sur place. Sur un vrai système, teste la substitution sans -i avant d’écrire.",
    },
  ),
  ls: c(
    "Liste le chemin ciblé. Pour un fichier, tu peux aussi consulter ses permissions et son propriétaire.",
    { "-l": "Affiche le format détaillé avec type, droits, propriétaire, groupe, taille et date." },
  ),
  chmod: c(
    "Change les permissions du chemin. 755 donne lecture-écriture-exécution au propriétaire et lecture-exécution aux autres. +x ajoute le droit d’exécution sans fixer tous les autres bits.",
  ),
  "yum install": c(
    "Installe les paquets demandés et leurs dépendances depuis les dépôts configurés.",
    {
      "-y": "Répond oui aux confirmations du gestionnaire de paquets. Sans -y, tu peux relire la transaction avant de répondre.",
    },
  ),
  "yum-config-manager": c("Gère les dépôts utilisés par yum.", {
    "--add-repo":
      "Ajoute la configuration de dépôt fournie par son URL. L’installation des paquets vient ensuite.",
  }),
  sestatus: c(
    "Affiche l’état et le mode de SELinux. Le mode courant peut différer du mode configuré pour le prochain démarrage.",
  ),
  "systemctl enable": c("Configure l’unité systemd pour qu’elle puisse se lancer au démarrage.", {
    "--now": "Démarre aussi le service immédiatement.",
  }),
  "systemctl start": c(
    "Démarre le service maintenant. Pour demander son lancement au démarrage, utilise enable.",
  ),
  "systemctl stop": c(
    "Demande un arrêt propre du service en cours. Son activation au prochain démarrage reste configurée comme avant.",
  ),
  "systemctl restart": c(
    "Arrête puis relance le service pour prendre en compte la configuration. Les connexions en cours peuvent être interrompues.",
  ),
  "systemctl status": c(
    "Consulte l’état de l’unité, son processus et des messages récents. Un statut failed confirme un échec de démarrage.",
  ),
  echo: c(
    "Écrit ses arguments sur la sortie standard. Dans l’exemple cron, les guillemets gardent le planning et la redirection sous forme de texte. */5 désigne une minute sur cinq et les quatre étoiles n’ajoutent aucune restriction.",
  ),
  crontab: c(
    "Gère la table cron du compte courant. Dans ce lab, la session root fixe le compte cible.",
    {
      "-": "Lit la table complète sur l’entrée standard. Une ancienne table serait remplacée.",
      "-l": "Liste les entrées existantes sans les modifier.",
    },
  ),
  "ssh-keygen": c(
    "Génère la paire privée et publique sur la machine où la commande est exécutée.",
    {
      "-t": "Choisit l’algorithme de clé, ici RSA.",
      "-N": "Donne la nouvelle phrase secrète. Deux apostrophes contiguës transmettent une chaîne vide.",
      "-f": "Fixe le chemin de la clé privée. La clé publique est enregistrée au même emplacement avec .pub.",
    },
  ),
  "ssh-copy-id": c(
    "Ajoute une clé publique au fichier authorized_keys du compte distant. Il faut pouvoir s’authentifier pour cette première installation.",
  ),
  "pip3 install": c(
    "Installe un paquet Python. Le double signe == fixe exactement la version demandée.",
  ),
  ansible: c(
    "Lance un module ad hoc sur les hôtes ciblés. all sélectionne tous les hôtes de l’inventaire fourni.",
    {
      "--version": "Affiche la version et les informations du programme installé.",
      "-i": "Désigne le fichier d’inventaire qui décrit les adresses, les comptes et les groupes.",
      "-m": "Choisit le module, par exemple ping, yum ou service.",
      "-a": "Passe les paramètres clé=valeur au module. Les guillemets transmettent l’ensemble comme un seul argument.",
      "-b": "Autorise Ansible à élever ses privilèges sur la machine distante via become, généralement avec sudo.",
    },
  ),
  "ansible-playbook": c(
    "Exécute les opérations déclarées dans le playbook, sur les hôtes choisis par hosts.",
    {
      "-i": "Indique quel inventaire utiliser pour résoudre les groupes et les paramètres de connexion.",
    },
  ),
  journalctl: c("Lit les journaux conservés par systemd.", {
    "-u": "Filtre les messages sur l’unité indiquée.",
    "--no-pager": "Affiche directement les lignes sans ouvrir de lecteur interactif.",
  }),
  chown: c(
    "Change le propriétaire et éventuellement le groupe. utilisateur:groupe indique les deux nouvelles valeurs.",
    {
      "-R": "Applique la modification récursivement au dossier et à son contenu.",
    },
  ),
  vi: c(
    "Ouvre le fichier dans l’éditeur du lab. Colle ou écris le contenu attendu, puis utilise Enregistrer. L’écriture seule n’applique pas une configuration au service.",
  ),
  bash: c(
    "Exécute le script indiqué avec Bash. En le lançant ainsi, Bash lit le fichier directement.",
  ),
  cp: c("Copie une ou plusieurs sources vers la destination placée en dernier.", {
    "-r": "Copie les répertoires et leur contenu récursivement.",
  }),
  mv: c(
    "Déplace les fichiers sources vers la destination finale. Si plusieurs sources sont données, cette destination doit être un répertoire.",
  ),
  cat: c("Affiche le contenu du fichier sans le modifier."),
  curl: c(
    "Envoie une requête HTTP à l’URL. localhost désigne la machine où tu exécutes curl et le nombre après les deux-points est le port.",
  ),
  ss: c("Affiche les sockets du système.", {
    "-tlnp":
      "Regroupe -t pour TCP, -l pour les sockets en écoute, -n pour les valeurs numériques et -p pour les informations sur le processus.",
  }),
  iptables: c(
    "Configure les règles du pare-feu de l’hôte. INPUT traite les paquets destinés à la machine.",
    {
      "-A": "Ajoute la règle à la fin de la chaîne.",
      "-p": "Sélectionne le protocole, ici TCP.",
      "--dport": "Sélectionne le port de destination.",
      "-s": "Restreint la règle à l’adresse ou au réseau source.",
      "-j": "Choisit la décision. ACCEPT laisse passer le paquet et DROP l’écarte sans réponse.",
    },
  ),
  "service iptables": c(
    "Enregistre les règles actives avec l’action save fournie par le service iptables du lab.",
  ),
  service: c(
    "Demande au système d’initialisation de gérer le service nommé. start le démarre dans l’environnement courant.",
  ),
  ps: c(
    "Liste un instantané des processus. Dans ps aux, a inclut ceux des autres utilisateurs, u choisit un format orienté utilisateur et x inclut ceux sans terminal.",
  ),
  nginx: c("Interroge ou commande le serveur Nginx.", {
    "-t": "Teste la configuration et vérifie les fichiers référencés sans lancer un nouveau serveur.",
  }),
  "postgresql-setup": c("Prépare le répertoire de données du service PostgreSQL.", {
    "--initdb": "Crée le nouveau cluster de données PostgreSQL.",
  }),
  psql: c(
    "Se connecte à PostgreSQL. Les guillemets du shell gardent le SQL dans un seul argument, et le point-virgule termine l’instruction SQL.",
    {
      "-c": "Exécute la commande SQL transmise puis quitte le client.",
    },
  ),
  mysql: c(
    "Se connecte à MariaDB ou MySQL. Ici CREATE DATABASE prépare la base, CREATE USER l’identité et GRANT ses droits. Dans utilisateur@'%', % est un joker d’origine.",
    {
      "-e": "Exécute la chaîne SQL puis quitte le client. Les guillemets empêchent le shell de traiter les points-virgules comme ses propres séparateurs.",
    },
  ),
  cd: c(
    "Change le dossier courant. Ce changement détermine notamment quel dépôt Git est utilisé ensuite.",
  ),
  "git init": c("Initialise un dépôt Git dans le chemin donné.", {
    "--bare": "Crée un dépôt de partage sans copie de travail.",
  }),
  "git clone": c("Récupère le dépôt source et son historique dans un nouveau dossier."),
  "git checkout": c(
    "Change la branche de travail. Sans option, le nom désigne ici une branche existante.",
    { "-b": "Crée et sélectionne une branche à partir du commit courant." },
  ),
  "git branch": c(
    "Sans nom de branche, liste les branches locales. Une étoile identifie la branche courante.",
  ),
  "git add": c(
    "Prépare les changements choisis dans l’index. Un nom vise un fichier précis, tandis que . vise le dossier courant et ses descendants.",
  ),
  "git commit": c("Enregistre un instantané des modifications préparées dans l’index.", {
    "-m": "Fournit le message dans la commande au lieu d’ouvrir un éditeur.",
  }),
  "git merge": c("Intègre l’historique de la branche indiquée dans la branche courante."),
  "git push": c(
    "Publie les commits et la référence de la branche vers le remote nommé. Lorsque les arguments sont omis, Git suit la configuration de la branche et du dépôt.",
    {
      "--force":
        "Autorise la mise à jour même si elle remplace de l’historique distant. Elle peut écraser des commits publiés par d’autres personnes.",
    },
  ),
  "git remote add": c(
    "Associe le nom court puis l’adresse indiquée à une nouvelle destination. Cette commande ne lance aucun transfert.",
  ),
  "git remote": c("Liste ou gère les destinations liées au dépôt.", {
    "-v": "Affiche aussi les adresses utilisées pour la récupération et la publication.",
  }),
  "git log": c(
    "Affiche l’historique de la référence indiquée ou, sans référence, de la branche actuelle.",
    { "--oneline": "Affiche un commit par ligne, avec son identifiant abrégé et son sujet." },
  ),
  "git revert": c("Crée un commit inverse. HEAD désigne le commit actuellement extrait."),
  "git cherry-pick": c(
    "Rejoue un commit sur la branche courante. Un nom de branche désigne son dernier commit.",
  ),
  "git reset": c(
    "Replace la référence courante sur le commit indiqué. HEAD~3 remonte trois premiers parents.",
    {
      "--hard":
        "Aligne aussi l’index et les fichiers suivis sur la cible en supprimant les modifications locales incompatibles.",
    },
  ),
  "git stash list": c("Liste les changements gardés en réserve, avec leur identifiant stash@{n}."),
  "git stash apply": c(
    "Réapplique les changements du stash demandé. L’index {1} vise la deuxième entrée, car la numérotation commence à zéro.",
  ),
  "git rebase": c(
    "Rejoue les commits propres à la branche courante sur la branche ou le commit donné.",
  ),
  "git pull": c(
    "Récupère les nouveaux commits du remote et les intègre. La configuration de Git détermine la stratégie sur un dépôt réel.",
  ),
  "git status": c(
    "Décrit la branche active, les fichiers préparés, modifiés ou non suivis et les conflits éventuels.",
  ),
  "tea login": c(
    "Choisit l’identité utilisée par la forge simulée. Sur Gitea réel, la configuration de la CLI peut différer.",
    {
      "--user": "Indique le nom du compte de démonstration.",
      "--password":
        "Transmet le mot de passe fictif à la simulation. Évite les secrets réels en ligne de commande.",
    },
  ),
  "tea repos fork": c("Demande à la forge de créer un fork du dépôt au format propriétaire/dépôt."),
  "tea pr create": c("Ouvre une demande de fusion entre deux branches.", {
    "--base": "Désigne la branche qui doit recevoir les changements.",
    "--head": "Désigne la branche qui propose le changement.",
    "--title": "Donne un titre à la demande. Les guillemets gardent les espaces.",
  }),
  "tea pr review-request": c("Demande une revue de la pull request numérotée.", {
    "--reviewer": "Sélectionne le compte de la personne chargée de la revue.",
  }),
  "tea pr merge": c("Fusionne la pull request identifiée par son numéro dans la forge simulée."),
  "docker version": c(
    "Affiche les informations du client et du moteur. Une erreur côté serveur peut signaler un moteur arrêté ou inaccessible.",
  ),
  "docker run": c(
    "Crée et démarre un conteneur à partir d’une image. image:tag sélectionne une variante de cette image.",
    {
      "-d": "Lance le conteneur en arrière-plan et rend la main au terminal.",
      "--name": "Attribue un nom explicite au conteneur.",
      "-p": "Publie un port. Dans HÔTE:CONTENEUR, le premier nombre est le port d’accès, le second celui où écoute l’application.",
    },
  ),
  "docker ps": c("Liste les conteneurs en cours d’exécution, avec leur nom et les ports publiés."),
  "docker cp": c(
    "Copie un fichier entre l’hôte et un conteneur. Le format conteneur:/chemin désigne le côté conteneur.",
  ),
  "docker exec": c(
    "Lance une commande dans un conteneur déjà démarré. Sans shell interactif, tu vois seulement le résultat de la commande demandée.",
    {
      "-it":
        "Combine -i pour garder l’entrée ouverte et -t pour allouer un pseudo-terminal, afin d’utiliser bash de façon interactive.",
    },
  ),
  "docker pull": c("Télécharge une image et la variante demandée depuis le registre."),
  "docker tag": c(
    "Ajoute à l’image source une nouvelle référence locale. Les deux noms peuvent désigner le même contenu.",
  ),
  "docker images": c("Liste les images et tags disponibles dans le stockage local du moteur."),
  "docker commit": c(
    "Crée une image à partir des changements apportés au système de fichiers du conteneur. Le deuxième argument nomme cette image.",
  ),
  "apt update": c(
    "Rafraîchit l’index des paquets disponibles. Aucun paquet n’est mis à niveau par cette commande seule.",
  ),
  "apt install": c("Installe le paquet et ses dépendances dans l’environnement courant.", {
    "-y": "Accepte automatiquement les confirmations proposées par APT.",
  }),
  "docker build": c(
    "Construit une image depuis le Dockerfile. Le chemin final désigne le contexte, qui détermine les fichiers disponibles pour la construction.",
    {
      "-t": "Attribue un nom et éventuellement un tag à l’image produite. Ici -t signifie tag, contrairement au -t de docker exec.",
    },
  ),
  "docker network create": c("Crée le réseau portant le nom donné en dernier.", {
    "-d": "Choisit le driver réseau, ici macvlan. Dans cette commande, -d ne veut pas dire arrière-plan.",
    "--subnet": "Fixe la plage IPv4 du réseau en notation CIDR.",
    "--ip-range": "Délimite la plage dans laquelle Docker attribue automatiquement des adresses.",
  }),
  "docker network inspect": c(
    "Affiche les détails du réseau sélectionné, dont le pilote et les plages d’adresses.",
  ),
  "docker compose": c(
    "Gère des services décrits dans un fichier Compose. up crée ou met à jour les conteneurs et démarre les services.",
    {
      "-f": "Sélectionne le fichier YAML à lire.",
      "-d": "Option de up qui laisse tourner les services en arrière-plan.",
    },
  ),
  "kubectl run": c("Crée un pod nommé à partir de l’image indiquée.", {
    "--image": "Choisit l’image du conteneur. Le texte après = est sa valeur.",
    "--labels":
      "Ajoute une ou plusieurs étiquettes clé=valeur. Un Service peut s’en servir pour sélectionner des pods.",
  }),
  "kubectl get": c(
    "Liste les ressources et leur état résumé. svc désigne les Services, pv les volumes, pvc les demandes, et all un ensemble de types courants. La virgule permet de demander plusieurs types.",
    {
      "-o": "Choisit le format de sortie. yaml permet de relire la définition d’une ressource dans un fichier.",
      "-n": "Limite la requête au namespace indiqué.",
    },
  ),
  "kubectl create deployment": c(
    "Crée un Deployment qui maintient ses pods à partir d’un modèle.",
    {
      "--image": "Choisit l’image du conteneur du Deployment.",
      "--replicas": "Déclare le nombre de copies de pod souhaité.",
    },
  ),
  "kubectl apply": c(
    "Envoie au cluster la configuration déclarée. L’opération crée ou met à jour les objets décrits.",
    {
      "-f": "Lit la définition depuis le fichier ou le chemin indiqué.",
    },
  ),
  "kubectl describe": c(
    "Affiche les détails d’une ressource. Pour un pod qui démarre mal, lis surtout l’état des conteneurs et les événements.",
  ),
  "kubectl set image": c(
    "Remplace l’image dans le modèle du Deployment. Dans conteneur=image, la clé est le nom du conteneur et la valeur la nouvelle image.",
  ),
  "kubectl rollout status": c(
    "Observe l’avancement du déploiement et indique quand il se termine.",
  ),
  "kubectl rollout history": c("Liste les révisions que le Deployment a conservées."),
  "kubectl rollout undo": c(
    "Restaure la révision précédente par défaut. Le contrôleur déploie à nouveau le modèle restauré.",
  ),
  "kubectl replace": c("Remplace l’objet nommé par la définition complète fournie.", {
    "--force":
      "Supprime puis recrée la ressource. Un pod peut subir une interruption et perdre ses données éphémères.",
    "-f": "Lit le manifeste depuis le fichier donné.",
  }),
  "kubectl exec": c(
    "Exécute une commande dans le pod. Les arguments après -- sont la commande et ses arguments dans le conteneur.",
    {
      "-c": "Sélectionne un conteneur précis lorsque le pod en comporte plusieurs.",
    },
  ),
  "kubectl logs": c(
    "Affiche la sortie enregistrée du conteneur, utile pour observer son démarrage ou une erreur.",
    {
      "-c": "Sélectionne le conteneur dont tu veux les logs, y compris un init container.",
    },
  ),
  "kubectl edit": c(
    "Ouvre la définition de la ressource existante. Enregistrer applique la modification à l’objet ciblé.",
  ),
  "kubectl create secret": c(
    "Crée un Secret. generic indique qu’il s’agit de données génériques.",
    {
      "--from-file":
        "Lit la valeur dans un fichier. Sans nom de clé explicite, le nom du fichier sert de clé.",
      "--from-literal": "Prend directement une paire clé=valeur. La valeur du lab est fictive.",
    },
  ),
  "kubectl create namespace": c(
    "Crée un espace de noms dans lequel des ressources pourront être regroupées.",
  ),
  "kubectl create configmap": c("Crée un ConfigMap de paramètres qui ne sont pas des secrets.", {
    "--from-literal": "Prend directement la paire clé=valeur à enregistrer.",
  }),
  "jenkins-cli": c(
    "Appelle l’interface Jenkins du simulateur. Les commandes de configuration de ce lab représentent des actions Jenkins et n’ont pas toutes un équivalent mot pour mot dans la CLI officielle.",
  ),
  "jenkins-cli create-user": c(
    "Crée un compte du simulateur. Après la sous-commande viennent son nom et son mot de passe fictif.",
  ),
  "jenkins-cli install-plugin": c(
    "Ajoute les plugins identifiés par les arguments. Une commande peut traiter plusieurs plugins.",
  ),
  "jenkins-cli safe-restart": c(
    "Demande un redémarrage contrôlé, après les exécutions en cours dans Jenkins réel.",
  ),
  "jenkins-cli enable-matrix": c(
    "Active, dans le simulateur, la stratégie d’autorisation par matrice.",
  ),
  "jenkins-cli grant-job": c(
    "Associe un droit à un compte pour un job nommé. Le dernier argument précise le droit.",
  ),
  "jenkins-cli grant": c(
    "Associe une permission globale au compte indiqué. Overall/Read et Overall/Administer n’ont pas la même portée.",
  ),
  "jenkins-cli create-job": c("Crée un job portant le nom indiqué à partir de sa définition.", {
    "--type":
      "Précise le modèle du job, freestyle pour des actions simples ou pipeline pour une suite de stages.",
    "--file": "Sélectionne le fichier qui contient le script ou le Jenkinsfile du lab.",
  }),
  "jenkins-cli add-param": c(
    "Ajoute un paramètre au job. Les arguments donnent le job, la clé du paramètre et sa valeur par défaut.",
    {
      "--choices": "Transforme le paramètre en choix parmi les valeurs séparées par des virgules.",
    },
  ),
  "jenkins-cli build": c(
    "Lance le job indiqué, ou le lance avec les valeurs saisies pour ses paramètres.",
    {
      "-p": "Fournit un paramètre sous la forme NOM=VALEUR. Répète cette option pour chaque paramètre.",
    },
  ),
  "jenkins-cli set-trigger": c(
    "Configure quand le job doit démarrer. Une chaîne cron planifie son exécution, scm relie le job aux mises à jour de code dans la simulation.",
    {
      "--repo": "Associe le déclencheur SCM au dépôt dont les pushes sont surveillés dans le lab.",
    },
  ),
  "jenkins-cli create-node": c("Déclare un agent et attribue son nom dans Jenkins.", {
    "--host": "Indique la machine à joindre.",
    "--label": "Donne une étiquette que les jobs peuvent utiliser pour sélectionner cet agent.",
    "--remote-fs": "Précise le dossier de travail situé sur la machine distante.",
  }),
  "jenkins-cli list-nodes": c(
    "Liste les agents connus et permet de contrôler leur état de connexion.",
  ),
  "jenkins-cli link": c(
    "Relie le job qui doit démarrer en premier au job qui doit suivre son succès.",
  ),
  "jenkins-cli console": c(
    "Affiche les logs du build du job choisi. Lis le début et la fin pour repérer la cause d’un échec.",
  ),
  "terraform init": c(
    "Initialise le répertoire de travail et prépare le backend, les modules et les providers. Aucune ressource n’est créée par init.",
  ),
  "terraform validate": c(
    "Vérifie que la configuration Terraform est cohérente. Cette vérification ne remplace pas la lecture d’un plan.",
  ),
  "terraform plan": c(
    "Compare la configuration à l’état et prévisualise les créations, changements et suppressions proposés. Les opérations ne sont pas appliquées.",
  ),
  "terraform apply": c("Applique les opérations du plan et met l’état Terraform à jour.", {
    "-auto-approve":
      "Passe la confirmation interactive. Dans un vrai environnement, lis le plan et préfère une approbation explicite ou un plan sauvegardé et approuvé.",
  }),
  "terraform state list": c(
    "Liste les adresses des ressources enregistrées dans l’état Terraform.",
  ),
  "terraform output": c(
    "Affiche les valeurs des blocs output enregistrées dans l’état après l’application.",
  ),
};

const symbols: Record<string, string> = {
  "|": "Le pipe envoie la sortie de la commande de gauche à l’entrée de celle de droite.",
  "&&": "Exécute la commande suivante uniquement si celle qui précède réussit.",
  ">": "Écrit la sortie dans le fichier nommé juste après. S’il existe, son contenu est remplacé.",
  "--": "Sépare ici les options de kubectl de la commande à exécuter dans le conteneur.",
};

// Ce découpage sert à annoter les solutions du cours. Les blocs cités restent des arguments.
const tokenPattern = /(?:'[^']*'|"(?:\\.|[^"\\])*"|[^\s'"|>&]+)+|&&|[|>]/g;
const keys = Object.keys(guides).sort((a, b) => b.length - a.length);

export function explainCommand(command: string): { parts: CommandPart[]; missing: string[] } {
  const tokens = command.match(tokenPattern) ?? [];
  const parts: CommandPart[] = [];
  const missing: string[] = [];
  let at = 0;
  while (at < tokens.length) {
    const token = tokens[at]!;
    const symbol = symbols[token];
    if (symbol && token !== "--") {
      parts.push({ text: token, meaning: symbol });
      at += token === ">" ? 2 : 1;
      continue;
    }
    const key = keys.find((candidate) =>
      candidate.split(" ").every((word, index) => tokens[at + index] === word),
    );
    if (!key) {
      missing.push(token);
      at++;
      continue;
    }
    const guide = guides[key]!;
    parts.push({ text: key, meaning: guide.action });
    at += key.split(" ").length;
    while (at < tokens.length) {
      const arg = tokens[at]!;
      if (arg === "|" || arg === "&&" || arg === ">") break;
      if (arg === "--") {
        parts.push({ text: arg, meaning: symbols[arg]! });
        at++;
        break;
      }
      if ((key === "sudo" && arg === "psql") || (key === "sudo" && arg === "pip3")) break;
      at++;
      if (!arg.startsWith("-")) continue;
      const option = arg.split("=", 1)[0]!;
      const meaning = guide.options?.[option];
      if (meaning) parts.push({ text: arg, meaning });
      else missing.push(key + " " + arg);
    }
  }
  return { parts, missing };
}
