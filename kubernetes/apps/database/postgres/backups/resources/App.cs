#!/usr/bin/dotnet run
// #:package YamlDotNet@16.3.0
#:package gstocco.YamlDotNet.YamlPath@1.0.26
#:package KubernetesClient@*
#:package Microsoft.Extensions.Logging@10.*
#:package Lunet.Extensions.Logging.SpectreConsole@1.2.0
#:package ProcessX@1.5.6
#:package Npgsql@*
#:property JsonSerializerIsReflectionEnabledByDefault=true

// Postgres backup.
//
// ─── WHAT DECIDES THE BACKUP SET ────────────────────────────────────────────
//
// The `Database` CRs in THIS namespace. Each one names a database in
// `spec.name` and carries, in its annotations, everything this job needs to
// know about how to back it up:
//
//   driscoll.dev/backup              "false" to exclude; anything else, or
//                                    absent, means back it up
//   driscoll.dev/backup-credentials  the Secret to authenticate with;
//                                    defaults to `<database>-postgres`
//   driscoll.dev/backup-reason       why it is excluded, printed every run
//
// ⚠️ THE POLARITY IS THE OPPOSITE OF A GARAGE BUCKET, where
// `driscoll.dev/backup: "true"` opts a bucket IN
// (kubernetes/apps/coder/forgejo-garage/bucket.yaml). It differs because the
// defaults differ: forgetting the annotation on a bucket wastes space,
// forgetting it on a database loses data. So a database is backed up unless it
// says otherwise, and the annotation only ever opts one OUT.
//
// This replaced a pure `pg_database` enumeration that then GUESSED the
// credential Secret from the database name -- `<db>-postgres`, always. Two
// things were wrong with that. A database whose credential lives under some
// other name could not be expressed at all, which is what put openbao (client
// certificate, no password anywhere since phase 2.4b) into a state where this
// job would fail on it nightly. And an app with a SECOND database
// (components/postgres/databases) had to grow a whole extra credential Secret
// that duplicated its first one, purely so a name lookup here would resolve.
// An annotation says the same thing in one line and says it where the database
// is declared.
//
// ─── AND WHAT STILL AUDITS IT ───────────────────────────────────────────────
//
// `pg_database` is still read, but only as the cross-check. A database that is
// live and has no `Database` CR is a HARD FAILURE, allowlisted by
// DECOMMISSIONED_DATABASES and by nothing else. That property is the whole
// reason this job is trustworthy and predates this change: a database dropping
// out of the backup set must never be silent. Deleting a `Database` CR does not
// drop the database -- everything in components/postgres is
// `deletionPolicy: Orphan` with `retain` reclaim policies -- so without the
// cross-check, removing a manifest would quietly stop backing up live data.
//
// DECOMMISSIONED_DATABASES stays an env var rather than becoming another
// annotation, and that is not an oversight: its entries are databases with no
// Kubernetes object at all, which is precisely what makes them decommissioned.
// There is nothing to annotate.
//
// ─── CREDENTIALS ────────────────────────────────────────────────────────────
//
// Read from the Kubernetes Secrets in THIS namespace -- the `<app>-postgres`
// objects kubernetes/components/postgres/database/credentials.yaml renders.
//
// This used to read them back out of 1Password, where a PushSecret had pushed
// these very Secrets 24h earlier (Phase 10 of the 1Password->OpenBao
// migration; vault repo docs/openbao-migration/PLAN.md SS-G row 10). That was a
// round trip out of the cluster and back into the same namespace, and it cost
// more than an indirection: the copy was up to a refreshInterval stale, and a
// database whose PushSecret had been removed kept being backed up from a
// FROZEN item -- invisibly, because a stale credential still authenticates.
// Reading the Secret directly makes a missing credential an error at the
// moment it goes missing.

using System.Diagnostics;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Serialization;
using k8s;
using k8s.Models;
using Npgsql;
using File = System.IO.File;

// The annotation contract, in one place because three files reference it: this
// script, kubernetes/components/postgres/database/database.yaml and
// kubernetes/components/postgres/databases/kustomization.yaml.
const string BackupAnnotation = "driscoll.dev/backup";
const string CredentialsAnnotation = "driscoll.dev/backup-credentials";
const string ReasonAnnotation = "driscoll.dev/backup-reason";

// Never backed up by name, and neither is a mistake. `postgres` is the
// maintenance database; `app` is the CNPG cluster's own bootstrap database,
// which no application uses and which has no `Database` CR by construction.
var neverBackedUp = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "postgres", "app" };

var config = KubernetesClientConfiguration.InClusterConfig();
using var kubernetes = new Kubernetes(config);

// The Secrets and the Database CRs live alongside this CronJob. Downward-API
// first so the value is explicit in the manifest; the service-account namespace
// file is the fallback.
var secretNamespace = Environment.GetEnvironmentVariable("POD_NAMESPACE")
  ?? config.Namespace
  ?? throw new InvalidOperationException("POD_NAMESPACE is not set and no in-cluster namespace could be determined");

async Task<IDictionary<string, byte[]>> GetSecret(string name)
{
  try
  {
    var secret = await kubernetes.CoreV1.ReadNamespacedSecretAsync(name, secretNamespace);
    return secret.Data ?? throw new InvalidOperationException($"secret {secretNamespace}/{name} has no data");
  }
  catch (k8s.Autorest.HttpOperationException ex) when (ex.Response?.StatusCode == System.Net.HttpStatusCode.NotFound)
  {
    // Named explicitly: this is what a database whose credential Secret has
    // gone missing looks like, and it is the case the 1Password round trip used
    // to hide behind a stale copy. If the Secret is deliberately absent -- a
    // certificate-authenticated role, say -- the fix is
    // `driscoll.dev/backup: "false"` on the Database CR, not a silent skip here.
    throw new MissingCredentialSecretException($"secret {secretNamespace}/{name} does not exist -- the database has no credential Secret in this cluster", ex);
  }
}

static string GetField(IDictionary<string, byte[]> secret, string name, string key) =>
  secret.TryGetValue(key, out var value)
    ? Encoding.UTF8.GetString(value)
    : throw new InvalidOperationException($"{key} key not found in secret {name}");

// Databases whose application has been decommissioned but whose data is still
// in postgres. They have no `Database` CR -- that is what decommissioned means
// here -- so without this they would fail the cross-check below. The list is
// per-cluster config, set in cronjob.yaml, where each name carries the date its
// application was removed.
//
// Deliberately an explicit allowlist and never a "no CR? never mind" fallback:
// an unrepresented database is exactly how LIVE data silently drops out of the
// backup set, and making that loud is the point.
var decommissioned = (Environment.GetEnvironmentVariable("DECOMMISSIONED_DATABASES") ?? "")
  .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
  .ToHashSet(StringComparer.OrdinalIgnoreCase);

var backupDir = "/backups";

Console.WriteLine($"Starting PostgreSQL backup at {DateTime.UtcNow}");

// Create backup directory
Directory.CreateDirectory(backupDir);

// THE REGISTER: what this cluster says should be backed up, and how.
Console.WriteLine($"Reading Database resources in {secretNamespace}...");
var declared = await GetDeclaredDatabases();
Console.WriteLine($"Declared by Database resources: {string.Join(", ", declared.Values.Select(d => d.Describe()).Order())}");

// THE AUDIT: what actually exists. Only ever used to catch a live database the
// register does not know about.
List<string> live;
{
  var postgres = await GetSecret("postgres-user");
  // NEVER log this -- the connection string embeds the plaintext password and
  // pod stdout is shipped to Loki.
  var connectionString = GetField(postgres, "postgres-user", "connection-string");
  Console.WriteLine("Fetching list of databases...");
  await using var dataSource = NpgsqlDataSource.Create(connectionString);
  live = await GetLiveDatabases(dataSource);
  Console.WriteLine($"Found databases: {string.Join(", ", live)}");
}

// A declared database that does not exist yet is not a backup problem -- CNPG
// may not have applied it, or it may be `ensure: absent`. Say so and carry on.
foreach (var entry in declared.Values.OrderBy(d => d.Database, StringComparer.Ordinal))
{
  if (!live.Contains(entry.Database, StringComparer.OrdinalIgnoreCase))
  {
    Console.WriteLine($"Note: Database/{entry.ObjectName} declares {entry.Database}, which does not exist in postgres -- CNPG has not applied it yet, or it is `ensure: absent`");
  }
}

// A listed database that no longer exists means the entry outlived its
// database -- harmless, but it rots, so say so rather than letting the list
// grow stale silently. A listed database that has since acquired a CR is worse:
// two mechanisms now disagree about it, and the annotation is the one to keep.
foreach (var name in decommissioned.Order(StringComparer.Ordinal))
{
  if (!live.Contains(name, StringComparer.OrdinalIgnoreCase))
  {
    Console.WriteLine($"Note: DECOMMISSIONED_DATABASES lists {name}, which no longer exists in postgres -- remove the entry");
  }
  else if (declared.ContainsKey(name))
  {
    Console.WriteLine($"Note: DECOMMISSIONED_DATABASES lists {name}, which now has a Database resource -- remove the entry and use `{BackupAnnotation}: \"false\"` instead");
  }
}

// Create individual database dumps
// How long a newly-created Database CR may go without its credential Secret
// before this job treats it as a real failure. The observed gap on 2026-08-27
// was 8.5 minutes; 30 gives generous headroom for a slow ESO refresh or a
// OpenBao blip without letting a genuinely credential-less database hide for
// long -- at worst one nightly run is skipped and the next one fails loudly.
var CredentialGrace = TimeSpan.FromMinutes(30);
var failed = new List<string>();
var skipped = new List<string>();
// Databases whose credential Secret has not appeared YET. Distinct from failed:
// see the CredentialGrace note below -- a brand-new Database CR is allowed to be
// briefly credential-less without failing the whole run.
var deferred = new List<string>();
foreach (var db in live)
{
  if (!declared.TryGetValue(db, out var entry))
  {
    if (decommissioned.Contains(db))
    {
      // Printed every run, by name: a database leaving the backup set should be
      // visible in the log of the job that stopped backing it up.
      Console.WriteLine($"SKIPPING {db}: decommissioned, not backed up (DECOMMISSIONED_DATABASES)");
      skipped.Add(db);
      continue;
    }

    // The cross-check. Refusing to guess is the entire point: this job cannot
    // tell a database that should be backed up from one that should not, and a
    // wrong guess in either direction is invisible.
    Console.Error.WriteLine($"Error backing up database {db}: live in postgres with no Database resource in {secretNamespace} and no DECOMMISSIONED_DATABASES entry -- declare it, or add it to that list");
    failed.Add(db);
    continue;
  }

  if (!entry.Enabled)
  {
    Console.WriteLine($"SKIPPING {db}: Database/{entry.ObjectName} sets {BackupAnnotation}=\"false\"{(entry.Reason is { Length: > 0 } r ? $" -- {r}" : "")}");
    skipped.Add(db);
    continue;
  }

  var backupFile = Path.Combine(backupDir, $"{db}.sql.gz");
  // Dump to a sibling temp file and only replace the existing backup once pg_dump
  // has exited 0. Writing straight to backupFile truncates the last known-good
  // dump before the new one is known to be valid.
  //
  // The staging name carries the pod name so two concurrent runs can never share
  // it. They could before: the name was a bare "{db}.sql.gz.tmp", and the finally
  // block below deletes stagingFile unconditionally -- including on the path where
  // THIS run failed because the other run already had the file open. On 2026-08-27
  // that is exactly what happened to immich: one pod logged "The process cannot
  // access the file ... because it is being used by another process", deleted the
  // other pod's in-flight dump on its way out, and the winning pod then died on
  // "Could not find file '/backups/immich.sql.gz.tmp'". Both runs lost the
  // database. Note the mutual exclusion that produced that error is node-local
  // flock -- both pods happened to land on the same node -- so two overlapping
  // runs on DIFFERENT nodes over this NFS mount may not be serialized at all.
  // HOSTNAME is the pod name, which is unique per attempt.
  var runId = Environment.GetEnvironmentVariable("HOSTNAME") is { Length: > 0 } h ? h : Guid.NewGuid().ToString("N");
  var stagingFile = $"{backupFile}.{runId}.tmp";
  try
  {
    var secretName = entry.CredentialsSecret;
    var postgres = await GetSecret(secretName);

    // Host/port/user only -- never the password or the full connection string.
    // The Secret NAME is logged too: with the credential now annotation-driven
    // rather than derived from the database name, which Secret was used is no
    // longer inferable from this line.
    Console.WriteLine($"Backing up database: {db} ({GetField(postgres, secretName, "username")}@{GetField(postgres, secretName, "hostname")}:{GetField(postgres, secretName, "port")} via {secretName})");
    Directory.CreateDirectory(Path.GetDirectoryName(backupFile) ?? throw new InvalidOperationException("Failed to get directory name for backup file"));

    await CreateDatabaseDump(postgres, secretName, db, stagingFile);
    File.Move(stagingFile, backupFile, overwrite: true);

    if (File.Exists(backupFile))
    {
      Console.WriteLine($"Successfully created backup: {backupFile}");
    }
    else
    {
      Console.Error.WriteLine($"Failed to create backup for database: {db}");
      failed.Add(db);
    }
  }
  // A Database CR and its credential Secret are created by two different
  // controllers and do not land together. On 2026-08-27 the eight media
  // databases from #1230 were applied at 02:02:34Z while their `<app>-postgres`
  // Secrets did not exist until 02:11:05Z -- an 8.5 minute window in which this
  // job, running its 02:00 schedule, hard-failed on every one of them. That was
  // most of that night's failed pods, and it recurs on any new-app deploy that
  // lands near 02:00.
  //
  // The window is keyed on the Database CR's OWN creationTimestamp, not on a
  // blanket retry, because the hard failure is deliberate and worth keeping:
  // a database that has existed for days with no credential Secret is a real
  // problem, and the comment on MissingCredentialSecretException says so. Only
  // a CR young enough to still be mid-deploy earns the benefit of the doubt.
  // Anything older than CredentialGrace fails exactly as it did before.
  catch (MissingCredentialSecretException ex) when (entry.CreatedAt is { } created && DateTime.UtcNow - created < CredentialGrace)
  {
    var age = DateTime.UtcNow - created;
    Console.WriteLine($"DEFERRING {db}: {ex.Message}. Database/{entry.ObjectName} is only {age.TotalMinutes:F1} minutes old, so its Secret is probably still syncing; it will be picked up by the next run. Failing after {CredentialGrace.TotalMinutes:F0} minutes.");
    deferred.Add(db);
  }
  catch (Exception ex)
  {
    Console.Error.WriteLine($"Error backing up database {db}: {ex.Message}");
    failed.Add(db);
  }
  finally
  {
    if (File.Exists(stagingFile)) File.Delete(stagingFile);
  }
}

if (failed.Count > 0)
{
  Console.Error.WriteLine($"PostgreSQL backup FAILED at {DateTime.UtcNow}: {failed.Count} of {live.Count - skipped.Count} database(s) were not backed up: {string.Join(", ", failed)}{(deferred.Count > 0 ? $" (and {deferred.Count} deferred: {string.Join(", ", deferred)})" : "")}");
  return 1;
}

// Deferred does not fail the run, but it is never silent: the count and the
// names go in the success line so a database that is deferred every night --
// which would mean its Secret never arrived and the grace window is masking a
// real problem -- is visible without reading the whole log.
Console.WriteLine($"PostgreSQL backup completed successfully at {DateTime.UtcNow} ({live.Count - skipped.Count - deferred.Count} databases{(skipped.Count > 0 ? $", {skipped.Count} skipped: {string.Join(", ", skipped)}" : "")}{(deferred.Count > 0 ? $", {deferred.Count} deferred until their credential Secret syncs: {string.Join(", ", deferred)}" : "")})");
return 0;

// Helper methods

// The `Database` CRs in this namespace, keyed by the database they name.
//
// GenericClient rather than kubernetes.CustomObjects: the latter returns a bare
// `object` that has to be round-tripped through JSON to be read, while this
// deserialises straight into the shape declared at the bottom of this file.
//
// NOT disposed. GenericClient owns the IKubernetes it is handed, and disposing
// it here would take the client every other call in this script uses with it.
async Task<Dictionary<string, DeclaredDatabase>> GetDeclaredDatabases()
{
  var client = new GenericClient(kubernetes, "postgresql.cnpg.io", "v1", "databases");
  var list = await client.ListNamespacedAsync<CnpgDatabaseList>(secretNamespace);

  var declared = new Dictionary<string, DeclaredDatabase>(StringComparer.OrdinalIgnoreCase);
  foreach (var item in list.Items ?? [])
  {
    // `spec.name` is what PostgreSQL sees. It is required by the CRD, but the
    // object name is a safe fallback and the two match for every database here.
    var database = item.Spec?.Name is { Length: > 0 } specName ? specName : item.Metadata?.Name;
    if (database is not { Length: > 0 })
    {
      throw new InvalidOperationException($"a Database resource in {secretNamespace} has neither spec.name nor metadata.name");
    }

    var objectName = item.Metadata?.Name ?? database;
    var annotations = item.Metadata?.Annotations ?? new Dictionary<string, string>();
    annotations.TryGetValue(BackupAnnotation, out var backup);
    annotations.TryGetValue(CredentialsAnnotation, out var credentials);
    annotations.TryGetValue(ReasonAnnotation, out var reason);

    // Opt-OUT: only the exact string "false" excludes a database. Anything
    // else, including a typo, backs it up -- erring toward a redundant dump
    // rather than a missing one.
    var enabled = !string.Equals(backup?.Trim(), "false", StringComparison.OrdinalIgnoreCase);

    // The historical convention is the default, so the fifteen databases that
    // components/postgres renders need no annotation and nothing changed for
    // them when this stopped being a hard-coded rule.
    var secret = credentials is { Length: > 0 } ? credentials.Trim() : $"{database}-postgres";

    if (declared.TryGetValue(database, out var existing))
    {
      throw new InvalidOperationException($"Database/{objectName} and Database/{existing.ObjectName} both declare the database {database}");
    }

    // CreationTimestamp is what the credential grace window is measured from.
    // Null only if the API server omitted it, in which case the grace cannot
    // apply and the old hard-failure behaviour stands -- fail closed.
    declared[database] = new DeclaredDatabase(database, objectName, enabled, secret, reason, item.Metadata?.CreationTimestamp?.ToUniversalTime());
  }

  return declared;
}

async Task<List<string>> GetLiveDatabases(NpgsqlDataSource dataSource)
{
  var databases = new List<string>();
  await using var connection = await dataSource.OpenConnectionAsync();
  using var command = connection.CreateCommand();
  command.CommandText = "SELECT datname FROM pg_database WHERE datistemplate = false;";
  await using var reader = await command.ExecuteReaderAsync();
  while (await reader.ReadAsync())
  {
    if (neverBackedUp.Contains(reader.GetString(0))) continue;
    databases.Add(reader.GetString(0));
  }

  return databases;
}

async Task CreateDatabaseDump(IDictionary<string, byte[]> postgres, string secretName, string database, string outputFile)
{
  var host = GetField(postgres, secretName, "hostname");
  var port = GetField(postgres, secretName, "port");
  var user = GetField(postgres, secretName, "username");
  var password = GetField(postgres, secretName, "password");
  var psi = new ProcessStartInfo
  {
    FileName = "pg_dump",
    Arguments = $"-h {host} -p {port} -U {user} -d {database} --verbose --no-password --format=custom --no-privileges --no-owner",
    UseShellExecute = false,
    RedirectStandardOutput = true,
    RedirectStandardError = true,
    CreateNoWindow = true,
  };
  psi.Environment["PGPASSWORD"] = password;

  using var process = Process.Start(psi);
  if (process == null) throw new InvalidOperationException("Failed to start pg_dump process");

  // --verbose writes progress to stderr throughout the dump. Drain it concurrently
  // with stdout: reading it only after the process exits deadlocks once the stderr
  // pipe buffer fills, because pg_dump then blocks before it can finish writing stdout.
  var errorTask = process.StandardError.ReadToEndAsync();

  // Compress the output
  await using (var fileStream = File.Create(outputFile))
  await using (var gzipStream = new GZipStream(fileStream, CompressionMode.Compress))
  {
    await process.StandardOutput.BaseStream.CopyToAsync(gzipStream);
  }

  await process.WaitForExitAsync();
  var error = await errorTask;

  if (process.ExitCode != 0)
  {
    throw new InvalidOperationException($"pg_dump failed: {error}");
  }
}

/// <summary>
/// Thrown when a database's credential Secret is absent. Distinct from every
/// other failure so the deploy-ordering race can be told apart from a database
/// that genuinely has no credential -- see the catch in the backup loop.
/// </summary>
sealed class MissingCredentialSecretException(string message, Exception? inner = null)
  : InvalidOperationException(message, inner);

/// <summary>One `Database` resource, reduced to what this job needs.</summary>
sealed record DeclaredDatabase(
  string Database,
  string ObjectName,
  bool Enabled,
  string CredentialsSecret,
  string? Reason,
  DateTime? CreatedAt)
{
  /// <summary>`name` for the common case, `name (details)` when it is not.</summary>
  public string Describe()
  {
    var notes = new List<string>();
    if (!Enabled) notes.Add("excluded");
    if (!string.Equals(CredentialsSecret, $"{Database}-postgres", StringComparison.Ordinal)) notes.Add($"via {CredentialsSecret}");
    return notes.Count == 0 ? Database : $"{Database} ({string.Join(", ", notes)})";
  }
}

/// <summary>
/// Only the fields this job reads. A CRD needs no more than that, and spelling
/// out the whole CNPG schema here would be a second copy of it to keep in step.
/// </summary>
sealed class CnpgDatabaseSpec
{
  [JsonPropertyName("name")]
  public string? Name { get; set; }

  [JsonPropertyName("owner")]
  public string? Owner { get; set; }

  [JsonPropertyName("ensure")]
  public string? Ensure { get; set; }
}

sealed class CnpgDatabase : IKubernetesObject<V1ObjectMeta>
{
  [JsonPropertyName("apiVersion")]
  public string ApiVersion { get; set; } = "postgresql.cnpg.io/v1";

  [JsonPropertyName("kind")]
  public string Kind { get; set; } = "Database";

  [JsonPropertyName("metadata")]
  public V1ObjectMeta Metadata { get; set; } = new();

  [JsonPropertyName("spec")]
  public CnpgDatabaseSpec? Spec { get; set; }
}

/// <summary>
/// The list wrapper `GenericClient.ListNamespacedAsync` deserialises into.
/// Declared here because KubernetesClient 19 ships no generic
/// `CustomResourceList&lt;T&gt;` -- `IItems&lt;T&gt;` plus
/// `IKubernetesObject&lt;V1ListMeta&gt;` is the whole contract it needs.
/// </summary>
sealed class CnpgDatabaseList : IKubernetesObject<V1ListMeta>, IItems<CnpgDatabase>
{
  [JsonPropertyName("apiVersion")]
  public string ApiVersion { get; set; } = "postgresql.cnpg.io/v1";

  [JsonPropertyName("kind")]
  public string Kind { get; set; } = "DatabaseList";

  [JsonPropertyName("metadata")]
  public V1ListMeta Metadata { get; set; } = new();

  [JsonPropertyName("items")]
  public IList<CnpgDatabase> Items { get; set; } = [];
}
