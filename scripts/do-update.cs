#!/usr/bin/dotnet run

#:package ProcessX@1.5.6

using Cysharp.Diagnostics;

// Runs every `Update.cs` under kubernetes/. Each one is a file-based dotnet app
// that regenerates part of the tree -- passwords in components/postgres, the
// shared ConfigMaps in components/common, the Tailscale service list in
// apps/tailscale-system/services. Invoked by `mise run update`.
//
// Children are invoked PLAINLY, with no secret-resolution wrapper. The
// `update` task runs this whole script under `mise run vals-run`, so the
// environment already carries resolved values and every child inherits them --
// one resolution per run rather than one per script.
//
// This deliberately does NOT use `op run`, which is what it did in
// equestria-cluster. That repo's secrets were all `op://` literals; here every
// value in .config/mise.toml names its own backend (`ref+openbao://`,
// `ref+sops://`, `ref+op://`, ...) and `vals-run` is the documented `op run`
// replacement. Hardcoding a backend here would undo that.
//
// Order is sorted rather than filesystem order: these scripts mint credentials,
// and a run that regenerates them in a different sequence each time is much
// harder to reason about when one of them fails halfway.

var scripts = Directory
  .EnumerateFiles("kubernetes", "Update.cs", SearchOption.AllDirectories)
  .Order(StringComparer.Ordinal)
  .ToList();

if (scripts.Count == 0)
{
  Console.Error.WriteLine("do-update: no Update.cs found under kubernetes/ -- run this from the repo root.");
  return 1;
}

var failures = new List<string>();

foreach (var item in scripts)
{
  Console.WriteLine($"Processing: {item}");

  var (process, stdout, stderr) = ProcessX.GetDualAsyncEnumerable(
    $"dotnet run {item}",
    workingDirectory: Directory.GetCurrentDirectory());

  // Drain both streams CONCURRENTLY. ProcessX signals a non-zero exit by
  // throwing ProcessErrorException out of the *stdout* enumerable, so draining
  // stderr only after stdout has finished -- which is what this script did
  // originally -- discards the child's error output at exactly the moment it is
  // the only thing worth reading.
  var drainStderr = Task.Run(async () =>
  {
    try
    {
      await foreach (var line in stderr)
      {
        Console.Error.WriteLine(line);
      }
    }
    catch (ProcessErrorException)
    {
      // Same non-zero exit the stdout side reports; recorded once, below.
    }
  });

  try
  {
    await foreach (var line in stdout)
    {
      Console.WriteLine(line);
    }
  }
  catch (ProcessErrorException ex)
  {
    failures.Add($"{item} (exit {ex.ExitCode})");
  }

  await drainStderr;
}

if (failures.Count > 0)
{
  Console.Error.WriteLine($"\ndo-update: {failures.Count} of {scripts.Count} update script(s) failed:");
  foreach (var failure in failures)
  {
    Console.Error.WriteLine($"  {failure}");
  }
  return 1;
}

Console.WriteLine($"\ndo-update: {scripts.Count} update script(s) completed.");
return 0;
