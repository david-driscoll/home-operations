#:package SSH.NET@2025.1.0
#:package FluentScheduler@5.5.3
#:package CliWrap@3.9.0
#:package Dumpify@0.6.6
#:package 1Password.Connect.Sdk@1.0.4
#:package Blobject.NFS@5.0.14


using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using System.IO.Compression;
using Blobject.NFS;
using CliWrap;
using CliWrap.Buffered;
using Dumpify;
using FluentScheduler;
using OnePassword.Connect.Sdk;
using OnePassword.Connect.Sdk.Models;

var httpClient = new HttpClient();

var client = new OnePasswordConnectClient(
    Environment.GetEnvironmentVariable("CONNECT_TOKEN")!,
    Environment.GetEnvironmentVariable("CONNECT_HOST")!
);

var vault = ( await client.GetVaultsAsync($"name eq \"Eris\"") ).Single();
// var lunaDockge = await GetItemByTitle(client, vault.Id, "DockgeLxc: Luna");
// var alphaSiteDockge = await GetItemByTitle(client, vault.Id, "DockgeLxc: Alpha Site");

var jobs = Directory.EnumerateFiles("/jobs", "*.json")
.Select(path =>
{
    var content = System.IO.File.ReadAllText(path);
    return System.Text.Json.JsonSerializer.Deserialize<BackupTask>(content)!;
})
.ToArray();

var rcloneJobs = await Task.WhenAll(jobs.Select(async job =>
{
    var sourceBackend = await CreateBackend("source", job.SourceType, job.SourcePath, job.SourceSecret);
    var destinationBackend = await CreateBackend("destination", job.DestinationType, job.DestinationPath, job.DestinationSecret);

    return new RCloneJob(
        job.Name,
        sourceBackend,
        job.SourcePath,
        destinationBackend,
        job.DestinationPath
    );
}));

async Task<RCloneBackend> CreateBackend(string name, string type, string path, string? secret)
{
    FullItem? secretItem = null;
    if (secret is { Length: > 0 })
    {
        secretItem = await GetItemByTitle(client, vault.Id, secret);
    }
    return type switch
    {
        "local" => new LocalBackend(name),
        "sftp" => new SftpBackend(name, path),
        "b2" => new B2Backend(name, secretItem!.GetField("bucket").Value!, secretItem!.GetField("username").Value!, secretItem!.GetField("credential").Value!),
        // "s3" => new S3Backend(name, ),
        _ => throw new InvalidOperationException($"Unknown backend type: {type}"),
    };
}

static async Task RunJobs(RCloneJob[] jobs)
{
    foreach (var job in jobs)
    {
        try
        {
            Console.WriteLine($"Starting job {job.Name}");
            await Rclone(job);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error running job {job.Name}: {ex.Message}");
        }
    }
}

await DownloadRclone();
await RunJobs(rcloneJobs);
JobManager.Initialize();

JobManager.AddJob(async () =>
{
    Console.WriteLine("Starting Rclone Jobs");
    await RunJobs(rcloneJobs);
    Console.WriteLine("Rclone Jobs Completed");
}, a => a.ToRunEvery(5).Days().At(10, 00));

JobManager.Start();

static async Task DownloadRclone()
{
    var rcloneItem = Path.Combine(Path.GetTempPath(), "rclone.zip");

    {
        var client = new HttpClient();
        using var rcloneStream = await client.GetStreamAsync("https://downloads.rclone.org/rclone-current-linux-amd64.zip");
        using var writeStream = System.IO.File.OpenWrite(rcloneItem);
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

static async Task Rclone(RCloneJob job)
{
    using var httpClient = new HttpClient();
    var item = await Cli.Wrap(Path.Combine(Path.GetTempPath(), "rclone"))
    .WithStandardOutputPipe(PipeTarget.ToStream(Console.OpenStandardOutput()))
    .WithStandardErrorPipe(PipeTarget.ToStream(Console.OpenStandardError()))
    .WithEnvironmentVariables(
        job.Source.GetEnvironmentVariables()
        .Concat(job.Destination.GetEnvironmentVariables())
        .DistinctBy(kv => kv.Key)
        .ToDictionary(kv => kv.Key, kv => (string?)kv.Value)
    )
        .WithArguments(args =>
        args
        .Add("sync")
        .Add(job.Source.GetRemotePath(job.SourcePath))
        .Add(job.Destination.GetRemotePath(job.DestinationPath))
        .Add("--progress")
    )
        .ExecuteAsync();


    if (item.ExitCode != 0)
    {
        Console.WriteLine($"Rclone job {job.Name} failed with exit code {item.ExitCode}");
    }
    try
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"$UPTIME_API_URL/api/v1/endpoints/{job.Name}/external?success={( item.ExitCode == 0 ).ToString().ToLower()}&error={( item.ExitCode == 0 ? "" : $"Rclone job {job.Name} failed with exit code {item.ExitCode}" )}&duration={item.RunTime:c}")
        {
            Headers = { Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", job.Name) }
        };
        var response = await httpClient.SendAsync(request);
        response.Dump();
        await response.Content.ReadAsStringAsync().Dump();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error reporting to Uptime API: {ex.Message}");
        ex.Dump();
    }
    Console.WriteLine($"{job.Name} exited with code {item.ExitCode} in {item.RunTime:c}");
}

static async Task<FullItem> GetItemByTitle(OnePasswordConnectClient client, string vaultId, string title)
{
    var items = await client.GetVaultItemsAsync(vaultId, $"title eq \"{title}\"");
    var item = await client.GetVaultItemByIdAsync(vaultId, items.Single().Id);
    return item;
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

record BackupTask(string Name, string SourceType, string SourcePath, string? SourceSecret, string DestinationType, string DestinationPath, string? DestinationSecret);
record RCloneJob(string Name, RCloneBackend Source, string SourcePath, RCloneBackend Destination, string DestinationPath);

static class RCloneBackendExtensions
{
    public static Field GetField(this FullItem item, string key)
    {
        return item.Fields.First(z => z.Label == key);
    }

}