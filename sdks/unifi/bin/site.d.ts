import * as pulumi from "@pulumi/pulumi";
export declare class Site extends pulumi.CustomResource {
    /**
     * Get an existing Site resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SiteState, opts?: pulumi.CustomResourceOptions): Site;
    /**
     * Returns true if the given object is an instance of Site.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Site;
    /**
     * A human-readable description of the site (e.g., 'Main Office', 'Remote Branch', 'Client A Network'). This is used as the display name in the UniFi controller interface.
     */
    readonly description: pulumi.Output<string>;
    /**
     * The site's internal name in the UniFi system. This is automatically generated based on the description and is used in API calls and configurations. It's typically a lowercase, hyphenated version of the description.
     */
    readonly name: pulumi.Output<string>;
    /**
     * Create a Site resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: SiteArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Site resources.
 */
export interface SiteState {
    /**
     * A human-readable description of the site (e.g., 'Main Office', 'Remote Branch', 'Client A Network'). This is used as the display name in the UniFi controller interface.
     */
    description?: pulumi.Input<string>;
    /**
     * The site's internal name in the UniFi system. This is automatically generated based on the description and is used in API calls and configurations. It's typically a lowercase, hyphenated version of the description.
     */
    name?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a Site resource.
 */
export interface SiteArgs {
    /**
     * A human-readable description of the site (e.g., 'Main Office', 'Remote Branch', 'Client A Network'). This is used as the display name in the UniFi controller interface.
     */
    description: pulumi.Input<string>;
}
