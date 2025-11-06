#:package SSH.NET@2025.1.0
#:package FluentScheduler@5.5.3
#:package CliWrap@3.9.0
#:package Dumpify@0.6.6
#:package 1Password.Connect.Sdk@1.0.4

using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using System.IO.Compression;
using CliWrap;
using CliWrap.Buffered;
using Dumpify;
using FluentScheduler;
using OnePassword.Connect.Sdk;
using Renci.SshNet.Security;

var httpClient = new HttpClient();

var client = new OnePasswordConnectClient(
    Environment.GetEnvironmentVariable("CONNECT_TOKEN")!,
    Environment.GetEnvironmentVariable("CONNECT_HOST")!
);

var vault = ( await client.GetVaultsAsync($"name eq \"Eris\"") ).Single();
// var lunaDockge = await GetItemByTitle(client, vault.Id, "DockgeLxc: Luna");
// var alphaSiteDockge = await GetItemByTitle(client, vault.Id, "DockgeLxc: Alpha Site");

static async Task RunJobs()
{
    var sgcVolsyncFolders =
Directory.EnumerateDirectories("/spike/backup/sgc/volsync")
.Select(path => (key: "sgc", path));
    var equestriaVolsyncFolders =
Directory.EnumerateDirectories("/spike/backup/equestria/volsync")
.Select(path => (key: "equestria", path));
    var localBackend = new LocalBackend("local");
    var lunaSftpBackend = new SftpBackend("luna", "dockge-luna.${tailscaleDomain}");

    foreach (var item in sgcVolsyncFolders.Concat(equestriaVolsyncFolders))
    {
        try
        {
            Console.WriteLine($"Starting sync for {item.key}-{Path.GetFileName(item.path)} to local");
            await Rclone(
                $"{item.key}-{Path.GetFileName(item.path)}",
                localBackend,
                item.path,
                localBackend,
                $"/data/backup/{item.key}/volsync/{Path.GetFileName(item.path)}"
            );
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error syncing {item.key}-{Path.GetFileName(item.path)}: {ex.Message}");
        }
    }

    foreach (var item in sgcVolsyncFolders.Concat(equestriaVolsyncFolders))
    {
        try
        {
            Console.WriteLine($"Starting sync for {item.key}-{Path.GetFileName(item.path)} to luna");
            await Rclone(
                $"{item.key}-{Path.GetFileName(item.path)}",
                localBackend,
                $"/data/backup/{item.key}/volsync/{Path.GetFileName(item.path)}",
                lunaSftpBackend,
                // destination here is already mapped by sftp
                $"/{item.key}/volsync/{Path.GetFileName(item.path)}"
            );
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error syncing {item.key}-{Path.GetFileName(item.path)}: {ex.Message}");
        }
    }
}

JobManager.Initialize();

JobManager.AddJob(async () =>
{
    Console.WriteLine("Starting Rclone Jobs");
    await DownloadRclone();
    await RunJobs();
    Console.WriteLine("Rclone Jobs Completed");
}, a => a.ToRunEvery(5).Days().At(10, 00));

JobManager.Start();

static async Task DownloadRclone()
{
    var rcloneItem = Path.Combine(Path.GetTempPath(), "rclone.zip");

    {
        var client = new HttpClient();
        using var rcloneStream = await client.GetStreamAsync("https://downloads.rclone.org/rclone-current-linux-amd64.zip");
        using var writeStream = File.OpenWrite(rcloneItem);
        await rcloneStream.CopyToAsync(writeStream);
        await rcloneStream.FlushAsync();
        await writeStream.FlushAsync();
    }

    using var archive = ZipFile.OpenRead(rcloneItem);
    var entry = archive.Entries.Where(z => z.Name == "rclone").Single();
    entry.ExtractToFile(Path.Combine(Path.GetTempPath(), "rclone"), true);
    await Cli.Wrap("chmod")
        .WithArguments($"+x {Path.Combine(Path.GetTempPath(), "rclone")}")
        .ExecuteAsync();
}

static async Task Rclone(string name, RCloneBackend source, string sourcePath, RCloneBackend destination, string destinationPath)
{
    var item = await Cli.Wrap(Path.Combine(Path.GetTempPath(), "rclone"))
    .WithStandardOutputPipe(PipeTarget.ToStream(Console.OpenStandardOutput()))
    .WithStandardErrorPipe(PipeTarget.ToStream(Console.OpenStandardError()))
    .WithEnvironmentVariables(
        source.GetEnvironmentVariables()
        .Concat(destination.GetEnvironmentVariables())
        .DistinctBy(kv => kv.Key)
        .ToDictionary(kv => kv.Key, kv => (string?)kv.Value)
    )
        .WithArguments(args =>
        args
        .Add("sync")
        .Add(source.GetRemotePath(sourcePath))
        .Add(destination.GetRemotePath(destinationPath))
        .Add("--progress")
    )
        .ExecuteAsync();


    Console.WriteLine($"{name} exited with code {item.ExitCode} in {item.RunTime.ToString("c")}");
}

static async Task<OnePassword.Connect.Sdk.Models.Item> GetItemByTitle(OnePasswordConnectClient client, string vaultId, string title)
{
    var items = await client.GetVaultItemsAsync(vaultId, $"title eq \"{title}\"");
    return items.Single();
}

abstract record RCloneBackend(string Remote)
{
    public abstract IEnumerable<KeyValuePair<string, string>> GetEnvironmentVariables();
    public abstract string GetRemotePath(string path);
}
record SftpBackend(string Remote, string Host) : RCloneBackend(Remote)
{
    public override IEnumerable<KeyValuePair<string, string>> GetEnvironmentVariables()
    {
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_TYPE", "sftp");
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_HOST", Host);
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_PORT", "2022");
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_USER", "sftp");
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_KEY_FILE", "/keys/id_ed25519");
    }
    public override string GetRemotePath(string path) => $"{Remote}:{path}";
}
record B2Backend(string Remote, string Bucket, string KeyID, string KeySecret) : RCloneBackend(Remote)
{
    public override IEnumerable<KeyValuePair<string, string>> GetEnvironmentVariables()
    {
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_TYPE", "b2");
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_ACCOUNT", KeyID);
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_KEY", KeySecret);
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_HARD_DELETE", "true");
    }

    public override string GetRemotePath(string path) => $"{Remote}:{Bucket}/{path}";
}

record S3Backend(string Remote, string Bucket, string AccessKeyID, string SecretAccessKey, string Endpoint) : RCloneBackend(Remote)
{
    public override IEnumerable<KeyValuePair<string, string>> GetEnvironmentVariables()
    {
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_TYPE", "s3");
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_PROVIDER", "Rclone");
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_ENDPOINT", Endpoint);
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_ACCESS_KEY_ID", AccessKeyID);
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_SECRET_ACCESS_KEY", SecretAccessKey);
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_USE_MULTIPART_UPLOADS", "false");
    }

    public override string GetRemotePath(string path) => $"{Remote}:{Bucket}/{path}";
}

record LocalBackend(string Remote) : RCloneBackend(Remote)
{
    public override IEnumerable<KeyValuePair<string, string>> GetEnvironmentVariables()
    {
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_TYPE", "local");
    }

    public override string GetRemotePath(string path) => path;
}
