import { lesson as l, type Lesson } from "./types";

export const kubernetesLessons: Record<number, Lesson> = {
  48: l(
    "Un pod est l’unité que Kubernetes lance pour exécuter un ou plusieurs conteneurs. Les labels permettent de retrouver et de sélectionner ces pods.",
    "pod-nginx existe avec le label app=nginx_app. Le statut indique si le conteneur a démarré.",
    "Un manifeste Pod appliqué avec kubectl apply décrit la même ressource dans un fichier.",
    "Utilise kubectl get puis describe si le pod reste en attente. Pour une application durable, envisage un Deployment.",
  ),
  49: l(
    "Un Deployment maintient le nombre de pods souhaité et organise les mises à jour à partir d’un modèle commun.",
    "kubectl get deployments liste nginx. Observe le nombre de réplicas disponibles.",
    "Décris le Deployment et son conteneur en YAML pour pouvoir relire et versionner la configuration.",
    "Vérifie la cohérence entre les sélecteurs et les labels des pods.",
  ),
  50: l(
    "Le scheduler tient compte des requests pour choisir un nœud. Les limits bornent la consommation que le conteneur peut atteindre.",
    "La description du pod présente les requests et limits. 100m CPU vaut 0,1 CPU et Mi exprime des mébioctets.",
    "En production, pars de mesures puis ajuste les valeurs. Une limite CPU peut ralentir un processus et une limite mémoire dépassée peut entraîner son arrêt.",
    "Dimensionne chaque conteneur et garde une marge compatible avec la capacité du cluster.",
    {
      "pod.yaml":
        "metadata.name identifie le pod. spec.containers décrit son conteneur. resources.requests réserve 100m CPU et 64Mi de mémoire pour la planification. resources.limits fixe les limites à 200m et 128Mi.",
    },
  ),
  51: l(
    "Changer l’image dans le modèle du Deployment crée une nouvelle révision et déclenche un remplacement progressif des pods.",
    "La révision utilise nginx:1.19 et rollout status confirme la fin du déploiement.",
    "Modifie image dans le manifeste versionné et applique-le pour conserver une trace du changement.",
    "Utilise des images identifiables et des sondes de disponibilité sur un vrai cluster. Surveille le déploiement avant de le déclarer terminé.",
  ),
  52: l(
    "Un Deployment conserve des révisions. Revenir à une révision restaure son modèle de pods et lance un nouveau déploiement avec cette configuration.",
    "La nouvelle révision utilise à nouveau l’image précédente.",
    "Sur un vrai cluster, rollout undo --to-revision=NUMÉRO cible une révision précise. Tu peux aussi restaurer la version du manifeste dans Git.",
    "Repère la révision cible avant de revenir en arrière et confirme la disponibilité après le rollback.",
  ),
  53: l(
    "Le nom du volume identifie ce que tu montes. mountPath indique où ce volume apparaît dans le conteneur.",
    "Nginx voit le volume web sous /var/www/html. L’opération de remplacement recrée le pod.",
    "Pour un pod géré par un Deployment, modifie le modèle de pods et laisse le contrôleur les remplacer progressivement.",
    "replace --force peut interrompre un pod et perdre son emptyDir. Vérifie la portée et l’impact avant de recréer une ressource.",
    {
      "pod.yaml":
        "volumes déclare web. volumeMounts sélectionne web par son nom et l’expose dans le conteneur à /var/www/html. emptyDir démarre vide à la création du pod.",
    },
  ),
  54: l(
    "Deux conteneurs du même pod peuvent monter un même volume. Un fichier écrit dans ce volume devient visible dans les deux conteneurs.",
    "ls dans volume-container-1 montre message.txt, écrit par volume-container-2.",
    "Utilise un PVC quand les données doivent survivre à la suppression du pod.",
    "Choisis explicitement quels conteneurs peuvent écrire. emptyDir disparaît avec le pod.",
    {
      "shared.yaml":
        "Les deux volumeMounts pointent vers news. Le second conteneur exécute sh -c pour rédiger message.txt dans le répertoire partagé. sleep maintient les conteneurs actifs le temps de l’exercice.",
    },
  ),
  55: l(
    "Un sidecar accompagne le conteneur principal. Ici il peut lire les journaux dans le même volume sans modifier le code du serveur web.",
    "Le pod webserver contient Nginx et le sidecar, et kubectl logs cible le conteneur sidecar-container.",
    "Sur un vrai cluster, écrire les journaux sur la sortie standard et les collecter au niveau nœud peut éviter un sidecar par pod.",
    "Vérifie le chemin des journaux, la rotation et le coût en ressources du conteneur auxiliaire.",
    {
      "sidecar.yaml":
        "Le volume logs est monté dans les deux conteneurs. sh -c lance tail -f, qui suit les nouvelles lignes du fichier access.log.",
    },
  ),
  56: l(
    "Les pods peuvent être remplacés. Un Service reste un point d’entrée stable et choisit les pods par label.",
    "Le service nginx-deployment sélectionne les pods Nginx et publie le NodePort 30011.",
    "Utilise ClusterIP pour un trafic interne. Pour exposer du HTTP en production, un Ingress ou une Gateway peut regrouper les accès.",
    "Vérifie le sélecteur et les ports avant d’ouvrir un accès extérieur.",
    {
      "service.yaml":
        "selector associe le Service aux pods. port est le port du Service, targetPort celui du conteneur, nodePort celui qui est exposé sur les nœuds.",
    },
  ),
  57: l(
    "Les variables d’environnement apportent des réglages au moment du lancement. Le shell de l’exemple développe les variables quand le conteneur démarre.",
    "kubectl logs affiche Bonjour Jelo. Le pod est prévu pour exécuter une tâche courte.",
    "Un ConfigMap peut centraliser les réglages réutilisés. Pour un secret, utilise une ressource et un mécanisme adaptés.",
    "Évite d’écrire des secrets dans les logs. Pour une tâche ponctuelle sur un vrai cluster, définis une politique de redémarrage appropriée ou utilise un Job.",
    {
      "env.yaml":
        "env fournit GREETING et NAME. command lance sh -c afin que le shell interprète les dollars dans echo. Les guillemets gardent les deux mots dans une seule chaîne.",
    },
  ),
  58: l(
    "Grafana écoute dans le conteneur sur 3000. Le Service offre un point d’entrée pour joindre cette interface.",
    "Le Deployment apparaît et le Service publie le NodePort 32000.",
    "kubectl port-forward peut donner un accès local temporaire sans exposer un port sur chaque nœud.",
    "Pour un accès partagé réel, prévois TLS et contrôle des accès. Pour conserver les tableaux de bord, configure un stockage persistant.",
    {
      "service.yaml":
        "type NodePort utilise le port 32000 des nœuds. Le trafic arrive au port cible 3000 des pods sélectionnés par app=grafana.",
    },
  ),
  59: l(
    "Le statut du pod révèle un blocage. describe permet de lire les événements avant de modifier le Deployment qui produit ce pod.",
    "Le Deployment Redis utilise une image valide et dispose à nouveau d’un pod actif.",
    "Une mise à jour d’image ciblée peut se faire avec kubectl set image. Une modification dans Git reste plus simple à relire.",
    "Vérifie le nom du registre, le tag et l’accès au registre avant de conclure que l’image est défectueuse.",
    {
      "deployment/redis-deployment":
        "template.spec.containers contient le nom et l’image du conteneur Redis. Le manifeste propose redis:7 et garde le même sélecteur de pods.",
    },
  ),
  60: l(
    "Le PV décrit l’offre de stockage. Le PVC est une demande de stockage. Le pod monte le volume trouvé par ce PVC.",
    "Le PVC est associé à news-pv et le pod peut monter son volume. Regarde le statut Bound dans la liste.",
    "Une StorageClass peut provisionner les volumes à la demande au lieu de créer le PV à la main.",
    "hostPath convient à un lab local. En production, choisis un stockage adapté aux déplacements entre nœuds et à la sauvegarde.",
    {
      "pv.yaml":
        "Les séparateurs --- distinguent le PV, le PVC et le pod. La demande cite news-pv via volumeName. Le pod monte le PVC. ReadWriteOnce décrit un montage en lecture-écriture par un seul nœud.",
    },
  ),
  61: l(
    "Un init container doit réussir avant le démarrage des conteneurs principaux. Un volume partagé permet de transmettre son fichier à l’application.",
    "Les logs de init sont accessibles et le fichier ready.txt peut être lu par le conteneur principal dans /work.",
    "Un Job convient mieux si une préparation doit se produire une seule fois pour l’ensemble d’un déploiement.",
    "Rends l’initialisation rejouable et consulte ses logs en cas de démarrage bloqué.",
    {
      "init.yaml":
        "initContainers décrit la préparation. echo écrit Ready dans le volume shared. Le conteneur principal monte shared au même chemin.",
    },
  ),
  62: l(
    "Un Secret contient des données à fournir au conteneur. Le montage présente ses clés sous forme de fichiers.",
    "Le Secret news existe et le pod monte son fichier à l’emplacement prévu.",
    "Une variable via secretKeyRef convient si l’application lit sa configuration dans l’environnement.",
    "L’encodage Base64 ne protège pas un secret. Limite les accès et évite de versionner les valeurs réelles.",
    {
      "secret-pod.yaml":
        "volumes.secret.secretName référence news. volumeMounts expose le Secret sous /run/secrets/news. Le nom news.txt devient le nom du fichier monté.",
    },
  ),
  63: l(
    "Un namespace organise les ressources d’une application. Deux Deployments et deux Services distinguent la galerie de sa base.",
    "Dans iron-namespace-xfusion, chaque composant dispose d’un Deployment et d’un Service.",
    "Tu peux mettre le namespace dans le manifeste ou sélectionner celui de la commande quand les ressources ne le fixent pas déjà.",
    "Sur un vrai cluster, un namespace n’installe pas à lui seul de règles réseau entre applications.",
    {
      "iron.yaml":
        "Les documents déclarent les deux Deployments et leurs Services, tous dans iron-namespace-xfusion. Les sélecteurs dirigent chacun des Services vers son propre composant.",
    },
  ),
  64: l(
    "Une image incorrecte empêche un conteneur de démarrer. Un targetPort incorrect peut casser le trafic même quand le pod tourne.",
    "Le pod utilise une image Python valide et déclare le port 5000 attendu par le Service.",
    "Sur un vrai cluster, tu peux modifier le Service si c’est lui qui désigne le mauvais port et que le processus écoute déjà au bon endroit.",
    "Vérifie aussi le port réellement écouté par le processus. containerPort seul ne démarre aucune application.",
    {
      "deployment/python-deployment":
        "image passe à python:3.11-slim. ports.containerPort décrit le port 5000 attendu par python-service.",
    },
  ),
  65: l(
    "Un ConfigMap sépare les valeurs ordinaires de l’image déployée. Le volume met la configuration à disposition dans le conteneur.",
    "Le Deployment Redis référence my-redis-config et le monte sous /etc/redis.",
    "Un manifeste ConfigMap permet de stocker un redis.conf complet. Dans Redis réel, configure le processus pour qu’il lise effectivement ce fichier.",
    "Vérifie si l’application relit les fichiers modifiés ou si un redémarrage est nécessaire.",
    {
      "redis.yaml":
        "volumes.configMap référence my-redis-config. volumeMounts place son contenu sous /etc/redis. Le lab vérifie la présence du montage.",
    },
  ),
  66: l(
    "MySQL a besoin d’un disque pour les données, d’un identifiant pour l’initialisation et d’un Service pour les connexions internes.",
    "Le PVC se lie au PV, le conteneur référence la clé password du Secret et le Service vise le port 3306.",
    "Sur un vrai cluster, un StatefulSet ou un opérateur peut mieux gérer l’identité et le stockage d’une base durable.",
    "Sauvegarde les données indépendamment du déploiement et garde le port de la base privé.",
    {
      "mysql.yaml":
        "Le PVC fournit le volume monté sous /var/lib/mysql. valueFrom.secretKeyRef lit MYSQL_ROOT_PASSWORD dans le Secret. Le Service expose MySQL à l’intérieur du cluster.",
    },
  ),
  67: l(
    "Guestbook relie plusieurs composants. Chacun possède un modèle de pods et une adresse stable fournie par son Service.",
    "Les Deployments et Services du frontend, de redis-master et de redis-slave sont présents.",
    "Tu peux découper le manifeste en fichiers par composant et les appliquer ensemble depuis un répertoire.",
    "Vérifie la santé de chaque composant avant de tester le parcours utilisateur de bout en bout.",
    {
      "guestbook.yaml":
        "Les documents YAML déclarent les trois Deployments et leurs Services. Le frontend écoute sur 80, les services Redis sur 6379. Les labels relient chaque Service à ses pods.",
    },
  ),
};
