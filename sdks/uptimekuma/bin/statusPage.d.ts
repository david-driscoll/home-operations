import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class StatusPage extends pulumi.CustomResource {
    /**
     * Get an existing StatusPage resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StatusPageState, opts?: pulumi.CustomResourceOptions): StatusPage;
    /**
     * Returns true if the given object is an instance of StatusPage.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StatusPage;
    /**
     * Custom CSS for the status page
     */
    readonly customCss: pulumi.Output<string | undefined>;
    /**
     * Status page description
     */
    readonly description: pulumi.Output<string | undefined>;
    /**
     * List of custom domain names for the status page
     */
    readonly domainNameLists: pulumi.Output<string[] | undefined>;
    /**
     * Custom footer text
     */
    readonly footerText: pulumi.Output<string | undefined>;
    /**
     * Google Analytics ID
     */
    readonly googleAnalyticsId: pulumi.Output<string | undefined>;
    /**
     * Status page icon
     */
    readonly icon: pulumi.Output<string | undefined>;
    /**
     * List of monitor groups displayed on the status page
     */
    readonly publicGroupLists: pulumi.Output<outputs.StatusPagePublicGroupList[] | undefined>;
    /**
     * Whether the status page is published
     */
    readonly published: pulumi.Output<boolean>;
    /**
     * Whether to show 'Powered by Uptime Kuma' text
     */
    readonly showPoweredBy: pulumi.Output<boolean>;
    /**
     * Whether to show tags on the status page
     */
    readonly showTags: pulumi.Output<boolean>;
    /**
     * Status page URL slug
     */
    readonly slug: pulumi.Output<string>;
    /**
     * Status page identifier
     */
    readonly statusPageId: pulumi.Output<number>;
    /**
     * Status page theme
     */
    readonly theme: pulumi.Output<string | undefined>;
    /**
     * Status page title
     */
    readonly title: pulumi.Output<string>;
    /**
     * Create a StatusPage resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: StatusPageArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StatusPage resources.
 */
export interface StatusPageState {
    /**
     * Custom CSS for the status page
     */
    customCss?: pulumi.Input<string>;
    /**
     * Status page description
     */
    description?: pulumi.Input<string>;
    /**
     * List of custom domain names for the status page
     */
    domainNameLists?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Custom footer text
     */
    footerText?: pulumi.Input<string>;
    /**
     * Google Analytics ID
     */
    googleAnalyticsId?: pulumi.Input<string>;
    /**
     * Status page icon
     */
    icon?: pulumi.Input<string>;
    /**
     * List of monitor groups displayed on the status page
     */
    publicGroupLists?: pulumi.Input<pulumi.Input<inputs.StatusPagePublicGroupList>[]>;
    /**
     * Whether the status page is published
     */
    published?: pulumi.Input<boolean>;
    /**
     * Whether to show 'Powered by Uptime Kuma' text
     */
    showPoweredBy?: pulumi.Input<boolean>;
    /**
     * Whether to show tags on the status page
     */
    showTags?: pulumi.Input<boolean>;
    /**
     * Status page URL slug
     */
    slug?: pulumi.Input<string>;
    /**
     * Status page identifier
     */
    statusPageId?: pulumi.Input<number>;
    /**
     * Status page theme
     */
    theme?: pulumi.Input<string>;
    /**
     * Status page title
     */
    title?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StatusPage resource.
 */
export interface StatusPageArgs {
    /**
     * Custom CSS for the status page
     */
    customCss?: pulumi.Input<string>;
    /**
     * Status page description
     */
    description?: pulumi.Input<string>;
    /**
     * List of custom domain names for the status page
     */
    domainNameLists?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Custom footer text
     */
    footerText?: pulumi.Input<string>;
    /**
     * Google Analytics ID
     */
    googleAnalyticsId?: pulumi.Input<string>;
    /**
     * Status page icon
     */
    icon?: pulumi.Input<string>;
    /**
     * List of monitor groups displayed on the status page
     */
    publicGroupLists?: pulumi.Input<pulumi.Input<inputs.StatusPagePublicGroupList>[]>;
    /**
     * Whether the status page is published
     */
    published?: pulumi.Input<boolean>;
    /**
     * Whether to show 'Powered by Uptime Kuma' text
     */
    showPoweredBy?: pulumi.Input<boolean>;
    /**
     * Whether to show tags on the status page
     */
    showTags?: pulumi.Input<boolean>;
    /**
     * Status page URL slug
     */
    slug: pulumi.Input<string>;
    /**
     * Status page theme
     */
    theme?: pulumi.Input<string>;
    /**
     * Status page title
     */
    title: pulumi.Input<string>;
}
