import * as pulumi from "@pulumi/pulumi";
export declare class Brand extends pulumi.CustomResource {
    /**
     * Get an existing Brand resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: BrandState, opts?: pulumi.CustomResourceOptions): Brand;
    /**
     * Returns true if the given object is an instance of Brand.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Brand;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    readonly attributes: pulumi.Output<string | undefined>;
    readonly brandId: pulumi.Output<string>;
    readonly brandingCustomCss: pulumi.Output<string | undefined>;
    /**
     * Defaults to `/static/dist/assets/images/flow_background.jpg`.
     */
    readonly brandingDefaultFlowBackground: pulumi.Output<string | undefined>;
    readonly brandingFavicon: pulumi.Output<string | undefined>;
    readonly brandingLogo: pulumi.Output<string | undefined>;
    /**
     * Defaults to `authentik`.
     */
    readonly brandingTitle: pulumi.Output<string | undefined>;
    readonly clientCertificates: pulumi.Output<string[] | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly default: pulumi.Output<boolean | undefined>;
    readonly defaultApplication: pulumi.Output<string | undefined>;
    readonly domain: pulumi.Output<string>;
    readonly flowAuthentication: pulumi.Output<string | undefined>;
    readonly flowDeviceCode: pulumi.Output<string | undefined>;
    readonly flowInvalidation: pulumi.Output<string | undefined>;
    readonly flowLockdown: pulumi.Output<string | undefined>;
    readonly flowRecovery: pulumi.Output<string | undefined>;
    readonly flowUnenrollment: pulumi.Output<string | undefined>;
    readonly flowUserSettings: pulumi.Output<string | undefined>;
    readonly webCertificate: pulumi.Output<string | undefined>;
    /**
     * Create a Brand resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: BrandArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Brand resources.
 */
export interface BrandState {
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    attributes?: pulumi.Input<string | undefined>;
    brandId?: pulumi.Input<string | undefined>;
    brandingCustomCss?: pulumi.Input<string | undefined>;
    /**
     * Defaults to `/static/dist/assets/images/flow_background.jpg`.
     */
    brandingDefaultFlowBackground?: pulumi.Input<string | undefined>;
    brandingFavicon?: pulumi.Input<string | undefined>;
    brandingLogo?: pulumi.Input<string | undefined>;
    /**
     * Defaults to `authentik`.
     */
    brandingTitle?: pulumi.Input<string | undefined>;
    clientCertificates?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Defaults to `false`.
     */
    default?: pulumi.Input<boolean | undefined>;
    defaultApplication?: pulumi.Input<string | undefined>;
    domain?: pulumi.Input<string | undefined>;
    flowAuthentication?: pulumi.Input<string | undefined>;
    flowDeviceCode?: pulumi.Input<string | undefined>;
    flowInvalidation?: pulumi.Input<string | undefined>;
    flowLockdown?: pulumi.Input<string | undefined>;
    flowRecovery?: pulumi.Input<string | undefined>;
    flowUnenrollment?: pulumi.Input<string | undefined>;
    flowUserSettings?: pulumi.Input<string | undefined>;
    webCertificate?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a Brand resource.
 */
export interface BrandArgs {
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    attributes?: pulumi.Input<string | undefined>;
    brandId?: pulumi.Input<string | undefined>;
    brandingCustomCss?: pulumi.Input<string | undefined>;
    /**
     * Defaults to `/static/dist/assets/images/flow_background.jpg`.
     */
    brandingDefaultFlowBackground?: pulumi.Input<string | undefined>;
    brandingFavicon?: pulumi.Input<string | undefined>;
    brandingLogo?: pulumi.Input<string | undefined>;
    /**
     * Defaults to `authentik`.
     */
    brandingTitle?: pulumi.Input<string | undefined>;
    clientCertificates?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Defaults to `false`.
     */
    default?: pulumi.Input<boolean | undefined>;
    defaultApplication?: pulumi.Input<string | undefined>;
    domain: pulumi.Input<string>;
    flowAuthentication?: pulumi.Input<string | undefined>;
    flowDeviceCode?: pulumi.Input<string | undefined>;
    flowInvalidation?: pulumi.Input<string | undefined>;
    flowLockdown?: pulumi.Input<string | undefined>;
    flowRecovery?: pulumi.Input<string | undefined>;
    flowUnenrollment?: pulumi.Input<string | undefined>;
    flowUserSettings?: pulumi.Input<string | undefined>;
    webCertificate?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=brand.d.ts.map