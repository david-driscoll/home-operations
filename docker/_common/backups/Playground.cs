#:sdk Microsoft.NET.Sdk
#:package SSH.NET@2025.1.0
#:package CliWrap@3.9.0
#:package Dumpify@0.6.6
#:package 1Password.Connect.Sdk@1.0.4
#:package Microsoft.Extensions.Hosting@10.0.0-rc.2.25502.107
#:package NCronJob@4.6.0
#:package Humanizer.Core@*

using System.IO.Compression;
using System.Text;
using System.Text.Json.Serialization;
using CliWrap;
using Dumpify;
using Humanizer;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NCronJob;
using OnePassword.Connect.Sdk;
using OnePassword.Connect.Sdk.Models;
using Renci.SshNet.Common;

var httpClient = new HttpClient();

var client = new OnePasswordConnectClient(
    Environment.GetEnvironmentVariable("CONNECT_TOKEN")!,
    Environment.GetEnvironmentVariable("CONNECT_HOST")!
);

var vault = ( await client.GetVaultsAsync($"name eq \"Eris\"") ).Single();
// var lunaDockge = await GetItemByTitle(client, vault.Id, "DockgeLxc: Luna");
// var alphaSiteDockge = await GetItemByTitle(client, vault.Id, "DockgeLxc: Alpha Site");

async IAsyncEnumerable<RCloneJob> GetRCloneJobs()
{
    var jobs = Directory.EnumerateFiles("/jobs", "*.json")
    .Select(path =>
    {
        var content = System.IO.File.ReadAllText(path);
        var key = Path.GetFileNameWithoutExtension(path);
        return (key, value: System.Text.Json.JsonSerializer.Deserialize(content, LocalContext.Default.BackupTask)!);
    })
    .Dump("Loaded Jobs")
    .ToDictionary(kv => kv.key, kv => kv.value);

    foreach (var job in jobs)
    {
        var sourceBackend = await CreateBackend("source", job.Value.SourceType, job.Value.Source, job.Value.SourceSecret);
        var destinationBackend = await CreateBackend("destination", job.Value.DestinationType, job.Value.Destination, job.Value.DestinationSecret);

        yield return new RCloneJob(
            job.Key,
            job.Value.Name,
            job.Value.Schedule,
            sourceBackend,
            destinationBackend
        );
    }
}

async Task<RCloneBackend> CreateBackend(string name, string type, string path, string? secret)
{
    FullItem? secretItem = null;
    if (secret is { Length: > 0 })
    {
        secretItem = await GetItemByTitle(client, vault.Id, secret);
    }
    return type switch
    {
        "local" => new LocalBackend(name, path),
        "sftp" => new SftpBackend(name, path[0..path.IndexOf('/')], path[( path.IndexOf('/') + 1 )..]),
        "b2" => new B2Backend(name, secretItem!.GetField("bucket").Value!, path, secretItem!.GetField("username").Value!, secretItem!.GetField("credential").Value!),
        "s3" => path.Split('/') is { } parts ? new S3Backend(name, parts[0], parts[1], string.Join('/', parts.Skip(2)), secretItem!.GetField("username").Value!, secretItem!.GetField("credential").Value!) : throw new InvalidOperationException("Invalid S3 path format"),
        _ => throw new InvalidOperationException($"Unknown backend type: {type}"),
    };
}

var builder = Host.CreateApplicationBuilder(args);
await foreach (var grouping in GetRCloneJobs().GroupBy(z => z.Schedule))
{
    var dele = CreateJobDelegate(grouping);
    // instant run for now.
    await dele();
    builder.Services.AddNCronJob(dele, grouping.Key);
}

Func<Task> CreateJobDelegate(IEnumerable<RCloneJob> jobs)
{
    return async () =>
    {
        foreach (var job in jobs)
        {
            await Rclone(job);
        }
    };
}

await DownloadRclone();

var app = builder.Build();
await app.UseNCronJobAsync();
app.Run();

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
    var output = new StringBuilder();
    var error = new StringBuilder();
    var item = await Cli.Wrap(Path.Combine(Path.GetTempPath(), "rclone"))
    .WithStandardOutputPipe(PipeTarget.ToStringBuilder(output))
    .WithStandardErrorPipe(PipeTarget.ToStringBuilder(error))
    .WithEnvironmentVariables(
        job.Source.GetEnvironmentVariables()
        .Concat(job.Destination.GetEnvironmentVariables())
        .DistinctBy(kv => kv.Key)
        .ToDictionary(kv => kv.Key, kv => (string?)kv.Value)
    )
        .WithArguments(args =>
        args
        .Add("sync")
        .Add(job.Source.GetRemotePath())
        .Add(job.Destination.GetRemotePath())
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

abstract record RCloneBackend(string Remote, string Path)
{
    public abstract IEnumerable<KeyValuePair<string, string>> GetEnvironmentVariables();
    public abstract string GetRemotePath();
}
record SftpBackend(string Remote, string Host, string Path) : RCloneBackend(Remote, Path)
{
    public override IEnumerable<KeyValuePair<string, string>> GetEnvironmentVariables()
    {
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_TYPE", "sftp");
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_HOST", Host);
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_PORT", "2022");
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_USER", "sftp");
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_KEY_FILE", "/keys/id_ed25519");
    }
    public override string GetRemotePath() => $"{Remote}:{Path}";
}
record B2Backend(string Remote, string Bucket, string Path, string KeyID, string KeySecret) : RCloneBackend(Remote, Path)
{
    public override IEnumerable<KeyValuePair<string, string>> GetEnvironmentVariables()
    {
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_TYPE", "b2");
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_ACCOUNT", KeyID);
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_KEY", KeySecret);
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_HARD_DELETE", "true");
    }

    public override string GetRemotePath() => $"{Remote}:{Bucket}/{Path}";
}

record S3Backend(string Remote, string Endpoint, string Bucket, string Path, string AccessKeyID, string SecretAccessKey) : RCloneBackend(Remote, Path)
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

    public override string GetRemotePath() => $"{Remote}:{Bucket}/{Path}";
}

record LocalBackend(string Remote, string Path) : RCloneBackend(Remote, Path)
{
    public override IEnumerable<KeyValuePair<string, string>> GetEnvironmentVariables()
    {
        yield return new KeyValuePair<string, string>($"RCLONE_CONFIG_{Remote.ToUpper()}_TYPE", "local");
    }

    public override string GetRemotePath() => Path;
}

[JsonSerializable(typeof(BackupTask))]
[JsonSourceGenerationOptions(WriteIndented = true, PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
partial class LocalContext : JsonSerializerContext { }
record BackupTask(string Name, string Schedule, string SourceType, string Source, string? SourceSecret, string DestinationType, string Destination, string? DestinationSecret);
record RCloneJob(string Key, string Name, string Schedule, RCloneBackend Source, RCloneBackend Destination);

static class RCloneBackendExtensions
{
    public static Field GetField(this FullItem item, string key)
    {
        return item.Fields.First(z => z.Label == key);
    }

}