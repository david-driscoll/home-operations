#:sdk Microsoft.NET.Sdk.Web
#:package Flurl.Http@4.0.2
#:property PublishAot=false
#:package PromQL.NET@0.4.1
#:package System.Reactive@7.0.0

using System.Reactive.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Flurl;
using Flurl.Http;
using Microsoft.AspNetCore.Http.Extensions;
using PromQL;
using PromQL.Vectors;

using VectorReturnType = (string Name, System.Collections.Generic.IDictionary<(string Cluster, string MachineType), string> Values);

var thanosUrl = Environment.GetEnvironmentVariable("THANOS_URL");
var authentikUrl = Environment.GetEnvironmentVariable("AUTHENTIK_URL");
var bearerToken = Environment.GetEnvironmentVariable("AUTHENTIK_API_TOKEN");

var builder = WebApplication.CreateSlimBuilder(args);

{
    var vectors = new List<Func<Task<VectorReturnType>>>
    {
        QueryVector("cpu", "100 * (1 - avg by (cluster, cluster_title, machine_type) (rate(node_cpu_seconds_total{mode=\"idle\"}[1h])))"),
        QueryVector("memory-usage", "100 * avg by (cluster, cluster_title, machine_type) (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)"),
        QueryVector("memory-max", "sum by (cluster, cluster_title, machine_type) (node_memory_MemTotal_bytes / 1024 / 1024 / 1024)"),
    };
    builder.Services.AddSingleton<IEnumerable<Func<Task<VectorReturnType>>>>(vectors);
}
builder.Services.AddHttpClient();
builder.Services.AddHttpLogging();
builder.Services.AddOutputCache(o =>
{
    o.AddBasePolicy(p =>
    {
        if (builder.Environment.IsProduction())
        {
            p.Cache();
            p.Expire(TimeSpan.FromHours(1));
        }
        else
        {
            p.NoCache();
        }
    });
});

builder.Services.AddSingleton(sp => Observable.Create<IEnumerable<AuthentikApplication>>(observer =>
{
    var env = sp.GetRequiredService<IHostEnvironment>();
    return Observable.Timer(env.IsProduction() ? TimeSpan.FromHours(1) : TimeSpan.FromSeconds(10))
    .StartWith(0)
        .Select(_ => Observable.FromAsync(async () =>
         await $"{authentikUrl}/api/v3/core/applications/?only_with_launch_url=true&page_size=100&superuser_full_list=true"
            .WithOAuthBearerToken(bearerToken)
            .GetJsonAsync<AuthentikApplicationResponse>())
            .Expand(resp => resp.Pagination.Current < resp.Pagination.TotalPages
                ? Observable.FromAsync(async () =>
                    await $"{authentikUrl}/api/v3/core/applications/?only_with_launch_url=true&page_size=100&superuser_full_list=true&page={resp.Pagination.Current + 1}"
                        .WithOAuthBearerToken(bearerToken)
                        .GetJsonAsync<AuthentikApplicationResponse>())
                : Observable.Empty<AuthentikApplicationResponse>())
                .SelectMany(z => z.Results)
                .Where(z => !string.IsNullOrWhiteSpace(z.MetaLaunchUrl?.ToString()))
                .ToArray())
                .Switch()
                .Subscribe(observer);
}));
// builder.Services.AddSingleton(sp => Observable.Create<IEnumerable<AuthentikApplication>>(observer =>
// {
//     var env = sp.GetRequiredService<IHostEnvironment>();


//     Observable.Timer(env.IsProduction() ? TimeSpan.FromSeconds(30) : TimeSpan.FromSeconds(10))
//     .StartWith(0)
//         .Select(_ => Observable.FromAsync(async () => await $"{thanosUrl}/api/v1/query?query=round(100 * (1 - avg(rate(node_cpu_seconds_total{{mode=\"idle\"}}[5m]))), 0.1)"
//             .GetJsonAsync())
/*

- type: custom-api
  title: Cluster Resources
  url: ${THANOS_URL}/api/v1/query
  update-interval: 2m
  parameters:
    query: 'round(100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle",cluster="equestria"}[5m]))), 0.1)'
  subrequests:
    memory:
      url: ${THANOS_URL}/api/v1/query
      parameters:
        query: 'round(100 * (1 - avg(node_memory_MemAvailable_bytes{cluster="equestria"} / node_memory_MemTotal_bytes{cluster="equestria"})), 0.1)'
  template: |
    {{ $cpu := $.JSON.String "data.result.0.value.1" }}
    {{ $mem := (.Subrequest "memory").JSON.String "data.result.0.value.1" }}
    <div style="display:flex;gap:24px;padding:4px 0;">
      <div><div style="font-size:0.75rem;color:var(--color-subdue);text-transform:uppercase;">CPU</div><div style="font-size:1.2rem;font-weight:700;">{{ if $cpu }}{{ $cpu }}%{{ else }}N/A{{ end }}</div></div>
      <div><div style="font-size:0.75rem;color:var(--color-subdue);text-transform:uppercase;">Memory</div><div style="font-size:1.2rem;font-weight:700;">{{ if $mem }}{{ $mem }}%{{ else }}N/A{{ end }}</div></div>
    </div>
*/
// });



var app = builder.Build();
app.UseOutputCache();
app.MapGet("/applications", async (HttpContext context, IObservable<IEnumerable<AuthentikApplication>> applications) =>
{
    var apps = await applications.FirstAsync();
    return RenderWidget("Applications", apps
    .Where(z => !z.Group.StartsWith("System:"))
    .OrderBy(app => app.Group), context.Response, app.Environment.IsProduction());

}).CacheOutput();
app.MapGet("/clusters/dockge", async (HttpContext context, ILoggerFactory factory, IEnumerable<Func<Task<VectorReturnType>>> vectorQueries) =>
{
var logger = factory.CreateLogger("Extensions");
var r = await GetMetrics(vectorQueries);
var sb = new StringBuilder();
foreach (var item in r)
{
        if (item.Value.MachineType != "dockge") continue;
        sb.AppendLine(RenderServer(item.Key, item.Value.Values, context.Response, app.Environment.IsProduction()));
    }
RenderWidgetHeaders(context.Response, "Dockge Nodes", app.Environment.IsProduction(), false);

return Results.Content(sb.ToString(), "text/html");

}).CacheOutput(x => x.Expire(TimeSpan.FromSeconds(30)));
app.MapGet("/cluster/applications/{cluster}", async (HttpContext context, string cluster, ILoggerFactory factory, IObservable<IEnumerable<AuthentikApplication>> applications) =>
{
    var logger = factory.CreateLogger("Extensions");
    var apps = await applications.FirstAsync();
    var clusterName = cluster.Replace("-", " ");
    logger.LogInformation("Rendering widget for cluster {ClusterName} with {AppCount} applications", clusterName, apps.Count(z => z.MetaPublisher.Equals(clusterName, StringComparison.OrdinalIgnoreCase)));
    var clusterApps = apps
    .Where(z => z.MetaPublisher.Equals(clusterName, StringComparison.OrdinalIgnoreCase))
    .OrderBy(app => app.Group.StartsWith("System:") ? 1 : 0)
    .Select(z => z with { Group = z.Group.StartsWith("System:") ? "System" : z.Group })
    .OrderBy(app => app.Group)
    .ToArray();
    var clusterTitle = clusterApps.First().MetaPublisher;
    return RenderWidget(clusterTitle, clusterApps, context.Response, app.Environment.IsProduction());

}).CacheOutput();
app.MapGet("/cluster/resources/{cluster}", async (HttpContext context, string cluster, ILoggerFactory factory, IEnumerable<Func<Task<VectorReturnType>>> vectorQueries) =>
{
    var logger = factory.CreateLogger("Extensions");
    var clusterName = cluster.Replace("-", " ");
    logger.LogInformation("Rendering resources widget for cluster {ClusterName}", clusterName);
    var r = await GetMetrics(vectorQueries);
    var sb = new StringBuilder();
    foreach (var item in r)
    {
        if (!item.Key.Equals(clusterName, StringComparison.OrdinalIgnoreCase)) continue;
        sb.AppendLine(RenderServer(null, item.Value.Values, context.Response, app.Environment.IsProduction()));
    }
    RenderWidgetHeaders(context.Response, "Cluster Resources", app.Environment.IsProduction(), false);

    return Results.Content(sb.ToString(), "text/html");

}).CacheOutput(x => x.Expire(TimeSpan.FromSeconds(30)));

app.Run();

static Func<Task<VectorReturnType>> QueryVector(string name, string query)
{
    var queryParams = new QueryParamCollection
    {
        { "query", query }
    };
    var uri = new UriBuilder($"{Environment.GetEnvironmentVariable("THANOS_URL")}/api/v1/query")
    {
        Query = queryParams.ToString()
    };
    return async () =>
    {
        var response = await uri.ToString().GetJsonAsync<PrometheusVector>();
        return (name, response.Data.Result
    .Where(z => !string.IsNullOrWhiteSpace(z.Metric.MachineType))
    .ToDictionary(z => (z.Metric.ClusterTitle, z.Metric.MachineType), z => z.Value switch
    {
        [_, JsonElement { ValueKind: JsonValueKind.String } v] => double.TryParse(v.GetString(), out var d) ? d.ToString("F2") : v.GetString(),
        _ => "N/A"
    }));
    };
}

static void RenderWidgetHeaders(HttpResponse response, string title, bool isProduction, bool frameless = true)
{
    response.Headers.Append("widget-content-frameless", frameless.ToString().ToLower());
    response.Headers.Append("widget-content-type", "html");
    response.Headers.Append("widget-title", title);
    if (isProduction)
    {
        response.Headers.Append("widget-update-interval", "1h");
    }
    else
    {
        response.Headers.Append("widget-update-interval", "10s");
    }
}

static IResult RenderWidget(string title, IEnumerable<AuthentikApplication> apps, HttpResponse response, bool isProduction)
{
    var sb = new StringBuilder();
    sb.Append(RenderGroup(apps));
    RenderWidgetHeaders(response, title, isProduction);

    return Results.Content(
    $$$"""
    <style>
        .app-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(0,0,0,0.05);
        border-radius: 8px;
        text-decoration: none;
        color: var(--color-primary);
        transition: background 120ms ease-in-out;
        }
        .app-item:hover { background: rgba(0,0,0,0.08); }
        .app-icon { width: 24px; height: 24px; object-fit: contain; }
        .app-name { font-size: 0.95rem; font-weight: 600; }
        .app-description { display: block; font-size: 0.8rem; color: var(--color-subdue); }
        .app-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
        }
        .app-grid-item { margin: 0; }
        @media (max-width: 900px) {
        .app-grid { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
        }
        @media (max-width: 600px) {
        .app-grid { grid-template-columns: 1fr; }
        }
    </style>
    {{{sb}}}
    """
    , "text/html"
    );
}

static string RenderServer(string? title, IDictionary<string, double?> results, HttpResponse response, bool isProduction)
{
    results.TryGetValue("cpu", out var cpu);
    results.TryGetValue("memory-usage", out var memUsage);
    results.TryGetValue("memory-max", out var memMax);

    var titleTemplate = title != null ? $$$"""
            <div class="server-details">
                <div class="server-name color-highlight size-h3">{{{title}}}</div>
            </div>
            """ : "";

    return $$$"""
    <div class="server">
        <div class="server-info">
            {{{titleTemplate}}}
            <div class="shrink-0" data-popover-type="html" data-popover-margin="0.2rem" data-popover-max-width="400px">
                <div class="color-positive">
                    <svg class="server-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.268-9.64a3.375 3.375 0 0 0-3.285-2.602H7.923a3.375 3.375 0 0 0-3.285 2.602l-2.268 9.64a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3m19.5 0a3 3 0 0 0-3-3H5.25a3 3 0 0 0-3 3m16.5 0h.008v.008h-.008v-.008Zm-3 0h.008v.008h-.008v-.008Z" />
                    </svg>
                </div>
            </div>
        </div>

        <div class="server-stats">
            <div class="flex-1">
                <div class="flex items-end size-h5">
                    <div>CPU</div>
                    <div class="color-highlight margin-left-auto text-very-compact">
                        {{{cpu:F2}}} <span class="color-base">%</span>
                    </div>
                </div>
                <div class="progress-bar">
                    <div class="progress-value" style="--percent: {{{cpu:F0}}}"></div>
                </div>
            </div>
            <div class="flex-1">
                <div class="flex items-end size-h5">
                    <div>RAM</div>
                    <div class="color-highlight margin-left-auto text-very-compact">
                        {{{memUsage:F2}}} <span class="color-base">%</span>
                    </div>
                </div>
                <div data-popover-type="html">
                    <div data-popover-html>
                        <div class="flex">
                            <div class="size-h5">RAM</div>
                            <div class="value-separator"></div>
                            <div class="color-highlight text-very-compact">
                                {{{memUsage:F2}}} <span class="color-base size-h5">/</span> {{{memMax:F2}}}
                            </div>
                        </div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-value" style="--percent: {{{memUsage:F0}}}"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    """;
}

static string RenderGroup(IEnumerable<AuthentikApplication> applications)
{
    var sb = new StringBuilder();
    foreach (var group in applications
            .GroupBy(app => app.Group)
            .Select(g => new { Group = g.Key, Applications = g.ToArray() }))
    {
        sb.AppendLine($"""
        <div class="widget-header">
            <h2 class="uppercase widget-title-wrapper"><span>{group.Group}</span></h2>
        </div>
        <div class="widget-content">
        <ul class="app-grid">
        """);
        foreach (var app in group.Applications.OrderBy(app => app.Name))
        {
            sb.Append(RenderApplication(app));
        }
        sb.AppendLine("""
        </ul>
        </div>
        """);
    }
    return sb.ToString();

}
static string RenderApplication(AuthentikApplication app)
{
    return $"""
            <li class="app-grid-item">
                <a href="{app.MetaLaunchUrl}" target="_blank" class="app-item" title="{app.MetaDescription}">
                    <img src="{app.MetaIcon}" alt="{app.Name}" class="app-icon">
                    <span>
                    <span class="app-name">{app.Name}</span>
                    </span>
                </a>
            </li>
            """;
}

static async Task<Dictionary<string, (string MachineType, IDictionary<string, double?> Values)>> GetMetrics(

    IEnumerable<Func<Task<VectorReturnType>>> vectorQueries)
{
    var results = await Task.WhenAll(vectorQueries.Select(x => x()));
    var r = new Dictionary<string, (string MachineType, IDictionary<string, double?> Values)>();
    foreach (var (name, values) in results)
    {
        Console.WriteLine($"Processing results for vector {name} with {values.Count} entries");
        Console.WriteLine(JsonSerializer.Serialize(values.Values));
        foreach (var (c, value) in values)
        {
            if (!r.TryGetValue(c.Cluster, out var clusterDict))
            {
                clusterDict = (c.MachineType, new Dictionary<string, double?>());
                r[c.Cluster] = clusterDict;
            }
            clusterDict.Values[name] = double.TryParse(value, out var d) ? d : (double?)null;
        }
    }

    return r;
}
public partial record AuthentikApplicationResponse
{
    [JsonPropertyName("pagination")]
    public Pagination Pagination { get; set; }

    [JsonPropertyName("results")]
    public AuthentikApplication[] Results { get; set; }
}


public partial record Pagination
{
    [JsonPropertyName("next")]
    public long? Next { get; set; }

    [JsonPropertyName("previous")]
    public long? Previous { get; set; }

    [JsonPropertyName("count")]
    public long? Count { get; set; }

    [JsonPropertyName("current")]
    public long? Current { get; set; }

    [JsonPropertyName("total_pages")]
    public long? TotalPages { get; set; }

    [JsonPropertyName("start_index")]
    public long? StartIndex { get; set; }

    [JsonPropertyName("end_index")]
    public long? EndIndex { get; set; }
}

public partial record AuthentikApplication
{
    [JsonPropertyName("pk")]
    public Guid Pk { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; }

    [JsonPropertyName("slug")]
    public string Slug { get; set; }

    [JsonPropertyName("provider")]
    public long? Provider { get; set; }

    [JsonPropertyName("provider_obj")]
    public Obj ProviderObj { get; set; }

    [JsonPropertyName("backchannel_providers")]
    public long[] BackchannelProviders { get; set; }

    [JsonPropertyName("backchannel_providers_obj")]
    public Obj[] BackchannelProvidersObj { get; set; }

    [JsonPropertyName("launch_url")]
    public string LaunchUrl { get; set; }

    [JsonPropertyName("open_in_new_tab")]
    public bool OpenInNewTab { get; set; }

    [JsonPropertyName("meta_launch_url")]
    public Uri MetaLaunchUrl { get; set; }

    [JsonPropertyName("meta_icon")]
    public string MetaIcon { get; set; }

    [JsonPropertyName("meta_icon_url")]
    public string MetaIconUrl { get; set; }

    [JsonPropertyName("meta_icon_themed_urls")]
    public MetaIconThemedUrls MetaIconThemedUrls { get; set; }

    [JsonPropertyName("meta_description")]
    public string MetaDescription { get; set; }

    [JsonPropertyName("meta_publisher")]
    public string MetaPublisher { get; set; }

    [JsonPropertyName("policy_engine_mode")]
    public string PolicyEngineMode { get; set; }

    [JsonPropertyName("group")]
    public string Group { get; set; }

    [JsonPropertyName("meta_hide")]
    public bool MetaHide { get; set; }
}

public partial record Obj
{
    [JsonPropertyName("pk")]
    public long? Pk { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; }

    [JsonPropertyName("authentication_flow")]
    public Guid AuthenticationFlow { get; set; }

    [JsonPropertyName("authorization_flow")]
    public Guid AuthorizationFlow { get; set; }

    [JsonPropertyName("invalidation_flow")]
    public Guid InvalidationFlow { get; set; }

    [JsonPropertyName("property_mappings")]
    public Guid[] PropertyMappings { get; set; }

    [JsonPropertyName("component")]
    public string Component { get; set; }

    [JsonPropertyName("assigned_application_slug")]
    public string AssignedApplicationSlug { get; set; }

    [JsonPropertyName("assigned_application_name")]
    public string AssignedApplicationName { get; set; }

    [JsonPropertyName("assigned_backchannel_application_slug")]
    public string AssignedBackchannelApplicationSlug { get; set; }

    [JsonPropertyName("assigned_backchannel_application_name")]
    public string AssignedBackchannelApplicationName { get; set; }

    [JsonPropertyName("verbose_name")]
    public string VerboseName { get; set; }

    [JsonPropertyName("verbose_name_plural")]
    public string VerboseNamePlural { get; set; }

    [JsonPropertyName("meta_model_name")]
    public string MetaModelName { get; set; }
}

public partial record MetaIconThemedUrls
{
    [JsonPropertyName("light")]
    public string Light { get; set; }

    [JsonPropertyName("dark")]
    public string Dark { get; set; }
}

public partial class PrometheusVector
{
    [JsonPropertyName("status")]
    public string Status { get; set; }

    [JsonPropertyName("data")]
    public PrometheusVectorData Data { get; set; }
}

public partial record PrometheusVectorData
{
    [JsonPropertyName("resultType")]
    public string ResultType { get; set; }

    [JsonPropertyName("result")]
    public PrometheusVectorResult[] Result { get; set; }

    [JsonPropertyName("analysis")]
    public PrometheusVectorAnalysis Analysis { get; set; }
}

public partial record PrometheusVectorAnalysis
{
    [JsonPropertyName("name")]
    public string Name { get; set; }

    [JsonPropertyName("executionTime")]
    public string ExecutionTime { get; set; }

    [JsonPropertyName("children")]
    public object Children { get; set; }
}

public partial record PrometheusVectorResult
{
    [JsonPropertyName("metric")]
    public PrometheusVectorMetric Metric { get; set; }

    [JsonPropertyName("value")]
    public object[] Value { get; set; }
}

public partial record PrometheusVectorMetric
{
    [JsonPropertyName("cluster")]
    public string Cluster { get; set; }

    [JsonPropertyName("machine_type")]
    public string MachineType { get; set; }

    [JsonPropertyName("cluster_title")]
    public string ClusterTitle { get; set; }
}

public partial struct PrometheusVectorValue
{
    public double? Double;
    public string String;

    public static implicit operator PrometheusVectorValue(double Double) => new() { Double = Double };
    public static implicit operator PrometheusVectorValue(string String) => new() { String = String };
}
