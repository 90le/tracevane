const MONACO_EXACT_FILENAME_LANGUAGES: Record<string, string> = {
  dockerfile: "dockerfile",
  containerfile: "dockerfile",
  makefile: "shell",
  rakefile: "ruby",
  gemfile: "ruby",
  podfile: "ruby",
  "cmakelists.txt": "plaintext",
};

const MONACO_EXTENSION_LANGUAGES = ([
  [".abap", "abap"], [".cls", "apex"], [".azcli", "azcli"], [".bat", "bat"], [".cmd", "bat"],
  [".bicep", "bicep"], [".mligo", "cameligo"], [".clj", "clojure"], [".cljs", "clojure"],
  [".coffee", "coffee"], [".c", "cpp"], [".cc", "cpp"], [".cpp", "cpp"], [".cxx", "cpp"], [".h", "cpp"], [".hpp", "cpp"],
  [".cs", "csharp"], [".csp", "csp"], [".css", "css"], [".cypher", "cypher"], [".dart", "dart"],
  [".dockerfile", "dockerfile"], [".ecl", "ecl"], [".ex", "elixir"], [".exs", "elixir"], [".flow", "flow9"],
  [".ftl", "freemarker2"], [".fsx", "fsharp"], [".fsi", "fsharp"], [".fs", "fsharp"], [".go", "go"],
  [".graphql", "graphql"], [".gql", "graphql"], [".hcl", "hcl"], [".tf", "hcl"], [".tfvars", "hcl"],
  [".handlebars", "handlebars"], [".hbs", "handlebars"], [".html", "html"], [".htm", "html"],
  [".ini", "ini"], [".properties", "ini"], [".conf", "ini"], [".java", "java"],
  [".js", "javascript"], [".jsx", "javascript"], [".mjs", "javascript"], [".cjs", "javascript"],
  [".json", "json"], [".jsonc", "json"], [".ipynb", "json"], [".jl", "julia"], [".kt", "kotlin"], [".kts", "kotlin"],
  [".less", "less"], [".lex", "lexon"], [".liquid", "liquid"], [".lua", "lua"], [".m3", "m3"],
  [".mdx", "mdx"], [".markdown", "markdown"], [".md", "markdown"], [".s", "mips"], [".dax", "msdax"],
  [".mysql", "mysql"], [".m", "objective-c"], [".mm", "objective-c"], [".pas", "pascal"], [".p", "pascal"],
  [".ligo", "pascaligo"], [".pl", "perl"], [".pm", "perl"], [".pgsql", "pgsql"], [".php", "php"],
  [".pla", "pla"], [".dats", "postiats"], [".sats", "postiats"], [".pq", "powerquery"], [".pqm", "powerquery"],
  [".ps1", "powershell"], [".psm1", "powershell"], [".proto", "protobuf"], [".pug", "pug"], [".jade", "pug"],
  [".py", "python"], [".pyw", "python"], [".qs", "qsharp"], [".r", "r"], [".rmd", "r"],
  [".cshtml", "razor"], [".razor", "razor"], [".redis", "redis"], [".rsql", "redshift"], [".rst", "restructuredtext"],
  [".rb", "ruby"], [".rs", "rust"], [".sb", "sb"], [".scala", "scala"], [".sc", "scala"], [".scm", "scheme"], [".ss", "scheme"],
  [".scss", "scss"], [".sh", "shell"], [".bash", "shell"], [".zsh", "shell"], [".fish", "shell"], [".env", "shell"],
  [".sol", "solidity"], [".aes", "sophia"], [".rq", "sparql"], [".sparql", "sparql"], [".sql", "sql"],
  [".st", "st"], [".swift", "swift"], [".sv", "systemverilog"], [".svh", "systemverilog"], [".tcl", "tcl"],
  [".twig", "twig"], [".ts", "typescript"], [".tsx", "typescript"], [".cts", "typescript"], [".mts", "typescript"],
  [".tsp", "typespec"], [".vb", "vb"], [".wgsl", "wgsl"], [".xml", "xml"], [".xsd", "xml"], [".xsl", "xml"],
  [".yaml", "yaml"], [".yml", "yaml"], [".svg", "xml"],
] as Array<[string, string]>).sort((left, right) => right[0].length - left[0].length);

function languageOverrideForFile(fileName: string, lowerPath: string): string | null {
  if (fileName === "containerfile") return "dockerfile";
  if (fileName === "makefile") return "shell";
  if (fileName.startsWith(".env")) return "shell";
  if (fileName.endsWith(".vue")) return "html";
  if (fileName.endsWith(".svelte")) return "html";
  if (fileName.endsWith(".astro")) return "html";
  if (fileName.endsWith(".toml")) return "ini";
  if (lowerPath.includes("/dockerfile.")) return "dockerfile";
  return null;
}

export function languageForPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop()?.toLowerCase() ?? "";
  const lowerPath = normalized.toLowerCase();

  const override = languageOverrideForFile(fileName, lowerPath);
  if (override) return override;

  const exact = MONACO_EXACT_FILENAME_LANGUAGES[fileName];
  if (exact) return exact;

  for (const [extension, languageId] of MONACO_EXTENSION_LANGUAGES) {
    if (fileName.endsWith(extension)) return languageId;
  }

  if (fileName.endsWith("rc") && !fileName.includes(".")) return "ini";
  return "plaintext";
}

export const languageExtensionForPath = languageForPath;
