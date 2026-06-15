#:sdk Microsoft.NET.Sdk.Web
#:package Flurl.Http@4.0.2
#:property PublishAot=false
#:package System.Reactive@7.0.0-preview.20

using System.Reactive.Linq;
using System.Text;
using System.Text.Json.Serialization;
using Flurl.Http;

var authentikUrl = Environment.GetEnvironmentVariable("AUTHENTIK_URL");
var bearerToken = Environment.GetEnvironmentVariable("AUTHENTIK_API_TOKEN");

var builder = WebApplication.CreateSlimBuilder(args);
var app = builder.Build();
app.MapGet("/applications", async (HttpContext context) =>
{
    var applications = await Observable.FromAsync(async () =>
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
            .ToArray();
    var sb = new StringBuilder();
    sb.Append(RenderGroup(applications));

    context.Response.Headers.CacheControl = new Microsoft.Net.Http.Headers.CacheControlHeaderValue
    {
        Public = true,
        MaxAge = TimeSpan.FromHours(1)
    }.ToString();


    context.Response.Headers.Append("widget-content-frameless", "false");
    context.Response.Headers.Append("widget-content-type", "html");
    context.Response.Headers.Append("widget-title", "Kubernetes Nodes");

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
    , "text/html");

});

app.Run();

static string RenderGroup(AuthentikApplication[] applications)
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
        foreach (var app in group.Applications)
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

public partial class AuthentikApplicationResponse
{
    [JsonPropertyName("pagination")]
    public Pagination Pagination { get; set; }

    [JsonPropertyName("results")]
    public AuthentikApplication[] Results { get; set; }
}


public partial class Pagination
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

public partial class AuthentikApplication
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

public partial class Obj
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

public partial class MetaIconThemedUrls
{
    [JsonPropertyName("light")]
    public string Light { get; set; }

    [JsonPropertyName("dark")]
    public string Dark { get; set; }
}
