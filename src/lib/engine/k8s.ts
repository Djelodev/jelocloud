import { parseAllDocuments, stringify } from "yaml";
import { abs } from "./shell";
import { CMDS, err, ok, opt } from "./types";
import { readFile, type World } from "./world";

type Labels = Record<string, string>;
type Container = {
  name: string;
  image: string;
  command?: string[];
  args?: string[];
  env?: { name: string; value?: string; valueFrom?: { secretKeyRef?: { name: string; key: string } } }[];
  resources?: { requests?: Labels; limits?: Labels };
  ports?: { containerPort: number }[];
  volumeMounts?: { name: string; mountPath: string }[];
};
type Volume = {
  name: string;
  emptyDir?: object;
  secret?: { secretName: string };
  configMap?: { name: string };
  persistentVolumeClaim?: { claimName: string };
};
type PodSpec = { containers: Container[]; initContainers?: Container[]; volumes?: Volume[] };
type Metadata = { name: string; namespace?: string; labels?: Labels };
type Spec = Partial<PodSpec> & {
  replicas?: number;
  template?: { metadata?: Pick<Metadata, "labels">; spec: PodSpec };
  selector?: Labels | { matchLabels: Labels };
  type?: string;
  ports?: { port: number; targetPort?: number | string; nodePort?: number }[];
  capacity?: Labels;
  resources?: { requests: Labels };
  volumeName?: string;
};
export type KubeObject = {
  apiVersion: string;
  kind: string;
  metadata: Metadata;
  spec?: Spec;
  data?: Labels;
  stringData?: Labels;
};
export type K8s = { objects: KubeObject[]; history: Record<string, KubeObject[]> };

const kinds: Record<string, string> = {
  po: "Pod", pod: "Pod", pods: "Pod",
  deploy: "Deployment", deployment: "Deployment", deployments: "Deployment",
  svc: "Service", service: "Service", services: "Service",
  ns: "Namespace", namespace: "Namespace", namespaces: "Namespace",
  cm: "ConfigMap", configmap: "ConfigMap", configmaps: "ConfigMap",
  secret: "Secret", secrets: "Secret",
  pv: "PersistentVolume", persistentvolume: "PersistentVolume", persistentvolumes: "PersistentVolume",
  pvc: "PersistentVolumeClaim", persistentvolumeclaim: "PersistentVolumeClaim", persistentvolumeclaims: "PersistentVolumeClaim",
};
const clusterScoped = (kind: string) => kind === "Namespace" || kind === "PersistentVolume";
const namespaceOf = (o: KubeObject) => o.metadata.namespace ?? "default";
const key = (o: KubeObject) => [namespaceOf(o), o.kind, o.metadata.name].join("/");
const copy = (o: KubeObject): KubeObject => structuredClone(o);

export function kubeObject(w: World, kind: string, name: string, namespace = "default") {
  return w.k8s.objects.find((o) =>
    o.kind === kind && o.metadata.name === name && (clusterScoped(kind) || namespaceOf(o) === namespace),
  );
}
export function podSpec(o: KubeObject | undefined) {
  return o?.kind === "Deployment" ? o.spec?.template?.spec : o?.spec?.containers ? o.spec as PodSpec : undefined;
}
export function deployment(name: string, image: string, container = name, replicas = 1): KubeObject {
  const labels = { app: name };
  return {
    apiVersion: "apps/v1", kind: "Deployment", metadata: { name },
    spec: {
      replicas, selector: { matchLabels: labels },
      template: { metadata: { labels }, spec: { containers: [{ name: container, image }] } },
    },
  };
}
export function seedKube(w: World, o: KubeObject) {
  const at = w.k8s.objects.findIndex((x) => key(x) === key(o));
  const previous = w.k8s.objects[at];
  if (o.kind === "Deployment" && JSON.stringify(previous?.spec?.template) !== JSON.stringify(o.spec?.template)) {
    const revisions = w.k8s.history[key(o)] ??= [];
    revisions.push(copy(o));
  }
  if (previous) w.k8s.objects[at] = copy(o);
  else w.k8s.objects.push(copy(o));
}

function documents(input: string): KubeObject[] {
  const out: KubeObject[] = [];
  for (const doc of parseAllDocuments(input)) {
    if (doc.errors.length) throw new Error(doc.errors[0]?.message);
    const value: unknown = doc.toJS();
    if (value === null) continue;
    if (!value || typeof value !== "object") throw new Error("invalid manifest");
    const resource = value as KubeObject;
    if (typeof resource.apiVersion !== "string" || !Object.values(kinds).includes(resource.kind) ||
        typeof resource.metadata?.name !== "string") throw new Error("apiVersion, supported kind and metadata.name are required");
    out.push(resource);
  }
  if (!out.length) throw new Error("no objects passed to apply");
  return out;
}
function validate(w: World, o: KubeObject) {
  const name = o.metadata.name;
  if (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(name)) throw new Error(`invalid resource name: ${name}`);
  if (!clusterScoped(o.kind) && !["default", "kube-system", "kube-public"].includes(namespaceOf(o)) &&
      !kubeObject(w, "Namespace", namespaceOf(o))) throw new Error(`namespaces "${namespaceOf(o)}" not found`);
  if (o.kind === "Deployment" || o.kind === "Pod") {
    const spec = podSpec(o);
    if (!Array.isArray(spec?.containers) || !spec.containers.length) throw new Error("spec.containers: Required value");
    if (o.kind === "Deployment" && (!Number.isInteger(o.spec?.replicas ?? 1) || (o.spec?.replicas ?? 1) < 0)) {
      throw new Error("spec.replicas must be a non-negative integer");
    }
    const array = (value: unknown) => value === undefined || Array.isArray(value);
    if (!array(spec.volumes) || !array(spec.initContainers) || spec.volumes?.some((v) =>
      !v || typeof v.name !== "string" ||
      v.secret && typeof v.secret.secretName !== "string" ||
      v.configMap && typeof v.configMap.name !== "string" ||
      v.persistentVolumeClaim && typeof v.persistentVolumeClaim.claimName !== "string")) {
      throw new Error("invalid volumes or initContainers");
    }
    const names = new Set<string>();
    for (const container of [...spec.containers, ...spec.initContainers ?? []]) {
      if (!container || typeof container.name !== "string" || typeof container.image !== "string" || !container.name || !container.image) {
        throw new Error("container name and image are required");
      }
      if (names.has(container.name)) throw new Error("container names must be unique");
      names.add(container.name);
      if (!array(container.volumeMounts) || !array(container.env) || !array(container.command) ||
          !array(container.args) || !array(container.ports) ||
          container.env?.some((e) => !e || typeof e.name !== "string") ||
          container.ports?.some((p) => !p || !Number.isInteger(p.containerPort) || p.containerPort < 1 || p.containerPort > 65535) ||
          [...container.command ?? [], ...container.args ?? []].some((v) => typeof v !== "string")) {
        throw new Error("invalid container command, args, ports, env or volumeMounts");
      }
      for (const mount of container.volumeMounts ?? []) {
        if (!mount || typeof mount.name !== "string" || typeof mount.mountPath !== "string") throw new Error("invalid volumeMount");
        if (!spec.volumes?.some((v) => v.name === mount.name)) {
          throw new Error(`volumeMounts: Not found: "${mount.name}"`);
        }
        if (!mount.mountPath.startsWith("/")) throw new Error("mountPath must be absolute");
      }
    }
  }
  if (o.kind === "Service") {
    if (!Array.isArray(o.spec?.ports) || !o.spec.ports.length) throw new Error("spec.ports: Required value");
    for (const port of o.spec.ports) {
      if (!port || !Number.isInteger(port.port) || port.port < 1 || port.port > 65535) throw new Error("invalid service port");
      if (port.nodePort !== undefined && (!Number.isInteger(port.nodePort) || port.nodePort < 30000 || port.nodePort > 32767)) {
        throw new Error("nodePort must be in the range 30000-32767");
      }
      if (port.nodePort && w.k8s.objects.some((s) => s.kind === "Service" && key(s) !== key(o) &&
          s.spec?.ports?.some((p) => p.nodePort === port.nodePort))) throw new Error("nodePort is already allocated");
    }
  }
}
const encode = (value: string) => btoa(Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join(""));
const images = /^(?:nginx(?::(?:latest|stable|alpine|1\.\d+(?:\.\d+)?(?:-alpine)?))?|httpd(?::(?:latest|alpine|2\.4))?|busybox(?::(?:latest|musl|1\.\d+(?:\.\d+)?))?|redis(?::(?:latest|alpine|[567](?:\.\d+)?(?:-alpine)?))?|mysql(?::(?:latest|[58](?:\.\d+)?))?|grafana\/grafana(?::latest)?|kodekloud\/iron-gallery(?::latest)?|kodekloud\/iron-db(?::latest)?|python(?::(?:3\.\d+(?:-slim)?|latest))?|php(?::(?:latest|8\.\d+-apache))?|gcr\.io\/google-samples\/(?:gb-frontend:v[456]|gb-redisslave:v[123]))$/;

function pods(w: World): KubeObject[] {
  return w.k8s.objects.flatMap((o) => {
    if (o.kind === "Pod") return [o];
    if (o.kind !== "Deployment" || !o.spec?.template) return [];
    const template = o.spec.template;
    const revision = w.k8s.history[key(o)]?.length ?? 1;
    return Array.from({ length: o.spec.replicas ?? 1 }, (_, index) => ({
      apiVersion: "v1", kind: "Pod",
      metadata: { ...template.metadata, name: `${o.metadata.name}-${revision}-${index + 1}`, namespace: namespaceOf(o) },
      spec: template.spec,
    }));
  });
}

function boundClaim(w: World, name: string, namespace: string) {
  const claim = kubeObject(w, "PersistentVolumeClaim", name, namespace);
  return !!claim?.spec?.volumeName && !!kubeObject(w, "PersistentVolume", claim.spec.volumeName);
}
export function podStatus(w: World, o: KubeObject) {
  const spec = podSpec(o);
  if (!spec) return "Pending";
  if (spec.volumes?.some((v) => v.secret && !kubeObject(w, "Secret", v.secret.secretName, namespaceOf(o)) ||
      v.configMap && !kubeObject(w, "ConfigMap", v.configMap.name, namespaceOf(o)) ||
      v.persistentVolumeClaim && !boundClaim(w, v.persistentVolumeClaim.claimName, namespaceOf(o)))) return "Pending";
  const containers = [...spec.initContainers ?? [], ...spec.containers];
  if (containers.some((c) => !images.test(c.image.replace(/^docker\.io\/(?:library\/)?/, "")))) return "ImagePullBackOff";
  if (containers.some((c) => c.env?.some((e) => {
    const ref = e.valueFrom?.secretKeyRef;
    return ref && kubeObject(w, "Secret", ref.name, namespaceOf(o))?.data?.[ref.key] === undefined;
  }))) return "CreateContainerConfigError";
  return o.kind === "Pod" && spec.containers.every((c) => [...c.command ?? [], ...c.args ?? []].some((v) => /\becho\b/.test(v)) &&
    ![...c.command ?? [], ...c.args ?? []].some((v) => /\bsleep\b|\btail\b/.test(v))) ? "Completed" : "Running";
}

function environment(c: Container, w?: World, ns?: string) {
  return Object.fromEntries((c.env ?? []).map(({ name, value, valueFrom }) => {
    const ref = valueFrom?.secretKeyRef;
    const encoded = ref && w ? kubeObject(w, "Secret", ref.name, ns)?.data?.[ref.key] : undefined;
    return [name, value ?? (encoded ? new TextDecoder().decode(Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0))) : "")];
  }));
}
export function containerLogs(c: Container, w?: World, ns?: string) {
  const variables = environment(c, w, ns);
  return [...c.command ?? [], ...c.args ?? []].join(" ").split(/[;\n]/)
    .map((line) => /\becho\s+(.+?)(?:\s*>.*)?$/.exec(line)?.[1])
    .filter((line): line is string => line !== undefined)
    .map((line) => line.replace(/^["']|["']$/g, "").replace(/\$\(\w+\)|\$\{\w+\}|\$\w+/g,
      (token) => variables[token.replace(/[^\w]/g, "")] ?? "")).join("\n");
}

function table(w: World, o: KubeObject) {
  const name = o.metadata.name;
  if (o.kind === "Pod") {
    const count = podSpec(o)?.containers.length ?? 0;
    const status = podStatus(w, o);
    return `${name}\t${status === "Running" ? count : 0}/${count}\t${status}`;
  }
  if (o.kind === "Deployment") {
    const desired = o.spec?.replicas ?? 1;
    return `${name}\t${podStatus(w, o) === "Running" ? desired : 0}/${desired}`;
  }
  if (o.kind === "Service") {
    return `${name}\t${o.spec?.type ?? "ClusterIP"}\t${o.spec?.ports?.map((p) => `${p.port}${p.nodePort ? ":" + p.nodePort : ""}/TCP`).join(",") ?? ""}`;
  }
  if (o.kind === "PersistentVolume" || o.kind === "PersistentVolumeClaim") {
    const volume = o.kind === "PersistentVolume" ? o :
      o.spec?.volumeName ? kubeObject(w, "PersistentVolume", o.spec.volumeName) : undefined;
    const bound = volume && w.k8s.objects.some((v) => v.kind === "PersistentVolumeClaim" && v.spec?.volumeName === volume.metadata.name);
    return `${name}\t${bound ? "Bound" : o.kind === "PersistentVolume" ? "Available" : "Pending"}`;
  }
  return name;
}

CMDS["kubectl"] = function* (c, args) {
  const ns = opt(args, "-n", "--namespace") ?? "default";
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const part = args[i]!;
    if (part === "--") break;
    if (["-f", "-n", "-o", "-c", "--namespace", "--output", "--container", "--image", "--replicas", "--port", "--target-port", "--type", "--labels", "--from-file", "--from-literal", "--to-revision", "-l", "--selector"].includes(part)) i++;
    else if (!part.startsWith("-")) positional.push(part);
  }
  const [action, target = "", name, ...extra] = positional;
  const [alias = "", embedded] = target.split("/");
  const kind = kinds[alias];
  const resourceName = embedded ?? name;
  const options = opt(args, "-o", "--output");
  const allNamespaces = args.includes("-A") || args.includes("--all-namespaces");
  const store = (resource: KubeObject, create = false) => {
    if (!clusterScoped(resource.kind)) resource.metadata.namespace ??= ns;
    validate(c.w, resource);
    if (resource.kind === "Secret" && resource.stringData) {
      resource.data = { ...resource.data, ...Object.fromEntries(Object.entries(resource.stringData).map(([name, value]) => [name, encode(value)])) };
      delete resource.stringData;
    }
    const old = kubeObject(c.w, resource.kind, resource.metadata.name, namespaceOf(resource));
    if (create && old) throw new Error(`${resource.kind} "${resource.metadata.name}" already exists`);
    seedKube(c.w, resource);
    return `${resource.kind.toLowerCase()}/${resource.metadata.name} ${old ? "configured" : "created"}`;
  };
  const list = (type: string | undefined, nameFilter?: string) => {
    const selector = opt(args, "-l", "--selector")?.split(",").map((pair) => pair.split("="));
    const objects = type === "Pod" ? pods(c.w) : c.w.k8s.objects;
    return objects.filter((o) => o.kind === type && (!nameFilter || o.metadata.name === nameFilter) &&
      (clusterScoped(o.kind) || allNamespaces || namespaceOf(o) === ns) &&
      (!selector || selector.every(([k, v]) => k && o.metadata.labels?.[k] === v)));
  };
  const manifest = () => {
    const filename = opt(args, "-f");
    if (!filename) throw new Error("-f is required");
    const contents = filename === "-" ? c.stdin : readFile(c.h, abs(c.f, filename));
    if (contents === undefined) throw new Error(`the path "${filename}" does not exist`);
    return documents(contents);
  };
  try {
    if (action === "apply" || action === "replace") return ok(manifest().map((o) => store(o)).join("\n"));
    if (action === "create" && opt(args, "-f")) return ok(manifest().map((o) => store(o, true)).join("\n"));
    if (action === "run") {
      const image = opt(args, "--image");
      if (!target || !image) return err("Usage: kubectl run NAME --image=IMAGE");
      const labels = opt(args, "--labels")?.split(",").map((pair) => pair.split("=")) ?? [["run", target]];
      const commandAt = args.indexOf("--");
      return ok(store({ apiVersion: "v1", kind: "Pod", metadata: { name: target, labels: Object.fromEntries(labels) },
        spec: { containers: [{ name: target, image, ...(commandAt >= 0 ? { command: args.slice(commandAt + 1) } : {}) }] } }, true));
    }
    if (action === "create" && kind) {
      const newName = kind === "Secret" && name === "generic" ? extra[0] : name;
      if (!newName) return err("resource name is required");
      if (kind === "Deployment") {
        const image = opt(args, "--image");
        if (!image) return err("required flag(s) \"image\" not set");
        return ok(store(deployment(newName, image, newName, Number(opt(args, "--replicas") ?? 1)), true));
      }
      if (kind === "Namespace") return ok(store({ apiVersion: "v1", kind, metadata: { name: newName } }, true));
      if (kind === "ConfigMap" || kind === "Secret") {
        const data: Labels = {};
        for (let i = 0; i < args.length; i++) {
          const [flag, ...inline] = args[i]!.split("=");
          if (flag !== "--from-file" && flag !== "--from-literal") continue;
          const [left, ...right] = (inline.length ? inline.join("=") : args[++i] ?? "").split("=");
          if (!left) return err(`invalid ${flag}`);
          const content = flag === "--from-file" ? readFile(c.h, abs(c.f, right.length ? right.join("=") : left)) : right.join("=");
          if (content === undefined) return err(`error reading ${left}`);
          const field = flag === "--from-file" && !right.length ? left.split("/").pop()! : left;
          data[field] = kind === "Secret" ? encode(content) : content;
        }
        return ok(store({ apiVersion: "v1", kind, metadata: { name: newName }, data }, true));
      }
    }
    if (action === "get" || action === "describe") {
      const wants = target === "all" ? ["Pod", "Deployment", "Service"] : target.split(",").map((t) => kinds[t.split("/")[0]!]);
      if (wants.some((v) => !v)) return err(`the server doesn't have a resource type "${target}"`);
      const selected = wants.flatMap((t) => list(t, resourceName));
      if (!selected.length) return resourceName ? err(`${target} "${resourceName}" not found`) : ok("No resources found.");
      if (options === "yaml" || options === "json") {
        const value = selected.length === 1 && resourceName ? selected[0] : { apiVersion: "v1", kind: "List", items: selected };
        return ok(options === "json" ? JSON.stringify(value, null, 2) : stringify(value).trimEnd());
      }
      if (action === "describe") return ok(selected.map((o) => `Name: ${o.metadata.name}\nNamespace: ${namespaceOf(o)}\nStatus: ${table(c.w, o)}\n${stringify(o.spec ?? o.data ?? {})}`).join("\n"));
      return ok(selected.map((o) => `${allNamespaces ? namespaceOf(o) + "\t" : ""}${target === "all" ? o.kind.toLowerCase() + "/" : ""}${table(c.w, o)}`).join("\n"));
    }
    if (action === "delete") {
      const selected = opt(args, "-f")
        ? manifest().map((o) => kubeObject(c.w, o.kind, o.metadata.name, o.metadata.namespace ?? ns)).filter((o): o is KubeObject => !!o)
        : (resourceName || args.includes("--all")) ? list(kind, resourceName) : [];
      if (!selected.length) return err("no matching resources to delete");
      const keys = new Set(selected.map(key));
      c.w.k8s.objects = c.w.k8s.objects.filter((o) => !keys.has(key(o)) &&
        !selected.some((s) => s.kind === "Namespace" && !clusterScoped(o.kind) && namespaceOf(o) === s.metadata.name));
      for (const o of selected) delete c.w.k8s.history[key(o)];
      return ok(selected.map((o) => `${o.kind.toLowerCase()} "${o.metadata.name}" deleted`).join("\n"));
    }
    if (action === "logs" || action === "exec") {
      const o = embedded ? list(kind, embedded)[0] : list("Pod", target)[0];
      if (!o) return err(`pods "${target}" not found`);
      const status = podStatus(c.w, o);
      if (!["Running", "Completed"].includes(status)) return err(`container is waiting to start: ${status}`);
      const spec = podSpec(o)!;
      const cn = opt(args, "-c", "--container") ?? spec.containers[0]?.name;
      const container = [...spec.containers, ...spec.initContainers ?? []].find((item) => item.name === cn);
      if (!container) return err(`container ${cn} is not valid for pod ${target}`);
      if (action === "logs") return ok(containerLogs(container, c.w, namespaceOf(o)));
      const separator = args.indexOf("--");
      if (separator < 0 || status === "Completed") return err("a running container and a command after -- are required");
      const [command, ...params] = args.slice(separator + 1);
      if (command === "printenv" || command === "env") {
        const env = environment(container, c.w, namespaceOf(o));
        if (!params.length) return ok(Object.entries(env).map(([name, value]) => `${name}=${value}`).join("\n"));
        return Object.hasOwn(env, params[0]!) ? ok(env[params[0]!]) : err("");
      }
      if (command === "echo") return ok(params.join(" "));
      if (command === "ls") {
        const mount = container.volumeMounts?.find((m) => m.mountPath === params[0]);
        if (!mount) return err(`ls: cannot access '${params[0]}': No such file or directory`);
        const writers = [...spec.initContainers ?? [], ...spec.containers].filter((item) =>
          item.volumeMounts?.some((m) => m.name === mount.name));
        const paths = writers.flatMap((item) => {
          const path = item.volumeMounts?.find((m) => m.name === mount.name)?.mountPath + "/";
          return [...item.command ?? [], ...item.args ?? []].join(" ").split(/\s+/)
            .filter((piece) => piece.startsWith(path)).map((piece) => piece.slice(path.length).replace(/[^-\w.]+$/, ""));
        });
        return ok([...new Set(paths)].join("\n"));
      }
      return err(`exec: "${command}": executable file not found`, 127);
    }
    if (action === "expose") {
      const o = list(kind, resourceName)[0];
      if (!o || !resourceName) return err(`${target} "${resourceName}" not found`);
      const port = Number(opt(args, "--port") ?? podSpec(o)?.containers[0]?.ports?.[0]?.containerPort);
      const type = opt(args, "--type") ?? "ClusterIP";
      const occupied = c.w.k8s.objects.flatMap((s) => s.spec?.ports?.map((p) => p.nodePort) ?? []);
      let nodePort = 30000;
      while (occupied.includes(nodePort) && nodePort <= 32767) nodePort++;
      const labels = o.spec?.template?.metadata?.labels ?? o.metadata.labels ?? {};
      return ok(store({ apiVersion: "v1", kind: "Service", metadata: { name: resourceName },
        spec: { type, selector: labels, ports: [{ port, targetPort: Number(opt(args, "--target-port") ?? port), ...(type === "NodePort" ? { nodePort } : {}) }] } }, true));
    }
    if (action === "edit" || action === "scale") {
      const current = resourceName ? list(kind, resourceName)[0] : undefined;
      if (!current) return err(`${target} "${resourceName}" not found`);
      if (action === "edit") {
        const edited = yield { kind: "edit", path: `${current.kind.toLowerCase()}/${resourceName}`, content: stringify(current) };
        if (edited === null) return ok("Edit cancelled.");
        const [changed, ...rest] = documents(edited);
        if (!changed || rest.length || changed.kind !== current.kind || changed.metadata.name !== resourceName ||
          (changed.metadata.namespace ?? ns) !== namespaceOf(current)) return err("resource identity cannot be changed");
        return ok(store(changed));
      }
      if (current.kind !== "Deployment" || opt(args, "--replicas") === undefined) return err("scale requires a deployment and --replicas");
      const changed = copy(current);
      changed.spec!.replicas = Number(opt(args, "--replicas"));
      return ok(store(changed));
    }
    if ((action === "set" && target === "image") || action === "rollout") {
      const ref = name?.split("/") ?? [];
      const o = list("Deployment", ref[1] ?? extra[0])[0];
      if (!o || kinds[ref[0] ?? ""] !== "Deployment" || !(ref[1] ?? extra[0])) return err("deployment not found");
      const revision = c.w.k8s.history[key(o)] ?? [];
      if (action === "set") {
        const changed = copy(o);
        for (const pair of extra.slice(ref[1] ? 0 : 1)) {
          const [container, image] = pair.split("=");
          const matches = podSpec(changed)?.containers.filter((item) => container === "*" || item.name === container) ?? [];
          if (!image || !matches.length) return err(`unable to find container named "${container}"`);
          for (const match of matches) match.image = image;
        }
        return ok(store(changed));
      }
      if (target === "status") return podStatus(c.w, o) === "Running"
        ? ok(`deployment "${o.metadata.name}" successfully rolled out`)
        : err(`deployment "${o.metadata.name}": ${podStatus(c.w, o)}`);
      if (target === "history") return ok(revision.map((v, i) => `${i + 1}\t${podSpec(v)?.containers.map((item) => item.image).join(", ")}`).join("\n"));
      if (target === "undo") {
        const previous = revision[Number(opt(args, "--to-revision") ?? revision.length - 1) - 1];
        if (!previous) return err("no rollout history found");
        const changed = copy(o);
        if (previous.spec?.template) changed.spec!.template = structuredClone(previous.spec.template);
        return ok(store(changed));
      }
    }
    return err(`unknown kubectl command: ${args.join(" ")}`);
  } catch (error) {
    return err(`error: ${error instanceof Error ? error.message : String(error)}`);
  }
};
