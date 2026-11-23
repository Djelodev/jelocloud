import { abs, canWrite } from "./shell";
import { CMDS, err, ok } from "./types";
import { children, isDir, mkdirp, readFile, writeFile } from "./world";

type Value = string | number | boolean | null | Value[] | { [key: string]: Value } | Ref;
class Ref { constructor(readonly path: string) {} }
type Attributes = Record<string, Value>;
type Resource = { type: string; name: string; attrs: Record<string, unknown>; id: string };
type Config = { resources: Record<string, { type: string; name: string; attrs: Attributes }>; outputs: Attributes };
type State = { resources: Record<string, Resource>; outputs: Record<string, unknown> };
const required: Record<string, string[]> = {
  aws_vpc: ["cidr_block"], aws_security_group: ["name"], aws_instance: ["ami", "instance_type"],
  aws_iam_policy: ["name", "policy"], aws_iam_role: ["name", "assume_role_policy"],
  aws_iam_role_policy_attachment: ["role", "policy_arn"], aws_subnet: ["vpc_id", "cidr_block"],
  aws_dynamodb_table: ["name", "hash_key"], aws_cloudwatch_metric_alarm: ["alarm_name", "metric_name", "threshold"],
  aws_sns_topic: ["name"],
};
const identifier = /^[A-Za-z_][\w-]*$/;

function parseHcl(input: string, config: Config) {
  const clean = input.replace(/<<(-?)([A-Za-z_][\w-]*)[^\S\n]*\n([\s\S]*?)^\s*\2[^\S\n]*$/gm,
    (_, indent: string, __: string, content: string) => JSON.stringify(indent ? content.split("\n").map((line) => line.trimStart()).join("\n") : content));
  const scanner = /\s+|(?:#|\/\/)[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?|[A-Za-z_][\w.-]*|[{}[\]=,:()]/gy;
  const tokens: string[] = [];
  while (scanner.lastIndex < clean.length) {
    const offset = scanner.lastIndex;
    const item = scanner.exec(clean)?.[0];
    if (!item) throw new Error(`invalid HCL near ${clean.slice(offset, offset + 35)}`);
    if (!/^(?:\s|#|\/)/.test(item)) tokens.push(item);
  }
  let i = 0;
  const take = () => {
    const token = tokens[i++];
    if (token === undefined) throw new Error("unexpected end of HCL input");
    return token;
  };
  const expect = (expected: string) => {
    const got = take();
    if (got !== expected) throw new Error(`expected '${expected}', found '${got}'`);
  };
  const label = () => {
    const token = take();
    if (token.startsWith('"')) return JSON.parse(token) as string;
    if (!identifier.test(token)) throw new Error(`invalid label '${token}'`);
    return token;
  };
  function expression(): Value {
    const token = take();
    if (token.startsWith('"')) return JSON.parse(token) as string;
    if (/^-?\d/.test(token)) return Number(token);
    if (token === "true" || token === "false") return token === "true";
    if (token === "null") return null;
    if (token === "{") return body();
    if (token === "[") {
      const items: Value[] = [];
      while (tokens[i] !== "]") {
        items.push(expression());
        if (tokens[i] === ",") i++;
        else if (tokens[i] !== "]") throw new Error("expected ',' or ']'");
      }
      expect("]");
      return items;
    }
    if (token === "jsonencode") {
      expect("(");
      const value = expression();
      expect(")");
      return { __jsonencode: value };
    }
    if (/^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)+$/.test(token)) return new Ref(token);
    throw new Error(`invalid HCL expression '${token}'`);
  }
  function body(): Attributes {
    const result: Attributes = Object.create(null);
    while (tokens[i] !== "}") {
      const name = label();
      const next = take();
      if (next === "{" || tokens[i] === "{" && next.startsWith('"')) {
        if (next !== "{") expect("{");
        const content = body();
        const current = result[name];
        result[name] = Array.isArray(current) ? [...current, content] : [content];
      } else if (next === "=" || next === ":") {
        if (Object.hasOwn(result, name)) throw new Error(`duplicate attribute '${name}'`);
        result[name] = expression();
      } else throw new Error(`expected an attribute or block after '${name}'`);
      if (tokens[i] === ",") i++;
    }
    expect("}");
    return result;
  }
  while (i < tokens.length) {
    const kind = label();
    if (kind === "resource") {
      const type = label();
      const name = label();
      if (!Object.hasOwn(required, type)) throw new Error(`unsupported resource type '${type}'`);
      expect("{");
      const attrs = body();
      const address = `${type}.${name}`;
      if (config.resources[address]) throw new Error(`duplicate resource '${address}'`);
      for (const field of required[type]!) {
        if (attrs[field] === undefined) throw new Error(`${address}: required argument '${field}' is missing`);
      }
      config.resources[address] = { type, name, attrs };
    } else if (kind === "output") {
      const name = label();
      expect("{");
      const value = body()["value"];
      if (value === undefined) throw new Error(`output '${name}': value is missing`);
      if (Object.hasOwn(config.outputs, name)) throw new Error(`duplicate output '${name}'`);
      config.outputs[name] = value;
    } else if (kind === "provider" || kind === "terraform") {
      if (kind === "provider") label();
      expect("{");
      body();
    } else throw new Error(`unsupported HCL block '${kind}'`);
  }
}

function resourceId(type: string, address: string) {
  const prefixes: Record<string, string> = {
    aws_vpc: "vpc", aws_subnet: "subnet", aws_security_group: "sg", aws_instance: "i",
  };
  const hash = [...address].reduce((num, char) => Math.imul(num ^ char.charCodeAt(0), 16777619), 2166136261);
  return `${prefixes[type] ?? type.slice(4)}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function assemble(config: Config): State {
  const resources: State["resources"] = {};
  const visiting = new Set<string>();
  function lookup(path: string): unknown {
    const [type, name, attr, ...rest] = path.split(".");
    if (!type || !name || !attr || rest.length) throw new Error(`invalid reference '${path}'`);
    const resource = resolve(type + "." + name);
    if (attr === "id") return resource.id;
    if (attr === "arn") return `arn:aws:${type.startsWith("aws_iam_") ? "iam::000000000000" : "simulated::000000000000"}:${type.slice(4)}/${resource.attrs["name"] ?? name}`;
    if (!Object.hasOwn(resource.attrs, attr)) throw new Error(`unsupported attribute '${path}'`);
    return resource.attrs[attr];
  }
  function value(v: Value): unknown {
    if (v instanceof Ref) return lookup(v.path);
    if (Array.isArray(v)) return v.map(value);
    if (typeof v === "string") return v.replace(/\$\{([\w.-]+)\}/g, (_, path: string) => String(lookup(path)));
    if (v && typeof v === "object") {
      if (Object.hasOwn(v, "__jsonencode")) return JSON.stringify(value(v["__jsonencode"]!));
      return Object.fromEntries(Object.entries(v).map(([key, item]) => [key, value(item)]));
    }
    return v;
  }
  function resolve(address: string): Resource {
    if (resources[address]) return resources[address]!;
    if (visiting.has(address)) throw new Error(`dependency cycle at '${address}'`);
    const source = config.resources[address];
    if (!source) throw new Error(`reference to undeclared resource '${address}'`);
    visiting.add(address);
    const attrs = Object.fromEntries(Object.entries(source.attrs).map(([key, v]) => [key, value(v)]));
    const result = { ...source, attrs, id: resourceId(source.type, address) };
    resources[address] = result;
    visiting.delete(address);
    return result;
  }
  for (const address of Object.keys(config.resources)) resolve(address);
  return { resources, outputs: Object.fromEntries(Object.entries(config.outputs).map(([key, v]) => [key, value(v)])) };
}

CMDS["terraform"] = function* (c, args) {
  const action = args[0];
  const initialized = abs(c.f, ".terraform");
  const statePath = abs(c.f, "terraform.tfstate");
  if (action === "version" || action === "--version") return ok("Terraform v1.9.8");
  if (action === "init") {
    if (!canWrite(c, initialized)) return err("Error: Could not create .terraform: Permission denied");
    mkdirp(c.h, initialized, c.user);
    return ok("Initializing provider plugins...\nTerraform has been successfully initialized!");
  }
  if (!isDir(c.h, initialized)) return err('Error: Initialization required. Run "terraform init".');
  try {
    const content = readFile(c.h, statePath);
    const previous: State = content ? JSON.parse(content) : { resources: {}, outputs: {} };
    if (action === "state" && args[1] === "list") return content ? ok(Object.keys(previous.resources).sort().join("\n")) : err("No state file was found.");
    if (action === "output") {
      const name = args.find((v, i) => i > 0 && !v.startsWith("-"));
      if (name && !Object.hasOwn(previous.outputs, name)) return err(`Output "${name}" not found`);
      if (name) return ok(args.includes("-raw") ? String(previous.outputs[name]) : JSON.stringify(previous.outputs[name]));
      return ok(args.includes("-json") ? JSON.stringify(previous.outputs, null, 2) :
        Object.entries(previous.outputs).map(([key, v]) => `${key} = ${JSON.stringify(v)}`).join("\n"));
    }
    if (!["validate", "plan", "apply", "destroy"].includes(action ?? "")) return err(`Terraform has no command named "${action ?? ""}".`);
    const config: Config = { resources: {}, outputs: Object.create(null) };
    if (action !== "destroy") {
      const files = children(c.h, c.f.cwd).filter((p) => p.endsWith(".tf"));
      if (!files.length && action !== "validate") return err("Error: No configuration files");
      for (const file of files) parseHcl(readFile(c.h, abs(c.f, file)) ?? "", config);
    }
    const desired = assemble(config);
    if (action === "validate") return ok("Success! The configuration is valid.");
    const addresses = Object.keys(desired.resources);
    const add = addresses.filter((a) => !previous.resources[a]);
    const change = addresses.filter((a) => previous.resources[a] &&
      JSON.stringify(previous.resources[a]!.attrs) !== JSON.stringify(desired.resources[a]!.attrs));
    const remove = Object.keys(previous.resources).filter((a) => !desired.resources[a]);
    const summary = `Plan: ${add.length} to add, ${change.length} to change, ${remove.length} to destroy.`;
    if (action === "plan") return ok([...add.map((a) => "+ " + a), ...change.map((a) => "~ " + a), ...remove.map((a) => "- " + a), summary].join("\n"));
    if (!args.includes("-auto-approve") && (add.length || change.length || remove.length)) {
      const answer = yield { kind: "confirm", prompt: summary + '\nOnly "yes" will be accepted to approve.\nEnter a value: ' };
      if (answer !== "yes") return err("Operation cancelled.");
    }
    if (isDir(c.h, statePath) || !canWrite(c, statePath)) return err("Error: Could not write terraform.tfstate");
    for (const old of Object.values(previous.resources)) {
      const key = `${old.type}.${old.name}`;
      if (!desired.resources[key] && c.w.aws.resources[key]?.id === old.id) delete c.w.aws.resources[key];
    }
    Object.assign(c.w.aws.resources, desired.resources);
    writeFile(c.h, statePath, JSON.stringify(desired, null, 2), c.user, 0o600);
    return ok(`${action === "destroy" ? "Destroy" : "Apply"} complete! Resources: ${add.length} added, ${change.length} changed, ${remove.length} destroyed.`);
  } catch (e) { return err(`Error: ${e instanceof Error ? e.message : String(e)}`); }
};
