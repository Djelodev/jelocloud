import { lesson as l, type Lesson } from "./types";

export const automationLessons: Record<number, Lesson> = {
  68: l(
    "Jenkins est une application Java. Le dépôt fournit le paquet Jenkins, systemd pilote le service et la configuration initiale crée l’accès administrateur.",
    "Jenkins répond, le compte devops existe et la matrice lui donne Overall/Administer.",
    "Sur un vrai Jenkins, l’assistant d’installation web utilise le fichier initialAdminPassword. Les commandes jenkins-cli de ce lab représentent des actions simulées qui peuvent passer par l’interface réelle.",
    "Vérifie la version Java supportée par la version Jenkins choisie. Protège le mot de passe initial et limite le nombre de comptes administrateurs.",
  ),
  69: l(
    "Les plugins étendent le contrôleur. Installer Git et GitLab prépare les intégrations de gestion de versions.",
    "Les deux plugins sont présents et le contrôleur a effectué un redémarrage contrôlé.",
    "Sur Jenkins, utilise Manage Plugins ou une configuration de plugins versionnée pour reproduire l’installation.",
    "Installe seulement les extensions nécessaires. Vérifie leur compatibilité et planifie les redémarrages des contrôleurs actifs.",
  ),
  70: l(
    "L’autorisation matricielle associe une permission précise à un compte. Overall/Read donne accès aux vues générales sans autoriser l’administration.",
    "ravi est limité à Overall/Read dans la matrice.",
    "Des stratégies par rôles et des groupes issus d’un annuaire aident quand le nombre de comptes augmente.",
    "Accorde les droits minimaux et conserve un accès administrateur de secours avant d’activer la stratégie.",
  ),
  71: l(
    "Le job reçoit le nom du paquet, le transmet à un script et exécute l’installation sur le serveur de stockage prévu.",
    "Le build se termine et le paquet httpd est installé sur ststor01.",
    "Une tâche Ansible qui fixe name et state rend ce type d’installation déclaratif et vérifiable.",
    "Sur un vrai service, autorise une liste de paquets plutôt que du texte arbitraire et donne au compte du job des droits limités.",
    {
      "job.sh":
        "PACKAGE provient du paramètre Jenkins. ssh exécute la chaîne sur ststor01, sudo autorise l’installation et yum -y répond oui aux confirmations.",
    },
  ),
  72: l(
    "Un paramètre texte convient à une valeur libre. Un paramètre choice propose une liste fermée, ce qui réduit les erreurs.",
    "La console du build reflète Stage=Build et env=Development.",
    "Un Jenkinsfile déclaratif peut définir string et choice près du pipeline au lieu de configurer le job avec la CLI du lab.",
    "Choisis des valeurs par défaut prévisibles et limite les actions privilégiées aux environnements explicitement prévus.",
    {
      "job.sh":
        "Jenkins rend Stage et env disponibles au script. Les doubles guillemets laissent le shell développer ces variables dans la sortie de echo.",
    },
  ),
  73: l(
    "Un déclencheur temporel démarre un job automatiquement. Le H de Jenkins répartit les exécutions pour éviter que tous les jobs démarrent ensemble.",
    "Le job copy-logs dispose du planning H/10 * * * *. Il se lance environ toutes les dix minutes selon son décalage.",
    "Dans un Jenkinsfile, déclare un trigger cron. Pour réagir à un événement au lieu de l’heure, utilise une intégration SCM.",
    "Vérifie la charge et le chevauchement des builds. Un job lent peut nécessiter une règle empêchant son exécution concurrente.",
    {
      "job.sh":
        "cp copie deploy.log vers un fichier .bak. Cette copie est volontairement simple et remplace le même fichier à chaque exécution.",
    },
  ),
  74: l(
    "Un dump logique transforme la base en instructions exportables. L’envoyer vers un autre hôte protège contre la perte de la machine source.",
    "La sauvegarde app.sql est présente dans /var/backups sur le serveur de sauvegarde.",
    "Pour une base volumineuse, une sauvegarde physique ou un service géré peut réduire le temps de restauration.",
    "Teste la restauration et protège les données en transit et au repos. Fais échouer le job si l’export est incomplet.",
    {
      "job.sh":
        "ssh lance mysqldump sur stdb01. > écrit la sortie dans un fichier local au job. scp transfère ensuite ce fichier à stbkp01.",
    },
  ),
  75: l(
    "Un agent exécute des jobs hors du contrôleur. Un label permet aux pipelines de cibler un agent adapté.",
    "list-nodes affiche App_server_1 avec son adresse, son label app1 et un état connecté.",
    "Sur Jenkins réel, configure un agent SSH depuis Manage Nodes ou utilise un agent entrant lorsque l’architecture l’exige.",
    "Vérifie la compatibilité Java, la clé de l’hôte SSH et les droits d’écriture du dossier distant.",
  ),
  76: l(
    "Les permissions peuvent varier d’un projet à l’autre. Le droit de lire un job et le droit de déclencher un build répondent à des besoins différents.",
    "Sur Packages, sam a Build et max a Read selon la consigne du lab.",
    "Une matrice sur le projet ou une stratégie de rôles peut exprimer ces accès sur une instance Jenkins réelle.",
    "Vérifie les droits hérités et les prérequis de visibilité. Un utilisateur réel doit aussi pouvoir lire le job pour le déclencher depuis l’interface.",
  ),
  77: l(
    "Un pipeline décrit des étapes versionnables. Le stage Deploy donne un nom à l’action et facilite la lecture de la console.",
    "Le build valide crée le fichier index.html de démonstration.",
    "En équipe, charge le Jenkinsfile depuis SCM pour associer chaque exécution à un commit.",
    "Sépare préparation, tests et déploiement. Réserve le déploiement réel à un agent et à des permissions adaptés.",
    {
      Jenkinsfile:
        "agent any autorise un exécuteur disponible. stage organise le pipeline. Le script sh crée le répertoire avec mkdir -p puis écrit index.html seulement si la création réussit.",
    },
  ),
  78: l(
    "Le paramètre BRANCH apporte une valeur au pipeline. Une condition de stage choisit quel chemin exécuter.",
    "Le build sélectionne feature. La console permet de vérifier quel stage a été lancé ou ignoré.",
    "Dans un pipeline multibranche réel, une condition when branch peut utiliser la branche détectée par Jenkins.",
    "Valide les branches autorisées et protège la voie de déploiement de master.",
  ),
  79: l(
    "Le déclencheur SCM relie une mise à jour du dépôt au job, ce qui évite de lancer le déploiement à la main.",
    "Après le push, le job de déploiement démarre et produit le résultat attendu.",
    "En production, un webhook Git ou un contrôle périodique du dépôt peut provoquer le build. Le réglage scm du lab modélise la liaison.",
    "Filtre les branches et vérifie la provenance des événements avant toute action de déploiement.",
  ),
  80: l(
    "Un job peut en déclencher un autre. Ici l’action de gestion des services dépend du succès du déploiement.",
    "Le build amont réussit et déclenche manage-services.",
    "Intègre les deux opérations comme stages d’un même pipeline si elles partagent le même cycle de vie.",
    "Évite les dépendances circulaires et indique quelle étape a échoué pour faciliter les relances.",
  ),
  81: l(
    "Des stages séparent les responsabilités. Deploy produit le fichier et Test vérifie ensuite le résultat.",
    "La console du build montre les deux stages et leurs sorties dans l’ordre.",
    "Ajoute une validation avant déploiement pour tester le paquet, puis conserve un test de fumée après.",
    "Fais retourner un échec au test si le résultat manque. Le nom d’un stage aide à localiser le problème, son code de sortie décide du statut.",
  ),
  82: l(
    "L’inventaire sépare les machines à gérer des tâches. ansible_host indique l’adresse de connexion quand le nom logique est différent.",
    "Le module ping renvoie pong pour stapp02 avec l’utilisateur et les identifiants attendus.",
    "Un inventaire YAML ou un inventaire dynamique peut remplacer le format INI.",
    "Évite les mots de passe en clair dans un vrai inventaire. Préfère une clé SSH ou une gestion chiffrée des secrets.",
    {
      inventory:
        "[app] déclare le groupe. stapp02 est le nom logique, ansible_host l’adresse, ansible_user le compte et ansible_ssh_pass le secret fictif du lab.",
    },
  ),
  83: l(
    "Un play cible un groupe. Une tâche de module file exprime l’état souhaité sans écrire une boucle SSH.",
    "Le fichier /tmp/empty.txt existe sur les hôtes du groupe app.",
    "Le module copy avec un contenu vide est utile si tu veux aussi garantir que le fichier n’a aucun contenu. touch conserve le contenu existant.",
    "Relis le groupe ciblé et évite become si le chemin est accessible au compte normal.",
    {
      "playbook.yml":
        "hosts cible app. become autorise l’élévation. Sous tasks, file et state: touch créent le chemin s’il manque ou actualisent ses horodatages.",
    },
  ),
  84: l(
    "Le module copy transfère depuis le contrôleur vers les hôtes sélectionnés et compare le contenu pour limiter les changements.",
    "/tmp/data.txt est présent et contient les données attendues.",
    "Utilise template si le contenu doit varier par hôte.",
    "Vérifie le chemin source et le mode. 0644 convient à des données lisibles par tous et modifiables par leur propriétaire.",
    {
      "playbook.yml":
        'src indique data.txt sur le contrôleur. dest fixe le chemin distant. mode: "0644" préserve une écriture explicite du mode.',
    },
  ),
  85: l(
    "Une tâche peut gérer le propriétaire et les permissions dans la même opération. La variable ansible_user donne le compte de chaque machine.",
    "Chaque /tmp/managed.txt a le bon propriétaire et le mode 0640.",
    "Un compte de service fixe est préférable si le propriétaire ne doit pas dépendre de l’identité de connexion.",
    "Garde les valeurs de mode entre guillemets dans le YAML. 0640 donne lecture-écriture au propriétaire, lecture au groupe et aucun droit aux autres.",
    {
      "playbook.yml":
        "file crée le fichier avec touch. {{ ansible_user }} résout le nom de compte depuis l’inventaire. owner et mode déclarent l’état attendu.",
    },
  ),
  86: l(
    "Le module ping teste la connexion et l’exécution d’un module Ansible. C’est différent d’un ping ICMP réseau.",
    "Le premier passage signale stapp03 inaccessible. Après correction de l’inventaire, tous les hôtes renvoient pong.",
    "Teste un seul hôte à la fois ou vérifie SSH directement pour distinguer route, compte, clé et dépendances.",
    "Diagnostique le message d’erreur avant de changer les droits. Utilise un coffre ou une clé pour les véritables connexions.",
    {
      inventory:
        "Chaque ligne associe un hôte au compte et au mot de passe attendus. Compare surtout les paramètres de stapp03 avec les identifiants du lab.",
    },
  ),
  87: l(
    "Le module yum déclare que le paquet doit être présent. En le relançant, un hôte déjà conforme n’a pas besoin d’être réinstallé.",
    "vim-enhanced est présent sur les machines ciblées.",
    "Le module générique package laisse Ansible choisir le gestionnaire de paquets quand les noms restent compatibles.",
    "Limite le groupe ciblé et choisis une version selon la politique de mises à jour du projet.",
  ),
  88: l(
    "blockinfile insère ou remplace un bloc délimité. Les marqueurs indiquent à Ansible la partie qu’il gère lors des exécutions suivantes.",
    "La page contient le paragraphe géré, sans bloc ajouté en double à chaque exécution.",
    "Pour un document entièrement géré, remplace le fichier via template ou copy. Pour une seule ligne, envisage lineinfile.",
    "Adapte le marqueur à la syntaxe du fichier réel, par exemple un commentaire HTML dans du HTML.",
    {
      "playbook.yml":
        "path pointe vers index.html. block contient le HTML à insérer. Le module repère ensuite son propre bloc grâce aux marqueurs.",
    },
  ),
  89: l(
    "Un service peut tourner maintenant et rester désactivé au démarrage. La tâche fixe ces deux dimensions séparément.",
    "httpd est démarré et configuré pour se lancer au boot.",
    "ansible.builtin.systemd_service donne accès à des options spécifiques à systemd. service est plus générique.",
    "Vérifie aussi la santé de l’application après le démarrage. Un service actif peut encore répondre par une erreur.",
  ),
  90: l(
    "Une ACL donne des droits à un utilisateur ou groupe supplémentaire sans remplacer les bits classiques du propriétaire et du groupe du fichier.",
    "L’utilisateur indiqué par l’inventaire reçoit rw sur /tmp/acl.txt.",
    "Un groupe Unix dédié peut suffire lorsque plusieurs comptes partagent exactement le même besoin.",
    "Vérifie les droits effectifs, notamment le masque ACL, et contrôle sur le vrai système quelles permissions sont nécessaires.",
    {
      "playbook.yml":
        "entity sélectionne le compte, etype précise qu’il s’agit d’un utilisateur et permissions fixe rw. state: present crée ou maintient l’entrée.",
    },
  ),
  91: l(
    "lineinfile garantit une ligne particulière. Une expression régulière vise la directive existante, quelle que soit sa valeur.",
    "jelo.conf contient ENABLED=true.",
    "Un template convient si tu veux contrôler le fichier entier. blockinfile convient mieux à plusieurs lignes liées.",
    "Fais correspondre l’expression à l’ancien et au nouvel état pour éviter de dupliquer la directive aux exécutions suivantes.",
    {
      "playbook.yml":
        "regexp: ^ENABLED= vise une ligne qui commence par la directive. line fournit le texte de remplacement.",
    },
  ),
  92: l(
    "Un rôle sépare ses modèles, ses tâches et son point d’entrée. Jinja rend possible une page adaptée à chaque hôte à partir d’une source commune.",
    "Chaque serveur sert une page qui contient son propre inventory_hostname.",
    "Une tâche template directement dans le playbook peut suffire pour un fichier isolé. Le rôle rend l’ensemble réutilisable.",
    "Définis clairement les variables requises et mets les valeurs ordinaires par défaut dans le rôle.",
    {
      "roles/web/templates/index.html.j2":
        "Le fichier est un modèle Jinja2. {{ inventory_hostname }} est remplacé par le nom logique de l’hôte dans l’inventaire.",
      "roles/web/tasks/main.yml":
        "Le module template lit le fichier dans templates, calcule son contenu pour chaque cible et l’écrit dans dest avec les permissions demandées.",
      "playbook.yml": "roles: web charge le rôle web pour les hôtes du groupe app.",
    },
  ),
  93: l(
    "Une condition when est évaluée par hôte. Le même playbook peut donc écrire des valeurs différentes selon la machine.",
    "Chaque /tmp/app.txt contient le texte correspondant au serveur. Les tâches des autres hôtes sont ignorées.",
    "Pour beaucoup d’hôtes, déplace les différences dans host_vars ou group_vars et réutilise une seule tâche.",
    "Préfère une variable liée au rôle de la machine quand le nom d’hôte risque de changer.",
    {
      "playbook.yml":
        "when compare ansible_nodename à stapp01, stapp02 ou stapp03. content: | conserve les retours à la ligne du bloc YAML.",
    },
  ),
  94: l(
    "Un VPC fournit un réseau privé logique. Son bloc CIDR définit la plage disponible pour ses sous-réseaux.",
    "Le plan prévoit un VPC et aws_vpc.main apparaît dans terraform state list après apply.",
    "Tu peux aussi créer le VPC dans la console AWS. Terraform garde sa déclaration versionnable et comparable à l’état.",
    "Planifie un CIDR sans chevauchement avec les réseaux qui seront interconnectés. Ce lab ne crée aucune ressource réelle.",
    {
      "main.tf":
        "resource déclare le type aws_vpc et le nom Terraform main. cidr_block fixe 10.0.0.0/16, un préfixe IPv4 de 16 bits.",
    },
  ),
  95: l(
    "Un Security Group définit quels flux atteignent les ressources associées. Chaque bloc ingress décrit un flux entrant.",
    "Le groupe autorise HTTP sur 80 et limite SSH sur 22 à l’adresse spécifiée.",
    "Une source peut être un autre Security Group quand l’accès vient d’une application dans AWS. Pour administrer sans SSH public, envisage Systems Manager.",
    "0.0.0.0/0 couvre toutes les sources IPv4. Réserve cette portée aux services destinés au public et relis le plan.",
    {
      "main.tf":
        "from_port et to_port délimitent le port ou la plage. protocol vaut tcp. Le CIDR en /32 autorise une seule adresse IPv4.",
    },
  ),
  96: l(
    "L’AMI fournit l’image de démarrage et le type d’instance fixe la capacité de calcul. Ces choix répondent à des besoins distincts.",
    "aws_instance.app figure dans l’état avec t2.micro et l’AMI de démonstration.",
    "Dans un vrai déploiement, une source de données ou un paramètre d’image géré peut résoudre l’AMI appropriée à la région.",
    "Choisis une image de confiance et vérifie coût, stockage et réseau avant d’appliquer un plan réel.",
    {
      "main.tf":
        "aws_instance décrit l’instance EC2. ami sélectionne son image de départ et instance_type son gabarit.",
    },
  ),
  97: l(
    "Une policy IAM énumère les actions autorisées ou refusées. Limiter la policy à la lecture réduit les risques d’une identité d’observation.",
    "La policy autorise les opérations ec2:Describe* et existe dans l’état.",
    "Un document aws_iam_policy_document peut construire la policy d’un vrai projet et réutiliser ses règles.",
    "Énumère les actions nécessaires quand c’est possible. Vérifie au cas par cas lesquelles acceptent un ARN de ressource précis.",
    {
      "main.tf":
        'jsonencode convertit la structure HCL en document JSON. Effect: Allow autorise les actions listées. Resource: "*" s’applique à leur portée générale.',
    },
  ),
  98: l(
    "Une référence Terraform relie les ressources. L’instance hérite du sous-réseau choisi et sa configuration demande de ne pas lui attribuer d’IP publique.",
    "Le VPC, le sous-réseau privé et l’instance apparaissent avec leurs liens, sans IP publique attribuée par la configuration.",
    "Pour administrer une instance privée, envisage une connexion via Systems Manager ou un chemin privé autorisé.",
    "Sur AWS réel, vérifie aussi la table de routage. Le caractère privé dépend notamment de l’absence de route directe vers une Internet Gateway.",
    {
      "main.tf":
        "vpc_id référence l’identifiant du VPC et subnet_id celui du sous-réseau. map_public_ip_on_launch et associate_public_ip_address désactivent l’attribution automatique d’IP publique dans l’exercice.",
    },
  ),
  99: l(
    "Une politique de confiance permet à un service d’assumer un rôle. La policy attachée définit les actions permises après cette prise de rôle.",
    "Le rôle a la policy DynamoDB prévue pour lire et écrire les éléments de la table ciblée.",
    "Dans AWS réel, rattache le rôle à une instance EC2 via un instance profile pour que l’application obtienne des identifiants temporaires.",
    "Limite les actions et l’ARN à la table nécessaire. Vérifie à la fois qui peut assumer le rôle et ce qu’il peut faire.",
    {
      "main.tf":
        "hash_key fixe la clé de partition. assume_role_policy définit la confiance pour EC2. L’attachment relie le rôle à la policy, dont Resource pointe sur l’ARN de la table.",
    },
  ),
  100: l(
    "L’alarme transforme une série de mesures CPU en changement d’état. SNS reçoit la notification et la distribue selon les abonnements configurés.",
    "L’alarme CPU est créée avec un seuil de 80 et terraform output affiche alarm_name.",
    "Pour un vrai signal opérationnel, combine des seuils adaptés au trafic avec des métriques de latence ou d’erreur.",
    "Une alarme réelle doit cibler la bonne série de métriques, par exemple via InstanceId. Configure aussi un abonnement SNS et teste sa réception.",
    {
      "main.tf":
        "CPUUtilization est la métrique. period et evaluation_periods fixent la fenêtre d’évaluation. alarm_actions référence le topic SNS, et output publie le nom de l’alarme.",
    },
  ),
};
