import { posix } from "node:path";

const facades = new Set(["bot.js", "finance.js", "ledger.js", "repository.js", "notion.js", "telegram.js", "state.js", "coordinator.js"]);
export function roleOf(path) {
  if (path === "index.js") return "entry";
  if (path === "config.js") return "config";
  if (facades.has(path)) return "facade";
  if (["domain/finance-rules.js", "domain/debt-resolver.js", "domain/string-parser.js"].includes(path)) return "domain-api";
  if (path.startsWith("domain/budget/") || path.startsWith("domain/cashflow/")) return "domain-model";
  if (path.startsWith("domain/finance/")) return "domain-finance";
  if (path.startsWith("domain/ledger/")) return "domain-ledger";
  if (path.startsWith("adapters/")) return "adapter";
  if (path.startsWith("services/")) return "service";
  if (path.startsWith("repositories/")) return path.endsWith("/finance-repository.js") ? "composition" : "data-repository";
  if (path.startsWith("jobs/")) return "job";
  if (path.startsWith("app/")) return path.endsWith("bot-presenter.js") ? "app-presenter" : "app";
  if (path.startsWith("features/shared/")) return "shared";
  if (/^features\/[^/]+\/index\.js$/.test(path)) return "feature-api";
  if (/^features\/[^/]+\/(?:models\/.*|model\.js)$/.test(path)) return "model";
  if (/^features\/[^/]+\/(?:presenters\/.*|presenter\.js)$/.test(path)) return "presenter";
  if (/^features\/[^/]+\/callbacks\.js$/.test(path)) return "callbacks";
  if (/^features\/[^/]+\/component\.js$/.test(path)) return "component";
  if (/^features\/[^/]+\/repository\.js$/.test(path)) return "repository";
  if (/^features\/[^/]+\/six-jar-sync\.js$/.test(path)) return "sync";
  throw new Error("Unowned production source: " + path);
}
const allowed = {
  entry: ["app"],
  config: [],
  facade: ["app", "domain-finance", "domain-ledger", "feature-api", "composition", "adapter", "domain-api", "domain-model", "data-repository"],
  "domain-api": ["domain-model", "domain-finance", "domain-ledger"],
  "domain-model": ["domain-api", "domain-model", "domain-finance", "domain-ledger"],
  "data-repository": ["domain-api", "domain-model", "domain-finance", "domain-ledger", "service"],
  "domain-finance": ["domain-finance"],
  "domain-ledger": ["domain-finance", "domain-ledger"],
  adapter: ["adapter"],
  service: ["service", "domain-finance"],
  composition: ["data-repository", "service"],
  job: ["feature-api", "service", "domain-finance"],
  app: ["domain-api", "app", "app-presenter", "config", "domain-finance", "feature-api", "composition", "adapter", "job"],
  "app-presenter": ["domain-finance"],
  shared: ["shared", "domain-finance", "domain-ledger"],
  "feature-api": ["model", "presenter", "callbacks", "component", "repository", "sync", "domain-model", "domain-finance", "data-repository"],
  model: ["model", "domain-model", "domain-finance", "domain-ledger", "shared"],
  presenter: ["presenter", "callbacks", "domain-finance", "shared"],
  callbacks: ["callbacks", "domain-finance", "shared"],
  component: ["domain-api", "presenter", "callbacks", "domain-finance", "shared"],
  repository: ["data-repository"],
  sync: ["domain-finance", "shared"]
};
function feature(path) {
  const name = /^features\/([^/]+)\//.exec(path)?.[1];
  return name === "shared" ? undefined : name;
}
const pure = new Set(["domain-api", "domain-model", "domain-finance", "domain-ledger", "shared", "model", "presenter", "callbacks", "app-presenter"]);

export function checkArchitecture(sources) {
  const edges = new Map();
  for (const [origin, source] of sources) {
    const role = roleOf(origin);
    if ((role === "repository" || role === "feature-api") && /\bimport\s/.test(source)) {
      throw new Error(origin + ": compatibility/public entry must only re-export");
    }
    const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g)].map(match => match[1]);
    if (/\bimport\s*\(\s*[^"'\s]/.test(source)) throw new Error(origin + ": computed import bypasses architecture");
    if (pure.has(role) && /\bfetch\s*\(|\b(?:Date\.now|Math\.random)\s*\(|\.\s*(?:queryDatabase|createPage|updatePage|sendMessage|putReportCache|getReportCache)\s*\(/.test(source)) {
      throw new Error(origin + ": pure module performs I/O or reads an uncontrolled clock");
    }
    if (role === "facade" && /\b(?:function|class)\s/.test(source)) throw new Error(origin + ": compatibility facade contains implementation");
    edges.set(origin, []);
    for (const specifier of imports) {
      if (!specifier.startsWith(".")) {
        if (origin === "app/update-coordinator.js" && specifier === "cloudflare:workers") continue;
        throw new Error(origin + ": unexpected platform import " + specifier);
      }
      const target = posix.normalize(posix.join(posix.dirname(origin), specifier));
      if (!sources.has(target)) throw new Error(origin + ": unresolved import " + target);
      const targetRole = roleOf(target);
      const fromFeature = feature(origin), toFeature = feature(target);
      if (fromFeature && toFeature && fromFeature !== toFeature) throw new Error(origin + ": cross-feature import " + target);
      if (toFeature && fromFeature !== toFeature && targetRole !== "feature-api") throw new Error(origin + ": bypasses public API " + target);
      if (!allowed[role].includes(targetRole)) throw new Error(origin + ": forbidden " + role + " -> " + targetRole + " (" + target + ")");
      edges.get(origin).push(target);
    }
  }
  const done = new Set(), active = new Set();
  function visit(path, chain) {
    if (active.has(path)) throw new Error("Dependency cycle: " + [...chain, path].join(" -> "));
    if (done.has(path)) return;
    active.add(path);
    for (const target of edges.get(path)) visit(target, [...chain, path]);
    active.delete(path);
    done.add(path);
  }
  for (const path of edges.keys()) visit(path, []);
  return { files: sources.size, edges: [...edges.values()].reduce((sum, targets) => sum + targets.length, 0) };
}
