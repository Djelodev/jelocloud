import { lesson as l, type Lesson } from "./types";

export const linuxLessons: Record<number, Lesson> = {
  1: l(
    "Un processus peut avoir besoin d’un compte à son nom. Son shell de connexion détermine ce qui arrive quand quelqu’un tente d’ouvrir une session avec ce compte.",
    "La ligne de yousuf se termine par /sbin/nologin. Les colonnes centrales contiennent notamment l’UID et le GID, qui identifient l’utilisateur et son groupe.",
    "Si le compte existe déjà, usermod -s /sbin/nologin yousuf change son shell. Pour interroger le compte, getent passwd yousuf consulte la base des utilisateurs configurée sur la machine.",
    "Vérifie le nom d’hôte dans l’invite avant de créer le compte. Limite l’usage de root à l’opération administrative.",
  ),
  2: l(
    "Une date de fin borne la durée de vie d’un compte temporaire, indépendamment de la politique d’expiration de son mot de passe.",
    "Dans chage -l, lis la ligne Account expires. Elle correspond au 28 janvier 2027, même si le format d’affichage dépend de la langue.",
    "Pour un compte déjà créé, utilise chage -E 2027-01-28 javed. L’option majuscule -E définit l’expiration dans chage.",
    "Inscris la date convenue et teste aussi le compte avant son expiration. Un compte expiré peut encore posséder des fichiers.",
  ),
  3: l(
    "Chaque serveur a sa propre configuration SSH. Une modification sur stapp01 ne s’applique pas aux deux autres hôtes.",
    "La directive PermitRootLogin no doit être effective sur les trois démons SSH. Avec exit, quitte d’abord root, puis la connexion SSH, avant de passer à l’hôte suivant.",
    "Tu peux modifier la directive avec un éditeur. Sur un vrai serveur OpenSSH, valide la configuration avec sshd -t, puis recharge le service s’il le permet.",
    "Garde la session d’administration ouverte pendant la vérification et teste une autre connexion avec un utilisateur autorisé avant de te déconnecter.",
  ),
  4: l(
    "Les bits de permission s’appliquent séparément au propriétaire, au groupe et aux autres. Chaque chiffre additionne lecture (4), écriture (2) et exécution (1).",
    "La première colonne de ls -l doit contenir -rwxr-xr-x. Tous peuvent lire et exécuter le script. Seul le propriétaire peut le modifier.",
    "chmod u=rwx,go=rx applique des permissions équivalentes. chmod +x ajoute le droit d’exécution tout en conservant les droits déjà présents.",
    "Donne les droits nécessaires au public prévu. Évite 777, qui autorise aussi la modification du script par tout le monde.",
  ),
  5: l(
    "SELinux ajoute des règles de sécurité aux permissions Unix. Le lab distingue le mode actuellement chargé du réglage lu au démarrage.",
    "Le fichier doit contenir SELINUX=disabled. Dans ce lab, sestatus peut encore afficher le mode courant puisque le changement persistant concerne le démarrage.",
    "Pour diagnostiquer un blocage réel, commence par les journaux d’audit et les labels SELinux. Le mode permissif peut servir ponctuellement à observer les refus.",
    "En production, privilégie la correction des contextes ou des politiques. Le mode désactivé est l’objectif de cet exercice.",
  ),
  6: l(
    "crond lit les crontabs et planifie les tâches. Lancer le service et enregistrer une tâche sont deux opérations distinctes.",
    "crontab -l doit montrer une ligne qui lance echo hello toutes les cinq minutes. Attends la validation du planning, sans attendre cinq minutes dans le simulateur.",
    "Sur une machine réelle, crontab -e permet d’ajouter la ligne à la table existante. L’envoi par pipe installe une table complète.",
    "Consulte ou sauvegarde les entrées existantes avant de les remplacer. Utilise des chemins explicites pour les tâches qui dépendent de fichiers ou d’exécutables.",
  ),
  7: l(
    "Le client garde la clé privée. Le serveur autorise sa clé publique, puis vérifie que le client peut prouver qu’il possède la clé privée.",
    "La commande whoami renvoie le nom du compte distant. Aucun mot de passe de ce compte n’est demandé après l’installation correcte de la clé.",
    "Pour une clé neuve sur un système compatible, préfère souvent Ed25519. Tu peux utiliser ssh -i avec une clé privée stockée sous un autre nom.",
    "Ne copie jamais la clé privée vers le serveur. Pour un usage humain réel, protège-la par une phrase secrète et évite d’écraser une paire existante.",
  ),
  8: l(
    "Le numéro de version fixé rend l’exercice reproductible. L’installation globale explique pourquoi l’outil est accessible en dehors du compte courant.",
    "ansible --version confirme que le programme répond sur le jump host. La consigne fixe la version du paquet Ansible à 4.8.0.",
    "Pour un projet personnel réel, un environnement virtuel ou pipx isole Ansible du Python système. Cette isolation change la portée de l’installation.",
    "Choisis une version maintenue hors exercice. Vérifie le chemin de l’exécutable si plusieurs versions coexistent.",
  ),
  9: l(
    "Le statut dit que MariaDB échoue. Les journaux aident à distinguer un problème de permissions d’une erreur de configuration ou d’un port occupé.",
    "Le répertoire de données appartient à mysql et le service démarre. La vérification porte sur l’état après correction.",
    "Utilise ls -ld /var/lib/mysql pour inspecter la cible avant de changer le propriétaire, puis relis systemctl status mariadb.",
    "Confirme la cause et le chemin avant une modification récursive. Ne remplace pas un changement de propriétaire par chmod 777.",
  ),
  10: l(
    "Le script rend les étapes de sauvegarde répétables. zip prépare une archive unique et scp la transfère vers le serveur de sauvegarde.",
    "Le serveur stbkp01 reçoit /tmp/news.zip et le script possède le bit exécutable. Un fichier créé uniquement sur stapp01 ne suffit pas.",
    "Dans un vrai environnement, tar et rsync peuvent remplacer zip et scp selon le besoin. bash fichier peut lire un script même sans bit x.",
    "Teste aussi la restauration de l’archive. En production, utilise un compte de sauvegarde à droits limités et une destination avec rétention.",
    {
      "/scripts/backup.sh":
        "#!/bin/bash indique l’interpréteur pour l’exécution directe. set -e arrête ce script simple si zip échoue. zip -r inclut les sous-dossiers. Dans scp, le deux-points sépare l’hôte distant du chemin de destination.",
    },
  ),
  11: l(
    "Tomcat doit d’abord disposer d’un connecteur HTTP sur le bon port, puis trouver l’application Java à déployer.",
    "Une requête vers stapp01:8086 répond avec le contenu de l’application ROOT.war.",
    "Tu peux modifier la valeur du connecteur dans server.xml avec un éditeur. Un fichier nommé app.war est généralement servi sous /app.",
    "Vérifie que le port est libre et lis les journaux du déploiement si Tomcat démarre mais que l’application ne répond pas.",
  ),
  12: l(
    "Une adresse et un port déjà utilisés empêchent généralement un deuxième service de s’y attacher. Il faut identifier le processus avant d’agir.",
    "ss montre le port 8087 et son occupant initial. Après correction, httpd écoute et curl reçoit une réponse locale.",
    "Sur une machine réelle, lsof ou les journaux d’Apache peuvent aussi identifier le conflit. Tu peux changer le port d’un service qui doit rester actif.",
    "Avant d’arrêter un service, vérifie son rôle et les dépendances. Un test HTTP complète la vérification du port.",
  ),
  13: l(
    "Les règles d’entrée sont lues dans l’ordre. La règle précise autorise le répartiteur, puis la règle générale bloque les autres sources sur ce port.",
    "Un appel depuis le répartiteur passe sur TCP 3003. Un appel depuis une autre source est bloqué, et la configuration est enregistrée.",
    "Les systèmes récents utilisent souvent nftables ou firewalld. Quel que soit l’outil, valide le trafic autorisé et le trafic bloqué.",
    "Conserve un accès d’administration et vérifie les règles déjà en place avant toute modification. Évite d’appliquer un blocage général sans voie de retour.",
  ),
  14: l(
    "ps répond à la question « quels processus existent ? ». systemctl explique l’état du service, y compris l’échec de son démarrage.",
    "httpd termine actif après avoir libéré le port. Un grep sans résultats au début de l’exercice est un indice, car Apache est arrêté.",
    "ss -tlnp identifie directement les sockets en écoute. Sur un vrai système, journalctl -u httpd donne le détail des derniers échecs.",
    "Préfère l’arrêt propre du service identifié. Vérifie ensuite son état et sa réponse HTTP, car un redémarrage n’est qu’une tentative.",
  ),
  15: l(
    "TLS s’appuie sur un certificat présenté au client et sur une clé privée qui reste côté serveur. Le bloc HTTPS relie ces fichiers au port 443.",
    "nginx -t valide la configuration et Nginx démarre avec le certificat configuré sur le port 443.",
    "Sur un site public réel, utilise un certificat délivré par une autorité reconnue et automatise son renouvellement.",
    "Protège la clé privée et valide la configuration avant de démarrer le service. Un certificat auto-signé peut déclencher une erreur de confiance côté client.",
    {
      "/etc/nginx/nginx.conf":
        "events configure la boucle d’événements. Le bloc http contient le serveur. listen 443 ssl active TLS et les directives ssl_certificate et ssl_certificate_key pointent vers les deux fichiers.",
    },
  ),
  16: l(
    "Le répartiteur reçoit la requête et la relaie à un serveur applicatif. Cela permet d’ajouter des instances derrière un point d’entrée commun.",
    "Les appels au répartiteur renvoient le contenu des hôtes stapp01, stapp02 et stapp03.",
    "Un autre équilibrage, par exemple least_conn sur Nginx, préfère les serveurs ayant le moins de connexions actives.",
    "Teste la santé des backends séparément avant de mettre en cause le proxy. Vérifie aussi le comportement quand l’un des backends est indisponible.",
    {
      "/etc/nginx/nginx.conf":
        "upstream apps nomme le groupe et énumère les backends sur le port 80. location / sélectionne toutes les requêtes de ce serveur et proxy_pass les transmet au groupe apps.",
    },
  ),
  17: l(
    "Le service PostgreSQL a besoin d’un répertoire de données initialisé. Ensuite un rôle de connexion peut devenir propriétaire de la base.",
    "PostgreSQL est actif, le rôle kodekloud_tim existe et possède la base kodekloud_db1.",
    "Dans psql, les requêtes peuvent être saisies en mode interactif ou chargées depuis un fichier SQL. Dans ce lab, -c transmet une instruction à la fois.",
    "N’initialise jamais un nouveau cluster par-dessus des données existantes. Les mots de passe de cet exercice sont fictifs.",
  ),
  18: l(
    "La base stocke les données. L’utilisateur s’authentifie. GRANT détermine ses droits sur un périmètre précis.",
    "La base kodekloud_db existe, le compte kodekloud_aim est créé et les droits ciblent kodekloud_db.*.",
    "Les trois instructions SQL peuvent être lancées séparément dans mysql, ce qui facilite l’identification d’une erreur.",
    "En production, limite l’origine des connexions et les privilèges aux opérations requises. Le joker % et les mots de passe fictifs facilitent ici la simulation.",
  ),
  19: l(
    "Apache traduit les chemins d’URL en fichiers sous DocumentRoot. Avec deux sous-dossiers, un même serveur peut desservir deux chemins distincts.",
    "Apache écoute sur 6400 et /news/ ainsi que /cluster/ renvoient chacun leur page.",
    "Des VirtualHosts séparent davantage les sites si chacun doit avoir son propre nom de domaine ou ses propres journaux.",
    "Teste les deux URL après la copie. Vérifie les droits de lecture, les ports autorisés et la configuration avant une mise en service.",
  ),
  20: l(
    "Nginx reçoit la requête HTTP et transmet les demandes PHP à PHP-FPM. Les deux services doivent s’accorder sur le chemin du socket local.",
    "Le socket configuré correspond des deux côtés et la page PHP est traitée par PHP-FPM.",
    "Une adresse TCP locale peut remplacer le socket Unix quand l’architecture l’exige. Dans une configuration réelle, prévois aussi les paramètres FastCGI attendus par PHP-FPM.",
    "Vérifie les permissions du socket et les journaux des deux services en cas de 502. Évite d’exposer directement PHP-FPM au public.",
    {
      "/etc/php-fpm.d/www.conf":
        "[www] identifie le pool. user et group fixent l’identité des processus PHP. listen indique le chemin du socket à créer.",
      "/etc/nginx/nginx.conf":
        "root indique où se trouve le site. index index.php choisit l’entrée par défaut. location ~ sélectionne les chemins se terminant en .php et fastcgi_pass envoie la requête au socket.",
    },
  ),
};
