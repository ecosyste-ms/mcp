export function formatNumber(n) {
  if (!n) return "0";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

export function formatPackage(pkg) {
  const latestVersion = pkg.latest_version || pkg.latest_release_number || "Unknown";
  const lines = [
    `${pkg.ecosystem}/${pkg.name}`,
    pkg.description ? `  ${pkg.description}` : null,
    `  License: ${pkg.licenses || "Unknown"}`,
    `  Latest: ${latestVersion}`,
    `  Downloads: ${formatNumber(pkg.downloads)}`,
    pkg.dependent_packages_count ? `  Dependents: ${formatNumber(pkg.dependent_packages_count)} packages` : null,
    pkg.repository_url ? `  Repository: ${pkg.repository_url}` : null,
    pkg.homepage ? `  Homepage: ${pkg.homepage}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatAdvisories(advisories, limit = 10) {
  if (!advisories.length) return "No known security advisories.";
  const shown = advisories.slice(0, limit);
  const lines = shown.map((a) => {
    const parts = [`[${a.severity}] ${a.title}`];
    // Check for version range info (from API) - show all ranges
    const versions = a.packages?.[0]?.versions || [];
    if (versions.length === 1) {
      const v = versions[0];
      if (v.vulnerable_version_range) {
        parts.push(`  Affected: ${v.vulnerable_version_range}`);
      }
      if (v.first_patched_version) {
        parts.push(`  Fixed in: ${v.first_patched_version}`);
      }
    } else if (versions.length > 1) {
      const ranges = versions
        .map(v => v.vulnerable_version_range)
        .filter(Boolean)
        .join(" OR ");
      if (ranges) parts.push(`  Affected: ${ranges}`);
      const fixes = [...new Set(versions.map(v => v.first_patched_version).filter(Boolean))];
      if (fixes.length) parts.push(`  Fixed in: ${fixes.join(", ")}`);
    }
    parts.push(`  ${a.url || a.uuid}`);
    return parts.join("\n");
  });
  if (advisories.length > limit) {
    lines.push(`... and ${advisories.length - limit} more advisories`);
  }
  return lines.join("\n\n");
}

export function formatRepo(repo, repoUrl) {
  if (!repo) return repoUrl ? `Repository: ${repoUrl}` : "No repository metadata available.";
  const host = typeof repo.host === 'object' ? repo.host?.name : repo.host;
  const lines = [
    repo.full_name ? `${repo.full_name}` : null,
    host ? `  Host: ${host}` : null,
    repo.language ? `  Language: ${repo.language}` : null,
    repo.stargazers_count ? `  Stars: ${formatNumber(repo.stargazers_count)}` : null,
    repo.forks_count ? `  Forks: ${formatNumber(repo.forks_count)}` : null,
    repo.open_issues_count ? `  Open Issues: ${repo.open_issues_count}` : null,
    repo.archived ? `  Status: Archived` : null,
    repo.fork ? `  (Fork)` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatVersions(versions, limit = 10) {
  if (!versions.length) return "No versions found.";
  const shown = versions.slice(0, limit);
  const lines = shown.map((v) => {
    const date = v.published_at ? v.published_at.split("T")[0] : "unknown date";
    return `  ${v.number} (${date})`;
  });
  if (versions.length > limit) {
    lines.push(`  ... and ${versions.length - limit} more versions`);
  }
  return lines.join("\n");
}

export function formatSearchResults(results, limit = 20) {
  if (!results.length) return "No packages found.";
  const shown = results.slice(0, limit);
  const lines = shown.map((r) => {
    const desc = r.description ? ` - ${r.description.slice(0, 80)}` : "";
    return `${r.ecosystem}/${r.name}${desc}`;
  });
  if (results.length > limit) {
    lines.push(`... and ${results.length - limit} more results`);
  }
  return lines.join("\n");
}
