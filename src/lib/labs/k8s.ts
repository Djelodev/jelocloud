import { stringify } from "yaml";
import { containerLogs, deployment, kubeObject, podSpec, podStatus, seedKube, type KubeObject } from "../engine/k8s";
import { writeFile } from "../engine/world";
import type { World } from "../engine";
import { check, commands, edit, host, scenario, type Step } from "./scenario";

type PodSpec = NonNullable<ReturnType<typeof podSpec>>;
type Spec = NonNullable<KubeObject["spec"]>;
const resource = (kind: string, name: string, spec: Spec, namespace?: string): KubeObject => ({
  apiVersion: kind === "Deployment" ? "apps/v1" : "v1", kind, metadata: { name, ...(namespace ? { namespace } : {}) }, spec,
});
const pod = (name: string, containers: PodSpec["containers"], extra: Partial<PodSpec> = {}) =>
  resource("Pod", name, { containers, ...extra });
const service = (name: string, app: string, port: number, nodePort?: number, namespace?: string, targetPort = port) =>
  resource("Service", name, { selector: { app }, type: nodePort ? "NodePort" : "ClusterIP",
    ports: [{ port, targetPort, ...(nodePort ? { nodePort } : {}) }] }, namespace);
const mounts = (name: string, mountPath: string) => [{ name, mountPath }];
const run = (name: string, command: string, volumeMounts?: PodSpec["containers"][number]["volumeMounts"]) => ({
  name, image: "busybox:latest", command: ["sh", "-c", command], ...(volumeMounts ? { volumeMounts } : {}),
});
const yaml = (...objects: KubeObject[]) => objects.map((o) => stringify(o)).join("---\n");
const ready = (w: World, kind: string, name: string, ns?: string) => {
  const o = kubeObject(w, kind, name, ns);
  return !!o && podStatus(w, o) === "Running";
};
const deployed = (w: World, name: string, ns?: string) => kubeObject(w, "Deployment", name, ns);
const container = (w: World, name: string, kind = "Pod") => podSpec(kubeObject(w, kind, name))?.containers[0];
const publish = (path: string, ...documents: KubeObject[]) => [edit(path, yaml(...documents)), ...commands("kubectl apply -f " + path)];
const volume = (name: string) => ({
  ...resource("PersistentVolume", name, { capacity: { storage: "1Gi" } }),
  spec: { capacity: { storage: "1Gi" }, accessModes: ["ReadWriteOnce"], hostPath: { path: "/mnt/" + name } },
});
const claim = (name: string, volumeName: string) => ({
  ...resource("PersistentVolumeClaim", name, { volumeName }),
  spec: { volumeName, accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "1Gi" } } },
});

export function kubernetes(day: number, steps: Step[]) {
  const lab = (solution: Step[], label: string, test: (w: World) => boolean, setup?: (w: World) => void) =>
    scenario(solution, [check(label, test)], (w) => {
      writeFile(host(w), "/usr/local/bin/kubectl", "kubectl", "root", 0o755);
      setup?.(w);
    });
  switch (day) {
    case 48: return lab(steps, "pod-nginx tourne avec le label demandé", (w) =>
      ready(w, "Pod", "pod-nginx") && kubeObject(w, "Pod", "pod-nginx")?.metadata.labels?.["app"] === "nginx_app");
    case 49: return lab(steps, "Le Deployment nginx possède un pod disponible", (w) =>
      ready(w, "Deployment", "nginx") && podSpec(deployed(w, "nginx"))?.containers[0]?.image.startsWith("nginx") === true);
    case 50: {
      const requests = { cpu: "100m", memory: "64Mi" };
      const limits = { cpu: "200m", memory: "128Mi" };
      return lab([...publish("pod.yaml", pod("httpd-pod", [{ name: "httpd", image: "httpd:2.4", resources: { requests, limits } }])), steps[2]!],
        "Le pod httpd réserve 100m / 64Mi et limite à 200m / 128Mi", (w) => {
          const r = container(w, "httpd-pod")?.resources;
          return ready(w, "Pod", "httpd-pod") && r?.requests?.["cpu"] === "100m" && r.requests["memory"] === "64Mi" &&
            r.limits?.["cpu"] === "200m" && r.limits["memory"] === "128Mi";
        });
    }
    case 51: case 52: {
      const name = "nginx-deployment";
      const initial = deployment(name, "nginx:1.18", "nginx-container", 3);
      const updated = deployment(name, "nginx:1.19", "nginx-container", 3);
      return lab(steps, day === 51 ? "Les 3 réplicas Nginx utilisent l’image 1.19" : "Les 3 réplicas Nginx sont revenus à l’image 1.18", (w) =>
        ready(w, "Deployment", name) && deployed(w, name)?.spec?.replicas === 3 &&
        container(w, name, "Deployment")?.image === (day === 51 ? "nginx:1.19" : "nginx:1.18"),
      (w) => { seedKube(w, initial); if (day === 52) seedKube(w, updated); });
    }
    case 53: {
      const spec = (name: string) => pod("nginx-phpfpm", [{ name: "nginx", image: "nginx", volumeMounts: mounts(name, "/var/www/html") }],
        { volumes: [{ name: "web", emptyDir: {} }] });
      return lab([steps[0]!, edit("pod.yaml", yaml(spec("web"))), steps[2]!], "Nginx monte le volume web et le pod tourne", (w) =>
        ready(w, "Pod", "nginx-phpfpm") && container(w, "nginx-phpfpm")?.volumeMounts?.some((m) => m.name === "web" && m.mountPath === "/var/www/html") === true,
      (w) => {
        const broken = spec("web");
        podSpec(broken)!.containers[0]!.volumeMounts = mounts("web", "/usr/share/nginx/html");
        seedKube(w, broken);
      });
    }
    case 54: return lab([...publish("shared.yaml", pod("volume-share", [
      run("volume-container-1", "sleep 3600", mounts("news", "/tmp/news")),
      run("volume-container-2", "echo Bonjour > /tmp/news/message.txt; sleep 3600", mounts("news", "/tmp/news")),
    ], { volumes: [{ name: "news", emptyDir: {} }] })), steps[2]!],
    "Les deux conteneurs partagent le volume emptyDir news", (w) => {
      const spec = podSpec(kubeObject(w, "Pod", "volume-share"));
      return ready(w, "Pod", "volume-share") && spec?.containers.length === 2 &&
        spec.containers.every((c) => c.volumeMounts?.some((m) => m.name === "news" && m.mountPath === "/tmp/news")) &&
        spec.volumes?.some((v) => v.name === "news" && !!v.emptyDir) === true;
    });
    case 55: return lab([...publish("sidecar.yaml", pod("webserver", [
      { name: "nginx", image: "nginx:alpine", volumeMounts: mounts("logs", "/var/log/nginx") },
      run("sidecar-container", "tail -f /var/log/nginx/access.log", mounts("logs", "/var/log/nginx")),
    ], { volumes: [{ name: "logs", emptyDir: {} }] })), steps[2]!],
    "Le sidecar et Nginx utilisent le même volume de logs", (w) => {
      const spec = podSpec(kubeObject(w, "Pod", "webserver"));
      return ready(w, "Pod", "webserver") && spec?.containers.some((c) => c.name === "nginx" && c.image.startsWith("nginx") &&
        c.volumeMounts?.some((m) => m.name === "logs")) === true &&
        spec.containers.some((c) => c.name === "sidecar-container" && c.command?.some((v) => v.includes("tail")) &&
          c.volumeMounts?.some((m) => m.name === "logs"));
    });
    case 56: case 58: {
      const isNginx = day === 56;
      const name = isNginx ? "nginx-deployment" : "grafana";
      const port = isNginx ? 80 : 3000;
      const nodePort = isNginx ? 30011 : 32000;
      return lab([steps[0]!, ...publish("service.yaml", service(name, name, port, nodePort)), steps[2]!],
        `Le Service sélectionne les pods de ${name} sur le NodePort ${nodePort}`, (w) => {
          const s = kubeObject(w, "Service", name)?.spec;
          const d = deployed(w, name);
          return ready(w, "Deployment", name) && (!isNginx || d?.spec?.replicas === 3) && s?.type === "NodePort" &&
            s.ports?.some((p) => p.nodePort === nodePort && p.port === port && p.targetPort === port) === true &&
            JSON.stringify(s.selector) === JSON.stringify(d?.spec?.template?.metadata?.labels);
        });
    }
    case 57: {
      const name = "print-envars-greeting";
      return lab([...publish("env.yaml", pod(name, [{
        ...run("greeting", "echo \"$GREETING $NAME\""), env: [{ name: "GREETING", value: "Bonjour" }, { name: "NAME", value: "Jelo" }],
      }])), steps[2]!], "Les logs affichent Bonjour Jelo depuis les variables du conteneur", (w) => {
        const c = container(w, name);
        return !!c && c.env?.some((e) => e.name === "GREETING") === true && c.env.some((e) => e.name === "NAME") &&
          containerLogs(c) === "Bonjour Jelo";
      });
    }
    case 59: {
      const name = "redis-deployment";
      return lab([steps[0]!, ...commands("kubectl describe pod redis-deployment-1-1"),
        edit("deployment/" + name, yaml(deployment(name, "redis:7", "redis")), "kubectl edit deployment " + name)],
      "L’image Redis est valide et le Deployment est disponible", (w) =>
        ready(w, "Deployment", name) && container(w, name, "Deployment")?.image.startsWith("redis:") === true,
      (w) => seedKube(w, deployment(name, "redis:bad-tag", "redis")));
    }
    case 60: return lab([...publish("pv.yaml", volume("news-pv"), claim("news-pvc", "news-pv"),
      pod("news-pod", [{ name: "nginx", image: "nginx", volumeMounts: mounts("news", "/usr/share/nginx/html") }],
        { volumes: [{ name: "news", persistentVolumeClaim: { claimName: "news-pvc" } }] })), steps[2]!],
    "Le pod monte le PVC news-pvc associé au PV news-pv", (w) =>
      ready(w, "Pod", "news-pod") && kubeObject(w, "PersistentVolume", "news-pv")?.spec?.capacity?.["storage"] === "1Gi" &&
      kubeObject(w, "PersistentVolumeClaim", "news-pvc")?.spec?.volumeName === "news-pv" &&
      podSpec(kubeObject(w, "Pod", "news-pod"))?.volumes?.some((v) => v.persistentVolumeClaim?.claimName === "news-pvc") === true);
    case 61: {
      const d = deployment("ic-deploy-xfusion", "busybox", "main");
      d.spec!.template!.spec = {
        initContainers: [run("init", "echo Ready > /work/ready.txt", mounts("shared", "/work"))],
        containers: [run("main", "sleep 3600", mounts("shared", "/work"))], volumes: [{ name: "shared", emptyDir: {} }],
      };
      return lab([...publish("init.yaml", d), ...commands("kubectl logs deploy/ic-deploy-xfusion -c init")],
        "L’init container prépare ready.txt dans le volume partagé", (w) => {
          const spec = podSpec(deployed(w, "ic-deploy-xfusion"));
          return ready(w, "Deployment", "ic-deploy-xfusion") &&
            spec?.initContainers?.some((c) => c.command?.some((line) => line.includes("/work/ready.txt")) &&
            c.volumeMounts?.some((m) => m.name === "shared")) === true &&
            spec.containers.some((c) => c.volumeMounts?.some((m) => m.name === "shared"));
        });
    }
    case 62: return lab([steps[0]!, ...publish("secret-pod.yaml",
      pod("secret-pod", [run("reader", "sleep 3600", mounts("news", "/run/secrets/news"))],
        { volumes: [{ name: "news", secret: { secretName: "news" } }] })), steps[2]!],
    "Le pod monte le Secret news contenant news.txt", (w) =>
      ready(w, "Pod", "secret-pod") && kubeObject(w, "Secret", "news")?.data?.["news.txt"] === btoa("Jelo News\n") &&
      podSpec(kubeObject(w, "Pod", "secret-pod"))?.volumes?.some((v) => v.secret?.secretName === "news") === true,
    (w) => writeFile(host(w), "/opt/news.txt", "Jelo News\n"));
    case 63: {
      const ns = "iron-namespace-xfusion";
      const frontend = deployment("iron-gallery", "kodekloud/iron-gallery");
      const db = deployment("iron-db", "kodekloud/iron-db");
      for (const d of [frontend, db]) d.metadata.namespace = ns;
      return lab([steps[0]!, ...publish("iron.yaml", frontend, db, service("iron-gallery", "iron-gallery", 80, undefined, ns),
        service("iron-db", "iron-db", 3306, undefined, ns)), steps[2]!],
      "La galerie et sa DB ont chacune un Deployment et un Service dans le namespace Iron", (w) =>
        !!kubeObject(w, "Namespace", ns) && ["iron-gallery", "iron-db"].every((name) =>
          ready(w, "Deployment", name, ns) && kubeObject(w, "Service", name, ns)?.spec?.selector &&
          JSON.stringify(kubeObject(w, "Service", name, ns)?.spec?.selector) === JSON.stringify(deployed(w, name, ns)?.spec?.template?.metadata?.labels)));
    }
    case 64: {
      const name = "python-deployment";
      const bad = deployment(name, "python:no-such-tag", "python");
      const fixed = deployment(name, "python:3.11-slim", "python");
      podSpec(fixed)!.containers[0]!.ports = [{ containerPort: 5000 }];
      return lab([steps[0]!, edit("deployment/" + name, yaml(fixed), "kubectl edit deployment " + name), steps[2]!],
        "L’image Python démarre et le port cible du Service correspond au conteneur", (w) =>
          ready(w, "Deployment", name) && container(w, name, "Deployment")?.ports?.some((p) =>
            p.containerPort === kubeObject(w, "Service", "python-service")?.spec?.ports?.[0]?.targetPort) === true,
        (w) => { seedKube(w, bad); seedKube(w, service("python-service", name, 80, undefined, undefined, 5000)); });
    }
    case 65: {
      const d = deployment("redis-deployment", "redis:7", "redis");
      podSpec(d)!.volumes = [{ name: "config", configMap: { name: "my-redis-config" } }];
      podSpec(d)!.containers[0]!.volumeMounts = mounts("config", "/etc/redis");
      return lab([steps[0]!, ...publish("redis.yaml", d)], "Redis utilise le ConfigMap my-redis-config", (w) =>
        ready(w, "Deployment", "redis-deployment") && kubeObject(w, "ConfigMap", "my-redis-config")?.data?.["maxmemory"] === "2mb" &&
        podSpec(deployed(w, "redis-deployment"))?.volumes?.some((v) => v.configMap?.name === "my-redis-config") === true);
    }
    case 66: {
      const d = deployment("mysql", "mysql:8");
      podSpec(d)!.volumes = [{ name: "data", persistentVolumeClaim: { claimName: "mysql-pvc" } }];
      Object.assign(podSpec(d)!.containers[0]!, {
        volumeMounts: mounts("data", "/var/lib/mysql"),
        env: [{ name: "MYSQL_ROOT_PASSWORD", valueFrom: { secretKeyRef: { name: "mysql-root-pass", key: "password" } } }],
      });
      return lab([steps[0]!, ...publish("mysql.yaml", volume("mysql-pv"), claim("mysql-pvc", "mysql-pv"), d, service("mysql", "mysql", 3306)), steps[2]!],
        "MySQL utilise un Secret, un PVC associé à son PV et un Service", (w) => {
          const spec = podSpec(deployed(w, "mysql"));
          return ready(w, "Deployment", "mysql") &&
            !!kubeObject(w, "Secret", "mysql-root-pass")?.data?.["password"] &&
            !!kubeObject(w, "PersistentVolume", "mysql-pv") &&
            kubeObject(w, "PersistentVolumeClaim", "mysql-pvc")?.spec?.volumeName === "mysql-pv" &&
            kubeObject(w, "Service", "mysql")?.spec?.ports?.[0]?.targetPort === 3306 &&
            spec?.volumes?.some((v) => v.persistentVolumeClaim?.claimName === "mysql-pvc") === true &&
            spec.containers[0]?.env?.some((e) => e.name === "MYSQL_ROOT_PASSWORD" &&
              e.valueFrom?.secretKeyRef?.name === "mysql-root-pass" && e.valueFrom.secretKeyRef.key === "password") === true;
        });
    }
    case 67: {
      const roles = [["redis-master", "redis:7", 6379], ["redis-slave", "gcr.io/google-samples/gb-redisslave:v1", 6379],
        ["frontend", "gcr.io/google-samples/gb-frontend:v4", 80]] as const;
      return lab([...publish("guestbook.yaml", ...roles.flatMap(([name, image, port]) => [
        deployment(name, image, name, name === "redis-master" ? 1 : 2), service(name, name, port),
      ])), steps[1]!], "Les trois composants de Guestbook tournent et sont joignables par leurs Services", (w) =>
        roles.every(([name, image, port]) => ready(w, "Deployment", name) && container(w, name, "Deployment")?.image === image &&
          kubeObject(w, "Service", name)?.spec?.ports?.[0]?.port === port));
    }
    default: throw new Error("Jour Kubernetes inconnu");
  }
}
