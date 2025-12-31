const ECOSYSTEM_REGISTRY_MAP = {
  npm: "npmjs.org",
  go: "proxy.golang.org",
  docker: "hub.docker.com",
  pypi: "pypi.org",
  nuget: "nuget.org",
  maven: "repo1.maven.org",
  packagist: "packagist.org",
  cargo: "crates.io",
  rubygems: "rubygems.org",
  cocoapods: "cocoapods.org",
  pub: "pub.dev",
  bower: "bower.io",
  cpan: "metacpan.org",
  alpine: "alpine-edge",
  actions: "github actions",
  cran: "cran.r-project.org",
  clojars: "clojars.org",
  conda: "conda-forge.org",
  hex: "hex.pm",
  hackage: "hackage.haskell.org",
  julia: "juliahub.com",
  swiftpm: "swiftpackageindex.com",
  openvsx: "open-vsx.org",
  spack: "spack.io",
  homebrew: "formulae.brew.sh",
  adelie: "pkg.adelielinux.org",
  puppet: "forge.puppet.com",
  deno: "deno.land",
  elm: "package.elm-lang.org",
  vcpkg: "vcpkg.io",
  racket: "pkgs.racket-lang.org",
  bioconductor: "bioconductor.org",
  carthage: "carthage",
  postmarketos: "postmarketos-master",
  elpa: "elpa.gnu.org",
};

const REGISTRY_ECOSYSTEM_MAP = Object.fromEntries(
  Object.entries(ECOSYSTEM_REGISTRY_MAP).map(([k, v]) => [v, k])
);

export function ecosystemToRegistry(ecosystem) {
  return ECOSYSTEM_REGISTRY_MAP[ecosystem?.toLowerCase()] || null;
}

export function registryToEcosystem(registry) {
  return REGISTRY_ECOSYSTEM_MAP[registry?.toLowerCase()] || null;
}

export function parsePurl(purl) {
  const match = purl.match(/^pkg:([^/]+)\/(.+?)(?:@(.+))?$/);
  if (!match) return null;
  return { ecosystem: match[1], name: match[2], version: match[3] };
}
